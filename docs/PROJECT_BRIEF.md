# Project Brief

## The client

**SPA Ajibade & Co.** is described as "Legal Practitioners, Arbitrators and Notaries Public". It is a Nigerian commercial law firm founded in 1967, with offices in Lagos, Abuja and Ibadan. Its positioning is "Counsel to the institutions building Nigeria's economy." Its audience is governments, financial institutions and multinational corporations.

## What we are building

A content API for a 9-page marketing website, plus an authenticated admin API that the frontend team will build a dashboard on top of. The frontend wants every piece of copy, imagery and structured content to come from this API. Nothing should be hard-coded in the frontend except layout and styling.

The site's primary conversion is **"Discuss a Mandate"**. It appears in the header, in every hero and in the contact callout. The secondary goals are exploring practice areas, meeting attorneys, reading insights, and recruitment ("Send your CV").

## How content is managed

All text and all content images are managed by the firm through an **admin UI that the frontend team builds** on our admin API. The admin UI uploads images to the media library, attaches them to content by ID, replaces or edits them, and edits every piece of page copy, collection item and site-wide setting. Nothing from Figma is imported: the designs define the _structure_, and the firm supplies and maintains the real content. The logo, icons and decorative graphics are frontend assets (see "Image ownership" in DATA_MODEL.md).

## Global shell (on every page)

The shell is served by `GET /api/v1/site`:

- **Top bar:** phone, email, and social links (Instagram, Facebook, X, LinkedIn, YouTube).
- **Main nav:** Home, About Us ▾, Practice Areas, Our People, Insights & News ▾, Careers, plus a search icon and a "Discuss a Mandate" button. The About Us dropdown lists anchors into the About page (Our Story, Mission, Vision & Values, Our Principles, Recognition), edited in settings. The Insights & News dropdown lists the public insight categories, each linking to `/insights?category=<value>`.
- **FAQ section:** "Answers Before You Reach Out." It has 5 accordion items and a "Still have questions?" card with three actions: Chat with us, Message the firm, Call the firm. The FAQ items come from the FAQ collection; the card copy comes from settings.
- **Contact callout:** "Start With A Conversation, Not A Form." with the buttons Explore Our Practice Areas and Discuss a Mandate.
- **Footer:** logo (a frontend asset), tagline and socials; a **Quick Links** column (Home, About Us, Practice Areas, Our People, Insights & News, Careers, FAQ's — edited in settings); a Practice Areas column (all nine); an Offices column with each office's name, address, email and phone (falling back to the site-wide values); Terms of Service and Privacy Policy links; a newsletter block ("Subscribe for legal insights"), which subscribes by double opt-in (ADR-065); and a copyright line.
- **"Chat with SPAACO AI".** In scope later; nothing is built for it now (DESIGN_UPDATE_V2 §14).

## Pages → sections → data

Every inner page has a **hero**: background images (a carousel on Home; one slide elsewhere — only the image changes between slides), title, subtitle and two CTAs. The primary CTA is always "Discuss a Mandate". Heroes are stored in each page document.

### Home — `GET /pages/home`

1. **Hero:** a 3-slide carousel, "Counsel To The Institutions Building Nigeria's Economy." with CTAs Discuss a Mandate / Explore Our Practice Areas.
2. **About the Firm:** a title, two paragraphs, a "Learn more about our history" link, and a world-map background image.
3. **Video showcase:** a large video with a poster image, a play button and a caption ("Our Managing Partner on what fifty-nine years of practice has taught us.").
4. **Recognition:** eyebrow "Recognition", a title, an image, four award badges (the awards flagged `featuredOnHome`), and a "View Our Recognitions" CTA whose destination is still pending (served with `href: null`).
5. **Focused Practice Areas:** eyebrow "Services", a pill tab bar using each practice area's _short label_ (Corporate, Energy, Dispute Resolution, Intellectual Property, Real Estate, then the rest), a carousel of cards (image, title, the area's **Home summary**, Learn More), and an "Explore Our Practice Areas" CTA. Data: the practice areas flagged `featuredOnHome`, in `homeOrder`.
6. **Leadership:** eyebrow "Our People", with 3 attorney cards and "View full directory". Each card flips: the front has photo, name, role and LinkedIn; the back has the role, practice-area chips and a short italic bio (`cardBio`). "Discuss a Mandate" on a card does nothing yet (frontend only). Data: people flagged `featuredInLeadership`.
7. **Why Clients Choose Us:** a title, body text, 4 icon points and an image.
8. **Recent Publications:** eyebrow "Insights and News", a carousel of the latest insight cards (never pro bono stories), and "View all insights".
9. The shared FAQ section, contact callout and footer.

