import type {
  FilterOption,
  InsightCard,
  IndustryRef,
  PracticeAreaCard,
  PracticeAreaDetail,
  PracticeAreaLead,
  PracticeAreaLink,
  PracticeAreaRef,
} from '../types/api.js';
import type {
  ICoreService,
  IPracticeArea,
  IPracticeAreaApproach,
} from '../interfaces/practice-area.interface.js';
import type { IMedia } from '../interfaces/media.interface.js';
import { toImages, toNullableImage } from './image.serializer.js';

/**
 * Serializers declare the minimum they read, not a whole document. That lets
 * callers project only what they need — the footer wants four fields, not a
 * body field and a populated image.
 */

export interface PracticeAreaLinkSource {
  slug: string;
  title: string;
}

export interface PracticeAreaRefSource extends PracticeAreaLinkSource {
  _id: { toString: () => string };
  shortLabel: string;
}

export interface PracticeAreaCardSource extends PracticeAreaRefSource {
  summary: string;
  homeSummary?: string;
  image?: IMedia | null;
}

export interface IndustrySource {
  name: string;
  slug: string;
}

export interface PracticeAreaDetailSource extends PracticeAreaCardSource {
  homeSummary: string;
  heroIntro: string;
  heroImages?: (IMedia | null)[];
  overview?: string | null;
  coreServices?: ICoreService[];
  approach?: IPracticeAreaApproach | null;
  industries?: IndustrySource[];
  seo?: IPracticeArea['seo'] | null;
}

/** The minimal form used for chips, dropdowns and footer links. */
export function toRef(area: PracticeAreaRefSource): PracticeAreaRef {
  return {
    id: area._id.toString(),
    slug: area.slug,
    title: area.title,
    shortLabel: area.shortLabel,
  };
}

/** A card-back chip, or a sidebar link: `/practice-areas/{slug}`. */
export function toLink(area: PracticeAreaLinkSource): PracticeAreaLink {
  return { slug: area.slug, title: area.title };
}

/** A "Practice Area" dropdown option on People and Insights (ADR-054). */
export function toFilterOption(area: PracticeAreaLinkSource): FilterOption {
  return { value: area.slug, label: area.title };
}

/**
 * A card. The Practice Areas grid shows `summary`; the Home carousel shows the
 * area's `homeSummary` in the same slot, which is why the caller chooses
 * (ADR-047).
 */
export function toCard(
  area: PracticeAreaCardSource,
  text: 'summary' | 'homeSummary' = 'summary'
): PracticeAreaCard {
  return {
    ...toRef(area),
    summary: text === 'homeSummary' ? (area.homeSummary ?? area.summary) : area.summary,
    image: toNullableImage(area.image),
  };
}

/** The Home carousel card. */
export const toHomeCard = (area: PracticeAreaCardSource): PracticeAreaCard =>
  toCard(area, 'homeSummary');

export const toIndustry = (industry: IndustrySource): IndustryRef => ({
  name: industry.name,
  slug: industry.slug,
});

/**
 * The detail payload. The lead, sidebar and publications are passed in already
 * serialized, because fetching them is the service's job, not this one's.
 */
export function toDetail(
  area: PracticeAreaDetailSource,
  lead: PracticeAreaLead | null,
  siblings: PracticeAreaLink[],
  recentPublications: InsightCard[]
): PracticeAreaDetail {
  return {
    ...toCard(area),
    homeSummary: area.homeSummary,
    heroIntro: area.heroIntro,
    heroImages: toImages(area.heroImages),
    overview: area.overview ?? null,
    coreServices: (area.coreServices ?? []).map((service) => ({
      title: service.title,
      description: service.description,
    })),
    approach: area.approach
      ? { text: area.approach.text, points: [...area.approach.points] }
      : null,
    industries: (area.industries ?? []).map(toIndustry),
    lead,
    siblings,
    recentPublications,
    seo: {
      title: area.seo?.title ?? null,
      description: area.seo?.description ?? null,
    },
  };
}
