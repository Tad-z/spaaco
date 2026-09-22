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
