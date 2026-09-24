import { describe, expect, it } from 'vitest';
import { logMailer } from '../../../src/integrations/mailer/log.driver.js';
import { captureLogs } from '../../support/logs.js';

/**
 * The mail driver that runs by default.
 *
 * Worth its own test because the integration tests all swap the mailer out, so
 * nothing else exercises it — and it shipped logging every submitter's email
 * address, which is the first thing `.claude/rules/submissions.md` forbids.
 */

describe('the log mailer', () => {
  it('records that mail was sent without recording who it went to', async () => {
    const logs = captureLogs();

    await logMailer.send({
      to: 'adaeze.nwosu@example.com',
      subject: 'We have received your mandate enquiry (ENQ-7F3K2A)',
      text: 'Dear Adaeze,\n\nThank you for your mandate enquiry.',
    });

    const written = logs.release();

    expect(written).not.toBe('');
    // The reference is in the subject, which is what a developer needs.
    expect(written).toContain('ENQ-7F3K2A');

    expect(written).not.toContain('adaeze.nwosu@example.com');
    expect(written).not.toContain('adaeze.nwosu');
    // The body quotes the submitter's first name.
    expect(written).not.toContain('Adaeze');
  });

  it('keeps enough to tell the firm copy from the submitter copy', async () => {
    const logs = captureLogs();

    await logMailer.send({
      to: 'frontoffice@spaajibade.com',
      subject: 'New mandate enquiry: ENQ-7F3K2A',
      text: 'A new mandate enquiry has been received.',
    });

    expect(logs.release()).toContain('spaajibade.com');
  });
});
