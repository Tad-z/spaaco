import type {
  InsightAuthor,
  InsightCard,
  InsightCta,
  InsightDetail,
  InsightDetailCta,
  Link,
} from '../types/api.js';
import type { IInsight } from '../interfaces/insight.interface.js';
import type { IMedia } from '../interfaces/media.interface.js';
import { EXCLUDED_FROM_MAIN_LISTING, INSIGHT_CATEGORIES } from '../constants/enums.js';
import { toNullableDocument, toNullableImage } from './image.serializer.js';
import { toRef as practiceAreaRef } from './practice-area.serializer.js';
import type { PracticeAreaRefSource } from './practice-area.serializer.js';
import { toSummary as personSummary } from './person.serializer.js';
import type { PersonSummarySource } from './person.serializer.js';

/**
 * Insight cards.
 *
 * Chips, the author block and the CTA are all computed here rather than left
 * to the frontend, because each encodes a rule from the designs that would
 * otherwise be re-implemented — and drift — in the UI.
 */

/** Structural minimum: exactly the fields a card renders. */
export interface InsightCardSource {
  _id: { toString: () => string };
  slug: string;
  title: string;
  excerpt?: string | null;
  format: IInsight['format'];
  categories: IInsight['categories'];
  publishedAt?: Date | null;
  featured: boolean;
  practiceAreas?: PracticeAreaRefSource[];
  /** Null means the firm is the author, not that the field is unset. */
  author?: PersonSummarySource | null;
  /** A writer with no attorney profile, shown when `author` is null (ADR-060). */
  authorName?: string | null;
  coverImage?: IMedia | null;
}

export interface InsightDetailSource extends InsightCardSource {
  body?: string | null;
  videoUrl?: string | null;
  externalUrl?: string | null;
  /** The populated PDF, when the article's link is an uploaded document. */
  document?: IMedia | null;
}

const FIRM_NAME = 'SPA AJIBADE & Co.';

/** The firm as author. The frontend supplies the logo mark; it is its asset. */
export const FIRM_AUTHOR: InsightAuthor = {
  type: 'firm',
  name: FIRM_NAME,
  label: 'Law Firm',
};

/**
 * An attorney, a named writer without a profile, or the firm.
 *
 * A named writer (former staff, a guest) travels in the firm shape, with the
 * firm as its label, so it renders without a new author type (ADR-060). A null
 * author, or one filtered out as a draft, falls back to the firm.
 */
export function toAuthor(
  author: PersonSummarySource | null | undefined,
  authorName?: string | null
): InsightAuthor {
  if (author !== null && author !== undefined && typeof author.firstName === 'string') {
    return { type: 'person', person: personSummary(author) };
  }
  if (typeof authorName === 'string' && authorName.trim() !== '') {
    return { type: 'firm', name: authorName.trim(), label: FIRM_NAME };
  }
  return FIRM_AUTHOR;
}

/** Article cards read "Read More"; video cards read "Watch Video". */
export function toCta(format: IInsight['format']): InsightCta {
  return format === 'video'
    ? { label: 'Watch Video', kind: 'watch_video' }
    : { label: 'Read More', kind: 'read_more' };
}

/**
 * The two labels a card shows: the first category, then the first practice
 * area. With no practice area, the second category is used instead.
 */
export function toChips(insight: InsightCardSource): string[] {
  const [firstCategory, secondCategory] = insight.categories;
  if (firstCategory === undefined) return [];

  const chips = [INSIGHT_CATEGORIES.labels[firstCategory]];
  const firstArea = insight.practiceAreas?.[0];

  if (firstArea) {
    chips.push(firstArea.title);
  } else if (secondCategory !== undefined) {
    chips.push(INSIGHT_CATEGORIES.labels[secondCategory]);
  }

  return chips;
}

export function toCard(insight: InsightCardSource): InsightCard {
  return {
    id: insight._id.toString(),
    slug: insight.slug,
    title: insight.title,
    excerpt: insight.excerpt ?? null,
    format: insight.format,
    categories: insight.categories,
    categoryLabels: insight.categories.map((category) => INSIGHT_CATEGORIES.labels[category]),
    practiceAreas: (insight.practiceAreas ?? []).map(practiceAreaRef),
    chips: toChips(insight),
    author: toAuthor(insight.author, insight.authorName),
    coverImage: toNullableImage(insight.coverImage),
    publishedAt: insight.publishedAt?.toISOString() ?? null,
    featured: insight.featured,
    cta: toCta(insight.format),
  };
}

/**
 * The link after the body (ADR-051). A video goes to its video; an article to
 * its external URL or its uploaded PDF, and has none when it has neither.
 */
export function toDetailCta(insight: InsightDetailSource): InsightDetailCta | null {
  if (insight.format === 'video') {
    return insight.videoUrl ? { label: 'Watch Video', url: insight.videoUrl } : null;
  }

  if (insight.externalUrl) return { label: 'Read Article', url: insight.externalUrl };

  const document = toNullableDocument(insight.document);
  return document ? { label: 'Read Article', url: document.url } : null;
}

/** Pro bono stories belong to the Responsible Business page; everything else to the listing. */
export function toBackLink(insight: Pick<InsightCardSource, 'categories'>): Link {
  // The one excluded category is the Responsible Business grid (ADR-049).
  return insight.categories.some((category) => EXCLUDED_FROM_MAIN_LISTING.includes(category))
    ? {
        label: 'Back to Pro Bono & Community Commitment',
        href: '/responsible-business',
        kind: 'internal',
      }
    : { label: 'Back to Insights & News', href: '/insights', kind: 'internal' };
}

export function toDetail(insight: InsightDetailSource, related: InsightCard[] = []): InsightDetail {
  return {
    ...toCard(insight),
    cta: toDetailCta(insight),
    backLink: toBackLink(insight),
    body: insight.body ?? null,
    videoUrl: insight.videoUrl ?? null,
    related,
  };
}
