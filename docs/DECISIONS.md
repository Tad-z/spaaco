# Decisions

Append new entries at the bottom of each section. Never rewrite history; supersede instead ("Superseded by ADR-014").

## Architecture Decision Records

**ADR-001: Hand-built API on Node.js + Express + MongoDB.** No headless CMS. We own the admin API; the frontend team owns all UI, including the admin dashboard.

**ADR-002: JavaScript (ESM), not TypeScript.** _Superseded by ADR-017._ Correction: this was recorded as "the team's preference", but it was an assumption made while drafting the kit, not a stated preference.

**ADR-003: Spec-first contract.** `openapi/openapi.yaml` is hand-authored before the implementation so the frontend can start on day one against a Prism mock. Code is verified against it by contract tests. We don't generate the spec from code.

**ADR-004: Typed page singletons, not a block/page builder.** The designs are fixed, so each page key has its own validated shape. Editors can change content but not layout, and the frontend gets predictable payloads.

**ADR-005: Reference shared entities, embed owned ones.** See DATA_MODEL.md. Composed page endpoints embed the referenced data so each page needs one request.

**ADR-006: Rich text is stored and served as sanitised HTML.** It's simple for a React/Next frontend to render, and sanitisation happens on write.

**ADR-007: All external services sit behind adapters with credential-free defaults.** This covers email, storage, captcha, virus scan and revalidation, so everything runs locally and in CI with no secrets.

**ADR-008: Admin auth uses a short JWT access token in the body plus a rotating httpOnly refresh cookie, and TOTP is mandatory.**

**ADR-009: Figures that can be derived are computed.** Years since founding and office count are computed so they never go stale. Other stats stay manual.

**ADR-010: Form notification emails contain no personal data.** They carry only the reference and a dashboard link. This is for NDPA 2023 data minimisation.

**ADR-011: Content images are managed only through the admin UI.** There's no Figma export or asset seeding. Dev/staging use placeholders; the firm uploads the real images.

**ADR-012: The logo, icons and decorative graphics are frontend assets.** They're removed from `settings` and page sections. Icon fields store keys.

**ADR-013: Media files can be replaced in place** (`PUT /admin/media/:id/file`). The ID is stable and the URL changes. Usages are found through the `constants/media-refs.ts` registry, not by storing back-references.

**ADR-014: Admin reads return the editable shape (IDs + `_expanded` previews); public reads return the composed shape.** An admin GET body is always a valid PUT body.

**ADR-015: Pages and settings support section-level PATCH, and all admin writes use optimistic locking** (`revision` + `If-Match`, 409 on conflict).

**ADR-016: SVG uploads are rejected** (they can carry scripts). Badges are uploaded as PNG.

**ADR-017: TypeScript (strict) replaces JavaScript.** Why: the type checker gives fast feedback on AI-written code; response types generated from `openapi.yaml` make the contract a compile-time check in serializers (and the frontend can reuse the same generated types); refactors across ~60 endpoints stay safe; and Zod schemas give request types for free. Tooling: tsx for dev, tsc for build and typecheck, Vitest instead of Jest (native TS/ESM support). Known friction: Mongoose typing around populate and lean, handled with explicit generics at the call site.

**ADR-018: Layered folder structure** (models, interfaces, validators, services, serializers, controllers, routes, middlewares, helpers, core, integrations), replacing the earlier per-feature `modules/` layout, at the project lead's request. Import direction between layers is enforced by ESLint so the layers stay clean as the codebase grows. Resources are named consistently across layers (`practice-area.model.ts`, `practice-area.service.ts`, …), so each resource is still easy to trace end to end.

**ADR-019: The `/api/v1` prefix lives in the spec's path keys, not only in `servers`.** Prism ignores a base path in the server URL and mounts operations at the bare path, so `curl localhost:4010/api/v1/pages/home` returned 404 while `/pages/home` worked, and the mock URLs would not have matched the real ones. Prism has no base-path flag. Paths are therefore written `/api/v1/pages/{key}` and `servers` holds bare origins. The spec now documents absolute URLs, and contract tests refer to paths the same way the frontend calls them. Express still mounts one router at `/api/v1`.

**ADR-020: Offices expose `coordinates: { lat, lng }`, not raw GeoJSON.** Stored as a GeoJSON Point with a `2dsphere` index, as DATA_MODEL says, but serialised to `{ lat, lng }` because that is what a map component takes; `[lng, lat]` ordering is a familiar source of frontend bugs. Null until the firm supplies real coordinates.

