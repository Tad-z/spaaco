import type { Types } from 'mongoose';
import type { ContentStatus, StatSource } from '../constants/enums.js';
import type { LegacySource, LinkKind } from '../types/api.js';

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

/**
 * A call to action the design shows before its destination is decided: a real
 * label, with `href` and `kind` both null until someone decides (ADR-056).
 */
export interface IPendingLink {
  label: string;
  href?: string | null;
  kind?: LinkKind | null;
}

/**
 * The banner at the top of every inner page.
 *
 * `images` are carousel slides: only the picture changes, the copy is shared.
 * Empty until the firm uploads one (ADR-046).
 */
export interface IHero {
  title: string;
  subtitle?: string | null;
  images: Types.ObjectId[];
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
 * Where an imported record came from (ADR-059). Null on content made by hand.
 * Lets a bad import be found, and removed, with one query.
 */
export interface ILegacyImport {
  source: LegacySource;
  legacyId: number;
  importedAt: Date;
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
