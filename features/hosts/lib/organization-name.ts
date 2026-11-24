/**
 * Heuristic for the host profile's schema.org type: a company-style name
 * ("Asir Adventures Co.", "شركة رحلات عسير") is an Organization, anything
 * else a Person. Once db/schema.ts distinguishes individual vs company
 * hosts, this picks itself.
 *
 * The Arabic terms need Unicode-aware boundaries: JavaScript's `\b` only
 * knows ASCII word characters, so `\bشركة\b` can never match.
 */
const LATIN_COMPANY = /\b(co\.?|company|llc|ltd|inc)\b/i;
const ARABIC_COMPANY = /(?<![\p{L}\p{N}])(الشركة|شركة)(?![\p{L}\p{N}])/u;

export function isOrganizationName(name: string): boolean {
  return LATIN_COMPANY.test(name) || ARABIC_COMPANY.test(name);
}
