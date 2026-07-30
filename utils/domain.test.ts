import { describe, expect, it } from 'vitest';
import { domainFromUrl, normalizeDomainInput } from '@/utils/domain';

describe('domainFromUrl', () => {
  it('collapses subdomains to the eTLD+1', () => {
    expect(domainFromUrl('https://www.facebook.com/feed')).toBe('facebook.com');
    expect(domainFromUrl('https://m.facebook.com/feed')).toBe('facebook.com');
    expect(domainFromUrl('https://facebook.com')).toBe('facebook.com');
  });

  it('ignores non-http(s) schemes', () => {
    expect(domainFromUrl('chrome://extensions')).toBeNull();
    expect(domainFromUrl('about:blank')).toBeNull();
    expect(domainFromUrl('moz-extension://abc-123/popup.html')).toBeNull();
    expect(domainFromUrl('file:///Users/me/index.html')).toBeNull();
  });

  it('returns null for unparseable URLs', () => {
    expect(domainFromUrl('not a url')).toBeNull();
  });
});

describe('normalizeDomainInput', () => {
  it('normalizes a bare domain, a www-prefixed domain, and a full URL to the same eTLD+1', () => {
    expect(normalizeDomainInput('reddit.com')).toBe('reddit.com');
    expect(normalizeDomainInput('www.reddit.com')).toBe('reddit.com');
    expect(normalizeDomainInput('https://www.reddit.com/r/x')).toBe('reddit.com');
  });

  it('returns null for empty or unrecognizable input', () => {
    expect(normalizeDomainInput('')).toBeNull();
    expect(normalizeDomainInput('   ')).toBeNull();
    expect(normalizeDomainInput('not a domain')).toBeNull();
  });
});
