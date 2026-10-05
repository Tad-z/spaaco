# Data Model (MongoDB / Mongoose)

## Principles

- **Embed** what belongs only to its parent: page sections, an office's hours, a job's chips.
- **Reference** (by ObjectId) anything shared or independently edited: people, practice areas, insights, media. This gives us a single source of truth. For example, the Home tabs, the Practice Areas grid, the footer and the nav dropdown all read the same `practiceAreas` collection, so they can never disagree.
- Every **content** collection uses the shared `contentPlugin` (in `src/models/plugins/content.plugin.ts`, typed by `IContentFields` in `src/interfaces/common.interface.ts`), which adds:
  - `slug`: String, required, unique, lowercase kebab-case, generated from the title/name if missing
  - `status`: `'draft' | 'published'`, default `'draft'`
  - `publishedAt`: Date, set when first published
  - `order`: Number, default 0 (manual sort)
  - `createdBy`, `updatedBy`: ObjectId → User
  - `timestamps: true`
  - a `toJSON` transform: `_id` → `id` (string), and removes `__v`
- Rich-text fields hold **sanitised HTML** strings.
- Image fields are an ObjectId → `Media`, and are populated into the API image shape (see API.md).
- Dates are stored as Date and serialised as ISO 8601 strings.

## Shared sub-schemas (`src/models/schemas/common.schemas.ts`; interfaces in `src/interfaces/common.interface.ts`)

```js
Link   = { label: String, href: String, kind: 'internal'|'external'|'action' }
// action hrefs: 'action:mandate' | 'action:chat' | 'action:message' | 'action:call'
PendingLink = { label: String, href: String|null, kind: LinkKind|null }
// a CTA whose destination is not decided yet: href and kind are both null, or both set
Hero   = { title, subtitle, images: [→Media], primaryCta: Link, secondaryCta: Link }
// images are the carousel slides; only the image changes, the text is shared (ADR-046).
// Empty until the firm uploads one — the design expects at least one.
Section = { eyebrow?: String, title: String, body?: String /* html */ }
IconItem = { icon: String /* icon key the frontend maps, e.g. 'shield-check' */, title, text? }
```

## Content collections

### `practiceAreas`

| Field          | Type                          | Notes                                                                                                                                                                 |
| -------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| title          | String, required              | "Dispute Resolution & Arbitration"                                                                                                                                    |
| shortLabel     | String, required              | Tab label on Home: "Dispute Resolution"                                                                                                                               |
| summary        | String, required              | The Practice Areas **grid card** (plain; clamped by the frontend)                                                                                                     |
| homeSummary    | String, required              | The **Home carousel card**. Equals `summary` for every area but Intellectual Property (ADR-047)                                                                       |
| heroIntro      | String, required              | The **detail hero** paragraph                                                                                                                                         |
| image          | →Media                        | Cards                                                                                                                                                                 |
| heroImages     | [→Media]                      | Detail hero slides                                                                                                                                                    |
| overview       | String (plain), nullable      | Detail, first paragraph                                                                                                                                               |
| coreServices   | [{ title, description }], 1–6 | Required. Three in every design                                                                                                                                       |
| approach       | { text, points: [String] }    | Four points in the design                                                                                                                                             |
| industries     | [→Industry]                   | Four in the design (ADR-048)                                                                                                                                          |
| lead           | →Person, nullable             | The "Practice Lead" sidebar card                                                                                                                                      |
| featuredOnHome | Boolean, default true         |                                                                                                                                                                       |
| homeOrder      | Number, nullable              | Position in the Home tab bar, which differs from the Practice Areas page order. Null when not featured on Home. Home sorts by `homeOrder`, the page sorts by `order`. |
| showInFooter   | Boolean, default true         | True for all nine                                                                                                                                                     |
| seo            | { title, description }        | No `ogImage`: only pages carry one                                                                                                                                    |

`body`, `keyServices` and `contacts` are gone: the detail design replaced them with `overview`, `coreServices` and `lead`.
Indexes: `{status:1, order:1}` and a text index on `title, summary, overview`.

### `industries`

`name` (String, required), plus the content plugin's `slug`, `order` and `status`. The shared list practice areas pick from; managed with the generic CRUD. A draft industry is dropped from every practice area that references it (`publishedPopulate`).

### `people`