**ADR-021: Multipart `consent` is the string `"true"`, not a boolean.** Multipart form fields have no types, so the job application form sends `"true"` and the server coerces it. The two JSON forms keep a real `consent: true` literal. The spec states this explicitly on the field rather than leaving the frontend to discover it.

**ADR-022: `models` may import `helpers`.** `models/plugins/content.plugin.ts` generates slugs on save, and `helpers/slug.helper.ts` owns slug generation (ROADMAP 2.1 asks for both). The layer table originally forbade the import, which would have forced a duplicate copy of the logic inside `models/`. Helpers are pure functions with no I/O, so allowing this adds no dependency the model layer shouldn't have. The table in ARCHITECTURE.md and the ESLint zone are updated together.

**ADR-023: `seo` exists only where the data model has it.** Pages keep `seo { title, description, ogImage }`; practice areas keep `seo { title, description }` and get a `SeoBasic` schema without `ogImage`; people and insights carry no `seo` at all. The spec had briefly required a full `Seo` on `PersonDetail`, `InsightDetail` and `PracticeAreaDetail`, which DATA_MODEL.md does not define — the admin editable shape could never have round-tripped into it, and it would have added three more media-ID fields to register in `constants/media-refs.ts`.

**ADR-024: `role` is a group filter, and `partner` includes the managing partner.** The designs give the directory a "Partners" tab and no Managing Partner tab, so filtering strictly by the stored role would drop the Managing Partner out of the tab that names him (DECISIONS Q3 says he belongs there). The query parameter takes its own `PersonRoleFilter` enum, documented as group semantics; each result still reports its own `role`, so a person returned under `partner` may come back as `managing_partner`.

**ADR-025: `practiceAreas.homeOrder` is a real field.** The Home tab bar order (Corporate, Data Privacy, Energy, Dispute Resolution, …) differs from the Practice Areas page order, so `order` alone cannot express both. SEED_CONTENT.md allowed for this; it is now in DATA_MODEL.md so task 2.2 builds it.

**ADR-026: `FILE_REJECTED` (422) is distinct from `VALIDATION_ERROR` (400).** A CV that fails the virus scan is not a field-level validation problem, and the frontend should be able to tell the two apart without inspecting the status code.

**ADR-027: `Image.focalPoint` is always present.** The media model defaults it to `0.5/0.5`, so there is no case where it is absent. Making it required rather than optional is the only optionality difference this spec had, and it saves every consumer an optional-chain.

**ADR-028: `home.aboutFirm` has no image.** It briefly carried one, which contradicted ADR-012 and the "Image ownership" section of DATA_MODEL.md: the world-map backdrop is a frontend asset. Shipping it would have given the firm a required upload slot for an asset they do not own, and removing it later would have been a breaking change.

**ADR-029: Testing scope and speed.** _(Requested as ADR-019; that number was already used for the `/api/v1` path prefix and is referenced from commit messages and PROGRESS.md, so this takes the next free number rather than renumbering history.)_

The suite was slowing every task, so coverage is now proved **once, in the cheapest place that proves it**:

- **Per endpoint:** happy path with a contract assertion, one 400, and a 404 where applicable. Nothing more unless the endpoint has genuinely distinct logic.
- **Draft exclusion:** once per public resource, not per endpoint.
- **Role enforcement:** only in `tests/integration/admin/roles.test.ts`, one table-driven test over every admin route × role. Never repeated in a resource's own file.
- **Generic CRUD factory:** tested thoroughly once; each collection then gets a single admin smoke test (create → update with `If-Match` → publish → public read).
- **During a task** only the touched tests run, plus `lint` and `typecheck`. The full `npm run check` runs at the end of each phase.
- **The `api-reviewer` agent** runs at the end of Phases 3, 5, 6 and 7 only.

Mechanically, one mongod now starts in `globalSetup` for the whole run instead of one per test file, with each Vitest worker using its own database on it and `afterEach` clearing collections (never dropping, which would drop indexes). The layer-boundary probes were also folded into a single ESLint run, since constructing a type-aware ESLint instance was the slowest operation in the suite.

**The risk we are accepting:** narrower coverage can miss a regression that duplicated tests would have caught twice. The mitigation is that the central tests must genuinely cover what the per-resource tests no longer do — so a role or draft check may only be deleted from a resource file once `roles.test.ts` or that resource's single draft test demonstrably covers it.

