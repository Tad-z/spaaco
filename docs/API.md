# API Conventions & Endpoint Catalogue

`openapi/openapi.yaml` is authoritative. This document explains the conventions the spec must follow and lists every endpoint to be specified. When the two disagree, fix the spec deliberately and log the change in DECISIONS.md.

Base path: `/api/v1`. JSON everywhere except the CV upload (multipart).

The running API serves the spec as browsable documentation at **`/docs`**, and the raw YAML at `/docs/openapi.yaml` (ADR-044) — so a deployment always documents itself rather than a built copy somebody has to remember to re-upload.

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

// A call to action whose destination is not decided yet (href and kind both null until it is)
{ "label": "View Our Recognitions", "href": null, "kind": null }

// Document: an uploaded PDF — no sizes, no alt
{ "url": "https://...", "title": "SPA Ajibade & Co. firm profile", "bytes": 2481152, "mimeType": "application/pdf" }

// Person summary (used in cards, author blocks, leadership). Carries the card's back face too.
{ "id": "...", "slug": "babatunde-ajibade", "displayName": "Dr. Babatunde Ajibade, SAN",
  "role": "managing_partner", "roleLabel": "Managing Partner", "photo": Image, "linkedinUrl": "...",
  "cardBio": "A well-regarded authority in international arbitration…",
  "practiceAreas": [{ "slug": "dispute-resolution-arbitration", "title": "Dispute Resolution & Arbitration" }] }

// Insight author: a person, or the firm
{ "type": "person", "person": PersonSummary }
{ "type": "firm", "name": "SPA AJIBADE & Co.", "label": "Law Firm" }   // frontend renders its own logo
```

- **Dates** are ISO 8601 strings (`"2026-06-01T00:00:00.000Z"`). The frontend formats them.
- **Rich text** is sanitised HTML in fields named `body`, `bio`, `answer` and `description` (a job's; a core service's `description` is plain text).
- **Carousels** are arrays: a hero's `images`, the CSR banner's `images`. Only the picture changes between slides; the copy is shared. An empty array means nothing is uploaded yet.
- **Enums** are returned as `snake_case` values, with a sibling `…Label` field where the UI shows text (`role` + `roleLabel`, `categories` + `categoryLabels`).
- **Pagination:** `?page=1&pageSize=9` (max 50). Out-of-range pages return an empty `data` with correct `meta`, not a 404.
- **Caching:** public GET responses send `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600` and an `ETag`. Form POSTs and admin routes send `no-store`.
- **Preview:** any public content GET accepts an `Authorization: Bearer <admin access token>` together with `?preview=true`, which includes drafts. Without both, drafts are invisible.

## Public endpoints

| Method & path                    | Purpose                | Notes                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/health`                    | Liveness + DB ping     | `{ status, db, version }`                                                                                                                                                                                                                                                                |
| GET `/site`                      | Global shell           | Settings, nav, footer (includes practice areas + offices), FAQ section with FAQs, contact callout                                                                                                                                                                                        |
| GET `/pages/:key`                | Composed page          | `key` is one of the 10 page keys. Embeds all referenced data the page renders (below)                                                                                                                                                                                                    |
| GET `/practice-areas`            | All published, ordered |                                                                                                                                                                                                                                                                                          |
| GET `/practice-areas/:slug`      | Detail                 | Every detail field, `lead` (PersonSummary + email), `industries`, `siblings` (every published area, for the sidebar) and `recentPublications` (latest 6, never pro bono)                                                                                                                 |
| GET `/people`                    | Directory              | `role` (a role enum, or omit for all; `partner` also matches `managing_partner`), `practiceArea` (slug; matches `practiceAreas` or `primaryPracticeArea`), `sort` = `seniority` (default) / `name_asc` / `name_desc`, pagination (default pageSize 9). `role` and `practiceArea` combine |
| GET `/people/:slug`              | Profile/bio            | Full person (bio, education, memberships, email, Instagram) + primary practice area + office + `recentPublications` (their latest 6, never pro bono)                                                                                                                                     |
| GET `/insights`                  | Listing                | `category` (enum, or omit for all public categories), `practiceArea` (slug), `sort` = `newest` (default) / `oldest`, pagination (default 9). **`pro_bono` appears only with `category=pro_bono`**                                                                                        |
| GET `/insights/:slug`            | Detail                 | Full body or videoUrl, author, practice areas, 3 related, `cta` (Read Article / Watch Video, or null) and `backLink`                                                                                                                                                                     |
| GET `/recognitions`              | Recognition component  | `{ directories: [{ id, name, slug, logo }], achievements: Award[] }` — the awards flagged for Home                                                                                                                                                                                       |
| GET `/recognitions/:slug`        | A directory's page     | `{ directory, hero, awardsEyebrow, awards }`, awards newest year first. The shared labels come from the `recognition` page document                                                                                                                                                      |
| GET `/legal/:key`                | Terms / Privacy        | `terms` or `privacy`; `{ key, title, body, updatedAt }`. Anything else, or a draft, is a 404                                                                                                                                                                                             |
| GET `/offices`                   | All offices            |                                                                                                                                                                                                                                                                                          |
| GET `/jobs`                      | Open jobs              | Excludes closed or past-closingDate jobs                                                                                                                                                                                                                                                 |
| GET `/jobs/:id`                  | One job                |                                                                                                                                                                                                                                                                                          |
| GET `/faqs`                      | FAQ list               | Also embedded in `/site`                                                                                                                                                                                                                                                                 |
| GET `/search?q=`                 | Header search          | `q` is 2–100 chars. Returns `{ practiceAreas: [], people: [], insights: [] }`, max 5 each                                                                                                                                                                                                |
| POST `/enquiries`                | Discuss a Mandate      | 201 `{ data: { reference: "ENQ-7F3K2A" } }`                                                                                                                                                                                                                                              |
| POST `/messages`                 | Message the firm       | 201 `{ data: { reference } }`                                                                                                                                                                                                                                                            |
| POST `/newsletter/subscriptions` | Footer newsletter form | `{ email, consent, consentTextVersion, turnstileToken, website }`. 201 `{ data: { status: 'subscribed' } }` for every address; nothing is emailed (ADR-067)                                                                                                                              |
| POST `/newsletter/unsubscribe`   | Unsubscribe form       | `{ email }`. Deletes it from the list. Always 200 `{ data: { status: 'unsubscribed' } }`                                                                                                                                                                                                 |
| POST `/jobs/:id/applications`    | Send your CV           | multipart: `cv` file + fields. 201 `{ data: { reference } }`                                                                                                                                                                                                                             |

