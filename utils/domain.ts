import { getDomain, getHostname } from 'tldts';
import type { Domain } from '@/utils/types';

const TRACKABLE_SCHEMES = new Set(['http:', 'https:']);

/**
 * Extracts the full lowercased hostname from a URL, e.g. `https://Mail.Google.com/inbox` ->
 * `mail.google.com`. Returns `null` for non-http(s) schemes (`chrome://`, `about:`,
 * `moz-extension://`, `file://`, ...) and unparseable URLs — those are never tracked or
 * blockable. Unlike `domainFromUrl`, subdomains are preserved (used for rule matching, where a
 * subdomain-specific rule must be distinguishable from its parent domain).
 */
export function hostnameFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!TRACKABLE_SCHEMES.has(parsed.protocol)) return null;
  return parsed.hostname.toLowerCase();
}

/**
 * Extracts the eTLD+1 (registrable domain) from a URL, e.g. `www.facebook.com` and
 * `m.facebook.com` both normalize to `facebook.com`. Usage is tracked per exact subdomain (see
 * `hostnameFromUrl`) — this is used to roll subdomain-level usage back up to the site level, e.g.
 * for a bare-domain rule's daily limit (`utils/blocker.ts#usageForRuleDomain`) or the
 * excluded-sites check (excluding the eTLD+1 excludes all its subdomains).
 */
export function domainFromUrl(url: string): Domain | null {
  const hostname = hostnameFromUrl(url);
  return hostname ? etld1(hostname) : null;
}

/** eTLD+1 of a raw hostname (not a URL), e.g. `mail.google.com` -> `google.com`. */
export function etld1(hostname: string): Domain | null {
  return getDomain(hostname) ?? null;
}

/** True if `domain` is a specific subdomain (e.g. `mail.google.com`) rather than a bare eTLD+1
 * (e.g. `google.com`). A subdomain-specific rule matches only that exact host, with no `www.`
 * expansion. `utils/tracker.ts` tracks usage under the subdomain itself (instead of its eTLD+1)
 * whenever a rule targets it, so daily-usage limits work at this granularity too. */
export function isSubdomainSpecific(domain: Domain): boolean {
  return getDomain(domain) !== domain;
}

/**
 * Normalizes free-typed input (a bare domain, `www.`-prefixed domain, or full URL) from the
 * "add a rule" form. A plain domain or its `www.` variant normalizes to the eTLD+1 (blocks bare +
 * www by default); anything with an additional subdomain label (e.g. `mail.google.com`,
 * `www.mail.google.com`) is preserved as that exact host, so the caller can create a
 * subdomain-specific rule. Returns `null` if the input isn't a recognizable domain.
 */
export function normalizeDomainInput(input: string): Domain | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hostname = getHostname(trimmed);
  const etld1 = getDomain(trimmed);
  if (!hostname || !etld1) return null;
  const bare = hostname.replace(/^www\./, '');
  return bare === etld1 ? etld1 : bare;
}
