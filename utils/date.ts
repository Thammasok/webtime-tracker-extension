import type { ISODate } from '@/utils/types';

function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today's date, in the user's local timezone, as 'YYYY-MM-DD'. */
export function todayISODate(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** The last `count` ISO dates ending today (inclusive), oldest first. */
export function lastNDates(count: number, now: Date = new Date()): ISODate[] {
  const dates: ISODate[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(toISODate(d));
  }
  return dates;
}

/** Whole days between an ISO date and `now` (0 = today). */
export function daysAgo(date: ISODate, now: Date = new Date()): number {
  const [y, m, d] = date.split('-').map(Number);
  const dateAtMidnight = new Date(y, m - 1, d);
  const nowAtMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((nowAtMidnight.getTime() - dateAtMidnight.getTime()) / 86_400_000);
}
