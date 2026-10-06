import { describe, expect, it } from 'vitest';
import { unserializeStrings } from '../../../scripts/import-wordpress/php.js';
import {
  cutAtWord,
  decode,
  fixShouting,
  lagosToIso,
} from '../../../scripts/import-wordpress/text.js';
import { roleFor, practiceAreaSlugFor } from '../../../scripts/import-wordpress/maps.js';
import {
  educationFrom,
  isEmpty,
  linkedinFrom,
  membershipsFrom,
  reviewStatus,
  splitName,
} from '../../../scripts/import-wordpress/people.js';
import {
  autop,
  findUploadPaths,
  finishHtml,
  isPdfWrapper,
  prepareHtml,
} from '../../../scripts/import-wordpress/html.js';
import {
  backendSlug,
  categoryTargets,
  classify,
} from '../../../scripts/import-wordpress/insights.js';
import { articleSource } from '../../../scripts/import-wordpress/redirects.js';
import { parseCsv } from '../../../scripts/import-wordpress/load.js';
import type { PersonRow } from '../../../scripts/import-wordpress/load.js';

/**
 * The WordPress import's pure transforms (scripts/import-wordpress). The API
 * calls they feed are the admin endpoints, covered by their own tests.
 */

describe('PHP unserialize', () => {
  it('reads string arrays, counting lengths in bytes', () => {
    expect(unserializeStrings('a:2:{i:0;s:18:"Dispute Resolution";i:1;s:7:"Café &";}')).toEqual([
      'Dispute Resolution',
      'Café &',
    ]);
  });

  it('falls back to the quoted values when a length is wrong, and rejects non-arrays', () => {
    expect(unserializeStrings('a:1:{i:0;s:99:"Taxation";}')).toEqual(['Taxation']);
    expect(unserializeStrings('Taxation')).toBeNull();
  });
});

describe('text', () => {
  it('decodes entities and collapses whitespace', () => {
    expect(decode('News &amp;&nbsp; Events &#8217;24 ')).toBe('News & Events ’24');
  });

  it('cuts at a word boundary with an ellipsis', () => {
    expect(cutAtWord('The quick brown fox jumps', 16)).toBe('The quick brown…');
    expect(cutAtWord('Short', 16)).toBe('Short');
  });

  it('title-cases a name typed in capitals, and leaves mixed case alone', () => {
    expect(fixShouting('MORUF A. SOWUNMI')).toBe('Moruf A. Sowunmi');
    expect(fixShouting('Olanrewaju-Kadri')).toBe('Olanrewaju-Kadri');
  });

  it('gives a WordPress local time the Lagos offset', () => {
    expect(lagosToIso('2023-05-12 09:00:00')).toBe('2023-05-12T09:00:00+01:00');
    expect(() => lagosToIso('12/05/2023')).toThrow();
  });
});

