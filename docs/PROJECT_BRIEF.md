# Project Brief

## The client

**SPA Ajibade & Co.** is described as "Legal Practitioners, Arbitrators and Notaries Public". It is a Nigerian commercial law firm founded in 1967, with offices in Lagos, Abuja and Ibadan. Its positioning is "Counsel to the institutions building Nigeria's economy." Its audience is governments, financial institutions and multinational corporations.

## What we are building

A content API for a 9-page marketing website, plus an authenticated admin API that the frontend team will build a dashboard on top of. The frontend wants every piece of copy, imagery and structured content to come from this API. Nothing should be hard-coded in the frontend except layout and styling.

The site's primary conversion is **"Discuss a Mandate"**. It appears in the header, in every hero and in the contact callout. The secondary goals are exploring practice areas, meeting attorneys, reading insights, and recruitment ("Send your CV").

## How content is managed

All text and all content images are managed by the firm through an **admin UI that the frontend team builds** on our admin API. The admin UI uploads images to the media library, attaches them to content by ID, replaces or edits them, and edits every piece of page copy, collection item and site-wide setting. Nothing from Figma is imported: the designs define the *structure*, and the firm supplies and maintains the real content. The logo, icons and decorative graphics are frontend assets (see "Image ownership" in DATA_MODEL.md).

## Global shell (on every page)

The shell is served by `GET /api/v1/site`:

- **Top bar:** phone, email, and social links (Instagram, Facebook, X, LinkedIn, YouTube).
- **Main nav:** Home, About Us ▾, Practice Areas ▾, Our People ▾, Insights & News ▾, Careers, FAQ's, Our Offices, plus a search icon and a "Discuss a Mandate" button. Dropdown contents aren't designed yet; the Practice Areas dropdown should be generated from the practice areas collection.
- **FAQ section:** "Answers Before You Reach Out." It has 5 accordion items and a "Still have questions?" card with three actions: Chat with us, Message the firm, Call the firm. The FAQ items come from the FAQ collection; the card copy comes from settings.
- **Contact callout:** "Start With A Conversation, Not A Form." with the buttons View our offices and Discuss a Mandate.
- **Footer:** logo (a frontend asset), tagline and socials; a Links column mirroring the nav; a Practice Areas column (from the collection); an Offices column (from the collection); and a copyright line.
- **Floating "Chat with us" pill.** The chat implementation is an open question (see DECISIONS).

## Pages → sections → data

Every inner page has a **hero**: a background image, title, subtitle and two CTAs. The primary CTA is always "Discuss a Mandate". Heroes are stored in each page document.

### Home — `GET /pages/home`
1. **Hero:** "Counsel To The Institutions Building Nigeria's Economy." with CTAs Discuss a Mandate / Explore Our Practice Areas.
2. **About the Firm:** a title, two paragraphs, a "Learn more about our history" link, and a world-map background image.
3. **Video showcase:** a large video with a poster image and a play button.
4. **Recognition:** two tabs, "Our Achievements" and "Independently Recognized By", each holding badge tiles. The tiles come from the `recognitions` collection.
5. **Focused Practice Areas:** eyebrow "Services", a pill tab bar using each practice area's *short label*, a carousel of cards (image, title, summary, Learn More), and an "Explore Our Practice Areas" CTA. Data: the practice areas flagged `featuredOnHome`, in order.
6. **Leadership:** eyebrow "Our People", with 3 attorney cards (photo, name, role, LinkedIn, and a "+" that opens a bio) and "View full directory". Data: people flagged `featuredInLeadership`.
7. **Why Clients Choose Us:** a title, body text, 4 icon points and an image.
8. **Recent Publications:** eyebrow "Insights and News", a carousel of the latest insight cards, and "View all insights".
9. The shared FAQ section, contact callout and footer.

