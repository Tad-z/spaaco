/**
 * Attorney profiles: `people.json` → the `people` collection.
 *
 * Rules agreed with TLS (5 Oct 2026): only people the firm marks `current`;
 * positions outside the role ladder are skipped and listed; new people are
 * created as drafts for the firm to approve; the people already in the backend
 * are merged by filling only their empty fields, never overwriting.
 */
import { isSlug, slugify } from '../../src/helpers/slug.helper.js';
import type { AdminApi, Item } from './api.js';
import { finishHtml, prepareHtml } from './html.js';
import type { PersonRow, ReviewRow, ReviewStatus } from './load.js';
import { HONORIFICS, PEOPLE_SLUG_MAP, normaliseKey, practiceAreaSlugFor, roleFor } from './maps.js';
import type { MediaStore } from './media.js';
import { unserializeStrings } from './php.js';
import type { Report } from './report.js';
import type { RunState } from './state.js';
import { cutAtWord, decode, fixShouting, plainText } from './text.js';

export interface NameParts {
  readonly honorific: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly postNominals: string | null;
  /** Why the split needs a human look, if it does. */
  readonly note?: string;
}

/**
 * "Dr. Babatunde Ajibade, SAN, FCIArb" → honorific "Dr.", first "Babatunde",
 * last "Ajibade", post-nominals "SAN, FCIArb". Everything after the first
 * comma is post-nominal; leading honorifics are peeled off; the last word is
 * the surname and the rest the first name(s).
 */
export function splitName(raw: string): NameParts {
  const [base = '', ...after] = fixShouting(decode(raw)).split(',');
  const postNominals =
    after
      .map((part) => part.trim())
      .filter(Boolean)
      .join(', ') || null;

  const words = base.trim().split(' ').filter(Boolean);
  const honorifics: string[] = [];
  while (words.length > 2 && HONORIFICS.some((h) => h.toLowerCase() === words[0]?.toLowerCase())) {
    honorifics.push(words.shift() ?? '');
  }
  // "Dr Ajibade": a two-word name may still start with an honorific.
  if (words.length === 2 && HONORIFICS.some((h) => h.toLowerCase() === words[0]?.toLowerCase())) {
    honorifics.push(words.shift() ?? '');
  }

  const lastName = words.pop() ?? '';
  const firstName = words.join(' ');
  const honorific = honorifics.join(' ') || null;

  const note =
    firstName === '' || lastName === ''
      ? 'could not find both a first and a last name'
      : (postNominals?.length ?? 0) > 40
        ? 'post-nominals longer than 40 characters'
        : undefined;

  return {
    honorific,
    firstName: firstName || lastName,
    lastName,
    postNominals,
    ...(note === undefined ? {} : { note }),
  };
}

/** List items from WordPress text: a `<ul>`, `<p>`s, or one item per line. */
export function listItems(raw: string | null | undefined): string[] {
  const html = (raw ?? '').replace(/\r\n?/g, '\n');
  const pieces = /<li\b/i.test(html)
    ? [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => match[1] ?? '')
    : html.split(/<\/p>|<br\s*\/?>|\n/i);

  return pieces.map((piece) => plainText(piece)).filter((item) => item !== '');
}

const YEAR = /[([]?\b((?:19|20)\d{2})\b[)\]]?\.?$/;

/**
 * Education lines → the structured field. A trailing year ("…, [2017].")
 * becomes `year`. A single long paragraph is prose rather than a list, so it
 * becomes the intro.
 */
export function educationFrom(raw: string | null | undefined): {
  intro: string | null;
  entries: { qualification: string; year: number | null }[];
} {
  const items = listItems(raw);
  if (items.length === 1 && (items[0]?.length ?? 0) > 300) {
    return { intro: cutAtWord(items[0] ?? '', 2000), entries: [] };
  }

  const entries = items.slice(0, 20).map((item) => {
    const year = YEAR.exec(item);
    const qualification = (year ? item.slice(0, year.index) : item).replace(/[\s,;.]+$/, '');
    return {
      qualification: cutAtWord(qualification || item, 300),
      year: year ? Number(year[1]) : null,
    };
  });

  return { intro: null, entries };
}

