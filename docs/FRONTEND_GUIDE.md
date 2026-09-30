# Frontend Guide

Everything you need to build the SPA Ajibade & Co. website against this backend.

Written for the team building the public site and the admin dashboard. No prior knowledge of this codebase is assumed.

**Live API:** `https://spaaco.onrender.com/api/v1`
**Browsable reference:** https://spaaco.onrender.com/docs

This guide explains how to use the API. The `/docs` page lists every endpoint with real sample payloads. Use this to understand the shape of things; use `/docs` to look up a field.

---

## 1. The one idea

Almost every word and picture on the website comes from this API. Nothing is hard-coded in your app. The firm edits the content through the admin dashboard, and the public site reads it back.

So your job is roughly: fetch the content for the page, render it, and send the three forms back.

---

## 2. What every answer looks like

Every successful response wraps its payload in `data`:

```json
{ "data": { "slug": "tax", "title": "Tax" } }
```

Lists add a `meta` block with the paging information:

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "pageSize": 9, "total": 34, "totalPages": 4 }
}
```

Errors always look like this, whatever went wrong:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [{ "path": "email", "message": "Required" }]
  }
}
```

`details` is only there for validation failures, and it tells you exactly which field the user needs to fix. You can drive your form error messages straight off it.

**Status codes you will actually see:**

| Code | What it means                                            |
| ---- | -------------------------------------------------------- |
| 200  | Fine                                                     |
| 201  | Your form submission was saved                           |
| 400  | Something in the request was wrong — read `details`      |
| 401  | Not signed in, or the token expired (admin only)         |
| 403  | Signed in, but this role is not allowed to do that       |
| 404  | No such thing, or it is not published yet                |
| 409  | Someone else saved first — see the admin section         |
| 428  | You forgot the `If-Match` header — see the admin section |
| 429  | Too many requests, slow down                             |

---

## 3. Building a page: usually one request

The site's pages each come from a single request, with everything already assembled — the page's own copy plus the attorneys, practice areas, awards and articles it displays. You do not need to stitch several calls together.

```
GET /api/v1/pages/home
```

The ten keys are:

`home` · `about` · `practice-areas` · `people` · `insights` · `careers` · `faq` · `offices` · `recognition` · `responsible-business`

For example, `/pages/home` comes back with the hero carousel, the "A Firm Built On Integrity" block, the video with its caption, the Recognition band and its award badges, the featured practice areas, the leadership trio (with the back of each card), the latest articles, and the SEO fields — all in one object.

Two keys are different: `recognition` only holds the labels every directory's award page shares (you render those pages from `/recognitions/{slug}`, which already includes them), and `responsible-business` is the CSR page's title, carousel and back link — its grid is `/insights?category=pro_bono`.

**Heroes are carousels.** Every hero has `images`, an array — three slides on Home, one elsewhere. Only the picture changes between slides; the title, subtitle and buttons stay put.

### The header and footer

Everything that appears on every page — firm name, tagline, phone, email, social links, the navigation menu (with the About Us and Insights & News dropdowns), the footer's Quick Links, practice areas, offices with their contact details, the Terms and Privacy links, the newsletter copy, and the contact call-out — comes from one request you make once and reuse:

```
GET /api/v1/site
```

Fetch it once, cache it, and render your shell from it.

**So the minimum for any page is two requests:** `/site` for the shell, `/pages/{key}` for the content.

---

## 4. When you need a list of your own

Use these when you are building something the page endpoints do not already give you — a paginated directory, a filtered article feed, a sidebar.

```
GET /api/v1/practice-areas
GET /api/v1/people
GET /api/v1/insights
GET /api/v1/offices
GET /api/v1/faqs
GET /api/v1/jobs
GET /api/v1/recognitions
```

`/recognitions` feeds the two-tab component ("Our Achievements" / "Independently Recognized By"): the directories with their wordmarks, and the awards featured on Home.

### Paging

Every list takes `?page=` and `?pageSize=`. The default page size is 9 (that is what the designs show), and the most you can ask for is 50.

### Filtering attorneys

```
GET /api/v1/people?role=partner&practiceArea=tax&page=2
```

`role` is one of: `managing_partner`, `partner`, `associate_partner`, `senior_associate`, `associate`, `trainee_associate`.