**ADR-030: Responsive image `sizes` are stored on the Media record, not derived at read time.** _(Amended in Phase 5: `helpers/image-sizes.helper.ts` was deleted. Each storage driver now builds its own sizes, because only the driver knows whether they are files or URLs — see the `IPublicStorage` interface. The focal-point consequence is implemented: `PATCH /admin/media/:id` calls `storage.resize()`, which rebuilds the Cloudinary URLs with `g_xy_center` and returns `undefined` for the local driver, whose widths are uncropped files.)_ How the three widths are formed depends on where the file lives: the local driver writes three files beside the original, Cloudinary expresses them as URL transformations, and the dev seed points all three at placehold.co. A serializer cannot tell which rule applies from the URL alone, so whatever creates the record writes the answer. `helpers/image-sizes.helper.ts` builds them per provider at upload time. The one consequence to remember: Cloudinary sizes embed the focal point as gravity, so changing `focalPoint` must rebuild them (handled with the media PATCH in Phase 5).

**ADR-031: Populated references are filtered to published documents too.** `publishedFilter` constrains only the document being fetched, so a published insight was pulling in its author and practice areas regardless of their status — a draft attorney's name, slug and photo were reachable on `/insights`, `/pages/home`, `/pages/insights` and `/search` with no token at all. `helpers/published-filter.helper.ts#publishedPopulate` now wraps every populate of a _content_ collection (author, practiceAreas, contacts, office, practiceArea, story.quotePerson). Media is exempt, having no status. Mongoose nulls a non-matching single reference and drops it from an array, which the serializers already handle: a draft author falls back to the firm block rather than removing the card.

**ADR-032: Cache tags err towards clearing too much.** The tag map originally listed only the surfaces where an entity is the _subject_. But a practice area also appears as a chip on insight cards and a job card, and is counted by an About stat; an attorney appears in every insight card's author block; an office appears in a job's location chip. Each write now clears every surface that embeds the entity. A stale page is a visible bug the firm reports; an extra cache miss costs milliseconds.

**ADR-033: Admin content paths carry a `/content/` segment, and the spec lists all seven collections explicitly.** _(Revised: the first version of this ADR used a single generic `/admin/content/{collection}` path with a `oneOf` response. The project lead asked for explicit paths so the dashboard gets concrete types.)_

Two parts:

1. **The `/content/` segment.** Without it, `/admin/{collection}` is genuinely ambiguous with `/admin/settings`, `/admin/pages/{key}` and `/admin/media/{id}`: correctness would depend on Express route registration order, any future admin singleton could silently collide with a collection name, and Redocly flags the ambiguity. `docs/API.md` is updated to match.

2. **Explicit paths, generated.** Each collection has its own paths, its own `<Name>Create` and `<Name>Update` request schemas, and `<Name>Admin` as its response — 56 operations, no unions, so the dashboard never has to narrow a response by hand. Writing those by hand would guarantee they drift, so `scripts/generate-admin-content-spec.ts` produces them (and their example fixtures) from one template, keyed off the hand-written `<Name>Admin` schemas. The write schemas are _derived_ from the read schema by dropping the server-owned fields, which is what makes "an admin GET body is a valid PUT body" true by construction rather than by discipline. Run with `npm run spec:gen`.

The implementation is unchanged: one generic CRUD factory still serves all seven collections behind those paths. `AdminCollection` moved out of the contract into `constants/content-collections.ts`, since it is now an implementation grouping rather than something the API describes.

**ADR-034: Two guardrails against the failure modes that keep recurring.**

Three of the worst defects in this build were of two kinds: a route that was not guarded the way the matrix said (the `router.use(requireRole('admin'))` that applied to the whole `/admin` mount), and a draft that escaped through a path nobody had thought to test (drafts reachable through populated references). Both were found by luck — a test written for another purpose — rather than by design. So each now has a test that cannot be forgotten:

- **Route inventory** (`tests/integration/admin/roles.test.ts`): the list of admin routes is _derived from the Express router stack_, not hand-maintained. Every route must have an explicit role guard and an entry in the matrix, so adding an unguarded route fails the suite instead of shipping.
- **Draft canary** (`tests/integration/public/draft-canary.test.ts`): a draft of every content collection, a media item nothing published references, and a draft attorney who _is_ the author of a published insight, all carrying one unique string. Every public GET path in `openapi.yaml` is called — anonymously and with an unauthenticated `preview=true` — and the canary must appear in no response body. Media has no draft state of its own, so it is covered by reachability instead: if it surfaces, something unpublished carried it there.

  Both guardrails were checked against a deliberately broken build before being trusted: removing `requireRole('admin')` from one route, and publishing one canary item, each fail the suite. That exercise found the inventory's first version too weak — it accepted `requireAuth` as evidence of a role guard, so authentication and authorisation are now asserted separately.

