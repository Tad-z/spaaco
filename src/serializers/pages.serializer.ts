import type {
  AboutPage,
  CareersPage,
  FaqPage,
  HomePage,
  InsightsPage,
  OfficesPage,
  Page,
  PageKey,
  PeoplePage,
  PracticeAreasPage,
} from '../types/api.js';
import type { IPageSources } from '../interfaces/populated.interface.js';
import { toNullableImage } from './image.serializer.js';
import { toCard as practiceAreaCard } from './practice-area.serializer.js';
import { toSummary as personSummary } from './person.serializer.js';
import { toCard as insightCard } from './insight.serializer.js';
import { toRecognition } from './recognition.serializer.js';
import { toOffice } from './office.serializer.js';
import { toJob } from './job.serializer.js';
import {
  CATEGORY_FILTERS,
  ROLE_FILTERS,
  toHero,
  toIconItem,
  toLink,
  toSectionHeader,
  toSeo,
  toStat,
} from './page.serializer.js';

/**
 * One composer per page key.
 *
 * Fetching is the page service's job; this file only shapes what it returns,
 * which keeps the composers pure and the layer rules intact.
 *
 * A section a key requires but the document lacks is an internal fault, not a
 * client error: the per-key Zod schema should have made it impossible, so the
 * response is a generic 500 and the detail goes to the log.
 */

class MissingSectionError extends Error {
  constructor(key: string, section: string) {
    super(`Page "${key}" is missing its required "${section}" section`);
    this.name = 'MissingSectionError';
  }
}

/** Narrow an optional section to a present one, or fail loudly. */
function required<T>(value: T | null | undefined, key: string, section: string): T {
  if (value === null || value === undefined) throw new MissingSectionError(key, section);
  return value;
}

function composeHome({
  page,
  practiceAreas,
  leadership,
  insights,
  recognitions,
}: IPageSources): HomePage {
  const hero = required(toHero(page.hero), 'home', 'hero');
  const aboutFirm = required(page.aboutFirm, 'home', 'aboutFirm');
  const whyChooseUs = required(page.whyChooseUs, 'home', 'whyChooseUs');
  const recognitionTabs = required(page.recognitionTabs, 'home', 'recognitionTabs');

  return {
    key: 'home',
    hero,
    aboutFirm: {
      title: aboutFirm.title,
      paragraphs: aboutFirm.paragraphs,
      cta: toLink(aboutFirm.cta),
    },
    videoShowcase: {
      videoUrl: page.videoShowcase?.videoUrl ?? null,
      poster: toNullableImage(page.videoShowcase?.poster),
    },
    recognitionTabs: {
      eyebrow: recognitionTabs.eyebrow ?? null,
      title: recognitionTabs.title,
      image: toNullableImage(recognitionTabs.image),
      cta: toLink(recognitionTabs.cta),
      achievementsLabel: recognitionTabs.achievementsLabel,
      recognizedByLabel: recognitionTabs.recognizedByLabel,
    },
    recognitions: {
      achievements: recognitions.filter((item) => item.tab === 'achievements').map(toRecognition),
      recognizedBy: recognitions.filter((item) => item.tab === 'recognized_by').map(toRecognition),
    },
    practiceSection: toSectionHeader(required(page.practiceSection, 'home', 'practiceSection')),
    practiceAreas: practiceAreas.map(practiceAreaCard),
    leadershipSection: toSectionHeader(
      required(page.leadershipSection, 'home', 'leadershipSection')
    ),
    leadership: leadership.map(personSummary),
    whyChooseUs: {
      eyebrow: whyChooseUs.eyebrow ?? null,
      title: whyChooseUs.title,
      text: whyChooseUs.text,
      points: whyChooseUs.points.map(toIconItem),
      image: toNullableImage(whyChooseUs.image),
    },
    insightsSection: toSectionHeader(required(page.insightsSection, 'home', 'insightsSection')),
    latestInsights: insights.map(insightCard),
    seo: toSeo(page.seo),
  };
}

