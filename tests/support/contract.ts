import { expect } from 'vitest';
import type { Response } from 'supertest';
import {
  asObject,
  escapePointer,
  formatErrors,
  getValidator,
  resolveRef,
  spec,
  SPEC_ID,
} from './spec.js';

/**
 * Assert a live response matches the contract the frontend builds against.
 *
 * The path is the spec path, placeholders and all: `'/api/v1/pages/{key}'`.
 *
 * A wrong path, method or status is a hard failure rather than a silent pass.
 * A contract helper that shrugs at an unknown operation is worse than no
 * helper, because every test using it reads as covered while asserting
 * nothing.
 */

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

const JSON_MEDIA_TYPE = 'application/json';

const operationNode = (path: string, method: HttpMethod): Record<string, unknown> | undefined =>
  asObject(asObject(asObject(spec.paths)?.[path])?.[method]);

const declaredStatuses = (path: string, method: HttpMethod): string[] =>
  Object.keys(asObject(operationNode(path, method)?.responses) ?? {});

/**
 * The response node for a status, plus the pointer base it lives at.
 *
 * Shared error responses are `$ref`s into `components/responses`, so the node
 * has to be followed to find the schema. Without this the walk finds no
 * `content`, concludes there is no body, and every error-status assertion
 * passes while checking nothing.
 */
function responseFor(
  path: string,
  method: HttpMethod,
  status: number
): { node: Record<string, unknown> | undefined; base: string } {
  const raw = asObject(asObject(operationNode(path, method)?.responses)?.[String(status)]);
  const base =
    `${SPEC_ID}#/paths/${escapePointer(path)}/${method}/responses/${String(status)}`;

  return resolveRef(raw, base);
}

export function expectToMatchContract(res: Response, method: HttpMethod, path: string): void {
  const status = res.status;

  if (!operationNode(path, method)) {
    const available = Object.keys(asObject(spec.paths) ?? {}).join(', ');
    throw new Error(
      `expectToMatchContract: openapi.yaml has no "${method.toUpperCase()} ${path}".\n` +
        `Check the path spelling, including the /api/v1 prefix and {placeholders}.\n` +
        `Known paths: ${available}`
    );
  }

  const statuses = declaredStatuses(path, method);
  if (!statuses.includes(String(status))) {
    throw new Error(
      `expectToMatchContract: ${method.toUpperCase()} ${path} responded ${String(status)}, ` +
        `which openapi.yaml does not declare. Declared: ${statuses.join(', ')}.\n` +
        `Either the endpoint is wrong or the spec needs the new status.\n` +
        `Body: ${JSON.stringify(res.body)}`
    );
  }

  const { node, base } = responseFor(path, method, status);
  const json = asObject(asObject(node?.content)?.[JSON_MEDIA_TYPE]);

  // A declared status with no JSON body (204, or a non-JSON media type) has
  // nothing to validate.
  if (!json) return;

  expect(
    res.headers['content-type'],
    `${method.toUpperCase()} ${path} → ${String(status)} should be JSON`
  ).toMatch(/application\/json/);

  const pointer = `${base}/content/${escapePointer(JSON_MEDIA_TYPE)}/schema`;
  const validate = getValidator(pointer);
  if (!validate) {
    throw new Error(
      `expectToMatchContract: no schema resolved at ${pointer}. ` +
        `The spec declares ${method.toUpperCase()} ${path} → ${String(status)} with a JSON body, ` +
        `so this is a bug in the helper or a malformed spec.`
    );
  }

  const valid = validate(res.body);
  expect(
    valid,
    `${method.toUpperCase()} ${path} → ${String(status)} does not match the contract:\n` +
      `${formatErrors(validate.errors)}\n` +
      `Body: ${JSON.stringify(res.body, null, 2)}`
  ).toBe(true);
}
