import type { Types } from 'mongoose';
import type { IContentFields } from './common.interface.js';
import type { InsightCategory, InsightFormat } from '../types/api.js';

/** An article, news item, video or pro bono story. */
export interface IInsight extends IContentFields {
  title: string;
  excerpt?: string | null;
  /** Sanitised HTML. Null for video insights. */
  body?: string | null;
  format: InsightFormat;
  /** Required when `format` is `video`. A YouTube, Vimeo or Cloudinary link. */
  videoUrl?: string | null;
  /** Where the article's "Read Article" link goes. At most one of this and `document`. */
  externalUrl?: string | null;
  /** An uploaded PDF (`kind: document`) that "Read Article" opens. */
  document?: Types.ObjectId | null;
  categories: InsightCategory[];
  practiceAreas: Types.ObjectId[];
  /** Null means the firm itself is the author, not a missing value. */
  author?: Types.ObjectId | null;
  coverImage?: Types.ObjectId | null;
  featured: boolean;
}
