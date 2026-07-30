# Content Scripts

A content script is JS/CSS injected into a web page. It shares the page's **DOM** but runs in an
**isolated world** — its own JS heap. It cannot read the page's JS variables or functions, and the
page cannot read the script's. This isolation is a security feature; work with it, not against it.

## Two ways to inject

### 1. Declarative (in the manifest)

Runs automatically on matching pages. Best when you always need to run on known sites.

```jsonc
"content_scripts": [{
  "matches": ["https://*.example.com/*"],
  "exclude_matches": ["https://example.com/admin/*"],
  "js": ["content.js"],
  "css": ["content.css"],
  "run_at": "document_idle",     // document_start (before DOM) | document_end | document_idle
  "all_frames": false,           // true = inject into every iframe too
  "match_about_blank": false
}]
```

`run_at` matters: `document_start` runs before the page's own scripts (good for intercepting), but
the DOM isn't built yet; `document_idle` (default) runs after load, DOM ready.

### 2. Programmatic (`chrome.scripting`)

Inject on demand — after a click, a message, a tab update. Requires `scripting` permission plus
host access (or `activeTab` after a user gesture).

```js
// Inject a file
await chrome.scripting.executeScript({
  target: { tabId, allFrames: false },
  files: ['content.js'],
});

// Inject a function with serializable args (args are structured-cloned across the boundary)
await chrome.scripting.executeScript({
  target: { tabId },
  func: (label) => { document.title = label; },
  args: ['Injected!'],
});

// Inject/remove CSS
await chrome.scripting.insertCSS({ target: { tabId }, css: 'body { filter: invert(1); }' });
await chrome.scripting.removeCSS({ target: { tabId }, css: 'body { filter: invert(1); }' });
```

`func` runs in the page's execution but is **not a closure** over your extension — only `args`
cross over, and they must be JSON-serializable.

## The isolated world (and the MAIN world)

By default content scripts run in `ISOLATED` world — safe, can't touch page JS. If you must access
the page's own variables/framework (e.g. read a global the page defines), inject into the `MAIN`
world. This is riskier: you're now in the page's untrusted realm with no isolation.

```js
await chrome.scripting.executeScript({
  target: { tabId },
  world: 'MAIN',                 // runs in the page's own JS context
  func: () => window.__APP_STATE__,
});
```

Declarative equivalent: `"world": "MAIN"` in the content_scripts entry (Chrome 111+). Prefer
`ISOLATED` and bridge via `window.postMessage` when you need page↔script data, so you never
`eval` page data in your privileged context.

## Talking to the background

A content script can message the service worker directly:

```js
// content.js
const res = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });

// The worker can push to a specific tab:
// background.js
chrome.tabs.sendMessage(tabId, { type: 'PAGE_UPDATED', payload });
```

See `messaging.md` for the full patterns, including long-lived ports.

## Injecting UI without breaking the page

Injected DOM inherits the page's CSS and can collide with it. Use a **Shadow DOM** to isolate
styles both ways:

```js
const host = document.createElement('div');
host.id = 'my-ext-root';
document.body.append(host);
const shadow = host.attachShadow({ mode: 'open' });
shadow.innerHTML = `<style>:host{all:initial} .btn{...}</style><button class="btn">Go</button>`;
```

Bundle assets referenced from the page (icons, injected scripts) via `web_accessible_resources`
and resolve their URLs with `chrome.runtime.getURL('assets/logo.svg')`.

## Security: the page is hostile

- **Never** inject page-provided strings via `innerHTML` — that's XSS into your extension's
  DOM. Use `textContent`, or sanitize (e.g. DOMPurify) before `innerHTML`.
- Treat any `window.postMessage` from the page as untrusted: validate `event.origin` and the
  message shape before acting.
- Don't leak privileged data into the page. Anything you write to the page DOM or the MAIN world
  is readable by the page and other extensions.
- The page can remove or mutate your injected nodes at any time — observe with a `MutationObserver`
  if persistence matters, rather than assuming your node stays put.

## Matching subtleties

- `matches` uses match patterns (`scheme://host/path`), not regex. `*://*/*` ≈ all http/https.
- SPA route changes don't re-trigger declarative injection (the page never reloads). Detect
  client-side navigation via `chrome.webNavigation.onHistoryStateUpdated` in the worker, or a
  `MutationObserver`/`navigation` API in the content script, then react.
- `all_frames: true` + a permissive `matches` injects into ad iframes too — usually not what you want.