Also: `prettier --check .` runs as part of `npm run check`, since generated files bypass the format-on-edit hook.

**ADR-035: What the Phase 5 review changed.** The full findings are in the review; these are the ones that changed a contract or a rule, recorded so the reasoning is not lost:

1. **A duplicate slug is a 409, not a 500.** `slug` is a writable field, so two records colliding is an editor's ordinary mistake. Nothing mapped MongoDB's E11000, so it reached the generic 500 handler and the dashboard showed "Something went wrong". The error middleware now translates it, naming the field.
2. **A missing `If-Match` answers 428.** The spec already declared `PreconditionRequired` on every locked write, with `VALIDATION_ERROR` as its code; the implementation sent 400. 428 is the honest status — the body is fine, the precondition is absent — and keeping the code makes the enum unchanged.
3. **Media joins optimistic locking.** `MediaAdmin` gains `revision`, and both `PATCH /media/:id` and `PUT /media/:id/file` take `If-Match`. Without it two concurrent replacements each stored a file, both wrote, and both deleted the _original_ — leaving the loser's upload referenced by nothing and deleted by nothing. A lost race now removes the file it just stored.
4. **Media cache tags are keyed by slug, not by the display label.** `MEDIA_REFS` gained `tagField`, because `label` and the tag key coincided only for pages: replacing an image was emitting `practice-area:Tax` where the frontend revalidates `practice-area:tax`, so detail pages stayed stale for ever. The in-process cache could not show this, so the test now asserts the tags sent to the revalidation webhook.
5. **A 5xx never carries its own message.** `core/errors.ts` promised this but the middleware only applied it to non-`AppError` throws, so an `InternalError` quoting an upstream service — "Cloudinary rejected the upload (401)" — reached the client verbatim.
6. **`publishedAt` is not writable, and an empty PATCH is a 400.** Both were divergences from the generated spec: the first let a client backdate an article outside the audited publish action, the second consumed a revision and invalidated caches for a write that changed nothing.
7. **`STORAGE_PUBLIC_DRIVER=local` is refused in production.** The local driver stamps `${API_BASE_URL}/uploads/...` onto records permanently, and `/uploads` is only mounted outside production, so a misconfigured deploy would write URLs that 404 for ever. It now fails at startup.

**ADR-036: Two mail drivers, not three — `resend` and `log`.** The kit listed an `smtp` driver, which would need nodemailer: a mail-transport dependency, its own TLS and auth surface, and a configuration format (`SMTP_URL`) with more ways to be subtly wrong than a bearer key. Resend is an HTTP API, so its driver is one `fetch` and no dependency, and the project brief names Resend rather than SMTP. `MAILER_DRIVER` is now `log | resend`, and `SMTP_URL` is gone from `.env.example`. If the firm's IT prefers their own mail server later, the driver interface is one method and adding it back is an afternoon — that is the point of the adapter.

**ADR-037: What the Phase 6 review changed.** Two of these were blockers, and both were invisible to a passing suite:

