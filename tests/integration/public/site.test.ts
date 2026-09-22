import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { runSeed } from '../../../scripts/seed.js';
import { Faq, PracticeArea } from '../../../src/models/index.js';
import { expiredToken, signAccessToken, signWithWrongSecret } from '../../support/auth.js';

/**
 * The global shell. Every page depends on it, so this is also where draft
 * exclusion is proved for the collections it embeds (ADR-029: once per
 * resource, not once per endpoint).
 */

setupTestDb();

const app = buildTestApp();

beforeEach(async () => {
  await runSeed();
});

describe('GET /api/v1/site', () => {
  it('returns the shell and matches the contract', async () => {
    const res = await request(app).get('/api/v1/site');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/site');
    expect(res.body.data.settings.firmName).toBe('SPA Ajibade & Co.');
  });

  it('builds the practice areas dropdown from the collection', async () => {
    const res = await request(app).get('/api/v1/site');

    const dropdown = res.body.data.nav.find(
      (item: { label: string }) => item.label === 'Practice Areas'
    );

    expect(dropdown.children).toHaveLength(9);
    expect(dropdown.children[0]).toMatchObject({ kind: 'internal' });
  });

  it('lists only the footer-flagged practice areas, which is a shorter list', async () => {
    const res = await request(app).get('/api/v1/site');

    // The design's footer shows 7 of the 9 areas.
    expect(res.body.data.footer.practiceAreas).toHaveLength(7);
    expect(res.body.data.nav.find((i: { label: string }) => i.label === 'Practice Areas').children)
      .toHaveLength(9);
  });

  it('orders offices Lagos, Abuja, Ibadan, as the page does', async () => {
    const res = await request(app).get('/api/v1/site');

    expect(res.body.data.footer.offices.map((o: { name: string }) => o.name)).toEqual([
      'Lagos',
      'Abuja',
      'Ibadan',
    ]);
  });

  it('embeds the FAQ items and the still-have-questions actions', async () => {
    const res = await request(app).get('/api/v1/site');

    expect(res.body.data.faqSection.items).toHaveLength(5);
    expect(res.body.data.faqSection.stillHaveQuestions.actions.map((a: { href: string }) => a.href)).toEqual([
      'action:chat',
      'action:message',
      'action:call',
    ]);
  });

  it('returns 404 when the site has never been configured', async () => {
    await mongoose.connection.collection('settings').deleteMany({});

    const res = await request(app).get('/api/v1/site');

    expect(res.status).toBe(404);
    expectToMatchContract(res, 'get', '/api/v1/site');
  });
});

describe('draft exclusion', () => {
  it('hides a draft FAQ', async () => {
    await Faq.updateOne({ slug: 'how-do-i-schedule-a-consultation' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/site');

    expect(res.body.data.faqSection.items).toHaveLength(4);
    expect(
      res.body.data.faqSection.items.map((f: { question: string }) => f.question)
    ).not.toContain('How do I schedule a consultation?');
  });

  it('hides a draft practice area from the nav and the footer', async () => {
    await PracticeArea.updateOne({ slug: 'tax' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/site');

    const dropdown = res.body.data.nav.find((i: { label: string }) => i.label === 'Practice Areas');
    expect(dropdown.children).toHaveLength(8);
    expect(res.body.data.footer.practiceAreas).toHaveLength(6);
  });

  it('still hides drafts when preview is requested without a token', async () => {
    await Faq.updateOne({ slug: 'how-do-i-schedule-a-consultation' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/site?preview=true');

    expect(res.body.data.faqSection.items).toHaveLength(4);
  });

  it.each([
    ['a malformed token', 'not-a-real-token'],
    ['a token signed with the wrong secret', signWithWrongSecret()],
    ['an expired token', expiredToken()],
  ])('still hides drafts with %s', async (_label, token) => {
    await Faq.updateOne({ slug: 'how-do-i-schedule-a-consultation' }, { status: 'draft' });

    const res = await request(app)
      .get('/api/v1/site?preview=true')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.faqSection.items).toHaveLength(4);
  });

  it('shows drafts only with both preview and a valid admin token', async () => {
    await Faq.updateOne({ slug: 'how-do-i-schedule-a-consultation' }, { status: 'draft' });

    const res = await request(app)
      .get('/api/v1/site?preview=true')
      .set('Authorization', `Bearer ${signAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.faqSection.items).toHaveLength(5);
    expectToMatchContract(res, 'get', '/api/v1/site');
  });

  it('ignores a valid token when preview was not asked for', async () => {
    await Faq.updateOne({ slug: 'how-do-i-schedule-a-consultation' }, { status: 'draft' });

    const res = await request(app)
      .get('/api/v1/site')
      .set('Authorization', `Bearer ${signAccessToken()}`);

    expect(res.body.data.faqSection.items).toHaveLength(4);
  });
});
