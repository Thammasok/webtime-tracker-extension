import { domainFromUrl } from '@/utils/domain'
import { todayISODate } from '@/utils/date'
import { getRules, getUsage } from '@/utils/storage'
import type { BlockRule, Domain, ScheduleWindow } from '@/utils/types'

export function isWithinWindow(win: ScheduleWindow, now: Date): boolean {
  const day = now.getDay()
  const minutesNow = now.getHours() * 60 + now.getMinutes()

  const [startH, startM] = win.start.split(':').map(Number)
  const [endH, endM] = win.end.split(':').map(Number)
  const startMin = startH * 60 + startM
  const endMin = endH * 60 + endM

  if (startMin === endMin) return false // zero-length window never blocks

  if (startMin < endMin) {
    return win.days.includes(day) && minutesNow >= startMin && minutesNow < endMin
  }

  // Overnight window wrapping past midnight (e.g. 22:00 -> 06:00): active either late on a
  // configured day, or early the following morning.
  const previousDay = (day + 6) % 7
  return (
    (win.days.includes(day) && minutesNow >= startMin) ||
    (win.days.includes(previousDay) && minutesNow < endMin)
  )
}

/**
 * Pure evaluator: is `rule` blocking right now? The three product modes collapse to one
 * question — "always"/"redirect" are blocked whenever enabled; "schedule" is blocked when
 * either the current time falls in a configured window OR today's tracked time for the domain
 * has crossed the daily limit.
 */
export function isBlockedNow(
  rule: BlockRule,
  usageSecondsToday: number,
  now: Date = new Date(),
): boolean {
  if (!rule.enabled) return false
  if (rule.mode === 'always' || rule.mode === 'redirect') return true

  const inWindow = (rule.windows ?? []).some((w) => isWithinWindow(w, now))
  const overLimit = rule.dailyLimitSeconds != null && usageSecondsToday >= rule.dailyLimitSeconds
  return inWindow || overLimit
}

/** When `win` is (or was, if overnight) active covering `now`, returns the Date it ends. Used to
 * show an "unblocks in Xh Ym" estimate on the blocked page and in the dashboard's rules list. */
export function windowEndDate(win: ScheduleWindow, now: Date): Date {
  const [startH, startM] = win.start.split(':').map(Number)
  const [endH, endM] = win.end.split(':').map(Number)
  const startMin = startH * 60 + startM
  const endMin = endH * 60 + endM

  const end = new Date(now)
  end.setHours(endH, endM, 0, 0)
  if (endMin <= startMin && now.getHours() * 60 + now.getMinutes() >= startMin) {
    end.setDate(end.getDate() + 1) // overnight window that started earlier today
  }
  return end
}

function blockedPagePath(domain: Domain): `/blocked.html?d=${string}` {
  return `/blocked.html?d=${encodeURIComponent(domain)}`
}

function ruleId(rule: BlockRule): number {
  // Deterministic positive int derived from the rule's uuid, so DNR rule ids stay stable across
  // syncs (required for `removeRuleIds` to correctly target them) without a separate id table.
  let hash = 5381
  for (let i = 0; i < rule.id.length; i++) {
    hash = (hash * 33) ^ rule.id.charCodeAt(i)
  }
  return ((hash >>> 0) % 0x7fffffff) + 1
}

export function ruleToDnrRule(rule: BlockRule): Browser.declarativeNetRequest.Rule {
  return {
    id: ruleId(rule),
    priority: 1,
    action: {
      type: 'redirect',
      redirect:
        rule.mode === 'redirect' && rule.redirectUrl
          ? { url: rule.redirectUrl }
          : { extensionPath: blockedPagePath(rule.domain) },
    },
    condition: {
      // Match the exact domain and www. subdomain only (not all subdomains).
      // e.g. google.com blocks google.com and www.google.com, but not console.google.com
      regexFilter: String.raw`^https?://(www\.)?${escapeRegex(rule.domain)}(:[0-9]|/|\?|$)`,
      isUrlFilterCaseSensitive: false,
      resourceTypes: ['main_frame'],
    },
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.+?^${}()|[\]\\]/g, String.raw`\$&`)
}

async function currentlyBlockedRules(): Promise<BlockRule[]> {
  const [rules, usage] = await Promise.all([getRules(), getUsage()])
  const today = usage.days[todayISODate()] ?? {}
  const now = new Date()
  return rules.filter((rule) => isBlockedNow(rule, today[rule.domain] ?? 0, now))
}

/**
 * Converges Chrome/Edge's `declarativeNetRequest` dynamic ruleset to "one redirect rule per
 * currently-blocked domain", diffing against the existing ruleset so unrelated rules aren't
 * churned on every call. Firefox enforces blocks via `webNavigation` instead (see
 * `resolveBlockedRedirect` below) — Firefox's DNR redirect support has historically had gaps, so
 * this is a no-op there rather than a runtime feature-detection.
 */
export async function syncBlockRules(): Promise<void> {
  if (import.meta.env.FIREFOX) return

  const desired = (await currentlyBlockedRules()).map(ruleToDnrRule)
  const existing = await browser.declarativeNetRequest.getDynamicRules()

  const desiredById = new Map(desired.map((r) => [r.id, r]))
  const removeRuleIds: number[] = []
  for (const existingRule of existing) {
    const match = desiredById.get(existingRule.id)
    if (!match || JSON.stringify(match) !== JSON.stringify(existingRule)) {
      removeRuleIds.push(existingRule.id)
    }
  }

  const existingIds = new Set(existing.map((r) => r.id))
  const addRules = desired.filter((r) => !existingIds.has(r.id) || removeRuleIds.includes(r.id))

  if (addRules.length || removeRuleIds.length) {
    // updateDynamicRules rejects the whole batch on a malformed rule (e.g. an invalid
    // redirectUrl typed into the rule dialog) — without this catch that rejection was silently
    // swallowed (no caller awaits syncBlockRules()), so a bad rule looked like "blocking doesn't
    // work" with zero visible error anywhere.
    try {
      await browser.declarativeNetRequest.updateDynamicRules({ addRules, removeRuleIds })
    } catch (err) {
      console.error('syncBlockRules: updateDynamicRules failed', err, { addRules, removeRuleIds })
    }
  }
}

/**
 * Firefox-only enforcement path: given a navigated-to URL, returns the redirect target if it
 * should be blocked right now, else `null`. Called from `webNavigation.onBeforeNavigate`.
 */
export async function resolveBlockedRedirect(url: string): Promise<string | null> {
  const domain = domainFromUrl(url)
  if (!domain) return null

  const [rules, usage] = await Promise.all([getRules(), getUsage()])
  const rule = rules.find((r) => r.domain === domain)
  if (!rule) return null

  const usageSecondsToday = usage.days[todayISODate()]?.[domain] ?? 0
  if (!isBlockedNow(rule, usageSecondsToday, new Date())) return null

  if (rule.mode === 'redirect' && rule.redirectUrl) return rule.redirectUrl
  return browser.runtime.getURL(blockedPagePath(rule.domain))
}
