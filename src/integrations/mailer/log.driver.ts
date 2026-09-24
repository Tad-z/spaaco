import { logger } from '../../core/logger.js';
import type { IMailer, SentMail } from '../../interfaces/integrations/mailer.interface.js';

/**
 * The credential-free default: mail goes to the log.
 *
 * Neither the recipient nor the body is logged. An acknowledgement goes to the
 * person who submitted the form, so its address *is* personal data — logging
 * it would break the first rule in `.claude/rules/submissions.md` in the one
 * driver that runs by default. The subject already carries the reference,
 * which is what a developer needs to see that mail is flowing.
 */
export const logMailer: IMailer = {
  name: 'log',

  send(mail: SentMail): Promise<void> {
    logger.info(
      { subject: mail.subject, recipientDomain: domainOf(mail.to), bytes: mail.text.length },
      'email sent (log driver)'
    );

    return Promise.resolve();
  },
};

/** Enough to tell the firm's own notifications from a submitter's copy. */
const domainOf = (address: string): string => address.split('@').pop() ?? 'unknown';