`practiceArea` takes a practice area's slug — it is the "Sort By" dropdown in the design, which is really a filter, headed "Practice Area". It combines with the role tab. `/pages/people` gives you the options as `practiceAreaFilters`. Every card in the list already carries its back face (`cardBio` and the practice-area chips), so flipping a card needs no request.

One thing to know: asking for `role=partner` also returns the Managing Partner. That is deliberate — the directory design has a "Partners" tab and no separate "Managing Partner" tab, so the filter matches the tab rather than the exact job title.

`sort` is `seniority` (the default), `name_asc`, or `name_desc`.

### Filtering articles

```
GET /api/v1/insights?category=articles&practiceArea=tax&sort=oldest
```

`category` is one of: `firm_news`, `articles`, `insights`, `regulatory_updates`, `news_updates`, `events`, `pro_bono`.

**`pro_bono` is special.** Those are the Responsible Business stories, and they appear only when you ask for `category=pro_bono` — never in "All insights & news", another tab, the featured carousel, Home, or a practice area's or attorney's publications. It is not a tab; `/pages/insights` gives you the real tabs as `categoryFilters`.

`practiceArea` takes a practice area's slug (the "Sort By" dropdown; options in `practiceAreaFilters`), and combines with the category tab. `sort` is `newest` (the default) or `oldest`.

---

## 5. Detail pages

Most things are addressed by their slug, which is the URL-friendly version of the title:

```
GET /api/v1/practice-areas/{slug}
GET /api/v1/people/{slug}
GET /api/v1/insights/{slug}
GET /api/v1/recognitions/{slug}
GET /api/v1/legal/{key}
```

- A **practice area** comes with its hero text and images, overview, core services, approach, industries, the Practice Lead card (with LinkedIn and email), every area for the sidebar (`siblings`), and six recent publications.
- An **attorney** comes with their bio, education, memberships, primary practice area, email, Instagram and LinkedIn, and six recent publications.
- An **insight** ends with `cta`: "Read Article" (to the external article or a PDF) or "Watch Video", or `null` when there is nothing to link to. `backLink` says where "Back to…" goes — Responsible Business for a pro bono story, Insights & News for everything else.
- A **recognition directory** (`/recognitions/iflr-1000`) is the page behind each "View Awards" row on About.
- A **legal page** is `terms` or `privacy`, with an `updatedAt` for a "Last updated" line.

Jobs are the exception — they use an id:

```
GET /api/v1/jobs/{id}
```

Use the slug from the list response to build your links. Slugs are stable; the firm can change a title without the URL breaking.

---

## 6. Search

```
GET /api/v1/search?q=arbitration
```

The search term must be at least 2 characters and at most 100. Results come back grouped by type (practice areas, attorneys, articles), with up to 5 in each group — it is built for a quick drop-down, not a full results page.

Limit: 60 searches a minute from one visitor. Debounce your input.

---

## 7. The three forms

These are the only things the public site sends _to_ the backend.

| Form                       | Where it goes                         |
| -------------------------- | ------------------------------------- |
| Discuss a Mandate          | `POST /api/v1/enquiries`              |
| Contact / message the firm | `POST /api/v1/messages`               |
| Job application            | `POST /api/v1/jobs/{id}/applications` |

A successful submission returns **201** with a reference like `ENQ-2026-0041`. Show it to the person — it is what the firm will quote back to them.

### Enquiries and messages

Send JSON.

**Enquiry fields:**

| Field                | Required | Notes                                      |
| -------------------- | -------- | ------------------------------------------ |
| `fullName`           | yes      | 2–120 characters                           |
| `email`              | yes      |                                            |
| `phone`              | no       | digits, spaces, `+ ( ) -`, 7–20 characters |
| `organization`       | no       | up to 160 characters                       |
| `practiceArea`       | no       | a practice area slug                       |
| `preferredOffice`    | no       | an office id                               |
| `summary`            | yes      | **at least 20 characters**, up to 2000     |
| `consent`            | yes      | must be exactly `true`                     |
| `consentTextVersion` | yes      | see below                                  |
| `turnstileToken`     | yes      | see below                                  |
| `website`            | no       | see below                                  |

