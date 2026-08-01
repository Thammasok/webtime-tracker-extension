# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Webtime Tracker is a cross-browser (Chrome / Edge / Firefox) Manifest V3 extension that tracks
time spent per website and can block distracting sites — always, redirected to a custom page, or
on a schedule / daily limit. All data is local-only: `browser.storage.local`, never `.sync`, no
network calls for anything but the sites the user visits themselves.

Full design spec: `docs/webtime-tracker-dev-plan.md`. Visual design source: `.claude/design/Webtime
Tracker.dc.html` (popup = "1c Soft Clarity"; dashboard tabs = 2a/3a Overview (renamed "Summary" in
the app), 4a Blocking rules, 5a Privacy; blocked page = 2b).

## Commands

```bash
pnpm install
pnpm dev                # Chrome/Edge dev build with HMR
pnpm dev:firefox         # Firefox dev build (forced MV3 — see Gotchas)
pnpm build               # production build -> .output/chrome-mv3
pnpm build:firefox       # production build -> .output/firefox-mv3 (forced MV3)
pnpm test                # vitest run
pnpm compile             # tsc --noEmit
pnpm zip / zip:firefox   # store-ready .zip
```

Load unpacked in Chrome via `chrome://extensions` → Developer mode → Load unpacked →
`.output/chrome-mv3`. There is no GUI browser in most agent sandboxes — typecheck + `pnpm test` +
`wxt build` for both targets is the available automated verification; manual load-unpacked
checks are on the human.

## Architecture

Four isolated contexts sharing state only through `browser.storage.local` and
`browser.runtime.sendMessage`:

```
entrypoints/background.ts   service worker: tracking listeners, blocking sync, alarms
entrypoints/popup/          toolbar popup — today's usage, quick block toggle
entrypoints/options/        dashboard — Summary / Blocking rules / Privacy tabs
entrypoints/blocked/        redirect target for a blocked navigation
```

- `utils/storage.ts` is the **only** module allowed to touch raw `browser.storage.local`. Every
  other context reads/writes through its typed functions (`getUsage`, `addUsageSeconds`,
  `getRules`, `upsertRule`, `getSettings`, `exportData`, `clearAllData`, ...). Grep for
  `browser.storage.local` outside that file before adding a new read/write path.
- `utils/domain.ts` is the only module that touches `tldts`. `hostnameFromUrl`/`domainFromUrl`
  extract the full hostname vs. the eTLD+1 from a URL; `isSubdomainSpecific` and
  `normalizeDomainInput` are what let a `BlockRule.domain` (and the rule-dialog/excluded-sites
  inputs) be either a bare eTLD+1 (matches itself + `www.`) or one exact subdomain (matches only
  that host) — see `utils/blocker.ts#matchesRuleDomain`/`#ruleToDnrRule` for the two matching
  regimes this produces.
