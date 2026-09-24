#!/usr/bin/env tsx
/**
 * Generates the admin content paths and write schemas in `openapi/openapi.yaml`.
 *
 * The seven content collections are served by one CRUD factory, but the
 * *contract* lists them explicitly: the dashboard needs a concrete request and
 * response type per collection, not a union it has to narrow (ADR-033). Writing
 * 63 operations by hand would guarantee they drift, so they are generated from
 * one template instead.
 *
 * The source of truth is the hand-written `<Name>Admin` schema for each
 * collection. `<Name>Create` and `<Name>Update` are derived from it by dropping
 * the read-only fields, so an admin GET body really is a valid write body — the
 * two cannot disagree, because one is computed from the other.
 *
 * Run with `npm run spec:gen`, then `npm run types:gen`. It rewrites only the
 * regions between the BEGIN/END markers and is idempotent.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = join(ROOT, 'openapi', 'openapi.yaml');
const FIXTURES = join(ROOT, 'fixtures', 'responses');

const PATH_BEGIN = '  # --- BEGIN GENERATED admin content paths (npm run spec:gen) ---';
const PATH_END = '  # --- END GENERATED admin content paths ---';
const SCHEMA_BEGIN = '    # --- BEGIN GENERATED admin content schemas (npm run spec:gen) ---';
const SCHEMA_END = '    # --- END GENERATED admin content schemas ---';

/** Fields the server owns. They appear in a read, never in a write. */
const READ_ONLY = [
  'id',
  'status',
  'publishedAt',
  'order',
  'revision',
  'createdAt',
  'updatedAt',
  '_expanded',
] as const;

interface CollectionSpec {
  /** URL segment, and the key used everywhere else. */
  readonly slug: string;
  /** PascalCase stem of the `<Name>Admin` schema. */
  readonly name: string;
  /** Singular noun, for prose. */
  readonly label: string;
  /** Plural noun, for prose. */
  readonly plural: string;
  /** Fields a create must supply. Everything else is optional. */
  readonly requiredOnCreate: readonly string[];
  /** One sentence about what makes this collection different. */
  readonly note?: string;
  /**
   * The collection-specific half of the example fixture, in real copy from
   * docs/SEED_CONTENT.md. The read-only fields are added by the generator, so
   * a sample cannot disagree with the schema about them.
   */
  readonly sample: Json;
  /** Previews for any ids the sample references. */
  readonly expanded?: Json;
}

const MEDIA_ID = '665f00000000000000000101';
const PERSON_ID = '665f00000000000000000102';

const MEDIA_PREVIEW = {
  [MEDIA_ID]: {
    kind: 'media',
    url: 'https://placehold.co/1200x900?text=Example',
    alt: 'A placeholder image, replaced when the firm uploads the real one',
  },
};

const PERSON_PREVIEW = {
  [PERSON_ID]: { kind: 'person', displayName: 'Dr. Babatunde Ajibade, SAN' },
};