**Message fields** are the same idea, but with `subject` (optional, 160 characters) and `message` (required, at least 10 characters) instead of `organization`/`practiceArea`/`preferredOffice`/`summary`.

### Three fields that will trip you up

**`consentTextVersion`** — the firm has to be able to prove what wording someone agreed to. So along with the tick box, send a short label for the exact consent text you displayed, for example `"v1-2026-01"`. Change the label whenever you change the wording. Do not send an empty string.

**`turnstileToken`** — this is required _even though the captcha is currently switched off_. Right now any non-empty string is accepted, so send something like `"disabled"`. When the firm turns Cloudflare Turnstile on, this is where the real token goes and nothing else about your code needs to change. If you leave it out you get a 400.

**`website`** — a trap for spam bots, and the one field you should add to your form and then never let a human touch. Render it as a hidden input that stays empty. A real person never fills it; a bot fills everything. If it arrives with anything in it, the API returns a normal-looking 201 and quietly throws the submission away, so the bot has no way to tell it failed. Do not remove it, and do not put it where a browser's autofill might reach it.

### Job applications

This one is a file upload, so send it as `multipart/form-data`, not JSON.

| Field                | Required | Notes                                                    |
| -------------------- | -------- | -------------------------------------------------------- |
| `cv`                 | yes      | the CV — PDF or DOCX, maximum 5 MB                       |
| `fullName`           | yes      |                                                          |
| `email`              | yes      |                                                          |
| `phone`              | yes      | required here, unlike the other two forms                |
| `coverNote`          | no       | up to 2000 characters                                    |
| `consent`            | yes      | the **string** `"true"` — multipart has no real booleans |
| `consentTextVersion` | yes      | as above                                                 |
| `turnstileToken`     | yes      | as above                                                 |
| `website`            | no       | the same honeypot                                        |

The file field is named `cv` (not `file` — that name belongs to the admin media upload). The API checks the actual contents of the upload rather than trusting the file extension, so a `.pdf` that is really something else is rejected.

Only jobs that are open and past neither their closing date appear in `/jobs`, so a vacancy you can see is a vacancy you can apply to.

### Rate limit

Five submissions per form, per visitor, per ten minutes. If someone hits it they get a 429 — show a calm "please try again shortly" rather than a hard error.

---

## 8. Things that will surprise you

**Images come back empty until the firm uploads them.** A single image field is `null`; a carousel (`hero.images`, `csrBanner.images`, `heroImages`) is an empty array. Build your empty states properly — this is not a bug, and it is a realistic thing to develop against.

**Some buttons have nowhere to go yet.** "View Our Recognitions" on Home comes back with `href: null`, and the careers empty state gives you only the "Send your CV" label. Render them however the design wants a pending button to look; the destinations will arrive as data, not code.

**There is no newsletter or chat endpoint.** The footer's newsletter block comes with its copy and `enabled: false`; the chat assistant is not built. Do not wire either to anything.

**Unpublished content does not exist as far as you are concerned.** The firm works on things as drafts. A draft attorney is not in the list and their URL returns 404. You will never accidentally show work in progress.

**A 404 is often the honest answer.** If a page or a profile is not there, it is because nothing is published under that slug. Handle it as "not found", not as a failure.

**Some text says `[PENDING FROM FIRM]`.** A handful of FAQ answers, article bodies and About paragraphs are still waiting on copy from the firm. Render them as they are — they are the firm's reminder to themselves.

**Everything is public by default.** No API key, no token, no login for any of the endpoints above. Just fetch them.

**Rate limit on reading:** 300 requests a minute per visitor. You will not hit it in normal use, but do not poll.

---

## 9. The admin dashboard

This is a private tool for four people at the firm. It is a completely separate app from the public site.

### There is no sign-up

Four accounts exist, created when the API was first deployed. Your login screen asks for a **username and password** — not an email address.

| Username       | Who it is for          |
| -------------- | ---------------------- |
| `admin`        | full access            |
| `editor`       | the website content    |
| `hr`           | jobs and applications  |
| `business_dev` | enquiries and messages |

There is no registration, no "forgot password" email, and no two-factor step. Do not build screens for any of those.

### Signing in

