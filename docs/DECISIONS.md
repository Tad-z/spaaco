# Decisions

Append new entries at the bottom of each section. Never rewrite history; supersede instead ("Superseded by ADR-014").

## Architecture Decision Records

**ADR-001: Hand-built API on Node.js + Express + MongoDB.** No headless CMS. We own the admin API; the frontend team owns all UI, including the admin dashboard.

**ADR-002: JavaScript (ESM), not TypeScript.** *Superseded by ADR-017.* Correction: this was recorded as "the team's preference", but it was an assumption made while drafting the kit, not a stated preference.

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

**ADR-029: Testing scope and speed.** *(Requested as ADR-019; that number was already used for the `/api/v1` path prefix and is referenced from commit messages and PROGRESS.md, so this takes the next free number rather than renumbering history.)*

The suite was slowing every task, so coverage is now proved **once, in the cheapest place that proves it**:

- **Per endpoint:** happy path with a contract assertion, one 400, and a 404 where applicable. Nothing more unless the endpoint has genuinely distinct logic.
- **Draft exclusion:** once per public resource, not per endpoint.
- **Role enforcement:** only in `tests/integration/admin/roles.test.ts`, one table-driven test over every admin route × role. Never repeated in a resource's own file.
- **Generic CRUD factory:** tested thoroughly once; each collection then gets a single admin smoke test (create → update with `If-Match` → publish → public read).
- **During a task** only the touched tests run, plus `lint` and `typecheck`. The full `npm run check` runs at the end of each phase.
- **The `api-reviewer` agent** runs at the end of Phases 3, 5, 6 and 7 only.

Mechanically, one mongod now starts in `globalSetup` for the whole run instead of one per test file, with each Vitest worker using its own database on it and `afterEach` clearing collections (never dropping, which would drop indexes). The layer-boundary probes were also folded into a single ESLint run, since constructing a type-aware ESLint instance was the slowest operation in the suite.

**The risk we are accepting:** narrower coverage can miss a regression that duplicated tests would have caught twice. The mitigation is that the central tests must genuinely cover what the per-resource tests no longer do — so a role or draft check may only be deleted from a resource file once `roles.test.ts` or that resource's single draft test demonstrably covers it.

## Known content conflicts (from the designs; the firm must resolve them)

Seed them as designed. Don't silently "fix" them.

1. **Partner titles.** The About text says "six (6) other Partners" and names Olalere, Gabari, Ejelonu and Sowunmi, but the directory lists those four as Associate Partners.
2. **Practice area count.** The Practice Areas page shows 9, the Home tabs and footer show 7, the About text names 5, and the stats row says "15+ Areas".
3. **The two jobs are identical.** The NYSC Associate job asks for 2–4 years' post-call experience, which contradicts what an NYSC role is.
4. **Event date mismatch.** The "2025 Annual Business Luncheon" insight's artwork says Dec 5 2024, but the card is dated June 2026.
5. **Office order.** The footer lists Lagos, Ibadan, Abuja; the Offices page lists Lagos, Abuja, Ibadan. We use the page order everywhere.
6. **The phone number is a placeholder and has too many digits.**
7. **The design's office maps are placeholders** showing streets in Ukraine. Real coordinates are needed.

## Open questions (with the default we build to until answered)

| # | Question | Owner | Default assumption |
|---|---|---|---|
| Q1 | What does "Discuss a Mandate" open? The copy says "not a form". | Design/firm | A short enquiry form via `POST /enquiries`. The frontend decides the presentation. |
| Q2 | Chat widget: live chat, WhatsApp handoff, or AI assistant? | Firm | Out of scope. `action:chat` is a link kind the frontend resolves. |
| Q3 | Does the "Partners" filter include the Managing Partner? | Design | Yes. |
| Q4 | Short labels and Home visibility for Company Secretarial and Telecommunications Regulatory | Design | "Company Secretarial" / "Telecoms"; not featured on Home; not in the footer. |
| Q5 | Retention periods for enquiries, messages and applications | Firm (DPO) | Enquiries/messages 730 days; applications 365 days (configurable via env). |
| Q6 | Public image hosting: Cloudinary or S3 + an image CDN? | Engineering | Cloudinary (responsive sizes built in). |
| Q7 | Frontend framework and revalidation mechanism | Frontend | A generic webhook with cache tags; the frontend maps tags to its own revalidation. |
| Q8 | Do the detail pages (practice area, insight, attorney, CSR) have designs? | Design | Serve full data now; adjust the shapes when designs land (via a DECISIONS entry). |
| Q9 | Should attorney emails be public? | Firm | No. The field exists but isn't returned publicly. |
| Q10 | Who confirms image licences (the stock photos, and any AI-generated hero scenes) and consent for attorney portraits? | Firm | The firm, before publishing. Nothing to build. |
| Q11 | Who writes alt text for the real images? | Firm/frontend | The admin UI requires it on upload; drafts can be suggested. |