const COLLECTIONS: readonly CollectionSpec[] = [
  {
    slug: 'practice-areas',
    name: 'PracticeArea',
    label: 'practice area',
    plural: 'practice areas',
    requiredOnCreate: ['title', 'shortLabel', 'summary'],
    note: 'The Home tab bar uses `homeOrder`, which differs from the page order.',
    sample: {
      title: 'Tax',
      shortLabel: 'Tax',
      summary:
        'When a business needs to understand or meet its tax obligations, the firm advises on compliance and represents clients in disputes with tax authorities, protecting their financial position along the way.',
      image: MEDIA_ID,
      body: null,
      keyServices: [],
      contacts: [PERSON_ID],
      featuredOnHome: true,
      homeOrder: 6,
      showInFooter: true,
      seo: { title: null, description: null },
    },
    expanded: { ...MEDIA_PREVIEW, ...PERSON_PREVIEW },
  },
  {
    slug: 'people',
    name: 'Person',
    label: 'attorney',
    plural: 'attorneys',
    requiredOnCreate: ['firstName', 'lastName', 'role'],
    note: 'Carries `email`, which the public API never returns.',
    sample: {
      honorific: 'Dr.',
      firstName: 'Babatunde',
      lastName: 'Ajibade',
      postNominals: 'SAN',
      role: 'managing_partner',
      photo: MEDIA_ID,
      linkedinUrl: null,
      email: null,
      bio: null,
      quote: 'law is a profession, not an occupation.',
      practiceAreas: [],
      office: null,
      featuredInLeadership: true,
    },
    expanded: MEDIA_PREVIEW,
  },
  {
    slug: 'insights',
    name: 'Insight',
    label: 'insight',
    plural: 'insights',
    requiredOnCreate: ['title', 'format', 'categories'],
    note: 'A null `author` means the firm wrote it. `videoUrl` is required when `format` is `video`.',
    sample: {
      title: 'Regulatory Update On The 2026 Supreme Court Practice Directions',
      excerpt: null,
      body: '<p>[PENDING FROM FIRM]</p>',
      format: 'article',
      videoUrl: null,
      categories: ['regulatory_updates'],
      practiceAreas: [],
      author: null,
      coverImage: MEDIA_ID,
      featured: false,
    },
    expanded: MEDIA_PREVIEW,
  },
  {
    slug: 'offices',
    name: 'Office',
    label: 'office',
    plural: 'offices',
    requiredOnCreate: ['name', 'address', 'hours'],
    note: '`location` is GeoJSON `[longitude, latitude]`, the reverse of how people say it.',
    sample: {
      name: 'Lagos',
      address: 'Suite 201, SPAACO House, 27A Macarthy Street, Onikan',
      hours: '8:00 AM to 4:00 PM, Monday to Friday',
      location: null,
      directionsUrl: null,
      phone: null,
      email: null,
    },
  },
  {
    slug: 'recognitions',
    name: 'Recognition',
    label: 'recognition',
    plural: 'recognitions',
    requiredOnCreate: ['organization', 'title', 'tab'],
    sample: {
      organization: 'IFLR1000',
      title: 'Recommended Firm',
      year: 2024,
      badge: MEDIA_ID,
      url: null,
      tab: 'achievements',
    },
    expanded: MEDIA_PREVIEW,
  },
  {
    slug: 'faqs',
    name: 'Faq',
    label: 'FAQ',
    plural: 'FAQs',
    requiredOnCreate: ['question', 'answer'],
    sample: {
      question: 'What types of matters does the firm handle?',
      answer:
        '<p>The firm provides expert advice on a wide range of legal matters including dispute resolution and arbitration, corporate finance and capital markets, real estate and succession planning, energy and natural resources, intellectual property rights, data protection regulations, and tax law.</p>',
    },
  },
  {
    slug: 'jobs',
    name: 'Job',
    label: 'job',
    plural: 'jobs',
    requiredOnCreate: ['title', 'description', 'employmentType', 'workMode'],
    note: 'A vacancy leaves the public API when `isOpen` is false or `closingDate` has passed.',
    sample: {
      title: 'Associate',
      practiceArea: null,
      description: '<p>We are looking for an Associate to join our Corporate Finance practice.</p>',
      experience: '2\u20134 years experience',
      employmentType: 'full_time',
      workMode: 'hybrid',
      office: null,
      closingDate: null,
      isOpen: true,
    },
  },
];

type Json = Record<string, unknown>;

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const paramRef = (name: string): Json => ({ $ref: `#/components/parameters/${name}` });
const responseRef = (name: string): Json => ({ $ref: `#/components/responses/${name}` });

const errors = (...codes: readonly ('400' | '401' | '403' | '404' | '409' | '428')[]): Json => {
  const map: Record<string, string> = {
    '400': 'ValidationError',
    '401': 'Unauthenticated',
    '403': 'Forbidden',
    '404': 'NotFound',
    '409': 'Conflict',
    '428': 'PreconditionRequired',
  };
  const out: Json = {};
  for (const code of codes) out[code] = responseRef(map[code] ?? 'InternalError');
  out['500'] = responseRef('InternalError');
  return out;
};

const jsonBody = (schema: Json): Json => ({
  content: { 'application/json': { schema } },
});

const dataOf = (schema: Json): Json => ({
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: { data: schema },
});

/** Strip the server-owned fields from a read schema to get a write schema. */
function writeSchemas(admin: Json, collection: CollectionSpec): { create: Json; update: Json } {
  const readOnly = new Set<string>(READ_ONLY);
  const properties = Object.fromEntries(
    Object.entries(admin.properties as Json).filter(([key]) => !readOnly.has(key))
  );

  const create: Json = {
    type: 'object',
    additionalProperties: false,
    required: [...collection.requiredOnCreate],
    description:
      `Creates a ${collection.label}. This is the editable shape without the ` +
      'server-owned fields, so what a GET returns can be sent straight back.',
    properties,
  };

  const update: Json = {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    description: `Any subset of the ${collection.label} fields. Requires \`If-Match\`.`,
    properties,
  };

  return { create, update };
}

