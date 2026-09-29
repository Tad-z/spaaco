import type { Types } from 'mongoose';
import type { IContentFields } from './common.interface.js';

/** A legal directory that ranks the firm — IFLR 1000, Chambers Global… (ADR-056). */
export interface IRecognitionDirectory extends IContentFields {
  name: string;
  /** The wordmark in the "Independently Recognized By" tile. */
  logo?: Types.ObjectId | null;
  heroSubtitle?: string | null;
  heroImages: Types.ObjectId[];
}
