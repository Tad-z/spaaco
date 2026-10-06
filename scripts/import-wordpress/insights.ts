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

export async function importInsights(
  rows: readonly PostRow[],
  categories: readonly CategoryRow[],
  authors: ReadonlyMap<string, string>,
  ctx: ImportContext
): Promise<Redirect[]> {
  const { report } = ctx;
  const { targets, invalid } = categoryTargets(categories, new Set(ctx.practiceAreaIds.keys()));
  report.insights.invalidMapTo.push(...invalid);

  const existing = new Map((await ctx.api.listAll('insights')).map((item) => [item.slug, item]));
  const redirects: Redirect[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const slug = backendSlug(row.slug);
    try {
      // Shortening two long slugs can land them on one: report, don't guess.
      if (seen.has(slug))
        throw new Error(`slug "${slug}" is already used by another article in this export`);
      seen.add(slug);
      const imported = await importInsight(row, slug, targets, authors, existing, ctx);
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
  authors: ReadonlyMap<string, string>,
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

  const body = finishHtml(prepared.html, (path) => urls.get(path));
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
  const excerpt =
    ownExcerpt === '' ? cutAtWord(plainText(body), 160) || null : cutAtWord(ownExcerpt, 1000);
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

  // Bylines are mostly WordPress admin accounts; anything that is not an
  // attorney in the backend is credited to the firm (null author).
  const author = authors.get(normaliseKey(decode(row.author))) ?? null;
  if (author === null) report.insights.firmAuthored += 1;

  const payload = {
    title,
    excerpt,
    body,
    format: 'article',
    categories,
    practiceAreas: practiceAreas.flatMap((areaSlug) => ctx.practiceAreaIds.get(areaSlug) ?? []),
    author,
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
  // An update never republishes: an article the firm took down stays down.
  const updated = await ctx.api.update('insights', current, payload);
  existing.set(slug, updated);
  ctx.state.records[key] = updated.revision;
  return true;
}
