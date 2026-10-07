# Design Update v2: Changes to the Backend

This document covers the second design drop (29 Sep 2026). It lists every change that affects the API, the decisions the project lead made about them, and the new roadmap tasks.

The new and changed copy lives in `docs/SEED_CONTENT_V2.md`. **Where this document conflicts with an earlier doc, this document wins.** Fold its content into `DATA_MODEL.md`, `API.md`, `PROJECT_BRIEF.md` and `SEED_CONTENT.md` as part of task D.1.

There is no production data yet, so schema changes may be destructive. Update the fixtures and seed, and reseed.

---

## 1. Decisions from the project lead

| #   | Topic                                    | Decision                                                                                                                                                                                                                                             |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | FAQ and Offices                          | The FAQ page stays (it's linked from the footer's Quick Links). Offices appear as a footer column; keep the offices page endpoint too.                                                                                                               |
| 2   | Chat assistant ("Chat with SPAACO AI")   | In scope later. **Do not build now.**                                                                                                                                                                                                                |
| 3   | Newsletter signup (footer)               | **Do not build now.**                                                                                                                                                                                                                                |
| 4   | Terms of Service and Privacy Policy      | Build them as editable legal pages.                                                                                                                                                                                                                  |
| 5   | Practice area descriptions               | Follow the design: **three separate texts** (grid card, Home card, detail hero).                                                                                                                                                                     |
| 6   | Industries                               | A shared list that practice areas pick from (our choice, based on the design).                                                                                                                                                                       |
| 7   | Core Services                            | **Every** practice area has them, 3 cards in the designs.                                                                                                                                                                                            |
| 8   | Hero and CSR carousels                   | Only the image changes between slides. The text is shared.                                                                                                                                                                                           |
| 9   | CSR                                      | "Learn About Our CSR" opens a **Responsible Business** page. Its stories are insights in a "Pro Bono & Community Commitment" category.                                                                                                               |
| 10  | "Read Article"                           | A link at the end of an article's body (the article detail design). Videos show "Watch Video" in the same place.                                                                                                                                     |
| 11  | "Discuss a Mandate" on an attorney card  | Does nothing for now. Frontend only; no backend work.                                                                                                                                                                                                |
| 12  | "View Our Recognitions" on Home          | Destination pending. Return the CTA with `href: null`.                                                                                                                                                                                               |
| 13  | "Send your CV" when there are no roles   | Behaviour pending. Serve the empty-state copy only.                                                                                                                                                                                                  |
| 14  | "Sort By" on Our People **and** Insights | It's a **practice-area filter**. It combines with the tabs (role tabs on People, category tabs on Insights).                                                                                                                                         |
| 15  | Last role tab                            | **Trainee Associates.**                                                                                                                                                                                                                              |
| 16  | Home video caption                       | "Our Managing Partner on what fifty-nine years of practice has taught us."                                                                                                                                                                           |
| 18  | **Guiding rule**                         | **The design is the source of truth for everything.** Where screens show something, build and seed exactly that. Where two screens disagree, log the conflict and follow the screen that owns the content (e.g. the detail page for detail content). |
| 17  | Name and author conflicts                | The spelling is **Sowunmi**. Photos and authors always come from the linked Person, so cards and detail pages can't disagree.                                                                                                                        |

---

## 2. Site-wide (`GET /site`)

- **Nav** (structure in settings, labels editable):
  - Home
  - About Us ▾, with anchors into `/about`: Our Story (`#story`), Mission, Vision & Values (`#mission`), Our Principles (`#principles`), Recognition (`#recognition`)
  - Practice Areas (no dropdown)
  - Our People (no dropdown)
  - Insights & News ▾, whose items are the **public insight categories** (Firm News, Articles, Insights, Regulatory Updates, Events), each linking to `/insights?category=<value>`
  - Careers
- **Footer:**
  - **Quick Links:** Home, About Us, Practice Areas, Our People, Insights & News, Careers, FAQ's.
  - **Practice Areas column:** all 9 areas (`showInFooter: true` for all).
  - **Offices column:** each office's name, address, **email and phone**, so `offices.email` and `offices.phone` are now shown publicly. Fall back to the site-wide values when empty.
  - **Legal links:** Terms of Service → `/legal/terms`, Privacy Policy → `/legal/privacy`.
  - **Newsletter block:** `newsletter` { title: "Subscribe for legal insights", note: "Your information is kept confidential", enabled: false }. The copy is editable; there is **no subscribe endpoint** yet.
- **Contact callout:** the secondary CTA is now "Explore Our Practice Areas" → `/practice-areas` (it was View our offices).
- **Chat:** settings may hold `chat` { enabled: false } only. Don't build any chat endpoints.

## 3. Home (`GET /pages/home`)

