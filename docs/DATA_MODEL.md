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
Hero   = { title, subtitle, image: →Media, primaryCta: Link, secondaryCta: Link }
Section = { eyebrow?: String, title: String, body?: String /* html */ }
IconItem = { icon: String /* icon key the frontend maps, e.g. 'shield-check' */, title, text? }
```

## Content collections

### `practiceAreas`
| Field | Type | Notes |
|---|---|---|
| title | String, required | "Dispute Resolution & Arbitration" |
| shortLabel | String, required | Tab label on Home: "Dispute Resolution" |
| summary | String, required | Card text (plain) |
| image | →Media | |
| body | String (html) | Detail page. Not designed yet |
| keyServices | [String] | Detail page (speculative, optional) |
| contacts | [→Person] | Detail page: attorneys to contact |
| featuredOnHome | Boolean, default true | |
| homeOrder | Number, nullable | Position in the Home tab bar, which differs from the Practice Areas page order. Null when not featured on Home. Home sorts by `homeOrder`, the page sorts by `order`. |
| showInFooter | Boolean, default true | |
| seo | { title, description } | No `ogImage`: only pages carry one |

Indexes: `{status:1, order:1}` and a text index on `title, summary, body`.

### `people`
| Field | Type | Notes |
|---|---|---|
| honorific | String | "Dr.", "Mrs.", "Mr." |
| firstName, lastName | String, required | |
| postNominals | String | "SAN" |
| displayName | virtual | e.g. "Dr. Babatunde Ajibade, SAN" |
| role | enum, required | `managing_partner, partner, associate_partner, senior_associate, associate, nysc_associate` |
| roleLabel | virtual | "Managing Partner", "Associate Partner"… |
| photo | →Media | |
| linkedinUrl | String | |
| email | String | optional, shown only if the firm approves |
| bio | String (html) | Shown by the "+" |
| quote | String | Only used for the MP's pull quote on About |
| practiceAreas | [→PracticeArea] | |
| office | →Office | |
| featuredInLeadership | Boolean | The Home leadership row |

**Seniority sort** is role rank (managing_partner = 0 … nysc_associate = 5), then `order`, then `lastName`.
**Role filtering** treats `partner` as a group that also matches `managing_partner`, because the directory has a "Partners" tab and no Managing Partner tab (DECISIONS Q3).
People carry no `seo` fields, so `/people/:slug` returns none.
Indexes: `{status:1, role:1, order:1}` and a text index on `firstName, lastName, bio`.

### `insights`
| Field | Type | Notes |
|---|---|---|
| title | String, required | |
| excerpt | String | Featured carousel text |
| body | String (html) | Articles |
| format | enum `article` / `video`, required | Controls "Read More" vs "Watch Video" |
| videoUrl | String | Required if format = video |
| categories | [enum], min 1 | `firm_news, articles, insights, regulatory_updates, news_updates, media_coverage, webinar_resources` |
| practiceAreas | [→PracticeArea] | |
| author | →Person, optional | **null means the firm is the author** |
| coverImage | →Media | |
| featured | Boolean | Top carousel (max 3 shown) |
| publishedAt | Date | Displayed as "June, 2026." by the frontend |

Card chips = the first category label, then the first practice area title. If there's no practice area, show the second category.
Insights carry no `seo` fields, so `/insights/:slug` returns none.
Indexes: `{status:1, categories:1, publishedAt:-1}` and `{status:1, featured:1, publishedAt:-1}`, plus a text index on `title, excerpt, body`.

### `offices`
| Field | Type | Notes |
|---|---|---|
| name | String | "Lagos" (displayed as "Lagos Office") |
| address | String | |
| location | GeoJSON Point `{type:'Point', coordinates:[lng,lat]}` | Map pin. Coordinates are TBD, so seed with nulls |
| directionsUrl | String | Generated from coordinates if empty |
| hours | String | "8:00 AM to 4:00 PM, Monday to Friday" |
| phone, email | String | Fall back to the site-wide values |

### `recognitions` (Home badge tiles)
| Field | Type | Notes |
|---|---|---|
| organization | String | "IFLR1000", "Chambers Global" |
| title | String | "Recommended Firm", "Ranked in Global" |
| year | Number | |
| badge | →Media | |
| url | String | |
| tab | enum `achievements` / `recognized_by` | Home tab it appears in |

### `faqs`
`question` (String), `answer` (String html), `order`, `status`. The same set is shown site-wide.

### `jobs`
| Field | Type | Notes |
|---|---|---|
| title | String | "Associate" |
| practiceArea | →PracticeArea | |
| description | String (html) | |
| experience | String | "2–4 years experience" |
| employmentType | enum `full_time, part_time, contract, internship, nysc` | chip label derived |
| workMode | enum `onsite, hybrid, remote` | |
| office | →Office | Location chip |
| closingDate | Date, optional | Hidden from the public API after this date |
| isOpen | Boolean, default true | |

## Singletons

### `settings` (exactly one document, `key: 'site'`)
`firmName`, `legalDescriptor` ("Legal Practitioners, Arbitrators and Notaries Public"), `tagline`, `foundedYear` (1967), `phone`, `email`, `socials` { instagram, facebook, x, linkedin, youtube }, `copyright`, `stillHaveQuestions` { title, text }, `contactCallout` { title, text, primaryCta, secondaryCta }, `faqSection` { eyebrow, title }, `revision` (Number, incremented on every save).

### `pages` (one document per `key`)
The keys are `home, about, practice-areas, people, insights, careers, faq, offices`. Every page has `hero`, `seo` { title, description, ogImage } and `revision` (Number, incremented on every save, for optimistic locking). It also has **page-specific embedded sections**, validated by a per-key Zod schema in `src/validators/pages/<key>.validator.ts`:

- **home:** `aboutFirm` { title, paragraphs[html], cta: Link }, `videoShowcase` { videoUrl, poster }, `recognitionTabs` { achievementsLabel, recognizedByLabel }, `practiceSection` { eyebrow, title, cta }, `leadershipSection` { eyebrow, title, cta }, `whyChooseUs` { eyebrow, title, text, points: IconItem[4], image }, `insightsSection` { eyebrow, title, cta }
- **about:** `story` { eyebrow, title, paragraphs[], quote, quotePerson: →Person }, `stats` { title, items: Stat[] }, `missionSection` { eyebrow, title, image, items: [{ title, body }] }, `principles` { eyebrow, title, image, items: IconItem[] }, `awardsList` { eyebrow, title, image, items: [{ name, url }] }
- **practice-areas:** `gridSection` { eyebrow, title }, `csrBanner` { title, text, image, cta }
- **people:** `directorySection` { eyebrow, title }
- **insights:** `listingSection` { title }
- **careers:** `jobsSection` { title }
- **faq**, **offices:** hero only

The **Stat** shape is `{ value, caption, label, source }`. `source` is either `'manual'` (use `value` as stored) or `'computed:yearsSinceFounding' | 'computed:officeCount' | 'computed:practiceAreaCount'`. With a computed source, the API computes the value and returns e.g. "59+ Years". This stops figures going stale.

## Media

### `media`
`kind` (`image`), `provider` (`cloudinary|local`), `storageKey`, `url`, `version` (Number, incremented on each file replacement), `width`, `height`, `mimeType`, `bytes`, `originalFilename`, `title`, `alt` (required), `focalPoint` { x, y } (0–1, default 0.5/0.5), `uploadedBy`, `replacedBy`/`replacedAt` (last file swap), timestamps.

- The **URL changes on every replacement** (new storage key or Cloudinary version), while the `_id` stays the same. References never change, but caches can't serve the old file.
- **Reverse lookup ("where is this image used?")** is computed, not stored. `src/constants/media-refs.ts` holds a registry of every field that can hold a media ID, e.g. `{ collection: 'practiceAreas', path: 'image', label: 'title' }`, `{ collection: 'pages', path: 'hero.image', label: 'key' }`, and so on for every image field. `findUsages(mediaId)` queries each entry. **Any new image field must be added to this registry**, or deletes and cache invalidation will miss it.
- Index: a text index on `title, alt, originalFilename`, plus `{ createdAt: -1 }`.
- Videos are not uploaded. `videoUrl` fields hold a link (YouTube, Vimeo, or a Cloudinary video URL).

## Image ownership

Images the firm edits (heroes, practice area photos, portraits, insight covers, badges, section images, video posters) are `Media` records managed through the admin UI. Brand and decorative assets (the logo, icons, the world-map texture, the footer watermark, gradients) belong to the **frontend codebase** and are never stored here. Icon fields store an icon *key* (e.g. `shield-plus`) that the frontend maps to its icon set.

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

- **`users`:** `name`, `email` (unique), `passwordHash`, `roles` [`admin|editor|hr|business_dev`], `totp` { secretEncrypted, enabled }, `isActive`, `lastLoginAt`, `failedLoginCount`, `lockedUntil`.
- **`refreshTokens`:** `user`, `tokenHash`, `expiresAt` (TTL), `revokedAt`, `replacedBy`.
- **`auditLogs`:** `actor` → User, `action` (e.g. `application.cv.view`, `insight.publish`), `entity`, `entityId`, `meta`, `ip`, `at`. Keep for at least 1 year.
