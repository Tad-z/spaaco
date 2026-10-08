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
  authorFields,
  creditWithWriters,
  backendSlug,
  categoryTargets,
  classify,
} from '../../../scripts/import-wordpress/insights.js';
import {
  bylineWriters,
  creditFor,
  leadingByline,
  sameWriter,
  stripLeadingByline,
} from '../../../scripts/import-wordpress/bylines.js';
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

describe('bylines (ADR-060)', () => {
  const people = [
    { id: 'p1', slug: 'peter-olalere', firstName: 'Peter', lastName: 'Olalere' },
    { id: 'p2', slug: 'john-onyido', firstName: 'John', lastName: 'Onyido' },
    { id: 'p3', slug: 'frederick-adefarati', firstName: 'Frederick', lastName: 'Adefarati' },
  ];

  it("credits the profile a byline links to, through the old slug's mapping", () => {
    const html =
      '<div><a href="https://spaajibade.com/people/peter-olalere-mciarb/"><strong>By Peter Olaoye Olalere</strong></a>\r\n<img src="x.jpg">';
    expect(creditFor(html, 'an-article', people)).toEqual({
      kind: 'person',
      id: 'p1',
      name: 'Peter Olalere',
    });
  });

  it('reads a byline split across tags, and names a writer who is not on the site', () => {
    const html =
      '<p><span>By</span> <span>Patricia</span> <span>Magaji</span></p><h2>CONFIDENTIALITY ROLE</h2>';
    expect(creditFor(html, 'confidentiality-role', people)).toEqual({
      kind: 'named',
      name: 'Patricia Magaji',
    });
  });

  it('stops a name where the title starts, and credits the first of several writers', () => {
    expect(leadingByline('<p>By Yakub Hammed CAREER GROWTH IN LAW</p>')).toBe('Yakub Hammed');
    expect(creditFor('<p>By John C. Onyido | Magnus Ejelonu</p>', 'x', people)).toMatchObject({
      kind: 'person',
      id: 'p2',
    });
  });

  it('falls back to the PDF line, then to a slug ending in a profile name', () => {
    const pdf =
      '<p>Text.</p><p>Download PDF: Who owns Copyright in an AI Invention? - Oluwafunmilayo Mayowa</p>';
    expect(creditFor(pdf, 'who-owns-copyright', people)).toEqual({
      kind: 'named',
      name: 'Oluwafunmilayo Mayowa',
    });
    expect(
      creditFor('<p>Text.</p>', 'opec-extends-exemption-frederick-adefarati', people)
    ).toMatchObject({
      kind: 'person',
      id: 'p3',
    });
  });

  it('credits the firm for a department, a public figure, or a "by" deep in the text', () => {
    expect(creditFor('<p>By CFCM Department Regulatory Update</p>', 'x', people)).toEqual({
      kind: 'firm',
    });
    expect(
      creditFor(
        `<p>${'Opening words. '.repeat(20)}signed by President Muhammadu Buhari</p>`,
        'x',
        people
      )
    ).toEqual({
      kind: 'firm',
    });
  });

  it('maps a credit to the author fields, never both', () => {
    expect(authorFields({ kind: 'person', id: 'p1', name: 'Peter Olalere' })).toEqual({
      author: 'p1',
      authorName: null,
    });
    expect(authorFields({ kind: 'named', name: 'Patricia Magaji' })).toEqual({
      author: null,
      authorName: 'Patricia Magaji',
    });
    expect(authorFields({ kind: 'firm' })).toEqual({ author: null, authorName: null });
  });
});

