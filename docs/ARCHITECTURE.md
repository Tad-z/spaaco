# Architecture

## Project structure

```
src/
├── app.ts                        createApp({ config, deps }): builds the Express app; never listens
├── server.ts                     entry: load config, connect DB, listen, graceful shutdown
├── config/
│   ├── env.ts                    zod schema for process.env → frozen, typed `config` (the ONLY reader of process.env)
│   └── constants.ts              pagination defaults, upload limits, rate-limit windows, cache TTLs
├── constants/
│   ├── enums.ts                  roles, insight categories, employment types… each as { values, labels }
│   ├── cache-tags.ts             entity → cache tags map (tagsFor)
│   └── media-refs.ts             registry of every field holding a media ID (findUsages uses it)
├── interfaces/
│   ├── common.interface.ts       ILink, IHero, IIconItem, IStat, IContentFields, ISeo
│   ├── practice-area.interface.ts, person.interface.ts, insight.interface.ts, office.interface.ts,
│   │   recognition.interface.ts, faq.interface.ts, job.interface.ts, media.interface.ts,
│   │   page.interface.ts (one interface per page key), settings.interface.ts,
│   │   enquiry.interface.ts, message.interface.ts, application.interface.ts,
│   │   user.interface.ts, refresh-token.interface.ts, audit-log.interface.ts
│   └── integrations/             IStorageDriver, IMailer, ICaptcha, IVirusScanner, IRevalidator
├── types/
│   ├── api.generated.ts          GENERATED from openapi.yaml; never edit by hand
│   ├── api.ts                    readable aliases: export type PracticeAreaCard = components['schemas']['PracticeAreaCard']
│   ├── express.d.ts              Request augmentation: user, validated, requestId, preview
│   └── common.ts                 Lean<T>, Paginated<T>, Expanded, etc.
├── models/
│   ├── plugins/content.plugin.ts slug, status, order, publishedAt, revision, audit fields, toJSON
│   ├── schemas/common.schemas.ts Link, Hero, IconItem, Stat, Seo sub-schemas
│   └── practice-area.model.ts … one per collection (+ page.model.ts, settings.model.ts, user.model.ts…)
├── validators/
│   ├── common.validator.ts       objectId, slug, pagination, ifMatch header
│   ├── practice-area.validator.ts … listQuery, slugParams, idParams, createBody, updateBody
│   └── pages/home.validator.ts … one per page key (+ index mapping key → schema)
├── services/
│   ├── practice-area.service.ts … public reads + admin writes per resource
│   ├── media.service.ts          upload, replace, findUsages, delete
│   ├── audit.service.ts, auth.service.ts, search.service.ts, cache.service.ts (invalidate + revalidate)
│   └── pages/
│       ├── page.service.ts       getComposedPage, getEditable, put, patch
│       └── composers/home.composer.ts … one per page key
├── serializers/
│   ├── image.serializer.ts       Media → Image (sizes)
│   ├── person.serializer.ts      toSummary, toDetail, toAdmin
│   └── … one per resource
├── controllers/
│   ├── public/practice-area.controller.ts …
│   └── admin/practice-area.controller.ts …
├── routes/
│   ├── index.ts                  mounts /api/v1 (public) and /api/v1/admin
│   ├── public/practice-area.routes.ts …
│   └── admin/practice-area.routes.ts …
├── middlewares/
│   ├── request-id.middleware.ts, rate-limit.middleware.ts, cache-headers.middleware.ts
│   ├── validate.middleware.ts    validate({ body, query, params }) → req.validated (typed)
│   ├── auth.middleware.ts        requireAuth, optionalPreviewAuth
│   ├── require-role.middleware.ts
│   ├── if-match.middleware.ts    requires If-Match on admin PUT/PATCH
│   ├── upload.middleware.ts      multer configs (image, cv)
│   └── not-found.middleware.ts, error-handler.middleware.ts
├── helpers/
│   ├── pagination.helper.ts, slug.helper.ts, published-filter.helper.ts,
│   ├── image-sizes.helper.ts, file-type.helper.ts (magic bytes), sanitize.helper.ts,
│   └── hash.helper.ts, reference.helper.ts (ENQ-7F3K2A), computed-stats.helper.ts
├── core/
│   ├── db.ts                     connect/disconnect
│   ├── logger.ts                 pino with redaction
│   ├── errors.ts                 AppError, NotFoundError, ValidationError, ConflictError…
│   └── cache.ts                  LRU store
├── integrations/
│   ├── storage/{public,private}/ index.ts (factory) + cloudinary.driver.ts | s3.driver.ts | local.driver.ts
│   ├── mailer/                   index.ts + resend.driver.ts | smtp.driver.ts | log.driver.ts
│   ├── captcha/                  index.ts + turnstile.driver.ts | noop.driver.ts
│   ├── virus-scan/               index.ts + clamav.driver.ts | noop.driver.ts
│   └── revalidate/               index.ts + http.driver.ts | noop.driver.ts
├── templates/emails/             enquiry-acknowledgement.ts, enquiry-notification.ts … → { subject, text, html }
└── jobs/
    ├── scheduler.ts
    └── retention-sweep.job.ts
scripts/        seed.ts, create-admin.ts, sync-indexes.ts, load-launch-content.ts
tests/
├── support/    setup-db.ts, build-app.ts, contract.ts (expectToMatchContract), factories.ts, auth.ts
├── unit/       mirrors src/ (unit/helpers/slug.helper.test.ts)
├── integration/public/*.test.ts, integration/admin/*.test.ts
└── contract/   fixtures.test.ts, coverage.test.ts
```