```
POST /api/v1/admin/auth/login
{ "username": "editor", "password": "..." }
```

You get back an **access token**, good for about 15 minutes, plus a **refresh cookie** the browser stores for you.

Keep the access token in memory — a variable in your app state. Do not put it in `localStorage`. Send it on every admin request:

```
Authorization: Bearer <accessToken>
```

When a request comes back 401, the token has expired. Call:

```
POST /api/v1/admin/auth/refresh
```

with `credentials: 'include'` so the browser sends the cookie, and you get a fresh access token. Retry the original request. Wrap this in your HTTP client once and forget about it.

Signing out is `POST /api/v1/admin/auth/logout`, also with `credentials: 'include'`.

One thing to be aware of: refresh tokens are single use. If the same one is ever presented twice, the backend assumes it was stolen and signs that account out everywhere. So make sure two requests refreshing at the same time do not both fire — queue them behind one refresh.

### Their profile

Each person sets their own notification email after logging in:

```
PATCH /api/v1/admin/auth/me
{ "name": "Chinelo Okafor", "email": "chinelo@..." }
```

This email is **not** how they log in. It is where form notifications get sent — enquiries and messages go to whoever holds `business_dev`, job applications to whoever holds `hr`. Sending `"email": null` turns their notifications off.

Changing a password is `PATCH /api/v1/admin/auth/password`. Doing so signs out every other session for that account.

### Who can do what

| Area                                         | admin | editor | hr        | business_dev |
| -------------------------------------------- | ----- | ------ | --------- | ------------ |
| Content, pages, settings, legal pages, media | yes   | yes    | jobs only | no           |
| Enquiries and messages                       | yes   | no     | no        | yes          |
| Job applications and CVs                     | yes   | no     | yes       | no           |
| User accounts, audit log                     | yes   | no     | no        | no           |

Hide what a role cannot use. The backend will return 403 regardless, but nobody enjoys clicking a button that refuses them.

### Editing content

The nine collections all work identically:

```
GET    /api/v1/admin/content/{collection}
POST   /api/v1/admin/content/{collection}
GET    /api/v1/admin/content/{collection}/{id}
PATCH  /api/v1/admin/content/{collection}/{id}
DELETE /api/v1/admin/content/{collection}/{id}
POST   /api/v1/admin/content/{collection}/{id}/publish
POST   /api/v1/admin/content/{collection}/{id}/unpublish
PATCH  /api/v1/admin/content/{collection}/reorder
```

where `{collection}` is one of `practice-areas`, `people`, `insights`, `offices`, `recognition-directories`, `awards`, `industries`, `faqs`, `jobs`.

Build the editor once and it works for all nine. Image lists such as `heroImages` are arrays of media ids.

Add `?status=draft` or `?status=published` to the list to filter, and `?q=` to search within it.

### Two rules for saving

**Every item carries a `revision` number, and you must send it back when you save.** Read the item, note its `revision`, and put it in a header:

```
If-Match: 3
```

If you forget the header you get **428** and nothing is saved. If someone else saved while your form was open you get **409** — the right response is to tell the user "someone else changed this", reload, and let them reapply their edit. This is what stops two people silently overwriting each other.

**An item you read is an item you can send straight back.** The admin `GET` returns exactly the fields the `PATCH` accepts. So load, bind to your form, submit — no reshaping needed.

### Publishing

Creating something does not make it public. It starts as a draft, and stays invisible to the website until someone calls the `publish` endpoint. `unpublish` takes it back down. This is the firm's review step, and it is the main thing your dashboard exists to make easy.

### The rest of the dashboard

| What                                                                         | Where                        |
| ---------------------------------------------------------------------------- | ---------------------------- |
| Site settings (phone, email, socials, nav and footer links, newsletter copy) | `/api/v1/admin/settings`     |
| Page copy (the ten pages)                                                    | `/api/v1/admin/pages/{key}`  |
| Terms of Service, Privacy Policy                                             | `/api/v1/admin/legal/{key}`  |
| Media library (images and PDFs)                                              | `/api/v1/admin/media`        |
| Enquiries inbox                                                              | `/api/v1/admin/enquiries`    |
| Messages inbox                                                               | `/api/v1/admin/messages`     |
| Applications inbox                                                           | `/api/v1/admin/applications` |
| Who changed what                                                             | `/api/v1/admin/audit-logs`   |
| Accounts                                                                     | `/api/v1/admin/users`        |