### What each `/pages/:key` embeds

- **home:** hero (3 slides), aboutFirm, videoShowcase (with `caption`), `recognitionSection` (heading, image, a pending "View Our Recognitions" CTA, and `badges`: the awards with `featuredOnHome`), `practiceAreas` (featuredOnHome cards, whose `summary` is the area's `homeSummary`), `leadership` (PersonSummary[] with card-back data), whyChooseUs, `latestInsights` (6 cards, never pro bono), plus section headers.
- **about:** hero, story (with quotePerson as PersonSummary, and `profileDownload` with the firm profile PDF), stats (computed values resolved), missionSection (bodies are HTML), principles, awardsList (rows are the recognition directories: `{ name, slug }`).
- **practice-areas:** hero, gridSection, `practiceAreas` (all), csrBanner (3 slides; its CTA goes to `/responsible-business`).
- **people:** hero, directorySection, `roleFilters` ([{ value, label }], including "Our Attorneys" = all, ending with "Trainee Associates"), `practiceAreaFilters` ([{ value: slug, label: title }]). Grid data comes from `/people`.
- **insights:** hero (null by design), `featured` (≤ 3 insight cards with excerpt, never pro bono), `categoryFilters` (the public categories), `practiceAreaFilters`, listingSection. Grid data comes from `/insights`. The admin document also holds `categoryCovers` (an image id per category), which the public side never shows as such: an insight card or detail with no cover of its own carries its first category's card as `coverImage` (ADR-063).
- **careers:** hero, jobsSection (with `emptyState` only when no job is open), `jobs` (all open jobs).
- **faq:** hero.
- **offices:** hero, `offices` (all).
- **recognition:** `directoryPage` (the awards eyebrow and the two hero CTAs every directory page shares). The frontend renders directory pages from `/recognitions/:slug`, which embeds these.
- **responsible-business:** `title`, `images` (the carousel), `backLink` ("Back to Practice Areas"). Its grid is `/insights?category=pro_bono`.

The FAQ section, contact callout and footer are **not** repeated in page payloads. The frontend gets them once from `/site`.

### Form request bodies

Every form includes `consent: true` (required, literal true), `consentTextVersion` (string), `turnstileToken` (string), and a honeypot field `website`, which must be empty.

- **Enquiry:** `fullName` (2–120), `email`, `phone?` (E.164 or a Nigerian local format), `organization?` (≤ 160), `practiceArea?` (slug), `preferredOffice?` (office id), `summary` (20–2000)
- **Message:** `fullName`, `email`, `phone?`, `subject?` (≤ 160), `message` (10–2000)
- **Application (multipart):** `fullName`, `email`, `phone`, `coverNote?` (≤ 2000), `cv` (PDF or DOCX, ≤ 5 MB, checked by magic bytes and not just by extension)

Rate limits per IP: 5 per 10 minutes on each form (newsletter subscribe and unsubscribe included), 60 per minute on search, and 300 per minute on other public GETs.

## Admin endpoints (`/api/v1/admin`, all require auth)

The admin spec sections are written in Phase 4/5, before those phases' code.

**Content CRUD:** the same pattern under `/content/<collection>`, for `practice-areas, people, insights, offices, recognition-directories, awards, industries, faqs, jobs`:
`GET /content/:collection` (all statuses, `?status=&q=&page=`), `GET /content/:collection/:id`, `POST /content/:collection`, `PATCH /content/:collection/:id`, `DELETE /content/:collection/:id`, `POST /content/:collection/:id/publish`, `POST /content/:collection/:id/unpublish`, `PATCH /content/:collection/reorder` (body: ordered id list).

The `/content/` segment keeps these from colliding with the admin singletons (`/admin/settings`, `/admin/pages/:key`, `/admin/media/:id`), which would otherwise depend on route registration order. In `openapi.yaml` the nine collections are listed as explicit paths with their own request and response schemas, generated from one template by `npm run spec:gen`, so the dashboard gets a concrete type per collection rather than a union (ADR-033).

References to other collections are checked before a delete: a person who leads a practice area, an industry a practice area picks, a directory with awards, and a person, practice area or media item referenced elsewhere all return 409 naming what still points at them.

**Singletons:**

- `GET /pages/:key` and `GET /settings` return the editable shape (see below) plus `revision`. The ten page keys are `home, about, practice-areas, people, insights, careers, faq, offices, recognition, responsible-business`.
- **Legal pages:** `GET /legal/:key` and `PUT /legal/:key` for `terms` and `privacy`, with `If-Match`. The body is `{ status, title, body }`: `status` is how a legal page is published or withdrawn, since the singleton pattern has no publish action.
- `PUT /pages/:key` and `PUT /settings` replace the whole document.
- `PATCH /pages/:key` and `PATCH /settings` do **section-level merges**. Each top-level key in the body (e.g. `hero`, `stats`) replaces that section entirely; sections not in the body are untouched; arrays inside a section are replaced whole, never merged. The merged result is validated against the page's schema before saving.
- **Optimistic locking:** every PUT/PATCH sends `If-Match: <revision>`. A stale revision returns 409 `CONFLICT` with the current revision, so two editors can't silently overwrite each other. Content collection PATCHes follow the same rule.

**Media** (the admin UI's media library — images and PDF documents):

- `POST /media`: multipart upload (`file`, optional `kind` = `image` (default) or `document`). An **image** is a JPEG, PNG, WebP or AVIF, ≤ 10 MB, and needs `alt`. A **document** is a PDF, ≤ 20 MB, and needs `title`. The type is checked by magic bytes and must match `kind`; a mismatch is a 415. SVG is rejected because it can carry scripts; export badges as PNG. Returns 201 with the media record.
- `GET /media`: library listing. Takes `?q=` (matches title/alt/original filename), `?kind=image|document`, `?unused=true`, `?sort=newest|oldest` and pagination (default pageSize 24).
- `GET /media/:id`: one record plus `usedBy: [{ collection, id, label, field }]`, e.g. `{ "collection": "practiceAreas", "id": "…", "label": "Tax", "field": "image" }`.
- `PATCH /media/:id`: edit `alt`, `title` and `focalPoint` without re-uploading. Takes `If-Match`, like every other admin write. Moving the focal point rebuilds the Cloudinary size URLs, whose gravity embeds it.
- `PUT /media/:id/file`: **replaces the file in place.** Takes `If-Match`: if the record moved on while the upload was in flight, the request is refused with 409 and the file just stored is removed, rather than left orphaned. The ID and alt text stay the same, so every page and record using the image updates at once. The new file gets a new URL (so browsers and CDNs can't serve the old one), the old file is deleted from storage after the swap succeeds, every referencing entity's cache tags are invalidated, and the action is audit-logged.
- `DELETE /media/:id`: allowed only when `usedBy` is empty. Otherwise it returns 409 `CONFLICT` with one `error.details` entry per usage — `path` is `usedBy` and `message` names the collection, record and field — so the UI can show where the image is still used. (`ErrorDetail` is `{ path, message }`, so the structured `usedBy` array itself cannot travel in `details`; call `GET /media/:id` for that.)

Admin media records use this shape (for a document, `sizes`, `alt`, `width`, `height` and `focalPoint` are null):

```json
{ "id": "…", "kind": "image", "url": "…", "sizes": { "sm": "…", "md": "…", "lg": "…" }, "alt": "…", "title": "…",
  "width": 1440, "height": 662, "mimeType": "image/jpeg", "bytes": 482113,
  "focalPoint": { "x": 0.5, "y": 0.4 }, "createdAt": "…", "updatedAt": "…", "usedBy": [ … ] }
```

A reference is checked against the kind its field expects: putting a PDF's id into an image field, or an image's into `document`, is a 400.

### Editable shape vs public shape

Admin GETs and public GETs return **different shapes on purpose**:

- **Public (composed):** references are expanded into what the site renders. `hero.images` is an array of Image objects; `leadership` is PersonSummary[]; computed stats are resolved.
- **Admin (editable):** references stay as IDs, exactly as the admin UI must send them back. `hero.images` is `["665f…"]` (media IDs), `story.quotePerson` is a person ID, and stats keep their `source`. To render thumbnails without extra calls, admin responses also include an `_expanded` object keyed by ID with a minimal preview of each referenced media or person (`{ url, alt }` / `{ displayName }`). **`_expanded` is rejected on write, not ignored:** the request schemas are strict, so sending it back is a 400 naming the field rather than a silent no-op.

**Content imports (ADR-059).** People and insight writes accept a write-only `legacyImport: { source: 'wordpress', legacyId }`, from the `admin` role only (anyone else gets 403). On an insight it may also carry `publishedAt`, the date the article was first published in the source system; publishing later keeps it. A read shows the stored provenance as the read-only `legacy: { source, legacyId, importedAt }`. Public responses carry neither.

Rule of thumb: whatever an admin GET returns, minus the fields the server owns, is a valid PUT body. Those fields are `id`, `slug`'s siblings `status`, `publishedAt` and `order`, plus `revision`, `createdAt`, `updatedAt`, `legacy` and `_expanded`. (`slug` itself _is_ writable — it is how an editor changes a URL.)

**Submissions:** `GET /enquiries`, `GET /enquiries/:id`, `PATCH /enquiries/:id` (status, assignedTo). The same for `/messages` and `/applications`, plus `GET /applications/:id/cv`, which returns `{ url, expiresAt }` (a signed URL with a 5-minute TTL; this access is audited).

**Newsletter (ADR-067):** `GET /newsletter/subscribers` (`?q=&page=&pageSize=`, audited), `GET /newsletter/subscribers/export` (CSV: `email,subscribedAt`; audited, and refused if the audit write fails), `DELETE /newsletter/subscribers/:id` (204). There is no admin create: an address must come with its owner's consent.

**Users & audit (admin role):** `GET|POST /users`, `PATCH /users/:id`, `POST /users/:id/revoke-sessions`, `GET /audit-logs`.

**Signing in.** There is no sign-up. Four accounts exist, one per role, created at first boot from the deployment's environment (ADR-043):

| Username       | Role           | Sees                            |
| -------------- | -------------- | ------------------------------- |
| `admin`        | `admin`        | Everything                      |
| `editor`       | `editor`       | Content, pages, settings, media |
| `hr`           | `hr`           | Jobs, applications and CVs      |
| `business_dev` | `business_dev` | Enquiries, messages, newsletter |

`POST /admin/auth/login` takes `{ username, password }` and returns a 15-minute access token in the body plus a rotating refresh token as an httpOnly cookie. There is no second factor. `PATCH /admin/auth/me` lets the holder set their own display name and notification address — and that address is where their role's form notifications go: enquiries and messages to `business_dev`, job applications to `hr`.

### Role matrix

| Area                                                      | admin | editor | hr        | business_dev |
| --------------------------------------------------------- | ----- | ------ | --------- | ------------ |
| Content CRUD, pages, settings, legal pages, media library | ✓     | ✓      | jobs only | —            |
| Enquiries, messages                                       | ✓     | —      | —         | ✓            |
| Newsletter subscribers                                    | ✓     | —      | —         | ✓            |
| Applications + CVs                                        | ✓     | —      | ✓         | —            |
| Users, audit logs                                         | ✓     | —      | —         | —            |
