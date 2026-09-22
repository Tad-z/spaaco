import type { InsightAuthor, InsightCard, InsightCta, InsightDetail } from '../types/api.js';
import type { IInsight } from '../interfaces/insight.interface.js';
import type { IMedia } from '../interfaces/media.interface.js';
import { INSIGHT_CATEGORIES } from '../constants/enums.js';
import { toNullableImage } from './image.serializer.js';
import { toRef as practiceAreaRef } from './practice-area.serializer.js';
import type { PopulatedPracticeArea } from './practice-area.serializer.js';
import { toSummary as personSummary } from './person.serializer.js';
import type { PopulatedPerson } from './person.serializer.js';

/**
 * Insight cards.
 *
 * Chips, the author block and the CTA are all computed here rather than left
 * to the frontend, because each encodes a rule from the designs that would
 * otherwise be re-implemented — and drift — in the UI.
 */

export type PopulatedInsight = Omit<IInsight, 'coverImage' | 'practiceAreas' | 'author'> & {
  _id: { toString: () => string };
  coverImage?: IMedia | null;
  practiceAreas?: PopulatedPracticeArea[];
  author?: PopulatedPerson | null;
};

/** The firm as author. The frontend supplies the logo mark; it is its asset. */
export const FIRM_AUTHOR: InsightAuthor = {
  type: 'firm',
  name: 'SPA AJIBADE & Co.',
  label: 'Law Firm',
};

/** A null author means the firm wrote it, not that the field is unset. */
export function toAuthor(author: PopulatedPerson | null | undefined): InsightAuthor {
  if (author === null || author === undefined || typeof author.firstName !== 'string') {
    return FIRM_AUTHOR;
  }
  return { type: 'person', person: personSummary(author) };
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
export function toChips(insight: PopulatedInsight): string[] {
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

export function toCard(insight: PopulatedInsight): InsightCard {
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
    author: toAuthor(insight.author),
    coverImage: toNullableImage(insight.coverImage),
    publishedAt: insight.publishedAt?.toISOString() ?? null,
    featured: insight.featured,
    cta: toCta(insight.format),
  };
}

export function toDetail(insight: PopulatedInsight, related: InsightCard[] = []): InsightDetail {
  return {
    ...toCard(insight),
    body: insight.body ?? null,
    videoUrl: insight.videoUrl ?? null,
    related,
  };
}
