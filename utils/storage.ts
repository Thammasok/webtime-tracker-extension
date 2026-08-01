import { v4 as uuidv4 } from 'uuid';
import { todayISODate, daysAgo } from '@/utils/date';
import {
  DEFAULT_SETTINGS,
  type BlockRule,
  type DailyUsage,
  type DailyVisits,
  type Domain,
  type ExportedData,
  type ISODate,
  type Settings,
  type UsageStore,
  type VisitStore,
} from '@/utils/types';

/**
 * The only module that touches raw `browser.storage.local`. Every context (background, popup,
 * options) reads/writes usage, rules, and settings exclusively through these functions so there
 * is a single source of truth and a single place to handle schema migrations.
 */

const KEYS = {
  usage: 'usage',
  visits: 'visits',
  rules: 'rules',
  settings: 'settings',
} as const;

function emptyUsage(): UsageStore {
  return { version: 1, days: {} };
}

function emptyVisits(): VisitStore {
  return { version: 1, days: {} };
}

export async function getUsage(): Promise<UsageStore> {
  const { [KEYS.usage]: usage } = await browser.storage.local.get(KEYS.usage);
  return (usage as UsageStore | undefined) ?? emptyUsage();
}

export async function getUsageForDate(date: ISODate): Promise<DailyUsage> {
  const usage = await getUsage();
  return usage.days[date] ?? {};
}

/** Read-modify-write: accumulates `seconds` onto `domain`'s total for `date` (default: today). */
export async function addUsageSeconds(
  domain: Domain,
  seconds: number,
  date: ISODate = todayISODate(),
): Promise<void> {
  if (seconds <= 0) return;
  const usage = await getUsage();
  const day = usage.days[date] ?? {};
  day[domain] = (day[domain] ?? 0) + seconds;
  usage.days[date] = day;
  await browser.storage.local.set({ [KEYS.usage]: usage });
}

/** Removes usage days older than `retentionDays` (relative to `now`). `0` means keep forever. */
export async function pruneOldDays(retentionDays: number, now: Date = new Date()): Promise<void> {
  if (retentionDays <= 0) return;
  const usage = await getUsage();
  let changed = false;
  for (const date of Object.keys(usage.days)) {
    if (daysAgo(date, now) > retentionDays) {
      delete usage.days[date];
      changed = true;
    }
  }
  if (changed) await browser.storage.local.set({ [KEYS.usage]: usage });

  const visits = await getVisits();
  let visitsChanged = false;
  for (const date of Object.keys(visits.days)) {
    if (daysAgo(date, now) > retentionDays) {
      delete visits.days[date];
      visitsChanged = true;
    }
  }
  if (visitsChanged) await browser.storage.local.set({ [KEYS.visits]: visits });
}

export async function getVisits(): Promise<VisitStore> {
  const { [KEYS.visits]: visits } = await browser.storage.local.get(KEYS.visits);
  return (visits as VisitStore | undefined) ?? emptyVisits();
}

export async function getVisitsForDate(date: ISODate = todayISODate()): Promise<DailyVisits> {
  const visits = await getVisits();
  return visits.days[date] ?? {};
}

/** Read-modify-write: increments `domain`'s open count for `date` (default: today) by one. */
export async function incrementVisitCount(domain: Domain, date: ISODate = todayISODate()): Promise<void> {
  const visits = await getVisits();
  const day = visits.days[date] ?? {};
  day[domain] = (day[domain] ?? 0) + 1;
  visits.days[date] = day;
  await browser.storage.local.set({ [KEYS.visits]: visits });
}

export async function getRules(): Promise<BlockRule[]> {
  const { [KEYS.rules]: rules } = await browser.storage.local.get(KEYS.rules);
  return (rules as BlockRule[] | undefined) ?? [];
}

/** Creates a rule (when `id` is absent) or replaces the existing rule with that id. */
export async function upsertRule(rule: Omit<BlockRule, 'id'> & { id?: string }): Promise<BlockRule> {
  const rules = await getRules();
  const resolved: BlockRule = { ...rule, id: rule.id ?? uuidv4() };
  const index = rules.findIndex((r) => r.id === resolved.id);
  if (index === -1) rules.push(resolved);
  else rules[index] = resolved;
  await browser.storage.local.set({ [KEYS.rules]: rules });
  return resolved;
}

export async function deleteRule(id: string): Promise<void> {
  const rules = await getRules();
  await browser.storage.local.set({ [KEYS.rules]: rules.filter((r) => r.id !== id) });
}

export async function getSettings(): Promise<Settings> {
  const { [KEYS.settings]: settings } = await browser.storage.local.get(KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const settings = await getSettings();
  const next = { ...settings, ...patch };
  await browser.storage.local.set({ [KEYS.settings]: next });
  return next;
}

/** Deletes all usage history, rules, and settings, resetting to defaults. */
export async function clearAllData(): Promise<void> {
  await browser.storage.local.set({
    [KEYS.usage]: emptyUsage(),
    [KEYS.visits]: emptyVisits(),
    [KEYS.rules]: [],
    [KEYS.settings]: { ...DEFAULT_SETTINGS },
  });
}

export async function exportData(): Promise<ExportedData> {
  const [usage, visits, rules, settings] = await Promise.all([
    getUsage(),
    getVisits(),
    getRules(),
    getSettings(),
  ]);
  return { exportedAt: Date.now(), usage, visits, rules, settings };
}

/** Overwrites usage/rules/settings from a previously exported file. `visits` is optional so
 * exports made before visit-counting existed still import cleanly. */
export async function importData(data: ExportedData): Promise<void> {
  if (data.usage?.version !== 1 || data.settings?.version !== 1) {
    throw new Error('Unsupported export file version.');
  }
  await browser.storage.local.set({
    [KEYS.usage]: data.usage,
    [KEYS.visits]: data.visits?.version === 1 ? data.visits : emptyVisits(),
    [KEYS.rules]: data.rules ?? [],
    [KEYS.settings]: { ...DEFAULT_SETTINGS, ...data.settings },
  });
}
