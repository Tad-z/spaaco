import type { PracticeAreaCard, PracticeAreaRef } from '../types/api.js';
import type { IPracticeArea } from '../interfaces/practice-area.interface.js';
import type { IMedia } from '../interfaces/media.interface.js';
import { toNullableImage } from './image.serializer.js';

/** A practice area with its image populated. */
export type PopulatedPracticeArea = Omit<IPracticeArea, 'image'> & {
  _id: { toString: () => string };
  image?: IMedia | null;
};

/** The minimal form used for chips, dropdowns and footer links. */
export function toRef(area: PopulatedPracticeArea): PracticeAreaRef {
  return {
    id: area._id.toString(),
    slug: area.slug,
    title: area.title,
    shortLabel: area.shortLabel,
  };
}

export function toCard(area: PopulatedPracticeArea): PracticeAreaCard {
  return {
    ...toRef(area),
    summary: area.summary,
    image: toNullableImage(area.image),
  };
}
