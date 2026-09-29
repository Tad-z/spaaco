import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { runSeed } from '../../../scripts/seed.js';
import { Industry, Insight, Office, Person, PracticeArea } from '../../../src/models/index.js';
import { createTestUser } from '../../support/auth.js';

/**
 * Drafts reached through a *reference*, not as the root of a query.
 *
 * `publishedFilter` only constrains the document being fetched, so for a while
 * a published insight written by a draft attorney published that attorney's
 * name, slug and photo — and a draft practice area appeared as a chip on
 * cards across five surfaces. These are the cases that regression would show
 * up in.
 */

setupTestDb();

const app = buildTestApp();

beforeEach(async () => {
  await runSeed();
});

describe('a draft attorney referenced by a published insight', () => {
  it('is not exposed as the author on the listing', async () => {
    await Person.updateOne({ slug: 'john-onyido' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/insights');

    expect(JSON.stringify(res.body)).not.toContain('john-onyido');
  });

  it('falls back to the firm author block rather than dropping the card', async () => {
    await Person.updateOne({ slug: 'john-onyido' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/insights?practiceArea=energy-natural-resources');
    const authors = res.body.data.map((card: { author: { type: string } }) => card.author.type);

    // The insight itself is still published, so it must still be listed.
    expect(res.body.data).toHaveLength(2);
    expect(authors).toContain('firm');
  });

  it('is not exposed through a composed page', async () => {
    await Person.updateOne({ slug: 'john-onyido' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/pages/home');

    expect(JSON.stringify(res.body)).not.toContain('john-onyido');
  });

  it('is not exposed through search', async () => {
    await Person.updateOne({ slug: 'john-onyido' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/search?q=energy');

    expect(JSON.stringify(res.body)).not.toContain('john-onyido');
  });

  it('is still exposed with a valid preview token, which is the point of preview', async () => {
    await Person.updateOne({ slug: 'john-onyido' }, { status: 'draft' });

    // A real, active, TOTP-enrolled editor: preview reloads the user, so a
    // merely signature-valid token is not enough (and used not to be checked).
    const { token } = await createTestUser({ roles: ['editor'] });

    const res = await request(app)
      .get('/api/v1/insights?preview=true')
      .set('Authorization', `Bearer ${token}`);

    expect(JSON.stringify(res.body)).toContain('john-onyido');
  });
});

describe('a draft practice area referenced elsewhere', () => {
  it('disappears from an insight card and its chips', async () => {
    await PracticeArea.updateOne({ slug: 'energy-natural-resources' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/insights');
    const body = JSON.stringify(res.body);

    expect(body).not.toContain('energy-natural-resources');
    expect(body).not.toContain('Energy & Natural Resources');
  });

  it('disappears from a job card and its chips', async () => {
    await PracticeArea.updateOne(
      { slug: 'corporate-finance-capital-markets' },
      { status: 'draft' }
    );

    const res = await request(app).get('/api/v1/jobs');

    expect(res.body.data[0].practiceArea).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('corporate-finance-capital-markets');
  });

  it('disappears from an attorney profile', async () => {
    const area = await PracticeArea.findOne({ slug: 'tax' }).lean();
    await Person.updateOne({ slug: 'john-onyido' }, { practiceAreas: [area?._id] });
    await PracticeArea.updateOne({ slug: 'tax' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/people/john-onyido');

    expect(res.body.data.practiceAreas).toEqual([]);
  });
});

describe('other draft references', () => {
  it('hides a draft office from a job card', async () => {
    await Office.updateOne({ slug: 'lagos' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/jobs');

    expect(res.body.data[0].office).toBeNull();
    expect(res.body.data[0].chips).not.toContain('Lagos');
  });

  it('hides a draft office from an attorney profile', async () => {
    await Office.updateOne({ slug: 'lagos' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/people/john-onyido');

    expect(res.body.data.office).toBeNull();
  });

  it('hides a draft attorney quoted on the About page', async () => {
    await Person.updateOne({ slug: 'babatunde-ajibade' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/pages/about');

    expect(res.body.data.story.quotePerson).toBeNull();
  });

  it('hides a draft practice lead, rather than showing the card', async () => {
    await Person.updateOne({ slug: 'kolawole-mayomi' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/practice-areas/dispute-resolution-arbitration');

    expect(res.body.data.lead).toBeNull();
  });

  it('hides a draft industry from the practice areas that pick it', async () => {
    await Industry.updateOne({ slug: 'banking-finance' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/practice-areas/dispute-resolution-arbitration');

    expect(res.body.data.industries.map((i: { slug: string }) => i.slug)).not.toContain(
      'banking-finance'
    );
    expect(res.body.data.industries).toHaveLength(3);
  });

  it('hides a draft practice area from the sidebar and the card-back chips', async () => {
    await PracticeArea.updateOne(
      { slug: 'corporate-finance-capital-markets' },
      { status: 'draft' }
    );

    const area = await request(app).get('/api/v1/practice-areas/tax');
    const person = await request(app).get('/api/v1/people/babatunde-ajibade');

    expect(area.body.data.siblings).toHaveLength(8);
    expect(person.body.data.practiceAreas.map((p: { slug: string }) => p.slug)).toEqual([
      'dispute-resolution-arbitration',
    ]);
  });

  it('hides a draft insight from a practice area detail page', async () => {
    await Insight.updateMany({}, { status: 'draft' });

    const res = await request(app).get('/api/v1/practice-areas/dispute-resolution-arbitration');

    expect(res.body.data.recentPublications).toEqual([]);
  });
});
