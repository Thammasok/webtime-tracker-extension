# Security & Store Review

Extensions run with elevated privilege on pages the user visits. A vulnerability here is worse than
a normal web app bug — it can read every page, exfiltrate cookies, and inject into banking sites.
Store reviewers reject on these grounds routinely, so security *is* the review.

## No remote code (hard MV3 rule)

MV3's default CSP for extension pages forbids:

- `eval`, `new Function`, `setTimeout("string")` — no string-to-code.
- Remotely-hosted scripts (`<script src="https://cdn...">` in extension pages).
- Inline event handlers / inline `<script>` in extension HTML.

Everything executable must ship inside the package and be reviewable. You may **fetch data**
(JSON, config) at runtime; you may **not fetch code**. Extensions that pull down and run remote
JS are rejected. If you need a WASM or JS library, bundle it.

The MV3 default is roughly:

```
script-src 'self'; object-src 'self';
```

You can tighten (add `connect-src` allowlists) but generally cannot loosen `script-src` to allow
remote/eval for the extension context. Sandboxed pages (`"sandbox"` manifest key) are the narrow
escape hatch and get extra scrutiny.

## Minimize permissions

Reviewers and users judge you by your permission list. For each permission, be ready to point at
the exact feature that needs it.

- Prefer `activeTab` over `host_permissions`.
- Prefer `optional_permissions` requested at runtime over install-time grants.
- Avoid `<all_urls>` unless the extension genuinely must run everywhere (blockers, etc.); expect
  heavier review if you use it.
- Avoid `tabs` when `activeTab` + `chrome.tabs.query` (limited) suffices.
- Every unused permission is a rejection risk and a bigger attack surface — remove them.

## Content-script hygiene (page is hostile)

- Never `innerHTML` untrusted/page-derived strings in your extension DOM — XSS into your privileged
  context. Use `textContent`, or sanitize with DOMPurify before `innerHTML`.
- Validate every `window.postMessage` from the page: check `event.source === window`,
  `event.origin`, and a namespaced message shape before acting.
- Prefer the `ISOLATED` world; only enter `MAIN` when required, and never `eval` page data there.
- Don't write secrets/tokens into the page DOM or MAIN world — the page and other extensions can
  read them.

## Validate message senders

Anything privileged triggered by a message must verify where the message came from — especially
`onMessageExternal`, which is reachable by whatever sites/extensions you allow.

```js
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const ALLOWED = new Set(['https://your-site.com']);
  if (!ALLOWED.has(new URL(sender.url ?? sender.origin).origin)) return; // drop
  // ...safe to handle
});
```

## Secrets & auth

- No hard-coded API secrets in the bundle — anyone can unzip a `.crx`/`.xpi` and read them. Treat
  the shipped code as public. Use a backend proxy for anything that needs a real secret.
- Hold OAuth tokens in `chrome.storage.session` (memory-only), not `local`/`sync`.
- `chrome.storage` is unencrypted — don't persist long-lived credentials there.

## Network safety

- Scope `host_permissions` to the exact origins you call; don't request `<all_urls>` for a single
  API host.
- Set an explicit `connect-src` in CSP to the endpoints you actually contact.
- Beware SSRF-style patterns where a page/content script can influence a URL the privileged worker
  then fetches — validate and allowlist.

## Privacy & disclosure (store requirement)

- Both Chrome Web Store and AMO require a **privacy policy** and truthful data-use disclosure if you
  collect or transmit user data. Undisclosed data collection is a takedown reason.
- Request the **single purpose** narrowly and describe it accurately in the listing — Chrome's
  "single purpose" policy rejects grab-bag extensions.
- Don't include analytics/telemetry that isn't disclosed.

## Pre-submission security checklist

- [ ] `manifest_version: 3`, no remote scripts, no `eval`/`new Function`.
- [ ] Permissions minimized; every one maps to a real feature; `activeTab`/optional where possible.
- [ ] `host_permissions` scoped to exact origins; no gratuitous `<all_urls>`.
- [ ] All page-derived DOM writes sanitized; no `innerHTML` of untrusted data.
- [ ] `postMessage` and `onMessageExternal` senders validated.
- [ ] No secrets in the bundle; tokens in `session` storage.
- [ ] `web_accessible_resources` limited to what pages truly need.
- [ ] Privacy policy present; data use disclosed; single purpose stated clearly.
