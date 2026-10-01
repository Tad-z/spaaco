#!/usr/bin/env tsx
/**
 * Rewrites the stored size URLs of every image whose widths Cloudinary refuses.
 *
 * Until 2026-10-01 the Cloudinary driver put the focal point into each width
 * as `g_xy_center` gravity. Cloudinary only accepts that gravity with a
 * cropping mode, and the widths only scale (`c_limit`), so every `sizes.sm`,
 * `md` and `lg` it stored answers 400. Only `url` worked (ADR-030).
 *
 * Re-saving an image's focal point makes the API rebuild its widths, so this
 * sends each affected image its own focal point back, unchanged. Over HTTP,
 * like `upload-images`: the write is audited and every page using the image
 * is invalidated. Run it after the fixed driver is deployed. Safe to re-run:
 * an image whose widths are already clean is left alone.
 *
 *   ADMIN_PASSWORD=… API_URL=https://spaaco.onrender.com \
 *     npm run rebuild-image-sizes -- --confirm
 */

const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD;
const BASE = `${API_URL}/api/v1`;

const DRY_RUN = process.argv.includes('--dry-run');

/** What the old driver wrote into every width. */
const BROKEN = /,g_xy_center,x_[\d.]+,y_[\d.]+\//;

interface MediaItem {
  readonly id: string;
  readonly revision: number;
  readonly alt: string | null;
  readonly sizes: { readonly sm: string; readonly md: string; readonly lg: string } | null;
  readonly focalPoint: { readonly x: number; readonly y: number } | null;
}

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

async function allImages(): Promise<MediaItem[]> {
  const images: MediaItem[] = [];

  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `${BASE}/admin/media?kind=image&pageSize=50&page=${String(page)}`,
      {
        headers: authHeader(),
      }
    );
    if (!response.ok) {
      throw new Error(`Listing media failed with ${String(response.status)}`);
    }

    const body = (await response.json()) as {
      data: MediaItem[];
      meta: { totalPages: number };
    };
    images.push(...body.data);

    if (page >= body.meta.totalPages) return images;
  }
}

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm') && !DRY_RUN) {
    console.error(
      `This rewrites the size URLs of images on ${API_URL}.\n` +
        'Re-run with --confirm, or --dry-run to see what it would do.'
    );
    process.exitCode = 1;
    return;
  }

  await login();

  const images = await allImages();
  const broken = images.filter((image) => image.sizes !== null && BROKEN.test(image.sizes.md));
  console.log(`${String(images.length)} images, ${String(broken.length)} with refused widths`);

  let fixed = 0;
  for (const image of broken) {
    const label = `${image.id} (${image.alt ?? 'no alt'})`;

    if (DRY_RUN) {
      console.log(`  ~ ${label}`);
      continue;
    }

    const response = await fetch(`${BASE}/admin/media/${image.id}`, {
      method: 'PATCH',
      headers: {
        ...authHeader(),
        'Content-Type': 'application/json',
        'If-Match': String(image.revision),
      },
      // Its own focal point, unchanged: the point is the rebuild it triggers.
      body: JSON.stringify({ focalPoint: image.focalPoint ?? { x: 0.5, y: 0.5 } }),
    });

    if (!response.ok) {
      console.error(`  ! ${label}: ${String(response.status)} ${await response.text()}`);
      continue;
    }

    const body = (await response.json()) as { data: MediaItem };
    if (body.data.sizes !== null && BROKEN.test(body.data.sizes.md)) {
      throw new Error(
        `${label} still has refused widths. Is the fixed driver deployed to ${API_URL}?`
      );
    }

    console.log(`  + ${label}`);
    fixed += 1;
  }

  console.log(DRY_RUN ? '\nDry run: nothing was changed.' : `\nRebuilt ${String(fixed)} images.`);
}

await main();
