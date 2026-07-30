import { getDomain } from 'tldts';
import type { Domain } from '@/utils/types';

const TRACKABLE_SCHEMES = new Set(['http:', 'https:']);

/**
 * Extracts the eTLD+1 (registrable domain) from a URL, e.g. `www.facebook.com` and
 * `m.facebook.com` both normalize to `facebook.com`. Returns `null` for non-http(s) schemes
 * (`chrome://`, `about:`, `moz-extension://`, `file://`, ...) and unparseable URLs — those are
 * never tracked or blockable.
 */
export function domainFromUrl(url: string): Domain | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!TRACKABLE_SCHEMES.has(parsed.protocol)) return null;
  return getDomain(parsed.hostname) ?? null;
}

/** Normalizes free-typed input (a bare domain, `www.`-prefixed domain, or full URL) from the
 * "add a rule" form into an eTLD+1, or `null` if it isn't a recognizable domain. */
export function normalizeDomainInput(input: string): Domain | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  return getDomain(trimmed) ?? null;
}