describe('people', () => {
  it('splits honorific, post-nominals and names', () => {
    expect(splitName('Dr. Babatunde Ajibade, SAN, FCIArb')).toEqual({
      honorific: 'Dr.',
      firstName: 'Babatunde',
      lastName: 'Ajibade',
      postNominals: 'SAN, FCIArb',
    });
    expect(splitName('Chief Simon P. Ajibade')).toMatchObject({
      honorific: 'Chief',
      firstName: 'Simon P.',
      lastName: 'Ajibade',
    });
    expect(splitName('Ajibade').note).toBeDefined();
  });

  it('maps positions to the ladder, most specific first, and refuses the rest', () => {
    expect(roleFor('Managing Partner')).toBe('managing_partner');
    expect(roleFor('Associate Partner')).toBe('associate_partner');
    expect(roleFor('Senior Associate')).toBe('senior_associate');
    expect(roleFor('NYSC Associate')).toBe('trainee_associate');
    expect(roleFor('Assocate')).toBe('associate');
    expect(roleFor('Consultant to the Firm')).toBeNull();
    expect(roleFor('Head of Chambers')).toBeNull();
  });

  it('maps old practice-area titles explicitly, telling ignored from unknown', () => {
    expect(practiceAreaSlugFor('Taxation')).toBe('tax');
    expect(
      practiceAreaSlugFor('Corporate Finance &amp; Capital Market'.replace('&amp;', '&'))
    ).toBe('corporate-finance-capital-markets');
    expect(practiceAreaSlugFor('Administration')).toBeNull();
    expect(practiceAreaSlugFor('Maritime')).toBeUndefined();
  });

  it('turns education lines into entries with a trailing year', () => {
    expect(
      educationFrom(
        '<ul><li>Bachelor of Laws (LL.B.), Obafemi Awolowo University, [2017].</li></ul>'
      )
    ).toEqual({
      intro: null,
      entries: [
        { qualification: 'Bachelor of Laws (LL.B.), Obafemi Awolowo University', year: 2017 },
      ],
    });
    expect(
      educationFrom('Nigerian Law School - B.L\r\nLagos State University - LL. B\r\n').entries
    ).toEqual([
      { qualification: 'Nigerian Law School - B.L', year: null },
      { qualification: 'Lagos State University - LL. B', year: null },
    ]);
  });

  it('reads memberships from a serialized list, trimming stray commas', () => {
    expect(membershipsFrom('a:2:{i:0;s:5:"NBA ,";i:1;s:5:"ICSAN";}')).toEqual(['NBA', 'ICSAN']);
  });

  it('treats the launch placeholder as empty when merging, and real copy as set', () => {
    expect(isEmpty('<p>[PENDING FROM FIRM]</p>')).toBe(true);
    expect(isEmpty({ intro: '[PENDING FROM FIRM]', entries: [] })).toBe(true);
    expect(isEmpty('<p>A partner since 2010.</p>')).toBe(false);
    expect(isEmpty({ intro: null, entries: [{ qualification: 'LL.B', year: null }] })).toBe(false);
  });

  it('keeps only https LinkedIn links', () => {
    expect(linkedinFrom('http://www.linkedin.com/in/someone')).toBe(
      'https://www.linkedin.com/in/someone'
    );
    expect(linkedinFrom('https://notlinkedin.com/in/someone')).toBeNull();
    expect(linkedinFrom('javascript:alert(1)')).toBeNull();
  });

  it('reads the firm review by slug, and treats a name shared by two rows as pending', () => {
    const row = {
      slug: 'niniolaoluwa-ayantoye',
      name: 'Niniolaoluwa Ayantoye',
      title: '',
    } as PersonRow;
    const byName = [
      { name: 'Niniolaoluwa Ayantoye', status: 'current' as const },
      { name: 'Niniolaoluwa Ayantoye', status: 'duplicate' as const },
    ];
    expect(reviewStatus(row, byName)).toBe('pending');
    // The sheet carries the page title, which can differ from the profile name.
    const titled = {
      slug: 'andrea-ajibade',
      name: 'Andrea Ajibade',
      title: 'Dr. Andrea Ajibade',
    } as PersonRow;
    expect(reviewStatus(titled, [{ name: 'Dr. Andrea Ajibade', status: 'former' }])).toBe('former');
    expect(reviewStatus(row, [...byName, { name: 'x', slug: row.slug, status: 'current' }])).toBe(
      'current'
    );
  });
});

