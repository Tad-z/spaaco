import type { Types } from 'mongoose';
import type { IContentFields, ISeoBasic } from './common.interface.js';

/** One of the Core Services cards on a practice area's detail page. */
export interface ICoreService {
  title: string;
  description: string;
}

/** "Our Approach": a paragraph and a short list of points. */
export interface IPracticeAreaApproach {
  text: string;
  points: string[];
}

/** An area of practice. The single source the nav, footer, Home tabs and grid all read. */
export interface IPracticeArea extends IContentFields {
  title: string;
  /** Compact label for the Home tab bar, e.g. "Dispute Resolution". */
  shortLabel: string;
  /**
   * Three texts, because the designs show three (ADR-047): the Practice Areas
   * grid card, the Home carousel card, and the detail page's hero.
   */
  summary: string;
  homeSummary: string;
  heroIntro: string;
  image?: Types.ObjectId | null;
  heroImages: Types.ObjectId[];
  /** Plain text: the detail page's first paragraph. */
  overview?: string | null;
  coreServices: ICoreService[];
  approach?: IPracticeAreaApproach | null;
  industries: Types.ObjectId[];
  /** The attorney on the "Practice Lead" card. */
  lead?: Types.ObjectId | null;
  featuredOnHome: boolean;
  /**
   * Position in the Home tab bar, which differs from the Practice Areas page
   * order (ADR-025). Null when the area is not featured on Home.
   */
  homeOrder?: number | null;
  showInFooter: boolean;
  seo: ISeoBasic;
}
