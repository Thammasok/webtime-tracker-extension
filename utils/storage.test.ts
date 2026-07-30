import { describe, expect, it } from 'vitest';
import {
  addUsageSeconds,
  clearAllData,
  deleteRule,
  exportData,
  getRules,
  getSettings,
  getUsage,
  getUsageForDate,
  importData,
  pruneOldDays,
  updateSettings,
  upsertRule,
} from '@/utils/storage';

describe('addUsageSeconds', () => {
  it('accumulates across multiple calls the same day', async () => {
    await addUsageSeconds('example.com', 30, '2026-07-30');
    await addUsageSeconds('example.com', 12, '2026-07-30');
    expect(await getUsageForDate('2026-07-30')).toEqual({ 'example.com': 42 });
  });

  it('creates a new bucket on day rollover instead of merging into an existing day', async () => {
    await addUsageSeconds('example.com', 30, '2026-07-30');
    await addUsageSeconds('example.com', 10, '2026-07-31');
    expect(await getUsageForDate('2026-07-30')).toEqual({ 'example.com': 30 });
    expect(await getUsageForDate('2026-07-31')).toEqual({ 'example.com': 10 });
  });

  it('tracks multiple domains independently within the same day', async () => {
    await addUsageSeconds('a.com', 5, '2026-07-30');
    await addUsageSeconds('b.com', 7, '2026-07-30');
    expect(await getUsageForDate('2026-07-30')).toEqual({ 'a.com': 5, 'b.com': 7 });
  });

  it('ignores non-positive durations', async () => {
    await addUsageSeconds('example.com', 0, '2026-07-30');
    await addUsageSeconds('example.com', -5, '2026-07-30');
    expect(await getUsageForDate('2026-07-30')).toEqual({});
  });
});

describe('pruneOldDays', () => {
  it('removes only days beyond retention, relative to a fixed clock', async () => {
    const now = new Date('2026-07-30T12:00:00');
    await addUsageSeconds('example.com', 10, '2026-07-30'); // today
    await addUsageSeconds('example.com', 10, '2026-05-01'); // 90 days ago
    await addUsageSeconds('example.com', 10, '2026-01-01'); // way beyond retention

    await pruneOldDays(90, now);

    const usage = await getUsage();
    expect(Object.keys(usage.days).sort()).toEqual(['2026-05-01', '2026-07-30']);
  });

  it('keeps everything forever when retentionDays is 0', async () => {
    const now = new Date('2026-07-30T12:00:00');
    await addUsageSeconds('example.com', 10, '2020-01-01');
    await pruneOldDays(0, now);
    expect(await getUsageForDate('2020-01-01')).toEqual({ 'example.com': 10 });
  });
});

describe('rules', () => {
  it('upsertRule creates then updates the same rule by id', async () => {
    const created = await upsertRule({ domain: 'reddit.com', mode: 'always', enabled: true });
    expect(await getRules()).toHaveLength(1);

    await upsertRule({ ...created, enabled: false });
    const rules = await getRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].enabled).toBe(false);
  });

  it('deleteRule removes only the targeted rule', async () => {
    const a = await upsertRule({ domain: 'a.com', mode: 'always', enabled: true });
    await upsertRule({ domain: 'b.com', mode: 'always', enabled: true });

    await deleteRule(a.id);

    const rules = await getRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].domain).toBe('b.com');
  });
});

describe('settings', () => {
  it('returns defaults when nothing has been saved', async () => {
    const settings = await getSettings();
    expect(settings.retentionDays).toBe(90);
    expect(settings.pauseInIncognito).toBe(true);
    expect(settings.excludedDomains).toEqual([]);
  });

  it('updateSettings merges onto existing settings', async () => {
    await updateSettings({ retentionDays: 30 });
    const settings = await updateSettings({ excludedDomains: ['bank.com'] });
    expect(settings.retentionDays).toBe(30);
    expect(settings.excludedDomains).toEqual(['bank.com']);
  });
});

describe('clearAllData / export / import', () => {
  it('clearAllData resets usage, rules, and settings', async () => {
    await addUsageSeconds('example.com', 10, '2026-07-30');
    await upsertRule({ domain: 'example.com', mode: 'always', enabled: true });
    await updateSettings({ retentionDays: 30 });

    await clearAllData();

    expect(await getUsage()).toEqual({ version: 1, days: {} });
    expect(await getRules()).toEqual([]);
    expect((await getSettings()).retentionDays).toBe(90);
  });

  it('round-trips through exportData/importData', async () => {
    await addUsageSeconds('example.com', 10, '2026-07-30');
    await upsertRule({ domain: 'example.com', mode: 'always', enabled: true });

    const exported = await exportData();
    await clearAllData();
    await importData(exported);

    expect(await getUsageForDate('2026-07-30')).toEqual({ 'example.com': 10 });
    expect((await getRules())[0].domain).toBe('example.com');
  });

  it('importData rejects an unsupported version', async () => {
    const exported = await exportData();
    await expect(
      importData({ ...exported, usage: { ...exported.usage, version: 2 as 1 } }),
    ).rejects.toThrow();
  });
});
