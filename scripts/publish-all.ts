#!/usr/bin/env tsx
/**
 * Publishes every draft in the nine content collections.
 *
 * The launch loader deliberately leaves its content as drafts so the firm can
 * review each item before the public site shows it. That is right for launch
 * and wrong for a frontend team, who need the listings to return real payloads
 * before there is anyone at the firm to click Publish. This bridges the gap.
 *
 * It goes over HTTP against the deployed API rather than writing to the
 * database directly, for two reasons: publishing through the real endpoint
 * records the audit entry and invalidates the cached pages, and a direct write
 * would silently skip both, leaving `/site` serving an empty listing from a
 * five-minute cache while the database says otherwise.
 *
 * It is reversible — `POST .../unpublish` puts an item back — which is why
 * this has no emptiness guard of the kind the loader needs.
 *
 *   ADMIN_PASSWORD=… API_URL=https://spaaco.onrender.com \
 *     npm run publish-all -- --confirm
 */
import { ADMIN_COLLECTIONS } from '../src/constants/content-collections.js';

const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD;
const BASE = `${API_URL}/api/v1`;

/** The admin list cap, so each collection is one request. */
const PAGE_SIZE = 50;

interface ListItem {
  readonly id: string;
  readonly title?: string;
  readonly lastName?: string;
  readonly question?: string;
}

interface ListResponse {
  readonly data: readonly ListItem[];
  readonly meta?: { readonly total: number; readonly totalPages: number };
}

/** Enough of an item to name it in the output. */
const label = (item: ListItem): string => item.title ?? item.lastName ?? item.question ?? item.id;

async function login(): Promise<string> {
  if (PASSWORD === undefined || PASSWORD === '') {
    throw new Error('Set ADMIN_PASSWORD to the password for the admin account.');
  }

  const response = await fetch(`${BASE}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });

  if (!response.ok) {
    // The login limiter allows five attempts per fifteen minutes, so say so
    // rather than letting somebody retry their way into a lockout.
    throw new Error(
      `Login failed with ${String(response.status)}. Check ADMIN_PASSWORD; ` +
        'there are five attempts per fifteen minutes.'
    );
  }

  const body: unknown = await response.json();
  const token = (body as { data?: { accessToken?: unknown } }).data?.accessToken;

  if (typeof token !== 'string') throw new Error('Login response had no access token.');

  return token;
}

async function drafts(collection: string, token: string): Promise<readonly ListItem[]> {
  const url = `${BASE}/admin/content/${collection}?status=draft&pageSize=${String(PAGE_SIZE)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!response.ok) {
    throw new Error(`Listing ${collection} failed with ${String(response.status)}.`);
  }

  const body = (await response.json()) as ListResponse;

  if ((body.meta?.totalPages ?? 1) > 1) {
    // Only reachable once the firm has more than fifty drafts in one
    // collection, which is past the point where this script is the right tool.
    throw new Error(
      `${collection} has more than ${String(PAGE_SIZE)} drafts; publish the rest from the dashboard.`
    );
  }

  return body.data;
}

async function publish(collection: string, item: ListItem, token: string): Promise<boolean> {
  const response = await fetch(`${BASE}/admin/content/${collection}/${item.id}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.ok) return true;

  console.error(`  ! ${label(item)} — ${String(response.status)} ${await response.text()}`);

  return false;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm')) {
    console.error(
      `This publishes every draft at ${API_URL}, making it publicly visible ` +
        'including any [PENDING FROM FIRM] gaps and missing images.\n' +
        'Re-run with --confirm once you are sure that is the right environment.'
    );
    process.exitCode = 1;
    return;
  }

  const token = await login();
  let published = 0;
  let failed = 0;

  for (const collection of ADMIN_COLLECTIONS) {
    const items = await drafts(collection, token);

    if (items.length === 0) {
      console.log(`${collection}: no drafts`);
      continue;
    }

    let ok = 0;
    for (const item of items) {
      if (await publish(collection, item, token)) ok += 1;
      else failed += 1;
    }

    published += ok;
    console.log(`${collection}: published ${String(ok)} of ${String(items.length)}`);
  }

  console.log(`\nPublished ${String(published)} items at ${API_URL}.`);

  if (failed > 0) {
    console.error(`${String(failed)} failed. Nothing was rolled back; re-run to retry them.`);
    process.exitCode = 1;
  }
}

await main();
