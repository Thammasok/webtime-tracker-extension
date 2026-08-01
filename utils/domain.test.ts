import { describe, expect, it } from 'vitest';
import { domainFromUrl, hostnameFromUrl, isSubdomainSpecific, normalizeDomainInput } from '@/utils/domain';

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

  it('preserves a specific subdomain instead of collapsing it to the eTLD+1', () => {
    expect(normalizeDomainInput('mail.google.com')).toBe('mail.google.com');
    expect(normalizeDomainInput('https://mail.google.com/inbox')).toBe('mail.google.com');
    // A www.-prefixed subdomain still reduces to the subdomain itself, not the bare eTLD+1.
    expect(normalizeDomainInput('www.mail.google.com')).toBe('mail.google.com');
  });
});

describe('hostnameFromUrl', () => {
  it('preserves the full lowercased hostname, unlike domainFromUrl', () => {
    expect(hostnameFromUrl('https://Mail.Google.com/inbox')).toBe('mail.google.com');
    expect(hostnameFromUrl('https://www.facebook.com/feed')).toBe('www.facebook.com');
  });

  it('ignores non-http(s) schemes and unparseable URLs', () => {
    expect(hostnameFromUrl('chrome://extensions')).toBeNull();
    expect(hostnameFromUrl('not a url')).toBeNull();
  });
});

describe('isSubdomainSpecific', () => {
  it('is false for a bare eTLD+1 and true for a specific subdomain', () => {
    expect(isSubdomainSpecific('google.com')).toBe(false);
    expect(isSubdomainSpecific('mail.google.com')).toBe(true);
  });
});
