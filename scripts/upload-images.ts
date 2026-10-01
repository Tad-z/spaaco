#!/usr/bin/env tsx
/**
 * Uploads the design's images and attaches each one to the record it belongs to.
 *
 * The launch loader deliberately created no images: a placeholder that reaches
 * production is one somebody has to notice later. This is the other half —
 * run once the real files exist, from `images/manifest.json`, which says which
 * file fills which slot.
 *
 * Over HTTP against the deployed API rather than the database, for the same
 * reasons as `publish-all`: the upload has to go through Cloudinary and the
 * media pipeline, the writes are audited, and the page cache is invalidated.
 *
 * Safe to re-run. A file is uploaded once however many slots share it, and a
 * slot that already holds an image is left alone unless `--force` is given, so
 * a second run does not litter the library with duplicates.
 *
 *   ADMIN_PASSWORD=… API_URL=https://spaaco.onrender.com \
 *     npm run upload-images -- --confirm
 */
import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD;
const BASE = `${API_URL}/api/v1`;
const IMAGE_DIR = 'images';

const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');

/** Which field holds the image, for collections whose manifest omits it. */
const DEFAULT_FIELD: Record<string, string> = {
  people: 'photo',
  'practice-areas': 'image',
  insights: 'coverImage',
  awards: 'badge',
  'recognition-directories': 'logo',
};

const COLLECTIONS = [
  'people',
  'practice-areas',
  'insights',
  'awards',
  'recognition-directories',
] as const;

/**
 * A slot is empty when nothing is attached: null, absent, or — for a carousel
 * such as `hero.images` or `heroImages` (ADR-046) — an empty array.
 */
const isEmpty = (value: unknown): boolean =>
  value === null || value === undefined || (Array.isArray(value) && value.length === 0);

/**
 * What to write into a slot: a carousel takes a list of ids, every other
 * image field one id. Decided by what the API returned for the slot, so the
 * manifest names the field and never has to say which kind it is.
 */
const slotValue = (current: unknown, mediaId: string): string | string[] =>
  Array.isArray(current) ? [mediaId] : mediaId;

interface Slot {
  readonly file: string;
  readonly alt: string;
  readonly field?: string;
  /**
   * Further fields on the same record that show the same picture, such as a
   * practice area's `heroImages` reusing its card `image`. They share one
   * upload: the id already attached to `field` when there is one.
   */
  readonly alsoFields?: readonly string[];
}

/**
 * A page slot that copies another slot's picture: another page's,
 * `"<page key>:<path>"`, or a record's, `"<collection>/<slug>:<field>"`.
 * It replaces whatever the slot held, and is a no-op once they match.
 */
interface SameAsSlot {
  readonly sameAs: string;
}

/**
 * A page slot: one file, a carousel's files in slide order, or a copy of
 * another page's slot.
 */
type PageSlot = Slot | readonly Slot[] | SameAsSlot;

type Manifest = Record<string, Record<string, Slot | Record<string, PageSlot>>>;

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

let token = '';
const authHeader = (): Record<string, string> => ({ Authorization: `Bearer ${token}` });

