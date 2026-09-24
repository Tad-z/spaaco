import { Schema, Types } from 'mongoose';
import type { Model } from 'mongoose';
import { CONTENT_STATUSES } from '../../constants/enums.js';
import { MAX_SLUG_LENGTH, isSlug, slugCandidate, slugify } from '../../helpers/slug.helper.js';

/**
 * Fields and behaviour shared by every editable content collection.
 *
 * Adds slug, status, publishedAt, order, revision and audit fields, generates a
 * unique slug from a source field, stamps `publishedAt` the first time an item
 * is published, and normalises `toJSON` so `_id` becomes `id`.
 */

export interface ContentPluginOptions {
  /**
   * Field a slug is generated from when the caller supplies none — `title` for
   * most collections, `question` for FAQs, `name` for offices.
   */
  readonly source: string;
}

/** How many suffixed candidates to try before giving up. */
const MAX_SLUG_ATTEMPTS = 50;

interface ContentDocumentShape {
  slug?: unknown;
  status?: unknown;
  publishedAt?: unknown;
  revision?: unknown;
  [key: string]: unknown;
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

export function contentPlugin(schema: Schema, options: ContentPluginOptions): void {
  schema.add({
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: MAX_SLUG_LENGTH,
      validate: {
        validator: isSlug,
        message: 'slug must be lowercase kebab-case',
      },
    },
    status: {
      type: String,
      required: true,
      enum: CONTENT_STATUSES.values,
      default: 'draft',
      index: true,
    },
    /** Set once, the first time the item is published. */
    publishedAt: { type: Date, default: null },
    /** Manual sort position within the collection. */
    order: { type: Number, default: 0 },
    /** Optimistic-locking counter; see ADR-015. */
    revision: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  });

  /**
   * Generate a slug when one is missing, adding `-2`, `-3`, … until it is free.
   *
   * The unique index is still the real guarantee: two concurrent creates can
   * both see the same slug as free, and the loser gets a duplicate-key error
   * rather than a silently overwritten record.
   */
  schema.pre('validate', async function (next) {
    const doc = this as unknown as ContentDocumentShape;

    if (asString(doc.slug) === undefined) {
      const source = asString(doc[options.source]);
      if (source === undefined) {
        next(
          new Error(
            `Cannot generate a slug: "${options.source}" is empty and no slug was supplied.`
          )
        );
        return;
      }

      const base = slugify(source);
      if (base === '') {
        next(new Error(`Cannot generate a slug from "${options.source}": no usable characters.`));
        return;
      }

      const model = this.constructor as Model<unknown>;
      const id: unknown = this._id;

      for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
        const candidate = slugCandidate(base, attempt);
        // Exclude this document, so re-validating an existing record does not
        // collide with itself.
        const clash = await model.exists({ slug: candidate, _id: { $ne: id } });
        if (!clash) {
          doc.slug = candidate;
          break;
        }
      }

      if (asString(doc.slug) === undefined) {
        next(
          new Error(`Could not find a free slug for "${base}" after ${MAX_SLUG_ATTEMPTS} tries.`)
        );
        return;
      }
    }

    next();
  });

  /** Stamp publishedAt on first publish, and bump the revision on every save. */
  schema.pre('save', function (next) {
    const doc = this as unknown as ContentDocumentShape;

    if (doc.status === 'published' && (doc.publishedAt === null || doc.publishedAt === undefined)) {
      doc.publishedAt = new Date();
    }

    if (!this.isNew) {
      doc.revision = typeof doc.revision === 'number' ? doc.revision + 1 : 1;
    }

    next();
  });

  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret: Record<string, unknown>) => {
      // `id` is the contract's field name; `_id` and `__v` are storage details.
      const objectId: unknown = ret._id;
      if (objectId instanceof Types.ObjectId) {
        ret.id = objectId.toHexString();
      } else if (typeof objectId === 'string') {
        ret.id = objectId;
      }
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  });

  schema.set('toObject', { virtuals: true });
}