| Field                | Type                                          | Notes                                                                                          |
| -------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| honorific            | String                                        | "Dr.", "Mrs.", "Mr."                                                                           |
| firstName, lastName  | String, required                              |                                                                                                |
| postNominals         | String                                        | "SAN"                                                                                          |
| displayName          | virtual                                       | e.g. "Dr. Babatunde Ajibade, SAN"                                                              |
| role                 | enum, required                                | `managing_partner, partner, associate_partner, senior_associate, associate, trainee_associate` |
| roleLabel            | virtual                                       | "Managing Partner", "Trainee Associate"…                                                       |
| photo                | →Media                                        |                                                                                                |
| linkedinUrl          | String                                        |                                                                                                |
| instagramUrl         | String                                        |                                                                                                |
| email                | String                                        | **Public** — shown on the profile and the practice-lead card (ADR-052 reverses Q9)             |
| cardBio              | String                                        | The short italic line on the back of the card                                                  |
| bio                  | String (html)                                 | Two or more paragraphs                                                                         |
| quote                | String                                        | Only used for the MP's pull quote on About                                                     |
| primaryPracticeArea  | →PracticeArea, nullable                       | Shown under the portrait on the profile                                                        |
| practiceAreas        | [→PracticeArea]                               | The card-back chips                                                                            |
| education            | { intro, entries: [{ qualification, year }] } |                                                                                                |
| memberships          | [String]                                      |                                                                                                |
| office               | →Office                                       |                                                                                                |
| featuredInLeadership | Boolean                                       | The Home leadership row                                                                        |
| legacy               | `{ source, legacyId, importedAt }`, nullable  | Set only on imported records (ADR-059). Admin read-only; never public                          |

**Seniority sort** is role rank (managing_partner = 0 … trainee_associate = 5), then `order`, then `lastName`.
**Role filtering** treats `partner` as a group that also matches `managing_partner`, because the directory has a "Partners" tab and no Managing Partner tab (DECISIONS Q3).
**Practice-area filtering** (`?practiceArea=<slug>`) matches `practiceAreas` or `primaryPracticeArea`, and combines with `role`.
People carry no `seo` fields, so `/people/:slug` returns none.
People and insights both index `{ 'legacy.source': 1, 'legacy.legacyId': 1 }` (sparse), so an import can be found or rolled back with one query.
Indexes: `{status:1, role:1, order:1}`, `{status:1, practiceAreas:1}` and a text index on `firstName, lastName, bio`.

### `insights`

| Field         | Type                                | Notes                                                                                  |
| ------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| title         | String, required                    |                                                                                        |
| excerpt       | String                              | Featured carousel text                                                                 |
| body          | String (html)                       | Articles                                                                               |
| format        | enum `article` / `video`, required  | Controls "Read More" vs "Watch Video"                                                  |
| videoUrl      | String                              | Required if format = video                                                             |
| externalUrl   | String, optional                    | Where the article's "Read Article" link goes                                           |
| document      | →Media (`kind: document`), optional | An uploaded PDF the "Read Article" link opens. At most one of `externalUrl`/`document` |
| categories    | [enum], min 1                       | `firm_news, articles, insights, regulatory_updates, news_updates, events, pro_bono`    |
| practiceAreas | [→PracticeArea]                     |                                                                                        |
| author        | →Person, optional                   | **null means the firm is the author**                                                  |
| coverImage    | →Media                              |                                                                                        |
| featured      | Boolean                             | Top carousel (max 3 shown)                                                             |
| publishedAt   | Date                                | Displayed as "June, 2026." by the frontend                                             |
| legacy        | `{ source, legacyId, importedAt }`  | Set only on imported records (ADR-059). Admin read-only; never public                  |

Card chips = the first category label, then the first practice area title. If there's no practice area, show the second category.
**`pro_bono` ("Pro Bono & Community Commitment") is excluded from every listing unless it is asked for by name** — the main listing, the featured carousel, Home's Recent Publications, and practice-area and person publications. The rule lives in one constant, `EXCLUDED_FROM_MAIN_LISTING` (ADR-049).
Insights carry no `seo` fields, so `/insights/:slug` returns none.
Indexes: `{status:1, categories:1, publishedAt:-1}` and `{status:1, featured:1, publishedAt:-1}`, plus a text index on `title, excerpt, body`.

### `offices`

| Field         | Type                                                  | Notes                                                                            |
| ------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| name          | String                                                | "Lagos" (displayed as "Lagos Office")                                            |
| address       | String                                                |                                                                                  |
| location      | GeoJSON Point `{type:'Point', coordinates:[lng,lat]}` | Map pin. Coordinates are TBD, so seed with nulls                                 |
| directionsUrl | String                                                | Generated from coordinates if empty                                              |
| hours         | String                                                | "8:00 AM to 4:00 PM, Monday to Friday"                                           |
| phone, email  | String                                                | Shown publicly in the footer's Offices column. Fall back to the site-wide values |

### `recognitionDirectories` (replaces `recognitions`)