1. **The default mail driver was logging every submitter's email address.** `logMailer` wrote `{ to, subject }`, and `to` was not among the redacted paths — so the one driver that runs by default broke the first rule in `.claude/rules/submissions.md`. No test saw it, because every integration test swaps the mailer out, including the two whose whole purpose is proving nothing leaks. The driver now logs the subject and the recipient's _domain_, `to`/`replyTo`/`recipient` joined the redaction list, and the real driver has its own test.
2. **Every S3 CV upload would have been rejected.** `x-amz-acl` was sent but not signed, and SigV4 requires every `x-amz-*` header to be in `SignedHeaders`, so S3 would have answered 403 — meaning no job application could be submitted at all on the only production-safe storage driver. The unit test had hardcoded the three-header signed list, so it pinned the bug; it now derives the signed headers from the headers actually sent, and fails if one goes unsigned.
3. **Production refuses every dev-only driver.** `STORAGE_PRIVATE_DRIVER=local` mounts an unauthenticated file route over the container's disk; `VIRUS_SCAN_DRIVER=noop` calls every CV clean and the dashboard then says so; `MAILER_DRIVER=log` sends nothing at all. ADR-035 had guarded the public image driver and left the three that matter more.
4. **List reads are audited too.** The spec said a list "carries no detail worth attributing", but its rows are the full `EnquiryAdmin` — so `?pageSize=100` disclosed a hundred names, addresses and matter summaries with no trace. The entry records the page, the filter and the number returned, never the contents.
5. **Handing over a CV is audited, and the audit may not fail quietly.** Issuing a link was recorded through `record()`, which swallows its own failures; a link can also be forwarded and redeemed more than once, so issuing and serving are different facts. Issuing now uses `recordOrThrow` — if the trail cannot be written, the disclosure does not happen — and the local redemption route records the handover separately.
6. **The submission serializers type-check against the contract again.** They ended in `as unknown as EnquiryAdmin`, so adding a required field to the spec produced no error in exactly the three shapes that carry personal data. The service returns typed populated documents (`interfaces/populated-submission.interface.ts`) and the casts are gone.
7. **The contract check now walks both directions.** `GET /files/cv/{key}` reached the app with no spec entry, because coverage only walked spec → app. It walks app → spec as well, and the route is specified.

Also: multipart field counts are bounded on both upload routes (multer defaults them to `Infinity`); the three forms have a rate limit each rather than sharing one budget; the honeypot field carries no length rule, since a 400 naming it would tell a bot it is inspected; the retention sweep runs shortly after boot as well as daily, because a container that restarts more often than the interval would never sweep; and a colliding reference is retried once instead of surfacing as a 500.

**ADR-038: Sentry over its envelope API, not the SDK.** `@sentry/node` is a large dependency that instruments `http`, `fs` and async hooks to build traces nobody has asked for, and what this project needs is "post the error somewhere a human will see it" — which is one `fetch` against a documented, stable envelope endpoint. It is the same call made for Cloudinary, Resend, Turnstile and S3, and it keeps the reporting path readable in one file. The cost is stated rather than hidden: no breadcrumbs, no performance tracing, no release health, and stack frames are not mapped through source maps at Sentry's end. The interface is one method, so swapping the SDK in later is a contained change.

Two related choices. `SENTRY_DSN` unset means the noop driver, so nothing about running this API depends on having an account. And only 5xx responses are reported — a 400 or a 404 is the API working correctly, and reporting those would bury the one thing worth waking somebody for. Reports carry the _route pattern_, never the concrete path, because a path carries ids and an application id identifies a person's CV.

**ADR-039: The shutdown sequence lives in `core/lifecycle.ts`, not inline in `server.ts`.** It was unreachable from any test, and the one code path that has to work during an incident is the worst one to leave unexercised — so it now has five tests, including the one that matters: a request in flight when SIGTERM arrives still completes. The ordering it enforces is stop accepting, drain, close the database, exit; closing the connection first is how a routine restart becomes a page of 500s for the editor who was halfway through saving.

**ADR-040: What the security review changed (ROADMAP 7.1).** One blocker, five majors, and a handful of smaller things. The blocker and the first two majors were all invisible to a passing suite, which is the pattern worth noticing.

