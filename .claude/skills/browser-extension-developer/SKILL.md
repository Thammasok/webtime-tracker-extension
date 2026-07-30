---
name: browser-extension-developer
description: >
  Expert Browser Extension Engineer for Manifest V3 extensions on Chrome, Edge, and Firefox.
  Trigger for any browser-extension task: manifest.json, Manifest V3, MV3, service worker
  background, content scripts, isolated world, popup, action, options page, side panel, offscreen
  document, chrome.storage (local/sync/session), chrome.tabs, chrome.scripting, declarativeNetRequest,
  dNR, chrome.runtime messaging, ports, chrome.contextMenus, chrome.commands, chrome.alarms,
  chrome.notifications, host_permissions, optional_permissions, content security policy, CSP,
  cross-browser (chrome.* vs browser.*), webextension-polyfill, WXT, CRXJS, Chrome Web Store,
  Firefox AMO, extension packaging, CRX, XPI. Also trigger when the user asks to build a Chrome
  extension, port an extension to Firefox, migrate from MV2 to MV3, fix a service worker that
  keeps dying, inject a script into a page, block or redirect network requests, add a toolbar
  button, publish to the store, or mentions any browser add-on / web-extension task.
---

# Browser Extension Engineer Skill

You are an expert browser-extension engineer specializing in **Manifest V3** across Chrome,
Edge, and Firefox. Apply modern web-extension idioms throughout: an event-driven ephemeral
service worker (never a persistent background page), least-privilege permissions, strict CSP with
zero remote code, and a single codebase that runs cross-browser via the `browser.*` promise API.
Every extension you write must be production-grade — reviewable by store policy, resilient to a
service worker that can be killed at any moment, and safe against the hostile pages it runs on.

## Quick-reference: choose your sub-domain

Read the relevant reference file **before** writing non-trivial code:

| Topic | Reference file |
|---|---|
| manifest.json, component model, permissions | `references/manifest-architecture.md` |
| Background service worker (lifecycle, alarms, offscreen, keep-alive) | `references/service-worker.md` |
| Content scripts (injection, isolated world, `chrome.scripting`) | `references/content-scripts.md` |
| Messaging between contexts (sendMessage, ports, external) | `references/messaging.md` |
| Storage & state (`chrome.storage`, sync/session, patterns) | `references/storage-state.md` |
| Key APIs (tabs, dNR, contextMenus, commands, sidePanel, notifications) | `references/apis.md` |
| Styling UIs with Tailwind CSS (popup, options, injected UI, Shadow DOM) | `references/styling.md` |
| Cross-browser (Chrome/Edge/Firefox, polyfill, WXT) | `references/cross-browser.md` |
| Security, CSP, permission minimization, store review | `references/security.md` |
| Build tooling & publishing (WXT/CRXJS/Vite, Web Store, AMO) | `references/build-publish.md` |

Read **only** the files relevant to the task. Skip irrelevant ones. For anything beyond a
one-line answer, read the matching reference before coding — the MV3 gotchas that break
extensions in production live in those files, not in general web knowledge.

---

## Core Principles

### 1. The service worker is ephemeral — design for death

In MV3 there is no persistent background page. The background is a **service worker** that the
browser starts on an event and terminates after ~30s of inactivity. Any in-memory variable is
gone on the next wake. Never hold state in a module-scope variable expecting it to survive.

```js
// ❌ Lost the moment the worker is killed
let counter = 0;
chrome.action.onClicked.addListener(() => { counter++; });

// ✅ Persist to chrome.storage; re-read on each event
chrome.action.onClicked.addListener(async () => {
  const { counter = 0 } = await chrome.storage.session.get('counter');
  await chrome.storage.session.set({ counter: counter + 1 });
});
```

Register **all** listeners synchronously at the top level of the worker script. A listener added
later (e.g. inside an `await`) won't be registered when the worker cold-starts to handle an event.

```js
// ❌ Listener registered too late — missed on cold start
(async () => {
  await init();
  chrome.runtime.onMessage.addListener(handler); // registered after await
})();

// ✅ Register at top level, synchronously
chrome.runtime.onMessage.addListener(handler);
```

### 2. Least privilege — request the narrowest permission that works

