# Frontend handoff — SPA Ajibade & Co. website API

You can start building now. `openapi/openapi.yaml` is the contract, and a Prism mock serves
realistic responses for every public endpoint, using the real copy from the approved designs.

Nothing below is provisional in shape: if a response field changes name, type or nullability
later, it is a breaking change, it gets an entry in `docs/DECISIONS.md`, and you will be told.
What _is_ provisional is some of the content, which is flagged under
[Known placeholders](#known-placeholders).

---

## Running the mock

```bash
npm install
npm run mock          # Prism on http://127.0.0.1:4010
```

```bash
curl http://localhost:4010/api/v1/pages/home
curl http://localhost:4010/api/v1/people?role=partner
curl "http://localhost:4010/api/v1/search?q=arbitration"
```

The mock needs no database, no credentials and no `.env`.

### Two mock quirks worth knowing

1. **`/pages/{key}` always returns the `home` example** unless you ask for another one.
   All eight pages are one operation with eight examples, and Prism cannot pick an example
   based on a path parameter. Use the `Prefer` header:

   ```bash
   curl -H "Prefer: example=about" http://localhost:4010/api/v1/pages/about
   ```

   Valid values: `home`, `about`, `practice-areas`, `people`, `insights`, `careers`, `faq`,
   `offices`. The real API keys off the URL, so this header is mock-only — don't ship it.

2. **The mock ignores query parameters.** `?role=`, `?category=`, `?page=` and sorting are
   validated but do not change the payload; you always get the full example. Build the UI
   against the shapes and assume the filters work — they are covered by tests on the real API.

To exercise error states, use `Prefer: code=404` (or `400`, `429`).

One more thing about the `GET /insights` example: it shows nine cards so you can build a full
page of the grid, but the firm has only supplied four insights. The other five are repeats
carrying `-2` and `-3` slug suffixes. They exist to fill the mock; the seeded API has four.

### Types

The repo generates TypeScript types from the same spec. Either copy
`src/types/api.generated.ts`, or generate your own:

```bash
npx openapi-typescript openapi/openapi.yaml -o src/types/api.ts
```

`src/types/api.ts` in this repo shows the naming we use (`PracticeAreaCard`, `PersonSummary`,
`InsightCard`, `HomePage`, …). Matching those names will make conversations easier.

---

## Conventions

**Base path** `/api/v1`. JSON everywhere except the CV upload, which is multipart.

**Envelopes**

```jsonc
{ "data": { … } }                                  // one resource
{ "data": [ … ], "meta": { "page": 1, "pageSize": 9, "total": 84, "totalPages": 10 } }
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request",
             "details": [{ "path": "email", "message": "Invalid email" }] } }
```

Error codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403),
`NOT_FOUND` (404), `CONFLICT` (409), `PAYLOAD_TOO_LARGE` (413),
`UNSUPPORTED_MEDIA_TYPE` (415), `FILE_REJECTED` (422), `RATE_LIMITED` (429),
`INTERNAL` (500). A 500 never carries a stack trace or an internal message.

`FILE_REJECTED` means a CV upload was inspected and refused — today, it failed the virus
scan. It is deliberately not `VALIDATION_ERROR`, so you can tell "this file is not acceptable"
apart from "this field is wrong" without reading the status code.

**Images are always an object, never a bare URL.** Every image field has this shape, or is
`null` until the firm uploads one:

```jsonc
{
  "url": "https://…",
  "alt": "…",
  "width": 1440,
  "height": 662,
  "sizes": { "sm": "…", "md": "…", "lg": "…" }, // roughly 480 / 960 / 1440 wide
  "focalPoint": { "x": 0.5, "y": 0.4 }, // always present; use for art-directed cropping
}
```

**Links and CTAs** are `{ label, href, kind }`. `kind` is `internal` (a path on the site),
`external` (an absolute URL) or `action`. The four actions are `action:mandate`,
`action:chat`, `action:message` and `action:call` — you decide what each one opens.

**Dates** are ISO 8601 strings. You format them; the design's "June, 2026." is a frontend
concern.

**Enums** are `snake_case` and always arrive with a display label beside them: `role` +
`roleLabel`, `categories` + `categoryLabels`, `employmentType` + `employmentTypeLabel`.
Render the label; branch on the value. Don't build your own label map, or the firm renaming
something in the admin UI won't reach the site.

**Rich text** — `body`, `bio`, `answer` and `description` are sanitised HTML, safe to inject.
Sanitisation happens on write, against an allow-list suited to legal articles.

**Pagination** — `?page=1&pageSize=9`, max 50. An out-of-range page returns an empty `data`
with correct `meta`, not a 404.

**Caching** — public GETs send `Cache-Control: public, max-age=60, s-maxage=300,
stale-while-revalidate=600` plus an `ETag`. Form POSTs send `no-store`.