/** Memberships: a PHP-serialized list on most profiles, plain text on a few. */
export function membershipsFrom(raw: string | null | undefined): string[] {
  const items = unserializeStrings(raw)?.map((item) => decode(item)) ?? listItems(raw);
  const clean = items.map((item) => cutAtWord(item.replace(/[\s,;]+$/, ''), 200)).filter(Boolean);
  return [...new Set(clean)].slice(0, 30);
}

/** Only an https link on linkedin.com is kept; plain http is upgraded. */
export function linkedinFrom(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (value === '') return null;
  try {
    const url = new URL(value.replace(/^http:\/\//i, 'https://'));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !(host === 'linkedin.com' || host.endsWith('.linkedin.com'))) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** Old practice-area titles → backend slugs, plus the titles that matched nothing. */
export function practiceAreaSlugs(raw: string | null | undefined): {
  slugs: string[];
  unmatched: string[];
} {
  const titles = unserializeStrings(raw) ?? listItems(raw);
  const slugs = new Set<string>();
  const unmatched: string[] = [];

  for (const title of titles.map((t) => decode(t)).filter(Boolean)) {
    const slug = practiceAreaSlugFor(title);
    if (slug === undefined) unmatched.push(title);
    else if (slug !== null) slugs.add(slug);
  }

  return { slugs: [...slugs], unmatched };
}

/** The firm's decision for a row: by slug when the sheet has one, else by name. */
export function reviewStatus(row: PersonRow, review: readonly ReviewRow[]): ReviewStatus {
  const bySlug = review.find((entry) => entry.slug === row.slug);
  if (bySlug !== undefined) return bySlug.status;

  // The sheet's names come from the page title, which can differ from the
  // profile's own name field ("Dr. Andrea Ajibade" vs "Andrea Ajibade").
  const names = new Set([row.title, row.name ?? ''].map((n) => normaliseKey(decode(n))));
  const byName = review.filter(
    (entry) => entry.slug === undefined && names.has(normaliseKey(entry.name))
  );
  // Two rows with one name cannot be told apart without a slug.
  return byName.length === 1 ? (byName[0]?.status ?? 'pending') : 'pending';
}

export interface ImportContext {
  readonly api: AdminApi;
  readonly commit: boolean;
  readonly media: MediaStore;
  readonly state: RunState;
  readonly report: Report;
  readonly practiceAreaIds: ReadonlyMap<string, string>;
  readonly overwriteEdited: boolean;
}

const isEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object' && 'entries' in value) {
    const education = value as { intro?: unknown; entries?: unknown[] };
    return (education.entries?.length ?? 0) === 0 && isEmpty(education.intro);
  }
  return false;
};

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Import every row. Returns `"first last"` → person id for every person now
 * in the backend, which the articles use to credit an author.
 */
export async function importPeople(
  rows: readonly PersonRow[],
  review: readonly ReviewRow[],
  ctx: ImportContext
): Promise<Map<string, string>> {
  const { report } = ctx;
  const existing = new Map((await ctx.api.listAll('people')).map((item) => [item.slug, item]));

  for (const row of rows) {
    const name = decode(row.name ?? row.title);
    const position = decode(row.position);

    const status = reviewStatus(row, review);
    if (status === 'former' || status === 'duplicate') {
      report.people.skipped.push({ slug: row.slug, name, position, reason: `marked ${status}` });
      report.counts.people.skip += 1;
      continue;
    }
    // On a dry run, pending people are processed so their warnings show.
    if (status === 'pending') {
      report.people.pendingReview.push({ slug: row.slug, name });
      // A commit never imports someone the firm has not marked current, even
      // when the sheet is complete but this row could not be matched to it.
      if (ctx.commit) {
        report.people.skipped.push({
          slug: row.slug,
          name,
          position,
          reason: 'no review status found',
        });
        report.counts.people.skip += 1;
        continue;
      }
    }

    const role = roleFor(position);
    if (role === null) {
      report.people.skipped.push({
        slug: row.slug,
        name,
        position,
        reason: 'role outside the ladder',
      });
      report.counts.people.skip += 1;
      continue;
    }

    try {
      await importPerson(row, name, role, existing, ctx);
    } catch (error) {
      report.failures.push({ collection: 'people', slug: row.slug, error: errorText(error) });
      report.counts.people.failed += 1;
    }
  }

  const byName = new Map<string, string>();
  for (const item of existing.values()) {
    byName.set(normaliseKey(`${String(item.firstName)} ${String(item.lastName)}`), item.id);
  }
  return byName;
}

async function importPerson(
  row: PersonRow,
  name: string,
  role: NonNullable<ReturnType<typeof roleFor>>,
  existing: Map<string, Item>,
  ctx: ImportContext
): Promise<void> {
  const { report } = ctx;
  const parts = splitName(name);
  if (parts.note !== undefined)
    report.people.nameWarnings.push({ slug: row.slug, name, note: parts.note });

  const areas = practiceAreaSlugs(row.practice_areas);
  const practiceAreas: string[] = [];
  for (const slug of areas.slugs) {
    const id = ctx.practiceAreaIds.get(slug);
    if (id === undefined) areas.unmatched.push(`${slug} (not in the backend)`);
    else practiceAreas.push(id);
  }
  for (const title of areas.unmatched)
    report.people.unmatchedPracticeAreas.push({ slug: row.slug, title });

  const linkedinUrl = linkedinFrom(row.linkedin);
  if (linkedinUrl === null && (row.linkedin ?? '').trim() !== '') {
    report.people.rejectedLinkedin.push({ slug: row.slug, value: row.linkedin ?? '' });
  }

  const prepared = prepareHtml(row.bio);
  const fields: Record<string, unknown> = {
    honorific: parts.honorific,
    firstName: parts.firstName,
    lastName: parts.lastName,
    postNominals: parts.postNominals === null ? null : cutAtWord(parts.postNominals, 40),
    role,
    linkedinUrl,
    // Bios link no uploads in this export; anything that did would keep its old link.
    bio: finishHtml(prepared.html, () => undefined),
    practiceAreas,
    education: educationFrom(row.education),
    memberships: membershipsFrom(row.memberships),
  };

  const photo = async (): Promise<string | null> => {
    if (!row.photo_file) return null;
    const result = await ctx.media.get(
      row.photo_file,
      `Portrait of ${parts.firstName} ${parts.lastName}`
    );
    if (result.ok) return result.id;
    report.media.problems.push({
      record: `people/${row.slug}`,
      path: row.photo_file,
      problem: result.problem,
      ...(result.problem === 'upload failed' ? { detail: result.detail } : {}),
    });
    return null;
  };

  const target = PEOPLE_SLUG_MAP[row.slug] ?? (isSlug(row.slug) ? row.slug : slugify(row.slug));
  const current = existing.get(target);
  const key = `people/${target}`;

  // Hand-made record: fill its empty fields, never overwrite (agreed with TLS).
  // No `legacyImport`: a rollback by `legacy.source` must never delete it.
  if (current !== undefined && (current.legacy === null || current.legacy === undefined)) {
    const patch: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(fields)) {
      if (
        field !== 'firstName' &&
        field !== 'lastName' &&
        field !== 'role' &&
        isEmpty(current[field]) &&
        !isEmpty(value)
      ) {
        patch[field] = value;
      }
    }
    if (isEmpty(current.photo)) {
      const id = await photo();
      if (id !== null) patch.photo = id;
    }

    report.people.merged.push({ slug: row.slug, into: target, fields: Object.keys(patch) });
    report.counts.people.merge += 1;
    if (ctx.commit && Object.keys(patch).length > 0) {
      existing.set(target, await ctx.api.update('people', current, patch));
    }
    return;
  }

  const body = {
    ...fields,
    photo: await photo(),
    legacyImport: { source: 'wordpress', legacyId: row.ID },
  };

  if (current === undefined) {
    report.counts.people.create += 1;
    if (!ctx.commit) return;
    // Drafts: the firm approves each bio before it goes live.
    const created = await ctx.api.create('people', { slug: target, ...body });
    existing.set(target, created);
    ctx.state.records[key] = created.revision;
    return;
  }

  if (!ctx.overwriteEdited && ctx.state.records[key] !== current.revision) {
    report.existing.editedSinceImport.push({ collection: 'people', slug: target });
    report.counts.people.skip += 1;
    return;
  }

  report.counts.people.update += 1;
  if (!ctx.commit) return;
  const updated = await ctx.api.update('people', current, body);
  existing.set(target, updated);
  ctx.state.records[key] = updated.revision;
}
