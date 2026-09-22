import type { Types } from 'mongoose';
import type { IContentFields, ISeoBasic } from './common.interface.js';

/** An area of practice. The single source the nav, footer, Home tabs and grid all read. */
export interface IPracticeArea extends IContentFields {
  title: string;
  /** Compact label for the Home tab bar, e.g. "Dispute Resolution". */
  shortLabel: string;
  summary: string;
  image?: Types.ObjectId | null;
  /** Sanitised HTML. Null until the firm supplies detail-page copy. */
  body?: string | null;
  keyServices: string[];
  contacts: Types.ObjectId[];
  featuredOnHome: boolean;
  /**
   * Position in the Home tab bar, which differs from the Practice Areas page
   * order (ADR-025). Null when the area is not featured on Home.
   */
  homeOrder?: number | null;
  showInFooter: boolean;
  seo: ISeoBasic;
}
