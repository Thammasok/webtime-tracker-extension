# Styling with Tailwind CSS

Tailwind is the recommended way to style extension UIs — popup, options, side panel, and injected
content-script UI. Two facts make it a good fit for MV3, and one gotcha will bite you if ignored.

## Why Tailwind is MV3-safe

Tailwind runs at **build time** and emits a **static `.css` file**. There is no runtime, no
in-browser JIT, no `eval`, and no remotely-hosted stylesheet. That means it satisfies MV3's CSP
with no changes — you never need to load the Tailwind CDN script (which *would* violate CSP and is
a store-rejection risk). **Never** use the Play CDN (`<script src="cdn.tailwindcss.com">`) in an
extension; always compile.

## The one gotcha: Preflight leaks into host pages

Tailwind's **Preflight** (its base reset — `margin: 0`, `box-sizing: border-box`, unstyled
headings/lists, etc.) is global. In a popup or options page (their own document) that's fine. But
when a **content script injects UI into a web page**, a normally-compiled Tailwind stylesheet
dumps Preflight onto the *host page* and wrecks its layout.

**Solution: render injected UI inside a Shadow DOM and scope the CSS to it.** The shadow boundary
stops Tailwind's styles from leaking out and the page's styles from leaking in. See
`content-scripts.md` for the Shadow DOM basics.

## Setup by build tool

Use Tailwind **v4** (current) unless a project is pinned to v3. v4 is configured in CSS via
`@import "tailwindcss"` and the `@tailwindcss/vite` plugin — no `tailwind.config.js` required, and
it auto-detects source files. v3 uses `tailwind.config.js` + PostCSS and a manual `content` array.

### WXT (recommended)

```bash
npm i -D tailwindcss @tailwindcss/vite
```

```ts
// wxt.config.ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  vite: () => ({ plugins: [tailwindcss()] }),
});
```

```css
/* entrypoints/popup/style.css (and any other UI entrypoint) */
@import "tailwindcss";
```

Import that CSS from each UI entrypoint (popup, options, side panel). WXT bundles it per entrypoint.

### CRXJS + Vite

```bash
npm i -D tailwindcss @tailwindcss/vite
```

```ts
// vite.config.ts
import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import manifest from './manifest.json';
export default { plugins: [crx({ manifest }), tailwindcss()] };
```

```css
/* src/style.css */
@import "tailwindcss";
```

### Tailwind v3 (if pinned)

```js
// tailwind.config.js — content MUST cover every file that uses classes
module.exports = {
  content: [
    './popup/**/*.{html,ts,tsx}',
    './options/**/*.{html,ts,tsx}',
    './content/**/*.{ts,tsx}',   // don't forget content-script UI, or its classes get purged
  ],
  theme: { extend: {} },
};
```

```css
@tailwind base; @tailwind components; @tailwind utilities;
```

**Purge/content pitfall:** classes only appear in the output if the file that uses them is scanned.
In v3 that means listing content-script files in `content`; in v4 auto-detection usually covers
them, but add `@source "../content/..."` if some UI's classes come out missing.

## Popup / options / side panel (own document)

These have their own HTML document — link the compiled CSS and use Tailwind normally. No leakage
concern. Give the popup an explicit width/height so it doesn't collapse:

```html
<body class="w-80 p-4 text-sm bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
```

Popups don't auto-size well — set a fixed `w-*` (e.g. `w-80`/`w-96`) and let height grow.

## Injected content-script UI (Shadow DOM + scoped Tailwind)

Compile the Tailwind CSS, then inject it **into the shadow root**, not the page. WXT's content-script
UI helper does this for you when you set CSS injection to the UI:

```ts
// WXT: bundle CSS into the injected UI (isolated), not the page's <head>
export default defineContentScript({
  matches: ['https://example.com/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'my-ext-ui',
      position: 'inline',
      onMount: (container) => {
        container.innerHTML = `<button class="px-3 py-1 rounded bg-blue-600 text-white">Go</button>`;
      },
    });
    ui.mount();
  },
});
```

Manual (any tool) — attach a shadow root and adopt the compiled stylesheet into it:

```ts
import cssText from './content.css?inline';   // Vite: import compiled CSS as a string

const host = document.createElement('div');
document.body.append(host);
const shadow = host.attachShadow({ mode: 'open' });

const sheet = new CSSStyleSheet();
sheet.replaceSync(cssText);
shadow.adoptedStyleSheets = [sheet];          // scoped to this shadow tree only

const root = document.createElement('div');
root.innerHTML = `<button class="px-3 py-1 rounded bg-blue-600 text-white">Go</button>`;
shadow.append(root);
```

Notes for injected UI:

- **`rem` units resolve against the *page's* root font-size**, which the host controls and may have
  changed. If sizing looks off, set an explicit `font-size` on `:host`/the shadow root, or prefer
  `px`-based utilities for injected UI.
- If you can't use a shadow root, the fallback is to **disable Preflight** and prefix every class so
  you don't clobber the page — far messier. Shadow DOM is the clean answer.
- Injecting a `<style>`/`<link>` directly into the *page* DOM is subject to the **host page's**
  `style-src` CSP (not your extension's) and may be blocked on strict sites; `adoptedStyleSheets`
  on a shadow root avoids that and keeps styles scoped.

## Dark mode & theming

- Use the `dark:` variant. For extension UIs, drive it from a stored setting rather than the OS so
  the user can override, then toggle a `class="dark"` on the root and persist via `chrome.storage`
  (see `storage-state.md`).
- In v4, customize tokens with `@theme { --color-brand: #4f46e5; }` in your CSS; in v3 use
  `theme.extend` in `tailwind.config.js`.

## With React (popup/options/side panel/injected)

Tailwind pairs naturally with React components rendered into any surface. For React conventions
(component structure, Server vs Client is N/A here — everything is client), accessibility, and
composition, defer to the `frontend-engineer` skill; this skill owns only the extension-specific
wiring above.
