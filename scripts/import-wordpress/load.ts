/**
 * Reads the handover files. They are phpMyAdmin JSON exports: an array whose
 * one `type: "table"` element holds the rows in `data`. Rows are validated,
 * and a malformed file stops the run before anything is written.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const text = z.string().nullable().optional();

const personRow = z.object({
  ID: z.coerce.number().int().positive(),
  slug: z.string().min(1),
  title: z.string(),
  last_edited: text,
  name: text,
  position: text,
  practice_areas: text,
  linkedin: text,
  bio: text,
  education: text,
  memberships: text,
  photo_file: text,
});

const postRow = z.object({
  ID: z.coerce.number().int().positive(),
  slug: z.string().min(1),
  title: z.string(),
  published: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
  excerpt: text,
  content: text,
  author: text,
  cover_file: text,
  categories: text,
  tags: text,
});

const categoryRow = z.object({
  term_id: z.coerce.number().int(),
  name: z.string(),
  slug: z.string(),
  posts: z.coerce.number().int(),
  map_to: text,
});

const pageRow = z.object({ ID: z.coerce.number().int(), slug: z.string(), title: z.string() });

export type PersonRow = z.infer<typeof personRow>;
export type PostRow = z.infer<typeof postRow>;
export type CategoryRow = z.infer<typeof categoryRow>;

export type ReviewStatus = 'current' | 'former' | 'duplicate' | 'pending';

export interface ReviewRow {
  readonly name: string;
  readonly slug?: string;
  readonly status: ReviewStatus;
}

export interface Export {
  readonly people: PersonRow[];
  readonly posts: PostRow[];
  readonly categories: CategoryRow[];
  readonly practiceAreaPages: z.infer<typeof pageRow>[];
  readonly review: ReviewRow[];
}

function table<T>(dir: string, file: string, row: z.ZodType<T>): T[] {
  const path = join(dir, file);
  if (!existsSync(path)) throw new Error(`Missing ${file} in ${dir}`);

  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const element = Array.isArray(parsed)
    ? parsed.find(
        (item: unknown) =>
          typeof item === 'object' && item !== null && (item as { type?: unknown }).type === 'table'
      )
    : undefined;
  const data: unknown = (element as { data?: unknown } | undefined)?.data;
  if (!Array.isArray(data)) throw new Error(`${file}: no phpMyAdmin table data`);

  return data.map((item, index) => {
    const result = row.safeParse(item);
    if (!result.success) {
      throw new Error(
        `${file} row ${String(index)}: ${result.error.issues[0]?.message ?? 'invalid'}`
      );
    }
    return result.data;
  });
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? '';
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

const STATUSES: readonly ReviewStatus[] = ['current', 'former', 'duplicate'];

/**
 * The firm's decision per person. The CSV is the sheet the firm edits; a
 * `slug` column is matched first, and a name otherwise (the first export had
 * no slug column). A blank status is "pending".
 */
function review(dir: string): ReviewRow[] {
  const path = join(dir, 'people-review', 'people-review.csv');
  if (!existsSync(path)) throw new Error(`Missing people-review/people-review.csv in ${dir}`);

  const [header, ...rows] = parseCsv(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  const columns = (header ?? []).map((cell) => cell.trim().toLowerCase());
  const at = (name: string): number => columns.indexOf(name);
  if (at('name') < 0 || at('status') < 0) {
    throw new Error('people-review.csv needs at least "name" and "status" columns');
  }

  return rows.map((cells) => {
    const raw = (cells[at('status')] ?? '').trim().toLowerCase();
    const status = STATUSES.find((value) => value === raw);
    if (raw !== '' && status === undefined) {
      throw new Error(
        `people-review.csv: unknown status "${raw}" (use current, former or duplicate)`
      );
    }
    const slug = at('slug') >= 0 ? (cells[at('slug')] ?? '').trim() : '';
    return {
      name: (cells[at('name')] ?? '').trim(),
      ...(slug === '' ? {} : { slug }),
      status: status ?? 'pending',
    };
  });
}

export function loadExport(dir: string): Export {
  return {
    people: table(dir, 'people.json', personRow),
    posts: table(dir, 'posts.json', postRow),
    categories: table(dir, join('categories', 'categories.json'), categoryRow),
    practiceAreaPages: table(dir, 'practice-areas.json', pageRow),
    review: review(dir),
  };
}