1. **Every admin response was served `public, max-age=60, s-maxage=300`, with an ETag.** `noStore` runs first in each admin guard chain, but the cache middleware rewrites headers at `res.json()` time, after it, and `setHeader` replaces. So a CDN or a corporate proxy would have stored `GET /admin/enquiries` — names, addresses, matter summaries — and served it to a caller with no token at all, for five minutes. The wrapper now honours an existing `no-store`, and the route-inventory test asserts the header on every admin GET, because a guard being present proved nothing about what left the building.
2. **A password alone read every draft on the site.** `optionalPreviewAuth` accepted any signature-valid token without reloading the user, and `login` issues a token _before_ TOTP enrolment — so a phished password, with no second factor, read every embargoed insight and unannounced hire through `?preview=true`. A deactivated account kept the same access for the life of its token, and `business_dev`, which the matrix gives no content access at all, had it too. Preview now reloads the user and requires an active, enrolled, content-capable account. Four tests had been relying on the hole.
3. **The login form was a staff directory, and a lock-out weapon.** Disabled and locked accounts answered differently from unknown ones, _before_ the password was checked — so one request per candidate address told an outsider who works at the firm, and the staff are named on this very site. The same ordering let anyone lock a named administrator out indefinitely with ten guesses from two IPs, with the response confirming it was working. The password is now verified first, every failure answers the same 401, and only a real active account with a wrong password counts towards a lockout.
4. **A long `User-Agent` lost a submission and leaked itself.** The header was stored untruncated against a 400-character column, so Mongoose rejected the document; the error was unrecognised and became a 500. The enquiry was lost — and for an application, after the CV had already been stored — while Mongoose's message template put the whole attacker-controlled header into the log and the error report. The header is truncated at the boundary, Mongoose validation errors map to a 400 that names fields without quoting values, and the Sentry driver clamps any message it forwards.
5. **Link fields had no scheme allow-list**, so an editor — or anyone who took over an editor's account — could store `javascript:` on every page of the firm's site. Rich text was sanitised; these fields bypass the sanitiser entirely and are rendered straight into an `href`. Hrefs are now constrained by their `kind`: an `action` href must be a frontend token, an `internal` one a path, and only an `external` one is a URL, restricted to the same schemes the rich-text sanitiser allows.
6. **Logout and a password change did not invalidate tokens already issued.** Both revoked refresh tokens only, so a password changed _because_ of a compromise left the attacker's bearer token working against the whole admin API for the rest of its fifteen minutes. `credentialsChangedAt` is compared against the token's `iat` on every reload.

Also: refresh rotation is a single atomic `findOneAndUpdate`, so two simultaneous presentations of one token can no longer both succeed and defeat reuse detection; submission handling writes are audited, not only reads; the last active administrator cannot be demoted or deactivated; `trust proxy` is configured rather than assumed, since the wrong hop count makes `req.ip` attacker-controlled and every per-IP limit bypassable; the JWT algorithm is pinned; and `cookie-parser` was bumped, leaving production dependencies with no advisories. The remaining `npm audit` findings are all dev-only (prism and vitest chains) and never reach the container.

**ADR-041: No Sentry, optional captcha, and a deployment sized for a free plan.** Three scope decisions the project lead took after the security review, recorded because each trades something away knowingly.

1. **No error tracking.** The Sentry integration built for ROADMAP 7.3 is removed — driver, wiring and tests. Errors are logged, and the logs are where an operator looks. This also closes the review's finding that an error message can quote a name or an address (Mongoose does it routinely) and would have carried it to a processor the firm has no agreement with. `ROADMAP 7.3` is therefore half-delivered on purpose: the graceful shutdown work stayed, the reporting did not.
2. **Turnstile is optional.** `CAPTCHA_DRIVER=noop` is allowed in production, unlike the other dev-only drivers, which are refused. Two defences remain on every form: the hidden honeypot, which answers a bot with a plausible reference and stores nothing, and the per-form rate limit of five submissions per ten minutes per IP. The firm can turn Turnstile on with one variable if spam appears.
3. **Malware scanning is an explicit opt-out rather than a requirement.** ClamAV needs a second always-on service, which a free hosting plan does not have. Production still refuses `VIRUS_SCAN_DRIVER=noop` _unless_ `ALLOW_UNSCANNED_UPLOADS=true` is set deliberately, and the API logs a warning on every start while it is. The risk is the firm's to accept; what is not acceptable is arriving at it by leaving a variable unset.

The three guards that remain hard refusals in production are the ones a free plan makes _more_ necessary, not less: Render's disk is wiped on every deploy, so `STORAGE_PUBLIC_DRIVER=local` and `STORAGE_PRIVATE_DRIVER=local` would lose every image and every CV, and `MAILER_DRIVER=log` would silently send nothing at all.

**ADR-042: What the Phase 7 review changed.** Two blockers, both of which a passing suite could not have caught.

1. **The test suite was flaky by construction.** The database is partitioned per Vitest worker; the _upload directories_ were not, so the retention sweep's `beforeEach` deleted files another worker's download test was about to read. It failed only when the race landed. Both directories are now per-worker.
2. **Every operational procedure in the runbook was impossible to run.** It told the operator to `docker run ... node --import tsx scripts/…`, but `.dockerignore` excluded `scripts/` and `tsx` is a dev dependency, so nothing in §3, §4 or §5 would have worked — including creating the first administrator, which has no HTTP path by design. The scripts now compile into `dist/`, the entry point moved to `dist/src/server.js`, the seed copy ships in the image, and the runbook's commands are plain `node dist/scripts/…`.

