/**
 * Readable aliases over the generated OpenAPI types.
 *
 * `openapi/openapi.yaml` is the contract; `api.generated.ts` is derived from it and must
 * never be edited by hand. Serializers declare these aliases as their return types, so a
 * serializer that drifts from the spec fails `npm run typecheck` rather than shipping a
 * broken payload to the frontend.
 *
 * Regenerate the underlying types with `npm run types:gen` after any spec change.
 */
import type { components } from './api.generated.js';

export type Schemas = components['schemas'];

// --- primitives and envelopes ---
export type ObjectId = Schemas['ObjectId'];
export type Slug = Schemas['Slug'];
export type Health = Schemas['Health'];
export type ErrorCode = Schemas['ErrorCode'];
export type ErrorDetail = Schemas['ErrorDetail'];
export type ErrorResponse = Schemas['ErrorResponse'];
export type PaginationMeta = Schemas['PaginationMeta'];

// --- shared content shapes ---
export type ImageSizes = Schemas['ImageSizes'];
export type Image = Schemas['Image'];
export type NullableImage = Schemas['NullableImage'];
export type Document = Schemas['Document'];
export type NullableDocument = Schemas['NullableDocument'];
export type LinkKind = Schemas['LinkKind'];
export type Link = Schemas['Link'];
export type NullableLink = Schemas['NullableLink'];
export type PendingLink = Schemas['PendingLink'];
export type SectionHeader = Schemas['SectionHeader'];
export type IconItem = Schemas['IconItem'];
export type Stat = Schemas['Stat'];
export type Seo = Schemas['Seo'];
export type Hero = Schemas['Hero'];
export type FilterOption = Schemas['FilterOption'];
export type TitledBody = Schemas['TitledBody'];
export type Coordinates = Schemas['Coordinates'];

// --- enums ---
export type PersonRole = Schemas['PersonRole'];
export type InsightCategory = Schemas['InsightCategory'];
export type InsightFormat = Schemas['InsightFormat'];
export type EmploymentType = Schemas['EmploymentType'];
export type WorkMode = Schemas['WorkMode'];
export type PageKey = Schemas['PageKey'];
export type LegalPageKey = Schemas['LegalPageKey'];
export type MediaKind = Schemas['MediaKind'];

// --- practice areas ---
export type PracticeAreaRef = Schemas['PracticeAreaRef'];
export type PracticeAreaLink = Schemas['PracticeAreaLink'];
export type PracticeAreaCard = Schemas['PracticeAreaCard'];
export type PracticeAreaDetail = Schemas['PracticeAreaDetail'];
export type PracticeAreaLead = Schemas['PracticeAreaLead'];
export type IndustryRef = Schemas['IndustryRef'];
export type CoreService = Schemas['CoreService'];
export type PracticeAreaApproach = Schemas['PracticeAreaApproach'];

// --- people ---
export type PersonSummary = Schemas['PersonSummary'];
export type PersonDetail = Schemas['PersonDetail'];
export type PersonEducation = Schemas['PersonEducation'];

// --- insights ---
export type InsightAuthor = Schemas['InsightAuthor'];
export type InsightAuthorPerson = Schemas['InsightAuthorPerson'];
export type InsightAuthorFirm = Schemas['InsightAuthorFirm'];
export type InsightAuthorWriter = Schemas['InsightAuthorWriter'];
export type InsightCta = Schemas['InsightCta'];
export type InsightCard = Schemas['InsightCard'];
export type InsightDetail = Schemas['InsightDetail'];
export type InsightDetailCta = Schemas['InsightDetailCta'];

// --- offices, recognition, faqs, jobs, legal pages ---
export type OfficeRef = Schemas['OfficeRef'];
export type Office = Schemas['Office'];
export type RecognitionDirectoryLink = Schemas['RecognitionDirectoryLink'];
export type RecognitionDirectoryRef = Schemas['RecognitionDirectoryRef'];
export type Award = Schemas['Award'];
export type RecognitionsOverview = Schemas['RecognitionsOverview'];
export type RecognitionDirectoryPage = Schemas['RecognitionDirectoryPage'];
export type LegalPage = Schemas['LegalPage'];
export type Faq = Schemas['Faq'];
export type Job = Schemas['Job'];

// --- site shell ---
export type Socials = Schemas['Socials'];
export type SiteSettings = Schemas['SiteSettings'];
export type NavItem = Schemas['NavItem'];
export type SiteFooter = Schemas['SiteFooter'];
export type FooterOffice = Schemas['FooterOffice'];
export type SiteNewsletter = Schemas['SiteNewsletter'];
export type StillHaveQuestions = Schemas['StillHaveQuestions'];
export type SiteFaqSection = Schemas['SiteFaqSection'];
export type ContactCallout = Schemas['ContactCallout'];
export type Site = Schemas['Site'];

// --- search ---
export type SearchResults = Schemas['SearchResults'];

