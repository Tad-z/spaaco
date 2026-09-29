import type { Types } from 'mongoose';
import type { MediaKind } from '../types/api.js';

/**
 * An uploaded image or PDF document in the library (ADR-053).
 *
 * Media is not a content collection: it has no slug, status or publish state.
 * The firm uploads through the admin UI and attaches media to content by ID.
 *
 * The `_id` is stable across file replacements while `url` changes, so every
 * page referencing it picks up the new file at once and no cache can serve the
 * old one (ADR-013).
 *
 * The image-only fields — `sizes`, dimensions, `alt`, `focalPoint` — are absent
 * on a document, whose `title` is required instead.
 */
export interface IMedia {
  kind: MediaKind;
  provider: 'local' | 'cloudinary';
  /** Key in the storage backend. Never exposed publicly. */
  storageKey: string;
  url: string;
  /**
   * The three responsive widths. Stored rather than derived, because the rule
   * differs per provider and a serializer cannot know which one applies.
   */
  sizes?: { sm: string; md: string; lg: string } | null;
  /** Incremented on every file replacement, so URLs stay cache-bustable. */
  version: number;
  width?: number | null;
  height?: number | null;
  mimeType: string;
  bytes: number;
  originalFilename?: string | null;
  title?: string | null;
  /** Required on an image: the admin UI enforces alt text on upload. */
  alt?: string | null;
  /** Optimistic-locking counter; see ADR-015. */
  revision: number;
  /** Relative focal point for art-directed cropping. Defaults to the centre. */
  focalPoint?: { x: number; y: number } | null;
  uploadedBy?: Types.ObjectId | null;
  replacedBy?: Types.ObjectId | null;
  replacedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
