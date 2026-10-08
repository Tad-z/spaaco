/**
 * Articles: `posts.json` → the `insights` collection.
 *
 * Rules agreed with TLS (5 Oct 2026): articles are published, keeping their
 * original date; categories and practice areas come from the firm's `map_to`;
 * inline images become links; links to old uploads point at the media library
 * instead; an article that is just a wrapper for one PDF also gets that PDF as
 * its "Read Article" document. A slug that exists and was made by hand is
 * never touched.
 */
import { basename, extname } from 'node:path';
import { INSIGHT_CATEGORIES } from '../../src/constants/enums.js';
import { isSlug, slugify } from '../../src/helpers/slug.helper.js';
import type { InsightCategory } from '../../src/types/api.js';
import type { Item } from './api.js';
import {
  bylineWriters,
  creditFor,
  profilePhoto,
  sameWriter,
  stripLeadingByline,
} from './bylines.js';
import type { BylineWriter, Credit, KnownPerson } from './bylines.js';
import { PEOPLE_SLUG_MAP } from './maps.js';
import { findUploadPaths, finishHtml, isPdfWrapper, prepareHtml } from './html.js';
import type { CategoryRow, PostRow } from './load.js';
import { normaliseKey } from './maps.js';
import type { ImportContext } from './people.js';
import { articleSource, redirect } from './redirects.js';
import type { Redirect } from './redirects.js';
import { cutAtWord, decode, lagosToIso, plainText } from './text.js';

/** Rich text is capped at 50,000 characters by the API (`richText()`). */
export const BODY_LIMIT = 50_000;

export interface CategoryTarget {
  readonly categories: readonly InsightCategory[];
  readonly practiceAreas: readonly string[];
}

/**
 * The firm's `map_to` per old category: comma-separated insight categories,
 * practice-area slugs, or `skip`. Returns the lookup by decoded name, plus
 * the values that are none of those.
 */
export function categoryTargets(
  rows: readonly CategoryRow[],
  practiceAreaSlugs: ReadonlySet<string>
): { targets: Map<string, CategoryTarget>; invalid: { category: string; value: string }[] } {
  const targets = new Map<string, CategoryTarget>();
  const invalid: { category: string; value: string }[] = [];

  for (const row of rows) {
    const name = decode(row.name);
    const categories: InsightCategory[] = [];
    const practiceAreas: string[] = [];

    for (const token of (row.map_to ?? '').split(/[,;]/).map((t) => t.trim().toLowerCase())) {
      if (token === '' || token === 'skip') continue;
      const category = INSIGHT_CATEGORIES.values.find((value) => value === token);
      if (category !== undefined) categories.push(category);
      else if (practiceAreaSlugs.has(token)) practiceAreas.push(token);
      else invalid.push({ category: name, value: token });
    }

    targets.set(normaliseKey(name), { categories, practiceAreas });
  }

  return { targets, invalid };
}

/** An article's categories and practice-area slugs, defaulting to `articles`. */
export function classify(
  names: string | null | undefined,
  targets: ReadonlyMap<string, CategoryTarget>
): { categories: InsightCategory[]; practiceAreas: string[]; defaulted: boolean } {
  const categories = new Set<InsightCategory>();
  const practiceAreas = new Set<string>();

  for (const name of (names ?? '')
    .split('|')
    .map((n) => decode(n))
    .filter(Boolean)) {
    const target = targets.get(normaliseKey(name));
    target?.categories.forEach((c) => categories.add(c));
    target?.practiceAreas.forEach((p) => practiceAreas.add(p));
  }

  const defaulted = categories.size === 0;
  if (defaulted) categories.add('articles');
  return { categories: [...categories], practiceAreas: [...practiceAreas], defaulted };
}

/** The slug to store: the WordPress one when the backend accepts it. */
export const backendSlug = (wordpressSlug: string): string =>
  isSlug(wordpressSlug) ? wordpressSlug : slugify(wordpressSlug);

