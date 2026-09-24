import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { createTestUser } from '../../support/auth.js';
import { runSeed } from '../../../scripts/seed.js';
import { AuditLog, Media, PracticeArea } from '../../../src/models/index.js';
import { config } from '../../../src/config/env.js';
import * as cache from '../../../src/core/cache.js';

/**
 * The media library.
 *
 * Two things here are worth more than the CRUD: the type check, which is the
 * only thing standing between the firm and a script uploaded as an image
 * (ADR-016), and replace-in-place, where the id must survive so every page
 * using the picture updates at once — while the old file, the caches and the
 * audit trail all keep up.
 */

setupTestDb();

const app = buildTestApp();

let token = '';

const auth = (): string => `Bearer ${token}`;
const base = '/api/v1/admin/media';

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

beforeEach(async () => {
  await runSeed();
  token = (await createTestUser({ roles: ['admin'] })).token;
});

/** A real image, so the magic-byte check is exercised rather than mocked. */
const png = async (width = 1200, height = 900): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: '#123456' } })
    .png()
    .toBuffer();

const upload = async (
  overrides: {
    alt?: string | null;
    title?: string;
    file?: Buffer;
    name?: string;
    type?: string;
  } = {}
): Promise<request.Response> => {
  const req = request(app).post(base).set('Authorization', auth());

  if (overrides.alt !== null) req.field('alt', overrides.alt ?? 'The Lagos office reception');
  if (overrides.title !== undefined) req.field('title', overrides.title);

  return req.attach('file', overrides.file ?? (await png()), {
    filename: overrides.name ?? 'reception.png',
    contentType: overrides.type ?? 'image/png',
  });
};

