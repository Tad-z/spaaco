import { authenticator } from 'otplib';
import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { createTestUser, TEST_PASSWORD } from '../../support/auth.js';
import { RefreshToken, User } from '../../../src/models/index.js';
import { AUTH } from '../../../src/config/constants.js';
import { hashPassword } from '../../../src/services/auth.service.js';
import { decryptSecret } from '../../../src/helpers/crypto.helper.js';
import { TEST_ENV } from '../../support/test-env.js';

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
    await createTestUser({ email: 'editor@spaajibade.test', totpEnabled: false });
  });

  it('signs in and returns an access token with the user', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'editor@spaajibade.test', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'post', '/api/v1/admin/auth/login');
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe('editor@spaajibade.test');
  });

  it('never returns the password hash or the TOTP secret', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'editor@spaajibade.test', password: TEST_PASSWORD });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('argon2');
    expect(body).not.toContain('secretEncrypted');
  });

  it('sets the refresh token as an httpOnly cookie, not in the body', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'editor@spaajibade.test', password: TEST_PASSWORD });

    const cookie = cookieFrom(res);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain(`Path=${AUTH.refreshCookiePath}`);
    expect(JSON.stringify(res.body)).not.toContain('refreshToken');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'editor@spaajibade.test', password: 'not-the-right-password' });

    const unknownEmail = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'nobody@spaajibade.test', password: TEST_PASSWORD });

    // Otherwise the login form tells an attacker who works at the firm.
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expectToMatchContract(wrongPassword, 'post', '/api/v1/admin/auth/login');
  });

  it('returns 400 for a malformed email', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'not-an-email', password: TEST_PASSWORD });

    expect(res.status).toBe(400);
    expectToMatchContract(res, 'post', '/api/v1/admin/auth/login');
  });

  it('answers a wrong password identically whatever the account state', async () => {
    // The login form must not be a directory of who works at the firm. The
    // staff are named on the public site, so an address format is easy to
    // guess; distinguishable answers would turn that into a list of accounts.
    const attempt = async (email: string): Promise<{ status: number; body: string }> => {
      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email, password: 'definitely-not-the-password' });

      return { status: res.status, body: JSON.stringify(res.body) };
    };

    await User.updateOne({ email: 'editor@spaajibade.test' }, { isActive: false });
    await User.create({
      name: 'Locked Out',
      email: 'locked@spaajibade.test',
      passwordHash: await hashPassword(TEST_PASSWORD),
      roles: ['editor'],
      isActive: true,
      lockedUntil: new Date(Date.now() + 60_000),
      totp: { enabled: true, secretEncrypted: null },
    });

    const unknown = await attempt('nobody-here@spaajibade.test');
    const disabled = await attempt('editor@spaajibade.test');
    const locked = await attempt('locked@spaajibade.test');

    expect(unknown.status).toBe(401);
    expect(disabled).toEqual(unknown);
    expect(locked).toEqual(unknown);
  });

  it('does not let a stranger lock an account out by guessing at it', async () => {
    // Failures only count against an account whose password was actually
    // wrong *and* which is active — so a lockout cannot be driven by somebody
    // who has never held the password, using a name from the website.
    for (let attempt = 0; attempt < AUTH.maxFailedLogins + 5; attempt += 1) {
      await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: 'not-a-user@spaajibade.test', password: 'wrong' });
    }

    const stored = await User.findOne({ email: 'editor@spaajibade.test' }).lean();
    expect(stored?.failedLoginCount ?? 0).toBe(0);
  });

  it('refuses a disabled account', async () => {
    await User.updateOne({ email: 'editor@spaajibade.test' }, { isActive: false });

    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'editor@spaajibade.test', password: TEST_PASSWORD });

    expect(res.status).toBe(403);
  });

  it('locks the account after ten failures and keeps refusing the right password', async () => {
    for (let attempt = 0; attempt < AUTH.maxFailedLogins; attempt += 1) {
      await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: 'editor@spaajibade.test', password: 'wrong' });
    }

    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'editor@spaajibade.test', password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/locked/i);
  });

  it('clears the failure count on a successful sign-in', async () => {
    await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'editor@spaajibade.test', password: 'wrong' });

    await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'editor@spaajibade.test', password: TEST_PASSWORD });

    const user = await User.findOne({ email: 'editor@spaajibade.test' }).lean();
    expect(user?.failedLoginCount).toBe(0);
  });
});