const fileTitle = (path: string): string =>
  basename(path, extname(path)).replace(/[-_]+/g, ' ').trim();

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The author fields for a credit: a profile, a named writer, or neither (ADR-060). */
export const authorFields = (
  credit: Credit
): { author: string | null; authorName: string | null } =>
  credit.kind === 'person'
    ? { author: credit.id, authorName: null }
    : { author: null, authorName: credit.kind === 'named' ? credit.name : null };

/** An article's co-author, as the API takes it (ADR-064). */
interface CoAuthorField {
  readonly person: string | null;
  readonly name: string | null;
  readonly photo: string | null;
}

/** At most this many co-authors, as the API allows. */
const MAX_CO_AUTHORS = 8;

/**
 * A writer's photo: their old profile's, else the one beside them in the
 * byline, uploaded once however many articles show it.
 */
async function writerPhoto(
  writer: Pick<BylineWriter, 'name' | 'slug' | 'photo'>,
  record: string,
  ctx: ImportContext
): Promise<string | null> {
  const path = profilePhoto(writer, ctx.profiles) ?? writer.photo;
  const counts = ctx.report.insights.bylines.writersWithoutPhoto;
  if (path === undefined) {
    counts[writer.name] = (counts[writer.name] ?? 0) + 1;
    return null;
  }

  const result = await ctx.media.get(path, `Portrait of ${writer.name}`);
  if (result.ok && result.kind === 'image') return result.id;
  ctx.report.media.problems.push({
    record,
    path,
    problem: result.ok ? 'unsupported type' : result.problem,
    ...(!result.ok && result.problem === 'upload failed' ? { detail: result.detail } : {}),
  });
  return null;
}

/**
 * The named writer's photo and the co-authors, from the article's byline
 * (ADR-064). Whoever the article already credits is not listed again as a
 * co-author.
 */
async function writerFields(
  row: PostRow,
  credit: Credit,
  people: readonly KnownPerson[],
  record: string,
  ctx: ImportContext
): Promise<{ authorPhoto: string | null; coAuthors: CoAuthorField[] }> {
  const writers = bylineWriters(row.content, ctx.profiles);
  const creditedName = credit.kind === 'firm' ? null : credit.name;

  const authorPhoto =
    credit.kind === 'named'
      ? await writerPhoto(
          writers.find((writer) => sameWriter(credit.name, writer.name)) ?? { name: credit.name },
          record,
          ctx
        )
      : null;

  const coAuthors: CoAuthorField[] = [];
  const listed = new Set<string>();
  for (const writer of writers) {
    if (coAuthors.length >= MAX_CO_AUTHORS) break;
    if (creditedName !== null && sameWriter(writer.name, creditedName)) continue;

    const linked =
      writer.slug === undefined ? undefined : (PEOPLE_SLUG_MAP[writer.slug] ?? writer.slug);
    // A draft profile is hidden on the site, so that writer is listed by name
    // and photo instead, or they would vanish from the page.
    const person = people.find(
      (p) =>
        p.published !== false &&
        (p.slug === linked || sameWriter(writer.name, `${p.firstName} ${p.lastName}`))
    );
    const key = person?.id ?? writer.name.toLowerCase();
    if (listed.has(key)) continue;
    listed.add(key);

    coAuthors.push(
      person === undefined
        ? { person: null, name: writer.name, photo: await writerPhoto(writer, record, ctx) }
        : { person: person.id, name: null, photo: null }
    );
  }

  return { authorPhoto, coAuthors };
}

/**
 * An excerpt for an article WordPress gave none: the start of its text,
 * without the "View image" an inline picture became (ADR-064).
 */
export const autoExcerpt = (body: string | null): string | null =>
  cutAtWord(
    plainText((body ?? '').replace(/<a\b[^>]*>\s*View image\s*<\/a>/gi, ' ')).trim(),
    160
  ) || null;

/** The excerpt an earlier run made from the body as first imported, byline and all. */
const firstAutoExcerpt = (row: PostRow): string | null =>
  cutAtWord(plainText(finishHtml(prepareHtml(row.content).html, () => undefined)), 160) || null;

