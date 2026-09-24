import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { IMAGE_SIZES } from '../../../config/constants.js';
import { logger } from '../../../core/logger.js';
import type {
  IPublicStorage,
  ImageSizeUrls,
  PutImageInput,
  StoredImage,
} from '../../../interfaces/integrations/storage.interface.js';

/**
 * Files on disk, for development and tests.
 *
 * Needs no credentials and no network, which is what lets the whole suite run
 * the real upload path rather than a mock of it. The three widths are rendered
 * here with sharp and written beside the original, because a plain file server
 * cannot resize on request the way Cloudinary can.
 */

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/** A readable, unguessable key: `2026/06/reception-<uuid>`. */
function keyFor(originalFilename: string): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');

  const stem =
    originalFilename
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'image';

  return `${String(now.getUTCFullYear())}/${month}/${stem}-${randomUUID()}`;
}

export function createLocalStorage(directory: string, baseUrl: string): IPublicStorage {
  const pathFor = (name: string): string => join(directory, name);
  const urlFor = (name: string): string => `${baseUrl.replace(/\/$/, '')}/uploads/${name}`;

  return {
    name: 'local',

    async put(input: PutImageInput): Promise<StoredImage> {
      const extension = EXTENSIONS[input.mimeType] ?? 'bin';
      const key = keyFor(input.originalFilename);
      const original = `${key}.${extension}`;

      await mkdir(dirname(pathFor(original)), { recursive: true });
      await writeFile(pathFor(original), input.buffer);

      const widths = Object.entries(IMAGE_SIZES) as [keyof ImageSizeUrls, number][];

      const rendered = await Promise.all(
        widths.map(async ([label, width]) => {
          const name = `${key}-${label}.${extension}`;

          // `withoutEnlargement` so a small upload is not upscaled into a
          // blurry "large" version that is bigger than the original.
          await sharp(input.buffer)
            .resize({ width, withoutEnlargement: true })
            .toFile(pathFor(name));

          return [label, urlFor(name)] as const;
        })
      );

      return {
        storageKey: key,
        url: urlFor(original),
        sizes: Object.fromEntries(rendered) as unknown as ImageSizeUrls,
      };
    },

    resize(): undefined {
      // The three widths are whole files written at upload time, and none of
      // them is cropped, so the focal point changes nothing about them. The
      // frontend applies it when it crops (ADR-030).
      return undefined;
    },

    async remove(storageKey: string): Promise<void> {
      const extension = Object.values(EXTENSIONS);

      // The extension is not part of the key, so every candidate is tried.
      // `force` makes a miss a no-op rather than an error.
      await Promise.all(
        extension.flatMap((ext) =>
          ['', '-sm', '-md', '-lg'].map(async (suffix) => {
            try {
              await rm(pathFor(`${storageKey}${suffix}.${ext}`), { force: true });
            } catch (error) {
              logger.warn({ err: error, storageKey }, 'could not remove a stored image');
            }
          })
        )
      );
    },
  };
}