describe('old bylines at the top of an article (ADR-064)', () => {
  const title = '<p><strong>DOUBLE ALLOCATION OF LAND</strong></p>';

  it('removes a "By" line with its photo, which the import had made "View image"', () => {
    const body =
      '<p><strong><a href="https://spaajibade.com/people/david-essien/">By David Essien</a></strong>' +
      '<br /><a href="https://spaajibade.com/people/david-essien/">View image</a></p>' +
      title;

    expect(stripLeadingByline(body)).toBe(title);
  });

  it('removes a co-authored byline and its photos, uploaded or not', () => {
    const body =
      '<p>By Ufuoma Eferha | Kenechukwu Chibueze<br />' +
      '<a href="https://spaajibade.com/people/ufuoma-eferha/">View image</a> ' +
      '<a href="https://res.cloudinary.com/x/image/upload/v1/spa-ajibade/abc.png">View image</a></p>' +
      title;

    expect(stripLeadingByline(body)).toBe(title);
  });

  it('removes a row of author photos after a date line, keeping the date', () => {
    const date = '<p><strong>2nd April 2024</strong></p>';
    const body =
      date +
      '<p><a href="https://spaajibade.com/people/emmanuel-bassey/">View image</a> ' +
      '<a href="https://spaajibade.com/people/abiodun-ogunnubi/">View image</a></p>' +
      title;

    expect(stripLeadingByline(body)).toBe(date + title);
  });

  it('takes an old header banner off the front of "Introduction", keeping the heading', () => {
    const body =
      '<p><strong><a href="http://www.spaajibade.com/resources/wp-content/uploads/2021/08/Article-header-SPA.png">View image</a>Introduction</strong></p><p>Text.</p>';

    expect(stripLeadingByline(body)).toBe('<p><strong>Introduction</strong></p><p>Text.</p>');
  });

  it('keeps a picture at the top of an article with no byline, which is content', () => {
    const body =
      '<p>We welcome our new Associates.</p>' +
      '<p><a href="https://res.cloudinary.com/x/image/upload/v1/spa-ajibade/group.png">View image</a></p>';

    expect(stripLeadingByline(body)).toBe(body);
  });

  it('leaves "by" in the opening sentence alone', () => {
    const body = '<p>By virtue of section 5 of the Act, the Minister may revoke a licence.</p>';

    expect(stripLeadingByline(body)).toBe(body);
  });
});

