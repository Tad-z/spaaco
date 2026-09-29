# Seed Content v2 (from the 29 Sep 2026 designs)

This file adds to and overrides `SEED_CONTENT.md`. Keep wording exact. `[PENDING FROM FIRM]` means the design doesn't show the content.

## Settings changes

- **contactCallout.secondaryCta:** "Explore Our Practice Areas" → `/practice-areas`.
- **newsletter:** title "Subscribe for legal insights", note "Your information is kept confidential", enabled `false`.
- **legalLinks:** "Terms of Service" → `/legal/terms`, "Privacy Policy" → `/legal/privacy`.
- **footer quickLinks:** Home, About Us, Practice Areas, Our People, Insights & News, Careers, FAQ's.
- **aboutAnchors:** Our Story, Mission, Vision & Values, Our Principles, Recognition.
- Office emails and phones: `[PENDING FROM FIRM]`. Until they arrive, fall back to frontoffice@spaajibade.com and the site phone.

## FAQ #1 (now final)

**How do I schedule a consultation?** Clients have the option to schedule a consultation by directly reaching out through the Discuss a Mandate feature, or by contacting any of our three offices via phone or email. When doing so, they can provide a brief overview of their issue. A dedicated member of our team will then promptly follow up to arrange a convenient time for the client to speak with the most appropriate lawyer who specializes in that particular area of law.

## Home

- **hero.images:** 3 placeholder images, sharing the existing text and CTAs.
- **videoShowcase.caption:** "Our Managing Partner on what fifty-nine years of practice has taught us."
- **recognitionSection:**
  - eyebrow: "Recognition"
  - title: "Ranked Among Nigeria's Top Firms By Key Global Legal Institutions."
  - cta: "View Our Recognitions" (href null)
  - badges: awards 1–4 below
- **practiceSection:** tab order is Corporate, Energy, Dispute Resolution, Intellectual Property, Real Estate, then the rest.

## About

- **story paragraph 4:** "Today, that means offices in Lagos, Abuja, and Ibadan, and a practice that spans far more ground than "corporate and commercial law" ever really captured."
- **story.profileDownload:** leadText "To learn more about the firm, you may download a copy of our profile", linkLabel "here", document `[PENDING FROM FIRM]` (seed a placeholder PDF in dev).
- **missionSection.items** (the bodies are HTML):
  - **Our Mission:** We aim to continuously provide high quality legal services to clients that need them globally. We will do this promptly, ethically, and effectively to ensure their satisfaction every time.
  - **Our Vision:** To become the foremost legal industry influence in the establishment and sustenance of healthy corporate and commercial environments that are characterized by integrity and innovation.
  - **Our Values:** Our corporate goals and objectives are distilled into a number of corporate values that guide the way we conduct our business, provide solutions and add value to the environment.
  - **Our Asset:** `Our strength rests on five things: <strong>our people</strong>, <strong>our goodwill</strong>, and <strong>our clients</strong>, built over decades of trust. It shows equally in the <strong>quality of our work</strong> and the <strong>infrastructure</strong> behind it.`
- **awardsList:** eyebrow "Recognition", title "Award-Winning Legal Services". The rows come from the directories.

## Recognition

**Page singleton `recognition`:** eyebrow "Awards by the years", CTAs Discuss a Mandate / Meet Our People (`/people`).

**Directories** (in this order): IFLR 1000, Chambers Global, Legal 500, Who's Who Legal.

- Every directory's heroSubtitle is "Recognized by one of the legal industry's leading directories for the quality and consistency of our work."
- Logos are placeholders.

**Awards**

| #   | directory       | title                                    | year | featuredOnHome         |
| --- | --------------- | ---------------------------------------- | ---- | ---------------------- |
| 1   | IFLR 1000       | IFLR1000: Recommended Firm               | 2024 | true (badge variant A) |
| 2   | IFLR 1000       | IFLR1000: Recommended Firm               | 2024 | true (badge variant B) |
| 3   | Chambers Global | Chambers Global: Ranked in Global        | 2026 | true                   |
| 4   | Chambers Global | Chambers Global: Ranked in Global        | 2026 | true                   |
| 5   | IFLR 1000       | Chambers Global: Top Ranked Leading Firm | 2026 | false                  |
| 6   | IFLR 1000       | Chambers Global: Top Ranked Leading Firm | 2025 | false                  |

