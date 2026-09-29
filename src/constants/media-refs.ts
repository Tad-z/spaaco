import type { MediaKind } from '../types/api.js';

/**
 * Every field in the database that can hold a Media id.
 *
 * "Where is this used?" is computed from this registry rather than stored as
 * back-references, so there is nothing to keep in sync on every write
 * (ADR-013). The cost is that the registry itself must be complete: a media
 * field missing from here means `findUsages` under-reports, so deleting an
 * in-use file would succeed and cache invalidation would skip the pages that
 * show it.
 *
 * `tests/integration/models.test.ts` walks every registered model's schema
 * and fails if a Media reference — single or array — is not listed here, so
 * the omission is caught on the commit that introduces it rather than in
 * production.
 */

export interface MediaRef {
  /** Mongoose model name. */
  readonly model: string;
  /** Collection name as it appears in the admin `usedBy` payload. */
  readonly collection: string;
  /** Dotted path to the field holding the media id, or an array of them. */
  readonly path: string;
  /** Field to show as the human label for the referencing record. */
  readonly label: string;
  /**
   * Field holding the value cache tags are keyed by — the slug for content,
   * the key for pages.
   *
   * Separate from `label` on purpose: they coincided for pages and diverged
   * everywhere else, so invalidating with the label produced
   * `practice-area:Tax` instead of `practice-area:tax` and the frontend never
   * revalidated the detail page.
   */
  readonly tagField: string;
  /**
   * The kind of media the field must hold. A write that points an image field
   * at a PDF, or a document field at a picture, is refused (ADR-053).
   */
  readonly kind: MediaKind;
}

const page = (path: string, kind: MediaKind = 'image'): MediaRef => ({
  model: 'Page',
  collection: 'pages',
  path,
  label: 'key',
  tagField: 'key',
  kind,
});

export const MEDIA_REFS: readonly MediaRef[] = [
  {
    model: 'PracticeArea',
    collection: 'practiceAreas',
    path: 'image',
    label: 'title',
    tagField: 'slug',
    kind: 'image',
  },
  {
    model: 'PracticeArea',
    collection: 'practiceAreas',
    path: 'heroImages',
    label: 'title',
    tagField: 'slug',
    kind: 'image',
  },
  {
    model: 'Person',
    collection: 'people',
    path: 'photo',
    label: 'lastName',
    tagField: 'slug',
    kind: 'image',
  },
  {
    model: 'Insight',
    collection: 'insights',
    path: 'coverImage',
    label: 'title',
    tagField: 'slug',
    kind: 'image',
  },
  {
    model: 'Insight',
    collection: 'insights',
    path: 'document',
    label: 'title',
    tagField: 'slug',
    kind: 'document',
  },
  {
    model: 'RecognitionDirectory',
    collection: 'recognitionDirectories',
    path: 'logo',
    label: 'name',
    tagField: 'slug',
    kind: 'image',
  },
  {
    model: 'RecognitionDirectory',
    collection: 'recognitionDirectories',
    path: 'heroImages',
    label: 'name',
    tagField: 'slug',
    kind: 'image',
  },
  {
    model: 'Award',
    collection: 'awards',
    path: 'badge',
    label: 'title',
    tagField: 'slug',
    kind: 'image',
  },

  // Page documents. Each page key carries only some of these, but any of them
  // can hold an id, so all are registered.
  page('hero.images'),
  page('seo.ogImage'),
  page('videoShowcase.poster'),
  page('recognitionSection.image'),
  page('whyChooseUs.image'),
  page('story.profileDownload.document', 'document'),
  page('missionSection.image'),
  page('principles.image'),
  page('awardsList.image'),
  page('csrBanner.images'),
  page('images'),
] as const;

/** Media paths grouped by model, for building a `$or` query per collection. */
export const mediaRefsFor = (model: string): readonly MediaRef[] =>
  MEDIA_REFS.filter((ref) => ref.model === model);

/** Every model name that can reference media. */
export const MEDIA_REF_MODELS: readonly string[] = [...new Set(MEDIA_REFS.map((ref) => ref.model))];
