import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createCloudinaryStorage,
  parseCloudinaryUrl,
} from '../../../src/integrations/storage/public/cloudinary.driver.js';

/**
 * The real Cloudinary driver, with a fake `fetch`.
 *
 * The request it builds is the whole contract with Cloudinary — a wrong
 * signature or a missing field fails only against the live service, which no
 * test here may call. So the request is asserted, not just the happy return.
 */

const CREDENTIALS = { cloudName: 'spa-demo', apiKey: '123456789', apiSecret: 'shh-secret' };

const okResponse = (body: unknown): Partial<Response> => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
});

/** A FormData field that must be a string, narrowed rather than stringified. */
const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  if (typeof value !== 'string') throw new Error(`${name} is missing from the request`);

  return value;
};

const driverWith = (fetchImpl: typeof fetch): ReturnType<typeof createCloudinaryStorage> =>
  createCloudinaryStorage(CREDENTIALS, fetchImpl);

const png = Buffer.from('89504e470d0a1a0a', 'hex');

describe('parseCloudinaryUrl', () => {
  it('reads the cloud name, key and secret', () => {
    expect(parseCloudinaryUrl('cloudinary://key:secret@cloud-name')).toEqual({
      cloudName: 'cloud-name',
      apiKey: 'key',
      apiSecret: 'secret',
    });
  });

  it('decodes a secret containing URL-escaped characters', () => {
    const parsed = parseCloudinaryUrl('cloudinary://key:a%2Fb%40c@cloud');

    expect(parsed.apiSecret).toBe('a/b@c');
  });

  it('refuses a URL that is not a cloudinary one', () => {
    expect(() => parseCloudinaryUrl('https://key:secret@cloud')).toThrow(/CLOUDINARY_URL/);
  });

  it('refuses a URL with no secret', () => {
    expect(() => parseCloudinaryUrl('cloudinary://key@cloud')).toThrow(/CLOUDINARY_URL/);
  });
});

describe('uploading', () => {
  it('posts a signed multipart request to the right cloud', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse({
        public_id: 'spa-ajibade/abc123',
        secure_url: 'https://res.cloudinary.com/x.png',
        format: 'png',
      })
    );

    await driverWith(fetchImpl).put({
      buffer: png,
      mimeType: 'image/png',
      originalFilename: 'reception.png',
    });

    expect(fetchImpl).toHaveBeenCalledOnce();

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.cloudinary.com/v1_1/spa-demo/image/upload');
    expect(init.method).toBe('POST');

    const form = init.body as FormData;
    expect(form.get('api_key')).toBe(CREDENTIALS.apiKey);
    expect(form.get('folder')).toBe('spa-ajibade');
    expect(form.get('file')).toBeInstanceOf(Blob);

    // Signed, not unsigned: the API key alone must not be enough to upload.
    const timestamp = field(form, 'timestamp');
    const expected = createHash('sha1')
      .update(`folder=spa-ajibade&timestamp=${timestamp}${CREDENTIALS.apiSecret}`)
      .digest('hex');

    expect(form.get('signature')).toBe(expected);
    // The secret itself is never sent.
    expect([...form.keys()]).not.toContain('api_secret');
  });

  it('returns transformation URLs for the three widths', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse({
        public_id: 'spa-ajibade/abc123',
        secure_url: 'https://res.cloudinary.com/x.jpg',
        format: 'jpg',
      })
    );

    const stored = await driverWith(fetchImpl).put({
      buffer: png,
      mimeType: 'image/jpeg',
      originalFilename: 'a.jpg',
    });

    expect(stored.storageKey).toBe('spa-ajibade/abc123');
    expect(stored.sizes.sm).toContain('w_480');
    expect(stored.sizes.md).toContain('w_960');
    expect(stored.sizes.lg).toContain('w_1440');
    // f_auto lets Cloudinary serve AVIF or WebP to browsers that take them.
    expect(stored.sizes.lg).toContain('f_auto,q_auto');
  });

  it('embeds the focal point as gravity, so a crop keeps the right part', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse({
        public_id: 'spa-ajibade/abc123',
        secure_url: 'https://res.cloudinary.com/x.jpg',
        format: 'jpg',
      })
    );

    const stored = await driverWith(fetchImpl).put({
      buffer: png,
      mimeType: 'image/jpeg',
      originalFilename: 'portrait.jpg',
      focalPoint: { x: 0.25, y: 0.75 },
    });

    expect(stored.sizes.md).toContain('g_xy_center,x_0.250,y_0.750');
  });

  it('centres by default when no focal point is given', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse({
        public_id: 'spa-ajibade/abc123',
        secure_url: 'https://res.cloudinary.com/x.jpg',
        format: 'jpg',
      })
    );

    const stored = await driverWith(fetchImpl).put({
      buffer: png,
      mimeType: 'image/jpeg',
      originalFilename: 'a.jpg',
    });

    expect(stored.sizes.md).toContain('x_0.500,y_0.500');
  });

  it('fails loudly when Cloudinary rejects the upload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });

    await expect(
      driverWith(fetchImpl).put({ buffer: png, mimeType: 'image/png', originalFilename: 'a.png' })
    ).rejects.toThrow(/401/);
  });

  it('fails when the response has no public_id, rather than storing a broken record', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ secure_url: 'https://x' }));

    await expect(
      driverWith(fetchImpl).put({ buffer: png, mimeType: 'image/png', originalFilename: 'a.png' })
    ).rejects.toThrow(/public_id/);
  });
});

