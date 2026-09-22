import type { Types } from 'mongoose';
import type { ContentStatus, StatSource } from '../constants/enums.js';
import type { LinkKind } from '../types/api.js';

/**
 * Shapes shared by several collections.
 *
 * These describe **stored documents**, not API responses. They differ on
 * purpose: a stored image field is an ObjectId, while the API returns a full
 * Image object; a stored stat keeps its `source`, while the API returns the
 * resolved value. Serializers bridge the two.
 */

/** A navigation link or call to action. */
export interface ILink {
  label: string;
  href: string;
  kind: LinkKind;
}

/** The banner at the top of every inner page. */
export interface IHero {
  title: string;
  subtitle?: string | null;
  image?: Types.ObjectId | null;
  primaryCta?: ILink | null;
  secondaryCta?: ILink | null;
}

/** The eyebrow/title/CTA trio that opens most sections. */
export interface ISectionHeader {
  eyebrow?: string | null;
  title: string;
  cta?: ILink | null;
}

/** A point in an icon grid. `icon` is a key the frontend maps to its icon set. */
export interface IIconItem {
  icon: string;
  title: string;
  text?: string | null;
}

/**
 * A figure in the About stats row. With a computed `source` the stored `value`
 * is ignored and recalculated on read, so figures cannot go stale (ADR-009).
 */
export interface IStat {
  value: string;
  caption: string;
  label: string;
  source: StatSource;
}

/** Search metadata for a page. Only pages carry an Open Graph image. */
export interface ISeo {
  title?: string | null;
  description?: string | null;
  ogImage?: Types.ObjectId | null;
}

/** Search metadata for a collection item (ADR-023: no ogImage). */
export interface ISeoBasic {
  title?: string | null;
  description?: string | null;
}

/** A heading with a body, used by the About accordion. */
export interface ITitledBody {
  title: string;
  body: string;
}

/**
 * Fields the content plugin adds to every editable collection.
 *
 * `revision` backs optimistic locking: an admin write sends the revision it
 * read, and a mismatch is a 409 rather than a silent overwrite (ADR-015).
 */
export interface IContentFields {
  slug: string;
  status: ContentStatus;
  publishedAt?: Date | null;
  order: number;
  revision: number;
  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}