⚠ Rows 5–6 are seeded under IFLR 1000 exactly as the design shows them (both with the Chambers 2026 badge), and logged as a conflict. Legal 500 and Who's Who Legal awards are `[PENDING FROM FIRM]`.

## Industries (shared list)

Banking & Finance · Consumer & Retail · E-Commerce & Data Platforms · Energy & Natural Resources · Entertainment & Media · Financial Services · Financial Services & Fintech · Government & Public Sector · Healthcare & Insurance · Hospitality & Leisure · Infrastructure & Construction · Insurance & Reinsurance · Manufacturing & FMCG · Media & Broadcasting · Mining & Minerals · Oil & Gas · Power & Utilities · Real Estate & Construction · Renewable Energy · Sports · Technology & Telecommunications

## Practice areas

For all nine areas, `summary` (the grid card) is unchanged from SEED_CONTENT.md. `homeSummary` equals `summary`, except for Intellectual Property. `heroIntro` equals `summary`, except where it's given below.

### Company Secretarial

- **Lead:** Babatunde Ajibade
- **heroIntro:** When a business needs to meet its statutory obligations, the firm handles company secretarial work, from board and shareholder governance to CAC filings and regulatory compliance.
- **overview:** Our team supports clients throughout the full lifecycle of their business, from incorporation through to ongoing governance. This includes company formation, joint ventures, registration of incorporated trustees and charitable trusts, and the ancillary company secretarial work that keeps a business compliant as it grows.
- **coreServices:**
  - Company Incorporation: Incorporation of companies, establishment of joint ventures, and registration of incorporated trustees and charitable trusts.
  - Share Reconstructions: Structuring and executing share reconstructions, including increases and reductions in share capital.
  - Corporate Filings: Handling alterations of name, objects, and articles of association, and other statutory filings required by corporate entities.
- **approach.text:** We work alongside our clients throughout the life of their business, not just at moments of transaction. That means understanding a company's structure and objectives well enough to advise on governance and compliance before they become urgent.
- **approach.points:**
  - Practical, business minded structuring advice
  - Clear guidance through statutory and regulatory obligations
  - Support across the full company lifecycle, from incorporation to governance
  - Responsive counsel on complex corporate transactions
- **industries:** Financial Services, Real Estate & Construction, Hospitality & Leisure, Manufacturing & FMCG

### Corporate Finance & Capital Markets

- **Lead:** Babatunde Ajibade
- **overview:** We are one of the leading firms in our region advising on capital markets and corporate finance, from equity and debt offerings to complex, cross-border mergers, acquisitions, and restructurings. Our clients include public and private companies, investment banks, private equity firms, and governments navigating today's regulatory environment.
- **coreServices:**
  - Equity & Debt Offerings: Advising issuers and investment banks on equity offerings, debt offerings, and structured securities transactions.
  - Mergers & Acquisitions: Structuring and executing domestic and cross-border mergers, acquisitions, and joint ventures.
  - Corporate Restructuring: Guiding clients through restructurings, divestments, and change of control transactions.
- **approach.text:** We work closely with listing authorities, regulators, and investment banks to bring complex transactions to market. Our strong relationships across the capital markets ecosystem mean we can move quickly and navigate regulatory requirements without losing sight of our clients' commercial objectives.
- **approach.points:**
  - Close collaboration with listing authorities and regulators
  - Strong relationships with investment banks and corporate issuers
  - Experience across equity, debt, and structured finance transactions
  - Comprehensive advice across multiple jurisdictions
- **industries:** Banking & Finance, Government & Public Sector, Energy & Natural Resources, Insurance & Reinsurance

### Data Protection & Privacy

- **Lead:** John Onyido
- **overview:** Beyond being a licensed Data Protection Compliance Organisation in Nigeria, we advise businesses that process large amounts of customer personal data on privacy obligations, regulatory compliance, and breach response. Our team also acts as outsourced data protection officers for clients who need ongoing, hands-on support.
- **coreServices:**
  - Compliance & Advisory: Data protection and privacy advisory services, regulatory compliance support, and breach remediation planning.
  - Privacy Audits: Conducting information privacy audits and data privacy breach impact assessments for client organisations.
  - DPO Services: Data protection training and acting as outsourced data protection officers for businesses that need dedicated oversight.