/** A published profile for this name; a draft one is hidden on the site. */
const publishedProfile = (name: string, people: readonly KnownPerson[]): KnownPerson | undefined =>
  people.find((p) => p.published !== false && sameWriter(name, `${p.firstName} ${p.lastName}`));

/**
 * The credit once the byline's writers are known (ADR-064). The firm stood in
 * for a writer named only under their photo, so the first such writer takes
 * its place; and a named writer who does have a published profile is credited
 * to it, "Hilda Omono Okoduwa" to Hilda Okoduwa.
 */
export function creditWithWriters(
  credit: Credit,
  writers: readonly BylineWriter[],
  people: readonly KnownPerson[]
): Credit {
  const name =
    credit.kind === 'named' ? credit.name : credit.kind === 'firm' ? writers[0]?.name : undefined;
  if (name === undefined) return credit;
  const person = publishedProfile(name, people);
  return person === undefined
    ? { kind: 'named', name }
    : { kind: 'person', id: person.id, name: `${person.firstName} ${person.lastName}` };
}

const countCredit = (ctx: ImportContext, credit: Credit): void => {
  const { authors } = ctx.report.insights;
  authors[credit.kind] += 1;
  if (credit.kind === 'named')
    authors.namedWriters[credit.name] = (authors.namedWriters[credit.name] ?? 0) + 1;
};

export async function importInsights(
  rows: readonly PostRow[],
  categories: readonly CategoryRow[],
  ctx: ImportContext
): Promise<Redirect[]> {
  const { report } = ctx;
  const { targets, invalid } = categoryTargets(categories, new Set(ctx.practiceAreaIds.keys()));
  report.insights.invalidMapTo.push(...invalid);

  const existing = new Map((await ctx.api.listAll('insights')).map((item) => [item.slug, item]));
  const people: KnownPerson[] = (await ctx.api.listAll('people')).map((item) => ({
    id: item.id,
    slug: item.slug,
    firstName: String(item.firstName),
    lastName: String(item.lastName),
    published: item.status === 'published',
  }));

  if (ctx.authorsOnly || ctx.bylinesOnly) {
    for (const row of rows) {
      const slug = backendSlug(row.slug);
      try {
        if (ctx.authorsOnly) await creditAuthor(row, slug, people, existing, ctx);
        else await tidyByline(row, slug, people, existing, ctx);
      } catch (error) {
        report.failures.push({ collection: 'insights', slug, error: errorText(error) });
        report.counts.insights.failed += 1;
      }
    }
    return [];
  }

  const redirects: Redirect[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const slug = backendSlug(row.slug);
    try {
      // Shortening two long slugs can land them on one: report, don't guess.
      if (seen.has(slug))
        throw new Error(`slug "${slug}" is already used by another article in this export`);
      seen.add(slug);
      const imported = await importInsight(row, slug, targets, people, existing, ctx);
      if (imported)
        redirects.push(redirect(articleSource(row.published, row.slug), `/insights/${slug}`));
    } catch (error) {
      report.failures.push({ collection: 'insights', slug, error: errorText(error) });
      report.counts.insights.failed += 1;
    }
  }

  return redirects;
}

