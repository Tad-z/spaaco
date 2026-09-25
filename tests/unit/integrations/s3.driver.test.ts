import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createS3PrivateStorage } from '../../../src/integrations/storage/private/s3.driver.js';

/**
 * Signature Version 4, written out by hand, against a fake `fetch`.
 *
 * A signature is either exactly right or entirely useless, and the only
 * feedback AWS gives is a 403 — so the signature is recomputed here
 * independently and compared, rather than the test merely checking that a
 * request went out. The expected values are derived the way the AWS
 * documentation describes, not copied from the implementation.
 */

const CREDENTIALS = {
  bucket: 'spa-ajibade-cvs',
  region: 'eu-west-1',
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

const NOW = new Date('2026-06-01T12:00:00.000Z');
const AMZ_DATE = '20260601T120000Z';
const DATE_STAMP = '20260601';
const SCOPE = `${DATE_STAMP}/${CREDENTIALS.region}/s3/aws4_request`;

const sha256Hex = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

/** The AWS key-derivation chain, rebuilt from the documented steps. */
function expectedSignature(stringToSign: string): string {
  const date = createHmac('sha256', `AWS4${CREDENTIALS.secretAccessKey}`)
    .update(DATE_STAMP)
    .digest();
  const region = createHmac('sha256', date).update(CREDENTIALS.region).digest();
  const service = createHmac('sha256', region).update('s3').digest();
  const signing = createHmac('sha256', service).update('aws4_request').digest();

  return createHmac('sha256', signing).update(stringToSign).digest('hex');
}

const okResponse = (body = ''): Partial<Response> => ({
  ok: true,
  status: 200,
  text: () => Promise.resolve(body),
});

const driverWith = (fetchImpl: typeof fetch): ReturnType<typeof createS3PrivateStorage> =>
  createS3PrivateStorage(CREDENTIALS, fetchImpl, () => NOW);

const cv = Buffer.from('%PDF-1.7 a small cv');

describe('uploading a CV', () => {
  it('PUTs to the bucket with a correct SigV4 signature', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());

    const key = await driverWith(fetchImpl).put({
      buffer: cv,
      mimeType: 'application/pdf',
      extension: 'pdf',
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(url).toBe(`https://spa-ajibade-cvs.s3.eu-west-1.amazonaws.com/${key}`);
    expect(init.method).toBe('PUT');

    const payloadHash = sha256Hex(cv);
    expect(headers['x-amz-content-sha256']).toBe(payloadHash);
    expect(headers['x-amz-acl']).toBe('private');

    // Derived from the headers actually sent, not hardcoded: a hardcoded list
    // would keep passing if the code started sending an unsigned x-amz-header,
    // which is exactly the SigV4 mistake that makes S3 answer 403.
    const signedNames = Object.keys(headers)
      .filter((name) => name === 'host' || name.startsWith('x-amz-'))
      .map((name) => name.toLowerCase())
      .sort();

    expect(signedNames).toContain('x-amz-acl');
    expect(headers.authorization).toContain(`SignedHeaders=${signedNames.join(';')}`);

    const canonicalRequest = [
      'PUT',
      `/${key.split('/').map(encodeURIComponent).join('/')}`,
      '',
      `${signedNames.map((name) => `${name}:${headers[name] ?? ''}`).join('\n')}\n`,
      signedNames.join(';'),
      payloadHash,
    ].join('\n');

    const signature = expectedSignature(
      ['AWS4-HMAC-SHA256', AMZ_DATE, SCOPE, sha256Hex(canonicalRequest)].join('\n')
    );

    expect(headers.authorization).toContain(`Signature=${signature}`);
    expect(headers.authorization).toContain(`Credential=${CREDENTIALS.accessKeyId}/${SCOPE}`);
    // The secret signs; it is never sent.
    expect(JSON.stringify(headers)).not.toContain(CREDENTIALS.secretAccessKey);
  });

  it('names the object randomly, never after the upload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const driver = driverWith(fetchImpl);

    const first = await driver.put({ buffer: cv, mimeType: 'application/pdf', extension: 'pdf' });
    const second = await driver.put({ buffer: cv, mimeType: 'application/pdf', extension: 'pdf' });

    expect(first).toMatch(/^cv\/[0-9a-f-]{36}\.pdf$/);
    expect(first).not.toBe(second);
  });

  it('fails loudly rather than returning a key for a file that was rejected', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });

    await expect(
      driverWith(fetchImpl).put({ buffer: cv, mimeType: 'application/pdf', extension: 'pdf' })
    ).rejects.toThrow(/403/);
  });
});

