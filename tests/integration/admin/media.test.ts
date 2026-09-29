import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { createTestUser } from '../../support/auth.js';
import { runSeed } from '../../../scripts/seed.js';
import { AuditLog, Media, PracticeArea } from '../../../src/models/index.js';
import { setRevalidator } from '../../../src/services/cache.service.js';
import { setVirusScanner } from '../../../src/services/virus-scan.service.js';
import { config } from '../../../src/config/env.js';
import { UPLOAD_LIMITS } from '../../../src/config/constants.js';
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

/** Captures the tags sent to the frontend, which the LRU cannot show. */
const revalidated = vi.fn<(tags: readonly string[]) => Promise<void>>();

beforeEach(async () => {
  await runSeed();
  token = (await createTestUser({ roles: ['admin'] })).token;

  revalidated.mockReset();
  revalidated.mockResolvedValue();
  setRevalidator({ revalidate: revalidated });
});

afterEach(() => {
  setRevalidator(undefined);
});

/** Every file the local driver has written, path included. */
const storedFiles = async (): Promise<string[]> => {
  if (!existsSync(config.UPLOAD_DIR)) return [];

  const entries = await readdir(config.UPLOAD_DIR, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath}/${entry.name}`.split('\\').join('/'));
};

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
    const tooBig = Buffer.alloc(UPLOAD_LIMITS.imageMaxBytes + 1024, 1);
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
      .set('If-Match', String(created.body.data.revision))
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
      .set('If-Match', String(created.body.data.revision))
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
      .set('If-Match', String(created.body.data.revision))
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

    // Recursive: the driver writes to <UPLOAD_DIR>/YYYY/MM/, so a flat listing
    // would only ever see the year folder and the assertion could not fail.
    const after = await Media.findById(id).lean<{ storageKey: string } | null>();
    const files = await storedFiles();

    expect(files.filter((name) => name.includes(oldKey))).toEqual([]);
    expect(
      files.some((name) => name.includes(after?.storageKey ?? 'missing')),
      'the new file was not written'
    ).toBe(true);
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
      .set('If-Match', String(created.body.data.revision))
      .attach('file', await png(800, 600), { filename: 'v2.png', contentType: 'image/png' });

    expect(cache.size()).toBe(0);

    // The exact tag matters, and the in-process cache cannot show it: the
    // frontend revalidates `practice-area:tax`, so sending `practice-area:Tax`
    // — the display label — would leave its detail page stale for ever.
    const tags = revalidated.mock.calls.flatMap(([sent]) => [...sent]);
    expect(tags).toContain('practice-area:tax');
    expect(tags).not.toContain('practice-area:Tax');
  });

  it('records an audit entry', async () => {
    const created = await upload();

    await request(app)
      .put(`${base}/${created.body.data.id}/file`)
      .set('Authorization', auth())
      .set('If-Match', String(created.body.data.revision))
      .attach('file', await png(800, 600), { filename: 'v2.png', contentType: 'image/png' });

    const entry = await AuditLog.findOne({ entityId: created.body.data.id }).lean();
    expect(entry).toBeTruthy();
  });

  it('refuses a replacement that is not an image', async () => {
    const created = await upload();

    const res = await request(app)
      .put(`${base}/${created.body.data.id}/file`)
      .set('Authorization', auth())
      .set('If-Match', String(created.body.data.revision))
      .attach('file', Buffer.from('MZ'), { filename: 'v2.png', contentType: 'image/png' });

    expect(res.status).toBe(415);
  });
});

describe('optimistic locking', () => {
  it('refuses a write with no If-Match, rather than taking last write wins', async () => {
    const created = await upload();

    const res = await request(app)
      .patch(`${base}/${created.body.data.id}`)
      .set('Authorization', auth())
      .send({ alt: 'Whose change wins?' });

    expect(res.status).toBe(428);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('If-Match');
  });

  it('returns 409 when someone else saved first', async () => {
    const created = await upload();
    const id = created.body.data.id as string;
    const revision = created.body.data.revision as number;

    const first = await request(app)
      .patch(`${base}/${id}`)
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ alt: 'Theirs' });

    expect(first.status).toBe(200);
    expect(first.body.data.revision).toBe(revision + 1);

    const second = await request(app)
      .patch(`${base}/${id}`)
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ alt: 'Mine' });

    expect(second.status).toBe(409);
    expect(JSON.stringify(second.body.error.details)).toContain(String(revision + 1));
  });

  it('leaves no orphaned file when a replacement loses the race', async () => {
    const created = await upload();
    const { id, revision } = created.body.data;

    await request(app)
      .put(`${base}/${id}/file`)
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .attach('file', await png(800, 600), { filename: 'winner.png', contentType: 'image/png' });

    const before = await storedFiles();

    const loser = await request(app)
      .put(`${base}/${id}/file`)
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .attach('file', await png(640, 480), { filename: 'loser.png', contentType: 'image/png' });

    expect(loser.status).toBe(409);

    // The loser's bytes were already in storage when the revision check failed.
    // Nothing references them, so nothing may be left behind.
    expect(await storedFiles()).toEqual(before);
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
    expectToMatchContract(res, 'delete', '/api/v1/admin/media/{id}');
    expect(await Media.findById(id).lean()).toBeNull();
  });
});

describe('PDF documents (ADR-053)', () => {
  /** A minimal but real PDF, so the `%PDF` check is exercised rather than mocked. */
  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'
  );

  const uploadDocument = (
    overrides: { file?: Buffer; title?: string | null; alt?: string } = {}
  ): request.Test => {
    const req = request(app).post(base).set('Authorization', auth()).field('kind', 'document');

    if (overrides.title !== null) {
      req.field('title', overrides.title ?? 'SPA Ajibade & Co. firm profile');
    }
    if (overrides.alt !== undefined) req.field('alt', overrides.alt);

    return req.attach('file', overrides.file ?? pdf, {
      filename: 'firm-profile.pdf',
      contentType: 'application/pdf',
    });
  };

  it('stores a PDF with a title and no image fields', async () => {
    const res = await uploadDocument();

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expectToMatchContract(res, 'post', '/api/v1/admin/media');
    expect(res.body.data).toMatchObject({
      kind: 'document',
      title: 'SPA Ajibade & Co. firm profile',
      mimeType: 'application/pdf',
      sizes: null,
      alt: null,
      width: null,
      height: null,
      focalPoint: null,
    });
    expect(res.body.data.url).toMatch(/\.pdf$/);
  });

  it('refuses a fake PDF, whatever its name and declared type say', async () => {
    const fake = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(1024)]);

    const res = await uploadDocument({ file: fake });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expectToMatchContract(res, 'post', '/api/v1/admin/media');
  });

  it('refuses an infected PDF with 422 and stores nothing, since it would be public', async () => {
    setVirusScanner({ name: 'test', scan: () => Promise.resolve('infected') });
    const before = await Media.countDocuments();
    const filesBefore = (await storedFiles()).length;

    const res = await uploadDocument();

    setVirusScanner(undefined);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FILE_REJECTED');
    expectToMatchContract(res, 'post', '/api/v1/admin/media');
    expect(await Media.countDocuments()).toBe(before);
    expect(await storedFiles()).toHaveLength(filesBefore);
  });

  it('refuses an image uploaded as a document, and a PDF uploaded as an image', async () => {
    const pictureAsDocument = await uploadDocument({ file: await png() });
    const pdfAsImage = await upload({ file: pdf, name: 'profile.pdf', type: 'application/pdf' });

    expect(pictureAsDocument.status).toBe(415);
    expect(pdfAsImage.status).toBe(415);
  });

  it('requires a title, which is its link text, and takes no alt', async () => {
    const untitled = await uploadDocument({ title: null });
    const withAlt = await uploadDocument({ alt: 'A PDF' });

    expect(untitled.status).toBe(400);
    expect(untitled.body.error.details.map((d: { path: string }) => d.path)).toContain('title');
    expect(withAlt.status).toBe(400);
    expect(withAlt.body.error.details.map((d: { path: string }) => d.path)).toContain('alt');
  });

  it('accepts a PDF between the image and document limits, and refuses one past 20 MB', async () => {
    const between = Buffer.concat([pdf, Buffer.alloc(UPLOAD_LIMITS.imageMaxBytes + 1024)]);
    const over = Buffer.concat([pdf, Buffer.alloc(UPLOAD_LIMITS.documentMaxBytes + 1024)]);

    expect((await uploadDocument({ file: between })).status).toBe(201);
    const refused = await uploadDocument({ file: over });
    expect(refused.status).toBe(413);
    expect(refused.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('filters the library by kind', async () => {
    await uploadDocument();

    const documents = await request(app).get(`${base}?kind=document`).set('Authorization', auth());
    const images = await request(app).get(`${base}?kind=image`).set('Authorization', auth());

    expectToMatchContract(documents, 'get', '/api/v1/admin/media');
    // The seed's placeholder firm profile, plus the one just uploaded.
    expect(documents.body.data.map((m: { kind: string }) => m.kind)).toEqual([
      'document',
      'document',
    ]);
    expect(images.body.data.every((m: { kind: string }) => m.kind === 'image')).toBe(true);
  });

  it('works as the About profile download, and cannot then be deleted', async () => {
    const id: string = (await uploadDocument()).body.data.id;

    const page = await request(app).get('/api/v1/admin/pages/about').set('Authorization', auth());
    const story = page.body.data.story as Record<string, unknown>;
    const patched = await request(app)
      .patch('/api/v1/admin/pages/about')
      .set('Authorization', auth())
      .set('If-Match', String(page.body.data.revision))
      .send({
        story: {
          ...story,
          profileDownload: { ...(story.profileDownload as object), document: id },
        },
      });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);

    const about = await request(app).get('/api/v1/pages/about');
    expect(about.body.data.story.profileDownload.document).toMatchObject({
      title: 'SPA Ajibade & Co. firm profile',
      mimeType: 'application/pdf',
    });

    const deleted = await request(app).delete(`${base}/${id}`).set('Authorization', auth());
    expect(deleted.status).toBe(409);
    expect(deleted.body.error.details[0].message).toContain('story.profileDownload.document');
  });

  it('works as an insight document, and cannot then be deleted', async () => {
    const id: string = (await uploadDocument()).body.data.id;

    const created = await request(app)
      .post('/api/v1/admin/content/insights')
      .set('Authorization', auth())
      .send({
        title: 'A brief with a PDF',
        format: 'article',
        categories: ['articles'],
        document: id,
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const usage = await request(app).get(`${base}/${id}`).set('Authorization', auth());
    expect(usage.body.data.usedBy).toEqual([
      expect.objectContaining({ collection: 'insights', field: 'document' }),
    ]);

    const deleted = await request(app).delete(`${base}/${id}`).set('Authorization', auth());
    expect(deleted.status).toBe(409);
  });

  it('refuses a PDF in an image field, and an image in a document field', async () => {
    const documentId: string = (await uploadDocument()).body.data.id;
    const imageId: string = (await upload()).body.data.id;

    const pdfAsHero = await request(app)
      .post('/api/v1/admin/content/recognition-directories')
      .set('Authorization', auth())
      .send({ name: 'Wrong Kind', heroImages: [documentId] });
    const imageAsDocument = await request(app)
      .post('/api/v1/admin/content/insights')
      .set('Authorization', auth())
      .send({
        title: 'Wrong kind',
        format: 'article',
        categories: ['articles'],
        document: imageId,
      });

    expect(pdfAsHero.status).toBe(400);
    expect(pdfAsHero.body.error.details[0].path).toBe('heroImages');
    expect(imageAsDocument.status).toBe(400);
    expect(imageAsDocument.body.error.details[0].path).toBe('document');
  });

  it('sees an image used in a carousel, and refuses to delete it', async () => {
    const id: string = (await upload()).body.data.id;
    const page = await request(app)
      .get('/api/v1/admin/pages/practice-areas')
      .set('Authorization', auth());
    const csrBanner = page.body.data.csrBanner as { images: string[] };

    await request(app)
      .patch('/api/v1/admin/pages/practice-areas')
      .set('Authorization', auth())
      .set('If-Match', String(page.body.data.revision))
      .send({ csrBanner: { ...csrBanner, images: [...csrBanner.images, id] } });

    const usage = await request(app).get(`${base}/${id}`).set('Authorization', auth());
    const deleted = await request(app).delete(`${base}/${id}`).set('Authorization', auth());

    expect(usage.body.data.usedBy).toEqual([
      expect.objectContaining({
        collection: 'pages',
        label: 'practice-areas',
        field: 'csrBanner.images',
      }),
    ]);
    expect(deleted.status).toBe(409);
  });

  it('replaces a document with a PDF only, keeping its id', async () => {
    const created = (await uploadDocument()).body.data as {
      id: string;
      revision: number;
      url: string;
    };

    const withImage = await request(app)
      .put(`${base}/${created.id}/file`)
      .set('Authorization', auth())
      .set('If-Match', String(created.revision))
      .attach('file', await png(), { filename: 'x.png', contentType: 'image/png' });
    const withPdf = await request(app)
      .put(`${base}/${created.id}/file`)
      .set('Authorization', auth())
      .set('If-Match', String(created.revision))
      .attach('file', pdf, { filename: 'profile-2026.pdf', contentType: 'application/pdf' });

    expect(withImage.status).toBe(415);
    expect(withPdf.status, JSON.stringify(withPdf.body)).toBe(200);
    expectToMatchContract(withPdf, 'put', '/api/v1/admin/media/{id}/file');
    expect(withPdf.body.data.id).toBe(created.id);
    expect(withPdf.body.data.url).not.toBe(created.url);
  });

  it('refuses an image-only edit on a document', async () => {
    const created = (await uploadDocument()).body.data as { id: string; revision: number };

    const res = await request(app)
      .patch(`${base}/${created.id}`)
      .set('Authorization', auth())
      .set('If-Match', String(created.revision))
      .send({ focalPoint: { x: 0.2, y: 0.2 } });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('focalPoint');
  });
});