/** Returns whether the article is (or would be) in the backend afterwards. */
async function importInsight(
  row: PostRow,
  slug: string,
  targets: ReadonlyMap<string, CategoryTarget>,
  people: readonly KnownPerson[],
  existing: Map<string, Item>,
  ctx: ImportContext
): Promise<boolean> {
  const { report } = ctx;
  const key = `insights/${slug}`;
  const current = existing.get(slug);

  if (current !== undefined && (current.legacy === null || current.legacy === undefined)) {
    report.existing.skippedHandMade.push({ collection: 'insights', slug });
    report.counts.insights.skip += 1;
    // The firm already has this article at the same slug, so the old link
    // still has somewhere to go.
    return true;
  }
  if (
    current !== undefined &&
    !ctx.overwriteEdited &&
    ctx.state.records[key] !== undefined &&
    ctx.state.records[key] !== current.revision
  ) {
    report.existing.editedSinceImport.push({ collection: 'insights', slug });
    report.counts.insights.skip += 1;
    return true;
  }

  if (slug !== row.slug) {
    report.insights.renamedSlugs.push({
      from: row.slug,
      to: slug,
      reason: row.slug.length > 140 ? 'longer than 140 characters' : 'not lowercase-hyphenated',
    });
  }

  const decodedTitle = decode(row.title);
  const title = cutAtWord(decodedTitle, 300);
  if (title !== decodedTitle) report.insights.truncated.push({ slug, field: 'title' });

  // Body: clean, upload what it links to, rewrite the links.
  const prepared = prepareHtml(row.content);
  if (prepared.inlineImages > 0)
    report.insights.inlineImages.push({ slug, images: prepared.inlineImages });
  if (prepared.droppedShortcodes.length > 0) {
    report.insights.droppedShortcodes.push({ slug, shortcodes: [...prepared.droppedShortcodes] });
  }
  if (prepared.embeds > 0) report.insights.embedsAsLinks.push(slug);

  const paths = findUploadPaths(prepared.html);
  const pdfPaths = paths.filter((path) => extname(path).toLowerCase() === '.pdf');
  const urls = new Map<string, string>();
  const documents = new Map<string, string>();

  for (const path of paths) {
    const isPdf = pdfPaths.includes(path);
    const label = isPdf
      ? pdfPaths.length === 1
        ? title
        : fileTitle(path)
      : `Image from "${title}"`;
    const result = await ctx.media.get(path, label);
    if (result.ok) {
      urls.set(path, result.url);
      if (result.kind === 'document') documents.set(path, result.id);
    } else {
      report.media.problems.push({
        record: key,
        path,
        problem: result.problem,
        ...(result.problem === 'upload failed' ? { detail: result.detail } : {}),
      });
    }
  }

  // The old byline goes; the page shows the author block instead (ADR-064).
  const finished = finishHtml(prepared.html, (path) => urls.get(path));
  const body =
    finished === null
      ? null
      : stripLeadingByline(finished, {
          leadingPhotoIsAuthor: bylineWriters(row.content, ctx.profiles).length > 0,
        }) || null;
  if (body !== finished) report.insights.bylines.bodiesCleaned += 1;
  if (body !== null && body.length > BODY_LIMIT) {
    throw new Error(
      `body is ${String(body.length)} characters after cleaning; the limit is ${String(BODY_LIMIT)}`
    );
  }

  const pdfPath = pdfPaths[0];
  const document =
    pdfPath !== undefined && isPdfWrapper(prepared.html, pdfPaths)
      ? (documents.get(pdfPath) ?? null)
      : null;
  if (document !== null) report.insights.pdfWrappers.push(slug);

  const ownExcerpt = plainText(row.excerpt);
  const excerpt = ownExcerpt === '' ? autoExcerpt(body) : cutAtWord(ownExcerpt, 1000);
  if (ownExcerpt.length > 1000) report.insights.truncated.push({ slug, field: 'excerpt' });

  let coverImage: string | null = null;
  if (row.cover_file) {
    const result = await ctx.media.get(row.cover_file, title);
    if (result.ok && result.kind === 'image') coverImage = result.id;
    else {
      report.media.problems.push({
        record: key,
        path: row.cover_file,
        problem: result.ok ? 'unsupported type' : result.problem,
      });
    }
  }

  const { categories, practiceAreas, defaulted } = classify(row.categories, targets);
  if (defaulted) report.insights.defaultedToArticles += 1;

  // WordPress's author was the account that posted it; the writer is in the
  // article's byline (ADR-060).
  const credit = creditWithWriters(
    creditFor(row.content, row.slug, people),
    bylineWriters(row.content, ctx.profiles),
    people
  );
  countCredit(ctx, credit);
  const writers = await writerFields(row, credit, people, key, ctx);
  countWriters(ctx, writers);

  const payload = {
    title,
    excerpt,
    body,
    format: 'article',
    categories,
    practiceAreas: practiceAreas.flatMap((areaSlug) => ctx.practiceAreaIds.get(areaSlug) ?? []),
    ...authorFields(credit),
    ...writers,
    coverImage,
    document,
    featured: false,
    legacyImport: { source: 'wordpress', legacyId: row.ID, publishedAt: lagosToIso(row.published) },
  };

  if (current === undefined) {
    report.counts.insights.create += 1;
    if (!ctx.commit) return true;
    const created = await ctx.api.create('insights', { slug, ...payload });
    // They were public for years: published, keeping the original date (ADR-059).
    const published = await ctx.api.publish('insights', created.id);
    existing.set(slug, published);
    ctx.state.records[key] = published.revision;
    return true;
  }

  report.counts.insights.update += 1;
  if (!ctx.commit) return true;
  // An update never republishes an article the firm took down. One the run
  // state has never seen was created by a run that broke off before it was
  // published, so it is finished now.
  const unfinished = ctx.state.records[key] === undefined;
  let updated = await ctx.api.update('insights', current, payload);
  if (unfinished && updated.status === 'draft')
    updated = await ctx.api.publish('insights', updated.id);
  existing.set(slug, updated);
  ctx.state.records[key] = updated.revision;
  return true;
}