- `utils/tracker.ts` owns the active session (`ActiveSession` in `browser.storage.session`, *not*
  a module variable — the service worker can be killed at any time). `resolveTrackableDomain` is
  a pure function (idle/focus/incognito/excluded-domain in → tracking key or `null` out); the
  `browser.idle`/`windows`/`tabs` querying glue lives in `background.ts` and is not unit-tested
  (fake-browser doesn't mock `idle`). Usage is tracked per **exact subdomain**, not eTLD+1 — only
  a `www.` prefix collapses into the bare domain — so `mail.google.com` and `docs.google.com`
  accrue under distinct keys in `DailyUsage`, and the Today/Summary tabs list them as separate
  sites. Never write both a subdomain key and its eTLD+1 for the same tick: `usage-summary.ts`
  sums every key in a day, so that would double-count it everywhere (totals, category
  breakdown, daily average).
- `utils/blocker.ts` owns `isBlockedNow` (pure evaluator for all three block modes) and
  `syncBlockRules` (diffs the desired blocked-domain set against
  `declarativeNetRequest.getDynamicRules()` on Chrome/Edge). **Firefox does not use DNR at all** —
  its redirect support has historically had gaps, so `background.ts` registers a
  `webNavigation.onBeforeNavigate` listener (gated by `import.meta.env.FIREFOX`) that calls
  `resolveBlockedRedirect` and `tabs.update`s directly. `usageForRuleDomain` is what makes a daily
  limit correct at either matching granularity: a subdomain-specific rule reads its own tracked
  key directly, but a bare-domain rule sums usage across every subdomain that rolls up to its
  eTLD+1 (since tracking is per-subdomain) — every UI that shows a rule's today-usage
  (`RulesTab`, `BlockTab`, `SummaryTab`, the blocked page) must go through this helper rather than
  indexing `usage.days[...][rule.domain]` directly.
- Popup and dashboard read storage directly via `hooks/use-extension-data.ts` (subscribes to
  `storage.onChanged`) — never by messaging the background worker, which may be asleep.
- `utils/rule-actions.ts` wraps every rule mutation with a `SYNC_RULES` message so the background
  worker re-syncs DNR immediately after a create/update/delete.

## Gotchas / invariants (violating these reintroduces bugs already fixed once)

1. **Register every background listener synchronously at the top level** of `defineBackground()`
   — never inside the async `init()`/`retrack()` helpers. A listener added after an `await` is
   missed on cold start.
2. **Never store live state in a module-level variable.** Session state goes in
   `storage.session`; everything else in `storage.local`.
3. **Firefox needs `--mv3` explicitly.** WXT defaults Firefox builds to MV2; `dev:firefox` /
   `build:firefox` / `zip:firefox` pass `--mv3` for this reason. Don't drop the flag.
4. **Getters must never return a shared mutable object as a "default/empty" value.** `getUsage()`
   returning a shared `{version:1,days:{}}` constant when storage was empty caused
   `addUsageSeconds` to mutate that constant in place, silently polluting every later "empty"
   read for the lifetime of the module (caught via the Phase 1 test suite cross-test leakage).
   Always construct a fresh object (see `emptyUsage()` in `storage.ts`).
5. **`switchSession`/`flushAndRestart` must check "is this actually a change?" before flushing.**
   Flushing on a no-op switch (same domain) without resetting `startedAt` — or resetting
   `startedAt` without flushing first — either double-counts or drops elapsed time. See the
   regression test in `utils/tracker.test.ts` ("no double-count risk").
6. **No live Google Fonts / no favicon fetching.** The product's pitch is "nothing leaves this
   device" — pulling a Google Fonts stylesheet or a domain's `/favicon.ico` on every popup open
   would be a real (if minor) contradiction of that. Site icons are a deterministic colored
   initial (`components/site-icon.tsx`); fonts are a system-font stack (`assets/globals.css`).
7. **DNR dynamic rule ids must be deterministic per rule**, not random — `syncBlockRules` hashes
   `rule.id` (see `ruleId()` in `blocker.ts`) so re-syncing doesn't leak orphaned DNR rules.
8. **A rule's today-usage must be read via `usageForRuleDomain`, never `usage.days[...][rule.domain]`
   directly.** Usage is tracked per exact subdomain, so a bare-domain rule's key alone under-counts
   its daily limit — the helper sums every subdomain rolling up to it. Bypassing it silently breaks
   daily limits for any rule whose site has multiple tracked subdomains.
9. **A percentage `height` only resolves against a definite ancestor height.** In a flex column,
   that means every ancestor between the fixed-height container and the percentage-height element
   must use `align-items: stretch` (the default) — an `items-end`/`items-center` anywhere in that
   chain breaks the stretch and the element silently renders at zero height with no error. This is
   exactly what happened to the dashboard's "Daily activity" bars (`SummaryTab.tsx`): labels
   rendered fine, bars were invisible, because `items-end` on the chart row stopped the per-day
   column from stretching to the row's `h-[190px]`.

## Testing

Vitest + `wxt/testing` (`WxtVitest()` plugin, `fakeBrowser` reset in `vitest.setup.ts`) gives every
test a real, in-memory `browser.*` global — no manual mocking. `fake-browser` does **not** mock
`declarativeNetRequest` or `idle`; those are covered by keeping the decision logic (`isBlockedNow`,
`resolveTrackableDomain`) pure and testing the glue only by manual/E2E means.

## Known deviations from `docs/webtime-tracker-dev-plan.md`

Documented inline where they matter (`wxt.config.ts`, `utils/blocker.ts`, `utils/types.ts`,
`utils/category.ts`): Firefox blocking is unconditional `webNavigation` rather than a runtime DNR
capability check; `Settings` has two additive fields (`pauseInIncognito`, `excludedDomains`) for
the Privacy tab; no redirect-count telemetry (`declarativeNetRequestFeedback` isn't viable
cross-browser); no "Focus mode" rule-grouping; charts are hand-rolled, not a charting dependency;
category breakdown is a small display-only static lookup, not part of the stored schema (though
now functional at subdomain granularity — see below); `BlockRule.domain` can be a bare eTLD+1 or
one exact subdomain (`utils/domain.ts#isSubdomainSpecific`), which the dev-plan doesn't
distinguish — matching, DNR regex generation, and usage tracking all branch on it.

## Not yet done

Cross-browser manual/E2E test pass and store packaging (icons/screenshots/listing copy, the
`<all_urls>` permission-justification text) — dev-plan phases 6–7.
