import type { IContentFields } from './common.interface.js';

/** An industry from the shared list practice areas pick from (ADR-048). */
export interface IIndustry extends IContentFields {
  name: string;
}
