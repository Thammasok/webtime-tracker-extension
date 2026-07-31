import { describe, expect, it } from 'vitest';
import { isBlockedNow, ruleToDnrRule } from '@/utils/blocker';
import type { BlockRule } from '@/utils/types';

function rule(overrides: Partial<BlockRule>): BlockRule {
  return { id: 'r1', domain: 'example.com', mode: 'always', enabled: true, ...overrides };
}

describe('isBlockedNow', () => {
  it('a disabled rule never blocks, regardless of mode', () => {
    expect(isBlockedNow(rule({ mode: 'always', enabled: false }), 0, new Date())).toBe(false);
  });

  it('"always" mode blocks unconditionally', () => {
    expect(isBlockedNow(rule({ mode: 'always' }), 0, new Date('2026-07-30T03:00:00'))).toBe(true);
  });

  it('"redirect" mode blocks unconditionally, same as "always"', () => {
    expect(isBlockedNow(rule({ mode: 'redirect', redirectUrl: 'https://x.com' }), 0, new Date())).toBe(true);
  });

  describe('"schedule" mode', () => {
    it('blocks inside a same-day window and not outside it', () => {
      const scheduled = rule({
        mode: 'schedule',
        windows: [{ days: [4], start: '09:00', end: '17:00' }], // Thursday
      });
      // 2026-07-30 is a Thursday.
      expect(isBlockedNow(scheduled, 0, new Date('2026-07-30T12:00:00'))).toBe(true);
      expect(isBlockedNow(scheduled, 0, new Date('2026-07-30T08:00:00'))).toBe(false);
      expect(isBlockedNow(scheduled, 0, new Date('2026-07-30T17:00:00'))).toBe(false); // end exclusive
    });

    it('does not block on days not listed', () => {
      const scheduled = rule({ mode: 'schedule', windows: [{ days: [4], start: '09:00', end: '17:00' }] });
      // 2026-07-31 is a Friday.
      expect(isBlockedNow(scheduled, 0, new Date('2026-07-31T12:00:00'))).toBe(false);
    });

    it('handles an overnight window that wraps past midnight', () => {
      const overnight = rule({
        mode: 'schedule',
        windows: [{ days: [4], start: '22:00', end: '06:00' }], // Thursday night
      });
      expect(isBlockedNow(overnight, 0, new Date('2026-07-30T23:00:00'))).toBe(true); // Thu 23:00
      expect(isBlockedNow(overnight, 0, new Date('2026-07-31T04:00:00'))).toBe(true); // Fri 04:00, spillover
      expect(isBlockedNow(overnight, 0, new Date('2026-07-31T12:00:00'))).toBe(false); // Fri noon
      expect(isBlockedNow(overnight, 0, new Date('2026-07-30T12:00:00'))).toBe(false); // Thu noon
    });

    it('blocks once the daily limit is reached, even outside any window', () => {
      const limited = rule({ mode: 'schedule', dailyLimitSeconds: 600 });
      expect(isBlockedNow(limited, 599, new Date('2026-07-30T12:00:00'))).toBe(false);
      expect(isBlockedNow(limited, 600, new Date('2026-07-30T12:00:00'))).toBe(true);
      expect(isBlockedNow(limited, 900, new Date('2026-07-30T12:00:00'))).toBe(true);
    });

    it('blocks when EITHER the window or the daily limit condition is true', () => {
      const both = rule({
        mode: 'schedule',
        windows: [{ days: [4], start: '09:00', end: '17:00' }],
        dailyLimitSeconds: 600,
      });
      // Outside the window but over the limit.
      expect(isBlockedNow(both, 900, new Date('2026-07-30T20:00:00'))).toBe(true);
      // Inside the window but under the limit.
      expect(isBlockedNow(both, 0, new Date('2026-07-30T12:00:00'))).toBe(true);
      // Neither condition true.
      expect(isBlockedNow(both, 0, new Date('2026-07-30T20:00:00'))).toBe(false);
    });

    it('a zero-length window (start === end) never blocks by itself', () => {
      const degenerate = rule({ mode: 'schedule', windows: [{ days: [0, 1, 2, 3, 4, 5, 6], start: '09:00', end: '09:00' }] });
      expect(isBlockedNow(degenerate, 0, new Date('2026-07-30T09:00:00'))).toBe(false);
    });
  });
});

describe('ruleToDnrRule', () => {
  // Regression: requestDomains looked like the natural fit for "block this domain and its
  // subdomains", but on Edge it only matched the bare domain — a rule for 'facebook.com' left
  // 'www.facebook.com' unblocked. '||domain^' is the adblock-style domain anchor and reliably
  // matches the domain plus every subdomain.
  it('uses a domain-anchored urlFilter, not requestDomains, so subdomains are covered', () => {
    const dnrRule = ruleToDnrRule(rule({ domain: 'facebook.com' }));
    expect(dnrRule.condition.urlFilter).toBe('||facebook.com^');
    expect(dnrRule.condition.requestDomains).toBeUndefined();
  });
});
