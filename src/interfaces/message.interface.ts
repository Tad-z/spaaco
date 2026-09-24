import type { Types } from 'mongoose';
import type { SubmissionStatus } from '../types/api.js';
import type { IConsent } from './enquiry.interface.js';

/** A "Message the firm" submission. Personal data throughout. */
export interface IMessage {
  reference: string;
  fullName: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  consent: IConsent;
  status: SubmissionStatus;
  assignedTo?: Types.ObjectId | null;
  ipHash: string;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
