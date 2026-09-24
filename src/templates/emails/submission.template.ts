import { config } from '../../config/env.js';
import type { SentMail } from '../../interfaces/integrations/mailer.interface.js';

/**
 * The two emails a submission produces.
 *
 * The rule that shapes both is in `.claude/rules/submissions.md`: the firm's
 * notification carries the reference, the form type and a link, and nothing
 * else. Inboxes are forwarded, synced to phones and searched by staff who were
 * never meant to see a particular matter, so the details stay behind the
 * dashboard login where access is controlled and logged.
 *
 * The acknowledgement goes to the person who wrote it, so their own first name
 * is theirs to receive — but it still quotes the reference rather than
 * restating what they sent.
 */

export type SubmissionKind = 'enquiry' | 'message' | 'application';

const LABELS: Record<SubmissionKind, string> = {
  enquiry: 'mandate enquiry',
  message: 'message',
  application: 'job application',
};

/** Where in the dashboard the record lives. */
const SECTIONS: Record<SubmissionKind, string> = {
  enquiry: 'enquiries',
  message: 'messages',
  application: 'applications',
};

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The firm's copy: a reference and a link, never the submitter's words. */
export function notificationEmail(kind: SubmissionKind, reference: string): Omit<SentMail, 'to'> {
  const label = LABELS[kind];
  const link = `${config.ADMIN_DASHBOARD_URL.replace(/\/$/, '')}/${SECTIONS[kind]}`;

  const text = [
    `A new ${label} has been received.`,
    '',
    `Reference: ${reference}`,
    '',
    `Open the dashboard to read it: ${link}`,
    '',
    'The details are deliberately not included in this email.',
  ].join('\n');

  return {
    subject: `New ${label}: ${reference}`,
    text,
    html:
      `<p>A new ${escapeHtml(label)} has been received.</p>` +
      `<p><strong>Reference:</strong> ${escapeHtml(reference)}</p>` +
      `<p><a href="${escapeHtml(link)}">Open the dashboard to read it</a></p>` +
      `<p>The details are deliberately not included in this email.</p>`,
  };
}

/** The submitter's copy: confirmation, their reference, and no restatement. */
export function acknowledgementEmail(
  kind: SubmissionKind,
  reference: string,
  firstName: string,
  firmName: string
): Omit<SentMail, 'to'> {
  const label = LABELS[kind];

  const text = [
    `Dear ${firstName},`,
    '',
    `Thank you for your ${label}. We have received it and a member of the firm will be in touch.`,
    '',
    `Your reference is ${reference}. Please quote it in any correspondence.`,
    '',
    'Kind regards,',
    firmName,
  ].join('\n');

  return {
    subject: `We have received your ${label} (${reference})`,
    text,
    html:
      `<p>Dear ${escapeHtml(firstName)},</p>` +
      `<p>Thank you for your ${escapeHtml(label)}. We have received it and a member of the firm ` +
      `will be in touch.</p>` +
      `<p>Your reference is <strong>${escapeHtml(reference)}</strong>. Please quote it in any ` +
      `correspondence.</p>` +
      `<p>Kind regards,<br />${escapeHtml(firmName)}</p>`,
  };
}
