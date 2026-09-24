import { InternalError } from '../../core/errors.js';
import type { IMailer, SentMail } from '../../interfaces/integrations/mailer.interface.js';

/**
 * Resend, over its REST API.
 *
 * One POST with a bearer key, so an SDK would add a dependency and nothing
 * else. Failures throw; the caller decides whether that matters, and for a
 * form submission it does not (the record is already saved).
 */
export function createResendMailer(
  apiKey: string,
  defaultFrom: string,
  fetchImpl: typeof fetch = fetch
): IMailer {
  return {
    name: 'resend',

    async send(mail: SentMail): Promise<void> {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: mail.from ?? defaultFrom,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
          ...(mail.html === undefined ? {} : { html: mail.html }),
          ...(mail.replyTo === undefined ? {} : { reply_to: mail.replyTo }),
        }),
      });

      if (!response.ok) {
        // The status only; the body can quote the recipient address.
        throw new InternalError(`Resend rejected the message (${String(response.status)})`);
      }
    },
  };
}
