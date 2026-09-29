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

/** A populate spec, as Mongoose accepts it: a path, a draft filter, and nested populates. */
export interface PopulateSpec {
  path: string;
  match?: Record<string, unknown>;
  select?: string;
  populate?: PopulateSpec[];
}

/**
 * Everything a person card renders, front and back (ADR-052): the photo, and
 * the practice-area chips — the chips filtered to published areas, like the
 * person themselves.
 *
 * Every surface that emits a `PersonSummary` (author blocks, the leadership
 * row, the directory, a practice lead, a pull quote) populates through this,
 * so none of them can forget the chips or leak a draft area through them.
 */
export const personCardPopulate = (path: string, options: PreviewOptions = {}): PopulateSpec => ({
  ...publishedPopulate(path, options),
  populate: personCardFields(options),
});

/** The nested half of `personCardPopulate`, for a query whose root is a person. */
export const personCardFields = (options: PreviewOptions = {}): PopulateSpec[] => [
  { path: 'photo' },
  { ...publishedPopulate('practiceAreas', options), select: 'slug title shortLabel' },
];