/**
 * `--authors-only`: set just the author fields on an imported article, leaving
 * every other field (and anything the firm has edited) alone. An author or
 * writer someone has already set by hand is kept.
 */
async function creditAuthor(
  row: PostRow,
  slug: string,
  people: readonly KnownPerson[],
  existing: Map<string, Item>,
  ctx: ImportContext
): Promise<void> {
  const current = existing.get(slug);
  // Only the import's own articles: hand-made ones are the firm's to credit.
  if (current?.legacy === undefined || current.legacy === null) return;

  const credit = creditFor(row.content, row.slug, people);
  countCredit(ctx, credit);
  const want = authorFields(credit);
  const has = {
    author: typeof current.author === 'string' ? current.author : null,
    authorName: typeof current.authorName === 'string' ? current.authorName : null,
  };

  const result = ctx.report.insights.authorsOnly;
  if (has.author === want.author && has.authorName === want.authorName) {
    result.unchanged += 1;
    return;
  }
  if (has.author !== null || has.authorName !== null) {
    result.keptByHand.push(slug);
    return;
  }

  result.patched += 1;
  if (!ctx.commit) return;
  const key = `insights/${slug}`;
  const ours = ctx.state.records[key] === current.revision;
  const updated = await ctx.api.update('insights', current, want);
  existing.set(slug, updated);
  // Still the import's own record, so a later full run does not take it for an edit.
  if (ours) ctx.state.records[key] = updated.revision;
}

const countWriters = (
  ctx: ImportContext,
  writers: { authorPhoto: string | null; coAuthors: readonly CoAuthorField[] }
): void => {
  const counts = ctx.report.insights.bylines;
  if (writers.authorPhoto !== null) counts.authorPhotos += 1;
  if (writers.coAuthors.length > 0) counts.withCoAuthors += 1;
  counts.coAuthors += writers.coAuthors.length;
};

/** What an imported article already credits: an attorney, a named writer, or the firm. */
function storedCredit(current: Item, people: readonly KnownPerson[]): Credit {
  const person = people.find((p) => p.id === current.author);
  if (person !== undefined)
    return { kind: 'person', id: person.id, name: `${person.firstName} ${person.lastName}` };
  return typeof current.authorName === 'string' && current.authorName !== ''
    ? { kind: 'named', name: current.authorName }
    : { kind: 'firm' };
}

/**
 * `--bylines-only` (ADR-064): on an imported article, take the old byline off
 * the body as it is now (keeping any edit the firm made), and set the writer's
 * photo and the co-authors from the byline. Each field is left alone once
 * someone has set it.
 */
