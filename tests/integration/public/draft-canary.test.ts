import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { createTestUser } from '../../support/auth.js';
import { runSeed } from '../../../scripts/seed.js';
import { makeMedia } from '../../support/factories.js';
import {
  Faq,
  Insight,
  Job,
  Media,
  Office,
  Person,
  PracticeArea,
  Recognition,
} from '../../../src/models/index.js';
import { asObject, spec } from '../../support/spec.js';
import { API_PREFIX } from '../../../src/routes/index.js';
import { PAGE_KEYS } from '../../../src/constants/enums.js';

/**
 * The draft canary sweep (ADR-034).
 *
 * `draft-references.test.ts` pins the specific leaks we have already found, one
 * surface at a time. This does the opposite: it plants one unmistakable string
 * in unpublished data of *every* kind, then calls *every* public GET the spec
 * declares and asserts the string comes back nowhere.
 *
 * The value is in being exhaustive by construction. A new public endpoint, or a
 * new composed section on an existing one, is swept the moment it appears in
 * `openapi.yaml` — nobody has to remember to add a draft test for it.
 */

setupTestDb();

const app = buildTestApp();

/**
 * Lowercase and slug-safe on purpose: the content plugin derives slugs from the
 * title, so the canary survives into the slug too and a leak through either a
 * name or a URL is caught by the same search.
 */
const CANARY = 'canary7f3a91xyz';

const html = (label: string): string => `<p>Unpublished ${label} ${CANARY}.</p>`;

/**
 * One unpublished item of every kind, all cross-referencing each other and a
 * piece of media that nothing published points at.
 */
async function seedCanaries(): Promise<void> {
  const media = await Media.create(
    makeMedia({
      storageKey: `drafts/${CANARY}`,
      url: `https://placehold.co/1200x900?text=${CANARY}`,
      title: `Draft image ${CANARY}`,
      alt: `A draft image ${CANARY}`,
    })
  );

  const office = await Office.create({
    name: `Draft Office ${CANARY}`,
    address: `1 Draft Street ${CANARY}`,
    hours: `Closed ${CANARY}`,
    phone: `+234 000 ${CANARY}`,
  });

  const practiceArea = await PracticeArea.create({
    title: `Draft Practice ${CANARY}`,
    shortLabel: `Draft ${CANARY}`,
    summary: `An unpublished practice area ${CANARY}.`,
    image: media._id,
    body: html('practice area'),
  });

  const person = await Person.create({
    firstName: 'Draft',
    lastName: CANARY,
    role: 'partner',
    photo: media._id,
    bio: html('attorney'),
    quote: `Never published ${CANARY}`,
    practiceAreas: [practiceArea._id],
    office: office._id,
    featuredInLeadership: true,
  });

  await Insight.create({
    title: `Draft Insight ${CANARY}`,
    excerpt: `An unpublished insight ${CANARY}.`,
    body: html('insight'),
    format: 'article',
    categories: ['regulatory_updates'],
    practiceAreas: [practiceArea._id],
    author: person._id,
    coverImage: media._id,
    featured: true,
  });

  await Recognition.create({
    organization: `Draft Awards ${CANARY}`,
    title: `Unpublished Ranking ${CANARY}`,
    year: 2026,
    badge: media._id,
    tab: 'achievements',
  });

  await Faq.create({
    question: `Is this question published ${CANARY}?`,
    answer: html('answer'),
  });

  await Job.create({
    title: `Draft Vacancy ${CANARY}`,
    description: html('vacancy'),
    experience: `3 years ${CANARY}`,
    employmentType: 'full_time',
    workMode: 'hybrid',
    practiceArea: practiceArea._id,
    office: office._id,
    isOpen: true,
  });

  // A *published* insight whose author is unpublished. The canary here is
  // reachable only by following a reference out of published content, which is
  // the leak ADR-031 fixed and the one most likely to come back.
  const insight = await Insight.findOne({ status: 'published', author: { $ne: null } })
    .select('author')
    .lean<{ author: unknown } | null>();

  expect(insight?.author, 'the seed has no published insight with an author').toBeTruthy();

  await Person.updateOne(
    { _id: insight?.author },
    { status: 'draft', quote: `Demoted to draft ${CANARY}` }
  );
}

/**
 * Paths the sweep deliberately skips, each for a stated reason.
 *
 * An explicit list, not a silent filter: `concreteUrls` throws on any
 * parameterised path it has no value for, so a new endpoint has to be
 * considered here rather than quietly going unswept.
 */
const NOT_CONTENT: Record<string, string> = {
  // Serves one stored binary to a holder of a signature. It has no content, no
  // draft concept and no reachable response without a valid signed link —
  // cv-download.test.ts covers what it refuses.
  [`${API_PREFIX}/files/cv/{key}`]: 'serves a signed binary, not content',
};