describe('the signed download link', () => {
  it('is a presigned query URL that expires', async () => {
    const fetchImpl = vi.fn();

    const { url, expiresAt } = await driverWith(fetchImpl).signedUrl(
      'cv/abc.pdf',
      300,
      'temitope-cv.pdf'
    );

    // Presigned, not proxied: no request is made to produce it.
    expect(fetchImpl).not.toHaveBeenCalled();

    const parsed = new URL(url);
    expect(parsed.host).toBe('spa-ajibade-cvs.s3.eu-west-1.amazonaws.com');
    expect(parsed.pathname).toBe('/cv/abc.pdf');
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt.getTime()).toBe(NOW.getTime() + 300_000);
  });

  it('asks S3 to serve it under the name the applicant uploaded', async () => {
    const { url } = await driverWith(vi.fn()).signedUrl('cv/abc.pdf', 300, 'temitope-cv.pdf');

    expect(new URL(url).searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="temitope-cv.pdf"'
    );
  });

  it('signs a different key differently, so one link cannot fetch another CV', async () => {
    const driver = driverWith(vi.fn());

    const mine = await driver.signedUrl('cv/mine.pdf', 300, 'cv.pdf');
    const theirs = await driver.signedUrl('cv/theirs.pdf', 300, 'cv.pdf');

    expect(new URL(mine.url).searchParams.get('X-Amz-Signature')).not.toBe(
      new URL(theirs.url).searchParams.get('X-Amz-Signature')
    );
  });
});

describe('listing, for the orphan sweep', () => {
  const contents = (key: string, modified: string): string =>
    `<Contents><Key>${key}</Key><LastModified>${modified}</LastModified></Contents>`;

  const page = (entries: [string, string][], next?: string): Partial<Response> =>
    okResponse(
      `<ListBucketResult>${entries.map(([key, at]) => contents(key, at)).join('')}` +
        (next === undefined ? '' : `<NextContinuationToken>${next}</NextContinuationToken>`) +
        `</ListBucketResult>`
    );

  it('follows the continuation token to the end', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        page(
          [
            ['cv/a.pdf', '2026-05-01T00:00:00.000Z'],
            ['cv/b.pdf', '2026-05-02T00:00:00.000Z'],
          ],
          'more'
        )
      )
      .mockResolvedValueOnce(page([['cv/c.pdf', '2026-05-03T00:00:00.000Z']]));

    const objects = await driverWith(fetchImpl).list();

    // Stopping at the first page would make the sweep silently partial.
    expect(objects.map((object) => object.key)).toEqual(['cv/a.pdf', 'cv/b.pdf', 'cv/c.pdf']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[1] as [string])[0]).toContain('continuation-token=more');
  });

  it('reads each object modification time, which the sweep needs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page([['cv/a.pdf', '2026-05-01T09:30:00.000Z']]));

    const [object] = await driverWith(fetchImpl).list();

    // Without it the sweep cannot tell an orphan from an upload in flight.
    expect(object?.lastModified.toISOString()).toBe('2026-05-01T09:30:00.000Z');
  });
});

describe('deleting', () => {
  it('treats a missing object as already deleted', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    await expect(driverWith(fetchImpl).remove('cv/gone.pdf')).resolves.toBeUndefined();
  });
});

