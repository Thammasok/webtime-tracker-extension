import { describe, expect, it } from 'vitest';
import {
  isBlockedNow,
  matchesRuleDomain,
  ruleToDnrRule,
  usageForRuleDomain,
  visitsForRuleDomain,
} from '@/utils/blocker';
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
  // Edge has a bug where both '||domain^' urlFilter AND requestDomains fail to match subdomains
  // like 'www.facebook.com' when the rule targets 'facebook.com'. Use regexFilter as workaround.
  it('uses regexFilter to match domain and www subdomain only', () => {
    const dnrRule = ruleToDnrRule(rule({ domain: 'facebook.com' }));
    expect(dnrRule.condition.regexFilter).toBe('^https?://(www\\.)?facebook\\.com([:/?].*)?$');
    expect(dnrRule.condition.isUrlFilterCaseSensitive).toBe(false);
    expect(dnrRule.condition.urlFilter).toBeUndefined();
    expect(dnrRule.condition.requestDomains).toBeUndefined();
  });

  it('escapes special regex characters in domain', () => {
    const dnrRule = ruleToDnrRule(rule({ domain: 'example.co.uk' }));
    expect(dnrRule.condition.regexFilter).toBe('^https?://(www\\.)?example\\.co\\.uk([:/?].*)?$');
  });

  it('regex matches domain and www subdomain, but not other subdomains', () => {
    const dnrRule = ruleToDnrRule(rule({ domain: 'google.com' }));
    const pattern = new RegExp(dnrRule.condition.regexFilter!, 'i');

    // Should match - base domain and www only
    expect(pattern.test('https://google.com')).toBe(true);
    expect(pattern.test('https://google.com/')).toBe(true);
    expect(pattern.test('https://www.google.com')).toBe(true);
    expect(pattern.test('https://www.google.com/')).toBe(true);
    expect(pattern.test('https://www.google.com/search?q=test')).toBe(true);
    expect(pattern.test('https://google.com?foo=bar')).toBe(true);
    expect(pattern.test('http://google.com')).toBe(true);
    expect(pattern.test('https://google.com:443')).toBe(true);

    // Should NOT match - other subdomains
    expect(pattern.test('https://mail.google.com')).toBe(false);
    expect(pattern.test('https://console.google.com')).toBe(false);
    expect(pattern.test('https://docs.google.com')).toBe(false);

    // Should NOT match - different domains
    expect(pattern.test('https://google.com.evil.com')).toBe(false);
    expect(pattern.test('https://notgoogle.com')).toBe(false);
  });

  it('matches only the exact host for a subdomain-specific rule, not the bare domain or www', () => {
    const dnrRule = ruleToDnrRule(rule({ domain: 'mail.google.com' }));
    expect(dnrRule.condition.regexFilter).toBe('^https?://mail\\.google\\.com([:/?].*)?$');
    const pattern = new RegExp(dnrRule.condition.regexFilter!, 'i');

    expect(pattern.test('https://mail.google.com')).toBe(true);
    expect(pattern.test('https://mail.google.com/inbox')).toBe(true);

    expect(pattern.test('https://www.mail.google.com')).toBe(false);
    expect(pattern.test('https://google.com')).toBe(false);
    expect(pattern.test('https://www.google.com')).toBe(false);
    expect(pattern.test('https://console.google.com')).toBe(false);
  });
});

describe('matchesRuleDomain', () => {
  it('an eTLD+1 rule matches the bare domain and its www. subdomain, not other subdomains', () => {
    expect(matchesRuleDomain('google.com', 'google.com')).toBe(true);
    expect(matchesRuleDomain('www.google.com', 'google.com')).toBe(true);
    expect(matchesRuleDomain('mail.google.com', 'google.com')).toBe(false);
  });

  it('a subdomain-specific rule matches only that exact host', () => {
    expect(matchesRuleDomain('mail.google.com', 'mail.google.com')).toBe(true);
    expect(matchesRuleDomain('www.mail.google.com', 'mail.google.com')).toBe(false);
    expect(matchesRuleDomain('google.com', 'mail.google.com')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesRuleDomain('Mail.Google.com', 'mail.google.com')).toBe(true);
  });
});

describe('usageForRuleDomain', () => {
  it('sums every subdomain rolling up to a bare eTLD+1 rule', () => {
    const day = { 'google.com': 100, 'mail.google.com': 50, 'docs.google.com': 30, 'youtube.com': 999 };
    expect(usageForRuleDomain(day, 'google.com')).toBe(180);
  });

  it('reads only its own key for a subdomain-specific rule', () => {
    const day = { 'google.com': 100, 'mail.google.com': 50, 'docs.google.com': 30 };
    expect(usageForRuleDomain(day, 'mail.google.com')).toBe(50);
  });

  it('is 0 when the domain has no tracked usage today', () => {
    expect(usageForRuleDomain({}, 'google.com')).toBe(0);
    expect(usageForRuleDomain({}, 'mail.google.com')).toBe(0);
  });
});

describe('visitsForRuleDomain', () => {
  it('sums every subdomain rolling up to a bare eTLD+1 rule', () => {
    const day = { 'google.com': 2, 'mail.google.com': 3, 'docs.google.com': 1, 'youtube.com': 99 };
    expect(visitsForRuleDomain(day, 'google.com')).toBe(6);
  });

  it('reads only its own key for a subdomain-specific rule', () => {
    const day = { 'google.com': 2, 'mail.google.com': 3, 'docs.google.com': 1 };
    expect(visitsForRuleDomain(day, 'mail.google.com')).toBe(3);
  });

  it('is 0 when the domain has no tracked visits today', () => {
    expect(visitsForRuleDomain({}, 'google.com')).toBe(0);
    expect(visitsForRuleDomain({}, 'mail.google.com')).toBe(0);
  });
});