describe('changing the focal point', () => {
  it('rebuilds the size URLs without re-uploading anything', () => {
    const fetchImpl = vi.fn();

    const sizes = driverWith(fetchImpl).resize('spa-ajibade/abc123', 'image/png', {
      x: 0.1,
      y: 0.9,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sizes?.lg).toBe(
      'https://res.cloudinary.com/spa-demo/image/upload/' +
        'f_auto,q_auto,c_limit,w_1440,g_xy_center,x_0.100,y_0.900/spa-ajibade/abc123.png'
    );
  });
});

describe('removing', () => {
  it('posts a signed destroy request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ result: 'ok' }));

    await driverWith(fetchImpl).remove('spa-ajibade/abc123');

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.cloudinary.com/v1_1/spa-demo/image/destroy');

    const form = init.body as FormData;
    expect(form.get('public_id')).toBe('spa-ajibade/abc123');

    const timestamp = field(form, 'timestamp');
    const expected = createHash('sha1')
      .update(`public_id=spa-ajibade/abc123&timestamp=${timestamp}${CREDENTIALS.apiSecret}`)
      .digest('hex');

    expect(form.get('signature')).toBe(expected);
  });
});

describe('PDF documents (ADR-053)', () => {
  const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');

  it('uploads a PDF as a raw resource, signed, so it is never rasterised', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        okResponse({
          public_id: 'spa-ajibade/firm-profile',
          secure_url: 'https://res.cloudinary.com/spa-demo/raw/upload/spa-ajibade/firm-profile.pdf',
        }) as Response
      )
    );

    const stored = await driverWith(fetchImpl).putDocument({
      buffer: pdf,
      originalFilename: 'firm-profile.pdf',
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const form = init.body as FormData;

    expect(url).toBe('https://api.cloudinary.com/v1_1/spa-demo/raw/upload');
    const expected = createHash('sha1')
      .update(`folder=spa-ajibade&timestamp=${field(form, 'timestamp')}shh-secret`)
      .digest('hex');
    expect(field(form, 'signature')).toBe(expected);
    expect(stored).toEqual({
      storageKey: 'spa-ajibade/firm-profile',
      url: 'https://res.cloudinary.com/spa-demo/raw/upload/spa-ajibade/firm-profile.pdf',
    });
  });

  it('destroys a document under the raw resource type, where it lives', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse({ result: 'ok' }) as Response));

    await driverWith(fetchImpl).remove('spa-ajibade/firm-profile', 'document');

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://api.cloudinary.com/v1_1/spa-demo/raw/destroy');
  });
});
