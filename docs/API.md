# API Conventions & Endpoint Catalogue

`openapi/openapi.yaml` is authoritative. This document explains the conventions the spec must follow and lists every endpoint to be specified. When the two disagree, fix the spec deliberately and log the change in DECISIONS.md.

Base path: `/api/v1`. JSON everywhere except the CV upload (multipart).

## Response conventions

**Success, single resource:**

```json
{ "data": { "id": "665f...", "slug": "tax", "title": "Tax" } }
```

**Success, list:**

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "pageSize": 9, "total": 84, "totalPages": 10 }
}
```

**Error:**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [{ "path": "email", "message": "Invalid email" }]
  }
}
```

The codes are `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415), `FILE_REJECTED` (422), `RATE_LIMITED` (429) and `INTERNAL` (500). A missing `If-Match` on a write that needs one answers **428** with the `VALIDATION_ERROR` code: nothing about the request is malformed, so it is not a 400, but the code enum stays closed. `FILE_REJECTED` means an upload was inspected and refused (today: it failed the virus scan), as opposed to a field being invalid. A 500 never leaks stack traces or messages.

**Shared shapes:**

```json
// Image: always this shape, never a bare URL
{ "url": "https://...", "alt": "Lady Justice statue", "width": 1440, "height": 662,
  "sizes": { "sm": "https://...w_480", "md": "https://...w_960", "lg": "https://...w_1440" },
  "focalPoint": { "x": 0.5, "y": 0.4 } }   // always present; the media model defaults it to 0.5/0.5

// Link / CTA
{ "label": "Discuss a Mandate", "href": "action:mandate", "kind": "action" }

// Person summary (used in cards, author blocks, leadership)
{ "id": "...", "slug": "babatunde-ajibade", "displayName": "Dr. Babatunde Ajibade, SAN",
  "role": "managing_partner", "roleLabel": "Managing Partner", "photo": Image, "linkedinUrl": "..." }

// Insight author: a person, or the firm
{ "type": "person", "person": PersonSummary }
{ "type": "firm", "name": "SPA AJIBADE & Co.", "label": "Law Firm" }   // frontend renders its own logo
```

- **Dates** are ISO 8601 strings (`"2026-06-01T00:00:00.000Z"`). The frontend formats them.
- **Rich text** is sanitised HTML in fields named `body`, `bio`, `answer` and `description`.
- **Enums** are returned as `snake_case` values, with a sibling `…Label` field where the UI shows text (`role` + `roleLabel`, `categories` + `categoryLabels`).
- **Pagination:** `?page=1&pageSize=9` (max 50). Out-of-range pages return an empty `data` with correct `meta`, not a 404.
- **Caching:** public GET responses send `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600` and an `ETag`. Form POSTs and admin routes send `no-store`.
- **Preview:** any public content GET accepts an `Authorization: Bearer <admin access token>` together with `?preview=true`, which includes drafts. Without both, drafts are invisible.

## Public endpoints

| Method & path                 | Purpose                | Notes                                                                                                                                                                        |
| ----------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/health`                 | Liveness + DB ping     | `{ status, db, version }`                                                                                                                                                    |
| GET `/site`                   | Global shell           | Settings, nav, footer (includes practice areas + offices), FAQ section with FAQs, contact callout                                                                            |
| GET `/pages/:key`             | Composed page          | `key` is one of the 8 page keys. Embeds all referenced data the page renders (below)                                                                                         |
| GET `/practice-areas`         | All published, ordered |                                                                                                                                                                              |
| GET `/practice-areas/:slug`   | Detail                 | Includes contacts (PersonSummary[]) and related insights (latest 3)                                                                                                          |
| GET `/people`                 | Directory              | `role` (a role enum, or omit for all; `partner` also matches `managing_partner`), `sort` = `seniority` (default) / `name_asc` / `name_desc`, pagination (default pageSize 9) |
| GET `/people/:slug`           | Profile/bio            | Full person + practiceAreas + office + their latest 3 insights                                                                                                               |
| GET `/insights`               | Listing                | `category` (enum, or omit for all), `practiceArea` (slug), `sort` = `newest` (default) / `oldest`, pagination (default 9)                                                    |
| GET `/insights/:slug`         | Detail                 | Full body or videoUrl, author, practice areas, 3 related                                                                                                                     |
| GET `/offices`                | All offices            |                                                                                                                                                                              |
| GET `/jobs`                   | Open jobs              | Excludes closed or past-closingDate jobs                                                                                                                                     |
| GET `/jobs/:id`               | One job                |                                                                                                                                                                              |
| GET `/faqs`                   | FAQ list               | Also embedded in `/site`                                                                                                                                                     |
| GET `/search?q=`              | Header search          | `q` is 2–100 chars. Returns `{ practiceAreas: [], people: [], insights: [] }`, max 5 each                                                                                    |
| POST `/enquiries`             | Discuss a Mandate      | 201 `{ data: { reference: "ENQ-7F3K2A" } }`                                                                                                                                  |
| POST `/messages`              | Message the firm       | 201 `{ data: { reference } }`                                                                                                                                                |
| POST `/jobs/:id/applications` | Send your CV           | multipart: `cv` file + fields. 201 `{ data: { reference } }`                                                                                                                 |