function pathsFor(collection: CollectionSpec): Json {
  const { slug, name, label, plural } = collection;
  const admin = ref(`${name}Admin`);
  const tag = 'Admin content';
  const security = [{ bearerAuth: [] }];
  const note = collection.note === undefined ? '' : `\n\n${collection.note}`;

  const example = (fixture: string): Json => ({
    examples: { [slug]: { value: { $ref: `../fixtures/responses/${fixture}` } } },
  });

  const itemResponse = (description: string): Json => ({
    description,
    content: {
      'application/json': { schema: dataOf(admin), ...example(`admin.${slug}.detail.json`) },
    },
  });

  return {
    [`/api/v1/admin/content/${slug}`]: {
      get: {
        tags: [tag],
        operationId: `list${name}Admin`,
        summary: `List ${plural}`,
        description: `Every status, not just published.${note}`,
        security,
        parameters: [
          paramRef('AdminStatus'),
          paramRef('AdminSearch'),
          paramRef('Page'),
          paramRef('PageSize'),
        ],
        responses: {
          '200': {
            description: `A page of ${plural} in their editable shape.`,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['data', 'meta'],
                  properties: {
                    data: { type: 'array', items: admin },
                    meta: ref('PaginationMeta'),
                  },
                },
                ...example(`admin.${slug}.list.json`),
              },
            },
          },
          ...errors('400', '401', '403'),
        },
      },
      post: {
        tags: [tag],
        operationId: `create${name}`,
        summary: `Create a ${label}`,
        description: `A slug is generated when none is given.${note}`,
        security,
        requestBody: { required: true, ...jsonBody(ref(`${name}Create`)) },
        responses: {
          '201': itemResponse(`The created ${label}.`),
          ...errors('400', '401', '403', '409'),
        },
      },
    },

    [`/api/v1/admin/content/${slug}/reorder`]: {
      patch: {
        tags: [tag],
        operationId: `reorder${name}`,
        summary: `Reorder ${plural}`,
        description: 'Sets `order` from each id’s position. Ids not listed keep their order.',
        security,
        requestBody: { required: true, ...jsonBody(ref('ReorderRequest')) },
        responses: {
          '204': { description: 'Reordered.' },
          ...errors('400', '401', '403', '404'),
        },
      },
    },

    [`/api/v1/admin/content/${slug}/{id}`]: {
      parameters: [paramRef('ObjectId')],
      get: {
        tags: [tag],
        operationId: `get${name}Admin`,
        summary: `Get one ${label} in its editable shape`,
        description:
          'References stay as ids, exactly as they must be sent back. `_expanded` ' +
          'previews each one so the dashboard can render thumbnails without extra ' +
          `calls; it is rejected on write (ADR-014).${note}`,
        security,
        responses: {
          '200': itemResponse(`The ${label}.`),
          ...errors('400', '401', '403', '404'),
        },
      },
      patch: {
        tags: [tag],
        operationId: `update${name}`,
        summary: `Update a ${label}`,
        description:
          'Requires `If-Match` carrying the revision read. A stale revision returns ' +
          '409 with the current one, so two editors cannot silently overwrite each ' +
          'other (ADR-015).',
        security,
        parameters: [paramRef('IfMatch')],
        requestBody: { required: true, ...jsonBody(ref(`${name}Update`)) },
        responses: {
          '200': itemResponse(`The updated ${label}.`),
          ...errors('400', '401', '403', '404', '409', '428'),
        },
      },
      delete: {
        tags: [tag],
        operationId: `delete${name}`,
        summary: `Delete a ${label}`,
        description:
          'Refused with 409 when something still references it, listing what, so the ' +
          'dashboard can show where it is still used.',
        security,
        responses: {
          '204': { description: 'Deleted.' },
          ...errors('400', '401', '403', '404', '409'),
        },
      },
    },

    [`/api/v1/admin/content/${slug}/{id}/publish`]: {
      post: {
        tags: [tag],
        operationId: `publish${name}`,
        summary: `Publish a ${label}`,
        description: 'Stamps `publishedAt` on first publish only, so republishing keeps the date.',
        security,
        parameters: [paramRef('ObjectId')],
        responses: {
          '200': itemResponse(`The published ${label}.`),
          ...errors('400', '401', '403', '404'),
        },
      },
    },

    [`/api/v1/admin/content/${slug}/{id}/unpublish`]: {
      post: {
        tags: [tag],
        operationId: `unpublish${name}`,
        summary: `Unpublish a ${label}`,
        description: 'Returns it to draft. The original `publishedAt` is kept.',
        security,
        parameters: [paramRef('ObjectId')],
        responses: {
          '200': itemResponse(`The unpublished ${label}.`),
          ...errors('400', '401', '403', '404'),
        },
      },
    },
  };
}