The majors: preview accepted a token a password change should have killed, because `credentialsChangedAt` was checked in `requireAuth` and not in `optionalPreviewAuth` — the check is now shared. The account lockout was a latch rather than a window, so one wrong password every fifteen minutes kept an account locked for ever; the counter resets when a lock expires. The launch loader created a Mongoose document the admin API could not save — the seed had a `video` insight whose `videoUrl` is `[PENDING FROM FIRM]`, which the new URL allow-list rejects and the format requires — so it is an article until the firm supplies the link. The loader was also not atomic: a failure partway left a half-loaded database that the emptiness guard would then refuse to fix, so a failed run now undoes itself. And the runbook's compromised-account procedure began "change the password", which no administrator could do for somebody else; `POST /admin/users/:id/revoke-sessions` now exists, is admin-only and audited.

One claim was corrected rather than fixed: the loader says it creates everything as a draft, and pages and settings have no draft state — their content is live the moment it runs. The docstring, the test name, the CLI output and the runbook all now say so.

**ADR-043: One account per role, no second factor, and an email the holder sets.** The project lead judged the original scheme too complex for a four-person dashboard, and this replaces it. Three parts:

1. **Login is by username, not email.** Four accounts exist — `admin`, `editor`, `hr`, `business_dev` — created at first boot from `ADMIN_PASSWORD`, `EDITOR_PASSWORD`, `HR_PASSWORD` and `BIZDEV_PASSWORD`. There is no sign-up, no invitation flow and no first-administrator CLI. An account whose variable is unset is not created; nothing is ever defaulted, because an account with a password nobody chose is an account nobody knows is there. An account that already exists is never touched, so a restart cannot reset a password the firm has changed.
2. **No TOTP.** The two-factor routes, the encrypted secret, the enforcement in `requireAuth` and the otplib dependency are all gone. What still protects the dashboard: argon2id passwords, a fifteen-minute access token, rotating refresh tokens with reuse detection, a lockout after ten failures, and `credentialsChangedAt` so a password change ends the sessions already open.
3. **Email is a notification address, not a credential.** Each holder sets their own with `PATCH /admin/auth/me`, and a form's notification goes to the inbox of the role that handles it — enquiries and messages to `business_dev`, applications to `hr`. This replaces `NOTIFY_ENQUIRIES_TO` and `NOTIFY_APPLICATIONS_TO`, so redirecting a notification is a dashboard change rather than a deploy. With no address set the notification is skipped and logged; the submission is already stored by then and must not fail for want of a profile field.

**What this costs, recorded because it was argued and decided rather than overlooked.** The audit log now answers "which _role_ read this CV", not "which person" — with a shared account, individual attribution has to come from who held the password at the time. And a phished or shared password is the only thing between an outsider and the firm's client enquiries, where before it was one of two. The mitigations that remain are the lockout, the rate limits, and the fact that the dashboard origin is on the CORS allow-list. Turning 2FA back on later means restoring one middleware check and one enrolment flow; nothing else in the design depends on its absence.

Also gone with it: `scripts/create-admin.ts`, which existed only to solve the chicken-and-egg problem the bootstrap now solves, and `helpers/crypto.helper.ts`, whose AES-GCM was only ever used for TOTP secrets.

**ADR-044: The contract is served as documentation at `/docs`.** This is an exception to the API-only rule in `CLAUDE.md`, taken deliberately by the project lead rather than drifted into.

The alternative was `npm run docs:build`, a self-contained HTML file somebody hosts. It was rejected for a specific reason: it is a copy, and a copy is stale from the first spec change nobody re-uploads. A frontend team building against a link that is quietly wrong is worse than no link.

What keeps this from becoming a view layer. The page is a shell of about twenty lines with no content of its own — Redoc fetches `/docs/openapi.yaml` and renders it in the browser, so there is exactly one copy of the contract and `npm run spec:lint` still guards it. Nothing is templated, and no other route returns HTML.

Three things it cost. The spec is not TypeScript, so a build step has to carry it into `dist/openapi/` — without that the page loads in production and then 404s on its own contract, which the integration test pins by hiding the file. Redoc loads from a CDN and builds its search index in a blob worker, neither of which the default CSP allows; the relaxation is scoped to the `/docs` router, because a policy loosened globally to suit one page stops meaning anything.

