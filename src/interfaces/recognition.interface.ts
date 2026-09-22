import type { Types } from 'mongoose';
import type { IContentFields } from './common.interface.js';
import type { RecognitionTab } from '../types/api.js';

/** A badge tile in the Home recognition section. */
export interface IRecognition extends IContentFields {
  organization: string;
  title: string;
  year?: number | null;
  badge?: Types.ObjectId | null;
  url?: string | null;
  tab: RecognitionTab;
}
