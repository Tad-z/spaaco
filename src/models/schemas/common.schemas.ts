import { Schema } from 'mongoose';
import { LINK_KINDS, STAT_SOURCES } from '../../constants/enums.js';
import type {
  IHero,
  IIconItem,
  ILink,
  IPendingLink,
  ISectionHeader,
  ISeo,
  ISeoBasic,
  IStat,
  ITitledBody,
} from '../../interfaces/common.interface.js';

/**
 * Embedded sub-schemas shared across collections and page documents.
 *
 * `_id: false` throughout: these are values owned by their parent, not
 * independently addressable documents, and stray `_id`s would leak into admin
 * payloads and break the GET → PUT round-trip.
 */

const subSchema = { _id: false, versionKey: false } as const;

export const linkSchema = new Schema<ILink>(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    href: { type: String, required: true, trim: true, maxlength: 2048 },
    kind: { type: String, required: true, enum: LINK_KINDS.values, default: 'internal' },
  },
  subSchema
);

/** A CTA with no destination yet: `href` and `kind` stay null until decided (ADR-056). */
export const pendingLinkSchema = new Schema<IPendingLink>(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    href: { type: String, default: null, trim: true, maxlength: 2048 },
    kind: { type: String, enum: [...LINK_KINDS.values, null], default: null },
  },
  subSchema
);

export const seoSchema = new Schema<ISeo>(
  {
    title: { type: String, default: null, trim: true, maxlength: 200 },
    description: { type: String, default: null, trim: true, maxlength: 400 },
    ogImage: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
  },
  subSchema
);

/** Collection items carry no Open Graph image; only pages do (ADR-023). */
export const seoBasicSchema = new Schema<ISeoBasic>(
  {
    title: { type: String, default: null, trim: true, maxlength: 200 },
    description: { type: String, default: null, trim: true, maxlength: 400 },
  },
  subSchema
);

export const heroSchema = new Schema<IHero>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    subtitle: { type: String, default: null, trim: true, maxlength: 600 },
    images: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    primaryCta: { type: linkSchema, default: null },
    secondaryCta: { type: linkSchema, default: null },
  },
  subSchema
);

export const sectionHeaderSchema = new Schema<ISectionHeader>(
  {
    eyebrow: { type: String, default: null, trim: true, maxlength: 160 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    cta: { type: linkSchema, default: null },
  },
  subSchema
);

export const iconItemSchema = new Schema<IIconItem>(
  {
    // An icon *key* the frontend maps to its own set, never an asset URL:
    // icons belong to the frontend codebase (ADR-012).
    icon: { type: String, required: true, trim: true, maxlength: 60 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    text: { type: String, default: null, trim: true, maxlength: 600 },
  },
  subSchema
);

export const statSchema = new Schema<IStat>(
  {
    value: { type: String, required: true, trim: true, maxlength: 60 },
    caption: { type: String, required: true, trim: true, maxlength: 200 },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    source: { type: String, required: true, enum: STAT_SOURCES.values, default: 'manual' },
  },
  subSchema
);

export const titledBodySchema = new Schema<ITitledBody>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    // Sanitised HTML since v2: "Our Asset" has bold phrases.
    body: { type: String, required: true, maxlength: 8000 },
  },
  subSchema
);
