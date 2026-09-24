import { createMailer } from '../integrations/mailer/index.js';
import { logger } from '../core/logger.js';
import type { IMailer, SentMail } from '../interfaces/integrations/mailer.interface.js';

/**
 * Outbound mail, behind a setter so tests can swap it.
 *
 * Every send here is best effort. A submission is already stored by the time
 * mail is attempted, and losing an enquiry because a mail provider is down
 * would be far worse than losing the notification about it — so failures are
 * logged and swallowed, exactly like the audit trail.
 */
let mailer: IMailer | undefined;

export function setMailer(next: IMailer | undefined): void {
  mailer = next;
}

export async function sendMail(mail: SentMail): Promise<void> {
  mailer ??= createMailer();

  try {
    await mailer.send(mail);
  } catch (error: unknown) {
    // Never the recipient: an address in a log is the disclosure this whole
    // module exists to avoid.
    logger.error({ err: error, subject: mail.subject }, 'failed to send an email');
  }
}
