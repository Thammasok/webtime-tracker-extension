import { domainFromUrl } from '@/utils/domain';
import { todayISODate } from '@/utils/date';
import { addUsageSeconds } from '@/utils/storage';
import type { Domain, Settings } from '@/utils/types';

/** Persisted in `storage.session` (survives worker restart, cleared on browser close) — never
 * in a module-level variable, which would be lost the moment the service worker is killed. */
export interface ActiveSession {
  domain: Domain;
  startedAt: number; // epoch ms
}

const SESSION_KEY = 'activeSession';
export const MIN_IDLE_DETECTION_SECONDS = 15; // browser.idle.setDetectionInterval's floor

export async function getActiveSession(): Promise<ActiveSession | null> {
  const { [SESSION_KEY]: session } = await browser.storage.session.get(SESSION_KEY);
  return (session as ActiveSession | undefined) ?? null;
}

async function setActiveSession(session: ActiveSession | null): Promise<void> {
  await browser.storage.session.set({ [SESSION_KEY]: session });
}

/** Adds elapsed time to `domain`'s usage, splitting at local-midnight boundaries so a session
 * that spans a day rollover is credited to the correct date buckets. */
async function flushElapsed(domain: Domain, startedAt: number, endedAt: number): Promise<void> {
  let cursor = startedAt;
  while (cursor < endedAt) {
    const cursorDate = new Date(cursor);
    const nextMidnight = new Date(
      cursorDate.getFullYear(),
      cursorDate.getMonth(),
      cursorDate.getDate() + 1,
    ).getTime();
    const segmentEnd = Math.min(endedAt, nextMidnight);
    const seconds = Math.floor((segmentEnd - cursor) / 1000);
    if (seconds > 0) await addUsageSeconds(domain, seconds, todayISODate(cursorDate));
    cursor = segmentEnd;
  }
}

/**
 * Flushes the current session's elapsed time (if any), then starts a new session for `domain`
 * (or stops tracking entirely if `domain` is `null` — the browser lost focus, the user went
 * idle, or the active tab isn't trackable). This is the only way the active session should
 * change domain.
 */
export async function switchSession(domain: Domain | null, now: number = Date.now()): Promise<void> {
  const session = await getActiveSession();
  if (session && domain === session.domain) return; // no-op: already tracking this domain; don't
  // flush (that would leave `startedAt` stale in storage and double-count the same span on the
  // next flush) or restart (that would reset `startedAt` and lose the elapsed-so-far time).

  if (session) await flushElapsed(session.domain, session.startedAt, now);
  await setActiveSession(domain ? { domain, startedAt: now } : null);
}

/**
 * Flushes the current session's elapsed time so far, then immediately restarts it (same domain,
 * `startedAt` reset to `now`). Called on a periodic alarm so long uninterrupted sessions are
 * written to disk incrementally instead of only on the next tab/focus/idle transition — a crash
 * or forced worker kill loses at most one flush interval, not the whole session.
 */
export async function flushAndRestart(now: number = Date.now()): Promise<void> {
  const session = await getActiveSession();
  if (!session) return;
  await flushElapsed(session.domain, session.startedAt, now);
  await setActiveSession({ domain: session.domain, startedAt: now });
}

export interface TrackabilityInput {
  idleState: 'active' | 'idle' | 'locked';
  /** Whether the browser application itself currently has OS focus. */
  browserFocused: boolean;
  tab: { url?: string; incognito?: boolean } | undefined;
  settings: Settings;
}

/**
 * Pure decision function: given the current idle/focus/tab/settings state, what domain (if any)
 * should be accruing time right now? Kept separate from the `browser.*` querying in
 * `entrypoints/background.ts` so the tracking rules themselves are unit-testable without mocking
 * `browser.idle`/`browser.windows`/`browser.tabs`.
 */
export function resolveTrackableDomain({
  idleState,
  browserFocused,
  tab,
  settings,
}: TrackabilityInput): Domain | null {
  if (idleState !== 'active') return null;
  if (!browserFocused) return null;
  if (!tab?.url) return null;
  if (tab.incognito && settings.pauseInIncognito) return null;

  const domain = domainFromUrl(tab.url);
  if (!domain) return null;
  if (settings.excludedDomains.includes(domain)) return null;

  return domain;
}