describe('uploading', () => {
  it('stores the image and returns its record', async () => {
    const res = await upload({ title: 'Reception' });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expectToMatchContract(res, 'post', '/api/v1/admin/media');

    expect(res.body.data).toMatchObject({
      alt: 'The Lagos office reception',
      title: 'Reception',
      mimeType: 'image/png',
      width: 1200,
      height: 900,
      usedBy: [],
    });
    expect(res.body.data.focalPoint).toEqual({ x: 0.5, y: 0.5 });
  });

  it('generates the three responsive widths', async () => {
    const res = await upload();

    const { sizes } = res.body.data;
    expect(Object.keys(sizes).sort()).toEqual(['lg', 'md', 'sm']);
    expect(new Set(Object.values(sizes)).size, 'each width needs its own URL').toBe(3);
  });

  it('refuses an SVG, which can carry a script', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');

    const res = await upload({ file: svg, name: 'logo.svg', type: 'image/svg+xml' });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('refuses an executable renamed to .png, whatever the request claims', async () => {
    // "MZ", the DOS header every Windows executable starts with.
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(1024)]);

    const res = await upload({ file: exe, name: 'photo.png', type: 'image/png' });

    expect(res.status).toBe(415);
  });

  it('requires alt text, because the site must stay accessible', async () => {
    const res = await upload({ alt: null });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('alt');
  });

  it('refuses a file over the size limit', async () => {
    const tooBig = Buffer.alloc(config.NODE_ENV === 'test' ? 11 * 1024 * 1024 : 0, 1);
    tooBig.write('\x89PNG\r\n\x1a\n', 0, 'binary');

    const res = await upload({ file: tooBig });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('the library listing', () => {
  beforeEach(async () => {
    // Distinctive wording: the seed already ships a library, and a term like
    // "boardroom" matches one of its images too.
    await upload({ title: 'Reception', alt: 'Lagos reception desk' });
    await upload({ title: 'Ikoyi Annexe', alt: 'The Ikoyi annexe frontage' });
  });

  it('lists the newest first', async () => {
    const res = await request(app).get(base).set('Authorization', auth());

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/media');

    expect(res.body.data[0].title).toBe('Ikoyi Annexe');
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it('searches title, alt and the original filename', async () => {
    const res = await request(app).get(`${base}?q=ikoyi`).set('Authorization', auth());

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Ikoyi Annexe');
  });

  it('can show only the images nothing references', async () => {
    const all = await request(app).get(base).set('Authorization', auth());
    const first = all.body.data[0].id;

    await PracticeArea.updateOne({ slug: 'tax' }, { image: first });

    const res = await request(app).get(`${base}?unused=true`).set('Authorization', auth());

    expect(res.body.data.map((item: { id: string }) => item.id)).not.toContain(first);
  });

  it('rejects an unknown sort rather than ignoring it', async () => {
    const res = await request(app).get(`${base}?sort=sideways`).set('Authorization', auth());

    expect(res.status).toBe(400);
  });
});

describe('one image', () => {
  it('reports where it is used', async () => {
    const created = await upload();
    const id = created.body.data.id;

    await PracticeArea.updateOne({ slug: 'tax' }, { image: id });

    const res = await request(app).get(`${base}/${id}`).set('Authorization', auth());

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/media/{id}');

    expect(res.body.data.usedBy).toEqual([
      { collection: 'practiceAreas', id: expect.any(String), label: 'Tax', field: 'image' },
    ]);
  });

  it('returns 404 for an id that is not there', async () => {
    const res = await request(app)
      .get(`${base}/665f1a2b3c4d5e6f70819293`)
      .set('Authorization', auth());

    expect(res.status).toBe(404);
  });

  it('edits the metadata without touching the file', async () => {
    const created = await upload();
    const { id, url } = created.body.data;

    const res = await request(app)
      .patch(`${base}/${id}`)
      .set('Authorization', auth())
      .send({ alt: 'A revised description', focalPoint: { x: 0.25, y: 0.75 } });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'patch', '/api/v1/admin/media/{id}');

    expect(res.body.data.alt).toBe('A revised description');
    expect(res.body.data.focalPoint).toEqual({ x: 0.25, y: 0.75 });
    expect(res.body.data.url).toBe(url);
  });

  it('rejects a focal point outside the image', async () => {
    const created = await upload();

    const res = await request(app)
      .patch(`${base}/${created.body.data.id}`)
      .set('Authorization', auth())
      .send({ focalPoint: { x: 1.5, y: 0.5 } });

    expect(res.status).toBe(400);
  });
});

describe('replacing the file in place', () => {
  it('keeps the id, changes the URL and removes the old file', async () => {
    const created = await upload();
    const { id, url } = created.body.data;

    const before = await Media.findById(id).lean<{ storageKey: string } | null>();
    const oldKey = before?.storageKey ?? '';

    const res = await request(app)
      .put(`${base}/${id}/file`)
      .set('Authorization', auth())
      .attach('file', await png(800, 600), {
        filename: 'reception-v2.png',
        contentType: 'image/png',
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'put', '/api/v1/admin/media/{id}/file');

    expect(res.body.data.id).toBe(id);
    expect(res.body.data.url).not.toBe(url);
    expect(res.body.data.width).toBe(800);
    // The alt text belongs to the picture's meaning, not its bytes.
    expect(res.body.data.alt).toBe(created.body.data.alt);

    const files = existsSync(config.UPLOAD_DIR) ? await readdir(config.UPLOAD_DIR) : [];
    expect(files.some((name) => name.startsWith(oldKey.split('/').pop() ?? 'x'))).toBe(false);
  });

  it('clears the caches of everything using the image', async () => {
    const created = await upload();
    const id = created.body.data.id;

    await PracticeArea.updateOne({ slug: 'tax' }, { image: id });
    cache.clear();

    // Composed pages are the cached surface, and the practice areas page is
    // where this image would now be rendered.
    await request(app).get('/api/v1/pages/practice-areas');
    expect(cache.size()).toBeGreaterThan(0);

    await request(app)
      .put(`${base}/${id}/file`)
      .set('Authorization', auth())
      .attach('file', await png(800, 600), { filename: 'v2.png', contentType: 'image/png' });

    expect(cache.size()).toBe(0);
  });

  it('records an audit entry', async () => {
    const created = await upload();

    await request(app)
      .put(`${base}/${created.body.data.id}/file`)
      .set('Authorization', auth())
      .attach('file', await png(800, 600), { filename: 'v2.png', contentType: 'image/png' });

    const entry = await AuditLog.findOne({ entityId: created.body.data.id }).lean();
    expect(entry).toBeTruthy();
  });

  it('refuses a replacement that is not an image', async () => {
    const created = await upload();

    const res = await request(app)
      .put(`${base}/${created.body.data.id}/file`)
      .set('Authorization', auth())
      .attach('file', Buffer.from('MZ'), { filename: 'v2.png', contentType: 'image/png' });

    expect(res.status).toBe(415);
  });
});

describe('deleting', () => {
  it('refuses while the image is still in use, and says where', async () => {
    const created = await upload();
    const id = created.body.data.id;

    await PracticeArea.updateOne({ slug: 'tax' }, { image: id });

    const res = await request(app).delete(`${base}/${id}`).set('Authorization', auth());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details[0]).toMatchObject({ path: 'usedBy' });
    expect(JSON.stringify(res.body.error.details)).toContain('Tax');
  });

  it('deletes an unused image and its file', async () => {
    const created = await upload();
    const id = created.body.data.id;

    const res = await request(app).delete(`${base}/${id}`).set('Authorization', auth());

    expect(res.status).toBe(204);
    expect(await Media.findById(id).lean()).toBeNull();
  });
});
