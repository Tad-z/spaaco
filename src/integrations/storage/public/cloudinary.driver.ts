import { createHash } from 'node:crypto';
import { IMAGE_SIZES } from '../../../config/constants.js';
import { InternalError } from '../../../core/errors.js';
import type {
  IPublicStorage,
  ImageSizeUrls,
  PutDocumentInput,
  PutImageInput,
  StoredDocument,
  StoredImage,
  StoredKind,
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
   * Transformation URLs for the three widths (ADR-030).
   *
   * The widths only scale down (`c_limit`), never crop, so they carry no
   * gravity: Cloudinary refuses `g_xy_center` without a cropping mode, with a
   * 400 for every size. The focal point reaches the frontend as its own field
   * on the image, for the crops it makes itself.
   */
  const sizeUrls = (publicId: string, format: string): ImageSizeUrls => {
    const at = (width: number): string =>
      `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,c_limit,w_${String(width)}/${publicId}.${format}`;

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
        sizes: sizeUrls(body.public_id, format),
      };
    },

    /**
     * A PDF goes up as a `raw` resource: delivered byte for byte, never run
     * through the image pipeline, which would rasterise it (ADR-053).
     */
    async putDocument(input: PutDocumentInput): Promise<StoredDocument> {
      const timestamp = String(Math.floor(Date.now() / 1000));
      // A raw public id keeps the uploaded filename's extension only when
      // asked to, and without `.pdf` in the delivered URL a browser downloads
      // the profile instead of opening it. `unique_filename` keeps two
      // uploads of "profile.pdf" from colliding.
      const params = {
        folder: 'spa-ajibade',
        timestamp,
        unique_filename: 'true',
        use_filename: 'true',
      };
      const filename = /\.pdf$/i.test(input.originalFilename)
        ? input.originalFilename
        : `${input.originalFilename}.pdf`;

      const form = new FormData();
      form.set(
        'file',
        new Blob([new Uint8Array(input.buffer)], { type: 'application/pdf' }),
        filename
      );
      form.set('api_key', apiKey);
      form.set('timestamp', timestamp);
      form.set('folder', params.folder);
      form.set('unique_filename', params.unique_filename);
      form.set('use_filename', params.use_filename);
      form.set('signature', sign(params, apiSecret));

      const response = await fetchImpl(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, {
        method: 'POST',
        body: form,
      });

      if (!response.ok) {
        throw new InternalError(`Cloudinary rejected the upload (${String(response.status)})`);
      }

      const body = (await response.json()) as UploadResponse;

      if (typeof body.public_id !== 'string' || typeof body.secure_url !== 'string') {
        throw new InternalError('Cloudinary returned an upload without a public_id');
      }

      return { storageKey: body.public_id, url: body.secure_url };
    },

    resize(storageKey: string, mimeType: string): ImageSizeUrls {
      // The widths no longer depend on the focal point, but rebuilding them
      // costs nothing, and it rewrites the URLs stored before gravity was
      // dropped, which Cloudinary refuses. `rebuild-image-sizes` relies on it.
      return sizeUrls(storageKey, formatOf(mimeType));
    },

    async remove(storageKey: string, kind: StoredKind = 'image'): Promise<void> {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const params = { public_id: storageKey, timestamp };

      const form = new FormData();
      form.set('public_id', storageKey);
      form.set('api_key', apiKey);
      form.set('timestamp', timestamp);
      form.set('signature', sign(params, apiSecret));

      // Images and raw files live under different resource types.
      const resource = kind === 'document' ? 'raw' : 'image';
      await fetchImpl(`https://api.cloudinary.com/v1_1/${cloudName}/${resource}/destroy`, {
        method: 'POST',
        body: form,
      });
    },
  };
}
