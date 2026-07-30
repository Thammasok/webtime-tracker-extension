# Background Service Worker (MV3)

The single hardest part of MV3. The background is an **event-driven service worker**, not a
persistent page. It starts when an event fires, and the browser terminates it after ~30 seconds of
inactivity (or sooner under memory pressure). Treat every wake as a cold start.

## The three rules

### 1. Register listeners synchronously at the top level

When the worker cold-starts to handle an event, it re-runs the whole script top-to-bottom, then
dispatches the event. A listener added inside an async callback or after `await` isn't registered
yet when dispatch happens — the event is missed.

```js
// ✅ Top-level, synchronous
chrome.runtime.onInstalled.addListener(handleInstall);
chrome.runtime.onMessage.addListener(handleMessage);
chrome.alarms.onAlarm.addListener(handleAlarm);

// ❌ Registered too late
chrome.storage.local.get('cfg').then(() => {
  chrome.runtime.onMessage.addListener(handleMessage); // missed on cold start
});
```

Do async setup *inside* the handler, not before registering it.

### 2. Never rely on in-memory state

Module-scope variables vanish when the worker dies. Persist anything that must survive:

- **`chrome.storage.session`** — in-memory tier, cleared when the browser closes, not written to
  disk. Perfect for worker state that shouldn't outlive the session (tokens, caches, flags).
- **`chrome.storage.local`** — persisted to disk for durable data.

```js
// Read-modify-write on each event instead of trusting a variable
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const { visits = {} } = await chrome.storage.session.get('visits');
    visits[sender.tab.id] = (visits[sender.tab.id] ?? 0) + 1;
    await chrome.storage.session.set({ visits });
    sendResponse({ ok: true });
  })();
  return true; // keep the channel open for the async response
});
```

### 3. Use event-based timing, not `setTimeout`/`setInterval`

Timers longer than the worker's lifetime will never fire — the worker dies first. Use
`chrome.alarms` for anything beyond a few seconds.

```js
// Create once (survives worker restarts; stored by the browser)
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('refresh', { periodInMinutes: 30 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh') refreshData(); // wakes the worker
});
```

Minimum alarm period is 30 seconds (was 1 minute pre-Chrome 120). For sub-second scheduling,
you're likely holding state you shouldn't — reconsider the design.

## Lifecycle events

```js
// First install / update — one-time setup, migrations, default settings, context menus
chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  if (reason === 'install') await chrome.storage.local.set({ settings: DEFAULTS });
  if (reason === 'update')  await migrate(previousVersion);
  chrome.contextMenus.create({ id: 'do-thing', title: 'Do thing', contexts: ['selection'] });
});

// Browser startup (profile launch)
chrome.runtime.onStartup.addListener(() => { /* re-arm state */ });
```

`onInstalled` is where context menus, alarms, and default storage belong — it runs once, not on
every wake.

## When the worker isn't enough: offscreen documents

The service worker has **no DOM** and no access to `window`, `document`, `DOMParser`, `Audio`,
`navigator.clipboard`, or WebRTC. When you need those, create an **offscreen document** — a hidden
page you control the lifetime of.

```jsonc
{ "permissions": ["offscreen"] }
```

```js
async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument?.();
  if (existing) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['DOM_PARSER'],   // AUDIO_PLAYBACK | CLIPBOARD | DOM_SCRAPING | WEB_RTC | ...
    justification: 'Parse HTML fetched in the background',
  });
}
// Then message the offscreen document to do the DOM work and return a result.
await chrome.offscreen.closeDocument(); // close when done to free resources
```

Use offscreen documents for: parsing HTML strings, playing audio/notifications sounds, clipboard
read/write from the background, and holding a long-lived WebSocket/WebRTC connection that must
outlive the worker's idle timeout.

## Keeping a connection alive (advanced, use sparingly)

If you truly need a persistent WebSocket, the offscreen document is the right home — the worker
will still idle-out, but the offscreen page stays alive until you close it. Avoid the old
"ping yourself every 20s to stay awake" hacks: they waste resources and the browser increasingly
ignores them. Design around ephemerality instead.

## Debugging

- Open `chrome://extensions`, enable Developer mode, click **"service worker"** to open its
  DevTools. The worker shows **"(inactive)"** when asleep — clicking wakes it.
- To reproduce a cold start, hit **Stop** on the service worker in DevTools, then trigger an event.
- Firefox uses an **event page** (a background script with `persistent: false` semantics) rather
  than a service worker; behavior is similar but not identical — test both. See `cross-browser.md`.
