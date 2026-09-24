import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { createTestUser, TEST_PASSWORD } from '../../support/auth.js';
import { AuditLog, RefreshToken, User } from '../../../src/models/index.js';
import { AUTH } from '../../../src/config/constants.js';
import { hashPassword } from '../../../src/services/auth.service.js';

/**
 * Admin authentication.
 *
 * The properties worth pinning here are the ones that are invisible when they
 * break: that a wrong password and an unknown email are indistinguishable,
 * that refresh tokens actually rotate, that replaying a revoked one kills the
 * chain, and that a password change ends existing sessions.
 */

setupTestDb();

const app = buildTestApp();

const cookieFrom = (res: request.Response): string => {
  const header: unknown = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(header)
    ? header.map(String)
    : [typeof header === 'string' ? header : ''];

  return cookies.find((value) => value.startsWith(AUTH.refreshCookieName)) ?? '';
};

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

describe('POST /api/v1/admin/auth/login', () => {
  beforeEach(async () => {
    await createTestUser({ username: 'editor', roles: ['editor'] });
  });

  it('signs in and returns an access token with the user', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'editor', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'post', '/api/v1/admin/auth/login');
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.username).toBe('editor');
  });

  it('never returns the password hash', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'editor', password: TEST_PASSWORD });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('argon2');
    expect(body).not.toContain('passwordHash');
  });

  it('sets the refresh token as an httpOnly cookie, not in the body', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'editor', password: TEST_PASSWORD });

    const cookie = cookieFrom(res);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain(`Path=${AUTH.refreshCookiePath}`);
    expect(JSON.stringify(res.body)).not.toContain('refreshToken');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'editor', password: 'not-the-right-password' });

    const unknownEmail = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'nobody', password: TEST_PASSWORD });

    // Otherwise the login form tells an attacker who works at the firm.
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expectToMatchContract(wrongPassword, 'post', '/api/v1/admin/auth/login');
  });

  it('returns 400 for an email where a username belongs', async () => {
    // A frequent mistake while the dashboard is being built, and a confusing
    // one if it answered a bare 401 instead.
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'editor@spaajibade.test', password: TEST_PASSWORD });

    expect(res.status).toBe(400);
    expectToMatchContract(res, 'post', '/api/v1/admin/auth/login');
  });

  it('answers a wrong password identically whatever the account state', async () => {
    // The login form must not be a directory of who works at the firm. The
    // staff are named on the public site, so an address format is easy to
    // guess; distinguishable answers would turn that into a list of accounts.
    const attempt = async (username: string): Promise<{ status: number; body: string }> => {
      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username, password: 'definitely-not-the-password' });

      return { status: res.status, body: JSON.stringify(res.body) };
    };

    await User.updateOne({ username: 'editor' }, { isActive: false });
    await User.create({
      username: 'locked',
      name: 'Locked Out',
      passwordHash: await hashPassword(TEST_PASSWORD),
      roles: ['editor'],
      isActive: true,
      lockedUntil: new Date(Date.now() + 60_000),
    });

    const unknown = await attempt('nobody-here');
    const disabled = await attempt('editor');
    const locked = await attempt('locked');

    expect(unknown.status).toBe(401);
    expect(disabled).toEqual(unknown);
    expect(locked).toEqual(unknown);
  });

  it('does not let a stranger lock an account out by guessing at it', async () => {
    // Failures only count against an account whose password was actually
    // wrong *and* which is active — so a lockout cannot be driven by somebody
    // who has never held the password, using a name from the website.
    // Three is enough to show the counter is untouched; each attempt runs a
    // real argon2 verify against the dummy hash, so fifteen of them would push
    // this past the test timeout for no extra signal.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username: 'not-a-user', password: 'wrong' });
    }

    const stored = await User.findOne({ username: 'editor' }).lean();
    expect(stored?.failedLoginCount ?? 0).toBe(0);
  });

  it('refuses a disabled account', async () => {
    await User.updateOne({ username: 'editor' }, { isActive: false });

    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'editor', password: TEST_PASSWORD });

    expect(res.status).toBe(403);
  });

  it('locks the account after ten failures and keeps refusing the right password', async () => {
    for (let attempt = 0; attempt < AUTH.maxFailedLogins; attempt += 1) {
      await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username: 'editor', password: 'wrong' });
    }

    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'editor', password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/locked/i);
  });

  it('releases the lock when its window has passed, rather than latching', async () => {
    for (let attempt = 0; attempt < AUTH.maxFailedLogins; attempt += 1) {
      await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username: 'editor', password: 'wrong' });
    }

    // Wind the lock back into the past, as fifteen minutes would.
    await User.updateOne({ username: 'editor' }, { lockedUntil: new Date(Date.now() - 1000) });

    // One more wrong password must not re-lock immediately. The counter used
    // to stay at ten for ever, so a wrong guess every fifteen minutes kept an
    // account locked out indefinitely.
    await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'editor', password: 'wrong' });

    const after = await User.findOne({ username: 'editor' }).lean();
    expect(after?.failedLoginCount).toBe(1);
    expect(after?.lockedUntil).toBeNull();
  });

  it('clears the failure count on a successful sign-in', async () => {
    await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'editor', password: 'wrong' });

    await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'editor', password: TEST_PASSWORD });

    const user = await User.findOne({ username: 'editor' }).lean();
    expect(user?.failedLoginCount).toBe(0);
  });
});

