import mongoose from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { createTestUser, TEST_PASSWORD } from '../../support/auth.js';
import { AuditLog, RefreshToken, User } from '../../../src/models/index.js';
import { record } from '../../../src/services/audit.service.js';

/**
 * Admin accounts and the audit log. Role enforcement lives in roles.test.ts,
 * so this file is about behaviour rather than access.
 */

setupTestDb();

const app = buildTestApp();

const asAdmin = async (): Promise<string> => (await createTestUser({ roles: ['admin'] })).token;

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

describe('GET /api/v1/admin/users', () => {
  it('lists users with pagination meta and matches the contract', async () => {
    const token = await asAdmin();

    const res = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/users');
    expect(res.body.meta.total).toBe(1);
  });

  it('never exposes password hashes or TOTP secrets', async () => {
    const token = await asAdmin();

    const res = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${token}`);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('argon2');
    expect(body).not.toContain('secretEncrypted');
  });

  it('returns 400 for a pageSize beyond the documented maximum', async () => {
    const token = await asAdmin();

    const res = await request(app)
      .get('/api/v1/admin/users?pageSize=500')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expectToMatchContract(res, 'get', '/api/v1/admin/users');
  });
});

describe('POST /api/v1/admin/users', () => {
  it('creates a user with two-factor not yet enrolled', async () => {
    const token = await asAdmin();

    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Ada Nwosu',
        email: 'Ada@Spaajibade.Test',
        password: 'a-long-enough-passphrase',
        roles: ['editor'],
      });

    expect(res.status).toBe(201);
    expectToMatchContract(res, 'post', '/api/v1/admin/users');
    // Normalised, so a duplicate cannot slip in under different casing.
    expect(res.body.data.email).toBe('ada@spaajibade.test');
    expect(res.body.data.totpEnabled).toBe(false);
  });

  it('stores the password hashed, never in the clear', async () => {
    const token = await asAdmin();

    await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Ada Nwosu',
        email: 'hash@spaajibade.test',
        password: 'a-long-enough-passphrase',
        roles: ['editor'],
      });

    const stored = await User.findOne({ email: 'hash@spaajibade.test' })
      .select('+passwordHash')
      .lean();

    expect(stored?.passwordHash).not.toContain('a-long-enough-passphrase');
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rejects a duplicate email with 409', async () => {
    const token = await asAdmin();
    await createTestUser({ email: 'taken@spaajibade.test' });

    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Someone Else',
        email: 'taken@spaajibade.test',
        password: 'a-long-enough-passphrase',
        roles: ['editor'],
      });

    expect(res.status).toBe(409);
    expectToMatchContract(res, 'post', '/api/v1/admin/users');
  });

  it('rejects a password shorter than the minimum', async () => {
    const token = await asAdmin();

    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ada', email: 'short@spaajibade.test', password: 'short', roles: ['editor'] });

    expect(res.status).toBe(400);
  });

  it('rejects a user with no roles', async () => {
    const token = await asAdmin();

    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Ada',
        email: 'noroles@spaajibade.test',
        password: 'a-long-enough-passphrase',
        roles: [],
      });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/admin/users/{id}', () => {
  it('updates roles', async () => {
    const token = await asAdmin();
    const { user } = await createTestUser({ roles: ['editor'], email: 'patch@spaajibade.test' });

    const res = await request(app)
      .patch(`/api/v1/admin/users/${user._id.toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roles: ['editor', 'hr'] });

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'patch', '/api/v1/admin/users/{id}');
    expect(res.body.data.roles).toEqual(['editor', 'hr']);
  });

  it('revokes every session when an account is deactivated', async () => {
    const token = await asAdmin();
    await createTestUser({ email: 'deact@spaajibade.test', totpEnabled: false });

    const login = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'deact@spaajibade.test', password: TEST_PASSWORD });
    expect(login.status).toBe(200);

    const target = await User.findOne({ email: 'deact@spaajibade.test' }).lean();
    await request(app)
      .patch(`/api/v1/admin/users/${target?._id.toString() ?? ''}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });

    const live = await RefreshToken.countDocuments({ user: target?._id, revokedAt: null });
    expect(live).toBe(0);
  });

  it('returns 404 for an unknown user', async () => {
    const token = await asAdmin();

    const res = await request(app)
      .patch(`/api/v1/admin/users/${new mongoose.Types.ObjectId().toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nobody' });

    expect(res.status).toBe(404);
    expectToMatchContract(res, 'patch', '/api/v1/admin/users/{id}');
  });

  it('rejects an empty patch, which is a mistake rather than a no-op', async () => {
    const token = await asAdmin();
    const { user } = await createTestUser({ email: 'empty@spaajibade.test' });

    const res = await request(app)
      .patch(`/api/v1/admin/users/${user._id.toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/admin/audit-logs', () => {
  it('lists entries newest first with the actor expanded', async () => {
    const { user, token } = await createTestUser({ roles: ['admin'] });

    await record({ actor: user._id, action: 'insight.publish', entity: 'Insight', meta: { slug: 'x' } });

    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/audit-logs');
    expect(res.body.data[0].action).toBe('insight.publish');
    expect(res.body.data[0].actor.email).toBe(user.email);
  });

  it('filters by action', async () => {
    const { user, token } = await createTestUser({ roles: ['admin'] });

    await record({ actor: user._id, action: 'insight.publish', entity: 'Insight' });
    await record({ actor: user._id, action: 'application.cv.view', entity: 'Application' });

    const res = await request(app)
      .get('/api/v1/admin/audit-logs?action=application.cv.view')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].action).toBe('application.cv.view');
  });

  it('survives a deleted actor rather than failing the whole page', async () => {
    const { user, token } = await createTestUser({ roles: ['admin'] });
    const { user: other } = await createTestUser({ email: 'ghost@spaajibade.test' });

    await record({ actor: other._id, action: 'insight.publish', entity: 'Insight' });
    await User.deleteOne({ _id: other._id });

    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].actor).toBeNull();
    expect(user.email).toBeTruthy();
  });

  it('does not let a failed audit write break the action being audited', async () => {
    // A recording failure must be swallowed: refusing to publish because the
    // audit collection hiccuped would be worse than a missing line.
    await expect(
      record({ action: 'x'.repeat(200), entity: 'Insight' })
    ).resolves.toBeUndefined();

    expect(await AuditLog.countDocuments({ action: 'x'.repeat(200) })).toBe(0);
  });
});
