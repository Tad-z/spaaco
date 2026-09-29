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
  RecognitionPage,
  ResponsibleBusinessPage,
} from '../types/api.js';
import type { IPageSources } from '../interfaces/populated.interface.js';
import { toImages, toNullableDocument, toNullableImage } from './image.serializer.js';
import {
  toCard as practiceAreaCard,
  toFilterOption,
  toHomeCard,
} from './practice-area.serializer.js';
import { toSummary as personSummary } from './person.serializer.js';
import { toCard as insightCard } from './insight.serializer.js';
import { toAwards, toDirectoryLink } from './recognition.serializer.js';
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
  awards,
}: IPageSources): HomePage {
  const hero = required(toHero(page.hero), 'home', 'hero');
  const aboutFirm = required(page.aboutFirm, 'home', 'aboutFirm');
  const whyChooseUs = required(page.whyChooseUs, 'home', 'whyChooseUs');
  const recognition = required(page.recognitionSection, 'home', 'recognitionSection');

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
      caption: page.videoShowcase?.caption ?? null,
    },
    recognitionSection: {
      eyebrow: recognition.eyebrow ?? null,
      title: recognition.title,
      image: toNullableImage(recognition.image),
      // The destination is pending (decision 12): both stay null until set.
      cta: {
        label: recognition.cta.label,
        href: recognition.cta.href ?? null,
        kind: recognition.cta.kind ?? null,
      },
      badges: toAwards(awards),
    },
    practiceSection: toSectionHeader(required(page.practiceSection, 'home', 'practiceSection')),
    // Home cards carry the area's Home text, not the grid's (ADR-047).
    practiceAreas: practiceAreas.map(toHomeCard),
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

function composeAbout({ page, counts, directories }: IPageSources): AboutPage {
  const hero = required(toHero(page.hero), 'about', 'hero');
  const story = required(page.story, 'about', 'story');
  const stats = required(page.stats, 'about', 'stats');
  const missionSection = required(page.missionSection, 'about', 'missionSection');
  const principles = required(page.principles, 'about', 'principles');
  const awardsList = required(page.awardsList, 'about', 'awardsList');
  const download = story.profileDownload;

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
      profileDownload: download
        ? {
            leadText: download.leadText,
            linkLabel: download.linkLabel,
            document: toNullableDocument(download.document),
          }
        : null,
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
      // One row per published directory, linking to its page (ADR-056).
      items: directories.map(toDirectoryLink),
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
    practiceAreas: practiceAreas.map((area) => practiceAreaCard(area)),
    csrBanner: {
      title: csrBanner.title,
      text: csrBanner.text,
      images: toImages(csrBanner.images),
      cta: toLink(csrBanner.cta),
    },
    seo: toSeo(page.seo),
  };
}

function composePeople({ page, filterAreas }: IPageSources): PeoplePage {
  return {
    key: 'people',
    hero: required(toHero(page.hero), 'people', 'hero'),
    directorySection: toSectionHeader(
      required(page.directorySection, 'people', 'directorySection')
    ),
    roleFilters: [...ROLE_FILTERS],
    practiceAreaFilters: filterAreas.map(toFilterOption),
    seo: toSeo(page.seo),
  };
}

function composeInsights({ page, insights, filterAreas }: IPageSources): InsightsPage {
  return {
    key: 'insights',
    // Null by design: the page opens with the featured carousel.
    hero: toHero(page.hero),
    featured: insights.map(insightCard),
    categoryFilters: [...CATEGORY_FILTERS],
    practiceAreaFilters: filterAreas.map(toFilterOption),
    listingSection: toSectionHeader(required(page.listingSection, 'insights', 'listingSection')),
    seo: toSeo(page.seo),
  };
}

function composeCareers({ page, jobs }: IPageSources): CareersPage {
  const jobsSection = required(page.jobsSection, 'careers', 'jobsSection');
  const emptyState = jobsSection.emptyState;

  return {
    key: 'careers',
    hero: required(toHero(page.hero), 'careers', 'hero'),
    jobsSection: {
      eyebrow: jobsSection.eyebrow ?? null,
      title: jobsSection.title,
      cta: toLink(jobsSection.cta),
      // Stored always, served only when there is nothing open to show.
      emptyState:
        jobs.length === 0 && emptyState
          ? { title: emptyState.title, body: emptyState.body, ctaLabel: emptyState.ctaLabel }
          : null,
    },
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

function composeRecognition({ page }: IPageSources): RecognitionPage {
  const labels = required(page.directoryPage, 'recognition', 'directoryPage');

  return {
    key: 'recognition',
    directoryPage: {
      awardsEyebrow: labels.awardsEyebrow,
      primaryCta: toLink(labels.primaryCta),
      secondaryCta: toLink(labels.secondaryCta),
    },
    seo: toSeo(page.seo),
  };
}

function composeResponsibleBusiness({ page }: IPageSources): ResponsibleBusinessPage {
  const backLink = required(toLink(page.backLink), 'responsible-business', 'backLink');

  return {
    key: 'responsible-business',
    title: required(page.title, 'responsible-business', 'title'),
    images: toImages(page.images),
    backLink,
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
  recognition: composeRecognition,
  'responsible-business': composeResponsibleBusiness,
};

export const toPage = (key: PageKey, sources: IPageSources): Page => COMPOSERS[key](sources);