// --- page sections ---
export type HomeAboutFirm = Schemas['HomeAboutFirm'];
export type HomeVideoShowcase = Schemas['HomeVideoShowcase'];
export type HomeRecognitionSection = Schemas['HomeRecognitionSection'];
export type HomeWhyChooseUs = Schemas['HomeWhyChooseUs'];
export type AboutStory = Schemas['AboutStory'];
export type AboutProfileDownload = Schemas['AboutProfileDownload'];
export type AboutStats = Schemas['AboutStats'];
export type AboutMissionSection = Schemas['AboutMissionSection'];
export type AboutPrinciples = Schemas['AboutPrinciples'];
export type AboutAwardsList = Schemas['AboutAwardsList'];
export type CsrBanner = Schemas['CsrBanner'];
export type CareersJobsSection = Schemas['CareersJobsSection'];
export type CareersEmptyState = Schemas['CareersEmptyState'];
export type RecognitionDirectoryLabels = Schemas['RecognitionDirectoryLabels'];

// --- composed pages ---
export type HomePage = Schemas['HomePage'];
export type AboutPage = Schemas['AboutPage'];
export type PracticeAreasPage = Schemas['PracticeAreasPage'];
export type PeoplePage = Schemas['PeoplePage'];
export type InsightsPage = Schemas['InsightsPage'];
export type CareersPage = Schemas['CareersPage'];
export type FaqPage = Schemas['FaqPage'];
export type OfficesPage = Schemas['OfficesPage'];
export type RecognitionPage = Schemas['RecognitionPage'];
export type ResponsibleBusinessPage = Schemas['ResponsibleBusinessPage'];
export type Page = Schemas['Page'];

// --- forms ---
export type SubmissionReceipt = Schemas['SubmissionReceipt'];
export type EnquiryRequest = Schemas['EnquiryRequest'];
export type MessageRequest = Schemas['MessageRequest'];
export type ApplicationRequest = Schemas['ApplicationRequest'];

// --- newsletter (ADR-065) ---
export type NewsletterSubscriptionStatus = Schemas['NewsletterSubscriptionStatus'];
export type NewsletterSubscribeRequest = Schemas['NewsletterSubscribeRequest'];
export type NewsletterSubscribeReceipt = Schemas['NewsletterSubscribeReceipt'];
export type NewsletterTokenRequest = Schemas['NewsletterTokenRequest'];
export type NewsletterTokenResult = Schemas['NewsletterTokenResult'];
export type NewsletterSubscriberAdmin = Schemas['NewsletterSubscriberAdmin'];

// --- admin auth and users (Phase 4) ---
export type UserRole = Schemas['UserRole'];
export type AdminUser = Schemas['AdminUser'];
export type LoginRequest = Schemas['LoginRequest'];
export type LoginResult = Schemas['LoginResult'];
export type ProfileUpdateRequest = Schemas['ProfileUpdateRequest'];
export type PasswordChangeRequest = Schemas['PasswordChangeRequest'];
export type CreateUserRequest = Schemas['CreateUserRequest'];
export type UpdateUserRequest = Schemas['UpdateUserRequest'];
export type AuditActor = Schemas['AuditActor'];
export type AuditLogEntry = Schemas['AuditLogEntry'];

// --- admin content, singletons and media (Phase 5) ---
export type Expanded = Schemas['Expanded'];
export type ExpandedMedia = Schemas['ExpandedMedia'];
export type ExpandedPerson = Schemas['ExpandedPerson'];
export type SeoWrite = Schemas['SeoWrite'];
export type LegacyImport = Schemas['LegacyImport'];
export type LegacySource = LegacyImport['source'];
export type GeoPoint = Schemas['GeoPoint'];
export type PracticeAreaAdmin = Schemas['PracticeAreaAdmin'];
export type PracticeAreaCreate = Schemas['PracticeAreaCreate'];
export type PracticeAreaUpdate = Schemas['PracticeAreaUpdate'];
export type PersonAdmin = Schemas['PersonAdmin'];
export type InsightAdmin = Schemas['InsightAdmin'];
export type OfficeAdmin = Schemas['OfficeAdmin'];
export type RecognitionDirectoryAdmin = Schemas['RecognitionDirectoryAdmin'];
export type AwardAdmin = Schemas['AwardAdmin'];
export type IndustryAdmin = Schemas['IndustryAdmin'];
export type FaqAdmin = Schemas['FaqAdmin'];
export type JobAdmin = Schemas['JobAdmin'];
export type ReorderRequest = Schemas['ReorderRequest'];
export type SettingsAdmin = Schemas['SettingsAdmin'];
export type SettingsWrite = Schemas['SettingsWrite'];
export type PageAdmin = Schemas['PageAdmin'];
export type MediaAdmin = Schemas['MediaAdmin'];
export type MediaUsage = Schemas['MediaUsage'];
export type MediaPatch = Schemas['MediaPatch'];
export type LegalPageAdmin = Schemas['LegalPageAdmin'];
export type LegalPageWrite = Schemas['LegalPageWrite'];

// Submissions (personal data; see .claude/rules/submissions.md).
export type SubmissionStatus = Schemas['SubmissionStatus'];
export type ApplicationStatus = Schemas['ApplicationStatus'];
export type ScanStatus = Schemas['ScanStatus'];
export type SubmissionConsent = Schemas['SubmissionConsent'];
export type EnquiryAdmin = Schemas['EnquiryAdmin'];
export type MessageAdmin = Schemas['MessageAdmin'];
export type ApplicationAdmin = Schemas['ApplicationAdmin'];
export type ApplicationCv = Schemas['ApplicationCv'];
export type SignedFileUrl = Schemas['SignedFileUrl'];
export type JobRef = Schemas['JobRef'];