function composeAbout({ page, counts }: IPageSources): AboutPage {
  const hero = required(toHero(page.hero), 'about', 'hero');
  const story = required(page.story, 'about', 'story');
  const stats = required(page.stats, 'about', 'stats');
  const missionSection = required(page.missionSection, 'about', 'missionSection');
  const principles = required(page.principles, 'about', 'principles');
  const awardsList = required(page.awardsList, 'about', 'awardsList');

  return {
    key: 'about',
    hero,
    story: {
      eyebrow: story.eyebrow ?? null,
      title: story.title,
      paragraphs: story.paragraphs,
      quote: story.quote ?? null,
      // The pull quote shows the Managing Partner's photo and role, so the
      // whole summary is embedded rather than just a name.
      quotePerson: story.quotePerson ? personSummary(story.quotePerson) : null,
    },
    stats: {
      title: stats.title,
      items: stats.items.map((stat) => toStat(stat, counts)),
    },
    missionSection: {
      eyebrow: missionSection.eyebrow ?? null,
      title: missionSection.title,
      image: toNullableImage(missionSection.image),
      items: missionSection.items.map((item) => ({ title: item.title, body: item.body })),
    },
    principles: {
      eyebrow: principles.eyebrow ?? null,
      title: principles.title,
      image: toNullableImage(principles.image),
      items: principles.items.map(toIconItem),
    },
    awardsList: {
      eyebrow: awardsList.eyebrow ?? null,
      title: awardsList.title,
      image: toNullableImage(awardsList.image),
      items: awardsList.items.map((item) => ({ name: item.name, url: item.url ?? null })),
    },
    seo: toSeo(page.seo),
  };
}

function composePracticeAreas({ page, practiceAreas }: IPageSources): PracticeAreasPage {
  const csrBanner = required(page.csrBanner, 'practice-areas', 'csrBanner');

  return {
    key: 'practice-areas',
    hero: required(toHero(page.hero), 'practice-areas', 'hero'),
    gridSection: toSectionHeader(required(page.gridSection, 'practice-areas', 'gridSection')),
    practiceAreas: practiceAreas.map(practiceAreaCard),
    csrBanner: {
      title: csrBanner.title,
      text: csrBanner.text,
      image: toNullableImage(csrBanner.image),
      cta: toLink(csrBanner.cta),
    },
    seo: toSeo(page.seo),
  };
}

function composePeople({ page }: IPageSources): PeoplePage {
  return {
    key: 'people',
    hero: required(toHero(page.hero), 'people', 'hero'),
    directorySection: toSectionHeader(
      required(page.directorySection, 'people', 'directorySection')
    ),
    roleFilters: [...ROLE_FILTERS],
    seo: toSeo(page.seo),
  };
}

function composeInsights({ page, insights }: IPageSources): InsightsPage {
  return {
    key: 'insights',
    // Null by design: the page opens with the featured carousel.
    hero: toHero(page.hero),
    featured: insights.map(insightCard),
    categoryFilters: [...CATEGORY_FILTERS],
    listingSection: toSectionHeader(required(page.listingSection, 'insights', 'listingSection')),
    seo: toSeo(page.seo),
  };
}

function composeCareers({ page, jobs }: IPageSources): CareersPage {
  return {
    key: 'careers',
    hero: required(toHero(page.hero), 'careers', 'hero'),
    jobsSection: toSectionHeader(required(page.jobsSection, 'careers', 'jobsSection')),
    jobs: jobs.map(toJob),
    seo: toSeo(page.seo),
  };
}

function composeFaq({ page }: IPageSources): FaqPage {
  // The FAQ items themselves come from /site, not from here.
  return {
    key: 'faq',
    hero: required(toHero(page.hero), 'faq', 'hero'),
    seo: toSeo(page.seo),
  };
}

function composeOffices({ page, offices }: IPageSources): OfficesPage {
  return {
    key: 'offices',
    hero: required(toHero(page.hero), 'offices', 'hero'),
    offices: offices.map(toOffice),
    seo: toSeo(page.seo),
  };
}

const COMPOSERS: Record<PageKey, (sources: IPageSources) => Page> = {
  home: composeHome,
  about: composeAbout,
  'practice-areas': composePracticeAreas,
  people: composePeople,
  insights: composeInsights,
  careers: composeCareers,
  faq: composeFaq,
  offices: composeOffices,
};

export const toPage = (key: PageKey, sources: IPageSources): Page => COMPOSERS[key](sources);
