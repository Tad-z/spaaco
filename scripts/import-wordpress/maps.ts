/**
 * Decisions, as data. Each one was agreed with TLS Services in the gap review
 * (5 October 2026); change them here, not in the transforms.
 */
import type { PersonRole } from '../../src/types/api.js';

/** Lowercase, `&` as "and", punctuation as spaces: how titles are compared. */
export const normaliseKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Practice-area titles used on the old site (on attorney profiles and as the
 * old page titles) → the backend's practice-area slug. Matching by title does
 * not work ("Taxation" is `tax`), so every title is listed.
 *
 * `null` means "known, deliberately not mapped" (an internal unit, or a
 * sub-area with no backend equivalent). A title missing from this table is
 * reported as unmatched.
 */
const PRACTICE_AREA_TITLES: Readonly<Record<string, string | null>> = {
  'Dispute Resolution': 'dispute-resolution-arbitration',
  'Real Estate & Succession': 'real-estate-succession',
  'Energy & Natural Resources': 'energy-natural-resources',
  'Domestic & International Oil and Gas Law': 'energy-natural-resources',
  'Electric Power & Development': 'energy-natural-resources',
  'Intellectual Property & Technology': 'intellectual-property',
  'Corporate Finance & Capital Markets': 'corporate-finance-capital-markets',
  'Corporate Finance & Capital Market': 'corporate-finance-capital-markets',
  'Privacy & Data Protection': 'data-protection-privacy',
  Taxation: 'tax',
  // Decision D6: these two have current equivalents.
  Telecommunication: 'telecommunications-regulatory',
  'Corporate Governance & Company Secretarial Services': 'company-secretarial',
  'International Environmental Law': null,
  'Cross Departmental': null,
  Administration: null,
};

const PRACTICE_AREA_LOOKUP = new Map(
  Object.entries(PRACTICE_AREA_TITLES).map(([title, slug]) => [normaliseKey(title), slug])
);

/**
 * The backend slug for an old practice-area title: a slug, `null` when the
 * title is known but deliberately unmapped, or `undefined` when it is unknown.
 */
export const practiceAreaSlugFor = (title: string): string | null | undefined =>
  PRACTICE_AREA_LOOKUP.get(normaliseKey(title));

/**
 * The nine old practice-area pages (`/practice-areas/<old>/`) → the new slug.
 * Used for redirects only: their copy is not imported (agreed with TLS).
 */
export const OLD_PRACTICE_AREA_PAGES: Readonly<Record<string, string>> = {
  'corporate-finance-capital-markets': 'corporate-finance-capital-markets',
  'corporate-governance-company-secretarial-services': 'company-secretarial',
  'dispute-resolution': 'dispute-resolution-arbitration',
  'energy-natural-resources': 'energy-natural-resources',
  'intellectual-property-technology': 'intellectual-property',
  'privacy-data-protection': 'data-protection-privacy',
  'real-estate-succession': 'real-estate-succession',
  taxation: 'tax',
  telecommunication: 'telecommunications-regulatory',
};

/**
 * WordPress people whose backend record has a different slug. They are
 * merged into the existing record (fill empty fields only), not created.
 * People whose slug is the same need no entry.
 */
export const PEOPLE_SLUG_MAP: Readonly<Record<string, string>> = {
  'peter-olalere-mciarb': 'peter-olalere',
  'magnus-stephen-ejelonu': 'magnus-ejelonu',
};

/**
 * The free-text WordPress position → a role, or null when it is outside the
 * ladder (Head of Chambers, HR, COO). Order matters: the more specific titles
 * are checked before the words they contain. Consultants have a role since
 * ADR-068.
 */
export function roleFor(position: string | null | undefined): PersonRole | null {
  // "Assocate" is a typo on one profile (agreed with TLS).
  const text = ` ${normaliseKey(position ?? '').replace(/\bassocate\b/g, 'associate')} `;

  if (text.includes(' managing partner ')) return 'managing_partner';
  if (text.includes(' associate partner ')) return 'associate_partner';
  if (text.includes(' partner ')) return 'partner';
  if (text.includes(' senior associate ')) return 'senior_associate';
  if (/ (nysc|corps|corper|trainee) /.test(text)) return 'trainee_associate';
  if (text.includes(' associate ')) return 'associate';
  if (text.includes(' consultant ')) return 'consultant';

  return null;
}

/** Name prefixes that are an honorific, not part of the name. */
export const HONORIFICS: readonly string[] = ['Dr.', 'Dr', 'Mr.', 'Mrs.', 'Ms.', 'Prof.', 'Chief'];

/** Shortcodes that wrap content to keep (page-builder layout). */
export const LAYOUT_SHORTCODES = /\[\/?(?:vc_[a-z_]+|et_pb_[a-z_]+)(?:\s[^\]]*)?\]/g;

/**
 * Shortcodes with no meaning outside WordPress, removed with their content.
 * Only these: square brackets are common in legal text ("[sic]", "[2019]").
 */
export const DROPPED_SHORTCODES =
  /\[(envira-gallery|envira|gallery|audio|playlist)(?:\s[^\]]*)?\](?:[\s\S]*?\[\/\1\])?/g;
