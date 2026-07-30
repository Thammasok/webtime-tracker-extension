# Storage & State

Because contexts share no memory and the service worker is ephemeral, **`chrome.storage` is your
source of truth**. Do not use `localStorage` in extension pages for shared state — it's per-origin,
not shared with the worker, and unavailable in the worker at all.

## The four storage areas

| Area | Persisted? | Synced across devices? | Typical use | Quota (Chrome) |
|---|---|---|---|---|
| `chrome.storage.local` | Disk | No | Bulk/durable local data | ~10 MB (more with `unlimitedStorage`) |
| `chrome.storage.sync` | Disk + cloud | Yes (signed-in) | Small user settings | ~100 KB total, ~8 KB/item, write-rate limited |
| `chrome.storage.session` | In-memory | No (cleared on browser close) | Worker state, tokens, caches | ~10 MB |
| `chrome.storage.managed` | Read-only | Enterprise policy | Admin-provisioned config | — |

Rules of thumb:

- **Settings that should follow the user** → `sync` (but respect the tight quota and rate limits).
- **Large or frequently-written data** → `local` (sync will throttle/error you).
- **Ephemeral runtime state the worker needs across wakes** → `session` (never hits disk, cleared
  when the browser quits — ideal for auth tokens you don't want persisted).
- **Enterprise-managed config** → `managed`.

## Basic API (promise-based)

```js
await chrome.storage.local.set({ theme: 'dark', count: 3 });
const { theme, count = 0 } = await chrome.storage.local.get(['theme', 'count']);
await chrome.storage.local.remove('count');
await chrome.storage.local.clear();
const bytes = await chrome.storage.local.getBytesInUse();  // watch quotas
```

`get` with a default object returns those defaults for missing keys:

```js
const { settings } = await chrome.storage.local.get({ settings: DEFAULT_SETTINGS });
```

## Reacting to changes across contexts

`onChanged` fires in **every** context when storage mutates — the backbone of keeping popup,
options, content scripts, and the worker in sync without direct messaging.

```js
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.theme) {
    applyTheme(changes.theme.newValue); // { oldValue, newValue }
  }
});
```

This means UI can subscribe to state and re-render on change, while any context writes — no need
to broadcast messages for state propagation. Write once; every listener reacts.

## State-layer pattern

Centralize access so you don't scatter storage keys through the codebase and so read-modify-write
is race-safe within a single context.

```js
// state.js — imported by any context (re-imported on each worker wake)
const KEY = 'app-state';
const DEFAULTS = { theme: 'system', enabledSites: [] };

export async function getState() {
  const { [KEY]: state } = await chrome.storage.local.get({ [KEY]: DEFAULTS });
  return state;
}

export async function updateState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function onStateChange(cb) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) cb(changes[KEY].newValue);
  });
}
```

## Concurrency caveat

`chrome.storage` has **no transactions**. Two contexts doing read-modify-write on the same key can
clobber each other (last write wins). Mitigations:

- Funnel all writes to one key through the **service worker** via messaging, so writes serialize
  in one context.
- Store independent concerns under **separate keys** so unrelated writes don't collide.
- For counters/append operations that multiple contexts perform, route them through the worker and
  do the read-modify-write there.

## Migrations

Version your stored schema and migrate in `onInstalled` when `reason === 'update'`:

```js
chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  if (reason !== 'update') return;
  const { schemaVersion = 0, ...data } = await chrome.storage.local.get();
  if (schemaVersion < 2) { /* transform data */ await chrome.storage.local.set({ schemaVersion: 2 }); }
});
```

## Sensitive data

`chrome.storage` is **not encrypted** and readable by anyone with disk/profile access. Don't store
long-lived secrets in `local`/`sync`. Prefer `session` (memory-only) for tokens, keep lifetimes
short, and never log them. For OAuth, use `chrome.identity.launchWebAuthFlow` and hold the token in
`session`.