### About Us — `GET /pages/about`

1. **Hero:** "Who We Are" with CTAs Discuss a Mandate / Meet Our People.
2. **Our Story:** a pull quote from the Managing Partner with his photo, name and role, beside the title "Integrity And Commitment Build Client Trust." and 4 paragraphs, ending "To learn more about the firm, you may download a copy of our profile **here**" — a link to the firm profile PDF from the media library.
3. **Stats row:** "Decades Of Practice, Measured In Outcomes." with 4 stats. Each stat has a value, a caption and an italic label. Some values are computed (see DATA_MODEL).
4. **Mission, Vision & Values:** an accordion with Mission, Vision, Values and Asset, beside an image. The bodies are HTML ("Our Asset" has bold phrases).
5. **Principles:** "Built On Principle…", a 3×2 grid of items, each with an icon, title and text, plus a cut-out statue image.
6. **Awards list:** "Award-Winning Legal Services", one row per recognition directory (IFLR 1000, Chambers Global, Legal 500, Who's Who Legal), each with a "View Awards ↗" link to that directory's recognition page, plus an image.
7. The shared sections.

### Practice Areas — `GET /pages/practice-areas`

1. **Hero:** "Our Practice Areas" with CTAs Discuss a Mandate / Meet Our People.
2. **Grid:** a title, then a 3×3 grid of all published practice areas (image, title, summary clamped to 4 lines by the frontend, Learn More).
3. **Pro Bono & Community Commitment banner:** a 3-slide carousel with shared title and text, and a "Learn About Our CSR" CTA to the Responsible Business page.
4. The shared sections.

### Practice Area detail — `GET /practice-areas/:slug`

1. **Hero:** the area's title, its hero paragraph (`heroIntro`) and hero images.
2. **Body:** an overview paragraph, three Core Services cards, "Our Approach" (text plus four points), and four Industries.
3. **Sidebar:** every practice area (the current one highlighted) and a "Practice Lead" card (photo, name, role, LinkedIn and email icons).
4. **Recent Publications:** the six latest insights tagged with the area.
5. The shared sections.

### Responsible Business — `GET /pages/responsible-business` + `GET /insights?category=pro_bono`

The CSR page, opened from "Learn About Our CSR". A "RESPONSIBLE BUSINESS" title over a 3-slide carousel, "Back to Practice Areas", then a 3×3 grid of pro bono stories paginated 9 per page, each card showing the "Pro Bono & Community Commitment" chip, a date, a title, the firm as author and Read More. The nav highlights Practice Areas.

### Recognition — `GET /recognitions/:slug`

One page per directory, opened from the About awards list: a hero titled with the directory's name (subtitle, images, Discuss a Mandate / Meet Our People), then "Awards by the years", the directory's awards newest first. `GET /recognitions` serves a two-tab component ("Our Achievements" / "Independently Recognized By") that exists in the designs but isn't placed on a page yet.

### Legal — `GET /legal/terms`, `GET /legal/privacy`

Terms of Service and Privacy Policy, linked from the footer. Editable pages; the copy is pending from the firm.

### Our People — `GET /pages/people` + `GET /people`

1. **Hero:** "Get To Know Our Attorneys" with CTAs Discuss a Mandate / About Us.
2. **Directory:** role filter tabs (Management, Partners (managing partner to associate partners), Associates (senior to trainee associates), Consultants; no "all" tab; ADR-068), a "Sort By" dropdown that is really a **practice-area filter** (headed "Practice Area") and combines with the tabs, and a 3-column grid of flip cards paginated 9 per page ("Page 1 of N", with Previous and Next disabled on a single page).
3. The shared sections.

**Attorney profile — `GET /people/:slug`:** photo with their practice areas beneath, primary first, name, role, LinkedIn, Instagram and email, a bio of two or more paragraphs, Education (an intro and a list of qualifications with years), Memberships, and Recent Publications: the firm's list when the profile has one, otherwise the six latest they wrote.

### Insights & News — `GET /pages/insights` + `GET /insights`

1. **Featured carousel:** up to 3 featured insights, each with date, tags, title, excerpt, author, Read More and image. It shows numbered dots and appears to autoplay.
2. **Listing:** category tabs (All insights & news, Firm News, Articles, Insights, Regulatory Updates, Events), a "Sort By" dropdown that filters by practice area and combines with the tabs, and a 3×3 grid paginated 9 per page. Pro bono stories never appear here; they live on the Responsible Business page.
3. The shared sections.

Each card shows a category chip, a practice-area chip, a date, a title and an author. The author is either an attorney (photo, name, role) or the firm itself (the frontend's logo mark, "SPA AJIBADE & Co.", "Law Firm"). The button reads **"Read More"** for articles and **"Watch Video"** for video content.

### Insight detail — `GET /insights/:slug`

Category chips, date, title, cover image, the body, and the author block, then a link after the body: "Read Article" (to the external article or an uploaded PDF) or "Watch Video". A back link returns to Insights & News, or, for a pro bono story, to the Responsible Business page.

### Careers — `GET /pages/careers` + `GET /jobs`

1. **Hero:** "Practice Law, Not Just A Role." with CTAs Discuss a Mandate / Our People.
2. **Job cards:** each shows a practice area, a description, chips (experience, employment type, work mode, location), a title and a "Send your CV" button, which leads to `POST /jobs/:id/applications`.
3. **No open roles:** when nothing is open, an empty state ("No Open Roles at the Moment", a paragraph with the HR mailto link, and "Send your CV") replaces the cards. That CTA's behaviour is pending; only its label is served.
4. The shared sections.

### FAQ — `GET /pages/faq`

A hero ("Frequently Asked Questions", with CTAs Discuss a Mandate / View our offices), then the shared sections.

### Our Offices — `GET /pages/offices`

1. **Hero:** "Wherever You Find Us." with CTAs Discuss a Mandate / Chat with us.
2. **Office cards:** Lagos, then Abuja, then Ibadan. Each has a map (from coordinates), the office name, an address, office hours, the Chat/Message/Call actions and "Get Directions".
3. The shared sections.

## Forms (write endpoints)

| Form             | Trigger                                  | Endpoint                                  |
| ---------------- | ---------------------------------------- | ----------------------------------------- |
| Mandate enquiry  | "Discuss a Mandate" (the UX flow is TBD) | `POST /enquiries`                         |
| Message the firm | "Message the firm" pill                  | `POST /messages`                          |
| Job application  | "Send your CV"                           | `POST /jobs/:id/applications` (multipart) |

## Screens not yet designed, or not built yet

- The Discuss a Mandate flow, and "Discuss a Mandate" on an attorney card (frontend only, does nothing yet).
- The chat assistant (not built now).
- Where "View Our Recognitions" on Home goes, and what "Send your CV" does when no job is open.
- The search results UI and all mobile layouts.

## Known content conflicts in the designs

These are listed in `docs/DECISIONS.md`. Don't "fix" them silently in seed data; seed what the design says and keep the conflict logged.
