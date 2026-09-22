import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';

/**
 * The first test that exercises the whole stack against a real database, and
 * the first use of expectToMatchContract. Everything from here on asserts the
 * contract the same way.
 */

setupTestDb();

const app = buildTestApp();

describe('GET /api/v1/health', () => {
  it('reports the database as up once connected, and matches the contract', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.data.db).toBe('up');
    expectToMatchContract(res, 'get', '/api/v1/health');
  });
});
