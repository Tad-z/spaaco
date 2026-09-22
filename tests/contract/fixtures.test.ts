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
 * The fixtures are what Prism serves to the frontend, and what the seeded API is
 * later asserted against, so a fixture that no longer matches the spec becomes a
 * broken screen on their side. This validates each one against the exact schema
 * the spec attaches to the response it illustrates.
 *
 * It also fails on an orphaned fixture, so removing an endpoint's example cannot
 * quietly leave a stale file behind.
 */

interface FixtureUsage {
  readonly fixture: string;
  readonly pointer: string;
  readonly label: string;
}

/**
 * Collect every `examples: { name: { value: { $ref: '../fixtures/…' } } }` in the
 * spec, together with the JSON pointer of the schema sitting beside it.
 */
function collectUsages(): FixtureUsage[] {
  const usages: FixtureUsage[] = [];

  const visitMediaType = (media: unknown, pointerPrefix: string, label: string): void => {
    const mediaObject = asObject(media);
    if (!mediaObject) return;
    const examples = asObject(mediaObject.examples);
    if (!examples || !('schema' in mediaObject)) return;

    for (const example of Object.values(examples)) {
      const ref = asObject(asObject(example)?.value)?.$ref;
      if (typeof ref !== 'string') continue;
      const fixture = ref.split('/').pop();
      if (!fixture) continue;
      usages.push({ fixture, pointer: `${pointerPrefix}/schema`, label });
    }
  };

  const paths = asObject(spec.paths) ?? {};
  for (const [path, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(asObject(pathItem) ?? {})) {
      const responses = asObject(asObject(operation)?.responses) ?? {};
      for (const [status, response] of Object.entries(responses)) {
        const content = asObject(asObject(response)?.content) ?? {};
        for (const [mediaType, media] of Object.entries(content)) {
          visitMediaType(
            media,
            `${SPEC_ID}#/paths/${escapePointer(path)}/${method}/responses/${status}/content/${escapePointer(mediaType)}`,
            `${method.toUpperCase()} ${path} → ${status}`
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
        `components.responses.${name}`
      );
    }
  }

  return usages;
}

const usages = collectUsages();
const fixtureFiles = readdirSync(FIXTURE_DIR).filter((name) => name.endsWith('.json'));

describe('response fixtures', () => {
  it('finds at least one fixture reference in the spec', () => {
    expect(usages.length).toBeGreaterThan(0);
  });

  it.each(usages)('$fixture matches the schema for $label', ({ fixture, pointer }) => {
    const validate = getValidator(pointer);
    expect(validate, `no schema found at ${pointer}`).toBeDefined();
    if (!validate) return;

    const data: unknown = JSON.parse(readFileSync(join(FIXTURE_DIR, fixture), 'utf8'));
    const valid = validate(data);

    expect(valid, `${fixture} does not match ${pointer}:\n${formatErrors(validate.errors)}`).toBe(
      true
    );
  });

  it('has no fixture that the spec never references', () => {
    const referenced = new Set(usages.map((usage) => usage.fixture));
    const orphans = fixtureFiles.filter((name) => !referenced.has(name));
    expect(orphans).toEqual([]);
  });

  it('references no fixture that is missing from disk', () => {
    const onDisk = new Set(fixtureFiles);
    const missing = [...new Set(usages.map((usage) => usage.fixture))].filter(
      (name) => !onDisk.has(name)
    );
    expect(missing).toEqual([]);
  });
});