async function login(): Promise<void> {
  if (PASSWORD === undefined || PASSWORD === '') {
    throw new Error('Set ADMIN_PASSWORD to the password for the admin account.');
  }

  const response = await fetch(`${BASE}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(
      `Login failed with ${String(response.status)}. There are five attempts per fifteen minutes.`
    );
  }

  const body = (await response.json()) as { data?: { accessToken?: string } };
  if (body.data?.accessToken === undefined) throw new Error('Login response had no access token.');

  token = body.data.accessToken;
}

/** Uploaded files, so a picture used in two places is stored once. */
const uploaded = new Map<string, string>();

async function upload(file: string, alt: string): Promise<string> {
  const cached = uploaded.get(file);
  if (cached !== undefined) return cached;

  const bytes = readFileSync(join(IMAGE_DIR, file));
  const type = MIME[extname(file).toLowerCase()];
  if (type === undefined) throw new Error(`${file}: not an image this API accepts`);

  const form = new FormData();
  // The original name is only a label; the driver stores under a random key.
  form.append('file', new Blob([new Uint8Array(bytes)], { type }), basename(file));
  form.append('alt', alt);

  const response = await fetch(`${BASE}/admin/media`, {
    method: 'POST',
    headers: authHeader(),
    body: form,
  });

  if (!response.ok) {
    throw new Error(
      `Uploading ${file} failed with ${String(response.status)}: ${await response.text()}`
    );
  }

  const body = (await response.json()) as { data?: { id?: string } };
  if (body.data?.id === undefined) throw new Error(`Uploading ${file} returned no id`);

  uploaded.set(file, body.data.id);
  console.log(`  uploaded ${file} -> ${body.data.id}`);

  return body.data.id;
}

interface Item {
  readonly id: string;
  readonly slug: string;
  readonly revision: number;
  readonly [field: string]: unknown;
}

async function itemsOf(collection: string): Promise<Map<string, Item>> {
  const response = await fetch(`${BASE}/admin/content/${collection}?pageSize=50`, {
    headers: authHeader(),
  });

  if (!response.ok) {
    throw new Error(`Listing ${collection} failed with ${String(response.status)}`);
  }

  const body = (await response.json()) as { data: Item[] };

  return new Map(body.data.map((item) => [item.slug, item]));
}

async function patch(path: string, revision: number, payload: unknown): Promise<void> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: {
      ...authHeader(),
      'Content-Type': 'application/json',
      // The revision that was read. Without it the API answers 428 rather
      // than letting two writers overwrite each other.
      'If-Match': String(revision),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `PATCH ${path} failed with ${String(response.status)}: ${await response.text()}`
    );
  }
}

/** Sets `a.b.c` on a copy of the object, leaving the original alone. */
function setPath(target: Record<string, unknown>, path: string, value: string | string[]): void {
  const parts = path.split('.');
  const last = parts.pop();
  if (last === undefined) return;

  let cursor = target;
  for (const part of parts) {
    const next = cursor[part];
    cursor[part] = typeof next === 'object' && next !== null ? { ...next } : {};
    cursor = cursor[part] as Record<string, unknown>;
  }

  cursor[last] = value;
}

const at = (source: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => {
    if (typeof value !== 'object' || value === null) return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);

async function doCollections(manifest: Manifest): Promise<number> {
  let changed = 0;

  for (const collection of COLLECTIONS) {
    const slots = manifest[collection];
    if (slots === undefined) continue;

    const items = await itemsOf(collection);
    console.log(`\n${collection}`);

    for (const [slug, raw] of Object.entries(slots)) {
      const slot = raw as Slot;
      const field = slot.field ?? DEFAULT_FIELD[collection] ?? 'image';
      const item = items.get(slug);

      if (item === undefined) {
        console.error(`  ! ${slug}: no such record`);
        continue;
      }

      const fields = [field, ...(slot.alsoFields ?? [])];
      const toFill = fields.filter((name) => FORCE || isEmpty(item[name]));

      if (toFill.length === 0) {
        console.log(`  = ${slug} already has an image`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`  ~ ${slug}.${toFill.join(', ')} <- ${slot.file}`);
        continue;
      }

      // Reuse the picture already attached to the main field, so filling a
      // second field with it adds nothing to the library.
      const attached = item[field];
      const mediaId =
        !FORCE && typeof attached === 'string' ? attached : await upload(slot.file, slot.alt);

      await patch(
        `/admin/content/${collection}/${item.id}`,
        item.revision,
        Object.fromEntries(toFill.map((name) => [name, slotValue(item[name], mediaId)]))
      );
      console.log(`  + ${slug}.${toFill.join(', ')}`);
      changed += toFill.length;
    }
  }

  return changed;
}

type Page = Record<string, unknown> & { revision: number };

async function readPage(key: string): Promise<Page | undefined> {
  const response = await fetch(`${BASE}/admin/pages/${key}`, { headers: authHeader() });
  if (!response.ok) {
    console.error(`  ! ${key}: reading the page failed with ${String(response.status)}`);
    return undefined;
  }

  return ((await response.json()) as { data: Page }).data;
}

const isSameAs = (slot: PageSlot): slot is SameAsSlot => 'sameAs' in slot;

const sameIds = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * What a page slot should hold, or `undefined` when it already holds it.
 *
 * A carousel keeps the slides it has and uploads only the missing ones, so
 * adding slide 2 to a hero that already shows slide 1 re-uploads nothing.
 */
async function pageSlotValue(
  current: unknown,
  slot: PageSlot,
  written: ReadonlyMap<string, unknown>
): Promise<string | string[] | undefined> {
  if (isSameAs(slot)) {
    // Prefer what this run just wrote: the source page may have changed since.
    let source = written.get(slot.sameAs);
    if (source === undefined) {
      const [owner = '', path = ''] = slot.sameAs.split(':');
      const [collection = '', slug] = owner.split('/');

      if (slug === undefined) {
        const page = await readPage(owner);
        source = page === undefined ? undefined : at(page, path);
      } else {
        source = (await itemsOf(collection)).get(slug)?.[path];
      }
    }

    if (isEmpty(source)) throw new Error(`${slot.sameAs} is empty, so there is nothing to copy`);

    // A carousel's first picture fills a single image slot, and a single
    // picture fills a carousel as its one slide.
    const ids = Array.isArray(source) ? (source as string[]) : [source as string];
    const value = Array.isArray(current) ? ids : (ids[0] ?? '');
    if (!FORCE && sameIds(current, value)) return undefined;

    return value;
  }

  if (Array.isArray(slot)) {
    const slides = slot as readonly Slot[];
    const have = Array.isArray(current) ? (current as string[]) : [];
    if (!FORCE && have.length >= slides.length) return undefined;

    const ids: string[] = [];
    for (const [index, slide] of slides.entries()) {
      const existing = have[index];
      ids.push(!FORCE && existing !== undefined ? existing : await upload(slide.file, slide.alt));
    }

    return ids;
  }

  if (!isEmpty(current) && !FORCE) return undefined;

  const single = slot as Slot;

  return slotValue(current, await upload(single.file, single.alt));
}

const describe = (slot: PageSlot): string => {
  if (isSameAs(slot)) return `same as ${slot.sameAs}`;
  if (Array.isArray(slot)) return (slot as readonly Slot[]).map((slide) => slide.file).join(', ');
  return (slot as Slot).file;
};

async function doPages(manifest: Manifest): Promise<number> {
  const pages = manifest.pages;
  if (pages === undefined) return 0;

  let changed = 0;
  console.log('\npages');

  /** Values this run wrote, keyed `"<page key>:<path>"`, for `sameAs` slots. */
  const written = new Map<string, unknown>();

  for (const [key, rawSlots] of Object.entries(pages)) {
    const slots = rawSlots as Record<string, PageSlot>;

    const page = await readPage(key);
    if (page === undefined) continue;

    // One PATCH per page, so its revision is read once and every slot on it
    // moves together.
    const payload: Record<string, unknown> = {};
    const applied: string[] = [];

    for (const [path, slot] of Object.entries(slots)) {
      if (DRY_RUN) {
        console.log(`  ~ ${key}.${path} <- ${describe(slot)}`);
        continue;
      }

      const value = await pageSlotValue(at(page, path), slot, written);
      if (value === undefined) {
        console.log(`  = ${key}.${path} already set`);
        continue;
      }

      const section = path.split('.')[0] ?? '';

      // Start from the section as stored: a PATCH replaces the whole section
      // object, so anything not carried over would be dropped. A top-level
      // field (a path with no dot) is written as it is.
      if (path.includes('.') && payload[section] === undefined) {
        payload[section] = { ...(page[section] as object) };
      }
      setPath(payload, path, value);
      written.set(`${key}:${path}`, value);
      applied.push(path);
    }

    if (applied.length === 0) continue;

    await patch(`/admin/pages/${key}`, page.revision, payload);
    console.log(`  + ${key}: ${applied.join(', ')}`);
    changed += applied.length;
  }

  return changed;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm') && !DRY_RUN) {
    console.error(
      `This uploads images/ to ${API_URL} and attaches them to records.\n` +
        'Re-run with --confirm, or --dry-run to see what it would do.'
    );
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(readFileSync(join(IMAGE_DIR, 'manifest.json'), 'utf8')) as Manifest;

  await login();

  const changed = (await doCollections(manifest)) + (await doPages(manifest));

  console.log(
    DRY_RUN
      ? '\nDry run: nothing was uploaded.'
      : `\nAttached ${String(changed)} images, from ${String(uploaded.size)} uploads.`
  );
}

await main();