- **approach.text:** We treat data protection as an ongoing discipline, not a one-time audit. Our role includes interfacing directly with regulators like NITDA on our clients' behalf, so businesses can focus on operating while we manage regulatory exposure.
- **approach.points:**
  - Regulatory compliance auditing against Nigerian and applicable foreign data protection laws
  - Direct representation before NITDA
  - Ad-hoc legal advice and contract drafting for data-related agreements
  - Licensed Data Protection Compliance Organisation status
- **industries:** Financial Services & Fintech, Technology & Telecommunications, Healthcare & Insurance, E-Commerce & Data Platforms

### Dispute Resolution & Arbitration

- **Lead:** Kolawole Mayomi
- **overview:** Our dynamic Dispute Resolution practice handles cases in trial and appellate courts across Nigeria, as well as local and international arbitration proceedings under institutional rules including the ICC, UNCITRAL, and LCIA. We focus on achieving timely, efficient outcomes, resorting to litigation only when it cannot be avoided.
- **coreServices:**
  - Litigation: Representing clients in trial and appellate courts across Nigeria, with a focus on timely and cost-effective outcomes.
  - Arbitration: Conducting domestic and international arbitrations under ICC, UNCITRAL, and LCIA rules, as well as ad-hoc references.
  - Enforcement: Enforcing arbitral awards and foreign judgments, including multi-jurisdictional enforcement proceedings.
- **approach.text:** We provide top-tier legal advice designed to help clients avoid unnecessary cost where possible, and when litigation is unavoidable, we focus on achieving swift, effective resolution. Our access to an extensive base of resources means we can offer solutions, not just advice.
- **approach.points:**
  - Extensive experience across trial, appellate, and arbitral proceedings
  - Fellows and Members of the Chartered Institute of Arbitrators, UK
  - Multi-jurisdictional litigation and enforcement capability
  - Focus on efficient, commercially sound outcomes
- **industries:** Hospitality & Leisure, Banking & Finance, Energy & Natural Resources, Manufacturing & FMCG

### Energy & Natural Resources

- **Lead:** Peter Olalere
- **overview:** Our Energy and Natural Resources team advises on the development, financing, and acquisition of oil and gas assets, electric power projects, and mineral and precious stone transactions. We provide regulatory and project advisory from conception to decommissioning, for both companies and regulators across the Nigerian energy sector.
- **coreServices:**
  - Oil & Gas: Advising on acquisition, disposal of oil and gas assets, decommissioning, carbon capture, storage, and regulatory matters.
  - Power & Utilities: Advisory on power generation and distribution, Independent Power Producers, and supply and distribution activities.
  - Minerals & Renewables: Advising on minerals and precious stones transactions, and renewable energy including wind, solar, and biofuels.
- **approach.text:** We provide guidance to both regulators and companies, offering us a unique perspective on both sides of the energy sector. This dual insight enables us to foresee regulatory issues early on and design transactions that withstand thorough examination and scrutiny.
- **approach.points:**
  - Advisory experience across oil and gas, power, and minerals
  - Regulatory and policy advisory alongside transactional work
  - Experience with Independent Power Producers and mini-grid projects
  - Growing capability in renewable and clean energy technologies
- **industries:** Oil & Gas, Power & Utilities, Mining & Minerals, Renewable Energy

### Intellectual Property

- **Lead:** John Onyido
- **homeSummary:** When a business needs to protect what it's created, whether a brand, an invention, or content, the firm handles the registration, licensing, and enforcement that keeps that ownership secure.
- **overview:** Our Intellectual Property team protects clients' industrial and intellectual property rights, handling trademark and patent registration and anti-counterfeiting. We collaborate with Dispute Resolution and have a strong record with creative, entertainment, and sports clients.
- **coreServices:**
  - Trademarks & Patents: Applying for, registering, and renewing trademarks and patents, including assignment to third parties or subsidiaries.
  - Enforcement: Handling copyright, trademark, and patent infringement cases, including injunctions and anti-counterfeiting actions.
  - Licensing & Transfers: Drafting licensing agreements and copyright transfer agreements between clients and creative collaborators.
