import { Schema, model } from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb } from '../support/setup-db.js';
import { contentPlugin } from '../../src/models/plugins/content.plugin.js';

/**
 * The content plugin is applied to all seven content collections, so its
 * behaviour is tested once, here, against a throwaway model rather than being
 * re-proved for each collection.
 *
 * It needs a real database: slug collision handling is a query, and uniqueness
 * is ultimately enforced by an index.
 */

setupTestDb();

interface ProbeDoc {
  title: string;
  slug: string;
  status: 'draft' | 'published';
  publishedAt?: Date | null;
  order: number;
  revision: number;
}

const probeSchema = new Schema<ProbeDoc>(
  { title: { type: String, required: true } },
  { timestamps: true, strict: 'throw' }
);
probeSchema.plugin(contentPlugin, { source: 'title' });

const Probe = model<ProbeDoc>('ContentPluginProbe', probeSchema);

beforeAll(async () => {
  await Probe.syncIndexes();
});

describe('slug generation', () => {
  it('generates a slug from the source field', async () => {
    const doc = await Probe.create({ title: 'Dispute Resolution & Arbitration' });

    expect(doc.slug).toBe('dispute-resolution-arbitration');
  });

  it('keeps a slug the caller supplied', async () => {
    const doc = await Probe.create({ title: 'Tax', slug: 'custom-tax-slug' });

    expect(doc.slug).toBe('custom-tax-slug');
  });

  it('suffixes a colliding slug rather than failing', async () => {
    await Probe.create({ title: 'Tax' });
    const second = await Probe.create({ title: 'Tax' });

    expect(second.slug).toBe('tax-2');
  });

  it('keeps counting past the first collision', async () => {
    await Probe.create({ title: 'Tax' });
    await Probe.create({ title: 'Tax' });
    const third = await Probe.create({ title: 'Tax' });

    expect(third.slug).toBe('tax-3');
  });

  it('does not collide with itself when an existing document is re-saved', async () => {
    const doc = await Probe.create({ title: 'Tax' });

    doc.order = 5;
    await doc.save();

    expect(doc.slug).toBe('tax');
  });

  it('rejects a document whose source field yields no usable characters', async () => {
    await expect(Probe.create({ title: '!!!' })).rejects.toThrow(/no usable characters/);
  });

  it('rejects a caller-supplied slug that is not kebab-case', async () => {
    await expect(Probe.create({ title: 'Tax', slug: 'Not A Slug' })).rejects.toThrow(
      /lowercase kebab-case/
    );
  });

  it('enforces uniqueness with an index, not just the pre-save check', async () => {
    await Probe.create({ title: 'Tax', slug: 'tax' });

    // Bypasses the plugin's lookup, the way two concurrent creates would.
    await expect(Probe.collection.insertOne({ title: 'Tax', slug: 'tax' })).rejects.toThrow(
      /duplicate key/i
    );
  });
});

describe('status and publishedAt', () => {
  it('defaults to draft with no publish date', async () => {
    const doc = await Probe.create({ title: 'Tax' });

    expect(doc.status).toBe('draft');
    expect(doc.publishedAt).toBeNull();
  });

  it('stamps publishedAt the first time an item is published', async () => {
    const doc = await Probe.create({ title: 'Tax', status: 'published' });

    expect(doc.publishedAt).toBeInstanceOf(Date);
  });

  it('keeps the original publish date when an item is unpublished and republished', async () => {
    const doc = await Probe.create({ title: 'Tax', status: 'published' });
    const first = doc.publishedAt;

    doc.status = 'draft';
    await doc.save();
    doc.status = 'published';
    await doc.save();

    expect(doc.publishedAt).toEqual(first);
  });

  it('rejects a status outside the enum', async () => {
    await expect(
      Probe.create({ title: 'Tax', status: 'archived' as unknown as 'draft' })
    ).rejects.toThrow();
  });
});

describe('revision', () => {
  it('starts at zero', async () => {
    const doc = await Probe.create({ title: 'Tax' });

    expect(doc.revision).toBe(0);
  });

  it('increments on every subsequent save, so stale writes can be detected', async () => {
    const doc = await Probe.create({ title: 'Tax' });

    doc.order = 1;
    await doc.save();
    expect(doc.revision).toBe(1);

    doc.order = 2;
    await doc.save();
    expect(doc.revision).toBe(2);
  });
});

describe('toJSON', () => {
  it('exposes id as a string and hides _id and __v', async () => {
    const doc = await Probe.create({ title: 'Tax' });
    const json: Record<string, unknown> = doc.toJSON();

    expect(typeof json.id).toBe('string');
    expect(json.id).toBe(doc._id.toString());
    expect('_id' in json).toBe(false);
    expect('__v' in json).toBe(false);
  });

  it('survives JSON.stringify, which is how responses are actually serialised', async () => {
    const doc = await Probe.create({ title: 'Tax' });
    const parsed: unknown = JSON.parse(JSON.stringify(doc));

    expect(parsed).toMatchObject({ slug: 'tax', status: 'draft' });
    expect(JSON.stringify(doc)).not.toContain('_id');
  });
});
