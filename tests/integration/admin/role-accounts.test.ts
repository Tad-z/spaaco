import mongoose from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { createTestUser } from '../../support/auth.js';
import { ensureRoleAccounts } from '../../../src/services/bootstrap.service.js';
import { User } from '../../../src/models/index.js';
import { verifyPassword } from '../../../src/services/auth.service.js';

/**
 * The four role accounts, and the profile each holder can edit.
 *
 * There is no sign-up: one account per job, created at first boot from the
 * deployment's environment (ADR-043). The behaviour worth pinning is that a
 * restart never disturbs an account that already exists — otherwise every
 * deploy would silently reset a password the firm had changed, and invalidate
 * their sessions for a reason nobody could see.
 */

setupTestDb();

const app = buildTestApp();

const PASSWORDS = {
  ADMIN_PASSWORD: 'admin-password-long-enough',
  EDITOR_PASSWORD: 'editor-password-long-enough',
  HR_PASSWORD: 'hr-password-long-enough',
  BIZDEV_PASSWORD: 'bizdev-password-long-enough',
};

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

describe('creating the role accounts', () => {
  it('creates one account per role on an empty database', async () => {
    const result = await ensureRoleAccounts(PASSWORDS);

    expect(result.created.sort()).toEqual(['admin', 'business_dev', 'editor', 'hr']);
    expect(await User.countDocuments()).toBe(4);

    const hr = await User.findOne({ username: 'hr' }).lean();
    expect(hr?.roles).toEqual(['hr']);
    // Nobody has said where HR's notifications should go yet.
    expect(hr?.email).toBeNull();
  });

  it('is safe to run again, and leaves an existing account alone', async () => {
    await ensureRoleAccounts(PASSWORDS);
    await User.updateOne({ username: 'admin' }, { name: 'Renamed By The Firm' });

    const second = await ensureRoleAccounts(PASSWORDS);

    expect(second.created).toEqual([]);
    expect(await User.countDocuments()).toBe(4);

    // The point: a restart must not undo a change the firm made.
    const admin = await User.findOne({ username: 'admin' }).lean();
    expect(admin?.name).toBe('Renamed By The Firm');
  });

  it('never resets a password that has been changed', async () => {
    await ensureRoleAccounts(PASSWORDS);
    await User.updateOne({ username: 'admin' }, { passwordHash: await hashOf('a-newer-password') });

    await ensureRoleAccounts(PASSWORDS);

    const admin = await User.findOne({ username: 'admin' }).select('+passwordHash').lean();
    expect(await verifyPassword(admin?.passwordHash ?? '', 'a-newer-password')).toBe(true);
    expect(await verifyPassword(admin?.passwordHash ?? '', PASSWORDS.ADMIN_PASSWORD)).toBe(false);
  });

  it('skips a role whose password is not configured, and says which', async () => {
    const result = await ensureRoleAccounts({ ...PASSWORDS, HR_PASSWORD: undefined });

    // Not invented: an account with a password nobody chose is an account
    // nobody knows is there.
    expect(result.created).not.toContain('hr');
    expect(result.skipped.join(' ')).toContain('HR_PASSWORD');
    expect(await User.findOne({ username: 'hr' }).lean()).toBeNull();
  });

  it('creates an account that can actually sign in', async () => {
    await ensureRoleAccounts(PASSWORDS);

    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'editor', password: PASSWORDS.EDITOR_PASSWORD });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.user.roles).toEqual(['editor']);
  });
});

describe('editing your own profile', () => {
  it('sets the notification address', async () => {
    const { token } = await createTestUser({ roles: ['business_dev'], username: 'bd' });

    const res = await request(app)
      .patch('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'Chinelo@Spaajibade.Test' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'patch', '/api/v1/admin/auth/me');
    expect(res.body.data.email).toBe('chinelo@spaajibade.test');
  });

  it('changes the display name', async () => {
    const { token } = await createTestUser({ roles: ['hr'], username: 'hr-person' });

    const res = await request(app)
      .patch('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Chinelo Okafor' });

    expect(res.body.data.name).toBe('Chinelo Okafor');
  });

  it('clears the address with null, which stops the notifications', async () => {
    const { token } = await createTestUser({
      roles: ['hr'],
      username: 'leaving',
      email: 'leaving@spaajibade.test',
    });

    const res = await request(app)
      .patch('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: null });

    expect(res.body.data.email).toBeNull();
  });

  it('refuses an attempt to grant yourself a role', async () => {
    const { token } = await createTestUser({ roles: ['editor'], username: 'ambitious' });

    const res = await request(app)
      .patch('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ roles: ['admin'] });

    // An account that could promote itself would make the whole matrix
    // decorative.
    expect(res.status).toBe(400);

    const unchanged = await User.findOne({ username: 'ambitious' }).lean();
    expect(unchanged?.roles).toEqual(['editor']);
  });

  it('refuses an empty patch', async () => {
    const { token } = await createTestUser({ username: 'nothing-to-say' });

    const res = await request(app)
      .patch('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('needs a token', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/auth/me')
      .send({ email: 'anyone@spaajibade.test' });

    expect(res.status).toBe(401);
  });
});

/** Local helper, so the test does not import the whole auth surface. */
async function hashOf(plain: string): Promise<string> {
  const { hashPassword } = await import('../../../src/services/auth.service.js');
  return hashPassword(plain);
}
