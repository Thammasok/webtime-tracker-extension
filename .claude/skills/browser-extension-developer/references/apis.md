# Key Extension APIs

The high-value APIs beyond storage/messaging. Each needs its permission in the manifest.

## `chrome.tabs` — inspect and control tabs

```jsonc
{ "permissions": ["tabs"] }   // note: "tabs" also grants url/title/favIcon access — request only if needed
```

```js
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
await chrome.tabs.create({ url: 'https://example.com', active: true });
await chrome.tabs.update(tabId, { url });
await chrome.tabs.remove(tabId);
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete') { /* page finished loading */ }
});
```

You often don't need the `tabs` permission: `activeTab` gives you the active tab's details after a
user gesture, and `chrome.tabs.query` returns tabs without URLs/titles when you lack the permission.

## `chrome.declarativeNetRequest` (dNR) — block/redirect/modify requests

MV3 removed **blocking** `webRequest` for most extensions. Use dNR: you declare rules, the browser
enforces them without waking your worker. This is how ad/content blockers work in MV3.

```jsonc
{
  "permissions": ["declarativeNetRequest"],
  "host_permissions": ["<all_urls>"],
  "declarative_net_request": {
    "rule_resources": [{ "id": "ruleset_1", "enabled": true, "path": "rules.json" }]
  }
}
```

```jsonc
// rules.json — static rules
[
  { "id": 1, "priority": 1, "action": { "type": "block" },
    "condition": { "urlFilter": "||ads.example.com", "resourceTypes": ["script","image"] } },
  { "id": 2, "priority": 1, "action": { "type": "redirect",
      "redirect": { "extensionPath": "/mock.json" } },
    "condition": { "urlFilter": "||api.tracker.com/*" } }
]
```

Add/remove rules at runtime with `chrome.declarativeNetRequest.updateDynamicRules(...)`. You can
still use **observational** (non-blocking) `webRequest` to watch traffic, but you cannot cancel or
rewrite it from the callback in MV3.

## `chrome.contextMenus` — right-click menu items

```jsonc
{ "permissions": ["contextMenus"] }
```

```js
// Create in onInstalled (runs once), NOT on every worker wake (would throw duplicate-id)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translate', title: 'Translate "%s"', contexts: ['selection'],
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'translate') translate(info.selectionText, tab.id);
});
```

## `chrome.commands` — keyboard shortcuts

```jsonc
"commands": {
  "toggle-feature": {
    "suggested_key": { "default": "Ctrl+Shift+Y", "mac": "Command+Shift+Y" },
    "description": "Toggle the feature"
  },
  "_execute_action": { "suggested_key": { "default": "Ctrl+Shift+U" } }  // opens the popup
}
```

```js
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-feature') toggle();
});
```

Users can rebind at `chrome://extensions/shortcuts`. Max 4 suggested keys; avoid clobbering common
browser shortcuts.

## `chrome.sidePanel` — persistent docked UI (Chrome/Edge 114+)

```jsonc
{ "permissions": ["sidePanel"], "side_panel": { "default_path": "sidepanel.html" } }
```

```js
// Open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
// Or open programmatically (must be within a user gesture)
await chrome.sidePanel.open({ tabId });
// Scope a panel to specific tabs
await chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true });
```

Firefox has a similar `sidebar_action` manifest key with different shape — see `cross-browser.md`.

## `chrome.notifications` — system notifications

```jsonc
{ "permissions": ["notifications"] }
```

```js
chrome.notifications.create('done', {
  type: 'basic', iconUrl: 'icons/128.png',
  title: 'Task complete', message: 'All items processed.',
  buttons: [{ title: 'View' }],
});
chrome.notifications.onButtonClicked.addListener((id, idx) => { /* ... */ });
```

## `chrome.action` — the toolbar button

```js
await chrome.action.setBadgeText({ text: '3', tabId });
await chrome.action.setBadgeBackgroundColor({ color: '#d00' });
await chrome.action.setIcon({ path: 'icons/active-16.png', tabId });
await chrome.action.setTitle({ title: 'Enabled', tabId });
// With no default_popup, onClicked fires:
chrome.action.onClicked.addListener((tab) => { /* runs on click */ });
```

## `chrome.alarms` — see `service-worker.md`

Scheduling in MV3 must go through alarms, not `setTimeout`/`setInterval`, because the worker dies.

## `chrome.identity` — OAuth

```jsonc
{ "permissions": ["identity"] }
```

`chrome.identity.getAuthToken` (Google accounts, Chrome only) or the cross-browser
`chrome.identity.launchWebAuthFlow` for generic OAuth 2.0. Hold the resulting token in
`chrome.storage.session`, never in `local`.

## Others worth knowing

- `chrome.webNavigation` — SPA route changes (`onHistoryStateUpdated`), frame lifecycle.
- `chrome.cookies` — read/write cookies (needs host permission + `cookies`).
- `chrome.bookmarks`, `chrome.history`, `chrome.downloads`, `chrome.management` — self-explanatory,
  each behind its own permission and each raising review scrutiny. Request only what you use.
