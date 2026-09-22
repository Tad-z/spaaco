# SPA Ajibade & Co. — Website Backend API

Backend for the marketing website of SPA Ajibade & Co., a Nigerian law firm (founded 1967; offices in Lagos, Abuja, Ibadan). Almost all website content (pages, practice areas, attorneys, insights, jobs, offices, FAQs, awards, images) is served from this API and edited by the firm through an admin API. It also receives three forms: mandate enquiries, messages to the firm, and job applications with CV upload.

**This repo is API only.** A separate frontend team builds the public site AND the admin dashboard. Never build HTML views, templates, or admin UI here.

## Golden rules

1. **Contract first.** `openapi/openapi.yaml` is the source of truth. To add or change an endpoint: update the spec and fixtures, run `npm run types:gen`, then write the code. Never change an existing response shape without an entry in `docs/DECISIONS.md`, because it breaks the frontend.
2. **Never invent firm content.** Real copy lives in `docs/SEED_CONTENT.md`. Use `[PENDING FROM FIRM]` placeholders for anything missing.
3. **Public endpoints return published content only**, unless a valid admin preview token is present.
4. **Personal data is sensitive** (Nigeria Data Protection Act 2023). Follow `.claude/rules/submissions.md`.
5. **Respect the layers** (below). A controller that imports a model, or a serializer that queries the DB, is a bug.
6. **One roadmap task at a time**, in order, from `docs/ROADMAP.md`.

## Stack

- Node.js 24 LTS, **TypeScript** (strict), ES modules, `module`/`moduleResolution: NodeNext`
- Express 5, Mongoose on MongoDB (Atlas in staging/production), Zod for validation and env config
- pino, helmet, cors, express-rate-limit, sharp (image sizes), multer (uploads)
- Vitest + Supertest + mongodb-memory-server for tests
- tsx for dev and scripts; tsc for type checking and the production build
- openapi-typescript (types generated from the spec), Prism (mock server), Redocly CLI (spec lint)

## Commands

```bash
npm run dev          # tsx watch src/server.ts
npm run build        # tsc -p tsconfig.build.json → dist/
npm start            # node dist/server.js
npm test             # vitest run (unit + integration + contract)
npm run test:watch
npm run typecheck    # tsc --noEmit
npm run lint         # eslint (typescript-eslint + layer boundary rules)
npm run format       # prettier --write
npm run types:gen    # openapi.yaml → src/types/api.generated.ts
npm run types:check  # fails if api.generated.ts is out of date with the spec
npm run seed         # idempotent dev/staging seed from fixtures/seed
npm run mock         # Prism mock of openapi.yaml on :4010
npm run spec:lint    # validate openapi.yaml
npm run check        # lint + typecheck + spec:lint + types:check + test (run before calling anything done)
```

## Project structure (full detail: `docs/ARCHITECTURE.md`)

```
src/
  app.ts  server.ts
  config/        env.ts (zod-validated, typed `config`), constants.ts (limits, defaults)
  constants/     enums.ts, cache-tags.ts, media-refs.ts
  interfaces/    domain + integration interfaces: practice-area.interface.ts → IPracticeArea
  types/         api.generated.ts (never edit), api.ts (aliases), express.d.ts, common.ts
  models/        <resource>.model.ts, plugins/, schemas/ (shared sub-schemas)
  validators/    <resource>.validator.ts: zod schemas for body/query/params
  services/      <resource>.service.ts: business logic + DB access; pages/composers/
  serializers/   <resource>.serializer.ts: DB doc → API shape (toSummary/toDetail/toAdmin)
  controllers/   public/<resource>.controller.ts, admin/<resource>.controller.ts
  routes/        index.ts, public/<resource>.routes.ts, admin/<resource>.routes.ts
  middlewares/   <name>.middleware.ts: auth, require-role, validate, if-match, errors…
  helpers/       <name>.helper.ts: small pure functions (pagination, slug, image sizes…)
  core/          db.ts, logger.ts, errors.ts, cache.ts
  integrations/  storage/, mailer/, captcha/, virus-scan/, revalidate/ (adapter + drivers)
  templates/     emails/
  jobs/          scheduled jobs (retention sweep)
scripts/         seed.ts, create-admin.ts, sync-indexes.ts, load-launch-content.ts
tests/           support/, unit/ (mirrors src), integration/public|admin/, contract/
```

## Layer rules (enforced by ESLint boundaries)

`routes → middlewares, controllers` · `controllers → services, serializers, validators` · `services → models, core, integrations, helpers, constants` · `serializers → types, interfaces, helpers, constants` (no DB) · `models → interfaces, constants, models/plugins|schemas` · `helpers → types, constants` only.
Nothing imports from `routes/` or `controllers/`. There are no barrel files except `routes/index.ts`.

