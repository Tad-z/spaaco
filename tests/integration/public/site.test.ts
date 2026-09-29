import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { runSeed } from '../../../scripts/seed.js';
import { Faq, Office, PracticeArea, Settings } from '../../../src/models/index.js';
import { normalise, readFixture } from '../../support/fixtures.js';
import { expiredToken, previewToken, signWithWrongSecret } from '../../support/auth.js';

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

  it('deep-equals its published fixture', async () => {
    const res = await request(app).get('/api/v1/site');

    expect(normalise(res.body)).toEqual(normalise(readFixture('site.json')));
  });

  it('takes the About dropdown from settings, and the Insights one from the public categories', async () => {
    await Settings.updateOne(
      { key: 'site' },
      { $set: { aboutAnchors: [{ label: 'Our History', href: '/about#story', kind: 'internal' }] } }
    );

    const res = await request(app).get('/api/v1/site');
    interface Entry {
      label: string;
      children: { label: string; href: string }[];
    }
    const nav = (res.body as { data: { nav: Entry[] } }).data.nav;
    const entry = (label: string): Entry => {
      const found = nav.find((item) => item.label === label);
      if (!found) throw new Error(`no nav entry "${label}"`);
      return found;
    };

    expect(entry('About Us').children.map((child) => child.label)).toEqual(['Our History']);
    // Pro bono stories are not a tab, so they are not a nav entry either (ADR-049).
    expect(entry('Insights & News').children.map((child) => child.href)).not.toContain(
      '/insights?category=pro_bono'
    );
    expect(entry('Practice Areas').children).toEqual([]);
  });

  it("falls back to the site's phone and email for an office with none", async () => {
    await Office.updateOne({ slug: 'abuja' }, { phone: '+234 9 000 0000' });

    const res = await request(app).get('/api/v1/site');
    const [lagos, abuja] = res.body.data.footer.offices;

    expect(lagos).toMatchObject({
      phone: '(+234) 80000000000',
      email: 'frontoffice@spaajibade.com',
    });
    expect(abuja).toMatchObject({ phone: '+234 9 000 0000', email: 'frontoffice@spaajibade.com' });
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
    expect(
      res.body.data.faqSection.stillHaveQuestions.actions.map((a: { href: string }) => a.href)
    ).toEqual(['action:chat', 'action:message', 'action:call']);
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

  it('hides a draft practice area from the footer', async () => {
    await PracticeArea.updateOne({ slug: 'tax' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/site');

    // All nine are footer-flagged in v2, so eight remain.
    expect(res.body.data.footer.practiceAreas).toHaveLength(8);
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
      .set('Authorization', `Bearer ${await previewToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.faqSection.items).toHaveLength(5);
    expectToMatchContract(res, 'get', '/api/v1/site');
  });

  it('ignores a valid token when preview was not asked for', async () => {
    await Faq.updateOne({ slug: 'how-do-i-schedule-a-consultation' }, { status: 'draft' });

    const res = await request(app)
      .get('/api/v1/site')
      .set('Authorization', `Bearer ${await previewToken()}`);

    expect(res.body.data.faqSection.items).toHaveLength(4);
  });
});
