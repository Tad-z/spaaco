# Seed Content (transcribed from the approved designs)

This is the only source for real copy. It's used for fixtures, the dev/staging seed, and the launch content loader (ROADMAP 7.5). Images are not listed here: dev uses placeholders, and the firm uploads real images through the admin UI. Keep wording exact, including punctuation such as trailing full stops on titles. `[PENDING FROM FIRM]` marks content the designs don't show. Known conflicts are flagged with ⚠ and listed in DECISIONS.md. Seed them as they appear in the designs.

**Design update v2 (29 Sep 2026).** `docs/SEED_CONTENT_V2.md` adds to and overrides this file, and holds the full text of everything new: practice-area detail copy (hero paragraphs, overviews, core services, approach, industries, leads), the Managing Partner's profile, the recognition directories and awards, the industries list, the Responsible Business page, the careers empty state, the legal pages and the new About mission copy. The sections below are updated to agree with it; where a fact appears only in V2, it is not repeated here.

## Site settings

- **firmName:** SPA Ajibade & Co.
- **legalDescriptor:** Legal Practitioners, Arbitrators and Notaries Public
- **tagline:** Counsel to the institutions building Nigeria's economy.
- **foundedYear:** 1967
- **phone:** (+234) 80000000000 ⚠ a placeholder in the design, and one digit too long
- **email:** frontoffice@spaajibade.com
- **socials:** instagram, facebook, x, linkedin, youtube (all URLs are `[PENDING FROM FIRM]`)
- **copyright:** ©2026 by SPA Ajibade & Co. All Rights Reserved.
- **faqSection:** eyebrow "FAQ's", title "Answers Before You Reach Out."
- **stillHaveQuestions:** title "Still have questions?", text "Speak with someone directly, or start a conversation with our assistant for a quick answer." Actions: Chat with us (`action:chat`), Message the firm (`action:message`), Call the firm (`action:call`)
- **contactCallout:** title "Start With A Conversation, Not A Form."
  - text "Speak with the firm directly, whether it's a new mandate, a question about an existing matter, or something you're not sure fits either."
  - secondaryCta "Explore Our Practice Areas" → `/practice-areas` (v2; was "View our offices")
  - primaryCta "Discuss a Mandate" → `action:mandate`
- **aboutAnchors (v2):** Our Story (`/about#story`), Mission, Vision & Values (`/about#mission`), Our Principles (`/about#principles`), Recognition (`/about#recognition`)
- **footerLinks (v2, "Quick Links"):** Home, About Us, Practice Areas, Our People, Insights & News, Careers, FAQ's
- **legalLinks (v2):** Terms of Service → `/legal/terms`, Privacy Policy → `/legal/privacy`
- **newsletter (v2):** title "Subscribe for legal insights", note "Your information is kept confidential", enabled `false` (no subscribe endpoint)

## Practice areas (order as on the Practice Areas page)

| #   | title                               | shortLabel            | featuredOnHome | summary                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------- | --------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Company Secretarial                 | Company Secretarial ⚠ | false ⚠        | When a business must fulfill its statutory obligations, the firm expertly manages all company secretarial duties, including board and shareholder governance, comprehensive CAC filings, and ensuring full regulatory compliance with laws and standards.                                       |
| 2   | Corporate Finance & Capital Markets | Corporate             | true           | When a business needs to raise capital, restructure, or meet regulatory requirements, the firm guides it through securities issuance, corporate restructuring, and filings with the Securities and Exchange Commission.                                                                         |
| 3   | Data Protection & Privacy           | Data Privacy          | true           | When a company collects or manages personal data, it ensures compliance with the Nigeria Data Protection Act 2023 by providing comprehensive support, including conducting audits, drafting policies, and managing responses in the event of a data breach.                                     |
| 4   | Dispute Resolution & Arbitration    | Dispute Resolution    | true           | When a disagreement threatens to disrupt a business, a contract, or a relationship, the firm steps in to resolve it, whether that means representing a client in court, before an arbitral tribunal, or through negotiated settlement, across commercial, shareholder, and regulatory disputes. |
| 5   | Energy & Natural Resources          | Energy                | true           | When a project involves power generation, distribution, or oil and gas, the firm advises on the regulatory approvals and compliance needed to get it built and keep it running, from electricity sector rules to mini-grid and rural electrification.                                           |
| 6   | Intellectual Property               | Intellectual Property | true           | When a business wants to protect its creations such as a brand, invention, or original content, our firm expertly handles the full process of registration, licensing, and enforcement to keep ownership rights fully protected and secure.                                                     |
| 7   | Real Estate & Succession            | Real Estate           | true           | When a client is buying property, resolving a landlord-tenant dispute, or planning what happens to their estate, the firm manages the legal work that makes the transaction or transition sound.                                                                                                |
| 8   | Tax                                 | Tax                   | true           | When a business needs to understand or meet its tax obligations, the firm advises on compliance and represents clients in disputes with tax authorities, protecting their financial position along the way.                                                                                     |
| 9   | Telecommunications Regulatory       | Telecoms ⚠            | false ⚠        | When a business operates in or enters the telecommunications sector, the firm advises on licensing, spectrum, and compliance with NCC regulations, from market entry to ongoing regulatory obligations.                                                                                         |

