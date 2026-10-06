# WordPress import

A one-off migration of the old WordPress site's attorneys and articles into this backend. It follows TLS Services' migration spec (v1.0), as amended by our gap review and their response of 5 October 2026. Where the three disagree, the response wins. The code-level decision is ADR-059.

It writes **through the admin API**, never straight to MongoDB. That way every record gets the same validation, sanitising, media pipeline, audit entries and cache invalidation as a hand edit.

## What it does

| Source                | Result                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `people.json`         | People marked `current` in `people-review.csv`, with a role on the ladder, are created as **drafts** for the firm to approve. The people already in the backend are **merged**: only their empty fields are filled, and nothing is overwritten. They get no `legacy` tag, so a rollback can never delete them.                                                                               |
| `posts.json`          | Articles are created and **published**, keeping their original date. Categories and practice areas come from the firm's `map_to` in `categories.json`; an article that maps to nothing goes under `articles`. Inline images become links. Links to old uploads are pointed at the media library. An article that only wraps one firm-hosted PDF also gets it as its "Read Article" document. |
| `practice-areas.json` | Nothing is imported. The 9 old pages only produce redirects (`maps.ts`).                                                                                                                                                                                                                                                                                                                     |
| `uploads-export.zip`  | Unzipped, it supplies every photo, cover and linked file. Each file is uploaded once; `state.<host>.json` remembers it across runs.                                                                                                                                                                                                                                                          |

Every decision (practice-area titles, the two renamed people, the role ladder, shortcodes) is data in `maps.ts`.

## Setup

1. Put the export folder **outside git**. In this repo, `database-extract/` is in `.gitignore`, which also keeps it out of lint and format checks. It holds staff personal data (NDPA 2023).
2. Unzip `uploads-export.zip` in place, so the year folders sit at `<data>/uploads/2016`, `<data>/uploads/2017` and so on. Alternatively, pass `--uploads`.
3. Have an **admin** account on the target API. Only the `admin` role may send `legacyImport`.

## Running it

```bash
# Dry run (the default): reads the API, writes nothing, uploads nothing.
API_URL=https://staging.example ADMIN_PASSWORD=… \
  npm run import:wordpress -- --data ./database-extract/database-extract

# Try a few first
… -- --data … --limit 20 --only people

# Write
… -- --data … --commit
```

| Flag                 | Meaning                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--data`             | The folder with `people.json`, `posts.json`, `categories/`, `people-review/`. Required.                                           |
| `--uploads`          | The unzipped uploads. Defaults to `<data>/uploads`.                                                                               |
| `--report-dir`       | Where reports, `redirects.json` and run state go. Defaults to `<data>/../import-runs`.                                            |
| `--only`             | `people`, `insights` or both (the default). Articles credit authors from the people step.                                         |
| `--limit N`          | The first N people and the first N articles.                                                                                      |
| `--commit`           | Write. Without it, nothing changes.                                                                                               |
| `--publish-people`   | Publish newly created people instead of leaving them as drafts. Existing people keep their status.                                |
| `--authors-only`     | Only set the author on imported articles, from their bylines (ADR-060). Touches no other field, and keeps any author set by hand. |
| `--overwrite-edited` | Also update imported records that someone has edited since the last run. Off by default.                                          |

`API_URL` is never defaulted. `ADMIN_USERNAME` defaults to `admin`.

### Safety built in

- **Gates.** `--commit` refuses while any row of `people-review.csv` has no status or any category has no `map_to`. A person the sheet cannot be matched to is never committed. Two rows sharing a name need the `slug` column.
- **Idempotent.** A re-run updates its own records and re-uploads nothing. Run state lives in `state.<api host>.json`; keep it between runs against the same API.
- **The firm's edits are safe.** A re-run leaves alone any imported record whose revision has moved since the import last wrote it, and reports it.
- **Hand-made content is safe.** An article slug that exists without `legacy` is skipped, and only empty fields are filled on existing people.
- **Fails soft.** A bad record is reported and the run continues.

## What to send TLS

After each run, `<report-dir>` holds:

- `import-report-<time>.json`: counts, skipped people and why, fields filled on existing people, articles with converted inline images, PDF wrappers, renamed slugs, missing media, unmapped categories and failures (their §7.1).
- `redirects.json`: old article permalinks (`/YYYY/MM/DD/slug`), the two renamed people and the old practice-area pages, ready for `next.config` redirects.

The report names staff, so send it through the project's restricted folder, not chat.

## Known gaps in the export (5 Oct 2026)

- **Slugs:** 46 article slugs break the backend's slug rules (over 140 characters or underscores). They are shortened, and the old URL redirects. Two posts are the same article published twice (`…-lmdc` and `…-lmdc-2`); they collide after shortening, so the second fails for the firm to resolve.
- **Bodies over the limit:** two article bodies exceed the 50,000-character rich-text limit, including the full text of CAMA 2020. They fail and are reported; uploading them as PDFs is the likely fix.
- **Missing files:** two 2026 PDFs are not in the zip. Their links are left as they are and reported.

## Run order (TLS gates)

1. **Dry run** locally or against staging, then send the report to TLS.
2. **Staging `--commit`** once O1 (statuses), O2 (`map_to`), O4 (frontend `trainee_associate`) and O5 (staging DB) are done and TLS has reviewed the report.
3. **Production `--commit`** once the staging checks pass, O3 is decided, production is backed up and TLS approves the date.

## Rollback

```js
// Every imported record. Merged people carry no `legacy`, so they are untouched.
db.people.deleteMany({ 'legacy.source': 'wordpress' });
db.insights.deleteMany({ 'legacy.source': 'wordpress' });
```

Fields filled on existing people are listed per person in the report (`people.merged`), so they can be cleared by hand. The media the import uploaded are listed in `state.<host>.json`; delete them through `DELETE /admin/media/{id}` once nothing references them. The full fallback is the backup taken before the production run.
