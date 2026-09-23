/**
 * The filter every public read applies.
 *
 * Preview is opt-in and requires a valid admin token, so the default path -
 * and anything that forgets to pass `preview` - shows published content only.
 * Drafts leaking is the failure mode worth designing against, so absence of
 * the flag means "hide them".
 */
export interface PreviewOptions {
  readonly preview?: boolean;
}

export const publishedFilter = (options: PreviewOptions = {}): Record<string, unknown> =>
  options.preview === true ? {} : { status: 'published' };

/**
 * A populate spec that also hides drafts.
 *
 * `publishedFilter` only constrains the *root* query, so a published document
 * would otherwise pull in its references regardless of their status: a
 * published insight written by a draft attorney exposed that attorney's name
 * and photo publicly. Every populate of a content collection goes through
 * this.
 *
 * Media has no status, so image references are populated directly.
 *
 * Mongoose sets a non-matching single reference to null and drops it from an
 * array, which is what the serializers already handle.
 */
export const publishedPopulate = (
  path: string,
  options: PreviewOptions = {}
): { path: string; match: Record<string, unknown> } => ({
  path,
  match: publishedFilter(options),
});
