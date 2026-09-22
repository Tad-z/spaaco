import type { PracticeAreaCard, PracticeAreaRef } from '../types/api.js';
import type { IPracticeArea } from '../interfaces/practice-area.interface.js';
import type { IMedia } from '../interfaces/media.interface.js';
import { toNullableImage } from './image.serializer.js';

/**
 * Serializers declare the minimum they read, not a whole document. That lets
 * callers project only what they need — the footer wants four fields, not a
 * body field and a populated image.
 */

export interface PracticeAreaRefSource {
  _id: { toString: () => string };
  slug: string;
  title: string;
  shortLabel: string;
}

export interface PracticeAreaCardSource extends PracticeAreaRefSource {
  summary: string;
  image?: IMedia | null;
}

export interface PracticeAreaDetailSource extends PracticeAreaCardSource {
  body?: string | null;
  keyServices?: string[];
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

export function toCard(area: PracticeAreaCardSource): PracticeAreaCard {
  return {
    ...toRef(area),
    summary: area.summary,
    image: toNullableImage(area.image),
  };
}
