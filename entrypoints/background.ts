import {
  MIN_IDLE_DETECTION_SECONDS,
  flushAndRestart,
  resolveTrackableDomain,
  switchSession,
} from '@/utils/tracker';
import { resolveBlockedRedirect, syncBlockRules } from '@/utils/blocker';
import { getSettings, pruneOldDays } from '@/utils/storage';
import type { Message } from '@/utils/messaging';

const FLUSH_ALARM = 'webtime:flush';
const PRUNE_ALARM = 'webtime:prune';

/**
 * Re-derives "what should be tracked right now" from live `browser.*` state on every call,
 * rather than caching focus/idle state in a module variable — the service worker can be killed
 * and restarted between any two events, so anything cached in memory would go stale or vanish.
 */
async function retrack(): Promise<void> {
  const settings = await getSettings();

  const idleState = await browser.idle.queryState(
    Math.max(MIN_IDLE_DETECTION_SECONDS, settings.idleThresholdSeconds),
  );

  const focusedWindow = await browser.windows.getLastFocused({ populate: false }).catch(() => null);
  const browserFocused = !!focusedWindow?.focused;

  let tab: { url?: string; incognito?: boolean } | undefined;
  if (browserFocused && focusedWindow?.id != null) {
    const [activeTab] = await browser.tabs.query({ active: true, windowId: focusedWindow.id });
    tab = activeTab;
  }

  const domain = resolveTrackableDomain({ idleState, browserFocused, tab, settings });
  await switchSession(domain);

  // Cheap to call unconditionally: syncBlockRules() diffs against the existing DNR ruleset and
  // no-ops on Firefox, so this just keeps daily-limit blocks responsive right after the usage
  // flush that switchSession() may have just performed.
  await syncBlockRules();
}

export default defineBackground(() => {
  // All listeners are registered synchronously, at the top level, on every service-worker
  // startup — never inside the async init() below. A listener added after an `await` would be
  // missed if this exact event is what woke the worker.
  browser.tabs.onActivated.addListener(() => {
    retrack();
  });
  browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === 'complete') retrack();
  });
  browser.windows.onFocusChanged.addListener(() => {
    retrack();
  });
  browser.idle.onStateChanged.addListener(() => {
    retrack();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === FLUSH_ALARM) {
      flushAndRestart().then(() => syncBlockRules());
    } else if (alarm.name === PRUNE_ALARM) {
      getSettings().then((settings) => pruneOldDays(settings.retentionDays));
    }
  });

  browser.runtime.onMessage.addListener((message: Message) => {
    if (message?.type === 'SYNC_RULES') {
      syncBlockRules();
    }
  });

  // Firefox-only: declarativeNetRequest redirect support has historically had gaps there, so
  // blocking is enforced by intercepting navigation directly instead (see
  // utils/blocker.ts#resolveBlockedRedirect). Chrome/Edge rely on DNR exclusively.
  if (import.meta.env.FIREFOX) {
    browser.webNavigation.onBeforeNavigate.addListener((details) => {
      if (details.frameId !== 0) return; // only ever redirect top-level (main_frame) navigations
      resolveBlockedRedirect(details.url).then((redirectUrl) => {
        console.log('[background] Firefox block check - URL:', details.url, '-> redirect:', redirectUrl);
        if (redirectUrl) browser.tabs.update(details.tabId, { url: redirectUrl });
      });
    });
  }

  // Runs every time this script executes — extension install, browser startup, or the service
  // worker being woken back up after an idle-timeout kill. onInstalled/onStartup alone would
  // miss that last case, so init() is called unconditionally rather than from those events.
  async function init(): Promise<void> {
    browser.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
    browser.alarms.create(PRUNE_ALARM, { periodInMinutes: 60 * 24 });
    await retrack();
  }

  init();
});