And what is served is the **bundled** spec rather than the source. The source keeps its 77 response examples in `fixtures/responses/*.json` and references them, which is what lets the contract tests and the spec share one copy of each — but a browser cannot follow a `$ref` to a file that is not served, so the first deployment rendered every example as the literal `{ "$ref": "../fixtures/responses/site.json" }`. `scripts/bundle-spec.mjs` inlines them, for `npm run dev` via `predev` and for the image via `npm run build`. Serving the fixtures directory instead was the alternative, and was rejected: it would put the seed fixtures one path traversal away from a public route to save a build step. If bundling fails the script copies the spec unbundled and warns, because docs with unrendered examples are a poor page while a deploy that will not start is an outage.

The spec documents the admin endpoints as well as the public ones, and `/docs` is open. That is a considered position rather than an oversight: the admin routes are protected by authentication and the role matrix, and a contract an attacker could reconstruct by reading the frontend bundle is not a control. The page carries `noindex`. If the firm later wants it closed, the router is the single place to gate.

## Known content conflicts (from the designs; the firm must resolve them)

Seed them as designed. Don't silently "fix" them.

1. **Partner titles.** The About text says "six (6) other Partners" and names Olalere, Gabari, Ejelonu and Sowunmi, but the directory lists those four as Associate Partners.
2. **Practice area count.** The Practice Areas page shows 9, the Home tabs and footer show 7, the About text names 5, and the stats row says "15+ Areas".
3. **The two jobs are identical.** The NYSC Associate job asks for 2–4 years' post-call experience, which contradicts what an NYSC role is.
4. **Event date mismatch.** The "2025 Annual Business Luncheon" insight's artwork says Dec 5 2024, but the card is dated June 2026.
5. **Office order.** The footer lists Lagos, Ibadan, Abuja; the Offices page lists Lagos, Abuja, Ibadan. We use the page order everywhere.
6. **The phone number is a placeholder and has too many digits.**
7. **The design's office maps are placeholders** showing streets in Ukraine. Real coordinates are needed.
8. **Is there an Offices page?** The project lead, working from the current Figma, says there is not — offices are listed in the footer only. But the transcription recorded a frame with its own copy ("Wherever You Find Us.", a subtitle and two CTAs), and two other pages link to `/offices`: the home hero's secondary CTA and a CTA on the FAQ page. So either the frame was removed after the transcription, or it is somewhere the lead has not seen. The page and its endpoint are left in place until the firm says otherwise: an unused endpoint costs nothing, while deleting it would break two links the design asks for and would be a contract change to undo. Its hero image slot stays empty.

## Open questions (with the default we build to until answered)

| #   | Question                                                                                                             | Owner         | Default assumption                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| Q1  | What does "Discuss a Mandate" open? The copy says "not a form".                                                      | Design/firm   | A short enquiry form via `POST /enquiries`. The frontend decides the presentation. |
| Q2  | Chat widget: live chat, WhatsApp handoff, or AI assistant?                                                           | Firm          | Out of scope. `action:chat` is a link kind the frontend resolves.                  |
| Q3  | Does the "Partners" filter include the Managing Partner?                                                             | Design        | Yes.                                                                               |
| Q4  | Short labels and Home visibility for Company Secretarial and Telecommunications Regulatory                           | Design        | "Company Secretarial" / "Telecoms"; not featured on Home; not in the footer.       |
| Q5  | Retention periods for enquiries, messages and applications                                                           | Firm (DPO)    | Enquiries/messages 730 days; applications 365 days (configurable via env).         |
| Q6  | Public image hosting: Cloudinary or S3 + an image CDN?                                                               | Engineering   | Cloudinary (responsive sizes built in).                                            |
| Q7  | Frontend framework and revalidation mechanism                                                                        | Frontend      | A generic webhook with cache tags; the frontend maps tags to its own revalidation. |
| Q8  | Do the detail pages (practice area, insight, attorney, CSR) have designs?                                            | Design        | Serve full data now; adjust the shapes when designs land (via a DECISIONS entry).  |
| Q9  | Should attorney emails be public?                                                                                    | Firm          | No. The field exists but isn't returned publicly.                                  |
| Q10 | Who confirms image licences (the stock photos, and any AI-generated hero scenes) and consent for attorney portraits? | Firm          | The firm, before publishing. Nothing to build.                                     |
| Q11 | Who writes alt text for the real images?                                                                             | Firm/frontend | The admin UI requires it on upload; drafts can be suggested.                       |