- **approach.text:** Our Intellectual Property team works closely with Dispute Resolution to address protection and enforcement together. This unified approach lets clients benefit from one team handling both rights acquisition and defense strategically.
- **approach.points:**
  - Full lifecycle IP management, from filing to enforcement
  - Multi-jurisdictional trademark portfolio management
  - Experience with NAFDAC and NOTAP applications
  - Close coordination with our Dispute Resolution practice
- **industries:** Entertainment & Media, Technology & Telecommunications, Sports, Consumer & Retail

### Real Estate & Succession

- **Lead:** Moruf Sowunmi
- **overview:** Our Real Estate and Succession practice specialises in the sale, acquisition, and perfecting of title to landed property in Nigeria. In succession matters, we handle both contentious and non-contentious work, from drafting wills and obtaining probate to resolving disputes when they arise.
- **coreServices:**
  - Real Estate Transactions: Due diligence on title and occupancy, perfecting mortgages, and structuring real estate financing arrangements.
  - Succession Planning: Drafting wills, obtaining probate and letters of administration, and re-sealing probate for estates outside Nigeria.
  - Contentious Probate: Handling disputes in succession matters, including appointment of administrators pendente lite.
- **approach.text:** We approach real estate and succession as intertwined fields because property frequently plays a central role in both areas. This means we focus on safeguarding a client's ownership rights now, while also carefully planning for the smooth and efficient transfer of that asset when the time comes, ensuring peace of mind for the future.
- **approach.points:**
  - Full due diligence on title and occupancy before transactions close
  - Experience with Real Estate Investment Trusts and joint ventures
  - Both contentious and non-contentious succession work
  - Cross-border support for estates with assets outside Nigeria
- **industries:** Hospitality & Leisure, Real Estate & Construction, Manufacturing & FMCG, Financial Services

### Tax

- **Lead:** Babatunde Ajibade
- **overview:** Our Tax practice advises businesses on compliance with Nigerian tax law and represents clients in disputes with tax authorities. We work alongside our Corporate Finance and Dispute Resolution teams where tax issues intersect with transactions or litigation.
- **coreServices:**
  - Tax Advisory: Advising businesses on compliance with Nigerian tax obligations and regulatory requirements.
  - Tax Disputes: Expert representation for clients in tax disputes and negotiations to ensure favorable outcomes and compliance.
  - Tax Support: Advising on the tax implications of corporate transactions, restructurings, and cross-border deals.
- **approach.text:** We treat tax as something that touches nearly every transaction, not a standalone concern. That means working closely with our other practice groups so tax exposure is addressed early, not discovered late.
- **approach.points:**
  - Advisory across compliance, disputes, and transactions
  - Coordination with Corporate Finance and Dispute Resolution teams
  - Focus on protecting clients' financial position
  - Practical guidance suited to Nigeria's regulatory environment
- **industries:** Financial Services, Manufacturing & FMCG, Energy & Natural Resources, Real Estate & Construction

### Telecommunications Regulatory

- **Lead:** Babatunde Ajibade
- **overview:** Our telecommunications regulatory team advises on licensing and compliance across the sector, including broadband, fibre optic installations, spectrum allocation, and rights of way. We support clients under the Nigerian Communications Commission, including operators, manufacturers, and service providers.
- **coreServices:**
  - Licensing & Compliance: Securing operating licenses and advising on regulatory compliance under NCC supervision.
  - Infrastructure & Access: Helping out with collocation, sharing infrastructure, fiber connections, and rights of way.
  - Spectrum & Competition: Advising on spectrum allocation, type-approval of equipment, and antitrust and competition issues.
- **approach.text:** We provide expert advice across the entire telecoms value chain, working with operators, support service providers, and equipment manufacturers alike. This comprehensive approach gives us a wide perspective on how regulatory decisions in one segment of the sector can impact other areas, allowing us to offer well-rounded guidance.
- **approach.points:**
  - Advisory experience across licensing, infrastructure, and spectrum
  - Clients spanning operators, manufacturers, and service providers
  - Coordination with our Data Privacy practice on telecoms-related compliance
  - Direct experience with NCC regulatory processes
- **industries:** Financial Services & Fintech, Technology & Telecommunications, Media & Broadcasting, Infrastructure & Construction

## Practice Areas page

**csrBanner:**

- title: "Pro Bono & Community Commitment"
- text: "Beyond advising clients, we take an active role in strengthening the legal environment and supporting the communities we work in."
- images: 3 placeholders
- cta: "Learn About Our CSR" → `/responsible-business`

