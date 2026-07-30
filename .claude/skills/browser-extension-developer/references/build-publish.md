# Build Tooling & Publishing

## Pick a framework

For anything beyond a two-file toy, don't hand-roll the build — MV3 + cross-browser + HMR is a lot
of glue. Use a framework.

### WXT (recommended)

Next.js-style DX for extensions. Handles MV3, generates per-browser manifests, gives you HMR on
content scripts and the worker, TypeScript, and auto-imports the `browser.*` polyfill. Works with
vanilla JS, React, Vue, Svelte, Solid.

```bash
npx wxt@latest init my-extension
cd my-extension && npm i
npm run dev            # loads unpacked with hot reload (Chrome)
npm run dev -- -b firefox
npm run build          # production build
npm run build -- -b firefox
npm run zip            # produces a store-ready zip
```

WXT infers the manifest from file conventions (`entrypoints/background.ts`,
`entrypoints/popup/`, `entrypoints/content.ts`, etc.) and lets you override via `wxt.config.ts`.

### CRXJS + Vite (alternative)

A Vite plugin that reads your `manifest.json` and bundles entry points with HMR. Good if you want
Vite directly and to own the manifest by hand.

```bash
npm create vite@latest my-ext -- --template react-ts
npm i -D @crxjs/vite-plugin
```

```ts
// vite.config.ts
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
export default { plugins: [crx({ manifest })] };
```

### Raw (no bundler)

Fine for a tiny extension: plain `manifest.json` + a few `.js` files, load unpacked. You lose HMR,
TypeScript, npm deps, and cross-browser manifest generation — outgrow it quickly.

### Styling

For UI styling with Tailwind CSS (compiled at build time, MV3-safe) — including the Vite plugin
setup for WXT/CRXJS and the Shadow DOM scoping needed for injected content-script UI — see
`styling.md`.

## Load unpacked (dev)

- **Chrome/Edge:** `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick the
  build output dir. Click the reload icon after rebuilds (frameworks auto-reload).
- **Firefox:** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick the
  `manifest.json`. Temporary add-ons are removed on restart.

## Versioning

`version` in the manifest must be 1–4 dot-separated integers (`1.2.3`), monotonically increasing
per store upload. Keep it in sync with your package version; frameworks can inject it at build.

## Packaging

- **Chrome/Edge:** upload a **zip** of the build output (not a `.crx` — the store re-signs). The
  dashboard packs and signs.
- **Firefox:** upload a zip; AMO signs it into an `.xpi`. You can also sign via `web-ext sign` /
  the AMO API for self-distribution.

`web-ext` (Mozilla's CLI) is handy for both: `web-ext run` to launch, `web-ext lint` to catch
manifest/policy issues, `web-ext build` to zip.

```bash
npx web-ext lint       # run before every submission — catches common rejections
npx web-ext build
```

## Publishing

### Chrome Web Store

1. One-time $5 developer registration at the Developer Dashboard.
2. Create item → upload zip → fill listing (name, description, screenshots, category), icons
   (128px), and a **privacy policy URL** if you handle user data.
3. Declare permissions justification — reviewers ask why you need each.
4. Submit. Review ranges from hours to several days; broad permissions / `<all_urls>` /
   `declarativeNetRequest` at scale get slower, deeper review.

### Microsoft Edge Add-ons

Free registration; upload the same Chromium zip. Separate listing and review from Chrome.

### Firefox AMO (addons.mozilla.org)

1. Free account.
2. Upload zip → automated + sometimes manual review → AMO **signs** it (required to install in
   release Firefox).
3. Set `browser_specific_settings.gecko.id` for a stable ID. Source code may be requested if you
   ship minified/bundled code — be ready to provide a reproducible build.

## CI/CD tips

- Build per target (`chrome`, `firefox`, `edge`) in the pipeline; artifact each zip.
- Lint with `web-ext lint` as a gate.
- Automate store uploads with the **Chrome Web Store API** and **AMO API** (or the
  `chrome-webstore-upload`/`web-ext sign` tools) using CI secrets.
- Bump `version` from the git tag so store version and release match.

## Pre-ship checklist

- [ ] Builds cleanly for every target browser; loads unpacked in each.
- [ ] `web-ext lint` passes.
- [ ] Manifest `version` bumped and monotonic.
- [ ] Icons at all required sizes (16/48/128).
- [ ] Listing copy, screenshots, category, and privacy policy ready.
- [ ] Permission justifications written for reviewers.
- [ ] Security checklist in `security.md` complete.
