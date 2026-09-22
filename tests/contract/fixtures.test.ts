import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  asObject,
  escapePointer,
  FIXTURE_DIR,
  formatErrors,
  getValidator,
  spec,
  SPEC_ID,
} from '../support/spec.js';

/**
 * Every example in the spec is validated against the schema it sits beside.
 *
 * Fixture examples are what Prism serves to the frontend and what the seeded API
 * is later asserted against, so a stale one becomes a broken screen on their
 * side. Inline examples matter just as much: the request-body examples are what
 * a frontend developer copies when wiring up the three forms.
 *
 * Redocly's own example validation is off (see redocly.yaml) because it cannot
 * follow a `$ref` into a fixture file, so this is the only thing checking them.
 *
 * It also fails on an orphaned fixture, so removing an endpoint's example cannot
 * quietly leave a stale file behind.
 */

interface ExampleCase {
  /** The fixture filename, or undefined for an example written inline in the spec. */
  readonly fixture?: string;
  readonly pointer: string;
  readonly label: string;
  readonly name: string;
}

/**
 * Walk a media-type object and emit one case per example beside a schema, whether
 * the example is a `$ref` into `fixtures/responses/` or written inline.
 */
function visitMediaType(
  media: unknown,
  pointerPrefix: string,
  label: string,
  cases: ExampleCase[]
): void {
  const mediaObject = asObject(media);
  if (!mediaObject || !('schema' in mediaObject)) return;
  const pointer = `${pointerPrefix}/schema`;

  // `example:` — a single inline value.
  if ('example' in mediaObject) {
    cases.push({ pointer, label, name: `${label} (inline example)` });
  }

  // `examples:` — named, each either a `$ref` to a fixture or an inline value.
  const examples = asObject(mediaObject.examples);
  if (!examples) return;

  for (const [exampleName, example] of Object.entries(examples)) {
    const value = asObject(example)?.value;
    const ref = asObject(value)?.$ref;

    if (typeof ref === 'string') {
      const fixture = ref.split('/').pop();
      if (!fixture) continue;
      cases.push({ fixture, pointer, label, name: `${fixture} (${label})` });
    } else if (value !== undefined) {
      cases.push({ pointer, label, name: `${label} (example: ${exampleName})` });
    }
  }
}

/** Read the value an example case points at: a fixture file, or the inline node. */
function readExampleValue(testCase: ExampleCase): unknown {
  if (testCase.fixture) {
    return JSON.parse(readFileSync(join(FIXTURE_DIR, testCase.fixture), 'utf8'));
  }

  // Re-walk to the inline value rather than carrying it through the case list,
  // which keeps the vitest test titles readable.
  const [, path] = testCase.pointer.split('#');
  if (path === undefined) return undefined;
  const segments = path.split('/').slice(1, -1); // drop the leading '' and trailing 'schema'
  let node: unknown = spec;
  for (const segment of segments) {
    node = asObject(node)?.[segment.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  const media = asObject(node);
  if (!media) return undefined;
  if ('example' in media && testCase.name.endsWith('(inline example)')) return media.example;

  const exampleName = /\(example: (.+)\)$/.exec(testCase.name)?.[1];
  if (exampleName === undefined) return undefined;
  return asObject(asObject(media.examples)?.[exampleName])?.value;
}

function collectCases(): ExampleCase[] {
  const cases: ExampleCase[] = [];

  const paths = asObject(spec.paths) ?? {};
  for (const [path, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(asObject(pathItem) ?? {})) {
      const operationObject = asObject(operation);
      if (!operationObject) continue;
      const base = `${SPEC_ID}#/paths/${escapePointer(path)}/${method}`;
      const label = `${method.toUpperCase()} ${path}`;

      // Request bodies: the shapes a frontend developer copies.
      const requestContent = asObject(asObject(operationObject.requestBody)?.content) ?? {};
      for (const [mediaType, media] of Object.entries(requestContent)) {
        visitMediaType(
          media,
          `${base}/requestBody/content/${escapePointer(mediaType)}`,
          `${label} request`,
          cases
        );
      }

      const responses = asObject(operationObject.responses) ?? {};
      for (const [status, response] of Object.entries(responses)) {
        const content = asObject(asObject(response)?.content) ?? {};
        for (const [mediaType, media] of Object.entries(content)) {
          visitMediaType(
            media,
            `${base}/responses/${status}/content/${escapePointer(mediaType)}`,
            `${label} → ${status}`,
            cases
          );
        }
      }
    }
  }

  const sharedResponses = asObject(asObject(spec.components)?.responses) ?? {};
  for (const [name, response] of Object.entries(sharedResponses)) {
    const content = asObject(asObject(response)?.content) ?? {};
    for (const [mediaType, media] of Object.entries(content)) {
      visitMediaType(
        media,
        `${SPEC_ID}#/components/responses/${escapePointer(name)}/content/${escapePointer(mediaType)}`,
        `components.responses.${name}`,
        cases
      );
    }
  }

  return cases;
}

const cases = collectCases();
const fixtureCases = cases.filter((testCase) => testCase.fixture !== undefined);
const inlineCases = cases.filter((testCase) => testCase.fixture === undefined);
const fixtureFiles = readdirSync(FIXTURE_DIR).filter((name) => name.endsWith('.json'));

describe('spec examples', () => {
  it('finds both fixture-backed and inline examples', () => {
    expect(fixtureCases.length).toBeGreaterThan(0);
    expect(inlineCases.length).toBeGreaterThan(0);
  });

  it.each(cases)('$name matches its schema', (testCase) => {
    const validate = getValidator(testCase.pointer);
    expect(validate, `no schema found at ${testCase.pointer}`).toBeDefined();
    if (!validate) return;

    const data = readExampleValue(testCase);
    expect(data, `could not read the example for ${testCase.name}`).toBeDefined();

    const valid = validate(data);
    expect(
      valid,
      `${testCase.name} does not match ${testCase.pointer}:\n${formatErrors(validate.errors)}`
    ).toBe(true);
  });

  it('has no fixture that the spec never references', () => {
    const referenced = new Set(fixtureCases.map((testCase) => testCase.fixture));
    const orphans = fixtureFiles.filter((name) => !referenced.has(name));
    expect(orphans).toEqual([]);
  });

  it('references no fixture that is missing from disk', () => {
    const onDisk = new Set(fixtureFiles);
    const missing = [...new Set(fixtureCases.map((testCase) => testCase.fixture))].filter(
      (name) => name !== undefined && !onDisk.has(name)
    );
    expect(missing).toEqual([]);
  });
});
