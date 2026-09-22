import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import _Ajv2020 from 'ajv/dist/2020.js';
import _addFormats from 'ajv-formats';
import type { ErrorObject, ValidateFunction } from 'ajv';

/**
 * A single Ajv instance loaded with `openapi/openapi.yaml`, shared by the fixture
 * test and by `expectToMatchContract`, so both judge a payload against exactly
 * the same schemas.
 */

// Ajv ships CommonJS with ESM-style type declarations, so under NodeNext the
// default import is the module namespace and the constructor sits on `.default`.
// This is the interop shim ajv documents; it is deliberately the only one.
const Ajv2020 = _Ajv2020 as unknown as typeof _Ajv2020.default;
const addFormats = _addFormats as unknown as typeof _addFormats.default;

export const ROOT = join(import.meta.dirname, '..', '..');
export const SPEC_PATH = join(ROOT, 'openapi', 'openapi.yaml');
export const FIXTURE_DIR = join(ROOT, 'fixtures', 'responses');
export const SPEC_ID = 'openapi.yaml';

export type JsonObject = Record<string, unknown>;

export const spec = parse(readFileSync(SPEC_PATH, 'utf8')) as JsonObject;

export const ajv = new Ajv2020({
  // The document is an OpenAPI description, not a bare JSON Schema, so it carries
  // keywords (paths, discriminator, operationId) that Ajv should skip, not reject.
  strict: false,
  allErrors: true,
  validateSchema: false,
});
addFormats(ajv);
ajv.addSchema(spec, SPEC_ID);

/** RFC 6901 escaping, so a path like `/pages/{key}` survives as one pointer segment. */
export const escapePointer = (segment: string): string =>
  segment.replace(/~/g, '~0').replace(/\//g, '~1');

/** Narrow an unknown spec node to a plain object, or undefined. */
export const asObject = (value: unknown): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;

export const getValidator = (pointer: string): ValidateFunction | undefined =>
  ajv.getSchema(pointer) as ValidateFunction | undefined;

/** Render Ajv errors as one readable block for an assertion message. */
export const formatErrors = (errors: ErrorObject[] | null | undefined): string =>
  (errors ?? [])
    .map((error) => `  ${error.instancePath || '/'} ${error.message ?? ''}`.trimEnd())
    .join('\n');
