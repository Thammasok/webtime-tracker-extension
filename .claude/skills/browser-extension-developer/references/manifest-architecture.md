# Manifest & Architecture (MV3)

## The component model

A Manifest V3 extension is a set of independent JS realms wired together by the manifest. None of
them share memory — they communicate only via messaging and `chrome.storage`.

| Component | Runs where | Lifetime | Purpose |
|---|---|---|---|
| **Service worker** (background) | Extension origin, no DOM | Ephemeral, event-driven | Coordination, event handling, API calls, alarms |
| **Content script** | Injected into a web page, isolated world | Lives with the tab | Read/modify page DOM, bridge page ↔ worker |
| **Popup** (action) | Extension origin, own document | While open only | Toolbar-button UI |
| **Options page** | Extension origin, own tab/embedded | While open | Settings UI |
| **Side panel** | Extension origin, docked panel | While open | Persistent side UI (Chrome 114+) |
| **Offscreen document** | Extension origin, hidden DOM | You control it | DOM APIs the worker lacks (audio, clipboard, DOM parsing) |

## Minimal manifest.json

```jsonc
{
  "manifest_version": 3,
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Does a useful thing.",

  "action": {                       // toolbar button + optional popup
    "default_popup": "popup.html",
    "default_title": "My Extension"
  },

  "background": {
    "service_worker": "background.js",
    "type": "module"                // enables ES module imports in the worker
  },

  "content_scripts": [{
    "matches": ["https://example.com/*"],
    "js": ["content.js"],
    "run_at": "document_idle"       // document_start | document_end | document_idle
  }],

  "options_page": "options.html",   // or "options_ui": { "page": "...", "open_in_tab": false }

  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["https://api.example.com/*"],

  "icons": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" }
}
```

## Permissions model

Split permissions into three buckets and request the narrowest:

- **`permissions`** — API permissions (`storage`, `alarms`, `contextMenus`, `scripting`,
  `notifications`, `tabs`, `declarativeNetRequest`, …). Some (like `tabs`) also widen host access.
- **`host_permissions`** — origins you may inject into or fetch cross-origin from
  (`https://*.example.com/*`, `<all_urls>`). These drive the scariest install prompts.
- **`optional_permissions`** / **`optional_host_permissions`** — granted at runtime via
  `chrome.permissions.request()` behind a user gesture. Prefer these for anything not needed at
  install time.

### `activeTab` — the permission you usually want

`activeTab` grants temporary access to the **currently active tab** when the user invokes the
extension (clicks the action, uses a command). No host permission, no scary prompt. Ideal for
"do something to the page I'm on right now" extensions.

```jsonc
{ "permissions": ["activeTab", "scripting"] }
```

```js
// After a user gesture (action click), inject into the active tab
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => { document.body.style.filter = 'invert(1)'; },
  });
});
```

### Requesting optional permissions at runtime

```js
const granted = await chrome.permissions.request({
  permissions: ['bookmarks'],
  origins: ['https://newsite.com/*'],
});
if (!granted) return; // user declined — degrade gracefully
```

## `web_accessible_resources`

Any extension file a **web page or content script** must load by URL (images, injected scripts,
fonts, `<iframe>` pages) has to be declared, scoped to the origins allowed to see it. Undeclared
resources 404 to the page. Keep the list tight — exposed resources leak your extension's presence.

```jsonc
"web_accessible_resources": [{
  "resources": ["injected.js", "assets/logo.svg"],
  "matches": ["https://example.com/*"]
}]
```

## Choosing UI surfaces

- **Popup**: quick actions/status; dies when it loses focus — don't run long work here.
- **Options page**: settings; use `chrome.storage.sync` so they follow the signed-in user.
- **Side panel**: persistent UI alongside browsing (Chrome/Edge); declare `sidePanel` permission
  and a `side_panel.default_path`.
- **Injected UI**: render into the page from a content script (Shadow DOM to avoid CSS bleed).
- **Context menu / keyboard command**: declare `contextMenus` / `commands`; handle in the worker.

## MV2 → MV3 migration checklist

1. `manifest_version: 2` → `3`.
2. `background.scripts`/`persistent` → `background.service_worker` (Chrome) — no persistent page.
3. `browser_action`/`page_action` → unified `action`.
4. Blocking `webRequest` → `declarativeNetRequest` (see `apis.md`).
5. Remote scripts / inline handlers → bundled code only (CSP forbids remote code).
6. `tabs.executeScript`/`insertCSS` → `chrome.scripting.executeScript`/`insertCSS`.
7. Host access split into `host_permissions`.
8. Callback code assuming a live background → re-read state from storage on each event.
