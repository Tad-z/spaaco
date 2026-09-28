import { describe, expect, it } from 'vitest';
import {
  PAGE_SCHEMAS,
  homePageSchema,
  insightsPageSchema,
} from '../../../src/validators/pages/index.js';
import { PAGE_KEYS } from '../../../src/constants/enums.js';

/**
 * The per-key page schemas are what stop an admin write leaving a page in a
 * shape the composers cannot render. What matters most is that a rejection
 * says *precisely where* the problem is: an editor gets that path back in
 * `error.details[].path`, and "invalid page" would be useless to them.
 */

const link = { label: 'Discuss a Mandate', href: 'action:mandate', kind: 'action' as const };

const hero = {
  title: 'Counsel To The Institutions Building Nigeria’s Economy.',
  subtitle: 'For over five decades…',
  image: '665f1a2b3c4d5e6f70819293',
  primaryCta: link,
  secondaryCta: null,
};

const sectionHeader = { eyebrow: 'Services', title: 'Focused Practice Areas.', cta: null };

const seo = { title: null, description: null, ogImage: null };

const validHome = {
  hero,
  aboutFirm: { title: 'A Firm Built On Integrity.', paragraphs: ['One.', 'Two.'], cta: link },
  videoShowcase: { videoUrl: null, poster: null },
  recognitionTabs: {
    eyebrow: 'Recognition',
    title: "Ranked Among Nigeria's Top Firms By Key Global Legal Institutions.",
    image: null,
    cta: link,
    achievementsLabel: 'Our Achievements',
    recognizedByLabel: 'Independently Recognized By',
  },
  practiceSection: sectionHeader,
  leadershipSection: sectionHeader,
  whyChooseUs: {
    eyebrow: 'Why Clients Choose SPA Ajibade',
    title: 'Scale Has Not Changed How We Treat A Matter.',
    text: 'Across every office, the standard stays the same.',
    points: [{ icon: 'award', title: 'Proven Track Record', text: null }],
    image: null,
  },
  insightsSection: sectionHeader,
  seo,
};

/** The first issue path Zod reports, as a dotted string. */
const firstErrorPath = (schema: typeof homePageSchema, value: unknown): string => {
  const result = schema.safeParse(value);
  expect(result.success, 'expected the schema to reject this value').toBe(false);
  return result.success ? '' : (result.error.issues[0]?.path.join('.') ?? '');
};

describe('the page schema index', () => {
  it('has a schema for every page key in the contract', () => {
    expect(Object.keys(PAGE_SCHEMAS).sort()).toEqual([...PAGE_KEYS.values].sort());
  });
});

describe('homePageSchema', () => {
  it('accepts a complete page', () => {
    expect(homePageSchema.safeParse(validHome).success).toBe(true);
  });

  it('reports the exact path of a bad field deep inside a section', () => {
    const invalid = {
      ...validHome,
      whyChooseUs: {
        ...validHome.whyChooseUs,
        points: [{ icon: '', title: 'Proven Track Record', text: null }],
      },
    };

    expect(firstErrorPath(homePageSchema, invalid)).toBe('whyChooseUs.points.0.icon');
  });

  it('reports the path of a missing nested field', () => {
    const invalid = {
      ...validHome,
      whyChooseUs: { ...validHome.whyChooseUs, points: [{ icon: 'award', text: null }] },
    };

    expect(firstErrorPath(homePageSchema, invalid)).toBe('whyChooseUs.points.0.title');
  });

  it('reports the path of a missing section', () => {
    const { recognitionTabs: _omitted, ...withoutSection } = validHome;

    expect(firstErrorPath(homePageSchema, withoutSection)).toBe('recognitionTabs');
  });

  it('rejects an unknown section rather than storing it', () => {
    const invalid = { ...validHome, hreo: hero };
    const result = homePageSchema.safeParse(invalid);

    expect(result.success).toBe(false);
  });

  it('rejects a section belonging to a different page', () => {
    const invalid = { ...validHome, csrBanner: { title: 'x', text: 'y', image: null, cta: null } };

    expect(homePageSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a media reference that is not an object id', () => {
    const invalid = { ...validHome, hero: { ...hero, image: 'not-an-id' } };

    expect(firstErrorPath(homePageSchema, invalid)).toBe('hero.image');
  });

  it('accepts a null media reference, since images arrive later', () => {
    const value = { ...validHome, hero: { ...hero, image: null } };

    expect(homePageSchema.safeParse(value).success).toBe(true);
  });

  it('rejects an unknown link kind', () => {
    const invalid = {
      ...validHome,
      hero: { ...hero, primaryCta: { ...link, kind: 'mailto' } },
    };

    expect(firstErrorPath(homePageSchema, invalid)).toBe('hero.primaryCta.kind');
  });

  it('rejects an unknown stat source, which the composer could not resolve', () => {
    const result = PAGE_SCHEMAS.about.safeParse({
      hero,
      story: { eyebrow: null, title: 'Our Story', paragraphs: [], quote: null, quotePerson: null },
      stats: {
        title: 'Decades Of Practice',
        items: [{ value: '59+ Years', caption: 'c', label: 'l', source: 'computed:vibes' }],
      },
      missionSection: { eyebrow: null, title: 'Mission', image: null, items: [] },
      principles: { eyebrow: null, title: 'Principles', image: null, items: [] },
      awardsList: { eyebrow: null, title: 'Awards', image: null, items: [] },
      seo,
    });

    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0]?.path.join('.')).toBe(
      'stats.items.0.source'
    );
  });
});

describe('insightsPageSchema', () => {
  it('accepts a null hero, which is how the design opens the page', () => {
    const result = insightsPageSchema.safeParse({
      hero: null,
      listingSection: { eyebrow: null, title: 'Insights & News', cta: null },
      seo,
    });

    expect(result.success).toBe(true);
  });

  it('still rejects a malformed hero when one is supplied', () => {
    const result = insightsPageSchema.safeParse({
      hero: { ...hero, title: '' },
      listingSection: { eyebrow: null, title: 'Insights & News', cta: null },
      seo,
    });

    expect(result.success).toBe(false);
  });
});

describe('every page schema', () => {
  it.each(PAGE_KEYS.values.map((key) => ({ key })))(
    '$key rejects an empty document with a useful path',
    ({ key }) => {
      const result = PAGE_SCHEMAS[key].safeParse({});

      expect(result.success).toBe(false);
      expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0])).toContain(
        'seo'
      );
    }
  );
});
