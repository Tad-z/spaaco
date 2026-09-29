import type { Types } from 'mongoose';
import type { IContentFields } from './common.interface.js';

/** An award a recognition directory gave the firm (ADR-056). */
export interface IAward extends IContentFields {
  directory: Types.ObjectId;
  title: string;
  year: number;
  badge?: Types.ObjectId | null;
  /** A badge in the Home Recognition band and the Achievements tab. */
  featuredOnHome: boolean;
}
