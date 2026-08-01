import { describe, expect, it } from 'vitest';
import { flushAndRestart, getActiveSession, resolveTrackableDomain, switchSession } from '@/utils/tracker';
import { getUsageForDate } from '@/utils/storage';
import { DEFAULT_SETTINGS } from '@/utils/types';

const T = (iso: string) => new Date(iso).getTime();

describe('switchSession', () => {
  it('starts a session with no prior flush', async () => {
    await switchSession('youtube.com', T('2026-07-30T10:00:00'));
    expect(await getActiveSession()).toEqual({ domain: 'youtube.com', startedAt: T('2026-07-30T10:00:00') });
  });

  it('flushes the previous domain and starts the new one on switch', async () => {
    await switchSession('youtube.com', T('2026-07-30T10:00:00'));
    await switchSession('github.com', T('2026-07-30T10:00:30')); // 30s later

    expect(await getUsageForDate('2026-07-30')).toEqual({ 'youtube.com': 30 });
    expect(await getActiveSession()).toEqual({ domain: 'github.com', startedAt: T('2026-07-30T10:00:30') });
  });

  it('is a no-op when switching to the domain already active (no double-count risk)', async () => {
    await switchSession('youtube.com', T('2026-07-30T10:00:00'));
    await switchSession('youtube.com', T('2026-07-30T10:00:30'));

    // startedAt must NOT have been reset, or the elapsed 30s would never get flushed.
    expect(await getActiveSession()).toEqual({ domain: 'youtube.com', startedAt: T('2026-07-30T10:00:00') });
    expect(await getUsageForDate('2026-07-30')).toEqual({});
  });

  it('flushes and clears the session when switching to null (blur/idle/untrackable)', async () => {
    await switchSession('youtube.com', T('2026-07-30T10:00:00'));
    await switchSession(null, T('2026-07-30T10:00:20'));

    expect(await getActiveSession()).toBeNull();
    expect(await getUsageForDate('2026-07-30')).toEqual({ 'youtube.com': 20 });
  });

  it('splits elapsed time across a local-midnight boundary', async () => {
    await switchSession('youtube.com', T('2026-07-30T23:59:50')); // 10s before midnight
    await switchSession(null, T('2026-07-31T00:00:20')); // 20s after midnight

    expect(await getUsageForDate('2026-07-30')).toEqual({ 'youtube.com': 10 });
    expect(await getUsageForDate('2026-07-31')).toEqual({ 'youtube.com': 20 });
  });
});

describe('flushAndRestart', () => {
  it('flushes elapsed time so far and keeps tracking the same domain', async () => {
    await switchSession('youtube.com', T('2026-07-30T10:00:00'));
    await flushAndRestart(T('2026-07-30T10:01:00')); // periodic 1-minute alarm

    expect(await getUsageForDate('2026-07-30')).toEqual({ 'youtube.com': 60 });
    expect(await getActiveSession()).toEqual({ domain: 'youtube.com', startedAt: T('2026-07-30T10:01:00') });

    await flushAndRestart(T('2026-07-30T10:02:00')); // next tick shouldn't double-count
    expect(await getUsageForDate('2026-07-30')).toEqual({ 'youtube.com': 120 });
  });

  it('is a no-op when nothing is being tracked', async () => {
    await flushAndRestart(T('2026-07-30T10:00:00'));
    expect(await getActiveSession()).toBeNull();
  });
});

describe('resolveTrackableDomain', () => {
  const base = {
    idleState: 'active' as const,
    browserFocused: true,
    tab: { url: 'https://www.youtube.com/watch' },
    settings: DEFAULT_SETTINGS,
  };

  it('tracks a normal foreground http(s) tab', () => {
    expect(resolveTrackableDomain(base)).toBe('youtube.com');
  });

  it('pauses when idle or the OS session is locked', () => {
    expect(resolveTrackableDomain({ ...base, idleState: 'idle' })).toBeNull();
    expect(resolveTrackableDomain({ ...base, idleState: 'locked' })).toBeNull();
  });

  it('pauses when the browser window is unfocused', () => {
    expect(resolveTrackableDomain({ ...base, browserFocused: false })).toBeNull();
  });

  it('ignores non-http(s) tabs (chrome://, about:, etc.)', () => {
    expect(resolveTrackableDomain({ ...base, tab: { url: 'chrome://extensions' } })).toBeNull();
    expect(resolveTrackableDomain({ ...base, tab: undefined })).toBeNull();
  });

  it('pauses incognito tabs when pauseInIncognito is on (the default)', () => {
    expect(resolveTrackableDomain({ ...base, tab: { ...base.tab, incognito: true } })).toBeNull();
  });

  it('tracks incognito tabs when pauseInIncognito is explicitly off', () => {
    const settings = { ...DEFAULT_SETTINGS, pauseInIncognito: false };
    expect(resolveTrackableDomain({ ...base, tab: { ...base.tab, incognito: true }, settings })).toBe(
      'youtube.com',
    );
  });

  it('skips domains the user excluded', () => {
    const settings = { ...DEFAULT_SETTINGS, excludedDomains: ['youtube.com'] };
    expect(resolveTrackableDomain({ ...base, settings })).toBeNull();
  });

  it('collapses a www. prefix into the bare domain', () => {
    expect(resolveTrackableDomain({ ...base, tab: { url: 'https://www.youtube.com/watch' } })).toBe('youtube.com');
    expect(resolveTrackableDomain({ ...base, tab: { url: 'https://youtube.com/watch' } })).toBe('youtube.com');
  });

  it('tracks a subdomain distinctly from its eTLD+1, with no rule required', () => {
    expect(resolveTrackableDomain({ ...base, tab: { url: 'https://mail.google.com/inbox' } })).toBe(
      'mail.google.com',
    );
    expect(resolveTrackableDomain({ ...base, tab: { url: 'https://docs.google.com/doc' } })).toBe('docs.google.com');
  });

  it('excluding the eTLD+1 excludes all its subdomains', () => {
    const settings = { ...DEFAULT_SETTINGS, excludedDomains: ['google.com'] };
    expect(resolveTrackableDomain({ ...base, tab: { url: 'https://mail.google.com/inbox' }, settings })).toBeNull();
  });

  it('excluding one specific subdomain does not exclude the rest of the site', () => {
    const settings = { ...DEFAULT_SETTINGS, excludedDomains: ['mail.google.com'] };
    expect(resolveTrackableDomain({ ...base, tab: { url: 'https://mail.google.com/inbox' }, settings })).toBeNull();
    expect(resolveTrackableDomain({ ...base, tab: { url: 'https://docs.google.com/doc' }, settings })).toBe(
      'docs.google.com',
    );
  });
});