async function tidyByline(
  row: PostRow,
  slug: string,
  people: readonly KnownPerson[],
  existing: Map<string, Item>,
  ctx: ImportContext
): Promise<void> {
  const current = existing.get(slug);
  // Only the import's own articles: hand-made ones are the firm's.
  if (current?.legacy === undefined || current.legacy === null) return;

  const key = `insights/${slug}`;
  const counts = ctx.report.insights.bylines;
  const payload: Record<string, unknown> = {};
  const writers = bylineWriters(row.content, ctx.profiles);
  const stored = storedCredit(current, people);
  const credit = creditWithWriters(stored, writers, people);

  const before = typeof current.body === 'string' ? current.body : null;
  let body = before;
  if (body !== null) {
    const cleaned = stripLeadingByline(body, {
      leadingPhotoIsAuthor: writers.length > 0,
      writerNames: [
        ...writers.map((writer) => writer.name),
        ...(stored.kind === 'firm' ? [] : [stored.name]),
        ...(credit.kind === 'firm' ? [] : [credit.name]),
      ],
    });
    if (cleaned !== body && cleaned !== '') {
      payload.body = cleaned;
      body = cleaned;
      counts.bodiesCleaned += 1;
    }
  }

  // The excerpt the import made from the body started with the byline too
  // ("View image Hilda Omono Okoduwa …"). Remade from the clean body, but
  // only while it is still the import's own (made by the first import or by
  // an earlier run of this): one the firm wrote is kept. A photo gallery with
  // no text is left with no excerpt rather than "View image View image".
  const currentExcerpt = typeof current.excerpt === 'string' ? current.excerpt : null;
  if (plainText(row.excerpt) === '' && currentExcerpt !== null) {
    const ours =
      currentExcerpt === firstAutoExcerpt(row) ||
      currentExcerpt === autoExcerpt(before) ||
      /View image|^\s*By\s+[A-Z]|^\s*\d{1,2}(?:st|nd|rd|th)?\s+[A-Z][a-z]+,?\s+\d{4}/.test(
        currentExcerpt
      );
    const remade = autoExcerpt(body);
    if (ours && remade !== currentExcerpt) {
      payload.excerpt = remade;
      counts.excerptsRemade += 1;
    }
  }
  const recredited = JSON.stringify(credit) !== JSON.stringify(stored);
  if (recredited) {
    Object.assign(payload, authorFields(credit), { authorPhoto: null });
    counts.recredited.push({
      slug,
      from: stored.kind === 'firm' ? 'the firm' : stored.name,
      to: credit.kind === 'firm' ? 'the firm' : credit.name,
    });
  }

  const { authorPhoto, coAuthors } = await writerFields(row, credit, people, key, ctx);
  const hasPhoto = typeof current.authorPhoto === 'string' && !recredited;
  if (authorPhoto !== null && credit.kind === 'named' && !hasPhoto) {
    payload.authorPhoto = authorPhoto;
    counts.authorPhotos += 1;
  }

  const storedList: unknown[] = Array.isArray(current.coAuthors) ? current.coAuthors : [];
  // A list that names a draft attorney (shown nowhere), or names by hand
  // someone who has a published profile, is redone.
  const drafts = new Set(people.filter((p) => p.published === false).map((p) => p.id));
  const stale = storedList.some((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const { person, name } = entry as { person?: unknown; name?: unknown };
    return (
      drafts.has(String(person)) ||
      (typeof name === 'string' && publishedProfile(name, people) !== undefined)
    );
  });
  if (
    JSON.stringify(coAuthors) !== JSON.stringify(storedList) &&
    (storedList.length === 0 || stale || recredited)
  ) {
    payload.coAuthors = coAuthors;
    counts.withCoAuthors += 1;
    counts.coAuthors += coAuthors.length;
  }

  if (Object.keys(payload).length === 0) return;
  counts.patched += 1;
  if (!ctx.commit) return;
  const ours = ctx.state.records[key] === current.revision;
  const updated = await ctx.api.update('insights', current, payload);
  existing.set(slug, updated);
  // Still the import's own record, so a later full run does not take it for an edit.
  if (ours) ctx.state.records[key] = updated.revision;
}
