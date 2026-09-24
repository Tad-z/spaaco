import { describe, expect, it, vi } from 'vitest';
import {
  createSentryTracker,
  parseSentryDsn,
} from '../../../src/integrations/error-tracking/sentry.driver.js';

/**
 * The Sentry driver, against a fake `fetch`.
 *
 * What is worth pinning is the envelope format — three newline-delimited JSON
 * documents, in order — because Sentry accepts a malformed one with a 200 and
 * simply drops it, so a mistake here would look like "no errors are happening".
 */

const DSN = parseSentryDsn('https://abc123@o1.ingest.sentry.io/456');

const okResponse = (): Partial<Response> => ({ ok: true, status: 200 });

const trackerWith = (fetchImpl: typeof fetch): ReturnType<typeof createSentryTracker> =>
  createSentryTracker(DSN, 'production', 'abc1234', fetchImpl);

/** The driver does not await its own request, so a tick is needed. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** The envelope body, which is always a string for this driver. */
const bodyOf = (fetchImpl: ReturnType<typeof vi.fn>): string => {
  const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
  if (typeof init.body !== 'string') throw new Error('the envelope body was not a string');

  return init.body;
};

const envelopeOf = (fetchImpl: ReturnType<typeof vi.fn>): Record<string, unknown>[] =>
  bodyOf(fetchImpl)
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

describe('parseSentryDsn', () => {
  it('reads the key, host and project', () => {
    expect(parseSentryDsn('https://key@o1.ingest.sentry.io/4507')).toEqual({
      publicKey: 'key',
      host: 'o1.ingest.sentry.io',
      projectId: '4507',
      protocol: 'https',
    });
  });

  it('refuses a DSN with no key', () => {
    expect(() => parseSentryDsn('https://o1.ingest.sentry.io/4507')).toThrow(/SENTRY_DSN/);
  });

  it('refuses a DSN with no project id', () => {
    expect(() => parseSentryDsn('https://key@o1.ingest.sentry.io')).toThrow(/SENTRY_DSN/);
  });
});

describe('capturing an error', () => {
  it('posts a well-formed envelope to the project', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());

    trackerWith(fetchImpl).capture({
      error: new Error('the database went away'),
      requestId: 'req-42',
      route: '/practice-areas/:slug',
      method: 'GET',
    });

    await settle();

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://o1.ingest.sentry.io/api/456/envelope/');
    expect((init.headers as Record<string, string>)['x-sentry-auth']).toContain(
      'sentry_key=abc123'
    );

    const [header, itemHeader, payload] = envelopeOf(fetchImpl);

    expect(header?.event_id).toMatch(/^[0-9a-f]{32}$/);
    expect(itemHeader).toEqual({ type: 'event' });
    expect(payload).toMatchObject({
      level: 'error',
      environment: 'production',
      release: 'abc1234',
      tags: { route: '/practice-areas/:slug', method: 'GET' },
      extra: { requestId: 'req-42' },
    });

    const exception = (payload?.exception as { values: { type: string; value: string }[] })
      .values[0];
    expect(exception?.type).toBe('Error');
    expect(exception?.value).toBe('the database went away');
  });

  it('uses the same event id in the header and the payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());

    trackerWith(fetchImpl).capture({ error: new Error('x') });
    await settle();

    const [header, , payload] = envelopeOf(fetchImpl);

    // Sentry drops an envelope whose ids disagree, silently and with a 200.
    expect(header?.event_id).toBe(payload?.event_id);
  });

  it('tags the route pattern, never a concrete path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());

    trackerWith(fetchImpl).capture({
      error: new Error('x'),
      route: '/admin/applications/:id',
    });
    await settle();

    const body = bodyOf(fetchImpl);

    // A concrete path would carry an id that identifies somebody's CV.
    expect(body).toContain('/admin/applications/:id');
    expect(body).not.toMatch(/applications\/[0-9a-f]{24}/);
  });

  it('survives something that is not an Error being thrown', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());

    trackerWith(fetchImpl).capture({ error: 'a bare string' });
    await settle();

    const [, , payload] = envelopeOf(fetchImpl);
    const exception = (payload?.exception as { values: { type: string }[] }).values[0];

    expect(exception?.type).toBe('UnknownError');
  });

  it('does not throw when Sentry is unreachable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));

    // The request that failed must not be made worse by the reporting of it.
    expect(() => {
      trackerWith(fetchImpl).capture({ error: new Error('x') });
    }).not.toThrow();

    await settle();
  });

  it('returns immediately rather than waiting on the request', () => {
    let resolveFetch: (() => void) | undefined;
    const fetchImpl = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = () => {
          resolve(okResponse() as Response);
        };
      })
    );

    // If this awaited, a slow Sentry would add its latency to every 500.
    trackerWith(fetchImpl).capture({ error: new Error('x') });

    expect(fetchImpl).toHaveBeenCalledOnce();
    resolveFetch?.();
  });
});
