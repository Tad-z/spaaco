import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { createTestUser, signAccessToken, signWithWrongSecret } from '../../support/auth.js';
import { runSeed } from '../../../scripts/seed.js';
import { Insight, User } from '../../../src/models/index.js';

/**
 * Who may see unpublished content.
 *
 * Preview is the one place a public route returns a draft, so the question is
 * not "is the token valid" but "is this an account that should be reading
 * this". It used to be the former, so a deactivated account kept reading every
 * embargoed insight and unannounced hire for the life of its token, and so did
 * a role with no content permission at all.
 *
 * Each case below is silent rather than a 403: preview is optional, so a
 * request that does not qualify is served the published site like any other.
 */

setupTestDb();

const app = buildTestApp();

const DRAFT_TITLE = 'An Embargoed Regulatory Update';

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

beforeEach(async () => {
  await runSeed();
  await Insight.create({
    title: DRAFT_TITLE,
    slug: 'an-embargoed-regulatory-update',
    format: 'article',
    categories: ['regulatory_updates'],
    status: 'draft',
  });
});

const listing = async (token?: string): Promise<request.Response> => {
  const req = request(app).get('/api/v1/insights?preview=true');
  if (token !== undefined) req.set('Authorization', `Bearer ${token}`);

  return req;
};

const sees = (res: request.Response): boolean => JSON.stringify(res.body).includes(DRAFT_TITLE);

describe('preview', () => {
  it('shows drafts to an active, enrolled editor', async () => {
    const { token } = await createTestUser({ roles: ['editor'] });

    expect(sees(await listing(token))).toBe(true);
  });

  it('shows drafts to an admin', async () => {
    const { token } = await createTestUser({ roles: ['admin'] });

    expect(sees(await listing(token))).toBe(true);
  });

  it('shows nothing to an anonymous caller who simply asks for preview', async () => {
    expect(sees(await listing())).toBe(false);
  });

  it('refuses a token signed with the wrong secret', async () => {
    expect(sees(await listing(signWithWrongSecret()))).toBe(false);
  });

  it('refuses a token for a user who does not exist', async () => {
    // Signature-valid and well-formed, but nothing behind it — which is all
    // the old check required.
    expect(sees(await listing(signAccessToken()))).toBe(false);
  });

  it('refuses an account that has been deactivated', async () => {
    const { user, token } = await createTestUser({ roles: ['editor'] });
    await User.updateOne({ _id: user._id }, { isActive: false });

    // The token is still within its fifteen minutes; the account is not.
    expect(sees(await listing(token))).toBe(false);
  });

  it('refuses a role with no content permission', async () => {
    // Business development handles enquiries and has no reason to read an
    // embargoed insight.
    const { token } = await createTestUser({ roles: ['business_dev'] });

    expect(sees(await listing(token))).toBe(false);
  });

  it('picks up a role being revoked without waiting for the token to expire', async () => {
    const { user, token } = await createTestUser({ roles: ['editor'] });
    await User.updateOne({ _id: user._id }, { roles: ['business_dev'] });

    expect(sees(await listing(token))).toBe(false);
  });

  it('refuses a token from before the account changed its password', async () => {
    const { user, token } = await createTestUser({ roles: ['editor'] });

    // Exactly the compromise the `credentialsChangedAt` rule exists for: the
    // admin API refuses this token, and drafts must not be the exception.
    await User.updateOne({ _id: user._id }, { credentialsChangedAt: new Date(Date.now() + 1000) });

    expect(sees(await listing(token))).toBe(false);
  });

  it('never caches a preview response, whoever asked for it', async () => {
    const { token } = await createTestUser({ roles: ['editor'] });

    const res = await listing(token);

    expect(res.headers['cache-control']).toBe('no-store');
  });
});