describe('two-factor at sign-in', () => {
  it('asks for a code with a distinct signal rather than rejecting the password', async () => {
    await createTestUser({ email: 'mfa@spaajibade.test', totpEnabled: true });

    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'mfa@spaajibade.test', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    // The dashboard needs to tell "prompt for a code" from "wrong password".
    expect(res.body.error.details).toEqual([{ path: 'totp', message: 'TOTP_REQUIRED' }]);
    expectToMatchContract(res, 'post', '/api/v1/admin/auth/login');
  });

  it('accepts a valid code once the authenticator is enrolled', async () => {
    const { token } = await createTestUser({ email: 'mfa3@spaajibade.test', totpEnabled: false });

    const setup = await request(app)
      .post('/api/v1/admin/auth/2fa/setup')
      .set('Authorization', `Bearer ${token}`);
    expect(setup.status).toBe(200);
    expectToMatchContract(setup, 'post', '/api/v1/admin/auth/2fa/setup');

    const enabled = await request(app)
      .post('/api/v1/admin/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: authenticator.generate(setup.body.data.secret) });
    expect(enabled.status).toBe(204);

    const login = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({
        email: 'mfa3@spaajibade.test',
        password: TEST_PASSWORD,
        totp: authenticator.generate(setup.body.data.secret),
      });

    expect(login.status).toBe(200);
  });

  it('stores the TOTP secret encrypted, not in the clear', async () => {
    const { token, user } = await createTestUser({
      email: 'enc@spaajibade.test',
      totpEnabled: false,
    });

    const setup = await request(app)
      .post('/api/v1/admin/auth/2fa/setup')
      .set('Authorization', `Bearer ${token}`);

    const stored = await User.findById(user._id).select('+totp.secretEncrypted').lean();
    const encrypted = stored?.totp.secretEncrypted ?? '';

    expect(encrypted).not.toContain(setup.body.data.secret);
    expect(decryptSecret(encrypted, TEST_ENV.ENCRYPTION_KEY ?? '')).toBe(setup.body.data.secret);
  });

  it('rejects a wrong code when enabling', async () => {
    const { token } = await createTestUser({ email: 'bad@spaajibade.test', totpEnabled: false });

    await request(app).post('/api/v1/admin/auth/2fa/setup').set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post('/api/v1/admin/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '000000' });

    expect(res.status).toBe(401);
  });

  it('refuses to enable before setup has run', async () => {
    const { token } = await createTestUser({
      email: 'nosetup@spaajibade.test',
      totpEnabled: false,
    });

    const res = await request(app)
      .post('/api/v1/admin/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '123456' });

    expect(res.status).toBe(409);
  });
});

describe('refresh rotation', () => {
  const signIn = async (): Promise<string> => {
    await createTestUser({ email: 'rot@spaajibade.test', totpEnabled: false });
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'rot@spaajibade.test', password: TEST_PASSWORD });
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
    const { token } = await createTestUser({ email: 'me@spaajibade.test' });

    const res = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/auth/me');
    expect(res.body.data.email).toBe('me@spaajibade.test');
  });

  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/v1/admin/auth/me');

    expect(res.status).toBe(401);
    expectToMatchContract(res, 'get', '/api/v1/admin/auth/me');
  });

  it('stops working the moment the account is deactivated', async () => {
    const { token, user } = await createTestUser({ email: 'gone@spaajibade.test' });

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
    await createTestUser({ email: 'pw@spaajibade.test', totpEnabled: false });
    const login = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'pw@spaajibade.test', password: TEST_PASSWORD });

    const res = await request(app)
      .post('/api/v1/admin/auth/password')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'a-brand-new-long-passphrase' });

    expect(res.status).toBe(204);

    // A session opened with the old password must not survive the change.
    const after = await request(app)
      .post('/api/v1/admin/auth/refresh')
      .set('Cookie', cookieFrom(login));
    expect(after.status).toBe(401);

    const relogin = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'pw@spaajibade.test', password: 'a-brand-new-long-passphrase' });
    expect(relogin.status).toBe(200);
  });

  it('refuses without the current password', async () => {
    const { token } = await createTestUser({ email: 'pw2@spaajibade.test' });

    const res = await request(app)
      .post('/api/v1/admin/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong', newPassword: 'a-brand-new-long-passphrase' });

    expect(res.status).toBe(401);
  });

  it('refuses a new password shorter than the minimum', async () => {
    const { token } = await createTestUser({ email: 'pw3@spaajibade.test' });

    const res = await request(app)
      .post('/api/v1/admin/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'short' });

    expect(res.status).toBe(400);
  });
});

describe('two-factor enforcement', () => {
  it('blocks an admin route until two-factor is enabled', async () => {
    const { token } = await createTestUser({ roles: ['admin'], totpEnabled: false });

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.details).toEqual([{ path: 'totp', message: 'TOTP_REQUIRED' }]);
  });

  it('still allows the auth routes, or nobody could ever enrol', async () => {
    const { token } = await createTestUser({ totpEnabled: false });

    const res = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

describe('a password change ends the sessions it was meant to end', () => {
  it('stops an access token that was issued before it', async () => {
    const { token } = await createTestUser({ roles: ['admin'], email: 'rotate@spaajibade.test' });

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
