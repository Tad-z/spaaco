/**
 * Every field in the database that can hold a Media id.
 *
 * "Where is this image used?" is computed from this registry rather than stored
 * as back-references, so there is nothing to keep in sync on every write
 * (ADR-013). The cost is that the registry itself must be complete: a media
 * field missing from here means `findUsages` under-reports, so deleting an
 * in-use image would succeed and cache invalidation would skip the pages that
 * show it.
 *
 * `tests/integration/media-refs.test.ts` walks every registered model's schema
 * and fails if a Media reference is not listed here, so the omission is caught
 * on the commit that introduces it rather than in production.
 */

export interface MediaRef {
  /** Mongoose model name. */
  readonly model: string;
  /** Collection name as it appears in the admin `usedBy` payload. */
  readonly collection: string;
  /** Dotted path to the field holding the media id. */
  readonly path: string;
  /** Field to show as the human label for the referencing record. */
  readonly label: string;
}

export const MEDIA_REFS: readonly MediaRef[] = [
  { model: 'PracticeArea', collection: 'practiceAreas', path: 'image', label: 'title' },
  { model: 'Person', collection: 'people', path: 'photo', label: 'lastName' },
  { model: 'Insight', collection: 'insights', path: 'coverImage', label: 'title' },
  { model: 'Recognition', collection: 'recognitions', path: 'badge', label: 'organization' },

  // Page documents. Each page key carries only some of these, but any of them
  // can hold an id, so all are registered.
  { model: 'Page', collection: 'pages', path: 'hero.image', label: 'key' },
  { model: 'Page', collection: 'pages', path: 'seo.ogImage', label: 'key' },
  { model: 'Page', collection: 'pages', path: 'videoShowcase.poster', label: 'key' },
  { model: 'Page', collection: 'pages', path: 'whyChooseUs.image', label: 'key' },
  { model: 'Page', collection: 'pages', path: 'missionSection.image', label: 'key' },
  { model: 'Page', collection: 'pages', path: 'principles.image', label: 'key' },
  { model: 'Page', collection: 'pages', path: 'awardsList.image', label: 'key' },
  { model: 'Page', collection: 'pages', path: 'csrBanner.image', label: 'key' },
] as const;

/** Media paths grouped by model, for building a `$or` query per collection. */
export const mediaRefsFor = (model: string): readonly MediaRef[] =>
  MEDIA_REFS.filter((ref) => ref.model === model);

/** Every model name that can reference media. */
export const MEDIA_REF_MODELS: readonly string[] = [...new Set(MEDIA_REFS.map((ref) => ref.model))];
