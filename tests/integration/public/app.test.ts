import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { APP_VERSION } from '../../../src/config/constants.js';

/**
 * The app's baseline behaviour: the health slice, and the two failure modes
 * every other endpoint inherits from the middleware chain — an unknown route
 * and a body Express itself cannot parse.
 *
 * These run without a database on purpose, which also proves /health degrades
 * to `db: "down"` rather than throwing.
 */

const app = buildTestApp();

describe('the middleware chain', () => {
  // The health endpoint's own happy path and contract assertion live in
  // health.test.ts, which runs with a database. This case is the one thing that
  // file cannot show: the endpoint degrading rather than throwing when the
  // database is absent.
  it('serves /health with db "down" when no database is connected', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok', db: 'down', version: APP_VERSION } });
  });

  it('echoes a client-supplied request id', async () => {
    const res = await request(app).get('/api/v1/health').set('x-request-id', 'frontend-abc-123');

    expect(res.headers['x-request-id']).toBe('frontend-abc-123');
  });

  it('generates a request id when the client sends none', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('ignores an over-long request id rather than echoing it back', async () => {
    const oversized = 'a'.repeat(500);
    const res = await request(app).get('/api/v1/health').set('x-request-id', oversized);

    expect(res.headers['x-request-id']).not.toBe(oversized);
    expect(res.headers['x-request-id']).toHaveLength(36);
  });
});

describe('unknown routes', () => {
  it('returns the 404 error shape, not an Express HTML page', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('returns the same shape for a path outside the API prefix', async () => {
    const res = await request(app).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for an unsupported method on a real path', async () => {
    const res = await request(app).delete('/api/v1/health');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('malformed request bodies', () => {
  it('returns 400 VALIDATION_ERROR for JSON that does not parse', async () => {
    const res = await request(app)
      .post('/api/v1/enquiries')
      .set('content-type', 'application/json')
      .send('{"fullName": "unclosed');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Malformed JSON body');
  });

  it('does not leak the raw body back in the error', async () => {
    const res = await request(app)
      .post('/api/v1/enquiries')
      .set('content-type', 'application/json')
      .send('{"email": "leak@example.com", broken');

    expect(JSON.stringify(res.body)).not.toContain('leak@example.com');
  });

  it('returns 413 PAYLOAD_TOO_LARGE for a body past the JSON limit', async () => {
    const res = await request(app)
      .post('/api/v1/enquiries')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ summary: 'x'.repeat(200_000) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('security headers and CORS', () => {
  it('sets helmet defaults and hides the Express fingerprint', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows an origin on the allow-list', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:3000');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('does not grant CORS to an origin that is not on the allow-list', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'https://attacker.example');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('serves non-browser callers, which send no Origin header', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
  });
});
