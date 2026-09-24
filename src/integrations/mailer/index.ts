import { config } from '../../config/env.js';
import { logMailer } from './log.driver.js';
import { createResendMailer } from './resend.driver.js';
import type { IMailer } from '../../interfaces/integrations/mailer.interface.js';

/**
 * Picks the mail driver from config. `config/env.ts` has already refused to
 * start with a driver whose credentials are missing.
 */
export function createMailer(): IMailer {
  if (config.MAILER_DRIVER === 'resend' && config.RESEND_API_KEY !== undefined) {
    return createResendMailer(config.RESEND_API_KEY, config.MAIL_FROM);
  }

  return logMailer;
}
