import type { Model } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestDb } from '../support/setup-db.js';
import { existingContent, loadLaunchContent } from '../../scripts/load-launch-content.js';
import {
  Faq,
  Insight,
  Job,
  Media,
  Office,
  Page,
  Person,
  PracticeArea,
  Recognition,
  Settings,
} from '../../src/models/index.js';

/**
 * The launch loader.
 *
 * It runs once, by hand, against the firm's real database, and the person
 * running it will not have read the code. So the properties worth proving are
 * the ones that protect them from it: nothing published, no invented images,
 * and an outright refusal if the database already holds anything.
 */

setupTestDb();

beforeEach(async () => {
  // Typed as a common Model so the heterogeneous list has one call signature.
  const models: Model<unknown>[] = [
    PracticeArea,
    Person,
    Office,
    Insight,
    Recognition,
    Faq,
    Job,
    Page,
    Settings,
    Media,
  ] as unknown as Model<unknown>[];

  await Promise.all(models.map((model) => model.deleteMany({})));
});

describe('loading the launch content', () => {
  it('creates the firm copy from the fixtures', async () => {
    const result = await loadLaunchContent();

    expect(result.practiceAreas).toBeGreaterThan(0);
    expect(result.people).toBeGreaterThan(0);
    expect(result.pages).toBe(8);
    expect(result.settings).toBe(1);

    const tax = await PracticeArea.findOne({ slug: 'tax' }).lean();
    expect(tax?.title).toBe('Tax');
  });

  it('creates every collection item as a draft', async () => {
    await loadLaunchContent();

    for (const model of [PracticeArea, Person, Office, Insight, Recognition, Faq, Job]) {
      const published = await model.countDocuments({ status: 'published' });
      expect(published, model.modelName).toBe(0);
    }
  });

  it('creates pages and settings that are live immediately, which the CLI warns about', async () => {
    await loadLaunchContent();

    // Not a draft rule that is being broken — pages and settings have no
    // publish state, because the site has no shell without them. Pinned here
    // so the behaviour is deliberate and documented rather than assumed: the
    // loader must run before the domain points at the site.
    expect(await Page.countDocuments()).toBe(8);
    expect(await Settings.countDocuments()).toBe(1);

    const home = await Page.findOne({ key: 'home' }).lean();
    expect(home?.hero).toBeTruthy();
  });

  it('leaves nothing behind when a run fails partway', async () => {
    // A half-loaded database is the worst outcome: the guard then refuses to
    // run again and there is no --force, so the operator would be dropping
    // collections by hand in production.
    const original = Settings.create.bind(Settings);
    // Settings is created last, so failing it proves the earlier writes undo.
    (Settings as unknown as { create: () => Promise<never> }).create = () =>
      Promise.reject(new Error('Atlas went away'));

    await expect(loadLaunchContent()).rejects.toThrow('Atlas went away');

    expect(await existingContent()).toEqual([]);

    (Settings as unknown as { create: typeof original }).create = original;
  });

  it('leaves no publication date to be mistaken for a real one', async () => {
    await loadLaunchContent();

    expect(await Insight.countDocuments({ publishedAt: { $ne: null } })).toBe(0);
  });

  it('creates no images at all', async () => {
    await loadLaunchContent();

    // The dev seed invents placehold.co pictures. A placeholder that reaches
    // production is a placeholder somebody has to notice and remove.
    expect(await Media.countDocuments()).toBe(0);

    const withImage = await PracticeArea.countDocuments({ image: { $ne: null } });
    expect(withImage).toBe(0);
  });

  it('leaves vacancies closed until the firm opens them', async () => {
    await loadLaunchContent();

    expect(await Job.countDocuments({ isOpen: true })).toBe(0);
  });

  it('resolves the references between collections', async () => {
    await loadLaunchContent();

    // The fixtures name references by slug; the loader has to turn each into
    // the id of a record it created moments earlier, in the right order.
    const insight = await Insight.findOne({ author: { $ne: null } }).lean();
    const author = await Person.findById(insight?.author).lean();
    expect(author?.lastName).toBeTruthy();

    const job = await Job.findOne({ office: { $ne: null } }).lean();
    const office = await Office.findById(job?.office).lean();
    expect(office?.name).toBeTruthy();

    const person = await Person.findOne({ office: { $ne: null } }).lean();
    expect(await Office.findById(person?.office).lean()).toBeTruthy();
  });

  it('reports an empty database as empty', async () => {
    expect(await existingContent()).toEqual([]);
  });

  it('reports what it found, so the refusal can say why', async () => {
    await loadLaunchContent();

    const found = await existingContent();

    expect(found.length).toBeGreaterThan(0);
    expect(found.join(', ')).toContain('practice areas');
  });

  it('would refuse a database holding only one FAQ', async () => {
    // The guard is "any content at all", not "a lot of content": a firm that
    // has started work has started work.
    await Faq.create({ question: 'Started already?', answer: '<p>Yes.</p>', slug: 'started' });

    expect(await existingContent()).toEqual(['1 FAQs']);
  });
});