| Field        | Type     | Notes                                                                                                                |
| ------------ | -------- | -------------------------------------------------------------------------------------------------------------------- |
| name         | String   | "IFLR 1000", "Chambers Global", "Legal 500", "Who's Who Legal"                                                       |
| logo         | →Media   | The wordmark in the "Independently Recognized By" tile                                                               |
| heroSubtitle | String   | Default "Recognized by one of the legal industry's leading directories for the quality and consistency of our work." |
| heroImages   | [→Media] |                                                                                                                      |

Plus the content plugin's `slug`, `order` and `status`. Each directory has a page, `GET /recognitions/:slug`.

### `awards`

| Field          | Type                            | Notes                                                         |
| -------------- | ------------------------------- | ------------------------------------------------------------- |
| directory      | →RecognitionDirectory, required |                                                               |
| title          | String, required                | "Chambers Global: Top Ranked Leading Firm"                    |
| year           | Number, required                |                                                               |
| badge          | →Media                          |                                                               |
| featuredOnHome | Boolean                         | A badge in the Home Recognition band and the Achievements tab |

Plus `slug`, `order` and `status`. A directory page lists its published awards by year, newest first; ties keep `order`.

### `faqs`

`question` (String), `answer` (String html), `order`, `status`. The same set is shown site-wide.

### `jobs`

| Field          | Type                                                    | Notes                                      |
| -------------- | ------------------------------------------------------- | ------------------------------------------ |
| title          | String                                                  | "Associate"                                |
| practiceArea   | →PracticeArea                                           |                                            |
| description    | String (html)                                           |                                            |
| experience     | String                                                  | "2–4 years experience"                     |
| employmentType | enum `full_time, part_time, contract, internship, nysc` | chip label derived                         |
| workMode       | enum `onsite, hybrid, remote`                           |                                            |
| office         | →Office                                                 | Location chip                              |
| closingDate    | Date, optional                                          | Hidden from the public API after this date |
| isOpen         | Boolean, default true                                   |                                            |

## Singletons

### `settings` (exactly one document, `key: 'site'`)

