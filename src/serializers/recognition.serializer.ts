import type { Recognition } from '../types/api.js';
import type { IRecognition } from '../interfaces/recognition.interface.js';
import type { IMedia } from '../interfaces/media.interface.js';
import { toNullableImage } from './image.serializer.js';

export type RecognitionSource = Omit<IRecognition, 'badge'> & {
  _id: { toString: () => string };
  badge?: IMedia | null;
};

export const toRecognition = (recognition: RecognitionSource): Recognition => ({
  id: recognition._id.toString(),
  organization: recognition.organization,
  title: recognition.title,
  year: recognition.year ?? null,
  badge: toNullableImage(recognition.badge),
  url: recognition.url ?? null,
  tab: recognition.tab,
});
