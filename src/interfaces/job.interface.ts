import type { Types } from 'mongoose';
import type { IContentFields } from './common.interface.js';
import type { EmploymentType, WorkMode } from '../types/api.js';

/** An open vacancy. */
export interface IJob extends IContentFields {
  title: string;
  practiceArea?: Types.ObjectId | null;
  /** Sanitised HTML. */
  description: string;
  experience?: string | null;
  employmentType: EmploymentType;
  workMode: WorkMode;
  office?: Types.ObjectId | null;
  /** Hidden from the public API once this date passes. */
  closingDate?: Date | null;
  isOpen: boolean;
}