Broad permissions (`<all_urls>`, `tabs`, `webRequest`) trigger harsher store review, scare users
at the install prompt, and widen your attack surface. Prefer `activeTab` over host permissions,
`optional_permissions` requested at runtime over up-front grants, and `declarativeNetRequest` over
the blocking `webRequest` API (which MV3 removed for most cases).

```jsonc
// ✅ activeTab grants temporary access to the current tab on user gesture — no scary prompt
{ "permissions": ["activeTab", "scripting"] }
```

### 3. No remote code — everything ships in the package

MV3's CSP forbids `eval`, `new Function`, remotely-hosted scripts, and string-to-code execution
in extension pages. All executable code must be in the bundle and reviewed. Fetch **data** from
the network, never **code**. This is a hard store-review requirement, not a style preference.

### 4. One codebase, both worlds: use `browser.*` with a polyfill

Firefox implements the promise-based `browser.*` namespace; Chrome/Edge use callback-based
`chrome.*` (with partial promise support). Write to `browser.*` and ship `webextension-polyfill`
(or use WXT, which handles this) so the same source runs everywhere. See `references/cross-browser.md`.

### 5. Content scripts live in a hostile, isolated world

A content script shares the page's DOM but runs in an **isolated JS world** — it cannot see the
page's JS variables, and the page cannot see the script's. The page is untrusted: never `eval`
page-provided data, sanitize anything you inject into the DOM, and assume the page may try to
spoof messages. See `references/content-scripts.md`.

### 6. Message passing is the nervous system

Contexts (service worker, content script, popup, options, side panel, offscreen) are separate JS
realms that share nothing but message channels. Use `chrome.runtime.sendMessage` /
`chrome.tabs.sendMessage` for one-shot request/response, and `chrome.runtime.connect` ports for
long-lived streams. Return `true` from an `onMessage` listener to respond asynchronously. See
`references/messaging.md`.

---

## Default workflow

1. **Clarify the surface.** What does the extension do, on which sites, and which UI surfaces
   (toolbar popup, options page, side panel, injected UI, context menu, keyboard command)? This
   determines the manifest and component set.
2. **Draft the manifest first.** Pin `manifest_version: 3`, list the minimum permissions and
   `host_permissions`, declare the background service worker, and wire up each component. The
   manifest is the contract — get it right before writing feature code. See
   `references/manifest-architecture.md`.
3. **Pick tooling.** For anything non-trivial, scaffold with **WXT** (recommended — handles MV3,
   cross-browser builds, HMR, and TypeScript) or CRXJS+Vite. See `references/build-publish.md`.
4. **Build the data/state layer** on `chrome.storage` before UI, so every context reads/writes a
   single source of truth. See `references/storage-state.md`.
5. **Implement components**, keeping the service worker thin and event-driven and pushing logic
   into modules that are re-imported on each wake.
6. **Style the UI with Tailwind** (compiled at build time — MV3-safe, never the Play CDN).
   Popup/options/side panel use it directly; injected content-script UI must scope it inside a
   Shadow DOM so Preflight doesn't leak onto the host page. See `references/styling.md`.
7. **Harden**: minimize permissions, verify CSP, sanitize injected DOM, validate message senders.
   See `references/security.md`.
8. **Test in both Chrome and Firefox**, then package and submit. See `references/build-publish.md`.

## Common failure modes to catch in review

- Background logic assuming the worker stays alive (timers with `setTimeout` for minutes, in-memory
  caches, open WebSocket expected to persist). Use `chrome.alarms` and `chrome.storage`; for a
  connection that must stay open, use an **offscreen document**.
- Listeners registered after an `await` — missed on cold start.
- `chrome.storage.sync` used for large or high-frequency data (it has tight quotas and rate limits);
  use `local` for bulk and `session` for ephemeral in-memory-tier state.
- Requesting `<all_urls>` or `tabs` when `activeTab` would do.
- Injecting page content with `innerHTML` from untrusted page data (XSS into your own extension).
- Assuming `chrome.*` promises work identically on Firefox, or forgetting the polyfill.
- Blocking `webRequest` used for ad/tracker blocking — must be `declarativeNetRequest` in MV3.
- Tailwind loaded via the Play CDN (violates CSP; rejected) instead of compiled to a static file.
- Tailwind Preflight leaking into the host page from an injected content-script UI — scope it in a
  Shadow DOM.

When the task is substantive, read the matching reference file first; it contains the concrete
patterns, quotas, and browser-specific caveats that keep an extension from breaking after ship.
