import type { Types } from 'mongoose';
import type { ApplicationStatus, ScanStatus } from '../types/api.js';
import type { IConsent } from './enquiry.interface.js';

/**
 * The stored CV.
 *
 * `storageKey` is the only way to reach the file and never leaves the API: the
 * admin shape omits it, and reads go through a signed link instead.
 */
export interface IApplicationCv {
  storageKey: string;
  originalName: string;
  mimeType: string;
  bytes: number;
  scanStatus: ScanStatus;
}

/** A job application. The most sensitive record this API holds. */
export interface IApplication {
  reference: string;
  job?: Types.ObjectId | null;
  fullName: string;
  email: string;
  phone?: string | null;
  coverNote?: string | null;
  cv: IApplicationCv;
  consent: IConsent;
  status: ApplicationStatus;
  ipHash: string;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