## Layer rules

| Layer       | May import                                                                 | Must not                             |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------ |
| routes      | middlewares, controllers, validators                                       | services, models                     |
| controllers | services, serializers, validators (types), core/errors                     | models, integrations                 |
| services    | models, core, integrations, helpers, constants, interfaces, other services | express types (req/res), serializers |
| serializers | types, interfaces, helpers, constants                                      | models, services, any I/O            |
| models      | interfaces, constants, helpers, models/plugins, models/schemas             | services                             |
| helpers     | types, constants                                                           | anything with I/O                    |
| middlewares | core, services (auth only), helpers, validators                            | models                               |

`models` may import `helpers` so `models/plugins/content.plugin.ts` can call `helpers/slug.helper.ts` rather than keeping a second copy of slug generation (ADR-022). Helpers are pure, so this adds no I/O to the model layer.

These are enforced by an ESLint boundaries rule (configured in task 0.1), so a violation fails `npm run lint`. **Why:** services stay testable without HTTP, serializers stay pure (so the contract is testable in isolation), and any layer can change without rippling through the others.

## One resource across the layers (practice areas)

```
GET /api/v1/practice-areas/:slug
routes/public/practice-area.routes.ts      router.get('/:slug', validate({ params: slugParams }), getPracticeArea)
controllers/public/practice-area.controller.ts
    const { slug } = req.validated.params;
    const doc = await practiceAreaService.getBySlug(slug, { preview: req.preview });
    res.json({ data: practiceAreaSerializer.toDetail(doc) });
services/practice-area.service.ts          PracticeArea.findOne({ slug, ...publishedFilter(preview) })
                                             .populate<{ image: IMedia }>('image').lean<...>() → NotFoundError if null
serializers/practice-area.serializer.ts    toDetail(doc): PracticeAreaDetail   ← type from the OpenAPI spec
models/practice-area.model.ts              new Schema<IPracticeArea>({...}).plugin(contentPlugin)
interfaces/practice-area.interface.ts      export interface IPracticeArea extends IContentFields { title: string; … }
validators/practice-area.validator.ts      export const slugParams = z.object({ slug: slugSchema })
```

## Request flow

```
request
  → request-id → pino-http → helmet → cors (allow-list) → json parser (100kb)
  → rate-limit (per route group) → routes/index.ts
      → [admin] requireAuth → requireRole(...) → [PUT/PATCH] ifMatch
      → [public] optionalPreviewAuth (sets req.preview)
      → validate(schemas) → controller → service → model
  → not-found → error-handler
```

## Page composition

`services/pages/page.service.ts#getComposedPage(key, { preview })` loads the page document, then runs **one composer per key** (`services/pages/composers/home.composer.ts`, etc.). Each composer fetches the referenced collections in parallel (`Promise.all`), applies serializers, resolves computed stats, and returns the payload described in API.md.

## Caching and revalidation