/**
 * Cloudflare R2, and the other S3-compatible providers.
 *
 * Two things differ from AWS, and both fail as a 403 rather than as anything
 * readable: the bucket moves from the hostname into the path, and every signed
 * path has to match the path actually requested. So each operation is checked
 * for the bucket segment, and the upload's signature is recomputed over the
 * path-style canonical request.
 */
describe('an S3-compatible endpoint', () => {
  const R2 = {
    ...CREDENTIALS,
    region: 'auto',
    endpoint: 'https://abc123.r2.cloudflarestorage.com',
  };

  const R2_SCOPE = `${DATE_STAMP}/auto/s3/aws4_request`;

  const r2With = (fetchImpl: typeof fetch): ReturnType<typeof createS3PrivateStorage> =>
    createS3PrivateStorage(R2, fetchImpl, () => NOW);

  /** The chain again, for R2's `auto` region. */
  function r2Signature(stringToSign: string): string {
    const date = createHmac('sha256', `AWS4${R2.secretAccessKey}`).update(DATE_STAMP).digest();
    const region = createHmac('sha256', date).update('auto').digest();
    const service = createHmac('sha256', region).update('s3').digest();
    const signing = createHmac('sha256', service).update('aws4_request').digest();

    return createHmac('sha256', signing).update(stringToSign).digest('hex');
  }

  it('puts the bucket in the path and signs that path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());

    const key = await r2With(fetchImpl).put({
      buffer: cv,
      mimeType: 'application/pdf',
      extension: 'pdf',
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const path = `/${R2.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

    expect(url).toBe(`https://abc123.r2.cloudflarestorage.com${path}`);

    const payloadHash = sha256Hex(cv);
    const signedNames = Object.keys(headers)
      .filter((name) => name === 'host' || name.startsWith('x-amz-'))
      .map((name) => name.toLowerCase())
      .sort();

    const canonicalRequest = [
      'PUT',
      path,
      '',
      `${signedNames.map((name) => `${name}:${headers[name] ?? ''}`).join('\n')}\n`,
      signedNames.join(';'),
      payloadHash,
    ].join('\n');

    const signature = r2Signature(
      ['AWS4-HMAC-SHA256', AMZ_DATE, R2_SCOPE, sha256Hex(canonicalRequest)].join('\n')
    );

    // Signing the AWS-style path would produce a different value here, and R2
    // would answer 403 with nothing to say why.
    expect(headers.authorization).toContain(`Signature=${signature}`);
  });

  it('sends no ACL header, which R2 rejects', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());

    await r2With(fetchImpl).put({ buffer: cv, mimeType: 'application/pdf', extension: 'pdf' });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(headers['x-amz-acl']).toBeUndefined();
    expect(headers.authorization).not.toContain('x-amz-acl');
  });

  it('keeps the bucket in the download link, the delete and the listing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okResponse('<ListBucketResult></ListBucketResult>'));
    const driver = r2With(fetchImpl);

    const { url } = await driver.signedUrl('cv/one.pdf', 300, 'cv.pdf');
    expect(url.startsWith(`https://abc123.r2.cloudflarestorage.com/${R2.bucket}/cv/one.pdf?`)).toBe(
      true
    );

    await driver.remove('cv/one.pdf');
    expect((fetchImpl.mock.calls[0] as [string])[0]).toBe(
      `https://abc123.r2.cloudflarestorage.com/${R2.bucket}/cv/one.pdf`
    );

    await driver.list();
    expect((fetchImpl.mock.calls[1] as [string])[0]).toContain(`/${R2.bucket}/?`);
  });

  it('still uses the AWS hostname when no endpoint is set', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());

    await driverWith(fetchImpl).put({ buffer: cv, mimeType: 'application/pdf', extension: 'pdf' });

    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url.startsWith('https://spa-ajibade-cvs.s3.eu-west-1.amazonaws.com/cv/')).toBe(true);
  });
});
