import type { CacheEntity } from './cache-tags.js';

/**
 * The seven content collections, as URL segments.
 *
 * This is an implementation grouping rather than a contract shape. The spec
 * lists each collection's paths explicitly so the dashboard gets a concrete
 * request and response type per collection (ADR-033), which leaves nothing for
 * a collection enum to describe in the contract.
 */
export const ADMIN_COLLECTIONS = [
  'practice-areas',
  'people',
  'insights',
  'offices',
  'recognitions',
  'faqs',
  'jobs',
] as const;

export type AdminCollection = (typeof ADMIN_COLLECTIONS)[number];

/**
 * What the generic CRUD factory needs to know about each content collection.
 *
 * Models are named rather than imported, so this stays a leaf module: the
 * service resolves the name through Mongoose. Everything that differs between
 * the seven collections lives here, which is what lets one set of handlers
 * serve all of them.
 */

export interface ContentCollectionConfig {
  /** Mongoose model name. */
  readonly model: string;
  /** Field the slug is generated from. */
  readonly slugSource: string;
  /** Which cache tags a write to this collection clears. */
  readonly cacheEntity: CacheEntity;
  /** Fields the admin `?q=` filter searches, as a regex over each. */
  readonly searchFields: readonly string[];
  /** Paths holding a Media id, expanded for the dashboard's thumbnails. */
  readonly mediaPaths: readonly string[];
  /** Paths holding a Person id, expanded to a display name. */
  readonly personPaths: readonly string[];
  /**
   * Other collections that reference this one, checked before a delete so an
   * in-use record cannot be removed out from under a page.
   */
  readonly referencedBy: readonly { model: string; path: string; label: string }[];
  /** Singular noun for error messages. */
  readonly label: string;
}

export const CONTENT_COLLECTIONS: Record<AdminCollection, ContentCollectionConfig> = {
  'practice-areas': {
    model: 'PracticeArea',
    slugSource: 'title',
    cacheEntity: 'practiceArea',
    searchFields: ['title', 'shortLabel', 'summary'],
    mediaPaths: ['image'],
    personPaths: ['contacts'],
    referencedBy: [
      { model: 'Insight', path: 'practiceAreas', label: 'title' },
      { model: 'Job', path: 'practiceArea', label: 'title' },
      { model: 'Person', path: 'practiceAreas', label: 'lastName' },
    ],
    label: 'Practice area',
  },
  people: {
    model: 'Person',
    slugSource: 'fullNameForSlug',
    cacheEntity: 'person',
    searchFields: ['firstName', 'lastName'],
    mediaPaths: ['photo'],
    personPaths: [],
    referencedBy: [
      { model: 'Insight', path: 'author', label: 'title' },
      { model: 'PracticeArea', path: 'contacts', label: 'title' },
      { model: 'Page', path: 'story.quotePerson', label: 'key' },
    ],
    label: 'Attorney',
  },
  insights: {
    model: 'Insight',
    slugSource: 'title',
    cacheEntity: 'insight',
    searchFields: ['title', 'excerpt'],
    mediaPaths: ['coverImage'],
    personPaths: ['author'],
    referencedBy: [],
    label: 'Insight',
  },
  offices: {
    model: 'Office',
    slugSource: 'name',
    cacheEntity: 'office',
    searchFields: ['name', 'address'],
    mediaPaths: [],
    personPaths: [],
    referencedBy: [
      { model: 'Person', path: 'office', label: 'lastName' },
      { model: 'Job', path: 'office', label: 'title' },
    ],
    label: 'Office',
  },
  recognitions: {
    model: 'Recognition',
    slugSource: 'slugSource',
    cacheEntity: 'recognition',
    searchFields: ['organization', 'title'],
    mediaPaths: ['badge'],
    personPaths: [],
    referencedBy: [],
    label: 'Recognition',
  },
  faqs: {
    model: 'Faq',
    slugSource: 'question',
    cacheEntity: 'faq',
    searchFields: ['question'],
    mediaPaths: [],
    personPaths: [],
    referencedBy: [],
    label: 'FAQ',
  },
  jobs: {
    model: 'Job',
    slugSource: 'title',
    cacheEntity: 'job',
    searchFields: ['title'],
    mediaPaths: [],
    personPaths: [],
    referencedBy: [],
    label: 'Job',
  },
};
