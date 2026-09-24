/**
 * Registers every model with Mongoose.
 *
 * The one exception to "no barrel files": `scripts/sync-indexes.ts` and the
 * media-reference guard both need to enumerate models, and a `ref: 'Media'`
 * only resolves once the target model has been registered. Importing this once
 * at startup makes registration order explicit rather than incidental.
 */
export { Media } from './media.model.js';
export { PracticeArea } from './practice-area.model.js';
export { Person } from './person.model.js';
export { Office } from './office.model.js';
export { Insight } from './insight.model.js';
export { Recognition } from './recognition.model.js';
export { Faq } from './faq.model.js';
export { Job } from './job.model.js';
export { Page } from './page.model.js';
export { Settings } from './settings.model.js';
export { User } from './user.model.js';
export { RefreshToken } from './refresh-token.model.js';
export { AuditLog } from './audit-log.model.js';
export { Enquiry } from './enquiry.model.js';
export { Message } from './message.model.js';
export { Application } from './application.model.js';