- The Home tab order (v2) is Corporate, Energy, Dispute Resolution, Intellectual Property, Real Estate, then the rest (Data Privacy, Tax), stored as `homeOrder`.
- The title "TAX" appears in all caps in the design; seed it as "Tax".
- `showInFooter`: true for all nine (v2; the footer lists every area).
- `summary` above is the Practice Areas **grid card**. `homeSummary` equals it for every area except Intellectual Property, and `heroIntro` equals it except for Company Secretarial; both exceptions are in SEED_CONTENT_V2.
- The detail fields (`heroIntro`, `overview`, `coreServices`, `approach`, `industries`, `lead`) are in SEED_CONTENT_V2. `body`, `keyServices` and `contacts` no longer exist.

## People (directory order)

| honorific | firstName | lastName | postNominals | role                | featuredInLeadership |
| --------- | --------- | -------- | ------------ | ------------------- | -------------------- |
| Dr.       | Babatunde | Ajibade  | SAN          | managing_partner    | true                 |
| Dr.       | John      | Onyido   |              | partner             | true                 |
| Dr.       | Kolawole  | Mayomi   |              | partner             | true                 |
| Mr.       | Peter     | Olalere  |              | associate_partner ⚠ | false                |
| Mrs.      | Bolaji    | Gabari   |              | associate_partner ⚠ | false                |
| Dr.       | Magnus    | Ejelonu  |              | associate_partner ⚠ | false                |
| Mr.       | Moruf     | Sowunmi  |              | associate_partner ⚠ | false                |
|           | Emmanuel  | Bassey   |              | senior_associate    | false                |
|           | David     | Essien   |              | senior_associate    | false                |

Honorifics for Mr./Mrs. come from the About text. Cards show no honorific except "Dr.", so the `displayName` virtual omits Mr./Mrs. The spelling is **Sowunmi** (resolved in v2).

The last role is `trainee_associate` (v2; was `nysc_associate`); nobody in the designs holds it yet. Dr. Ajibade's profile (bio, card bio, education, memberships, practice areas) is in SEED_CONTENT_V2. Everyone else's `practiceAreas` are the areas they lead; their bios, card bios, education and memberships are `[PENDING FROM FIRM]`, and every LinkedIn, Instagram and email is `[PENDING FROM FIRM]` (seeded null).
**MP quote (About → Our Story):** "law is a profession, not an occupation." (lowercase start, as designed)

## Offices (page order)

| name   | address                                                 | hours                                |
| ------ | ------------------------------------------------------- | ------------------------------------ |
| Lagos  | Suite 201, SPAACO House, 27A Macarthy Street, Onikan    | 8:00 AM to 4:00 PM, Monday to Friday |
| Abuja  | 2nd Floor, Left Wing, Commercial Plaza, Gudu            | 8:00 AM to 4:00 PM, Monday to Friday |
| Ibadan | Top Floor Suite, SPAACO House, 138 Liberty Stadium Road | 8:00 AM to 4:00 PM, Monday to Friday |

Coordinates are `[PENDING]`: the design maps are placeholders. The footer lists Lagos, Ibadan, Abuja ⚠. Use the page order everywhere. Office emails and phones are `[PENDING FROM FIRM]`; until they arrive, the footer falls back to frontoffice@spaajibade.com and the site phone (v2).

## Recognition (v2: directories and awards, replacing the Home tiles)

