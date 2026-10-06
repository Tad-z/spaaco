/**
 * Old site paths → new site paths, for the frontend's `next.config` redirects.
 * The old article permalink was `/%year%/%monthnum%/%day%/%postname%/`, built
 * from the post's local (Lagos) date, which is the raw `published` value.
 */
import { OLD_PRACTICE_AREA_PAGES } from './maps.js';

export interface Redirect {
  readonly source: string;
  readonly destination: string;
  readonly permanent: true;
}

/** `/2023/05/12/slug`: no trailing slash, which Next.js matches either way. */
export function articleSource(published: string, wordpressSlug: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(published.trim());
  if (!match) throw new Error(`Not a WordPress date: "${published}"`);
  return `/${match[1] ?? ''}/${match[2] ?? ''}/${match[3] ?? ''}/${wordpressSlug}`;
}

export const redirect = (source: string, destination: string): Redirect => ({
  source,
  destination,
  permanent: true,
});

/** The old practice-area pages whose path changed. */
export const practiceAreaRedirects = (): Redirect[] =>
  Object.entries(OLD_PRACTICE_AREA_PAGES)
    .filter(([oldSlug, newSlug]) => oldSlug !== newSlug)
    .map(([oldSlug, newSlug]) =>
      redirect(`/practice-areas/${oldSlug}`, `/practice-areas/${newSlug}`)
    );