/** Every public GET the contract declares — admin paths are not public. */
function publicGetPaths(): string[] {
  const paths = asObject(spec.paths) ?? {};

  return Object.keys(paths)
    .filter((path) => !path.startsWith(`${API_PREFIX}/admin`))
    .filter((path) => !(path in NOT_CONTENT))
    .filter((path) => asObject(paths[path])?.get !== undefined)
    .sort();
}

/**
 * Concrete, callable URLs for those paths, using values from the seed.
 *
 * An unrecognised placeholder throws rather than being skipped: a new
 * parameterised public path must be given a value here, or the sweep would
 * quietly stop covering it — exactly the rot this test exists to prevent.
 */
async function concreteUrls(): Promise<string[]> {
  const [practiceArea, person, insight, job] = await Promise.all([
    PracticeArea.findOne({ status: 'published' }).select('slug').lean<{ slug: string } | null>(),
    Person.findOne({ status: 'published' }).select('slug').lean<{ slug: string } | null>(),
    Insight.findOne({ status: 'published' }).select('slug').lean<{ slug: string } | null>(),
    Job.findOne({ status: 'published' }).select('_id').lean<{ _id: unknown } | null>(),
  ]);

  const bySlug: Record<string, string | undefined> = {
    [`${API_PREFIX}/practice-areas/{slug}`]: practiceArea?.slug,
    [`${API_PREFIX}/people/{slug}`]: person?.slug,
    [`${API_PREFIX}/insights/{slug}`]: insight?.slug,
  };

  const urls: string[] = [];

  for (const path of publicGetPaths()) {
    if (path === `${API_PREFIX}/pages/{key}`) {
      urls.push(...PAGE_KEYS.values.map((key) => `${API_PREFIX}/pages/${key}`));
      continue;
    }

    if (path === `${API_PREFIX}/search`) {
      // Including the canary itself: search is the one endpoint whose caller
      // chooses the haystack, so it gets asked for the secret by name.
      urls.push(
        ...['law', 'draft', CANARY].map((q) => `${API_PREFIX}/search?q=${encodeURIComponent(q)}`)
      );
      continue;
    }

    if (path === `${API_PREFIX}/jobs/{id}`) {
      urls.push(`${API_PREFIX}/jobs/${String(job?._id)}`);
      continue;
    }

    const slug = bySlug[path];
    if (slug !== undefined) {
      urls.push(path.replace('{slug}', slug));
      continue;
    }

    if (path.includes('{')) {
      throw new Error(
        `${path} has a parameter the canary sweep has no value for. ` +
          'Add one in concreteUrls(), or the path goes unswept.'
      );
    }

    urls.push(path);
  }

  return urls;
}

beforeEach(async () => {
  await runSeed();
  await seedCanaries();
});

describe('the draft canary sweep', () => {
  it('calls every public GET path in the spec', async () => {
    const urls = await concreteUrls();

    // Guards against the sweep silently shrinking to nothing.
    expect(urls.length).toBeGreaterThanOrEqual(publicGetPaths().length);
    expect(urls).toContain(`${API_PREFIX}/pages/home`);
    expect(urls.every((url) => !url.includes('{'))).toBe(true);
  });

  it('never returns unpublished content to an anonymous caller', async () => {
    const urls = await concreteUrls();
    const leaks: string[] = [];

    for (const url of urls) {
      const res = await request(app).get(url);

      // A 404 everywhere would make the assertion below vacuous, so the sweep
      // insists each path actually answered with a body.
      expect(res.status, `${url} returned ${String(res.status)}`).toBe(200);
      if (JSON.stringify(res.body).includes(CANARY)) leaks.push(url);
    }

    expect(leaks, `unpublished content leaked from: ${leaks.join(', ')}`).toEqual([]);
  });

  it('ignores a preview request that carries no token', async () => {
    const urls = await concreteUrls();
    const leaks: string[] = [];

    for (const url of urls) {
      const res = await request(app).get(`${url}${url.includes('?') ? '&' : '?'}preview=true`);

      expect(res.status, `${url} returned ${String(res.status)}`).toBe(200);
      if (JSON.stringify(res.body).includes(CANARY)) leaks.push(url);
    }

    expect(leaks, `preview=true without a token leaked: ${leaks.join(', ')}`).toEqual([]);
  });

  it('does return the canary to a valid preview token, which proves it bites', async () => {
    // Without this the sweep above could pass because the canary was never in
    // the database at all. Preview is the one caller allowed to see it.
    const { token } = await createTestUser({ roles: ['editor'] });
    const found: string[] = [];

    for (const url of await concreteUrls()) {
      const res = await request(app)
        .get(`${url}${url.includes('?') ? '&' : '?'}preview=true`)
        .set('Authorization', `Bearer ${token}`);

      if (JSON.stringify(res.body).includes(CANARY)) found.push(url);
    }

    expect(found.length, 'the canary was invisible even to preview').toBeGreaterThan(3);
  });
});