## TypeScript conventions

- `strict` and `noUncheckedIndexedAccess` are on. `any` is banned (use `unknown` and narrow). No `!` non-null assertions outside tests.
- Relative imports end in `.js` (NodeNext): `import { slugify } from '../helpers/slug.helper.js'`.
- Use `import type` for type-only imports (`verbatimModuleSyntax` is on).
- Request types come from Zod: `type ListPeopleQuery = z.infer<typeof listPeopleQuery>`.
- Response types come from the spec: serializers return `components['schemas'][...]` aliases from `types/api.ts`. If a serializer doesn't compile, the contract is broken.
- Domain interfaces use an `I` prefix (`IPerson`); ObjectId references are typed `Types.ObjectId`.
- File names: kebab-case plus a role suffix (`practice-area.service.ts`, `auth.middleware.ts`, `slug.helper.ts`). Named exports only.

## Code conventions

- Controllers are thin: read `req.validated` → call the service → `res.json({ data })`. Services hold the logic.
- Throw `AppError` subclasses from `core/errors.ts`. Only the error middleware shapes error JSON.
- Responses: `{ data }`, plus `meta` for lists. Errors: `{ error: { code, message, details? } }` (see `docs/API.md`).
- Admin GETs return the **editable shape** (IDs plus `_expanded` previews); public GETs return the **composed shape**. An admin GET body must be a valid PUT body.
- Every field that holds a media ID is registered in `constants/media-refs.ts`.
- Reads use `.lean<T>()` with explicit projections. Use `logger` from `core/logger.ts`, never `console.log`, and never log form request bodies.
- External services are reached only through `integrations/`, and each has a credential-free local/noop driver.

## Security musts

- No secrets in code, fixtures or tests. Don't read or edit `.env`; add new vars to `.env.example` and `config/env.ts`.
- Rich text is sanitised on write (`helpers/sanitize.helper.ts`). Admin routes use `requireAuth` then `requireRole(...)`; deny by default.
- CV files are never public: only short-lived signed URLs from admin endpoints, and every access is audit-logged.

## Testing

Tests must stay fast enough to run constantly. Cover each behaviour **once, in the cheapest place that proves it** — breadth of duplicated coverage slows every future task without catching more.

- Every endpoint gets an integration test (Supertest + in-memory MongoDB) with `expectToMatchContract(...)`.
- **Per endpoint, cover exactly:** the happy path with a contract assertion, one validation error (400), and not-found (404) where the endpoint can 404. Nothing more unless the endpoint has genuinely distinct logic worth pinning.
- **Draft exclusion:** tested **once per public resource**, not per endpoint.
- **Role enforcement:** tested **only** in the one table-driven test at `tests/integration/admin/roles.test.ts`, covering every admin route × role against the matrix in `docs/API.md`. Never re-test 401/403 in a resource's own test file.
- **Generic CRUD factory:** tested thoroughly once, in its own test. Each content collection then needs a single admin smoke test: create → update with `If-Match` → publish → public read.
- Unit-test helpers, serializers and anything with branching logic that an integration test would reach only indirectly.
- **While working a task**, run only the tests for files you touched, plus `npm run lint` and `npm run typecheck`:
  ```bash
  npx vitest run tests/integration/public/people.test.ts
  npm run lint && npm run typecheck
  ```
- Run the full `npm run check` **at the end of each phase**, not per task.

## Workflow

- Start with `/next-task` (or read the next unchecked task in `docs/ROADMAP.md`). Use plan mode for changes touching more than 2 files.
- For a new resource across all layers, use `/new-resource`. When ambiguous, check the open questions in `docs/DECISIONS.md`, then ask.
- While working: run only the touched tests plus `npm run lint` and `npm run typecheck`. Save the full `npm run check` for the end of the phase.
- When done: tick the roadmap box, add a line to `docs/PROGRESS.md`, log any new decision, and commit with a Conventional Commit (`feat(people): add directory filters`). Never push.
- **Reviews:** run the `api-reviewer` agent at the end of **Phases 3, 5, 6 and 7** only, over that phase's commits. Fix every blocker and major finding, re-run `npm run check`, and commit the fixes before starting the next phase.

## Docs map (read the one you need)

- `docs/PROJECT_BRIEF.md`: the site, pages, sections, and how content is managed
- `docs/API.md`: conventions and the endpoint catalogue
- `docs/DATA_MODEL.md`: collections, fields, indexes
- `docs/ARCHITECTURE.md`: structure, layers, request flow, media lifecycle, caching, auth
- `docs/ROADMAP.md`: tasks and acceptance criteria
- `docs/SEED_CONTENT.md`: real copy from the designs
- `docs/DECISIONS.md`: ADRs, content conflicts, open questions
