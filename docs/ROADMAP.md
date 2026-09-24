# Roadmap

Work top to bottom. Do one task per session where possible. Tick `[x]` only when every acceptance criterion passes and `npm run check` is green (from task 1.1 onward). Phase 0 exists to unblock the frontend: finish it before anything else.

---

## Phase 0: Contract and mocks (frontend unblock)

- [x] **0.1 Scaffold the TypeScript repo**
  - `package.json`: `"type": "module"`, engines Node ≥ 24, and every script listed in CLAUDE.md.
  - `tsconfig.json` (typecheck src, scripts and tests): `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `module`/`moduleResolution: NodeNext`, `target: ES2023`, `skipLibCheck`.
  - `tsconfig.build.json`: `rootDir: src`, `outDir: dist`, excludes tests.
  - Tooling: tsx (dev and scripts), Vitest (+ `@vitest/coverage-v8`), ESLint flat config with typescript-eslint (`strictTypeChecked`), `no-explicit-any` as an error, and **layer boundary rules** implementing the table in ARCHITECTURE.md (via `eslint-plugin-boundaries` or `import/no-restricted-paths`). Also prettier.
  - `.gitignore`: node_modules, dist, .env*, !.env.example, .uploads, .private-uploads, coverage, CLAUDE.local.md.
  - Create the full folder tree from ARCHITECTURE.md with `.gitkeep`s.
  - **Accept:** `npm run lint`, `npm run typecheck` and `npm test` all pass (an empty suite is allowed); a deliberately bad import (a controller importing a model) fails lint; `npm run build` produces `dist/`.

- [x] **0.2 Write `openapi/openapi.yaml` for all public endpoints and form POSTs**
  - OpenAPI 3.1. Shared schemas go in `components` (Image, Link, PersonSummary, InsightCard, Author, Pagination meta, Error). Every endpoint gets its query params, responses (200/400/404/429), and examples that `$ref` fixture files.
  - Follow `docs/API.md` exactly. Admin endpoints are NOT in scope yet.
  - Add the `types:gen` script (openapi-typescript → `src/types/api.generated.ts`) and `types:check`. Create `src/types/api.ts` with a named alias for every component schema.
  - **Accept:** `npm run spec:lint` passes with zero errors; `npm run types:gen` then `npm run typecheck` pass.

- [x] **0.3 Create fixtures from `docs/SEED_CONTENT.md`**
  - Create `fixtures/responses/*.json`: one per endpoint response, e.g. `site.json`, `pages.home.json`, `people.list.json`, `insights.list.json`, `practice-areas.detail.dispute-resolution.json`, `search.json`, `error.validation.json`.
  - Also create `fixtures/seed/*.json` holding the raw documents per collection (used by the seed in 2.x).
  - Use the real copy. Use placeholder image URLs of the form `https://placehold.co/1440x662?text=<label>`. Missing content gets `[PENDING FROM FIRM]` placeholders.
  - **Accept:** a test validates every response fixture against its schema in the spec (ajv + the spec's components).

- [x] **0.4 Mock server + frontend handoff**
  - `npm run mock` runs Prism on port 4010, serving the spec examples.
  - Write `docs/FRONTEND_HANDOFF.md` covering the mock URL, how to run it, the conventions summary, the known placeholders, and the list of not-yet-designed endpoints.
  - **Accept:** `curl localhost:4010/api/v1/pages/home` returns the home fixture.

## Phase 1: Foundation

- [x] **1.1 Config + logger + errors**
  - `src/config/env.ts` parses `process.env` with Zod and exports a frozen, typed `config`; it fails fast with a readable error. `src/config/constants.ts` holds limits and defaults.
  - `src/core/logger.ts` sets up pino, redacting authorization/cookie/password/cv fields.
  - `src/core/errors.ts` defines AppError plus its subclasses.
  - **Accept:** unit tests cover config parse success and failure, and error serialisation.

- [x] **1.2 App factory + middleware + health**
  - `src/app.ts` exports `createApp`; `src/server.ts` is the entry point. Add the request-id, not-found, error-handler and validate middlewares, plus helmet, a cors allow-list (`CORS_ORIGINS`) and body limits. Create `src/types/express.d.ts` (the typed `req.validated`), `src/routes/index.ts`, and the health route/controller/service.
  - Route through all the layers even for `/health`; it becomes the reference example.
  - **Accept:** integration tests cover health 200, an unknown route returning the 404 error shape, and a malformed JSON body returning 400 `VALIDATION_ERROR`.

- [x] **1.3 Database + test harness**
  - `src/core/db.ts` (connect/disconnect, sensible pool options).
  - `tests/support/`: `setupTestDb()` using mongodb-memory-server, `buildTestApp()` with noop drivers, and `expectToMatchContract(res, method, path)`, which validates a response against `openapi.yaml` using ajv.
  - **Accept:** a sample contract test on `/health` passes, and the helper fails loudly on a deliberately wrong shape.

## Phase 2: Models and seed

- [x] **2.1 Shared interfaces, plugins and sub-schemas:** `interfaces/common.interface.ts` (IContentFields, ILink, IHero, IIconItem, IStat, ISeo), `models/plugins/content.plugin.ts` (slug/status/order/publishedAt/revision/audit fields/toJSON), `models/schemas/common.schemas.ts`, `constants/enums.ts`, and `helpers/slug.helper.ts`.
  - **Accept:** unit tests cover slug generation, collision handling, and toJSON output.
- [x] **2.2 Content interfaces + models:** practiceAreas, people, insights, offices, recognitions, faqs, jobs, and media (each with `interfaces/<resource>.interface.ts` + `models/<resource>.model.ts`), with all indexes from DATA_MODEL.md, plus `scripts/sync-indexes.ts` (`npm run db:sync-indexes`) and `constants/media-refs.ts`.
  - **Accept:** tests prove the validation rules (e.g. a video insight requires videoUrl; a person role must be a valid enum) and that indexes exist.
- [x] **2.3 Singletons:** settings and page interfaces + models, plus one Zod schema per page key in `validators/pages/<key>.validator.ts` (with an index mapping key → schema).
  - **Accept:** an invalid page section is rejected with a precise error path.
- [x] **2.4 Seed script:** `npm run seed` loads `fixtures/seed/*`, upserting by slug/key. It's idempotent (running it twice changes nothing), refuses to run when `NODE_ENV=production`, and creates media docs for placeholder images (dev/staging only; real images are uploaded by the firm through the admin UI).
  - **Accept:** a test runs the seed twice against the memory DB and asserts the counts are stable.

## Phase 3: Public read API

- [x] **3.1 Serializers:** `serializers/image.serializer.ts` (sizes), person (PersonSummary), insight (InsightCard: chips + author block + CTA type), and enum labels. The return types are aliases from `types/api.ts`.
  - **Accept:** the serializers compile against the generated types; unit tests in `tests/unit/serializers/` validate their output with ajv.
- [x] **3.2 `/site`:** settings + nav + footer + FAQ section, cached.
  - **Accept:** a contract test passes, and a draft FAQ is excluded.
- [x] **3.3 Collection endpoints:** practice-areas, offices, faqs, jobs (list + detail).
  - **Accept:** contract tests pass; 404 on an unknown slug; drafts excluded; closed/expired jobs excluded.
- [x] **3.4 `/people`:** role filter, sorts, pagination, and the detail endpoint with related insights.
  - **Accept:** seniority order is correct; filter + pagination meta is correct; an invalid role returns 400.
- [x] **3.5 `/insights`:** category and practiceArea filters, sorts, pagination, and the detail endpoint. The author is either the firm or a person.
  - **Accept:** a firm-authored insight returns the firm author block; a video insight carries `cta.kind` for Watch Video.
- [x] **3.6 `/pages/:key`:** all 8 composers, computed stats, preview mode.
  - **Accept:** the seeded output of every page deep-equals its fixture (ignoring ids/timestamps); preview shows drafts only with a valid admin token.
- [x] **3.7 `/search`:** text indexes across 3 collections, 5 results per group, published only.
  - **Accept:** a query of fewer than 2 chars returns 400; results are ranked by text score.
- [x] **3.8 Caching:** `core/cache.ts` (LRU), `middlewares/cache-headers.middleware.ts` (Cache-Control + ETag), `constants/cache-tags.ts`, and `services/cache.service.ts` (invalidate + revalidate).
  - **Accept:** a second request hits the cache (asserted via a spy), and `If-None-Match` returns 304.

## Phase 4: Admin auth and RBAC

- [x] **4.1 Spec first:** add the admin auth + users + audit endpoints to `openapi.yaml`.
- [x] **4.2 Users + `scripts/create-admin.ts`:** a CLI that prompts for email/password and creates the first admin.
- [x] **4.3 Login/refresh/logout/me:** rotating refresh tokens, lockout, rate limits.
  - **Accept:** tests cover rotation, reuse detection revoking the chain, and lockout after 10 failures.
- [x] **4.4 TOTP 2FA:** setup/enable, and enforced on all admin routes.
  - **Accept:** an admin route without 2FA enabled returns 403 `FORBIDDEN` with code detail `TOTP_REQUIRED`.
- [x] **4.5 `requireRole` + audit log service:** implements the role matrix from API.md.
  - **Accept:** a table-driven test covers every role × area combination.

## Phase 5: Admin content API

- [x] **5.1 Spec first:** add the admin content, pages, settings and media endpoints to the spec.
- [x] **5.2 Generic CRUD factory:** list/get/create/update/delete/publish/unpublish/reorder for a model, plus its schemas. Use it for all 7 content collections. Admin GETs use the editable shape (IDs + `_expanded`); see "Editable shape vs public shape" in API.md.
  - **Accept:** each collection has CRUD tests; publish sets publishedAt once; delete is blocked (409) when the record is referenced; a round-trip test (admin GET → PUT the same body) succeeds unchanged for every collection; a stale `If-Match` returns 409.
- [x] **5.3 Pages + settings: GET (editable shape), PUT (replace) and PATCH (section-level merge)**, validated against the per-key schemas after merge, with `revision` + `If-Match` optimistic locking.
  - **Accept:** PATCHing `hero` leaves every other section byte-identical; an invalid merged result returns 400 with the section path; a stale revision returns 409; a round-trip GET → PUT succeeds for all 8 page keys and for settings.
- [x] **5.4 Media library:** upload, list/search, get with `usedBy`, PATCH metadata, **replace file in place**, and delete (blocked when in use). Includes `services/media.service.ts#findUsages` over the `constants/media-refs.ts` registry, the local driver's sharp-generated sizes, and the Cloudinary driver. Follow "Media lifecycle" in ARCHITECTURE.md.
  - **Accept:** an SVG or a renamed .exe is rejected (415); a missing alt returns 400; replacing a file keeps the ID, changes the URL, deletes the old stored file and invalidates the tags of every entity using it; deleting an in-use image returns 409 listing `usedBy`; a test fails if a model has a Media ref field that isn't in the registry.
- [x] **5.5 HTML sanitisation on write:** an allow-list of tags suitable for legal articles (p, h2–h4, ul/ol/li, a[href], strong, em, blockquote, table basics).
- [x] **5.6 Invalidation + revalidation webhook** on every write.
  - **Accept:** updating a practice area clears the `site`, `page:home` and `page:practice-areas` caches, and the webhook adapter is called with the correct tags.

## Phase 6: Forms and submissions

- [x] **6.1 Spec first** for the admin submission endpoints (the public form POSTs were already specced in 0.2).
- [x] **6.2 Enquiries + messages:** validation, honeypot, Turnstile, rate limit, reference generation, ipHash (SHA-256 with a salt), acknowledgement + notification emails, TTL index.
- [x] **6.3 Applications:** multipart via multer (memory storage, 5 MB), PDF/DOCX magic-byte check, virus scan adapter, private storage, and emails.
- [x] **6.4 Admin submissions endpoints:** list/detail/status update, a signed CV URL (5 min), and audit entries on every detail view and CV access.
- [x] **6.5 Retention job:** a daily job deleting CV files whose application has been TTL-deleted (orphan sweep).
  - **Accept (phase):** tests cover a bot (honeypot) getting 201 with nothing stored; an infected file getting 422; a CV URL for the HR role but 403 for editor; and PII absent from logs (assert on captured logger output).

## Phase 7: Hardening and deployment

- [x] **7.1 Security review:** run the `api-reviewer` agent across `src/`, fix its findings, and run `npm audit`.
- [x] **7.2 Multi-stage Dockerfile (build with tsc, run `dist/`) + `.dockerignore` + GitHub Actions CI running `npm run check` and `npm run build`.**
- [x] **7.3 Sentry integration (optional via env) + graceful shutdown test.**
- [x] **7.4 `docs/RUNBOOK.md`:** deploy, rotate secrets, restore backup, create admin, rerun revalidation.
- [x] **7.5 Launch content loader:** `scripts/load-launch-content.ts` loads the text from `fixtures/seed/*` into an **empty** production database (with no placeholder images, and image fields left empty) so the firm doesn't retype copy. It requires a `--confirm` flag and refuses to run if any content already exists. Everything is created as `draft`, so the firm reviews each item, uploads images through the admin UI, and publishes.
- [x] **7.6 Final contract audit:** every path in the spec has at least one passing contract test (`/contract-check`).
