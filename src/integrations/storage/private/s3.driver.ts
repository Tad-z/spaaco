import { createHash, createHmac, randomUUID } from 'node:crypto';
import { InternalError } from '../../../core/errors.js';
import { logger } from '../../../core/logger.js';
import type {
  IPrivateStorage,
  PutPrivateFile,
  SignedUrl,
  StoredObject,
} from '../../../interfaces/integrations/private-storage.interface.js';

/**
 * S3, signed with Signature Version 4 directly.
 *
 * No AWS SDK: this needs three operations, and the SDK is tens of megabytes of
 * dependency for them. SigV4 is a documented, stable algorithm — a canonical
 * request, a string to sign, and a chain of HMACs — and writing it out keeps
 * the whole storage path auditable in one file.
 *
 * Uploads are signed with the payload hash, so S3 rejects a body that does not
 * match what was signed. Downloads are *presigned query URLs*, which is what
 * lets a CV link expire on its own without the API proxying the file.
 */

export interface S3Credentials {
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';
const UNSIGNED = 'UNSIGNED-PAYLOAD';

const sha256Hex = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

const hmac = (key: Buffer | string, value: string): Buffer =>
  createHmac('sha256', key).update(value).digest();

/** `20260601T120000Z` and `20260601`, the two forms SigV4 uses. */
function timestamps(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * Each path segment is escaped, but the slashes between them are not — S3
 * treats the key as a path, and encoding the separators would look up a
 * different object.
 */
const encodeKey = (key: string): string => key.split('/').map(encodeURIComponent).join('/');

function signingKey(credentials: S3Credentials, dateStamp: string): Buffer {
  const date = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const region = hmac(date, credentials.region);
  const service = hmac(region, SERVICE);

  return hmac(service, 'aws4_request');
}

export function createS3PrivateStorage(
  credentials: S3Credentials,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date()
): IPrivateStorage {
  const host = `${credentials.bucket}.s3.${credentials.region}.amazonaws.com`;
  const origin = `https://${host}`;

  const scopeFor = (dateStamp: string): string =>
    `${dateStamp}/${credentials.region}/${SERVICE}/aws4_request`;

  /** An authorization header for a request whose body is already hashed. */
  function authorize(
    method: string,
    key: string,
    payloadHash: string,
    amzDate: string,
    dateStamp: string
  ): string {
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      method,
      `/${encodeKey(key)}`,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      ALGORITHM,
      amzDate,
      scopeFor(dateStamp),
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signature = hmac(signingKey(credentials, dateStamp), stringToSign).toString('hex');

    return (
      `${ALGORITHM} Credential=${credentials.accessKeyId}/${scopeFor(dateStamp)}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`
    );
  }

  return {
    name: 's3',

    async put(input: PutPrivateFile): Promise<string> {
      const key = `cv/${randomUUID()}.${input.extension}`;
      const { amzDate, dateStamp } = timestamps(now());
      const payloadHash = sha256Hex(input.buffer);

      const response = await fetchImpl(`${origin}/${encodeKey(key)}`, {
        method: 'PUT',
        headers: {
          host,
          'content-type': input.mimeType,
          'x-amz-content-sha256': payloadHash,
          'x-amz-date': amzDate,
          // Belt and braces alongside the bucket policy: a CV must never be
          // readable without a signature, whatever the bucket defaults are.
          'x-amz-acl': 'private',
          authorization: authorize('PUT', key, payloadHash, amzDate, dateStamp),
        },
        body: new Uint8Array(input.buffer),
      });

      if (!response.ok) {
        throw new InternalError(`S3 rejected the upload (${String(response.status)})`);
      }

      return key;
    },

    signedUrl(storageKey: string, ttlSeconds: number, filename: string): Promise<SignedUrl> {
      const issuedAt = now();
      const { amzDate, dateStamp } = timestamps(issuedAt);

      // Query-signed, so the recipient needs no credentials and the link dies
      // by itself. The filename rides along as a response header override, so
      // the browser saves it under the name the applicant used.
      const query = new URLSearchParams({
        'X-Amz-Algorithm': ALGORITHM,
        'X-Amz-Credential': `${credentials.accessKeyId}/${scopeFor(dateStamp)}`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': String(ttlSeconds),
        'X-Amz-SignedHeaders': 'host',
        'response-content-disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      });

      // S3 requires the canonical query string sorted by key.
      const canonicalQuery = [...query.entries()]
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
        .join('&');

      const canonicalRequest = [
        'GET',
        `/${encodeKey(storageKey)}`,
        canonicalQuery,
        `host:${host}\n`,
        'host',
        UNSIGNED,
      ].join('\n');

      const stringToSign = [
        ALGORITHM,
        amzDate,
        scopeFor(dateStamp),
        sha256Hex(canonicalRequest),
      ].join('\n');

      const signature = hmac(signingKey(credentials, dateStamp), stringToSign).toString('hex');

      return Promise.resolve({
        url: `${origin}/${encodeKey(storageKey)}?${canonicalQuery}&X-Amz-Signature=${signature}`,
        expiresAt: new Date(issuedAt.getTime() + ttlSeconds * 1000),
      });
    },

    async remove(storageKey: string): Promise<void> {
      const { amzDate, dateStamp } = timestamps(now());

      const response = await fetchImpl(`${origin}/${encodeKey(storageKey)}`, {
        method: 'DELETE',
        headers: {
          host,
          'x-amz-content-sha256': UNSIGNED,
          'x-amz-date': amzDate,
          authorization: authorize('DELETE', storageKey, UNSIGNED, amzDate, dateStamp),
        },
      });

      // 404 is success for our purposes: the file is not there either way.
      if (!response.ok && response.status !== 404) {
        logger.warn({ status: response.status }, 'S3 refused to delete a stored CV');
      }
    },

    async list(): Promise<StoredObject[]> {
      const { amzDate, dateStamp } = timestamps(now());
      const objects: StoredObject[] = [];
      let continuation: string | undefined;

      // Paginated: a firm with years of applications will exceed one page, and
      // the orphan sweep must see every key or it deletes nothing (ROADMAP 6.5).
      do {
        const query = new URLSearchParams({ 'list-type': '2', prefix: 'cv/' });
        if (continuation !== undefined) query.set('continuation-token', continuation);

        const canonicalQuery = [...query.entries()]
          .sort(([left], [right]) => (left < right ? -1 : 1))
          .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
          .join('&');

        const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${UNSIGNED}\nx-amz-date:${amzDate}\n`;
        const canonicalRequest = [
          'GET',
          '/',
          canonicalQuery,
          canonicalHeaders,
          'host;x-amz-content-sha256;x-amz-date',
          UNSIGNED,
        ].join('\n');

        const stringToSign = [
          ALGORITHM,
          amzDate,
          scopeFor(dateStamp),
          sha256Hex(canonicalRequest),
        ].join('\n');

        const signature = hmac(signingKey(credentials, dateStamp), stringToSign).toString('hex');

        const response = await fetchImpl(`${origin}/?${canonicalQuery}`, {
          headers: {
            host,
            'x-amz-content-sha256': UNSIGNED,
            'x-amz-date': amzDate,
            authorization:
              `${ALGORITHM} Credential=${credentials.accessKeyId}/${scopeFor(dateStamp)}, ` +
              `SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`,
          },
        });

        if (!response.ok) {
          throw new InternalError(`S3 refused to list the bucket (${String(response.status)})`);
        }

        const body = await response.text();

        // Each <Contents> holds the key and when it was last written; the
        // sweep needs both, so they are read as a pair rather than separately.
        for (const entry of body.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const block = entry[1] ?? '';
          const key = /<Key>([^<]+)<\/Key>/.exec(block)?.[1];
          const modified = /<LastModified>([^<]+)<\/LastModified>/.exec(block)?.[1];

          if (key !== undefined) {
            objects.push({
              key,
              lastModified: modified === undefined ? new Date(0) : new Date(modified),
            });
          }
        }

        continuation = /<NextContinuationToken>([^<]+)</.exec(body)?.[1];
      } while (continuation !== undefined);

      return objects;
    },
  };
}
