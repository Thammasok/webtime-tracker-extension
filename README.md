# Webtime Tracker

A cross-browser (Chrome / Edge / Firefox) browser extension that tracks time spent per website
and can block distracting sites — always, redirected to a custom page, or on a schedule / daily
limit. Everything is stored **locally on your device only**: no accounts, no servers, no sync.

## Features

- **Time tracking** — accrues seconds per domain for the foreground, active tab only. Pauses
  automatically when the browser is unfocused, you're idle, or (by default) in Incognito.
- **Blocking**, three modes per site, enforced by one rule engine:
  - **Always block** — redirects every visit to a calm "blocked" page.
  - **Redirect** — sends you to a custom URL of your choosing instead.
  - **Schedule / daily limit** — blocks inside configured time windows and/or once today's
    tracked time for that site crosses a limit you set.
- **Popup** — today's top sites at a glance, with a one-tap block toggle per site.
- **Dashboard** — usage history (Today / 7 days / 30 days), a category breakdown, full rule
  management, and privacy controls (retention, excluded sites, export/import, clear all data).
- **Local-only by design** — usage history and rules live in `browser.storage.local`; nothing is
  ever transmitted off the device. No remote fonts, no favicon fetching, no analytics.

## Tech stack

[WXT](https://wxt.dev) (Manifest V3, cross-browser) + React + TypeScript + Tailwind CSS v4, with
a small set of hand-rolled shadcn/ui-style primitives (`components/ui/`). Chrome/Edge enforce
blocks via `declarativeNetRequest`; Firefox enforces via `webNavigation` + `tabs.update` instead,
since Firefox's DNR redirect support has historically had gaps.

## Getting started

```bash
pnpm install
pnpm dev            # Chrome/Edge, with HMR — load .output/chrome-mv3 unpacked
pnpm dev:firefox    # Firefox
```

Other scripts:

```bash
pnpm build            # production build, Chrome/Edge  -> .output/chrome-mv3
pnpm build:firefox    # production build, Firefox (MV3) -> .output/firefox-mv3
pnpm test             # Vitest unit tests
pnpm compile           # tsc --noEmit
pnpm zip / zip:firefox # packaged .zip for store submission
```

To load an unpacked build in Chrome: `chrome://extensions` → enable Developer mode → **Load
unpacked** → select `.output/chrome-mv3`. In Firefox, use `about:debugging` → **This Firefox** →
**Load Temporary Add-on**, or `pnpm dlx web-ext run` for a semi-automated pass.

## Project structure

```
entrypoints/
  background.ts     background service worker: tracking + blocking listeners, alarms
  popup/             toolbar popup — today's usage, quick block toggle
  options/           dashboard — Overview / Blocking rules / Privacy tabs
  blocked/           the redirect target for blocked navigations
utils/
  storage.ts         the only module that touches raw browser.storage.local
  tracker.ts         active-session flush/restart logic + the trackability decision function
  blocker.ts         pure isBlockedNow evaluator + DNR sync / Firefox webNavigation fallback
  domain.ts          eTLD+1 normalization (via tldts)
  ...                types, date/format helpers, usage aggregation, category lookup
components/          shared UI (site icon, stat card) + components/ui/ primitives
hooks/               useExtensionData — live storage-backed read hook for popup/dashboard
```

Every context (background, popup, options) reads and writes usage/rules/settings exclusively
through `utils/storage.ts` — there's a single source of truth, and no context ever messages the
background worker just to read data (it may be asleep).

## Privacy

No accounts, no network calls for your data, no sync storage. Usage history, block rules, and
settings live in `browser.storage.local` on this device only. The Privacy tab in the dashboard
lets you set a retention window, exclude specific sites from tracking, pause tracking in
Incognito, export/import your data as JSON, or erase everything.

## Known limitations

- No real favicon fetching or remote fonts — site icons are a deterministic colored initial, and
  UI text uses the system font stack, so the extension never reaches out to the network for
  anything but the sites you visit yourself.
- No redirect-count telemetry — MV3's `declarativeNetRequestFeedback` (the only way to get real
  redirect counts) is dev-only on Chrome and unavailable on Firefox.
- Cross-browser E2E testing and store packaging (icons/screenshots/listing copy, permission
  justification text for `<all_urls>`) are not done yet.
