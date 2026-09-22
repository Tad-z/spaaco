import mongoose from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb } from '../support/setup-db.js';
import { Faq, Insight, Job, Media, Office, Person, PracticeArea, Recognition } from '../../src/models/index.js';
import { MEDIA_REFS } from '../../src/constants/media-refs.js';

/**
 * Model-level rules that no endpoint test would reach directly: validation the
 * schema enforces, the indexes the query patterns depend on, and the media
 * reference registry that deletes and cache invalidation are built on.
 */

setupTestDb();

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

const media = async (): Promise<mongoose.Types.ObjectId> => {
  const doc = await Media.create({
    provider: 'local',
    storageKey: 'test/image.jpg',
    url: 'https://placehold.co/1200x900',
    width: 1200,
    height: 900,
    mimeType: 'image/jpeg',
    bytes: 1024,
    alt: 'A placeholder image',
  });
  return doc._id;
};

describe('validation rules', () => {
  it('requires videoUrl on a video insight, which would otherwise ship a dead button', async () => {
    await expect(
      Insight.create({ title: 'A talk', format: 'video', categories: ['firm_news'] })
    ).rejects.toThrow(/videoUrl is required when format is "video"/);
  });

  it('accepts a video insight that has a videoUrl', async () => {
    const doc = await Insight.create({
      title: 'A talk',
      format: 'video',
      videoUrl: 'https://youtube.com/watch?v=abc',
      categories: ['firm_news'],
    });

    expect(doc.format).toBe('video');
  });

  it('does not require videoUrl on an article', async () => {
    const doc = await Insight.create({ title: 'An article', format: 'article', categories: ['articles'] });

    expect(doc.videoUrl).toBeNull();
  });

  it('requires at least one insight category', async () => {
    await expect(
      Insight.create({ title: 'Uncategorised', format: 'article', categories: [] })
    ).rejects.toThrow(/at least one category/);
  });

  it('rejects an insight category outside the enum', async () => {
    await expect(
      Insight.create({ title: 'x', format: 'article', categories: ['gossip'] as never })
    ).rejects.toThrow();
  });

  it('rejects a person role outside the enum', async () => {
    await expect(
      Person.create({ firstName: 'Ada', lastName: 'Nwosu', role: 'intern' as never })
    ).rejects.toThrow();
  });

  it('accepts every role the contract defines', async () => {
    const doc = await Person.create({ firstName: 'Ada', lastName: 'Nwosu', role: 'nysc_associate' });

    expect(doc.role).toBe('nysc_associate');
  });

  it('requires alt text on media, which the admin UI enforces on upload', async () => {
    await expect(
      Media.create({
        provider: 'local',
        storageKey: 'k',
        url: 'u',
        width: 1,
        height: 1,
        mimeType: 'image/jpeg',
        bytes: 1,
      })
    ).rejects.toThrow(/alt/);
  });

  it('rejects an SVG upload, which can carry scripts', async () => {
    await expect(
      Media.create({
        provider: 'local',
        storageKey: 'k',
        url: 'u',
        width: 1,
        height: 1,
        mimeType: 'image/svg+xml',
        bytes: 1,
        alt: 'a logo',
      })
    ).rejects.toThrow();
  });

  it('rejects office coordinates given the wrong way round', async () => {
    await expect(
      Office.create({
        name: 'Lagos',
        address: 'Onikan',
        hours: '8-4',
        // Latitude in the longitude slot: valid as a pair, invalid as GeoJSON.
        location: { type: 'Point', coordinates: [6.45, 200] },
      })
    ).rejects.toThrow(/longitude, latitude/);
  });

  it('accepts a null office location, since real coordinates are still outstanding', async () => {
    const doc = await Office.create({ name: 'Lagos', address: 'Onikan', hours: '8-4' });

    expect(doc.location).toBeNull();
  });

  it('rejects an unknown field rather than silently dropping it', async () => {
    await expect(
      Faq.create({ question: 'Q?', answer: 'A', notAField: true } as never)
    ).rejects.toThrow();
  });
});

