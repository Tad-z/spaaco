# Frontend handoff — SPA Ajibade & Co. website API

You can start building now. `openapi/openapi.yaml` is the contract, and a Prism mock serves
realistic responses for every public endpoint, using the real copy from the approved designs.

Nothing below is provisional in shape: if a response field changes name, type or nullability
later, it is a breaking change, it gets an entry in `docs/DECISIONS.md`, and you will be told.
What _is_ provisional is some of the content, which is flagged under
[Known placeholders](#known-placeholders).

---

## What changed: insight authors and co-authors (8 Oct 2026)

**Breaking: ship support before the API is deployed.** Each item has an ADR in `docs/DECISIONS.md`.

- `InsightAuthor` has a third variant, `{ type: "writer", name, label, photo }`, for writers with no attorney profile (former staff, guests). Render it like a person: `photo` (a nullable `Image`, so fall back to a default avatar), then `name`, then `label`. There is no profile to link to. About 156 imported articles use it. Until now these came as `type: "firm"` with "SPA AJIBADE & Co." as the label; that is gone, and `firm` now means only the firm itself (ADR-064).
- `InsightDetail.coAuthors` is a new array, shown after the author in the same style. An attorney on the site is `{ type: "person" }`; anyone else is `{ type: "writer", label: "Co-author" }`. It is usually empty. Cards have no co-authors.
- Category cover cards (ADR-063) and the removal of "News Updates" (ADR-062) need nothing from you, beyond dropping any hard-coded News Updates tab.
- Admin: insights gain `authorPhoto` (an image id, only with `authorName`) and `coAuthors: [{ person, name, photo }]` (exactly one of `person` or `name`; `photo` only with `name`).

## What changed in the design update (29 Sep 2026)

The second design drop changed the contract. `openapi/openapi.yaml` and the fixtures are current; this list is what to change on your side. Each item has an ADR in `docs/DECISIONS.md`.

**Breaking**

- Every `hero.image` is now `hero.images`, an array of slides (Home has three; empty until the firm uploads). The CSR banner is `csrBanner.images` (ADR-046).
- Home's `recognitionTabs` and `recognitions` are replaced by `recognitionSection` (heading, image, a `PendingLink` CTA whose `href` is null for now, and `badges`) (ADR-056).
- About's `awardsList.items` are `{ name, slug }`, linking to `/recognition/{slug}`.
- `PracticeAreaDetail` is the designed page: `homeSummary`, `heroIntro`, `heroImages`, `overview`, `coreServices`, `approach`, `industries`, `lead`, `siblings`, `recentPublications`. `body`, `keyServices`, `contacts` and `relatedInsights` are gone (ADR-047).
- `PersonDetail.insights` is now `recentPublications` (6), `PersonDetail.practiceAreas` is `{ slug, title }[]`, and `email` is public (ADR-052).
- The insight detail's `cta` is `{ label, url }` or null ("Read Article" / "Watch Video"), not the card's `{ label, kind }`; it also has a `backLink` (ADR-051).
- Role `nysc_associate` is now `trainee_associate` (ADR-055). Categories `media_coverage` and `webinar_resources` are gone; `events` and `pro_bono` are new.
- The footer's `offices` carry `address`, `phone` and `email`; `links` are the Quick Links from settings, not the nav.
- Admin: `MediaAdmin` has `kind`, and a document's image-only fields are null; `recognitions` is replaced by `recognition-directories`, `awards` and `industries`.

**New**

- `GET /recognitions`, `GET /recognitions/{slug}`, `GET /legal/{key}` (`terms`, `privacy`), and page keys `recognition` and `responsible-business`.
- Every `PersonSummary` carries its card back (`cardBio`, practice-area chips), so cards flip without another request.
- `?practiceArea=<slug>` on `/people`, combinable with `role`; `practiceAreaFilters` on the People and Insights pages for the "Sort By" dropdown (ADR-054).
- Pro bono stories appear only with `?category=pro_bono` — the Responsible Business grid (ADR-049).
- `footer.legalLinks`, `footer.newsletter` (its copy; `enabled` was removed by ADR-066 and subscribe is always open), and the About dropdown in `nav`.

**Not built, on purpose:** the chat assistant, what "Discuss a Mandate" does on an attorney card, where "View Our Recognitions" goes, and CV submissions with no open job.

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
   All ten pages are one operation with ten examples, and Prism cannot pick an example
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

| Method & path                         | Returns                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health`                  | `{ status, db, version }`                                                                                                    |
| `GET /api/v1/site`                    | The global shell — settings, nav, footer, FAQ section, contact callout                                                       |
| `GET /api/v1/pages/{key}`             | One composed page; `key` is one of the 10 page keys                                                                          |
| `GET /api/v1/practice-areas`          | All published practice areas, in the firm's order                                                                            |
| `GET /api/v1/practice-areas/{slug}`   | The designed detail page: hero, overview, services, approach, industries, lead, sidebar, 6 publications                      |
| `GET /api/v1/people`                  | Directory. `?role=`, `?practiceArea=<slug>`, `?sort=seniority\|name_asc\|name_desc`, paginated (default 9)                   |
| `GET /api/v1/people/{slug}`           | Profile: bio, education, memberships, email, primary area, office, their latest 6 insights                                   |
| `GET /api/v1/insights`                | Listing. `?category=`, `?practiceArea=<slug>`, `?sort=newest\|oldest`, paginated (default 9). `pro_bono` only when asked for |
| `GET /api/v1/insights/{slug}`         | Full body or video URL, author, 3 related, the after-body `cta` and `backLink`                                               |
| `GET /api/v1/recognitions`            | Directories (with wordmarks) and the awards featured on Home                                                                 |
| `GET /api/v1/recognitions/{slug}`     | One directory's page: hero and its awards, newest year first                                                                 |
| `GET /api/v1/legal/{key}`             | `terms` or `privacy`                                                                                                         |
| `GET /api/v1/offices`                 | All offices, in page order: Lagos, Abuja, Ibadan                                                                             |
| `GET /api/v1/jobs`                    | Open vacancies only                                                                                                          |
| `GET /api/v1/jobs/{id}`               | One vacancy                                                                                                                  |
| `GET /api/v1/faqs`                    | The FAQ set (also embedded in `/site`)                                                                                       |
| `GET /api/v1/search?q=`               | `{ practiceAreas, people, insights }`, max 5 each, `q` is 2–100 chars                                                        |
| `POST /api/v1/enquiries`              | 201 `{ data: { reference } }`                                                                                                |
| `POST /api/v1/messages`               | 201 `{ data: { reference } }`                                                                                                |
| `POST /api/v1/jobs/{id}/applications` | multipart, 201 `{ data: { reference } }`                                                                                     |

### Fetch `/site` once

The FAQ section, contact callout and footer are **not** repeated inside page payloads. Fetch
`/site` once, keep it, and reuse it on every page.

### What each page embeds

Each page arrives with its referenced data already expanded, so a page needs one request.

Every hero's pictures are `images`, an array (three slides on Home, one elsewhere).

- **home** — hero, aboutFirm, videoShowcase (with `caption`), `recognitionSection` (heading,
  image, a "View Our Recognitions" CTA with `href: null` for now, and `badges`),
  `practiceAreas` (the ones flagged for Home, in Home tab order, each card's `summary` being
  its Home text), `leadership` (3 attorneys, card backs included), whyChooseUs,
  `latestInsights` (up to 6, never pro bono), plus section headers.
- **about** — hero, story (with `quotePerson` as a full PersonSummary, and `profileDownload`
  linking the firm profile PDF), stats (computed values already resolved), missionSection
  (bodies are HTML), principles, awardsList (one row per recognition directory:
  `{ name, slug }`, linking to `/recognition/{slug}`).
- **practice-areas** — hero, gridSection, `practiceAreas` (all 9), csrBanner (a carousel;
  its CTA goes to `/responsible-business`).
- **people** — hero, directorySection, `roleFilters`, `practiceAreaFilters`. The grid comes
  from `GET /people`.
- **insights** — `hero` is **`null` by design** (the page opens with the carousel), `featured`
  (≤ 3), `categoryFilters`, `practiceAreaFilters`, listingSection. The grid comes from
  `GET /insights`.
- **careers** — hero, jobsSection (with an `emptyState` only when no job is open), `jobs`.
- **faq** — hero only.
- **offices** — hero, `offices`.
- **recognition** — the labels every directory page shares; render those pages from
  `GET /recognitions/{slug}`, which embeds them.
- **responsible-business** — `title`, `images`, `backLink`. Its grid is
  `GET /insights?category=pro_bono`.

Filter tabs (`roleFilters`, `categoryFilters`) are `{ value, label }`. An **empty `value`**
means "no filter" — that's the "All insights & news" tab. Pass a non-empty `value` straight
through as the `role` or `category` query parameter.

The People tabs are Management, Partners, Associates and Consultants (ADR-068). There is no
"all" tab, so open on the first one. These are **tab groups, not stored roles**: Management is
whoever the firm ticks (`featuredInLeadership`, the same list as the Home leadership row),
Partners is managing partner to associate partner, and Associates is senior associate to
trainee associate. A result can come back with a different `role` from the tab you sent, so
render `roleLabel`.

**Two new roles, `executive` and `consultant` (ADR-068).** Accept them wherever you validate
`role`, and add them to the dashboard's role dropdown. An `executive` is management who isn't
a lawyer (the COO); they appear only under Management, titled by their `jobTitle`. Label the
`featuredInLeadership` checkbox "Management".

### Insight cards

- `author` is a discriminated union on `type`:
  `{ type: "person", person: PersonSummary }`,
  `{ type: "writer", name, label: "Author", photo }` for a writer with no profile (ADR-064), or
  `{ type: "firm", name: "SPA AJIBADE & Co.", label: "Law Firm" }`. For the firm, render your
  own logo mark — the API sends no firm logo, because the logo is a frontend asset.
- The detail adds `coAuthors`, the same union, shown after the author; a writer there is
  labelled "Co-author".
- `chips` is precomputed for you: the first category label, then the first practice area
  title, or the second category label when there is no practice area.
- `cta` tells you which button to draw: `{ label: "Read More", kind: "read_more" }` or
  `{ label: "Watch Video", kind: "watch_video" }`.
- On the **detail** endpoint `cta` is different: the link after the body,
  `{ label: "Read Article" | "Watch Video", url }`, or `null` when there is nothing to link.
- `author.person` is a full PersonSummary, so it carries the card back too.

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

| Where                       | Field                                                 | Current value                                                                                                           |
| --------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| All images everywhere       | `url`, `sizes`                                        | `https://placehold.co/…` placeholders; the firm uploads the real files                                                  |
| `/site`                     | `settings.socials.*`, `footer.socials.*`              | all `null` — no social URLs supplied yet                                                                                |
| `/offices`, `pages/offices` | `coordinates`, `directionsUrl`                        | `null` — the design's maps are placeholders showing streets in Ukraine                                                  |
| `/offices`                  | `phone`, `email`                                      | `null` — the footer already falls back to the site-wide values for you                                                  |
| People                      | `linkedinUrl`, `instagramUrl`, `email`                | `null` for every attorney                                                                                               |
| People except the MP        | `bio`, `cardBio`, `education`, `memberships`          | `[PENDING FROM FIRM]` or empty                                                                                          |
| Insights                    | `excerpt` (3 of 4), `body`, `videoUrl`, `externalUrl` | `null` or `[PENDING FROM FIRM]`; so article #1's detail `cta` is `null`                                                 |
| Pro bono stories            | the 12 cards                                          | one real story plus 11 demo repeats (`-2`…`-12`), dev only, to fill the paginated grid                                  |
| `pages/about`               | `story.profileDownload.document`                      | a placeholder PDF record in dev                                                                                         |
| Recognition                 | Legal 500 and Who's Who Legal awards; wordmarks       | none yet / placeholders                                                                                                 |
| Legal pages                 | `body`                                                | `[PENDING FROM FIRM]`                                                                                                   |
| `pages/home`                | `videoShowcase.videoUrl`                              | `null`                                                                                                                  |
| `pages/home`                | `whyChooseUs.points[].text`                           | `null` — the design shows titles only                                                                                   |
| `pages/home`                | `recognitionSection.cta.href`                         | `null` — the destination is not decided                                                                                 |
| Every page                  | `seo.title`, `seo.description`, `seo.ogImage`         | `null` — no SEO copy supplied yet                                                                                       |
| `/practice-areas/{slug}`    | `seo.title`, `seo.description`                        | `null`. Note practice areas have no `ogImage`, and `/people/{slug}` and `/insights/{slug}` carry no `seo` object at all |
| Jobs                        | `closingDate`                                         | `null`                                                                                                                  |

Two content notes you may notice in the copy:

- The Home "about the firm" paragraph calls six people Partners, while the directory lists
  four of them as Associate Partners. That is in the approved design; it is logged as a
  conflict and seeded as designed rather than silently corrected.
- The phone number `(+234) 80000000000` is the design's placeholder and has one digit too
  many.

Both, plus the practice-area count (9 on the page, "15+ Areas" in the stats), the two
identical job descriptions, the Chambers awards shown under IFLR 1000, and the pro bono
story's two dates, are listed in `docs/DECISIONS.md` for the firm to resolve.

---

## Not designed yet, or not built

Every detail page (practice area, insight, attorney, recognition, Responsible Business) is now
designed and served as designed. What remains:

- **Not built, on purpose:** the chat assistant, what "Discuss a
  Mandate" does on an attorney card, where "View Our Recognitions" goes, and CV submissions
  when no job is open.
- **Still undesigned:** the search results UI, the Discuss a Mandate flow, and all mobile
  layouts.

## The admin API

The admin API is in the spec too — auth, content CRUD for the nine collections, pages,
settings, legal pages, the media library (images and PDFs) and submissions. `docs/FRONTEND_GUIDE.md`
walks through it: the editable shape, optimistic locking with `If-Match`, and the role matrix.

---

## Questions

Raise anything that looks wrong against the contract rather than working around it — a
workaround in the frontend is much harder to unpick later than a spec fix now. Open questions
we're already tracking, and the assumption we're building to, are in `docs/DECISIONS.md`.
