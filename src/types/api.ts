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
export type LinkKind = Schemas['LinkKind'];
export type Link = Schemas['Link'];
export type NullableLink = Schemas['NullableLink'];
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
export type RecognitionTab = Schemas['RecognitionTab'];
export type PageKey = Schemas['PageKey'];

// --- practice areas ---
export type PracticeAreaRef = Schemas['PracticeAreaRef'];
export type PracticeAreaCard = Schemas['PracticeAreaCard'];
export type PracticeAreaDetail = Schemas['PracticeAreaDetail'];

// --- people ---
export type PersonSummary = Schemas['PersonSummary'];
export type PersonDetail = Schemas['PersonDetail'];

// --- insights ---
export type InsightAuthor = Schemas['InsightAuthor'];
export type InsightAuthorPerson = Schemas['InsightAuthorPerson'];
export type InsightAuthorFirm = Schemas['InsightAuthorFirm'];
export type InsightCta = Schemas['InsightCta'];
export type InsightCard = Schemas['InsightCard'];
export type InsightDetail = Schemas['InsightDetail'];

// --- offices, recognitions, faqs, jobs ---
export type OfficeRef = Schemas['OfficeRef'];
export type Office = Schemas['Office'];
export type Recognition = Schemas['Recognition'];
export type Faq = Schemas['Faq'];
export type Job = Schemas['Job'];

// --- site shell ---
export type Socials = Schemas['Socials'];
export type SiteSettings = Schemas['SiteSettings'];
export type NavItem = Schemas['NavItem'];
export type SiteFooter = Schemas['SiteFooter'];
export type StillHaveQuestions = Schemas['StillHaveQuestions'];
export type SiteFaqSection = Schemas['SiteFaqSection'];
export type ContactCallout = Schemas['ContactCallout'];
export type Site = Schemas['Site'];

// --- search ---
export type SearchResults = Schemas['SearchResults'];

// --- page sections ---
export type HomeAboutFirm = Schemas['HomeAboutFirm'];
export type HomeVideoShowcase = Schemas['HomeVideoShowcase'];
export type HomeRecognitionTabs = Schemas['HomeRecognitionTabs'];
export type HomeRecognitions = Schemas['HomeRecognitions'];
export type HomeWhyChooseUs = Schemas['HomeWhyChooseUs'];
export type AboutStory = Schemas['AboutStory'];
export type AboutStats = Schemas['AboutStats'];
export type AboutMissionSection = Schemas['AboutMissionSection'];
export type AboutPrinciples = Schemas['AboutPrinciples'];
export type AwardListItem = Schemas['AwardListItem'];
export type AboutAwardsList = Schemas['AboutAwardsList'];
export type CsrBanner = Schemas['CsrBanner'];

// --- composed pages ---
export type HomePage = Schemas['HomePage'];
export type AboutPage = Schemas['AboutPage'];
export type PracticeAreasPage = Schemas['PracticeAreasPage'];
export type PeoplePage = Schemas['PeoplePage'];
export type InsightsPage = Schemas['InsightsPage'];
export type CareersPage = Schemas['CareersPage'];
export type FaqPage = Schemas['FaqPage'];
export type OfficesPage = Schemas['OfficesPage'];
export type Page = Schemas['Page'];

// --- forms ---
export type SubmissionReceipt = Schemas['SubmissionReceipt'];
export type EnquiryRequest = Schemas['EnquiryRequest'];
export type MessageRequest = Schemas['MessageRequest'];
export type ApplicationRequest = Schemas['ApplicationRequest'];

// --- admin auth and users (Phase 4) ---
export type UserRole = Schemas['UserRole'];
export type AdminUser = Schemas['AdminUser'];
export type LoginRequest = Schemas['LoginRequest'];
export type LoginResult = Schemas['LoginResult'];
export type TotpSetup = Schemas['TotpSetup'];
export type TotpEnableRequest = Schemas['TotpEnableRequest'];
export type PasswordChangeRequest = Schemas['PasswordChangeRequest'];
export type CreateUserRequest = Schemas['CreateUserRequest'];
export type UpdateUserRequest = Schemas['UpdateUserRequest'];
export type AuditActor = Schemas['AuditActor'];
export type AuditLogEntry = Schemas['AuditLogEntry'];

// --- admin content, singletons and media (Phase 5) ---
export type AdminCollection = Schemas['AdminCollection'];
export type Expanded = Schemas['Expanded'];
export type ExpandedMedia = Schemas['ExpandedMedia'];
export type ExpandedPerson = Schemas['ExpandedPerson'];
export type SeoWrite = Schemas['SeoWrite'];
export type GeoPoint = Schemas['GeoPoint'];
export type PracticeAreaAdmin = Schemas['PracticeAreaAdmin'];
export type PersonAdmin = Schemas['PersonAdmin'];
export type InsightAdmin = Schemas['InsightAdmin'];
export type OfficeAdmin = Schemas['OfficeAdmin'];
export type RecognitionAdmin = Schemas['RecognitionAdmin'];
export type FaqAdmin = Schemas['FaqAdmin'];
export type JobAdmin = Schemas['JobAdmin'];
export type AdminContentItem = Schemas['AdminContentItem'];
export type ReorderRequest = Schemas['ReorderRequest'];
export type SettingsAdmin = Schemas['SettingsAdmin'];
export type SettingsWrite = Schemas['SettingsWrite'];
export type PageAdmin = Schemas['PageAdmin'];
export type MediaAdmin = Schemas['MediaAdmin'];
export type MediaUsage = Schemas['MediaUsage'];
export type MediaPatch = Schemas['MediaPatch'];