**Preview** — any public content GET accepts `?preview=true` together with an
`Authorization: Bearer <admin token>`. Both are required; without them drafts are invisible.
This is how the admin dashboard will preview unpublished content.

---

## Endpoints

| Method & path                         | Returns                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /api/v1/health`                  | `{ status, db, version }`                                                                    |
| `GET /api/v1/site`                    | The global shell — settings, nav, footer, FAQ section, contact callout                       |
| `GET /api/v1/pages/{key}`             | One composed page; `key` is one of the 8 page keys                                           |
| `GET /api/v1/practice-areas`          | All published practice areas, in the firm's order                                            |
| `GET /api/v1/practice-areas/{slug}`   | Detail, plus contacts and 3 related insights                                                 |
| `GET /api/v1/people`                  | Directory. `?role=`, `?sort=seniority\|name_asc\|name_desc`, paginated (default 9)           |
| `GET /api/v1/people/{slug}`           | Profile, practice areas, office, their latest 3 insights                                     |
| `GET /api/v1/insights`                | Listing. `?category=`, `?practiceArea=<slug>`, `?sort=newest\|oldest`, paginated (default 9) |
| `GET /api/v1/insights/{slug}`         | Full body or video URL, author, 3 related                                                    |
| `GET /api/v1/offices`                 | All offices, in page order: Lagos, Abuja, Ibadan                                             |
| `GET /api/v1/jobs`                    | Open vacancies only                                                                          |
| `GET /api/v1/jobs/{id}`               | One vacancy                                                                                  |
| `GET /api/v1/faqs`                    | The FAQ set (also embedded in `/site`)                                                       |
| `GET /api/v1/search?q=`               | `{ practiceAreas, people, insights }`, max 5 each, `q` is 2–100 chars                        |
| `POST /api/v1/enquiries`              | 201 `{ data: { reference } }`                                                                |
| `POST /api/v1/messages`               | 201 `{ data: { reference } }`                                                                |
| `POST /api/v1/jobs/{id}/applications` | multipart, 201 `{ data: { reference } }`                                                     |

### Fetch `/site` once

The FAQ section, contact callout and footer are **not** repeated inside page payloads. Fetch
`/site` once, keep it, and reuse it on every page.

### What each page embeds

Each page arrives with its referenced data already expanded, so a page needs one request.

- **home** — hero, aboutFirm, videoShowcase, `recognitions` split into `achievements` /
  `recognizedBy`, `practiceAreas` (the ones flagged for Home, in Home tab order),
  `leadership` (3 attorneys), whyChooseUs, `latestInsights` (up to 6), plus section headers.
- **about** — hero, story (with `quotePerson` as a full PersonSummary), stats (computed
  values already resolved), missionSection, principles, awardsList.
- **practice-areas** — hero, gridSection, `practiceAreas` (all 9), csrBanner.
- **people** — hero, directorySection, `roleFilters`. The grid comes from `GET /people`.
- **insights** — `hero` is **`null` by design** (the page opens with the carousel), `featured`
  (≤ 3), `categoryFilters`, listingSection. The grid comes from `GET /insights`.
- **careers** — hero, jobsSection, `jobs` (all open roles).
- **faq** — hero only.
- **offices** — hero, `offices`.

Filter tabs (`roleFilters`, `categoryFilters`) are `{ value, label }`. An **empty `value`**
means "no filter" — that's the "Our Attorneys" and "All insights & news" tab. Pass a non-empty
`value` straight through as the `role` or `category` query parameter.

One thing to know about `role`: these are **tab groups, not strictly the stored role**.
`role=partner` also returns the managing partner, because the designs have a "Partners" tab
and no Managing Partner tab. So a result returned under the Partners tab can come back with
`role: "managing_partner"` — render `roleLabel` and don't assume it equals the filter you
sent.

### Insight cards

- `author` is a discriminated union on `type`:
  `{ type: "person", person: PersonSummary }` or
  `{ type: "firm", name: "SPA AJIBADE & Co.", label: "Law Firm" }`. For the firm, render your
  own logo mark — the API sends no firm logo, because the logo is a frontend asset.
- `chips` is precomputed for you: the first category label, then the first practice area
  title, or the second category label when there is no practice area.
- `cta` tells you which button to draw: `{ label: "Read More", kind: "read_more" }` or
  `{ label: "Watch Video", kind: "watch_video" }`.

### Forms

Every form takes `consent: true` (literally true), `consentTextVersion`, `turnstileToken`, and
a honeypot field `website` that must be empty. Responses carry only a reference
(`ENQ-7F3K2A`); nothing the visitor typed is echoed back.

- **Enquiry** — `fullName`, `email`, `phone?`, `organization?`, `practiceArea?` (slug),
  `preferredOffice?` (office id), `summary` (20–2000)
- **Message** — `fullName`, `email`, `phone?`, `subject?`, `message` (10–2000)
- **Application** (multipart) — `fullName`, `email`, `phone`, `coverNote?`, `cv`
  (PDF or DOCX, ≤ 5 MB). Multipart fields arrive as strings, so send `consent` as `"true"`.

Rate limits per IP: **5 per 10 minutes** on each form, 60/min on search, 300/min on other
public GETs. Handle 429 in the form UI.

---

## Known placeholders

These are in the mock responses because the designs don't show them. They are real API fields
in their final shape — only the values are outstanding. Anything marked
`[PENDING FROM FIRM]` will be replaced by the firm through the admin UI; anything `null` will
be filled the same way. **Please design for both the filled and the empty state.**

| Where                       | Field                                          | Current value                                                                                                           |
| --------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| All images everywhere       | `url`, `sizes`                                 | `https://placehold.co/…` placeholders; the firm uploads the real files                                                  |
| `/site`                     | `settings.socials.*`, `footer.socials.*`       | all `null` — no social URLs supplied yet                                                                                |
| `/site`                     | 4 of the 5 `faqSection.items[].answer`         | `[PENDING FROM FIRM]`                                                                                                   |
| `/offices`, `pages/offices` | `coordinates`, `directionsUrl`                 | `null` — the design's maps are placeholders showing streets in Ukraine                                                  |
| `/offices`                  | `phone`, `email`                               | `null` — fall back to the site-wide values                                                                              |
| People                      | `linkedinUrl`, `bio`                           | `null` for every attorney                                                                                               |
| Insights                    | `excerpt` (3 of 4), `body`, `videoUrl`         | `null` or `[PENDING FROM FIRM]`                                                                                         |
| Practice areas              | `body`, `keyServices`, `contacts`              | `null` / empty — the detail page isn't designed                                                                         |
| `pages/home`                | `videoShowcase.videoUrl`                       | `null`                                                                                                                  |
| `pages/home`                | `whyChooseUs.points[].text`                    | `null` — the design shows titles only                                                                                   |
| `pages/about`               | `missionSection.items[]` Vision, Values, Asset | `[PENDING FROM FIRM]` (Mission has real copy)                                                                           |
| `pages/about`               | `awardsList.items[].url`                       | `null`                                                                                                                  |
| `pages/practice-areas`      | `csrBanner.cta`                                | `null` — the CSR page doesn't exist, so there is no link to give. Render the banner without a button until it does      |
| Every page                  | `seo.title`, `seo.description`, `seo.ogImage`  | `null` — no SEO copy supplied yet                                                                                       |
| `/practice-areas/{slug}`    | `seo.title`, `seo.description`                 | `null`. Note practice areas have no `ogImage`, and `/people/{slug}` and `/insights/{slug}` carry no `seo` object at all |
| Jobs                        | `closingDate`                                  | `null`                                                                                                                  |
| Recognitions                | `url`; the whole `recognizedBy` tab            | `null` / empty — only the "achievements" tiles are designed                                                             |