Directories, in order: IFLR 1000, Chambers Global, Legal 500, Who's Who Legal. The awards — the first four featured on Home as badges, the last two seeded under IFLR 1000 exactly as the design shows them ⚠ — are listed in SEED_CONTENT_V2, with the shared "Awards by the years" eyebrow and hero subtitle. Legal 500 and Who's Who Legal awards are `[PENDING FROM FIRM]`.

## FAQs (order)

1. How do I schedule a consultation?: Clients have the option to schedule a consultation by directly reaching out through the Discuss a Mandate feature, or by contacting any of our three offices via phone or email. When doing so, they can provide a brief overview of their issue. A dedicated member of our team will then promptly follow up to arrange a convenient time for the client to speak with the most appropriate lawyer who specializes in that particular area of law. (final in v2)
2. What types of matters does the firm handle?: The firm provides expert advice on a wide range of legal matters including dispute resolution and arbitration, corporate finance and capital markets, real estate and succession planning, energy and natural resources, intellectual property rights, data protection regulations, and tax law. Their comprehensive services are designed to support clients through complex legal challenges in these diverse areas.
3. Does the firm work with international clients?: final in v2 — see SEED_CONTENT_V2, "FAQs #3–5"
4. How is client confidentiality handled?: final in v2 — see SEED_CONTENT_V2, "FAQs #3–5"
5. How long does a typical matter take?: final in v2 — see SEED_CONTENT_V2, "FAQs #3–5"

## Insights

| title                                                                                                                           | format  | categories         | practiceAreas                    | author        | publishedAt | featured |
| ------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------ | -------------------------------- | ------------- | ----------- | -------- |
| Repositioning and Promoting Energy Investments Between South Africa and Nigeria: A Perspective on Trade Secrets.                | article | articles           | Energy & Natural Resources       | John Onyido   | 2026-06     | true     |
| The Rural Electrification Agency, Renewable Electricity and the Mini-Grid Regulation 2026: Updates and Prospects for Investors. | article | articles           | Energy & Natural Resources       | Peter Olalere | 2026-07     | true     |
| Inside the 2025 Annual Business Luncheon: What Industry Leaders Are Saying About Nigeria's Economy                              | video   | events, firm_news  | —                                | firm          | 2026-06 ⚠   | true     |
| Regulatory Update On The 2026 Supreme Court Practice Directions                                                                 | article | regulatory_updates | Dispute Resolution & Arbitration | firm          | 2026-05     | false    |

The categories (v2) are `firm_news, articles, insights, regulatory_updates, news_updates, events, pro_bono`; `media_coverage` and `webinar_resources` are gone. Article #1's author is John Onyido, as on the card, and its body is in SEED_CONTENT_V2. The pro bono story ("SPA AJIBADE & Co. Sponsors Team Titans, an American Flag Football Team", `pro_bono`, by the firm, 16 September 2025 ⚠) is in SEED_CONTENT_V2; its demo repeats (`-2`…`-12`) live in `fixtures/seed/insights.demo.json`, which only the dev seed reads. Both video insights are seeded as articles until the firm supplies the links (ADR-042).

Excerpt for #1: "The focus of this brief is specifically on a bilateral energy investment relationship between Nigeria and South Africa: two nations that represent, by any objective commercial assessment, the most logical and most strategically significant energy partnership on the African continent…". The other excerpts, all bodies, and the video URL are `[PENDING FROM FIRM]`. For listing fixtures that need 9+ cards, repeat these with `-2`, `-3` slug suffixes, marked in the fixture filename as demo data.

## Jobs

Both jobs share: practiceArea Corporate Finance & Capital Markets, experience "2–4 years experience", employmentType full_time, workMode hybrid, office Lagos.

- **Associate**
- **NYSC Associate** ⚠ (identical description and experience)

Description (both):

> We're looking for an Associate to join our Corporate Finance & Capital Markets practice. You'll work directly with partners on securities offerings, corporate restructurings, and regulatory filings for clients across banking, energy, and infrastructure, supporting due diligence, drafting, and filings on live transactions, advising clients on compliance with SEC and CAMA requirements, and working directly with senior counsel rather than as part of a rotating pool.
>
> We're looking for someone with 2 to 4 years post-call experience, ideally in corporate finance or capital markets, called to the Nigerian Bar, with strong drafting and analytical skills, and comfortable working directly with clients and partners from an early stage.

