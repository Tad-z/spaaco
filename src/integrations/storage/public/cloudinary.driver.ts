import { createHash } from 'node:crypto';
import { IMAGE_SIZES } from '../../../config/constants.js';
import { InternalError } from '../../../core/errors.js';
import type {
  FocalPoint,
  IPublicStorage,
  ImageSizeUrls,
  PutImageInput,
  StoredImage,
} from '../../../interfaces/integrations/storage.interface.js';

/**
 * Cloudinary, over its REST API.
 *
 * No SDK: the upload is one signed multipart POST and the sizes are URLs, so a
 * dependency would buy nothing and cost a supply-chain surface. Signed rather
 * than unsigned uploads, so the API key alone cannot be used to fill the
 * firm's account from a browser.
 *
 * The three widths are transformation URLs (`f_auto,q_auto`), which is why the
 * original is uploaded once: Cloudinary renders and caches each width on first
 * request.
 */

export interface CloudinaryCredentials {
  readonly cloudName: string;
  readonly apiKey: string;
  readonly apiSecret: string;
}

/** `cloudinary://<api_key>:<api_secret>@<cloud_name>` */
export function parseCloudinaryUrl(value: string): CloudinaryCredentials {
  const url = new URL(value);

  const cloudName = url.hostname;
  const apiKey = decodeURIComponent(url.username);
  const apiSecret = decodeURIComponent(url.password);

  if (url.protocol !== 'cloudinary:' || cloudName === '' || apiKey === '' || apiSecret === '') {
    throw new Error('CLOUDINARY_URL must be cloudinary://<api_key>:<api_secret>@<cloud_name>');
  }

  return { cloudName, apiKey, apiSecret };
}

/** Cloudinary signs the sorted, non-empty params, then appends the secret. */
function sign(params: Record<string, string>, apiSecret: string): string {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key] ?? ''}`)
    .join('&');

  return createHash('sha1').update(`${canonical}${apiSecret}`).digest('hex');
}

interface UploadResponse {
  public_id?: unknown;
  secure_url?: unknown;
  format?: unknown;
}

export function createCloudinaryStorage(
  credentials: CloudinaryCredentials,
  fetchImpl: typeof fetch = fetch
): IPublicStorage {
  const { cloudName, apiKey, apiSecret } = credentials;
  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  /**
   * Transformation URLs, with the focal point as gravity (ADR-030).
   *
   * `g_xy_center` tells Cloudinary which point to keep when a crop has to
   * choose, so a portrait is not beheaded on a narrow viewport. It only bites
   * once a crop is applied, which is why the widths stay `c_limit` here and the
   * coordinates ride along for the frontend's own transformations.
   */
  const sizeUrls = (
    publicId: string,
    format: string,
    focalPoint: FocalPoint = { x: 0.5, y: 0.5 }
  ): ImageSizeUrls => {
    const gravity = `g_xy_center,x_${focalPoint.x.toFixed(3)},y_${focalPoint.y.toFixed(3)}`;

    const at = (width: number): string =>
      `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,c_limit,w_${String(width)},${gravity}/${publicId}.${format}`;

    return { sm: at(IMAGE_SIZES.sm), md: at(IMAGE_SIZES.md), lg: at(IMAGE_SIZES.lg) };
  };

  /** A public id carries no extension, so the delivery format comes from the type. */
  const formatOf = (mimeType: string): string => mimeType.split('/').pop() ?? 'jpg';

  return {
    name: 'cloudinary',

    async put(input: PutImageInput): Promise<StoredImage> {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const params = { folder: 'spa-ajibade', timestamp };

      const form = new FormData();
      form.set('file', new Blob([new Uint8Array(input.buffer)], { type: input.mimeType }));
      form.set('api_key', apiKey);
      form.set('timestamp', timestamp);
      form.set('folder', params.folder);
      form.set('signature', sign(params, apiSecret));

      const response = await fetchImpl(endpoint, { method: 'POST', body: form });

      if (!response.ok) {
        throw new InternalError(`Cloudinary rejected the upload (${String(response.status)})`);
      }

      const body = (await response.json()) as UploadResponse;

      if (typeof body.public_id !== 'string' || typeof body.secure_url !== 'string') {
        throw new InternalError('Cloudinary returned an upload without a public_id');
      }

      const format = typeof body.format === 'string' ? body.format : 'jpg';

      return {
        storageKey: body.public_id,
        url: body.secure_url,
        sizes: sizeUrls(body.public_id, format, input.focalPoint),
      };
    },

    resize(storageKey: string, mimeType: string, focalPoint: FocalPoint): ImageSizeUrls {
      // No upload needed: the widths are URLs, so a new focal point is simply a
      // new set of URLs over the same stored original.
      return sizeUrls(storageKey, formatOf(mimeType), focalPoint);
    },

    async remove(storageKey: string): Promise<void> {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const params = { public_id: storageKey, timestamp };

      const form = new FormData();
      form.set('public_id', storageKey);
      form.set('api_key', apiKey);
      form.set('timestamp', timestamp);
      form.set('signature', sign(params, apiSecret));

      await fetchImpl(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
        method: 'POST',
        body: form,
      });
    },
  };
}