Two content notes you may notice in the copy:

- The Home "about the firm" paragraph calls six people Partners, while the directory lists
  four of them as Associate Partners. That is in the approved design; it is logged as a
  conflict and seeded as designed rather than silently corrected.
- The phone number `(+234) 80000000000` is the design's placeholder and has one digit too
  many.

Both, plus the practice-area count (9 on the page, 7 in the footer, "15+ Areas" in the stats)
and the two identical job descriptions, are listed in `docs/DECISIONS.md` for the firm to
resolve.

---

## Not designed yet

These endpoints serve complete data so you aren't blocked, but their _screens_ have no design.
Expect the shapes to gain fields — additive changes only — once the designs land:

- **Practice area detail** (`/practice-areas/{slug}`)
- **Insight detail** (`/insights/{slug}`)
- **Attorney bio** (`/people/{slug}`) — modal or page is still open; this endpoint serves either
- **The CSR page** — no endpoint at all yet
- **Nav dropdown contents** — only the Practice Areas dropdown is generated (from the
  collection); the others return an empty `children` array
- **Search results UI**, **Sort By options**, the **Discuss a Mandate flow**, the **chat
  widget's open state**, and all **mobile layouts**

## Not in the spec yet

The **admin API** (auth, content CRUD, pages, settings, the media library, submissions) is
being specified next, in phases 4–6. You will get a second handoff for the admin dashboard
covering the editable shape, optimistic locking with `If-Match`, and the role matrix. Nothing
in the public contract above will change as a result.

---

## Questions

Raise anything that looks wrong against the contract rather than working around it — a
workaround in the frontend is much harder to unpick later than a spec fix now. Open questions
we're already tracking, and the assumption we're building to, are in `docs/DECISIONS.md`.
