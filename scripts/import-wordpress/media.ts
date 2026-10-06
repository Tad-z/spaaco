/**
 * Old upload paths → media library records.
 *
 * Files come from the unzipped `uploads-export.zip`, never from the old domain
 * (its URLs are dead). Each file is uploaded once: the media id and URL are
 * kept in the run state, which is saved to disk, so a re-run reuses them
 * rather than filling the library with duplicates.
 */
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { UPLOAD_LIMITS } from '../../src/config/constants.js';
import type { AdminApi, UploadedMedia } from './api.js';
import type { RunState } from './state.js';

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

export type MediaProblem = 'missing' | 'unsupported type' | 'too large';

export type Resolved =
  | {
      readonly ok: true;
      readonly local: string;
      readonly kind: 'image' | 'document';
      readonly mime: string;
    }
  | { readonly ok: false; readonly problem: MediaProblem };

/**
 * The local file for an upload path. A link to a resized copy
 * (`photo-300x200.jpg`) or to the pre-5.3 original of a `-scaled` image falls
 * back to the file that exists.
 */
export function resolveUpload(uploadsDir: string, relative: string): Resolved {
  const root = normalize(uploadsDir);
  const candidates = [
    relative,
    relative.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, '$1'),
    relative.replace(/(\.[a-z0-9]+)$/i, '-scaled$1'),
  ];

  const found = candidates
    .map((candidate) => normalize(join(root, candidate)))
    // Never outside the uploads folder, whatever the path says.
    .find((path) => path.startsWith(root + sep) && existsSync(path));
  if (found === undefined) return { ok: false, problem: 'missing' };

  const extension = extname(found).toLowerCase();
  const bytes = statSync(found).size;

  if (extension === '.pdf') {
    return bytes > UPLOAD_LIMITS.documentMaxBytes
      ? { ok: false, problem: 'too large' }
      : { ok: true, local: found, kind: 'document', mime: 'application/pdf' };
  }

  const mime = IMAGE_TYPES[extension];
  if (mime === undefined) return { ok: false, problem: 'unsupported type' };
  if (bytes > UPLOAD_LIMITS.imageMaxBytes) return { ok: false, problem: 'too large' };

  return { ok: true, local: found, kind: 'image', mime };
}

export type MediaResult =
  | ({ readonly ok: true; readonly kind: 'image' | 'document' } & UploadedMedia)
  | {
      readonly ok: false;
      readonly problem: MediaProblem | 'upload failed';
      readonly detail?: string;
    };

export class MediaStore {
  constructor(
    private readonly uploadsDir: string,
    /** Null on a dry run: nothing is uploaded, and placeholder ids stand in. */
    private readonly api: AdminApi | null,
    private readonly state: RunState
  ) {}

  /** Number of files that would be, or were, uploaded in this run. */
  uploads = 0;

  /**
   * The media record for an upload path, uploading it on first use. `label` is
   * an image's alt text or a document's title.
   */
  async get(relative: string, label: string): Promise<MediaResult> {
    const resolved = resolveUpload(this.uploadsDir, relative);
    if (!resolved.ok) return resolved;

    const known = this.state.media[relative];
    if (known !== undefined) return { ok: true, kind: resolved.kind, ...known };

    this.uploads += 1;
    if (this.api === null) {
      const placeholder = { id: `dry-run:${relative}`, url: `https://dry-run.invalid/${relative}` };
      this.state.media[relative] = placeholder;
      return { ok: true, kind: resolved.kind, ...placeholder };
    }

    const text = label.trim().slice(0, resolved.kind === 'image' ? 300 : 200) || 'Document';
    try {
      const uploaded = await this.api.upload(
        resolved.local,
        resolved.mime,
        resolved.kind === 'image' ? { kind: 'image', alt: text } : { kind: 'document', title: text }
      );
      this.state.media[relative] = uploaded;
      return { ok: true, kind: resolved.kind, ...uploaded };
    } catch (error) {
      return { ok: false, problem: 'upload failed', detail: (error as Error).message };
    }
  }
}