describe('indexes', () => {
  const expected: [mongoose.Model<never>, Record<string, unknown>[]][] = [
    [PracticeArea as never, [{ status: 1, order: 1 }]],
    [Person as never, [{ status: 1, role: 1, order: 1 }]],
    [Insight as never, [{ status: 1, categories: 1, publishedAt: -1 }, { status: 1, featured: 1, publishedAt: -1 }]],
    [Office as never, [{ status: 1, order: 1 }]],
    [Faq as never, [{ status: 1, order: 1 }]],
    [Job as never, [{ status: 1, isOpen: 1, closingDate: 1, order: 1 }]],
    [Recognition as never, [{ status: 1, tab: 1, order: 1 }]],
  ];

  it.each(expected.map(([model, keys]) => ({ name: model.modelName, model, keys })))(
    '$name declares the indexes its queries need',
    async ({ model, keys }) => {
      const actual = (await model.listIndexes()).map((index) => JSON.stringify(index.key));

      for (const key of keys) {
        expect(actual).toContain(JSON.stringify(key));
      }
    }
  );

  it.each([
    { name: 'PracticeArea', model: PracticeArea },
    { name: 'Person', model: Person },
    { name: 'Insight', model: Insight },
    { name: 'Media', model: Media },
  ])('$name has a text index for search', async ({ model }) => {
    const indexes = await model.listIndexes();

    expect(indexes.some((index) => Object.values(index.key).includes('text'))).toBe(true);
  });

  it('indexes office locations for geospatial queries', async () => {
    const indexes = await Office.listIndexes();

    expect(indexes.some((index) => Object.values(index.key).includes('2dsphere'))).toBe(true);
  });

  it('enforces slug uniqueness on every content collection', async () => {
    for (const model of [PracticeArea, Person, Insight, Office, Faq, Job, Recognition]) {
      const indexes = await model.listIndexes();
      const slugIndex = indexes.find((index) => JSON.stringify(index.key) === JSON.stringify({ slug: 1 }));

      expect(slugIndex, `${model.modelName} has no slug index`).toBeDefined();
      expect(slugIndex?.unique, `${model.modelName}'s slug index is not unique`).toBe(true);
    }
  });
});

describe('media reference registry', () => {
  /** Every ObjectId path in a schema that points at the Media model. */
  const mediaPaths = (model: mongoose.Model<never>): string[] => {
    const paths: string[] = [];
    model.schema.eachPath((path, type) => {
      // A ref sits on the path's own options, or on the caster's for an array.
      const caster = (type as { caster?: { options?: { ref?: unknown } } }).caster;
      const ref: unknown = type.options.ref ?? caster?.options?.ref;
      if (ref === 'Media') paths.push(path);
    });
    return paths;
  };

  it('lists every media field declared by a model', () => {
    const registered = new Set(MEDIA_REFS.map((ref) => `${ref.model}.${ref.path}`));
    const missing: string[] = [];

    for (const name of mongoose.modelNames()) {
      const model = mongoose.model(name) as unknown as mongoose.Model<never>;
      for (const path of mediaPaths(model)) {
        if (!registered.has(`${name}.${path}`)) missing.push(`${name}.${path}`);
      }
    }

    expect(
      missing,
      'Add these to src/constants/media-refs.ts, or deleting an in-use image will succeed ' +
        'and cache invalidation will miss the pages that show it.'
    ).toEqual([]);
  });

  it('registers nothing that no longer exists', () => {
    for (const ref of MEDIA_REFS) {
      const model = mongoose.models[ref.model];
      expect(model, `media-refs names model "${ref.model}", which is not registered`).toBeDefined();
      expect(model?.schema.path(ref.path), `${ref.model}.${ref.path} is not a real path`).toBeDefined();
    }
  });

  it('names a label field that exists on each model', () => {
    for (const ref of MEDIA_REFS) {
      expect(mongoose.models[ref.model]?.schema.path(ref.label)).toBeDefined();
    }
  });

  it('can actually find a usage through the registry', async () => {
    const imageId = await media();
    await PracticeArea.create({ title: 'Tax', shortLabel: 'Tax', summary: 'Summary', image: imageId });

    const ref = MEDIA_REFS.find((entry) => entry.model === 'PracticeArea');
    expect(ref).toBeDefined();

    const found = await PracticeArea.find({ [ref?.path ?? 'image']: imageId }).lean();
    expect(found).toHaveLength(1);
  });
});