describe('HTML', () => {
  it('builds paragraphs from bare line breaks, leaving block HTML alone', () => {
    expect(autop('One\nline\n\nTwo')).toBe('<p>One<br />\nline</p>\n<p>Two</p>');
    expect(autop('<ul>\n<li>a</li>\n</ul>')).toBe('<ul>\n<li>a</li>\n</ul>');
  });

  it('strips layout shortcodes but keeps legal brackets and caption text', () => {
    const { html } = prepareHtml('[vc_row][vc_column]Held [sic] in [2019].[/vc_column][/vc_row]');
    expect(html).toBe('<p>Held [sic] in [2019].</p>');
    expect(
      prepareHtml('[caption id="x"]<img src="/a.jpg" alt="A"> Photo[/caption]').html
    ).toContain('Photo');
  });

  it('turns images into links, one link for an image already linked to its full size', () => {
    const prepared = prepareHtml(
      '<p><a href="https://spaajibade.com/wp-content/uploads/2020/01/big.jpg"><img src="https://spaajibade.com/wp-content/uploads/2020/01/big-300x200.jpg" alt="Signing" srcset="x 2x"></a></p>'
    );
    expect(prepared.inlineImages).toBe(1);
    expect(findUploadPaths(prepared.html)).toEqual(['2020/01/big.jpg']);
    expect(prepared.html).toContain('>Signing</a>');
  });

  it("finds the old site's uploads but not another site's wp-content", () => {
    expect(
      findUploadPaths(
        '<a href="http://www.spaajibade.com/wp-content/uploads/2019/05/Act%20Final.pdf">a</a>' +
          '<a href="/wp-content/uploads/2018/01/b.pdf">b</a>' +
          '<a href="https://other.org/wp-content/uploads/2018/01/c.pdf">c</a>'
      )
    ).toEqual(['2019/05/Act Final.pdf', '2018/01/b.pdf']);
  });

  it('rewrites uploads to media URLs, keeps unknown ones, and sanitises', () => {
    const html =
      '<p style="x" onclick="y"><a href="https://spaajibade.com/wp-content/uploads/2019/05/a.pdf">Read</a> ' +
      '<a href="https://spaajibade.com/wp-content/uploads/2019/05/gone.pdf">Gone</a></p><p>&nbsp;</p><script>z</script>';
    const out = finishHtml(html, (path) =>
      path === '2019/05/a.pdf' ? 'https://cdn.example/a.pdf' : undefined
    );
    expect(out).toBe(
      '<p><a href="https://cdn.example/a.pdf">Read</a> <a href="https://spaajibade.com/wp-content/uploads/2019/05/gone.pdf">Gone</a></p>'
    );
  });

  it('calls an article a PDF wrapper only with one PDF and little text of its own', () => {
    const short = '<p>Download the review.</p><p><a href="/x.pdf">Full text</a></p>';
    expect(isPdfWrapper(short, ['x.pdf'])).toBe(true);
    expect(isPdfWrapper(short, ['x.pdf', 'y.pdf'])).toBe(false);
    expect(isPdfWrapper(`<p>${'word '.repeat(200)}</p>`, ['x.pdf'])).toBe(false);
  });
});

describe('articles', () => {
  const rows = [
    { term_id: 1, name: 'News &amp; Events', slug: 'n', posts: 3, map_to: 'firm_news, tax' },
    { term_id: 2, name: 'Uncategorized', slug: 'u', posts: 1, map_to: 'skip' },
    { term_id: 3, name: 'Old', slug: 'o', posts: 1, map_to: 'media_coverage' },
  ];

  it("applies the firm's map_to, reporting values that are neither category nor area", () => {
    const { targets, invalid } = categoryTargets(rows, new Set(['tax']));
    expect(classify('News & Events | Uncategorized', targets)).toEqual({
      categories: ['firm_news'],
      practiceAreas: ['tax'],
      defaulted: false,
    });
    expect(classify('Uncategorized', targets)).toMatchObject({
      categories: ['articles'],
      defaulted: true,
    });
    expect(invalid).toEqual([{ category: 'Old', value: 'media_coverage' }]);
  });

  it('keeps a valid WordPress slug and shortens one the backend refuses', () => {
    expect(backendSlug('a-valid-slug')).toBe('a-valid-slug');
    expect(backendSlug('under_scored_slug')).toBe('under-scored-slug');
    expect(backendSlug('word-'.repeat(40)).length).toBeLessThanOrEqual(140);
  });

  it('builds the old permalink from the local date', () => {
    expect(articleSource('2023-05-12 23:30:00', 'my-article')).toBe('/2023/05/12/my-article');
  });
});

describe('CSV', () => {
  it('reads quoted fields with commas, doubled quotes and CRLF', () => {
    expect(parseCsv('"name","status"\r\n"Doe, ""J""",current\r\n')).toEqual([
      ['name', 'status'],
      ['Doe, "J"', 'current'],
    ]);
  });
});