### About Us — `GET /pages/about`
1. **Hero:** "Who We Are" with CTAs Discuss a Mandate / Meet Our People.
2. **Our Story:** a pull quote from the Managing Partner with his photo, name and role, beside the title "Integrity And Commitment Build Client Trust." and 4 paragraphs.
3. **Stats row:** "Decades Of Practice, Measured In Outcomes." with 4 stats. Each stat has a value, a caption and an italic label. Some values are computed (see DATA_MODEL).
4. **Mission, Vision & Values:** an accordion with Mission, Vision, Values and Asset, beside an image.
5. **Principles:** "Built On Principle…", a 3×2 grid of items, each with an icon, title and text, plus a cut-out statue image.
6. **Awards list:** "Award-Winning Legal Services", 4 rows each with a name and a "View Awards ↗" link, plus an image.
7. The shared sections.

### Practice Areas — `GET /pages/practice-areas`
1. **Hero:** "Our Practice Areas" with CTAs Discuss a Mandate / Meet Our People.
2. **Grid:** a title, then a 3×3 grid of all published practice areas (image, title, summary clamped to 4 lines by the frontend, Learn More).
3. **Pro Bono & Community Commitment banner:** a title, text, image and a "Learn About Our CSR" CTA. The CSR page doesn't exist yet.
4. The shared sections.

### Practice Area detail — `GET /practice-areas/:slug`
This page is **not designed yet**. Model the fields in DATA_MODEL so the frontend can start when the design lands.

### Our People — `GET /pages/people` + `GET /people`
1. **Hero:** "Get To Know Our Attorneys" with CTAs Discuss a Mandate / About Us.
2. **Directory:** role filter tabs (Our Attorneys = all, Partners, Associate Partners, Senior Associates, Associates, NYSC Associates), a Sort By control, and a 3-column card grid paginated 9 per page ("Page 1 of N").
3. The shared sections.

The "+" on a card opens the attorney's bio. The design (modal or page) is TBD, so `GET /people/:slug` serves it either way.

### Insights & News — `GET /pages/insights` + `GET /insights`
1. **Featured carousel:** up to 3 featured insights, each with date, tags, title, excerpt, author, Read More and image. It shows numbered dots and appears to autoplay.
2. **Listing:** category tabs (All, Firm News, Articles, Insights, Regulatory Updates, News Updates, Media Coverage, Webinar Resources), Sort By, and a 3×3 grid paginated 9 per page.
3. The shared sections.

Each card shows a category chip, a practice-area chip, a date, a title and an author. The author is either an attorney (photo, name, role) or the firm itself (the frontend's logo mark, "SPA AJIBADE & Co.", "Law Firm"). The button reads **"Read More"** for articles and **"Watch Video"** for video content.

### Insight detail — `GET /insights/:slug`
Not designed yet. Serve the full body, or the video URL for video content.

### Careers — `GET /pages/careers` + `GET /jobs`
1. **Hero:** "Practice Law, Not Just A Role." with CTAs Discuss a Mandate / Our People.
2. **Job cards:** each shows a practice area, a description, chips (experience, employment type, work mode, location), a title and a "Send your CV" button, which leads to `POST /jobs/:id/applications`.
3. The shared sections.

### FAQ — `GET /pages/faq`
A hero ("Frequently Asked Questions", with CTAs Discuss a Mandate / View our offices), then the shared sections.

### Our Offices — `GET /pages/offices`
1. **Hero:** "Wherever You Find Us." with CTAs Discuss a Mandate / Chat with us.
2. **Office cards:** Lagos, then Abuja, then Ibadan. Each has a map (from coordinates), the office name, an address, office hours, the Chat/Message/Call actions and "Get Directions".
3. The shared sections.

## Forms (write endpoints)

| Form | Trigger | Endpoint |
|---|---|---|
| Mandate enquiry | "Discuss a Mandate" (the UX flow is TBD) | `POST /enquiries` |
| Message the firm | "Message the firm" pill | `POST /messages` |
| Job application | "Send your CV" | `POST /jobs/:id/applications` (multipart) |

## Screens not yet designed (we model data for them anyway)

- Practice area detail, insight detail, attorney bio, and the CSR page.
- The Discuss a Mandate flow and the chat widget's open state.
- Nav dropdown contents, the search results UI, Sort By options, and all mobile layouts.

## Known content conflicts in the designs

These are listed in `docs/DECISIONS.md`. Don't "fix" them silently in seed data; seed what the design says and keep the conflict logged.