Settings, pages and legal pages use `If-Match` too. A legal page is published or withdrawn by the `status` in its PUT body, since it has no publish button of its own.

### The media library holds PDFs too

Upload with `kind=document` and a `title` (the link text) to add a PDF, such as the firm profile or an article's PDF; images need `alt` instead. The API checks the real file type, scans PDFs, and allows up to 20 MB for a PDF and 10 MB for an image. Filter the library with `?kind=image` or `?kind=document`. Putting a PDF into an image field, or an image into a document field, is refused with a 400.

### CVs are handled carefully

A CV is somebody's personal data, and Nigerian law takes that seriously. They are never on a public URL. To let an HR user open one, ask for a link:

```
GET /api/v1/admin/applications/{id}/cv
```

You get back a URL that works for five minutes and then stops. Every single time one is issued it is written to the audit log. So: fetch the link when the user clicks, open it, and never store or share it.

---

## 10. Every endpoint at a glance

### Public — no login needed

| Method | Path                      | What it gives you                                           |
| ------ | ------------------------- | ----------------------------------------------------------- |
| GET    | `/site`                   | Header, footer, navigation, firm details                    |
| GET    | `/pages/{key}`            | A whole page, assembled                                     |
| GET    | `/practice-areas`         | List                                                        |
| GET    | `/practice-areas/{slug}`  | One practice area                                           |
| GET    | `/people`                 | Attorney directory (`role`, `practiceArea`, `sort`, paging) |
| GET    | `/people/{slug}`          | One attorney                                                |
| GET    | `/insights`               | Articles (`category`, `practiceArea`, `sort`, paging)       |
| GET    | `/insights/{slug}`        | One article                                                 |
| GET    | `/recognitions`           | Directories and featured awards                             |
| GET    | `/recognitions/{slug}`    | One directory's awards page                                 |
| GET    | `/legal/{key}`            | Terms of Service or Privacy Policy                          |
| GET    | `/offices`                | The three offices                                           |
| GET    | `/faqs`                   | Questions and answers                                       |
| GET    | `/jobs`                   | Open vacancies                                              |
| GET    | `/jobs/{id}`              | One vacancy                                                 |
| GET    | `/search?q=`              | Grouped quick results                                       |
| POST   | `/enquiries`              | Discuss a Mandate form                                      |
| POST   | `/messages`               | Contact form                                                |
| POST   | `/jobs/{id}/applications` | Job application with CV                                     |
| GET    | `/health`                 | Is the API up                                               |

### Admin — needs a token

| Method | Path                                                                            |
| ------ | ------------------------------------------------------------------------------- |
| POST   | `/admin/auth/login` · `/refresh` · `/logout`                                    |
| PATCH  | `/admin/auth/me` · `/admin/auth/password`                                       |
| —      | `/admin/content/{collection}` and its `{id}`, `publish`, `unpublish`, `reorder` |
| —      | `/admin/settings` · `/admin/pages/{key}` · `/admin/legal/{key}`                 |
| —      | `/admin/media` and `/admin/media/{id}`                                          |
| —      | `/admin/enquiries` · `/admin/messages` · `/admin/applications`                  |
| GET    | `/admin/applications/{id}/cv`                                                   |
| —      | `/admin/users` · `/admin/audit-logs`                                            |

Full parameters and sample payloads for all of these are at **https://spaaco.onrender.com/docs**.

---

## 11. Before you go live

- The API currently accepts requests from **any** website. Once your domains are known, tell the backend team and they will lock it to just those.
- Nothing is cached aggressively yet. If you are using a framework that rebuilds pages on a schedule, there is a webhook available that tells your site when content changes — ask the backend team to point it at you.
- The hosting is a free plan, so the API goes to sleep after a period of no traffic and the first request after that takes a few seconds. This disappears on a paid plan. Do not design around it, but do not be alarmed by it either.

## 12. Who to ask

If a field you need is missing, or a response shape does not suit the design, say so rather than working around it. The API is meant to fit the site. Changing a response is a small job at this stage and an awkward one later.
