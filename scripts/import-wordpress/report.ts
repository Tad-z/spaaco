/**
 * The run report TLS reviews before any commit (their §7.1): counts, every
 * record skipped and why, the fields filled on existing people, converted
 * inline images, missing media and unmapped categories. Written as JSON and
 * summarised on the console.
 *
 * It names staff, so it is kept with the export, outside the repository.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Redirect } from './redirects.js';

type Outcome = 'create' | 'update' | 'merge' | 'skip' | 'failed';

const counts = (): Record<Outcome, number> => ({
  create: 0,
  update: 0,
  merge: 0,
  skip: 0,
  failed: 0,
});

export function newReport(
  mode: 'dry-run' | 'commit',
  apiUrl: string,
  authorsOnly = false,
  bylinesOnly = false
) {
  return {
    run: { at: new Date().toISOString(), mode, apiUrl, authorsOnly, bylinesOnly },
    gates: { peoplePendingReview: 0, categoriesWithoutMapTo: 0 },
    counts: { people: counts(), insights: counts() },
    people: {
      skipped: [] as { slug: string; name: string; position: string; reason: string }[],
      pendingReview: [] as { slug: string; name: string }[],
      merged: [] as { slug: string; into: string; fields: string[] }[],
      nameWarnings: [] as { slug: string; name: string; note: string }[],
      unmatchedPracticeAreas: [] as { slug: string; title: string }[],
      rejectedLinkedin: [] as { slug: string; value: string }[],
    },
    insights: {
      inlineImages: [] as { slug: string; images: number }[],
      pdfWrappers: [] as string[],
      renamedSlugs: [] as { from: string; to: string; reason: string }[],
      categoriesWithoutMapTo: [] as { name: string; posts: number }[],
      invalidMapTo: [] as { category: string; value: string }[],
      defaultedToArticles: 0,
      truncated: [] as { slug: string; field: string }[],
      droppedShortcodes: [] as { slug: string; shortcodes: string[] }[],
      embedsAsLinks: [] as string[],
      authors: { person: 0, named: 0, firm: 0, namedWriters: {} as Record<string, number> },
      authorsOnly: { patched: 0, unchanged: 0, keptByHand: [] as string[] },
      // ADR-064: old bylines removed, writer photos and co-authors set.
      bylines: {
        bodiesCleaned: 0,
        authorPhotos: 0,
        withCoAuthors: 0,
        coAuthors: 0,
        patched: 0,
        writersWithoutPhoto: {} as Record<string, number>,
      },
    },
    existing: {
      skippedHandMade: [] as { collection: string; slug: string }[],
      editedSinceImport: [] as { collection: string; slug: string }[],
    },
    media: {
      uploads: 0,
      problems: [] as { record: string; path: string; problem: string; detail?: string }[],
    },
    failures: [] as { collection: string; slug: string; error: string }[],
    redirects: 0,
  };
}

export type Report = ReturnType<typeof newReport>;

export function writeReport(dir: string, report: Report, redirects: readonly Redirect[]): string {
  const stamp = report.run.at.replace(/[:.]/g, '-');
  const path = join(dir, `import-report-${stamp}.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  // An --authors-only run sees no article paths, so it must not replace the
  // full redirect list a whole run wrote.
  if (!report.run.authorsOnly && !report.run.bylinesOnly) {
    writeFileSync(join(dir, 'redirects.json'), `${JSON.stringify(redirects, null, 2)}\n`, 'utf8');
  }
  return path;
}

const line = (label: string, value: unknown): void => {
  console.log(`  ${label.padEnd(34)} ${String(value)}`);
};

export function printSummary(report: Report): void {
  const { people, insights, media } = report;

  console.log(`\n=== WordPress import — ${report.run.mode} against ${report.run.apiUrl} ===`);
  for (const [type, c] of Object.entries(report.counts)) {
    console.log(
      `${type.padEnd(9)} create ${String(c.create)} · update ${String(c.update)} · merge ${String(c.merge)} · skip ${String(c.skip)} · failed ${String(c.failed)}`
    );
  }

  console.log('\nPeople');
  line('pending the firm review', people.pendingReview.length);
  line('skipped', people.skipped.length);
  for (const s of people.skipped) console.log(`    - ${s.name} (${s.slug}): ${s.reason}`);
  line('merged into existing records', people.merged.length);
  for (const m of people.merged)
    console.log(`    - ${m.slug} → ${m.into}: ${m.fields.join(', ') || 'nothing empty'}`);
  line('names to check', people.nameWarnings.length);
  line('unmatched practice-area titles', people.unmatchedPracticeAreas.length);
  line('LinkedIn URLs rejected', people.rejectedLinkedin.length);

  console.log('\nInsights');
  line('with inline images (now links)', insights.inlineImages.length);
  line('PDF wrappers (document set)', insights.pdfWrappers.length);
  line('slugs changed (redirected)', insights.renamedSlugs.length);
  line('categories with no map_to', insights.categoriesWithoutMapTo.length);
  line('defaulted to "articles"', insights.defaultedToArticles);
  line('fields truncated', insights.truncated.length);
  line('dropped shortcodes', insights.droppedShortcodes.length);
  line('credited to a profile', insights.authors.person);
  line('credited to a named writer', insights.authors.named);
  line('credited to the firm', insights.authors.firm);
  if (report.run.authorsOnly) {
    const a = insights.authorsOnly;
    line('authors patched', a.patched);
    line('authors already right', a.unchanged);
    line('authors set by hand (kept)', a.keptByHand.length);
  }

  const b = insights.bylines;
  line('old bylines removed from bodies', b.bodiesCleaned);
  line('writer photos set', b.authorPhotos);
  line('articles given co-authors', `${String(b.withCoAuthors)} (${String(b.coAuthors)} people)`);
  const noPhoto = Object.entries(b.writersWithoutPhoto);
  line('writers with no photo found', noPhoto.length);
  for (const [name, count] of noPhoto.slice(0, 15)) console.log(`    - ${name} (${String(count)})`);
  if (report.run.bylinesOnly) line('articles patched', b.patched);

  console.log('\nMedia');
  line('files to upload / uploaded', media.uploads);
  line('missing or unusable files', media.problems.length);
  for (const p of media.problems.slice(0, 15))
    console.log(`    - ${p.record}: ${p.path} (${p.problem})`);
  if (media.problems.length > 15)
    console.log(`    … and ${String(media.problems.length - 15)} more in the report`);

  console.log('\nExisting records');
  line('hand-made slug clashes (skipped)', report.existing.skippedHandMade.length);
  line('edited since import (left alone)', report.existing.editedSinceImport.length);

  line('\nfailures', report.failures.length);
  for (const f of report.failures.slice(0, 15))
    console.log(`    - ${f.collection}/${f.slug}: ${f.error}`);
  line('redirects', report.redirects);
}
