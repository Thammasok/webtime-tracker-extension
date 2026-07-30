import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    ...(browser === 'firefox'
      ? { browser_specific_settings: { gecko: { id: 'webtime-tracker@local.extension' } } }
      : {}),
    name: 'Webtime Tracker',
    description: 'Track time spent per website and block distracting sites, entirely on-device.',
    permissions: [
      'storage', // local usage/rule data
      'tabs', // read active tab URL/title for attribution
      'idle', // pause tracking when the user is away
      'alarms', // periodic flush + schedule/limit re-evaluation
      'declarativeNetRequest', // blocking/redirect (Chrome/Edge)
      'unlimitedStorage', // history can grow; lifts storage.local quota
      // Firefox's declarativeNetRequest redirect support has historically had gaps, so Firefox
      // enforces blocks via webNavigation + tabs.update instead (see utils/blocker.ts).
      ...(browser === 'firefox' ? (['webNavigation'] as const) : []),
    ],
    // Blocking is user-driven and can apply to any site the user chooses to block, so <all_urls>
    // is genuinely needed. This is the #1 slow-review flag for store submission — justify it in
    // the store listing's permission-justification text before publishing.
    host_permissions: ['<all_urls>'],
    web_accessible_resources: [{ resources: ['blocked.html'], matches: ['<all_urls>'] }],
  }),
});
