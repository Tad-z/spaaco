/**
 * A small client for the admin API, which the import writes through so it
 * gets the same validation, sanitising, media pipeline, audit entries and
 * cache invalidation as a hand edit (ADR-059).
 *
 * The admin routes share the per-IP limit of 300 requests a minute, so calls
 * are spaced out and a 429 is waited out rather than failing the record. The
 * access token lasts 15 minutes; a long run signs in again before it expires,
 * well inside the login limit of five per fifteen minutes.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

export interface Item {
  readonly id: string;
  readonly slug: string;
  readonly revision: number;
  readonly status: 'draft' | 'published';
  readonly [field: string]: unknown;
}

export interface UploadedMedia {
  readonly id: string;
  readonly url: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    what: string
  ) {
    super(`${what} failed with ${String(status)}: ${body.slice(0, 500)}`);
  }
}

const MIN_INTERVAL_MS = 250;
const RELOGIN_AFTER_MS = 13 * 60 * 1000;
const MAX_RETRIES = 5;

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

export class AdminApi {
  private token = '';
  private tokenAt = 0;
  private lastCall = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string
  ) {}

  private get base(): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/api/v1`;
  }

  async login(): Promise<void> {
    const response = await fetch(`${this.base}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });
    if (!response.ok) {
      throw new ApiError(
        response.status,
        await response.text(),
        'Login (five attempts per fifteen minutes)'
      );
    }

    const body = (await response.json()) as { data?: { accessToken?: string } };
    if (body.data?.accessToken === undefined) throw new Error('Login response had no access token');

    this.token = body.data.accessToken;
    this.tokenAt = Date.now();
  }

  private async send(
    what: string,
    path: string,
    init: { method: string; json?: unknown; form?: FormData; ifMatch?: number }
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      if (Date.now() - this.tokenAt > RELOGIN_AFTER_MS) await this.login();

      const wait = this.lastCall + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastCall = Date.now();

      const headers: Record<string, string> = { Authorization: `Bearer ${this.token}` };
      if (init.json !== undefined) headers['Content-Type'] = 'application/json';
      // The revision that was read: without it the API answers 428 rather
      // than letting two writers overwrite each other.
      if (init.ifMatch !== undefined) headers['If-Match'] = String(init.ifMatch);

      let response: Response;
      try {
        response = await fetch(`${this.base}${path}`, {
          method: init.method,
          headers,
          body: init.form ?? (init.json === undefined ? undefined : JSON.stringify(init.json)),
        });
      } catch (error) {
        // A dropped connection (Render restarts, flaky networks): wait and retry.
        // If a create did land before the drop, the retry is refused on its
        // slug, and the next run finishes the record.
        if (attempt < MAX_RETRIES) {
          await sleep(5000 * (attempt + 1));
          continue;
        }
        throw error;
      }

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const reset = Number(/reset=(\d+)/.exec(response.headers.get('ratelimit') ?? '')?.[1]);
        await sleep((Number.isFinite(reset) && reset > 0 ? reset : 60) * 1000 + 500);
        continue;
      }
      if (response.status === 401 && attempt === 0) {
        await this.login();
        continue;
      }
      if (!response.ok) throw new ApiError(response.status, await response.text(), what);
      if (response.status === 204) return undefined;

      return await response.json();
    }
  }

  /** Every item in a content collection, all statuses, across pages. */
  async listAll(collection: string): Promise<Item[]> {
    const items: Item[] = [];
    for (let page = 1; ; page += 1) {
      const body = (await this.send(
        `Listing ${collection}`,
        `/admin/content/${collection}?pageSize=50&page=${String(page)}`,
        { method: 'GET' }
      )) as { data: Item[]; meta: { totalPages: number } };
      items.push(...body.data);
      if (page >= body.meta.totalPages) return items;
    }
  }

  async create(collection: string, payload: Record<string, unknown>): Promise<Item> {
    const body = (await this.send(`Creating ${collection}`, `/admin/content/${collection}`, {
      method: 'POST',
      json: payload,
    })) as { data: Item };
    return body.data;
  }

  async update(
    collection: string,
    item: Pick<Item, 'id' | 'revision'>,
    payload: Record<string, unknown>
  ): Promise<Item> {
    const body = (await this.send(
      `Updating ${collection}`,
      `/admin/content/${collection}/${item.id}`,
      { method: 'PATCH', json: payload, ifMatch: item.revision }
    )) as { data: Item };
    return body.data;
  }

  async publish(collection: string, id: string): Promise<Item> {
    const body = (await this.send(
      `Publishing ${collection}`,
      `/admin/content/${collection}/${id}/publish`,
      { method: 'POST' }
    )) as { data: Item };
    return body.data;
  }

  /** Back to draft: off the site, kept in the admin. */
  async unpublish(collection: string, id: string): Promise<Item> {
    const body = (await this.send(
      `Unpublishing ${collection}`,
      `/admin/content/${collection}/${id}/unpublish`,
      { method: 'POST' }
    )) as { data: Item };
    return body.data;
  }

  /** An image needs alt text; a PDF document needs a title, its link text (ADR-053). */
  async upload(
    file: string,
    mime: string,
    meta: { kind: 'image'; alt: string } | { kind: 'document'; title: string }
  ): Promise<UploadedMedia> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(readFileSync(file))], { type: mime }),
      basename(file)
    );
    form.append('kind', meta.kind);
    if (meta.kind === 'image') form.append('alt', meta.alt);
    else form.append('title', meta.title);

    const body = (await this.send(`Uploading ${basename(file)}`, '/admin/media', {
      method: 'POST',
      form,
    })) as { data: { id: string; url: string } };
    return { id: body.data.id, url: body.data.url };
  }
}
