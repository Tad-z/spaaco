/**
 * Cache tags.
 *
 * A write invalidates by tag rather than by key, because one edit affects
 * several surfaces: a practice area appears in the nav, the footer, the Home
 * tabs and the Practice Areas grid, and all four must go at once or the site
 * contradicts itself.
 */

export const TAGS = {
  site: 'site',
  page: (key: string): string => `page:${key}`,
  practiceAreas: 'practice-areas',
  practiceArea: (slug: string): string => `practice-area:${slug}`,
  people: 'people',
  person: (slug: string): string => `person:${slug}`,
  insights: 'insights',
  insight: (slug: string): string => `insight:${slug}`,
  offices: 'offices',
  faqs: 'faqs',
  jobs: 'jobs',
  recognitions: 'recognitions',
  media: (id: string): string => `media:${id}`,
} as const;

/** Entities that can be written, and every surface each one appears on. */
export type CacheEntity =
  | 'settings'
  | 'practiceArea'
  | 'person'
  | 'insight'
  | 'office'
  | 'faq'
  | 'job'
  | 'recognition'
  | 'page';

/**
 * The tags a write to `entity` must clear.
 *
 * Erring towards clearing too much: a stale page is a visible bug the firm
 * will report, while an extra cache miss costs a few milliseconds.
 */
export function tagsFor(entity: CacheEntity, slugOrKey?: string): string[] {
  switch (entity) {
    case 'settings':
      // Settings drive the shell, which every page renders.
      return [TAGS.site];
    case 'practiceArea':
      return [
        TAGS.site,
        TAGS.practiceAreas,
        TAGS.page('home'),
        TAGS.page('practice-areas'),
        ...(slugOrKey === undefined ? [] : [TAGS.practiceArea(slugOrKey)]),
      ];
    case 'person':
      return [
        TAGS.people,
        TAGS.page('home'),
        TAGS.page('about'),
        ...(slugOrKey === undefined ? [] : [TAGS.person(slugOrKey)]),
      ];
    case 'insight':
      return [
        TAGS.insights,
        TAGS.page('home'),
        TAGS.page('insights'),
        ...(slugOrKey === undefined ? [] : [TAGS.insight(slugOrKey)]),
      ];
    case 'office':
      // Offices appear in the footer and are counted by an About stat.
      return [TAGS.site, TAGS.offices, TAGS.page('offices'), TAGS.page('about')];
    case 'faq':
      return [TAGS.site, TAGS.faqs];
    case 'job':
      return [TAGS.jobs, TAGS.page('careers')];
    case 'recognition':
      return [TAGS.recognitions, TAGS.page('home')];
    case 'page':
      return slugOrKey === undefined ? [] : [TAGS.page(slugOrKey)];
  }
}