- **HTTP:** Cache-Control headers plus an ETag on public GETs (see API.md).
- **In-process:** composed pages and `/site` are memoised in an LRU (`core/cache.ts`, TTL 5 min), keyed by `page:<key>` / `site`. Preview requests bypass the cache.
- **Invalidation:** every successful admin write calls `invalidate(tags)`. That clears the matching LRU keys and calls the revalidate integration, which POSTs `{ tags: [...] }` to `FRONTEND_REVALIDATE_URL` with an `x-revalidate-secret` header. The call is fire-and-forget: failures are logged and never fail the admin request.
- **Tag map:** a practice area write → `site`, `page:home`, `page:practice-areas`, `practice-area:<slug>`. A person → `page:home`, `page:about`, `people`, `person:<slug>`. An insight → `page:home`, `page:insights`, `insights`, `insight:<slug>`. Settings → `site`. A media alt-text edit or file replacement → the tags of every entity returned by `findUsages`. Keep the full map in `constants/cache-tags.ts`.

## Media lifecycle

1. **Upload** (`POST /admin/media`): multer memory storage → magic-byte type check → read dimensions (sharp) → `storage/public.put()` → create the Media doc.
2. **Attach:** the admin UI saves the media ID into a content field. The model's validation checks that the ID exists and is an image.
3. **Serve:** public serializers expand the ID into the Image shape. With the Cloudinary driver, `sizes` are Cloudinary transformation URLs (`w_480`, `w_960`, `w_1440`, with `f_auto,q_auto`) using the focal point as gravity. With the local driver, sharp generates the three widths at upload time and stores them beside the original.
4. **Replace** (`PUT /admin/media/:id/file`): upload the new file under a new key → update the doc (bumping `version`) → delete the old file (failures are logged, never fatal) → `findUsages(id)` → invalidate the cache tags of every referencing entity → audit log.
5. **Delete:** `findUsages(id)` must be empty; then delete the doc and the file.

## Integrations (`src/integrations/`)

Each integration exports a factory (`index.ts`) that returns a driver implementing its interface from `interfaces/integrations/`. The driver is chosen by config, and every integration has a credential-free driver for dev and tests.

| Integration               | Drivers               | Dev/test default                                                   |
| ------------------------- | --------------------- | ------------------------------------------------------------------ |
| `storage/public` (images) | `cloudinary`, `local` | `local` (writes to `./.uploads`, served at `/uploads` in dev only) |
| `storage/private` (CVs)   | `s3`, `local`         | `local` (`./.private-uploads`, never served)                       |
| `mailer`                  | `resend`, `log`       | `log` (logs the recipient and subject, never the body)             |
| `captcha`                 | `turnstile`, `noop`   | `noop` (accepts token `"test"`)                                    |
| `virusScan`               | `clamav`, `noop`      | `noop` (returns `clean`)                                           |
| `revalidate`              | `http`, `noop`        | `noop`                                                             |

## Auth

- **Passwords:** hashed with argon2id (fall back to bcrypt if argon2 fails to build).
- **Access token:** a JWT (HS256, 15 minutes) returned in the JSON body. The frontend keeps it in memory.
- **Refresh token:** random 256-bit, stored hashed in `refreshTokens`, sent as a cookie (`httpOnly`, `Secure`, `SameSite=Strict`, path `/api/v1/admin/auth`). Each refresh rotates the token. Reusing a revoked token revokes the whole chain.
- **TOTP 2FA:** required for all admin users before any non-auth admin route works. Secrets are encrypted at rest with `ENCRYPTION_KEY`.
- **Brute force:** login is rate-limited (5 per 15 minutes per IP+email), and an account locks after 10 failures.

## Email

Notifications for enquiries/messages go to `NOTIFY_ENQUIRIES_TO` (and for applications, `NOTIFY_APPLICATIONS_TO`). They contain **no personal details or matter content**: only a reference, the form type, and a link to the admin dashboard. The submitter gets an acknowledgement quoting their reference. Templates live in `src/templates/emails/` as typed functions returning `{ subject, text, html }`.

## Environments and deployment

- **Environments:** `development` (local Mongo or Docker), `test` (mongodb-memory-server), `staging`, `production`.
- **Build:** a multi-stage Dockerfile: stage 1 runs `npm ci` and `npm run build`; stage 2 (node:24-alpine, non-root user) copies `dist/` and runs `npm ci --omit=dev`. Health check on `/api/v1/health`.
- **CI** (GitHub Actions): `npm ci` → `npm run check` on every PR; build the image on main.
- **Error tracking:** Sentry (`SENTRY_DSN` optional; skipped if unset).
- **Backups:** Atlas continuous backup (production). Document restore steps in `docs/RUNBOOK.md` in Phase 7.