| Section              | Change                                                                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero`               | Now has `images: Media[]` (3 slides). One title, subtitle and set of CTAs across all slides. **This applies to every page's `Hero` shape:** `image` becomes `images` (min 1). Single-image heroes are just one-item arrays.             |
| `videoShowcase`      | Adds `caption` (string).                                                                                                                                                                                                                |
| `recognitionSection` | **New**, replacing the old tabbed recognition block: eyebrow "Recognition", title, `image`, `cta` { label: "View Our Recognitions", href: null }, and `badges`: the **awards** with `featuredOnHome: true`, in order (4 in the design). |
| `practiceAreas`      | Cards use **`homeSummary`**, not `summary`.                                                                                                                                                                                             |
| `leadership`         | Each person includes **card-back data**: `roleLabel`, `practiceAreas` (chips: title + slug), `cardBio`.                                                                                                                                 |

## 4. About (`GET /pages/about`)

- **`story`:** add `profileDownload` { leadText: "To learn more about the firm, you may download a copy of our profile", linkLabel: "here", document: Media (PDF) }. Paragraph 4 changed (see seed).
- **`missionSection.items[].body`:** now **sanitised HTML**, because "Our Asset" has bold phrases. The copy for all four items is final.
- **`awardsList`:** the section keeps eyebrow, title and image, but the rows come from the **recognition directories** collection, in order: `{ name, slug }`, each linking to `/recognition/:slug`.

## 5. Recognition (new model, replacing `recognitions`)

**`recognitionDirectories`** (content collection)

| Field        | Notes                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| name         | "IFLR 1000", "Chambers Global", "Legal 500", "Who's Who Legal"                                                       |
| slug         |                                                                                                                      |
| logo         | Media, the wordmark used in the "Independently Recognized By" tile                                                   |
| heroSubtitle | Default "Recognized by one of the legal industry's leading directories for the quality and consistency of our work." |
| heroImages   | Media[]                                                                                                              |
| order        |                                                                                                                      |

**`awards`** (content collection)

| Field          | Notes                                      |
| -------------- | ------------------------------------------ |
| directory      | → RecognitionDirectory, required           |
| title          | "Chambers Global: Top Ranked Leading Firm" |
| year           | Number                                     |
| badge          | Media                                      |
| featuredOnHome | Boolean                                    |
| order          |                                            |

**Endpoints**

- `GET /recognitions`: directories (name, slug, logo), plus `achievements` (awards where featuredOnHome). This serves the two-tab component ("Our Achievements" / "Independently Recognized By"), which exists as a component but isn't placed on a page yet.
- `GET /recognitions/:slug`: `{ directory, hero, awards }`, with awards sorted by year descending. `hero` is { title: directory.name, subtitle: heroSubtitle, images, primaryCta: Discuss a Mandate, secondaryCta: Meet Our People }. The shared labels (the "Awards by the years" eyebrow and the CTAs) live in a `recognition` page singleton.

Remove the old `recognitions` model, its `tab` enum and its endpoints. Update `media-refs`, cache tags and the draft canary.

## 6. Practice areas

**Page (`GET /pages/practice-areas`):** `csrBanner` gets `images: Media[]` (3 slides, shared text) and its CTA points to `/responsible-business`.

**PracticeArea fields**

| Field                                    | Used on                  | Notes                                                                        |
| ---------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| title                                    | everywhere               |                                                                              |
| shortLabel                               | Home tabs                |                                                                              |
| summary                                  | Practice Areas grid card | Clamped by the frontend                                                      |
| homeSummary                              | Home carousel card       | **new**                                                                      |
| heroIntro                                | Detail hero paragraph    | **new**                                                                      |
| image                                    | Cards                    |                                                                              |
| heroImages                               | Detail hero              | **new**, Media[]                                                             |
| overview                                 | Detail, first paragraph  | **new**, plain text                                                          |
| coreServices                             | Detail                   | **new**, `[{ title, description }]`, 1–6 items (3 in every design), required |
| approach                                 | Detail                   | **new**, `{ text, points: string[] }`, 4 points in the design                |
| industries                               | Detail                   | **new**, `[→ Industry]`, 4 in the design                                     |
| lead                                     | Detail sidebar           | **new**, → Person (the "Practice Lead" card)                                 |
| featuredOnHome, showInFooter, order, seo |                          | `showInFooter` is true for all 9                                             |

Remove `body`, `keyServices` and `contacts`; the new fields replace them.

**`industries`** (new small collection): `name`, `slug`, `order`, `status`. Admins manage it with the generic CRUD. Practice areas reference it.

**`GET /practice-areas/:slug` returns:**

- the area, with every field above;
- `lead`: PersonSummary plus `email` and `linkedinUrl` (the card shows LinkedIn and email icons);
- `industries`: `[{ name, slug }]`;
- `siblings`: all published areas `[{ title, slug }]` in order, for the sidebar;
- `recentPublications`: the 6 latest insights tagged with this area, excluding pro bono (see §9).

## 7. Our People

- **Role enum:** rename `nysc_associate` → `trainee_associate` (label "Trainee Associate", tab "Trainee Associates"). Tabs are Our Attorneys (all), Partners (**includes the Managing Partner**), Associate Partners, Senior Associates, Associates, Trainee Associates.
- **`GET /people`:** add a `practiceArea=<slug>` filter, combinable with `role`. It matches `practiceAreas` or `primaryPracticeArea`.
- **`GET /pages/people`:** also returns `practiceAreaFilters: [{ value: slug, label: title }]` for the dropdown, which is headed "Practice Area".
- **Designed states:** "Page 1 of 1", with Previous and Next disabled when there's one page. `meta` already covers this.

**Person fields**

| Field               | Notes                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| cardBio             | **new**. The short italic line on the card back.                                                     |
| bio                 | Now **two or more paragraphs**, sanitised HTML.                                                      |
| primaryPracticeArea | **new**, → PracticeArea. Shown under the portrait on the profile.                                    |
| practiceAreas       | Existing. Shown as the card-back chips.                                                              |
| education           | **new**. `{ intro (text), entries: [{ qualification, year }] }`                                      |
| memberships         | **new**. `string[]`                                                                                  |
| instagramUrl        | **new**                                                                                              |
| email               | **Now public** (shown on the profile and the practice-lead card). This reverses the earlier default. |

**`GET /people/:slug`:** the full person with all the fields above, plus `recentPublications` (the latest 6 insights where they're the author).

**Card and summary shapes:** PersonSummary gains `cardBio` and `practiceAreas` (title + slug), so every card can flip without another request.

## 8. Insights

- **Categories:** `firm_news, articles, insights, regulatory_updates, events, pro_bono`.
  - Remove `media_coverage` and `webinar_resources`.
  - Relabel the luncheon video as `events` + `firm_news`.
  - `pro_bono` is labelled "Pro Bono & Community Commitment".
- **Public tabs:** All insights & news, Firm News, Articles, Insights, Regulatory Updates, Events. `pro_bono` is not a tab.
- **`GET /insights`:** the `practiceArea=<slug>` filter already exists. `GET /pages/insights` also returns `practiceAreaFilters` for the "Sort By" dropdown.
- **Detail (`GET /insights/:slug`):**
  - category chip(s), date, title, `coverImage`, `body` (HTML), and the author block;
  - `backLink` { label, href }. This is "Back to Insights & News" → `/insights`, or for pro bono, "Back to Pro Bono & Community Commitment" → `/responsible-business`;
  - `cta`, a link rendered after the body:
    - article: `{ label: "Read Article", url }`, where `url` is either `externalUrl` or an uploaded `document` (PDF). Null if the article has neither.
    - video: `{ label: "Watch Video", url: videoUrl }`.
- **New insight fields:** `externalUrl` (optional) and `document` (→ Media PDF, optional). Validation: at most one of the two.
- **Author sync:** the author is always a Person reference, or null for the firm. Cards and detail pages both serialize from it. Seed article #1's author as **John Onyido** (as on the card).

## 9. Responsible Business (new page)

- **`GET /pages/responsible-business`:** `{ title: "RESPONSIBLE BUSINESS", images: Media[] (3-slide carousel), backLink: { label: "Back to Practice Areas", href: "/practice-areas" } }`. Nav highlight is Practice Areas (frontend).
- **Grid:** `GET /insights?category=pro_bono` (9 per page, paginated; "Page 2 of 10" is designed). Cards show the "Pro Bono & Community Commitment" chip, the date, the title, the firm as author, and Read More.
- **`pro_bono` insights are excluded** from the main Insights "All" listing, from Home "Recent Publications", and from practice-area and person publications, as in the design (none of those screens show a pro bono card). They appear only when `category=pro_bono` is requested explicitly. Keep the rule in one constant: `EXCLUDED_FROM_MAIN_LISTING = ['pro_bono']`.

## 10. Careers

`jobsSection.emptyState` { title, body (HTML, with a mailto link), ctaLabel: "Send your CV" } is served whenever there are no open jobs. The CTA's behaviour is pending (decision 13).

## 11. FAQ

The first answer is now final (see seed). The FAQ page stays.

## 12. Legal pages (new)

The **`legalPages`** collection is keyed `terms` and `privacy`: `{ key, title, body (HTML), updatedAt, status }`. The endpoint is `GET /legal/:key`. Admins get GET/PUT through the singleton pattern (If-Match and revision apply). The content is `[PENDING FROM FIRM]`.

## 13. Media: PDF documents

The media library accepts **`kind: "document"`**: PDF only, checked by magic bytes (`%PDF`), up to 20 MB, with a required `title`. Documents have no `sizes`, and their public shape is `{ url, title, bytes, mimeType }`. They're used by `about.story.profileDownload.document` and `insight.document`. Register both fields in `constants/media-refs.ts`. Images keep the existing rules. The media library listing gets a `kind` filter.

## 14. Not built now (keep out of the spec)

- The chat assistant
- ~~Newsletter subscribe~~ (built since: ADR-065)
- Behaviour of "Discuss a Mandate" on attorney cards
- The "View Our Recognitions" destination
- General CV submissions with no job

## 15. Content conflicts (update DECISIONS.md)

- **Resolved:** the Sowunmi spelling; the "Partners" tab includes the MP; the footer lists all 9 practice areas; photos and authors now come from the linked Person (this fixes the mismatched lead photos on the Telecoms and Real Estate pages, and the article author mismatch).
- **Still open:** the "15+ Areas" stat and the About text (5 areas) versus 9 areas. The IFLR 1000 recognition page example lists "Chambers Global: Top Ranked Leading Firm" rows; seed them under IFLR 1000 exactly as designed and log it. The footer's office order is Lagos, Ibadan, Abuja, while the Offices page's is Lagos, Abuja, Ibadan (keep using `order`). The "TAX" title appears in caps on some screens (seed "Tax"; the frontend styles the case).

## 16. Open questions (build to the default until answered)

| #   | Question                                       | Default                                  |
| --- | ---------------------------------------------- | ---------------------------------------- |
| P2  | Is the Our Offices page still linked anywhere? | Keep the endpoint; the frontend decides. |

P1 (pro bono in the main listings) is resolved: follow the design, so they're excluded (§9).

---

## New roadmap tasks: Phase D (do before continuing 5.3)

5.3 (pages PUT/PATCH) and 5.4 (media) depend on the page schemas and media kinds changed here, so Phase D comes first. Every task follows the standard loop: spec first, then types:gen, tests, implementation, `check`, tick, commit.

- [ ] **D.1 Docs and spec.** Fold this document into DATA_MODEL, API, PROJECT_BRIEF and SEED_CONTENT, and add ADRs for decisions 5, 6, 9, 10, 14 and 15, plus the Hero `images` change and PDF documents. Update `openapi.yaml` for every public change above, then regenerate the types and update the fixtures from `SEED_CONTENT_V2.md`.
  - **Accept:** spec:lint, types:check and fixture validation pass.
- [ ] **D.2 Hero, settings and FAQ.** Change Hero `image` to `images`. Add the nav, footer, legal-link and newsletter-copy changes, and the new contact callout CTA.
  - **Accept:** every page composer returns `hero.images`, and `/site` matches its fixture.
- [ ] **D.3 Recognition rebuild.** Build `recognitionDirectories` and `awards`, the `recognition` page singleton, `GET /recognitions` and `GET /recognitions/:slug`, Home `recognitionSection`, and About `awardsList` from directories. Remove the old `recognitions` model.
  - **Accept:** the draft canary covers both new collections; a draft award never appears on Home or on a directory page.
- [ ] **D.4 Practice areas.** Add the new fields, the `industries` collection, and the detail endpoint with siblings, lead, industries and recentPublications. Home uses `homeSummary`, and the CSR banner uses images.
  - **Accept:** the detail response for all 9 seeded areas matches the spec; a draft lead or industry is excluded (publishedPopulate).
- [ ] **D.5 People.** Rename the enum to trainee_associate. Add the practiceArea filter and `practiceAreaFilters`, the new person fields, card-back data in PersonSummary, and profile `recentPublications`.
  - **Accept:** role + practiceArea filters combine correctly with pagination meta; the Partners filter includes the MP.
- [ ] **D.6 Insights and Responsible Business.** Apply the new categories and relabelling, add `externalUrl` and `document`, and implement the detail `cta` and `backLink`, `practiceAreaFilters`, the `pro_bono` exclusion rule, and `GET /pages/responsible-business`.
  - **Accept:** pro_bono is absent from every default listing and present with `category=pro_bono`; the article CTA resolves from externalUrl or document; the video CTA resolves from videoUrl.
- [ ] **D.7 Careers empty state and legal pages.** Add `jobsSection.emptyState`, the `legalPages` collection, `GET /legal/:key`, and the admin GET/PUT.
  - **Accept:** careers returns the empty state when no jobs are open; an unknown legal key returns 404.
- [ ] **D.8 Media documents.** Only if 5.4 isn't done yet: fold PDF support into 5.4's spec (kind filter, 20 MB, magic bytes). Otherwise, add it now.
  - **Accept:** an uploaded PDF works as the profile download and as an insight document; a fake PDF returns 415; an in-use document can't be deleted.
- [ ] **D.9 Reseed and review.** Reseed; confirm every `/pages/:key` fixture round-trip passes; run the api-reviewer on Phase D and fix its blockers.