### What each `/pages/:key` embeds

- **home:** hero, aboutFirm, videoShowcase, `recognitions` grouped by tab, `practiceAreas` (featuredOnHome, full cards), `leadership` (PersonSummary[], featuredInLeadership), whyChooseUs, `latestInsights` (6 cards), plus section headers.
- **about:** hero, story (with quotePerson as PersonSummary), stats (computed values resolved), missionSection, principles, awardsList.
- **practice-areas:** hero, gridSection, `practiceAreas` (all), csrBanner.
- **people:** hero, directorySection, `roleFilters` ([{ value, label }], including "Our Attorneys" = all). Grid data comes from `/people`.
- **insights:** hero (optional, may be null), `featured` (≤ 3 insight cards with excerpt), `categoryFilters`, listingSection. Grid data comes from `/insights`.
- **careers:** hero, jobsSection, `jobs` (all open jobs).
- **faq:** hero.
- **offices:** hero, `offices` (all).

The FAQ section, contact callout and footer are **not** repeated in page payloads. The frontend gets them once from `/site`.

### Form request bodies

Every form includes `consent: true` (required, literal true), `consentTextVersion` (string), `turnstileToken` (string), and a honeypot field `website`, which must be empty.

- **Enquiry:** `fullName` (2–120), `email`, `phone?` (E.164 or a Nigerian local format), `organization?` (≤ 160), `practiceArea?` (slug), `preferredOffice?` (office id), `summary` (20–2000)
- **Message:** `fullName`, `email`, `phone?`, `subject?` (≤ 160), `message` (10–2000)
- **Application (multipart):** `fullName`, `email`, `phone`, `coverNote?` (≤ 2000), `cv` (PDF or DOCX, ≤ 5 MB, checked by magic bytes and not just by extension)

Rate limits per IP: 5 per 10 minutes on each form, 60 per minute on search, and 300 per minute on other public GETs.

## Admin endpoints (`/api/v1/admin`, all require auth)

The admin spec sections are written in Phase 4/5, before those phases' code.

**Content CRUD:** the same pattern under `/content/<collection>`, for `practice-areas, people, insights, offices, recognitions, faqs, jobs`:
`GET /content/:collection` (all statuses, `?status=&q=&page=`), `GET /content/:collection/:id`, `POST /content/:collection`, `PATCH /content/:collection/:id`, `DELETE /content/:collection/:id`, `POST /content/:collection/:id/publish`, `POST /content/:collection/:id/unpublish`, `PATCH /content/:collection/reorder` (body: ordered id list).

The `/content/` segment keeps these from colliding with the admin singletons (`/admin/settings`, `/admin/pages/:key`, `/admin/media/:id`), which would otherwise depend on route registration order. In `openapi.yaml` the seven collections are listed as explicit paths with their own request and response schemas, generated from one template by `npm run spec:gen`, so the dashboard gets a concrete type per collection rather than a union (ADR-033).

**Singletons:**

- `GET /pages/:key` and `GET /settings` return the editable shape (see below) plus `revision`.
- `PUT /pages/:key` and `PUT /settings` replace the whole document.
- `PATCH /pages/:key` and `PATCH /settings` do **section-level merges**. Each top-level key in the body (e.g. `hero`, `stats`) replaces that section entirely; sections not in the body are untouched; arrays inside a section are replaced whole, never merged. The merged result is validated against the page's schema before saving.
- **Optimistic locking:** every PUT/PATCH sends `If-Match: <revision>`. A stale revision returns 409 `CONFLICT` with the current revision, so two editors can't silently overwrite each other. Content collection PATCHes follow the same rule.

