/**
 * Outbound email.
 *
 * Every driver takes the same rendered message, so the templates decide what
 * is said and the driver only decides how it travels. `.claude/rules/
 * submissions.md` governs the content: a notification to the firm carries the
 * reference and a dashboard link, never the submitter's details.
 */

export interface SentMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  /** Overrides `MAIL_FROM`; used only where a different sender is meaningful. */
  readonly from?: string;
  /** Where a human reply should go, when it is not the sending address. */
  readonly replyTo?: string;
}

export interface IMailer {
  readonly name: string;
  send(mail: SentMail): Promise<void>;
}
