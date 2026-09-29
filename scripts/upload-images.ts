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
}

type Manifest = Record<string, Record<string, Slot | Record<string, Slot>>>;

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

      if (!isEmpty(item[field]) && !FORCE) {
        console.log(`  = ${slug} already has an image`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`  ~ ${slug}.${field} <- ${slot.file}`);
        continue;
      }

      const mediaId = await upload(slot.file, slot.alt);
      await patch(`/admin/content/${collection}/${item.id}`, item.revision, {
        [field]: slotValue(item[field], mediaId),
      });
      console.log(`  + ${slug}.${field}`);
      changed += 1;
    }
  }

  return changed;
}

async function doPages(manifest: Manifest): Promise<number> {
  const pages = manifest.pages;
  if (pages === undefined) return 0;

  let changed = 0;
  console.log('\npages');

  for (const [key, rawSlots] of Object.entries(pages)) {
    const slots = rawSlots as Record<string, Slot>;

    const response = await fetch(`${BASE}/admin/pages/${key}`, { headers: authHeader() });
    if (!response.ok) {
      console.error(`  ! ${key}: reading the page failed with ${String(response.status)}`);
      continue;
    }

    const body = (await response.json()) as {
      data: Record<string, unknown> & { revision: number };
    };
    const page = body.data;

    // One PATCH per page, so its revision is read once and every slot on it
    // moves together.
    const payload: Record<string, unknown> = {};
    const applied: string[] = [];

    for (const [path, slot] of Object.entries(slots)) {
      if (!isEmpty(at(page, path)) && !FORCE) {
        console.log(`  = ${key}.${path} already set`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`  ~ ${key}.${path} <- ${slot.file}`);
        continue;
      }

      const mediaId = await upload(slot.file, slot.alt);
      const section = path.split('.')[0] ?? '';

      // Start from the section as stored: a PATCH replaces the whole section
      // object, so anything not carried over would be dropped.
      if (payload[section] === undefined) payload[section] = { ...(page[section] as object) };
      setPath(payload, path, slotValue(at(page, path), mediaId));
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
