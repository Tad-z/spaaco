import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';

/**
 * The docs page, at `/docs`.
 *
 * It needs no database, so there is no `setupTestDb()` here. What is worth
 * pinning is that the page and the spec it fetches stay in agreement: the page
 * is useless if it renders and then 404s on its own contract, and that is
 * exactly what would happen if the build stopped copying the YAML.
 */

const app = buildTestApp();

describe('GET /docs', () => {
  it('serves the documentation shell', async () => {
    const res = await request(app).get('/docs');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('spec-url="/docs/openapi.yaml"');
  });

  it('allows the renderer the page actually loads', async () => {
    const res = await request(app).get('/docs');

    // A policy that blocks Redoc leaves a blank page, which looks like the
    // route being broken rather than the header being wrong.
    const csp = res.headers['content-security-policy'] ?? '';
    expect(csp).toContain('https://cdn.redoc.ly');
    expect(csp).toContain('blob:');
  });
});

describe('GET /docs/openapi.yaml', () => {
  it('serves the spec the page asks for', async () => {
    const res = await request(app).get('/docs/openapi.yaml');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/yaml/);
  });

  it('serves the real contract, not an empty file', async () => {
    const res = await request(app).get('/docs/openapi.yaml');

    const body = res.text.length > 0 ? res.text : String(res.body);
    expect(body).toContain('openapi:');
    expect(body).toContain('/api/v1/pages/{key}');
  });
});