describe('writers in a byline (ADR-064)', () => {
  const profiles = [
    { slug: 'peter-olalere', name: 'Peter Olalere, MCIArb', photo: '2023/12/Peter.jpg' },
    { slug: 'kelson-emmanuel', name: 'KELSON EMMANUEL', photo: null },
  ];

  it('lists every writer in order, matching each photo by its file name', () => {
    const html =
      '<div style="margin: 20px;">By Ufuoma Eferha | Kenechukwu Chibueze\n' +
      '<a href="https://spaajibade.com/people/ufuoma-eferha/"><img src="https://spaajibade.com/wp-content/uploads/2025/01/Eferha-500-300x300.jpg" alt="" /></a> ' +
      '<img src="https://spaajibade.com/wp-content/uploads/2024/11/Kenechukwu.png" alt="" />\n' +
      '<p style="text-align: center;"><strong>TITLE</strong></p>';

    expect(bylineWriters(html, profiles)).toEqual([
      { name: 'Ufuoma Eferha', slug: 'ufuoma-eferha', photo: '2025/01/Eferha-500-300x300.jpg' },
      { name: 'Kenechukwu Chibueze', photo: '2024/11/Kenechukwu.png' },
    ]);
  });

  it('pairs photos by position when no file name says whose they are', () => {
    const html =
      '<p>By Yetunde Okojie and Oluwasolape Owoyemi<br />' +
      '<img src="/wp-content/uploads/a.jpg" alt="" /><img src="/wp-content/uploads/b.jpg" alt="" /></p>';

    expect(bylineWriters(html, profiles).map((writer) => writer.photo)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('names a row of linked photos with no "By" line from the old profiles, tidied', () => {
    const html =
      '<p><a href="https://spaajibade.com/people/peter-olalere/"><img src="/wp-content/uploads/p.jpg" /></a>' +
      '<a href="https://spaajibade.com/people/kelson-emmanuel/"><img src="/wp-content/uploads/k.jpg" /></a></p>' +
      '<ol><li>Introduction</li></ol>';

    expect(bylineWriters(html, profiles).map((writer) => writer.name)).toEqual([
      'Peter Olalere',
      'Kelson Emmanuel',
    ]);
  });

  it('does not take a place for a writer', () => {
    expect(bylineWriters('<p>Issued by the firm, Ogun State</p>', profiles)).toEqual([]);
    expect(bylineWriters('<p>By Ogun State Government</p>', profiles)).toEqual([]);
  });
});

describe('photo-captioned bylines (ADR-064)', () => {
  const title = '<p><strong>JUSTICE DELAYED</strong></p>';
  const photo =
    '<a href="https://res.cloudinary.com/x/image/upload/v1/spa-ajibade/h.jpg">View image</a>';

  it('removes a photo captioned with a name alone, in its block or the next', () => {
    expect(
      stripLeadingByline(`<p>${photo}<br /><strong>Hilda Omono Okoduwa</strong></p>${title}`)
    ).toBe(title);
    expect(stripLeadingByline(`<p>${photo}</p><p><strong>Sandra Eke</strong></p>${title}`)).toBe(
      title
    );
  });

  it('keeps a title that follows a photo, which is not a name', () => {
    const body = `<p>${photo}</p><p><strong>DOUBLE ALLOCATION OF LAND</strong></p>`;

    expect(stripLeadingByline(body)).toBe(body);
  });

  it("removes a byline run into a date, a department byline, and a byline sharing the title's paragraph", () => {
    expect(
      stripLeadingByline(`<p>2nd May 2024<br /> By <strong>Christian Oyewale</strong></p>${title}`)
    ).toBe(title);
    expect(
      stripLeadingByline(
        `<p>By <strong>Capital Market and Corporate Finance Department</strong></p>${title}`
      )
    ).toBe(title);
    expect(
      stripLeadingByline(
        '<p><a href="https://spaajibade.com/people/john-onyido/">By Dr. John Onyido</a><br /><strong>TITLE</strong></p>'
      )
    ).toBe('<p><strong>TITLE</strong></p>');
  });

  it('reads the writers from a caption, only when the photo is named after them', () => {
    const head = (file: string, caption: string): string =>
      `<img src="https://spaajibade.com/wp-content/uploads/2026/04/${file}" alt="" /> <strong>${caption}</strong><p style="text-align: center;">T</p>`;

    expect(bylineWriters(head('Hilda-223x300.jpg', 'Hilda Omono Okoduwa'), [])).toEqual([
      { name: 'Hilda Omono Okoduwa', photo: '2026/04/Hilda-223x300.jpg' },
    ]);
    expect(bylineWriters(head('Header-sandra.png', 'Intellectual Property'), [])).toEqual([]);
  });

  it('splits two names under two photos', () => {
    const html =
      '<img src="/wp-content/uploads/Omoniyi.jpg" /> <img src="/wp-content/uploads/patricia.jpg" />Sunday Omoniyi Patricia Magaji <p style="text-align: center;">T</p>';

    expect(bylineWriters(html, []).map((writer) => writer.name)).toEqual([
      'Sunday Omoniyi',
      'Patricia Magaji',
    ]);
  });

  it('ignores "by" in the opening sentence', () => {
    const html =
      '<p>The deadline has been extended by Mr. Kashif Inuwa, Director General of NITDA.</p>'.padStart(
        400,
        ' '
      );

    expect(bylineWriters(`<p>${'Some opening text. '.repeat(15)}</p>${html}`, [])).toEqual([]);
  });

  it('credits a writer named under a photo instead of the firm, and a named writer to their profile', () => {
    const people = [
      { id: 'h1', slug: 'hilda-okoduwa', firstName: 'Hilda', lastName: 'Okoduwa', published: true },
    ];

    expect(sameWriter('Hilda Omono Okoduwa', 'Hilda Okoduwa')).toBe(true);
    expect(creditWithWriters({ kind: 'firm' }, [{ name: 'Hilda Omono Okoduwa' }], people)).toEqual({
      kind: 'person',
      id: 'h1',
      name: 'Hilda Okoduwa',
    });
    expect(creditWithWriters({ kind: 'firm' }, [{ name: 'Blessing Nwankwo' }], people)).toEqual({
      kind: 'named',
      name: 'Blessing Nwankwo',
    });
    expect(
      creditWithWriters(
        { kind: 'firm' },
        [{ name: 'Hilda Okoduwa' }],
        [{ ...people[0]!, published: false }]
      )
    ).toEqual({ kind: 'named', name: 'Hilda Okoduwa' });
  });
});
