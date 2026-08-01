import { domainFromUrl, hostnameFromUrl } from '@/utils/domain';
import { todayISODate } from '@/utils/date';
import { addUsageSeconds, incrementVisitCount } from '@/utils/storage';
import type { Domain, Settings } from '@/utils/types';

/** Persisted in `storage.session` (survives worker restart, cleared on browser close) — never
 * in a module-level variable, which would be lost the moment the service worker is killed. */
export interface ActiveSession {
  domain: Domain;
  startedAt: number; // epoch ms
}

const SESSION_KEY = 'activeSession';
export const MIN_IDLE_DETECTION_SECONDS = 15; // browser.idle.setDetectionInterval's floor

export async function getActiveSession(): Promise<ActiveSession | null> {
  const { [SESSION_KEY]: session } = await browser.storage.session.get(SESSION_KEY);
  return (session as ActiveSession | undefined) ?? null;
}

async function setActiveSession(session: ActiveSession | null): Promise<void> {
  await browser.storage.session.set({ [SESSION_KEY]: session });
}

/** Adds elapsed time to `domain`'s usage, splitting at local-midnight boundaries so a session
 * that spans a day rollover is credited to the correct date buckets. */
async function flushElapsed(domain: Domain, startedAt: number, endedAt: number): Promise<void> {
  let cursor = startedAt;
  while (cursor < endedAt) {
    const cursorDate = new Date(cursor);
    const nextMidnight = new Date(
      cursorDate.getFullYear(),
      cursorDate.getMonth(),
      cursorDate.getDate() + 1,
    ).getTime();
    const segmentEnd = Math.min(endedAt, nextMidnight);
    const seconds = Math.floor((segmentEnd - cursor) / 1000);
    if (seconds > 0) await addUsageSeconds(domain, seconds, todayISODate(cursorDate));
    cursor = segmentEnd;
  }
}

/**
 * Flushes the current session's elapsed time (if any), then starts a new session for `domain`
 * (or stops tracking entirely if `domain` is `null` — the browser lost focus, the user went
 * idle, or the active tab isn't trackable). This is the only way the active session should
 * change domain.
 *
 * Every time this actually starts tracking a (different) domain, that counts as one "open" of
 * the site for the day — recorded separately from elapsed seconds so the blocked page can show
 * "opened N times today" even for sites with very short visits.
 */
export async function switchSession(domain: Domain | null, now: number = Date.now()): Promise<void> {
  const session = await getActiveSession();
  if (session && domain === session.domain) return; // no-op: already tracking this domain; don't
  // flush (that would leave `startedAt` stale in storage and double-count the same span on the
  // next flush) or restart (that would reset `startedAt` and lose the elapsed-so-far time).

  if (session) await flushElapsed(session.domain, session.startedAt, now);
  if (domain) await incrementVisitCount(domain, todayISODate(new Date(now)));
  await setActiveSession(domain ? { domain, startedAt: now } : null);
}

/**
 * Flushes the current session's elapsed time so far, then immediately restarts it (same domain,
 * `startedAt` reset to `now`). Called on a periodic alarm so long uninterrupted sessions are
 * written to disk incrementally instead of only on the next tab/focus/idle transition — a crash
 * or forced worker kill loses at most one flush interval, not the whole session.
 */
export async function flushAndRestart(now: number = Date.now()): Promise<void> {
  const session = await getActiveSession();
  if (!session) return;
  await flushElapsed(session.domain, session.startedAt, now);
  await setActiveSession({ domain: session.domain, startedAt: now });
}

export interface TrackabilityInput {
  idleState: 'active' | 'idle' | 'locked';
  /** Whether the browser application itself currently has OS focus. */
  browserFocused: boolean;
  tab: { url?: string; incognito?: boolean } | undefined;
  settings: Settings;
}

/**
 * Pure decision function: given the current idle/focus/tab/settings state, what key (if any)
 * should be accruing time right now? Kept separate from the `browser.*` querying in
 * `entrypoints/background.ts` so the tracking rules themselves are unit-testable without mocking
 * `browser.idle`/`browser.windows`/`browser.tabs`.
 *
 * Usage is tracked per exact subdomain, not the eTLD+1 — `mail.google.com` and `docs.google.com`
 * accrue separately from `google.com` — so the Today tab can show them as distinct sites and a
 * subdomain-specific rule's daily limit can see that subdomain's own usage. A `www.` prefix is
 * still collapsed into the bare domain (they're the same site to a user). Code that wants the
 * traditional "whole site" total (e.g. a bare-domain rule's daily limit, or the excluded-sites
 * check) rolls these back up via `domainFromUrl`/`etld1` — see `utils/blocker.ts#usageForRuleDomain`.
 */
export function resolveTrackableDomain({
  idleState,
  browserFocused,
  tab,
  settings,
}: TrackabilityInput): Domain | null {
  if (idleState !== 'active') return null;
  if (!browserFocused) return null;
  if (!tab?.url) return null;
  if (tab.incognito && settings.pauseInIncognito) return null;

  const domain = domainFromUrl(tab.url);
  if (!domain) return null;
  if (settings.excludedDomains.includes(domain)) return null;

  const hostname = hostnameFromUrl(tab.url)!; // domainFromUrl succeeded above, so this must too
  const trackingKey = hostname.replace(/^www\./, '');
  if (settings.excludedDomains.includes(trackingKey)) return null;

  return trackingKey;
}