describe('refresh rotation', () => {
  const signIn = async (): Promise<string> => {
    await createTestUser({ username: 'rot' });
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'rot', password: TEST_PASSWORD });
    return cookieFrom(res);
  };

  it('issues a new token and revokes the old one', async () => {
    const first = await signIn();

    const refreshed = await request(app).post('/api/v1/admin/auth/refresh').set('Cookie', first);

    expect(refreshed.status).toBe(200);
    expectToMatchContract(refreshed, 'post', '/api/v1/admin/auth/refresh');
    expect(cookieFrom(refreshed)).not.toBe(first);

    const revoked = await RefreshToken.countDocuments({ revokedAt: { $ne: null } });
    expect(revoked).toBe(1);
  });

  it('revokes the whole chain when a token is replayed', async () => {
    const first = await signIn();
    const second = await request(app).post('/api/v1/admin/auth/refresh').set('Cookie', first);
    const third = await request(app)
      .post('/api/v1/admin/auth/refresh')
      .set('Cookie', cookieFrom(second));

    // Replaying the original: either it was stolen, or the session is confused.
    const replay = await request(app).post('/api/v1/admin/auth/refresh').set('Cookie', first);
    expect(replay.status).toBe(401);

    // The newest token must now be dead too, or the thief keeps the session.
    const afterReplay = await request(app)
      .post('/api/v1/admin/auth/refresh')
      .set('Cookie', cookieFrom(third));
    expect(afterReplay.status).toBe(401);
  });

  it('rejects a refresh with no cookie at all', async () => {
    const res = await request(app).post('/api/v1/admin/auth/refresh');

    expect(res.status).toBe(401);
  });

  it('stops working after logout', async () => {
    const cookie = await signIn();

    const out = await request(app).post('/api/v1/admin/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);
    expectToMatchContract(out, 'post', '/api/v1/admin/auth/logout');

    const after = await request(app).post('/api/v1/admin/auth/refresh').set('Cookie', cookie);
    expect(after.status).toBe(401);
  });

  it('stores refresh tokens hashed, so a database dump yields no sessions', async () => {
    const cookie = await signIn();
    const raw = cookie.split('=')[1]?.split(';')[0] ?? '';

    const stored = await RefreshToken.findOne().lean();

    expect(raw.length).toBeGreaterThan(20);
    expect(stored?.tokenHash).not.toBe(raw);
  });
});

