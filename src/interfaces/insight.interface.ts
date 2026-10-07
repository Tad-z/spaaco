import type { Types } from 'mongoose';
import type { IContentFields, ILegacyImport } from './common.interface.js';
import type { InsightCategory, InsightFormat } from '../types/api.js';

/** An attorney on the site (`person`), or anyone else by `name` with an optional `photo`. */
export interface IInsightCoAuthor {
  person?: Types.ObjectId | null;
  name?: string | null;
  photo?: Types.ObjectId | null;
}

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
  /** A writer with no attorney profile (ADR-060). At most one of this and `author`. */
  authorName?: string | null;
  /** The named writer's photo (ADR-064). Not set alongside `author`. */
  authorPhoto?: Types.ObjectId | null;
  /** Shown after the author, in order (ADR-064). */
  coAuthors?: IInsightCoAuthor[];
  coverImage?: Types.ObjectId | null;
  featured: boolean;
  /** Set when the record came from a content import (ADR-059). */
  legacy?: ILegacyImport | null;
}
