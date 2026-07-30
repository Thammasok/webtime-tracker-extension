import { describe, expect, it } from 'vitest';
import { aggregateRange, categoryTotals, dailyTotals, topDomains, totalSeconds } from '@/utils/usage-summary';

describe('totalSeconds', () => {
  it('sums all domains for a day', () => {
    expect(totalSeconds({ 'a.com': 30, 'b.com': 12 })).toBe(42);
  });

  it('is 0 for an empty day', () => {
    expect(totalSeconds({})).toBe(0);
  });
});

describe('topDomains', () => {
  it('sorts descending by time and respects the limit', () => {
    const day = { 'a.com': 10, 'b.com': 30, 'c.com': 20 };
    expect(topDomains(day)).toEqual([
      ['b.com', 30],
      ['c.com', 20],
      ['a.com', 10],
    ]);
    expect(topDomains(day, 2)).toEqual([
      ['b.com', 30],
      ['c.com', 20],
    ]);
  });
});

describe('dailyTotals', () => {
  it('returns one total per date, in the given order, 0 for missing days', () => {
    const usage = {
      version: 1 as const,
      days: {
        '2026-07-29': { 'a.com': 100 },
        '2026-07-30': { 'a.com': 40, 'b.com': 10 },
      },
    };
    expect(dailyTotals(usage, ['2026-07-28', '2026-07-29', '2026-07-30'])).toEqual([0, 100, 50]);
  });
});

describe('aggregateRange', () => {
  it('sums per-domain totals across the given dates', () => {
    const usage = {
      version: 1 as const,
      days: {
        '2026-07-29': { 'a.com': 100, 'b.com': 5 },
        '2026-07-30': { 'a.com': 40 },
      },
    };
    expect(aggregateRange(usage, ['2026-07-29', '2026-07-30'])).toEqual({ 'a.com': 140, 'b.com': 5 });
  });
});

describe('categoryTotals', () => {
  it('buckets known domains and falls back to Other', () => {
    const day = { 'github.com': 100, 'reddit.com': 50, 'some-random-blog.example': 10 };
    expect(categoryTotals(day)).toEqual({ Social: 50, Work: 100, News: 0, Other: 10 });
  });
});
