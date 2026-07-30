# Messaging Between Contexts

Every context (service worker, content script, popup, options, side panel, offscreen) is a
separate JS realm. They share nothing but message channels. Two primitives:

- **One-shot** — `sendMessage` / `onMessage`: a single request → single response.
- **Long-lived** — `connect` / `onConnect` **ports**: a persistent bidirectional channel.

## One-shot request/response

### Content/popup → service worker

```js
// sender (content script, popup, options, …)
const reply = await chrome.runtime.sendMessage({ type: 'GET_USER', id: 42 });
```

```js
// service worker — receiver
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_USER') {
    // async work: MUST return true so the channel stays open until sendResponse
    getUser(msg.id).then((user) => sendResponse({ ok: true, user }));
    return true;
  }
  // sync reply: return nothing / falsy, respond immediately
  if (msg.type === 'PING') { sendResponse('pong'); }
});
```

**The `return true` rule is the #1 messaging bug.** If your handler responds asynchronously (any
`await`/`.then` before `sendResponse`) you MUST `return true` synchronously, or the channel closes
and the sender's promise rejects with *"message port closed before a response was received."*

A clean async pattern:

```js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try { sendResponse({ ok: true, data: await handle(msg, sender) }); }
    catch (e) { sendResponse({ ok: false, error: String(e) }); }
  })();
  return true; // always, for this handler
});
```

### Service worker → a specific tab's content script

`chrome.runtime.sendMessage` from the worker goes to *extension* contexts (popup, options), **not**
to content scripts. To reach a content script you must target its tab:

```js
// background.js
const reply = await chrome.tabs.sendMessage(tabId, { type: 'HIGHLIGHT', selector });
// frameId option targets a specific frame within the tab
```

If no content script is listening in that tab, this rejects — guard with try/catch or ensure the
script is injected first.

## Long-lived ports (streams, ongoing dialogue)

Use a port when you have repeated messages or a stream (e.g. live progress, a devtools panel, a
side panel subscribing to updates).

```js
// content script
const port = chrome.runtime.connect({ name: 'progress' });
port.postMessage({ type: 'START' });
port.onMessage.addListener((m) => updateBar(m.percent));
port.onDisconnect.addListener(() => { /* worker slept or closed; reconnect if needed */ });
```

```js
// service worker
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'progress') return;
  port.onMessage.addListener((m) => { if (m.type === 'START') stream(port); });
});
function stream(port) {
  let pct = 0;
  const id = setInterval(() => {
    port.postMessage({ percent: (pct += 10) });
    if (pct >= 100) clearInterval(id);
  }, 200);
  port.onDisconnect.addListener(() => clearInterval(id));
}
```

**MV3 caveat:** an open port does **not** keep the service worker alive indefinitely; the worker
can still idle-out (Chrome resets the timer on port activity, but long silent periods disconnect
it). Handle `onDisconnect` and reconnect, or move a truly persistent connection to an offscreen
document (see `service-worker.md`).

## Communicating with the page (MAIN world)

The isolated content script and the page's own JS talk only via `window.postMessage`. Always
validate origin and shape — the page is untrusted.

```js
// content script (isolated) → page
window.postMessage({ source: 'my-ext', type: 'CONFIG', payload }, '*');

// content script listening for page messages
window.addEventListener('message', (e) => {
  if (e.source !== window) return;               // ignore cross-frame
  if (e.data?.source !== 'my-page-app') return;  // namespace check
  handleFromPage(e.data);
});
```

## Cross-extension and web page → extension

- **`externally_connectable`** in the manifest lets specified websites or other extensions message
  yours via `chrome.runtime.sendMessage(extensionId, msg)`. Scope `matches`/`ids` tightly — this
  is an entry point into your extension.

```jsonc
"externally_connectable": { "matches": ["https://your-site.com/*"], "ids": ["OTHER_EXT_ID"] }
```

```js
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  // ALWAYS verify sender.origin / sender.id before trusting msg
});
```

## Design guidance

- Give every message a `type` discriminator; switch on it. Consider a shared `messages.ts` with a
  typed union so both ends agree on shapes.
- Keep payloads structured-cloneable (no functions, DOM nodes, class instances with methods).
- Prefer one-shot messages; reach for ports only for genuine streams/long dialogues.
- Never trust a message's contents to be from where it claims — validate `sender` for anything
  privileged, especially in `onMessageExternal`.