describe('GET /api/v1/admin/auth/me', () => {
  it('returns the signed-in user', async () => {
    const { token } = await createTestUser({ username: 'me', email: 'me@spaajibade.test' });

    const res = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/auth/me');
    expect(res.body.data.username).toBe('me');
    expect(res.body.data.email).toBe('me@spaajibade.test');
  });

  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/v1/admin/auth/me');

    expect(res.status).toBe(401);
    expectToMatchContract(res, 'get', '/api/v1/admin/auth/me');
  });

  it('stops working the moment the account is deactivated', async () => {
    const { token, user } = await createTestUser({ username: 'gone' });

    await User.updateOne({ _id: user._id }, { isActive: false });

    // The token is still cryptographically valid; the user is reloaded anyway.
    const res = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/admin/auth/password', () => {
  it('changes the password and revokes every existing session', async () => {
    await createTestUser({ username: 'pw' });
    const login = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'pw', password: TEST_PASSWORD });

    const res = await request(app)
      .post('/api/v1/admin/auth/password')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'a-brand-new-long-passphrase' });

    expect(res.status).toBe(204);
    expectToMatchContract(res, 'post', '/api/v1/admin/auth/password');

    // A session opened with the old password must not survive the change.
    const after = await request(app)
      .post('/api/v1/admin/auth/refresh')
      .set('Cookie', cookieFrom(login));
    expect(after.status).toBe(401);

    const relogin = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'pw', password: 'a-brand-new-long-passphrase' });
    expect(relogin.status).toBe(200);
  });

  it('refuses without the current password', async () => {
    const { token } = await createTestUser({ username: 'pw2' });

    const res = await request(app)
      .post('/api/v1/admin/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong', newPassword: 'a-brand-new-long-passphrase' });

    expect(res.status).toBe(401);
  });

  it('refuses a new password shorter than the minimum', async () => {
    const { token } = await createTestUser({ username: 'pw3' });

    const res = await request(app)
      .post('/api/v1/admin/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'short' });

    expect(res.status).toBe(400);
  });
});

describe('a password change ends the sessions it was meant to end', () => {
  it('stops an access token that was issued before it', async () => {
    const { token } = await createTestUser({ roles: ['admin'], username: 'rotate' });

    const before = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(before.status).toBe(200);

    // A second of separation, because `iat` has whole-second resolution.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const changed = await request(app)
      .post('/api/v1/admin/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'a-brand-new-long-passphrase' });

    expect(changed.status, JSON.stringify(changed.body)).toBe(204);

    // The point: a password changed *because* of a compromise must not leave
    // the attacker's bearer token working for the rest of its fifteen minutes.
    const after = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
  });
});

describe('an administrator ending the sessions of another account', () => {
  it('stops their access token on the very next request', async () => {
    const admin = await createTestUser({ roles: ['admin'], username: 'boss' });
    const victim = await createTestUser({ roles: ['editor'], username: 'victim' });

    const before = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${victim.token}`);
    expect(before.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const revoked = await request(app)
      .post(`/api/v1/admin/users/${victim.user._id.toString()}/revoke-sessions`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(revoked.status, JSON.stringify(revoked.body)).toBe(204);
    expectToMatchContract(revoked, 'post', '/api/v1/admin/users/{id}/revoke-sessions');

    // The point: a responder can end a compromise without knowing the
    // compromised account's password, and without waiting fifteen minutes.
    const after = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${victim.token}`);
    expect(after.status).toBe(401);
  });

  it('records who did it', async () => {
    const admin = await createTestUser({ roles: ['admin'], username: 'boss2' });
    const victim = await createTestUser({ roles: ['editor'], username: 'victim2' });

    await request(app)
      .post(`/api/v1/admin/users/${victim.user._id.toString()}/revoke-sessions`)
      .set('Authorization', `Bearer ${admin.token}`);

    const entry = await AuditLog.findOne({ action: 'user.sessions.revoke' }).lean();
    expect(entry?.actor?.toString()).toBe(admin.user._id.toString());
  });
});
