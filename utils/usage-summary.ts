import { categoryFor, type Category } from '@/utils/category';
import type { DailyUsage, Domain, ISODate, UsageStore } from '@/utils/types';

export function totalSeconds(day: DailyUsage): number {
  return Object.values(day).reduce((sum, seconds) => sum + seconds, 0);
}

/** Domains sorted by time spent, descending. */
export function topDomains(day: DailyUsage, limit = Infinity): [Domain, number][] {
  return Object.entries(day)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

/** Each date's total across all domains, in the same order as `dates`. */
export function dailyTotals(usage: UsageStore, dates: ISODate[]): number[] {
  return dates.map((date) => totalSeconds(usage.days[date] ?? {}));
}

/** Sums per-domain totals across a range of dates into one combined day. */
export function aggregateRange(usage: UsageStore, dates: ISODate[]): DailyUsage {
  const combined: DailyUsage = {};
  for (const date of dates) {
    const day = usage.days[date] ?? {};
    for (const [domain, seconds] of Object.entries(day)) {
      combined[domain] = (combined[domain] ?? 0) + seconds;
    }
  }
  return combined;
}

const CATEGORY_ORDER: Category[] = ['Social', 'Work', 'News', 'Other'];

export function categoryTotals(day: DailyUsage): Record<Category, number> {
  const totals: Record<Category, number> = { Social: 0, Work: 0, News: 0, Other: 0 };
  for (const [domain, seconds] of Object.entries(day)) {
    totals[categoryFor(domain)] += seconds;
  }
  return totals;
}

/** Per-day category breakdown, in the same order as `dates` — used for a stacked bar chart. */
export function categoryTotalsByDay(usage: UsageStore, dates: ISODate[]): Record<Category, number>[] {
  return dates.map((date) => categoryTotals(usage.days[date] ?? {}));
}

export { CATEGORY_ORDER };