## Pages

### home

- **hero:** "Counsel To The Institutions Building Nigeria's Economy."
  - subtitle: "For over five decades, we have advised governments, financial institutions and multinational corporations on capital markets transactions, complex disputes and the regulatory frameworks that shape commerce in Nigeria."
  - CTAs: Discuss a Mandate (`action:mandate`) / Explore Our Practice Areas (`/practice-areas`)
- **aboutFirm.title:** "A Firm Built On Integrity, Proven In Outcomes."
  - para 1 ⚠: "S. P. A. Ajibade & Co was founded in 1967. The Firm is managed by Dr. B. A. M. Ajibade, SAN as the Managing Partner together with six (6) other Partners, Dr. J. C. Onyido, Dr. K. Mayomi, Mrs. B. Gabari, Mr. P. O. Olalere and Dr. M. Ejelonu and Mr. M. Sowunmi. The Firm is focused on the following areas of practice: Dispute Resolution, Intellectual Property & Telecommunications, Corporate Finance & Capital Markets, Real Estate & Succession, Energy & Natural Resources."
  - para 2: "At S. P. A. Ajibade & Co, maintaining the integrity of the legal profession by ethically satisfying every client's specific needs and interests, whilst ensuring the continuous growth and development of the Firm is the core of daily practice."
  - cta: "Learn more about our history" → `/about`
- **hero.images (v2):** three placeholder slides, sharing the text and CTAs above.
- **videoShowcase:** videoUrl `[PENDING FROM FIRM]`, with a poster placeholder. caption (v2): "Our Managing Partner on what fifty-nine years of practice has taught us."
- **recognitionSection (v2):** eyebrow "Recognition", title "Ranked Among Nigeria's Top Firms By Key Global Legal Institutions.", cta "View Our Recognitions" (href null, destination pending); the badges are the four featured awards
- **practiceSection:** eyebrow "Services", title "Focused Practice Areas.", cta "Explore Our Practice Areas" → `/practice-areas`
- **leadershipSection:** eyebrow "Our People", title "Behind Every Victory Is A Leadership You Can Trust", cta "View full directory" → `/people`
- **whyChooseUs:** eyebrow "Why Clients Choose SPA Ajibade", title "Scale Hasn't Changed How We Treat A Matter."
  - text "Across every office and every practice area, the standard stays the same, direct access to the advisor handling your matter, not a rotating team."
  - points (icon keys are suggestions): Proven Track Record (`award`), Trial-Tested Attorneys (`shield-plus`), Client-Centered Focus (`handshake`), Confidential Handling (`folder-lock`)
- **insightsSection:** eyebrow "Insights and News", title "Recent Publications", cta "View all insights" → `/insights`

### about

- **hero:** "Who We Are"
  - subtitle: "Integrity isn't a value we list, it's the reason clients keep coming back."
  - CTAs: Discuss a Mandate / Meet Our People (`/people`)
- **story:** eyebrow "Our Story", title "Integrity And Commitment Build Client Trust.", quotePerson = Babatunde Ajibade. Paragraphs:
  1. The firm started in 1967, at a time when Nigerian businesses had few local options for the kind of legal counsel that large transactions and disputes required. Almost sixty years later, that gap has closed, but the reason clients still come to S. P. A. Ajibade & Co. hasn't changed.
  2. We've handled disputes that took years to resolve and transactions that closed in weeks. We've advised on capital markets deals, aviation matters, energy projects, intellectual property disputes, data protection compliance, and everything in between. The work rarely looks the same twice.
  3. What's stayed constant is how we approach it: with judgment built over decades, not shortcuts learned from templates. Clients don't come to us because we're the oldest firm in the room, they come because when something is actually at stake, they want someone who's handled it before and will tell them the truth about it.
  4. Today, that means offices in Lagos, Abuja, and Ibadan, and a practice that spans far more ground than "corporate and commercial law" ever really captured.
- **story.profileDownload (v2):** leadText "To learn more about the firm, you may download a copy of our profile", linkLabel "here", document `[PENDING FROM FIRM]` (a placeholder PDF record in dev)
- **stats.title:** "Decades Of Practice, Measured In Outcomes."
  - 59+ Years | Advising across every major sector | Advisory | source `computed:yearsSinceFounding`
  - 3 Offices | Lagos, Abuja, Ibadan | Presence | source `computed:officeCount`
  - 15+ Areas ⚠ | Covering all commercial practice | Practice | source `manual`
  - 700+ Matters | Cross-border and domestic | Handled | source `manual`