## Responsible Business page

- **title:** "RESPONSIBLE BUSINESS"
- **images:** 3 placeholders
- **backLink:** "Back to Practice Areas" → `/practice-areas`

## People

- **Role rename:** `nysc_associate` → `trainee_associate`. Tab label: "Trainee Associates".
- **Babatunde Ajibade:**
  - primaryPracticeArea: Dispute Resolution & Arbitration
  - practiceAreas: Dispute Resolution & Arbitration, Corporate Finance & Capital Markets
  - cardBio: "A well-regarded authority in international arbitration, bringing decades of experience to the firm's most complex disputes."
  - bio:
    1. Dr. Ajibade is a well-regarded authority in International Civil Litigation and Arbitration. His expertise spans both domestic and international arbitration, including investment treaty arbitration, and he has built a career representing clients in some of the region's most complex disputes.
    2. As an International Practice Fellow of the International Bar Association and a Fellow of the Chartered Institute of Arbitrators, United Kingdom, Dr. Ajibade brings decades of experience to bear on every matter he handles. Clients and peers alike describe him as thorough, calm under pressure, and an exceptional advocate.
  - education.intro: Dr. Ajibade holds a Doctor of Philosophy in Private International Law from King's College, University of London, along with a Master of Laws in Corporate Commercial Law from the same institution. He was called to the Nigerian Bar in 1989, after completing his legal education at Obafemi Awolowo University.
  - education.entries:
    - Ph.D. in Private International Law, King's College, University of London, 1996
    - LL.M., Corporate Commercial Law, King's College, University of London, 1990
    - Barrister at Law (BL), Nigerian Law School, 1989
    - LL.B., Obafemi Awolowo University (formerly University of Ife), Nigeria, 1988
  - memberships: Nigerian Bar Association (NBA); International Bar Association (IBA); Chartered Institute of Arbitrators (UK); Lagos Court of Arbitration (LCA); Capital Market Solicitors Association (CMSA); Chartered Institute of Taxation (CITN)
  - email, instagramUrl: `[PENDING FROM FIRM]`
- **Everyone else:** their `practiceAreas` include every area they lead (see the practice area leads above). Other bios, education, memberships and cardBios are `[PENDING FROM FIRM]`.

## Insights

- The categories are as in DESIGN_UPDATE_V2 §8.
- Article #1 ("Repositioning and Promoting Energy Investments…"):
  - author: John Onyido
  - body: "This brief centers specifically on the bilateral energy investment relationship between Nigeria and South Africa, two countries that stand out as the most logical and strategically significant partners in the African energy sector. By any objective commercial evaluation, their collaboration holds immense potential to shape the continent's energy landscape. Both nations possess complementary resources and capabilities that, when combined, could drive substantial growth and innovation in energy production, distribution, and sustainability. Exploring this partnership in depth reveals opportunities for mutual benefit, regional development, and enhanced energy security across Africa."
  - externalUrl: `[PENDING FROM FIRM]`
- The luncheon video's categories: `events`, `firm_news`.
- **Pro bono story:**
  - title: "SPA AJIBADE & Co. Sponsors Team Titans, an American Flag Football Team"
  - category: `pro_bono`; author: firm; format: video; videoUrl `[PENDING FROM FIRM]`; body `[PENDING FROM FIRM]` (the design uses lorem ipsum)
  - The detail design dates it 16 September 2025, while its cards say May 2026. Seed `2025-09-16` (the detail page owns the date) and log the conflict.
  - For the listing demo, repeat it with `-2`…`-12` slug suffixes, marked as demo data.

## Careers

**jobsSection.emptyState:**

- title: "No Open Roles at the Moment"
- body: `We're not actively hiring right now, but that doesn't mean we're not interested in hearing from strong candidates. If you'd like to be considered for future opportunities at the firm, send your CV to <a href="mailto:hr@spaajibade.com">hr@spaajibade.com</a> along with a short note on the kind of work you're looking to do. We review every submission and will reach out directly when a suitable role opens up.`
- ctaLabel: "Send your CV"

## Legal pages

- **terms:** title "Terms of Service", body `[PENDING FROM FIRM]`
- **privacy:** title "Privacy Policy", body `[PENDING FROM FIRM]`
