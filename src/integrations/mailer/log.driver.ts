import { logger } from '../../core/logger.js';
import type { IMailer, SentMail } from '../../interfaces/integrations/mailer.interface.js';

/**
 * The credential-free default: mail goes to the log.
 *
 * Only the subject and recipient are logged. The body of an acknowledgement
 * quotes the submitter's first name, and logging that would defeat the
 * redaction everywhere else — so in development the body is counted, not
 * printed.
 */
export const logMailer: IMailer = {
  name: 'log',

  send(mail: SentMail): Promise<void> {
    logger.info(
      { to: mail.to, subject: mail.subject, bytes: mail.text.length },
      'email sent (log driver)'
    );

    return Promise.resolve();
  },
};
