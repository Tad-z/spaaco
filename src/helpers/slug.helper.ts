/**
 * Slug generation.
 *
 * Pure functions only: turning a title into a candidate slug, and deriving the
 * next candidate when one is taken. Checking a slug against the database is the
 * content plugin's job, because only it can see the collection.
 */

/** Matches the `Slug` schema in openapi.yaml. */
export const MAX_SLUG_LENGTH = 140;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Apostrophes are removed rather than turned into a separator, so
 * "Nigeria's Economy" becomes `nigerias-economy`, not `nigeria-s-economy`.
 * Covers the straight, curly and backtick forms editors paste in.
 */
const APOSTROPHES = /['‘’ʼ`]/g;

/** Trim to the limit without leaving a half-word or a trailing hyphen. */
function truncateAtBoundary(value: string, limit: number): string {
  if (value.length <= limit) return value;

  const cut = value.slice(0, limit);
  const lastHyphen = cut.lastIndexOf('-');
  // Only fall back to a hard cut if the first "word" is itself over-long.
  return (lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, '');
}

/**
 * Convert arbitrary text into a URL slug.
 *
 * Returns an empty string when the input has nothing usable (punctuation only,
 * or a script with no ASCII transliteration). Callers decide what to do about
 * that; the content plugin rejects it rather than inventing a slug.
 */
export function slugify(input: string, maxLength: number = MAX_SLUG_LENGTH): string {
  const withoutAccents = input
    .normalize('NFKD')
    // Strip combining marks, so "Olóyè" becomes "oloye".
    .replace(/[̀-ͯ]/g, '');

  const slug = withoutAccents
    .replace(APOSTROPHES, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return truncateAtBoundary(slug, maxLength);
}

/** True when a string is already a valid slug. */
export const isSlug = (value: string): boolean =>
  value.length > 0 && value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);

/**
 * The nth candidate for a base slug: `tax`, `tax-2`, `tax-3`, …
 *
 * The suffix is reserved from the limit rather than appended past it, so a
 * long title cannot produce a slug that breaks the contract's maxLength.
 */
export function slugCandidate(
  base: string,
  attempt: number,
  maxLength: number = MAX_SLUG_LENGTH
): string {
  if (attempt <= 1) return truncateAtBoundary(base, maxLength);

  const suffix = `-${String(attempt)}`;
  return `${truncateAtBoundary(base, maxLength - suffix.length)}${suffix}`;
}
