import type { SentMail } from '../../interfaces/integrations/mailer.interface.js';

/**
 * The three emails the newsletter list sends (ADR-065).
 *
 * The subscriber's own address is the only personal data involved, and none
 * of these repeats it: the recipient knows who they are. Every one carries the
 * unsubscribe link except the confirmation, which goes to an address that is
 * not on the list yet — ignoring it is how one declines.
 */

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const link = (href: string, label: string): string =>
  `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;

export function confirmationEmail(confirmUrl: string, firmName: string): Omit<SentMail, 'to'> {
  return {
    subject: `Confirm your subscription to ${firmName} legal insights`,
    text: [
      `Please confirm that you would like to receive legal insights from ${firmName}:`,
      '',
      confirmUrl,
      '',
      'The link works for 7 days. If you did not ask to subscribe, ignore this email and you',
      'will not hear from us again.',
      '',
      firmName,
    ].join('\n'),
    html:
      `<p>Please confirm that you would like to receive legal insights from ` +
      `${escapeHtml(firmName)}.</p>` +
      `<p>${link(confirmUrl, 'Confirm my subscription')}</p>` +
      `<p>The link works for 7 days. If you did not ask to subscribe, ignore this email and you ` +
      `will not hear from us again.</p>` +
      `<p>${escapeHtml(firmName)}</p>`,
  };
}

export function welcomeEmail(unsubscribeUrl: string, firmName: string): Omit<SentMail, 'to'> {
  return {
    subject: `You are subscribed to ${firmName} legal insights`,
    text: [
      `Thank you for confirming. You will now receive legal insights from ${firmName}.`,
      '',
      `To unsubscribe at any time: ${unsubscribeUrl}`,
      '',
      firmName,
    ].join('\n'),
    html:
      `<p>Thank you for confirming. You will now receive legal insights from ` +
      `${escapeHtml(firmName)}.</p>` +
      `<p>${link(unsubscribeUrl, 'Unsubscribe')} at any time.</p>` +
      `<p>${escapeHtml(firmName)}</p>`,
  };
}

/** Sent instead of a confirmation when the address is already on the list. */
export function alreadySubscribedEmail(
  unsubscribeUrl: string,
  firmName: string
): Omit<SentMail, 'to'> {
  return {
    subject: `You are already subscribed to ${firmName} legal insights`,
    text: [
      `Somebody, probably you, asked to subscribe this address to legal insights from ${firmName}.`,
      'It is already subscribed, so nothing has changed.',
      '',
      `To unsubscribe: ${unsubscribeUrl}`,
      '',
      firmName,
    ].join('\n'),
    html:
      `<p>Somebody, probably you, asked to subscribe this address to legal insights from ` +
      `${escapeHtml(firmName)}. It is already subscribed, so nothing has changed.</p>` +
      `<p>${link(unsubscribeUrl, 'Unsubscribe')}</p>` +
      `<p>${escapeHtml(firmName)}</p>`,
  };
}