**Media** (the admin UI's image library):

- `POST /media`: multipart upload (`file` + `alt`, optional `title`). Accepts JPEG, PNG, WebP or AVIF, ≤ 10 MB, type checked by magic bytes. SVG is rejected because it can carry scripts; export badges as PNG. Returns 201 with the media record.
- `GET /media`: library listing. Takes `?q=` (matches title/alt/original filename), `?unused=true`, `?sort=newest|oldest` and pagination (default pageSize 24).
- `GET /media/:id`: one record plus `usedBy: [{ collection, id, label, field }]`, e.g. `{ "collection": "practiceAreas", "id": "…", "label": "Tax", "field": "image" }`.
- `PATCH /media/:id`: edit `alt`, `title` and `focalPoint` without re-uploading. Takes `If-Match`, like every other admin write. Moving the focal point rebuilds the Cloudinary size URLs, whose gravity embeds it.
- `PUT /media/:id/file`: **replaces the file in place.** Takes `If-Match`: if the record moved on while the upload was in flight, the request is refused with 409 and the file just stored is removed, rather than left orphaned. The ID and alt text stay the same, so every page and record using the image updates at once. The new file gets a new URL (so browsers and CDNs can't serve the old one), the old file is deleted from storage after the swap succeeds, every referencing entity's cache tags are invalidated, and the action is audit-logged.
- `DELETE /media/:id`: allowed only when `usedBy` is empty. Otherwise it returns 409 `CONFLICT` with one `error.details` entry per usage — `path` is `usedBy` and `message` names the collection, record and field — so the UI can show where the image is still used. (`ErrorDetail` is `{ path, message }`, so the structured `usedBy` array itself cannot travel in `details`; call `GET /media/:id` for that.)

Admin media records use this shape:

```json
{ "id": "…", "url": "…", "sizes": { "sm": "…", "md": "…", "lg": "…" }, "alt": "…", "title": "…",
  "width": 1440, "height": 662, "mimeType": "image/jpeg", "bytes": 482113,
  "focalPoint": { "x": 0.5, "y": 0.4 }, "createdAt": "…", "updatedAt": "…", "usedBy": [ … ] }
```

### Editable shape vs public shape

Admin GETs and public GETs return **different shapes on purpose**:

- **Public (composed):** references are expanded into what the site renders. `hero.image` is a full Image object; `leadership` is PersonSummary[]; computed stats are resolved.
- **Admin (editable):** references stay as IDs, exactly as the admin UI must send them back. `hero.image` is `"665f…"` (a media ID), `story.quotePerson` is a person ID, and stats keep their `source`. To render thumbnails without extra calls, admin responses also include an `_expanded` object keyed by ID with a minimal preview of each referenced media or person (`{ url, alt }` / `{ displayName }`). **`_expanded` is rejected on write, not ignored:** the request schemas are strict, so sending it back is a 400 naming the field rather than a silent no-op.

Rule of thumb: whatever an admin GET returns, minus the fields the server owns, is a valid PUT body. Those fields are `id`, `slug`'s siblings `status`, `publishedAt` and `order`, plus `revision`, `createdAt`, `updatedAt` and `_expanded`. (`slug` itself _is_ writable — it is how an editor changes a URL.)

**Submissions:** `GET /enquiries`, `GET /enquiries/:id`, `PATCH /enquiries/:id` (status, assignedTo). The same for `/messages` and `/applications`, plus `GET /applications/:id/cv`, which returns `{ url, expiresAt }` (a signed URL with a 5-minute TTL; this access is audited).

**Users & audit (admin role):** `GET|POST /users`, `PATCH /users/:id`, `POST /users/:id/revoke-sessions`, `GET /audit-logs`.

**Signing in.** There is no sign-up. Four accounts exist, one per role, created at first boot from the deployment's environment (ADR-043):

| Username       | Role           | Sees                            |
| -------------- | -------------- | ------------------------------- |
| `admin`        | `admin`        | Everything                      |
| `editor`       | `editor`       | Content, pages, settings, media |
| `hr`           | `hr`           | Jobs, applications and CVs      |
| `business_dev` | `business_dev` | Enquiries and messages          |

`POST /admin/auth/login` takes `{ username, password }` and returns a 15-minute access token in the body plus a rotating refresh token as an httpOnly cookie. There is no second factor. `PATCH /admin/auth/me` lets the holder set their own display name and notification address — and that address is where their role's form notifications go: enquiries and messages to `business_dev`, job applications to `hr`.

### Role matrix

| Area                                         | admin | editor | hr        | business_dev |
| -------------------------------------------- | ----- | ------ | --------- | ------------ |
| Content CRUD, pages, settings, media library | ✓     | ✓      | jobs only | —            |
| Enquiries, messages                          | ✓     | —      | —         | ✓            |
| Applications + CVs                           | ✓     | —      | ✓         | —            |
| Users, audit logs                            | ✓     | —      | —         | —            |
