#!/usr/bin/env tsx
/**
 * One-off import of the old WordPress site's attorneys and articles.
 *
 * Writes through the admin API (ADR-059), so it needs a running API and an
 * admin account. A **dry run is the default**: it reads the API to see what
 * exists, then reports what it would create, update, merge and skip, and
 * writes nothing — no records, no uploads.
 *
 *   API_URL=http://localhost:3000 ADMIN_PASSWORD=… \
 *     npm run import:wordpress -- --data ./database-extract/database-extract
 *
 * `--commit` writes. It refuses while the firm's decisions are incomplete:
 * every person needs a review status and every category a `map_to`. See
 * scripts/import-wordpress/README.md for the run plan and rollback.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { AdminApi } from './api.js';
import { importInsights } from './insights.js';
import { loadExport } from './load.js';
import { MediaStore } from './media.js';
import { importPeople } from './people.js';
import { practiceAreaRedirects, redirect } from './redirects.js';
import type { Redirect } from './redirects.js';
import { newReport, printSummary, writeReport } from './report.js';
import { loadState, saveState, stateFileName } from './state.js';
import { PEOPLE_SLUG_MAP } from './maps.js';

const { values: args } = parseArgs({
  options: {
    data: { type: 'string' },
    uploads: { type: 'string' },
    'report-dir': { type: 'string' },
    only: { type: 'string' },
    limit: { type: 'string' },
    commit: { type: 'boolean', default: false },
    'overwrite-edited': { type: 'boolean', default: false },
    'publish-people': { type: 'boolean', default: false },
  },
});

async function main(): Promise<void> {
  if (args.data === undefined)
    throw new Error('Pass --data <folder with people.json, posts.json, …>');
  const dataDir = resolve(args.data);
  const uploadsDir = resolve(args.uploads ?? join(dataDir, 'uploads'));
  // Beside the export, never in the repository: the report names staff.
  const reportDir = resolve(args['report-dir'] ?? join(dataDir, '..', 'import-runs'));
  const only = new Set((args.only ?? 'people,insights').split(',').map((s) => s.trim()));
  const limit = args.limit === undefined ? Infinity : Number(args.limit);
  const commit = args.commit;

  const apiUrl = process.env.API_URL;
  const password = process.env.ADMIN_PASSWORD;
  if (apiUrl === undefined || apiUrl === '') {
    throw new Error(
      'Set API_URL. It is never defaulted, so a run cannot reach the wrong API by accident.'
    );
  }
  if (password === undefined || password === '')
    throw new Error('Set ADMIN_PASSWORD for an admin account.');
  if (!existsSync(uploadsDir))
    throw new Error(
      `No uploads folder at ${uploadsDir}; unzip uploads-export.zip there or pass --uploads`
    );
  mkdirSync(reportDir, { recursive: true });

  const data = loadExport(dataDir);
  const report = newReport(commit ? 'commit' : 'dry-run', apiUrl);

  // The firm's decisions gate a commit (TLS, gates O1 and O2).
  report.gates.peoplePendingReview = data.review.filter((row) => row.status === 'pending').length;
  const unmapped = data.categories.filter((row) => (row.map_to ?? '').trim() === '');
  report.gates.categoriesWithoutMapTo = unmapped.length;
  report.insights.categoriesWithoutMapTo = unmapped.map((row) => ({
    name: row.name,
    posts: row.posts,
  }));
  if (commit && (report.gates.peoplePendingReview > 0 || report.gates.categoriesWithoutMapTo > 0)) {
    throw new Error(
      `Refusing to commit: ${String(report.gates.peoplePendingReview)} people have no review status and ` +
        `${String(report.gates.categoriesWithoutMapTo)} categories have no map_to.`
    );
  }

  const api = new AdminApi(apiUrl, process.env.ADMIN_USERNAME ?? 'admin', password);
  await api.login();

  const statePath = join(reportDir, stateFileName(apiUrl));
  const state = loadState(statePath);
  const media = new MediaStore(uploadsDir, commit ? api : null, state);

  const practiceAreaIds = new Map(
    (await api.listAll('practice-areas')).map((item) => [item.slug, item.id])
  );
  const ctx = {
    api,
    commit,
    media,
    state,
    report,
    practiceAreaIds,
    overwriteEdited: args['overwrite-edited'],
    publishPeople: args['publish-people'],
  };

  const redirects: Redirect[] = [...practiceAreaRedirects()];
  for (const [oldSlug, newSlug] of Object.entries(PEOPLE_SLUG_MAP)) {
    redirects.push(redirect(`/people/${oldSlug}`, `/people/${newSlug}`));
  }

  let authors = new Map<string, string>();
  // A killed process never reaches `finally`, so progress is also saved as it goes.
  const checkpoint = commit
    ? setInterval(() => {
        saveState(statePath, state);
      }, 30_000)
    : undefined;
  try {
    if (only.has('people')) {
      console.log(
        `People: ${String(Math.min(limit, data.people.length))} of ${String(data.people.length)}`
      );
      authors = await importPeople(data.people.slice(0, limit), data.review, ctx);
    }
    if (only.has('insights')) {
      console.log(
        `Insights: ${String(Math.min(limit, data.posts.length))} of ${String(data.posts.length)}`
      );
      redirects.push(
        ...(await importInsights(data.posts.slice(0, limit), data.categories, authors, ctx))
      );
    }
  } finally {
    clearInterval(checkpoint);
    // Saved even after a crash, so the next run knows what was uploaded.
    if (commit) saveState(statePath, state);
  }

  report.media.uploads = media.uploads;
  report.redirects = redirects.length;
  const path = writeReport(reportDir, report, redirects);
  printSummary(report);
  console.log(`\nReport: ${path}\nRedirects: ${join(reportDir, 'redirects.json')}`);
  if (!commit) console.log('Dry run: nothing was written. Pass --commit to write.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
