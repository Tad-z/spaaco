import { describe, expect, it } from 'vitest';
import { link, safeUrl } from '../../../src/validators/common.validator.js';

/**
 * What an editor may put in a link.
 *
 * These fields skip the HTML sanitiser entirely — they are stored as data and
 * rendered straight into an `href` — so this schema is the only thing between
 * an editor's account and stored XSS on every page of the firm's site.
 */

const external = (href: string): { success: boolean } =>
  link.safeParse({ label: 'Read more', href, kind: 'external' });

describe('an external link', () => {
  it.each([
    'https://spaajibade.com',
    'http://example.com/a?b=c',
    'mailto:a@b.com',
    'tel:+2348030000000',
  ])('accepts %s', (href) => {
    expect(external(href).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ])('refuses %s', (href) => {
    expect(external(href).success).toBe(false);
  });

  it('refuses a protocol-relative URL, which looks like a path and is not', () => {
    // `//evil.example` follows whatever scheme the page was served over, to a
    // host the editor chose.
    expect(external('//evil.example/x').success).toBe(false);
  });
});

describe('an internal link', () => {
  it('accepts a path on the site', () => {
    expect(
      link.safeParse({ label: 'Tax', href: '/practice-areas/tax', kind: 'internal' }).success
    ).toBe(true);
  });

  it('refuses a scheme dressed up as internal', () => {
    expect(
      link.safeParse({ label: 'x', href: 'javascript:alert(1)', kind: 'internal' }).success
    ).toBe(false);
  });

  it('refuses an absolute URL, which is what `external` is for', () => {
    expect(
      link.safeParse({ label: 'x', href: 'https://elsewhere.example', kind: 'internal' }).success
    ).toBe(false);
  });
});

describe('an action link', () => {
  it('accepts the frontend tokens the designs use', () => {
    for (const href of ['action:mandate', 'action:message', 'action:chat', 'action:call']) {
      expect(link.safeParse({ label: 'Talk to us', href, kind: 'action' }).success).toBe(true);
    }
  });

  it('refuses anything that is not one', () => {
    // The kind must not become a way to smuggle a scheme past the check.
    for (const href of [
      'javascript:alert(1)',
      'action:',
      'https://example.com',
      'action:Mandate!',
    ]) {
      expect(link.safeParse({ label: 'x', href, kind: 'action' }).success, href).toBe(false);
    }
  });
});

describe('safeUrl, used by the standalone URL fields', () => {
  it('accepts the schemes a browser can follow safely', () => {
    for (const value of ['https://linkedin.com/in/x', 'http://x.test', 'mailto:a@b.com']) {
      expect(safeUrl.safeParse(value).success).toBe(true);
    }
  });

  it('refuses javascript: and data:', () => {
    expect(safeUrl.safeParse('javascript:alert(1)').success).toBe(false);
    expect(safeUrl.safeParse('data:text/html,<script>').success).toBe(false);
  });
});