/**
 * The example fixture for a collection: the sample plus the read-only fields
 * the server owns, so it validates against the schema it illustrates.
 */
function fixtureFor(collection: CollectionSpec): Json {
  return {
    id: '665f1a2b3c4d5e6f70819293',
    slug: collection.slug === 'faqs' ? 'what-types-of-matters' : 'example',
    status: 'published',
    publishedAt: '2026-06-01T00:00:00.000Z',
    order: 0,
    revision: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...collection.sample,
    _expanded: collection.expanded ?? {},
  };
}

/** Render a YAML fragment at a given indent, without a document wrapper. */
function fragment(value: Json, indentSpaces: number): string {
  const body = stringify(value, { lineWidth: 0, indent: 2 });
  const pad = ' '.repeat(indentSpaces);

  return body
    .split('\n')
    .map((line) => (line === '' ? '' : pad + line))
    .join('\n')
    .replace(/\n+$/, '\n');
}

function replaceRegion(source: string, begin: string, end: string, body: string): string {
  const from = source.indexOf(begin);
  const to = source.indexOf(end);

  if (from === -1 || to === -1) {
    throw new Error(`Could not find the generated region markers:\n${begin}\n${end}`);
  }

  return `${source.slice(0, from)}${begin}\n${body}${source.slice(to)}`;
}

function main(): void {
  const original = readFileSync(SPEC, 'utf8');
  const spec = parse(original) as { components: { schemas: Record<string, Json> } };

  const pathEntries: Json = {};
  const schemaEntries: Json = {};
  const fixtures = new Map<string, Json>();

  for (const collection of COLLECTIONS) {
    const adminSchema = spec.components.schemas[`${collection.name}Admin`];
    if (adminSchema === undefined) {
      throw new Error(
        `openapi.yaml has no ${collection.name}Admin schema. The write schemas are ` +
          'derived from it, so it must be written by hand first.'
      );
    }

    Object.assign(pathEntries, pathsFor(collection));

    // Fixtures are emitted from the same table as the paths, so Prism serves
    // realistic data for every admin endpoint and the two cannot drift.
    const item = fixtureFor(collection);
    fixtures.set(`admin.${collection.slug}.detail.json`, { data: item });
    fixtures.set(`admin.${collection.slug}.list.json`, {
      data: [item],
      meta: { page: 1, pageSize: 9, total: 1, totalPages: 1 },
    });

    const { create, update } = writeSchemas(adminSchema, collection);
    schemaEntries[`${collection.name}Create`] = create;
    schemaEntries[`${collection.name}Update`] = update;
  }

  // Build the whole document in memory, then write once: a failure partway
  // through must not leave the spec truncated.
  let next = replaceRegion(original, PATH_BEGIN, PATH_END, fragment(pathEntries, 2));
  next = replaceRegion(next, SCHEMA_BEGIN, SCHEMA_END, fragment(schemaEntries, 4));

  writeFileSync(SPEC, next, 'utf8');

  for (const [name, body] of fixtures) {
    writeFileSync(join(FIXTURES, name), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  }

  const operations = Object.values(pathEntries).reduce<number>((total, item) => {
    const methods = Object.keys(item as Json).filter((key) => key !== 'parameters');
    return total + methods.length;
  }, 0);

  process.stdout.write(
    `Generated ${String(Object.keys(pathEntries).length)} paths ` +
      `(${String(operations)} operations) and ` +
      `${String(Object.keys(schemaEntries).length)} write schemas and ` +
      `${String(fixtures.size)} fixtures ` +
      `for ${String(COLLECTIONS.length)} collections.\n`
  );
}

main();