- **missionSection:** eyebrow "Mission, Vision & Values", title "What Drives Our Practice And Why Clients Trust Us."
  - The four bodies are final in v2 and are HTML ("Our Asset" has bold phrases); the text is in SEED_CONTENT_V2.
- **principles:** eyebrow "Principles That Guide Every Matter", title "Built On Principle, Proven Over Nearly Six Decades Of Practice."
  - Integrity in practice: Our clients trust us to act with responsibility, discretion, and respect for the law.
  - Commitment to clients: Every client deserves focused attention, genuine care & strong representation.
  - Excellence in service: We pursue excellence in every interaction and every outcome we work toward.
  - Trust & transparency: Setting realistic expectations, and building relationships grounded in confidence.
  - Strength in advocacy: We represent our clients with confidence, resilience, and strategic determination.
  - Justice with purpose: Always focused on protecting rights and advancing our clients' best interests.
- **awardsList:** eyebrow "Recognition", title "Award-Winning Legal Services"
  - rows (v2): the recognition directories, each linking to `/recognition/:slug`

### practice-areas

- **hero:** "Our Practice Areas"
  - subtitle: "We've covered enough ground to know that no two matters are really the same."
  - CTAs: Discuss a Mandate / Meet Our People
- **gridSection:** eyebrow "Confidence, resilience, and strategic precision", title "We Are Driven By A Clear Purpose To Protect Rights & Pursue Fair Outcomes."
- **csrBanner:** title "Pro Bono & Community Commitment"
  - text "Beyond advising clients, we take an active role in strengthening the legal environment and supporting the communities we work in."
  - cta "Learn About Our CSR" → `/responsible-business` (v2)
  - images (v2): three placeholder slides

### people

- **hero:** "Get To Know Our Attorneys"
  - subtitle: "Meet the attorneys behind our firm's trusted reputation for strong counsel, thoughtful representation, strategic advocacy, and unwavering commitment to every client we serve." (the design's typo "forstrong" is fixed here)
  - CTAs: Discuss a Mandate / About Us (`/about`)
- **directorySection:** eyebrow "Our People", title "Behind Every Victory Is A Leadership You Can Trust"
- **roleFilters:** Our Attorneys (all), Partners, Associate Partners, Senior Associates, Associates, Trainee Associates (v2). The "Partners" filter includes managing_partner.
- **practiceAreaFilters (v2):** every published practice area, under a dropdown headed "Practice Area".

### insights

- **hero:** none in the design (the page opens with the featured carousel), so seed `null`.
- **listingSection.title:** "Insights & News"
- **categoryFilters:** All insights & news, Firm News, Articles, Insights, Regulatory Updates, News Updates, Events (v2; `pro_bono` is not a tab)

### careers

- **hero:** "Practice Law, Not Just A Role."
  - subtitle: "At SPA Ajibade, associates work directly with partners on matters that matter, not behind layers of a rotating team."
  - CTAs: Discuss a Mandate / Our People
- **jobsSection.title:** "Careers"
- **jobsSection.emptyState (v2):** "No Open Roles at the Moment", with the body and "Send your CV" label from SEED_CONTENT_V2

### faq

- **hero:** "Frequently Asked Questions"
  - subtitle: "Straight answers to what people most often ask before reaching out, about the firm, how matters work, and what to expect."
  - CTAs: Discuss a Mandate / View our offices (`/offices`)

### offices

- **hero:** "Wherever You Find Us."
  - subtitle: "Three offices, one standard of counsel, direct access to the team handling your matter, no matter which door you walk through."
  - CTAs: Discuss a Mandate / Chat with us (`action:chat`)

### recognition (v2)

- **directoryPage:** awardsEyebrow "Awards by the years", CTAs Discuss a Mandate (`action:mandate`) / Meet Our People (`/people`)

### responsible-business (v2)

- **title:** "RESPONSIBLE BUSINESS", three placeholder images, backLink "Back to Practice Areas" → `/practice-areas`

## Legal pages (v2)

- **terms:** "Terms of Service", body `[PENDING FROM FIRM]`
- **privacy:** "Privacy Policy", body `[PENDING FROM FIRM]`
