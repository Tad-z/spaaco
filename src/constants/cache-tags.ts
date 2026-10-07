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
  recognition: (slug: string): string => `recognition:${slug}`,
  industries: 'industries',
  legal: (key: string): string => `legal:${key}`,
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
  | 'recognitionDirectory'
  | 'award'
  | 'industry'
  | 'legalPage'
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
      // Insight cards carry practice-area chips, job cards carry a practice
      // area, person cards carry them on their back, the People and Insights
      // pages list them as filters, and the About stats can count them.
      return [
        TAGS.site,
        TAGS.practiceAreas,
        TAGS.page('home'),
        TAGS.page('practice-areas'),
        TAGS.page('insights'),
        TAGS.page('people'),
        TAGS.page('careers'),
        TAGS.page('about'),
        TAGS.insights,
        TAGS.people,
        TAGS.jobs,
        ...(slugOrKey === undefined ? [] : [TAGS.practiceArea(slugOrKey)]),
      ];
    case 'person':
      // Insight cards embed the author summary, and a practice area's page
      // embeds its lead, so a renamed attorney clears both.
      return [
        TAGS.people,
        TAGS.insights,
        TAGS.practiceAreas,
        TAGS.page('home'),
        TAGS.page('about'),
        TAGS.page('insights'),
        ...(slugOrKey === undefined ? [] : [TAGS.person(slugOrKey)]),
      ];
    case 'insight':
      // Practice area and attorney detail pages both embed insight cards.
      return [
        TAGS.insights,
        TAGS.practiceAreas,
        TAGS.people,
        TAGS.page('home'),
        TAGS.page('insights'),
        ...(slugOrKey === undefined ? [] : [TAGS.insight(slugOrKey)]),
      ];
    case 'office':
      // The footer lists offices, an About stat counts them, and job cards
      // show one as a location chip.
      return [
        TAGS.site,
        TAGS.offices,
        TAGS.jobs,
        TAGS.page('offices'),
        TAGS.page('about'),
        TAGS.page('careers'),
      ];
    case 'faq':
      return [TAGS.site, TAGS.faqs];
    case 'job':
      return [TAGS.jobs, TAGS.page('careers')];
    case 'recognitionDirectory':
      // A directory names its awards' badges on Home and a row on About.
      return [
        TAGS.recognitions,
        TAGS.page('home'),
        TAGS.page('about'),
        ...(slugOrKey === undefined ? [] : [TAGS.recognition(slugOrKey)]),
      ];
    case 'award':
      // `recognitions` covers every directory page, since an award's own slug
      // does not say which directory it sits on.
      return [TAGS.recognitions, TAGS.page('home')];
    case 'industry':
      return [TAGS.industries, TAGS.practiceAreas];
    case 'legalPage':
      return slugOrKey === undefined ? [] : [TAGS.legal(slugOrKey)];
    case 'page':
      if (slugOrKey === undefined) return [];
      // The recognition page holds the labels every directory page embeds.
      if (slugOrKey === 'recognition') return [TAGS.page(slugOrKey), TAGS.recognitions];
      // The insights page holds the category covers, which stand in on every
      // insight card without one of its own (ADR-063).
      if (slugOrKey === 'insights') {
        return [
          TAGS.page(slugOrKey),
          TAGS.insights,
          TAGS.practiceAreas,
          TAGS.people,
          TAGS.page('home'),
        ];
      }
      return [TAGS.page(slugOrKey)];
  }
}
