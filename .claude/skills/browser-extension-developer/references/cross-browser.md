# Cross-Browser (Chrome / Edge / Firefox)

Write one codebase that runs everywhere. Chrome and Edge are both Chromium — nearly identical.
Firefox implements the same WebExtensions model but with meaningful differences.

## The namespace: `chrome.*` vs `browser.*`

- **Chrome/Edge:** `chrome.*`, historically callback-based; most APIs now also return promises when
  called without a callback.
- **Firefox:** `browser.*`, promise-based by design. (Firefox also exposes `chrome.*` for
  compatibility, callback-style.)

**Write to `browser.*` + promises**, and ship a polyfill so it works on Chromium:

```bash
npm i webextension-polyfill
```

```js
import browser from 'webextension-polyfill';
const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
```

The polyfill maps `browser.*` promise calls onto Chrome's `chrome.*` at runtime. With TypeScript,
`@types/webextension-polyfill` gives you types across both. (Or use **WXT**, which wires all of
this up for you — see `build-publish.md`.)

## Background: service worker vs event page

The biggest structural difference.

| | Chrome/Edge (MV3) | Firefox (MV3) |
|---|---|---|
| Background type | **Service worker** | **Event page** (non-persistent background *script*) |
| Manifest key | `"background": { "service_worker": "bg.js", "type": "module" }` | `"background": { "scripts": ["bg.js"], "type": "module" }` |
| DOM available? | No | No (event page, but still not a full page) |
| Lifetime | Ephemeral, ~30s idle | Ephemeral, idle-terminated |

Firefox does **not** support the `service_worker` key the same way; it expects `scripts`. To ship
both, generate per-browser manifests (WXT/CRXJS do this) or provide two manifest variants. The
same top-level event-driven code works in both — just don't rely on service-worker-only globals
(`clients`, `skipWaiting`) if you target Firefox.

## Side panel / sidebar

- Chrome/Edge: `chrome.sidePanel` API + `"side_panel"` manifest key (Chrome 114+).
- Firefox: `"sidebar_action"` manifest key (different shape, no `sidePanel` API).

Feature-detect and branch, or gate the feature per build target.

## Other notable differences

- **`declarativeNetRequest`**: supported in Firefox but with differences in dynamic-rule limits and
  some condition fields. Firefox also still allows blocking `webRequest` for extensions — but for
  portability, prefer dNR.
- **`chrome.identity.getAuthToken`**: Chrome-only (Google-specific). Use
  `launchWebAuthFlow` for cross-browser OAuth.
- **Extension ID / signing**: Firefox requires the add-on to be signed by AMO; you can set an
  explicit ID via `browser_specific_settings.gecko.id` in the manifest:

  ```jsonc
  "browser_specific_settings": { "gecko": { "id": "my-ext@example.com", "strict_min_version": "115.0" } }
  ```

- **`web_accessible_resources`**: both use the MV3 object form (`resources` + `matches`), but
  Firefox historically supported the array-of-strings MV2 form; use the object form for MV3.
- **CSP**: Firefox is generally stricter about remote connections; keep `connect-src` explicit.
- **API surface gaps**: not every `chrome.*` API exists in Firefox (and vice versa). Feature-detect
  (`if (chrome.sidePanel)`) rather than assuming.

## Practical strategy

1. Code against `browser.*` with the polyfill (or WXT).
2. Keep a single source manifest and generate per-target manifests at build time (WXT: `wxt build
   -b firefox`).
3. Feature-detect browser-specific APIs; branch UI (side panel vs sidebar) behind that detection.
4. **Test on both Chrome and Firefox before shipping** — load unpacked in Chrome
   (`chrome://extensions`), and `about:debugging` → "Load Temporary Add-on" in Firefox.
5. Maintain separate store listings: Chrome Web Store, Edge Add-ons, Firefox AMO (see
   `build-publish.md`).