`firmName`, `legalDescriptor` ("Legal Practitioners, Arbitrators and Notaries Public"), `tagline`, `foundedYear` (1967), `phone`, `email`, `socials` { instagram, facebook, x, linkedin, youtube }, `copyright`, `stillHaveQuestions` { title, text }, `contactCallout` { title, text, primaryCta, secondaryCta }, `faqSection` { eyebrow, title }, `aboutAnchors` [Link] (the About Us nav dropdown), `footerLinks` [Link] (the footer's Quick Links), `legalLinks` [Link], `newsletter` { title, note, enabled }, `revision` (Number, incremented on every save).

The top-level nav entries are fixed by the design (`constants/navigation.ts`); settings holds the parts of the nav and footer whose labels the firm edits (ADR-050). There is no `chat` setting and no newsletter endpoint (DESIGN_UPDATE_V2 §14).

### `pages` (one document per `key`)

The keys are `home, about, practice-areas, people, insights, careers, faq, offices, recognition, responsible-business`. Every page has `seo` { title, description, ogImage } and `revision` (Number, incremented on every save, for optimistic locking); all but `insights`, `recognition` and `responsible-business` have a `hero`. It also has **page-specific embedded sections**, validated by a per-key Zod schema in `src/validators/pages/<key>.validator.ts`:

- **home:** `aboutFirm` { title, paragraphs[html], cta: Link }, `videoShowcase` { videoUrl, poster, caption }, `recognitionSection` { eyebrow, title, image, cta: PendingLink } (the badges are the awards with `featuredOnHome`), `practiceSection` { eyebrow, title, cta }, `leadershipSection` { eyebrow, title, cta }, `whyChooseUs` { eyebrow, title, text, points: IconItem[4], image }, `insightsSection` { eyebrow, title, cta }
- **about:** `story` { eyebrow, title, paragraphs[], quote, quotePerson: →Person, profileDownload: { leadText, linkLabel, document: →Media (PDF) } }, `stats` { title, items: Stat[] }, `missionSection` { eyebrow, title, image, items: [{ title, body (html) }] }, `principles` { eyebrow, title, image, items: IconItem[] }, `awardsList` { eyebrow, title, image } (the rows are the recognition directories)
- **practice-areas:** `gridSection` { eyebrow, title }, `csrBanner` { title, text, images: [→Media], cta }
- **people:** `directorySection` { eyebrow, title }
- **insights:** `listingSection` { title }
- **careers:** `jobsSection` { eyebrow, title, cta, emptyState: { title, body (html), ctaLabel } }
- **faq**, **offices:** hero only
- **recognition:** `directoryPage` { awardsEyebrow, primaryCta, secondaryCta } — the labels every directory page shares
- **responsible-business:** `title`, `images` [→Media], `backLink` (Link) — the CSR page, whose grid is `GET /insights?category=pro_bono`

The **Stat** shape is `{ value, caption, label, source }`. `source` is either `'manual'` (use `value` as stored) or `'computed:yearsSinceFounding' | 'computed:officeCount' | 'computed:practiceAreaCount'`. With a computed source, the API computes the value and returns e.g. "59+ Years". This stops figures going stale.

### `legalPages` (one document per `key`: `terms`, `privacy`)

`key`, `title`, `body` (html), `status` (`draft|published`), `revision`, timestamps. Edited through the singleton pattern (GET/PUT with `If-Match`), not the CRUD factory: the set of keys is fixed. A draft legal page is a 404 publicly.

## Media

### `media`

`kind` (`image|document`), `provider` (`cloudinary|local`), `storageKey`, `url`, `version` (Number, incremented on each file replacement), `mimeType`, `bytes`, `originalFilename`, `title`, `uploadedBy`, `replacedBy`/`replacedAt` (last file swap), timestamps. Images also have `width`, `height`, `sizes` { sm, md, lg }, `alt` (required) and `focalPoint` { x, y } (0–1, default 0.5/0.5).

- **Documents** (`kind: document`) are PDFs only, checked by magic bytes (`%PDF`), up to 20 MB, with a required `title` and no `sizes`, `alt`, dimensions or focal point. Their public shape is `{ url, title, bytes, mimeType }` (ADR-053). They are used by `about.story.profileDownload.document` and `insight.document`.
- The **URL changes on every replacement** (new storage key or Cloudinary version), while the `_id` stays the same. References never change, but caches can't serve the old file. A replacement must be the same kind.
- **Reverse lookup ("where is this used?")** is computed, not stored. `src/constants/media-refs.ts` holds a registry of every field that can hold a media ID, e.g. `{ collection: 'practiceAreas', path: 'image', label: 'title' }`, `{ collection: 'pages', path: 'hero.images', label: 'key' }`, and so on for every image and document field, including fields that hold an **array** of ids. `findUsages(mediaId)` queries each entry. **Any new media field must be added to this registry**, or deletes and cache invalidation will miss it. Each entry also names the `kind` it expects, and writes are refused when a reference points at the wrong kind.
- Index: a text index on `title, alt, originalFilename`, plus `{ createdAt: -1 }` and `{ kind: 1, createdAt: -1 }`.
- Videos are not uploaded. `videoUrl` fields hold a link (YouTube, Vimeo, or a Cloudinary video URL).

## Image ownership

Images and documents the firm edits (heroes, practice area photos, portraits, insight covers, badges, directory wordmarks, section images, video posters, the firm profile PDF) are `Media` records managed through the admin UI. Brand and decorative assets (the logo, icons, the world-map texture, the footer watermark, gradients) belong to the **frontend codebase** and are never stored here. Icon fields store an icon _key_ (e.g. `shield-plus`) that the frontend maps to its icon set.

## Submissions (PII; see `.claude/rules/submissions.md`)

### `enquiries` (Discuss a Mandate)

`fullName`, `organization?`, `email`, `phone?`, `practiceArea?` → PracticeArea, `preferredOffice?` → Office, `summary` (≤ 2000 chars), `consent` { given: true, textVersion, at }, `status` (`new|in_review|closed`), `assignedTo?` → User, `ipHash`, `userAgent`, `createdAt`.
**TTL index** on `createdAt` using `RETENTION_ENQUIRY_DAYS`.

### `messages` (Message the firm)

`fullName`, `email`, `phone?`, `subject?`, `message`, `consent`, `status`, `ipHash`, `createdAt`. TTL index as above.

### `applications`

`job` → Job, `fullName`, `email`, `phone`, `coverNote?`, `cv` { storageKey, originalName, mimeType, bytes, scanStatus: `pending|clean|infected` }, `consent`, `status` (`new|shortlisted|rejected|hired`), `createdAt`.
**TTL index** using `RETENTION_APPLICATION_DAYS`. A TTL deletion must also delete the stored CV file, via a scheduled cleanup job that removes orphaned files.

## System collections

- **`users`:** `username` (unique, the login identifier), `name`, `email?` (a notification address the holder sets, not a credential), `passwordHash`, `roles` [`admin|editor|hr|business_dev`], `isActive`, `lastLoginAt`, `credentialsChangedAt`, `failedLoginCount`, `lockedUntil`. One account per role (ADR-043).
- **`refreshTokens`:** `user`, `tokenHash`, `expiresAt` (TTL), `revokedAt`, `replacedBy`.
- **`auditLogs`:** `actor` → User, `action` (e.g. `application.cv.view`, `insight.publish`), `entity`, `entityId`, `meta`, `ip`, `at`. Keep for at least 1 year.
