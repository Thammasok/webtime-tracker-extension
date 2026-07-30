# Webtime Tracker — Dev Plan (for Claude CLI)

A cross-browser (Chrome / Edge / Firefox) WebExtension that tracks time spent per website
**locally only** (no cloud sync) and can block/redirect chosen sites in three modes:
always-block, redirect-to-custom-page, and scheduled/daily-limit.

This document is written for an autonomous coding agent. Build it phase by phase, in order.
Each phase has explicit files, APIs, gotchas, and acceptance criteria. Do not skip the
acceptance criteria — several bugs in this class of extension are invisible until you check
for them deliberately.

---

## 0. Ground rules — read before writing any code

These are non-negotiable and prevent ~80% of the bugs specific to this project:

1. **Use the `browser.*` namespace, never `chrome.*` directly.** WXT polyfills `browser.*` to
   `chrome.*` on Chromium automatically and gives Promise-based APIs everywhere. Any raw
   `chrome.*` call will break Firefox.
2. **Target Manifest V3 uniformly on all three browsers.** Do not maintain a V2 manifest for
   Firefox even though Firefox still allows it.
3. **The background context can be torn down at any moment.** Chrome/Edge use a service worker
   that terminates after ~30s idle; Firefox uses a non-persistent event page. Therefore:
   - Register every listener **synchronously at the top level** of `background.ts` — never
     inside an `async` init function, a `.then()`, or a conditional.
   - **Never store live state in module-level variables.** Persist to `browser.storage`.
   - Use `browser.alarms`, never `setTimeout`/`setInterval`, for anything beyond a few seconds —
     a `setTimeout` dies with the worker and silently never fires.
4. **Local storage only. Never use `browser.storage.sync`.** That would sync data to the
   browser account = cloud. This is a hard product requirement. Use `browser.storage.local`
   (durable, per-device) + `browser.storage.session` (survives worker restart, cleared on
   browser close) only. Consider IndexedDB for large history (see Phase 1).
5. **Minimum permissions.** Every permission is a store-review question and an install-time
   warning. Justify each one (list is in Phase 0). Prefer narrow over broad.
6. **Verify volatile APIs against current docs before relying on them.** `declarativeNetRequest`
   (especially in Firefox) and the exact WXT scaffolding commands have been evolving. Use the
   **Context7 MCP** (`resolve-library-id` → `query-docs` for `wxt` and for WebExtension
   `declarativeNetRequest`) or fetch the official WXT / MDN docs to confirm current API shapes
   rather than trusting any single snippet in this plan verbatim. Where this plan and current
   docs disagree, current docs win — note the deviation in a code comment.

---

## 1. Architecture at a glance

Four isolated contexts, talking only via `browser.storage` and `browser.runtime.sendMessage`:

```
Popup (React)          Background worker              Options/Dashboard (React)
"today's top sites,    - time-tracking engine         "full history, manage
 quick block toggle"   - block rule engine (DNR)        block rules, export/clear"
        │              - alarms (periodic flush)               │
        └──────────────── browser.storage.local / .session ────┘
                          (single source of truth)

                    declarativeNetRequest dynamic rules
                    ── redirect blocked main_frame → /blocked.html
```

**Key design decision — unify all three block modes behind one question:** *"is domain D
blocked right now?"* The background rule engine answers that and toggles a dynamic DNR redirect
rule accordingly. The modes differ only in *when* the answer is `true`:

| Mode | Blocked when |
|---|---|
| Always block | always |
| Redirect to custom page | always (but redirect target is the user's chosen URL, not the default blocked page) |
| Scheduled / daily-limit | inside a configured time window, **or** today's tracked time for D exceeds the configured limit |

This keeps enforcement in one place instead of three parallel implementations.

---

## 2. Phase 0 — Scaffold & configuration

**Goal:** a running WXT project that builds for all three browsers and loads unpacked.

**Steps:**
1. Scaffold with WXT (confirm the current init command via Context7/WXT docs first — at time of
   writing it is `npx wxt@latest init webtime-tracker`, React + TypeScript template). Then
   `npm install`.
2. Add Tailwind CSS + PostCSS, point the Tailwind `content` glob at `entrypoints/**` and
   `components/**`. Initialize shadcn/ui (`npx shadcn@latest init`) and add the components you'll
   need as you go (`button`, `card`, `switch`, `table`, `dialog`, `input`, `tabs`).
3. Create entrypoints: `background.ts`, `popup/`, `options/`. **No content script is needed** —
   time tracking runs entirely off `tabs`/`windows`/`idle` events in the background, and blocking
   runs off DNR. Do not scaffold a content script.
4. Add a static extension page `entrypoints/blocked/index.html` (+ `main.tsx`, `App.tsx`) — the
   default redirect target. Register it in `web_accessible_resources` (see below).
5. Configure `wxt.config.ts`:

```ts
// wxt.config.ts
export default defineConfig({
  manifest: {
    name: 'Webtime Tracker',
    permissions: [
      'storage',        // local data
      'tabs',           // read active tab URL/title for attribution
      'idle',           // pause tracking when the user is away
      'alarms',         // periodic flush + schedule re-evaluation
      'declarativeNetRequest', // blocking/redirect
      'unlimitedStorage',      // history can grow; lifts storage.local quota
    ],
    // Redirect rules target our own extension page; that page must be web-accessible.
    web_accessible_resources: [
      { resources: ['blocked.html'], matches: ['<all_urls>'] },
    ],
    // Host permissions: DNR needs host access to redirect main_frame navigations on those
    // origins. Blocking is user-driven and can apply to any site, so <all_urls> is genuinely
    // needed here — document this clearly in the store permission-justification text.
    host_permissions: ['<all_urls>'],
  },
});
```

> Gotcha: broad `host_permissions: ['<all_urls>']` is the #1 cause of slow store review. It IS
> justified here (the user can block any site), but write the justification text now, and
> consider offering it as `optional_host_permissions` requested at runtime if you want a lower
> install-friction path — decide with the human before store submission.

**Acceptance:** `npx wxt build -b chrome`, `-b firefox`, `-b edge` all succeed; the Chrome build
loads unpacked (`chrome://extensions` → Load unpacked → `.output/chrome-mv3`) and the popup opens.

---

## 3. Phase 1 — Data layer

**Goal:** a typed, versioned storage module that every context reads/writes through. No context
reads raw `browser.storage` keys directly.

**Files:** `utils/storage.ts`, `utils/domain.ts`, `utils/types.ts`.

**Data model** (keep it flat and date-bucketed so daily/weekly rollups are cheap):

```ts
// utils/types.ts
export type ISODate = string;   // 'YYYY-MM-DD' in the user's local timezone
export type Domain  = string;   // eTLD+1, e.g. 'facebook.com'

export interface DailyUsage {
  [domain: Domain]: number;     // seconds spent, that day
}

export interface UsageStore {
  version: 1;
  days: { [date: ISODate]: DailyUsage };
}

export type BlockMode = 'always' | 'redirect' | 'schedule';

export interface BlockRule {
  id: string;                   // uuid
  domain: Domain;               // match on eTLD+1 (and its subdomains)
  mode: BlockMode;
  enabled: boolean;
  redirectUrl?: string;         // mode 'redirect'; if absent → default /blocked.html
  // mode 'schedule': block when EITHER condition is currently true
  windows?: { days: number[]; start: string; end: string }[]; // days 0-6, 'HH:mm' local
  dailyLimitSeconds?: number;   // block once today's tracked time for this domain exceeds it
}

export interface Settings {
  version: 1;
  retentionDays: number;        // auto-prune days older than this (default 90; 0 = keep forever)
  idleThresholdSeconds: number; // default 60
}
```

- `utils/domain.ts`: extract eTLD+1 from a URL. Use the `tldts` package (small, no network) so
  `www.facebook.com`, `m.facebook.com`, `facebook.com` all normalize to `facebook.com`. Ignore
  non-`http(s)` schemes (`chrome://`, `about:`, `moz-extension://`, `file://`).
- `utils/storage.ts`: typed getters/setters (`getUsage`, `addUsageSeconds(domain, secs, date)`,
  `getRules`, `upsertRule`, `deleteRule`, `getSettings`, `pruneOldDays`). Every write is
  read-modify-write against `storage.local`. Include a `version` field now to make future
  migrations painless.

**Tests (Vitest + `@webext-core/fake-browser`):** `addUsageSeconds` accumulates correctly across
multiple calls same day; day rollover creates a new bucket; `pruneOldDays` removes only days
beyond retention; domain normalization collapses subdomains.

**Acceptance:** unit tests green; no direct `browser.storage.local.get('...')` calls exist
outside `utils/storage.ts`.

---

## 4. Phase 2 — Time-tracking engine (background)

**Goal:** accurately accrue seconds per domain for the *foreground, active* tab only.

**File:** `entrypoints/background.ts` (tracking section) + `utils/tracker.ts`.

**The core challenge is accuracy, not plumbing.** Time must NOT accrue when: the browser window
is unfocused, the user is idle, the tab is a non-http page, or the OS is locked. Getting any of
these wrong inflates the numbers and makes the whole product untrustworthy.

**Mechanism — "current session" persisted in `storage.session`:**

```ts
interface ActiveSession { domain: Domain; startedAt: number } | null
```

- On any transition, **flush** the previous session (`now - startedAt` seconds → add to
  `storage.local` for today's bucket via `addUsageSeconds`), then start a new session for the
  new domain (or set it to `null` if tracking should pause).
- Store `ActiveSession` in `storage.session` (survives worker restart, so a recycled worker can
  still flush the elapsed time on the next event) — **not** a module variable.

**Listeners (all registered synchronously at top level):**
- `browser.tabs.onActivated` → flush + start session for the newly active tab's domain.
- `browser.tabs.onUpdated` (filter `changeInfo.url` / status complete) → domain may have changed
  within the same tab; flush + restart.
- `browser.windows.onFocusChanged` → if `windowId === WINDOW_ID_NONE`, user left the browser:
  flush + set session `null`. Otherwise flush + start session for the focused window's active tab.
- `browser.idle.onStateChanged` → set `browser.idle.setDetectionInterval(idleThresholdSeconds)`;
  on `'idle'` or `'locked'` flush + null; on `'active'` restart for the current active tab.
- A **`browser.alarms` periodic flush** (e.g. every 1 min): flush-and-restart the current session
  so long uninterrupted sessions still get written to disk incrementally (otherwise a crash loses
  the whole session, and the popup shows stale numbers). Also run `pruneOldDays` here daily.

> Gotcha: on worker cold-start there may already be an active focused tab but no session in
> `storage.session`. On background startup, query the active focused tab and initialize the
> session so the first flush isn't lost.

> Gotcha: `browser.idle` requires the `idle` permission and the detection interval is in
> **seconds**, minimum 15.

**Acceptance (test deliberately — these are the invisible bugs):**
- Open facebook.com, wait 30s, switch tabs → ~30s recorded for facebook.com, not more.
- Open a site, then click away to another OS app (blur the browser window) for 20s → those 20s
  are **not** recorded.
- Leave a tab open but don't touch keyboard/mouse past the idle threshold → time stops accruing.
- Kill the service worker mid-session (Chrome devtools → "stop" the worker) then trigger an
  event → previously elapsed time is still flushed, not lost.

---

## 5. Phase 3 — Block rule engine (background)

**Goal:** enforce the three block modes by keeping `declarativeNetRequest` **dynamic rules** in
sync with "is this domain blocked right now?"

**File:** `entrypoints/background.ts` (blocking section) + `utils/blocker.ts`.

**Approach:** the background worker owns a `syncBlockRules()` function that:
1. Reads all `BlockRule`s + today's usage + current local time.
2. Computes, for each enabled rule, whether it should currently block (per the table in §1).
3. Builds the desired DNR dynamic ruleset and calls
   `browser.declarativeNetRequest.updateDynamicRules({ addRules, removeRuleIds })` to converge
   to it (diff against `getDynamicRules()` so you're not churning rules every call).

Each active block becomes a redirect rule on `main_frame` navigations:

```ts
{
  id: <stable numeric id derived from rule>,
  priority: 1,
  action: {
    type: 'redirect',
    redirect: rule.mode === 'redirect' && rule.redirectUrl
      ? { url: rule.redirectUrl }                              // custom target
      : { extensionPath: `/blocked.html?d=${encodeURIComponent(rule.domain)}` },
  },
  condition: {
    // match the domain and its subdomains
    requestDomains: [rule.domain],
    resourceTypes: ['main_frame'],
  },
}
```

**When to call `syncBlockRules()`:**
- On rule create/update/delete (message from options/popup).
- On the periodic alarm (so scheduled windows turn on/off, and daily-limit blocks kick in as time
  accrues) — evaluate at least once a minute.
- On background startup.
- Right after a usage flush for a domain that has a `dailyLimitSeconds` rule (so the block
  engages promptly the moment the limit is crossed, not up to a minute later).

**`blocked.html` page (Phase 0 stub, finish here):** read the `?d=` param, show which site was
blocked, why (mode), and — for daily-limit/schedule — when it will unblock. Keep it calm and
supportive (this is a self-control tool, not a punishment screen).

> **Cross-browser risk — verify before shipping:** `declarativeNetRequest` dynamic rules and
> `redirect` actions are solid on Chrome/Edge. Firefox's DNR support is more recent and has had
> gaps (historically around `redirect` and rule limits). **Confirm current Firefox DNR support
> via Context7/MDN.** If Firefox can't do a DNR redirect reliably in the target Firefox version,
> implement a **background fallback for Firefox only**: listen to
> `browser.webNavigation.onBeforeNavigate` (add `webNavigation` permission) and call
> `browser.tabs.update(tabId, { url: target })` when the domain is currently blocked. Gate this
> fallback behind `import.meta.env.FIREFOX` (WXT exposes the build target) so Chrome/Edge keep
> using DNR. Do not add `webNavigation` to the Chrome build if it's not used there.

> Gotcha: dynamic-rule IDs must be positive integers and stable per rule. Derive them
> deterministically (e.g. hash the rule id into a positive int) so `removeRuleIds` works and you
> don't leak orphan rules.

> Gotcha: DNR has a cap on the number of dynamic rules. For this use case (a handful of blocked
> sites) you're far under it, but validate/limit rule count in the UI rather than letting it fail
> silently.

**Acceptance:**
- Add an "always" block for example.com → navigating there redirects to `blocked.html`.
- "Redirect" mode with a custom URL → navigating the blocked domain lands on that URL.
- "Schedule" window covering *now* → blocked; outside the window → loads normally (test by
  editing the window). Daily-limit of e.g. 10s → after ~10s of tracked time today, the site
  starts redirecting within a minute.
- Disabling/deleting a rule removes its DNR rule (check `getDynamicRules()` is empty afterwards).
- Verify the whole matrix on a Firefox build, exercising the fallback path if DNR redirect isn't
  available there.

---

## 6. Phase 4 — Popup UI (React + shadcn/Tailwind)

**Goal:** at-a-glance today view + one-tap blocking.

**Files:** `entrypoints/popup/App.tsx` + hooks.

- On mount, read today's usage directly from `storage.local` (do **not** message the background
  worker for it — it may be asleep; reading storage directly also sidesteps the "popup opens
  before worker ready" race).
- Subscribe to `browser.storage.onChanged` so the list updates live while the popup is open.
- Show: total time today, top N domains with time + a favicon, sorted descending.
- Each row: a quick "block" switch. Toggling it upserts an `always` BlockRule and sends a
  `SYNC_RULES` message so the background re-syncs DNR immediately.
- Footer link/button → open the options/dashboard page (`browser.runtime.openOptionsPage()`).

Typed messaging: extend `utils/messaging.ts` with a discriminated union
(`{ type: 'SYNC_RULES' }`, etc.); don't stringly-type `message.type` across contexts.

**Acceptance:** popup shows today's sites with correct times; toggling block on a row immediately
starts redirecting that site; numbers update live if you browse with the popup open (or reopen).

---

## 7. Phase 5 — Options / dashboard UI

**Goal:** full history + rule management + privacy controls.

**Files:** `entrypoints/options/App.tsx` + subcomponents.

- **History views:** today / last 7 days / last 30 days. A simple bar or stacked view per day and
  a per-domain totals table. (A tiny charting lib is fine; keep the bundle lean.)
- **Rule management:** create/edit/delete BlockRules with a mode selector exposing all three:
  - Always block.
  - Redirect → text field for the custom URL (validate it).
  - Schedule → day-of-week checkboxes + start/end time pickers, and/or a daily-limit input
    (minutes). Make clear both conditions OR together.
  Every mutation sends `SYNC_RULES`.
- **Privacy controls (this is a selling point of the extension — make it prominent):**
  - **Export** all data as a JSON file download (build a blob; no network).
  - **Clear** all history and/or all rules, with a confirm dialog.
  - **Retention** setting (auto-prune after N days).
  - A short, honest statement: all data is stored locally on this device and never leaves it; no
    accounts, no servers, no sync.

**Acceptance:** can create one rule of each mode and see it enforced; export produces a valid JSON
file containing the usage data; clear empties storage and removes DNR rules; retention setting is
honored by the prune alarm.

---

## 8. Phase 6 — Cross-browser build & test

- `npx wxt build -b chrome | -b firefox | -b edge` all succeed; `wxt zip -b <target>` produces
  per-store packages.
- **Vitest:** storage transforms, domain normalization, the "is blocked now?" evaluator (pure
  function — unit-test the schedule/limit logic thoroughly with fixed clocks).
- **Playwright E2E (Chromium):** launch a persistent context with the built unpacked extension
  loaded; drive the popup; assert a blocked navigation redirects to `blocked.html`; assert time
  accrues on a test page.
- **Firefox:** Playwright + Firefox extensions is less seamless — use `web-ext run` for a manual/
  semi-automated pass, and specifically re-verify the DNR-vs-fallback blocking path there.
- **Manual matrix** (Chrome, Edge, Firefox): tracking accuracy on focus/blur/idle; each block
  mode; export/clear.

---

## 9. Phase 7 — Packaging & store prep

- Icons at 16/32/48/128 in `public/icon/` (WXT auto-wires them).
- Per-store listing assets + screenshots.
- **Privacy:** a privacy policy stating no data collection / no transmission (both Chrome Web
  Store and Firefox AMO ask). Fill in the permission-justification text, especially for
  `host_permissions: <all_urls>` (needed to redirect user-chosen blocked sites) and `tabs`
  (needed to attribute active time to the current site — metadata only, no page content read).
- `wxt submit` can push per-browser packages; confirm each store's current requirements first.

---

## 10. Known risks / decisions to raise with the human

1. **`<all_urls>` host permission** vs. a runtime `optional_host_permissions` request — trade-off
   between install friction/review speed and UX. Decide before submission.
2. **Firefox DNR redirect support** in the target Firefox version — determines whether the
   `webNavigation` fallback ships. Verify early (Phase 3), not at packaging time.
3. **Timezone / day boundary** — usage buckets use local dates; a user crossing midnight or
   changing timezones will see the day roll over by local time. Confirm that's the intended
   behavior (it usually is for a personal tracker).
4. **Incognito/private windows** — extensions don't run there unless the user opts in, and you
   likely do NOT want to track private browsing anyway. Default to not tracking; document it.

---

## Build order summary

Phase 0 (scaffold) → 1 (data) → 2 (tracking) → 3 (blocking) → 4 (popup) → 5 (dashboard) →
6 (cross-browser test) → 7 (packaging). Phases 2 and 3 are the technically hard parts; spend the
acceptance-testing effort there.
