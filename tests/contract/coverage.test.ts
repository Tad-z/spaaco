import { describe, expect, it } from 'vitest';
import { asObject, spec } from '../support/spec.js';
import { registeredAdminRoutes, registeredPublicRoutes } from '../support/routes.js';
import { ADMIN_COLLECTIONS } from '../../src/constants/content-collections.js';

/**
 * Contract coverage tripwire.
 *
 * Roadmap 7.6 requires every path in the spec to have a passing contract test.
 * Discovering at the end of Phase 7 which of ~60 operations were never covered
 * would be archaeology, so these assertions grow with the spec instead: adding
 * an operation without an example, or a success response, fails here on the
 * commit that adds it.
 *
 * The stronger check — that every operation has an `expectToMatchContract`
 * assertion against a live response — arrives with the contract helper in task
 * 1.3 and is extended as endpoints land.
 */

interface Operation {
  readonly path: string;
  readonly method: string;
  readonly operation: Record<string, unknown>;
}

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options']);

function collectOperations(): Operation[] {
  const operations: Operation[] = [];
  const paths = asObject(spec.paths) ?? {};

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(asObject(pathItem) ?? {})) {
      if (!HTTP_METHODS.has(method)) continue;
      const operationObject = asObject(operation);
      if (!operationObject) continue;
      operations.push({ path, method, operation: operationObject });
    }
  }

  return operations;
}

const operations = collectOperations();

const describeOperation = (op: Operation): string => `${op.method.toUpperCase()} ${op.path}`;

const successResponses = (op: Operation): [string, unknown][] =>
  Object.entries(asObject(op.operation.responses) ?? {}).filter(([status]) =>
    status.startsWith('2')
  );

describe('spec coverage', () => {
  it('finds every operation in the spec', () => {
    expect(operations.length).toBeGreaterThan(0);
  });

  it.each(operations.map((op) => ({ name: describeOperation(op), op })))(
    '$name declares a success response',
    ({ op }) => {
      expect(successResponses(op).length).toBeGreaterThan(0);
    }
  );

  it.each(operations.map((op) => ({ name: describeOperation(op), op })))(
    '$name has an example on every JSON success response',
    ({ op }) => {
      const withoutExample: string[] = [];

      for (const [status, response] of successResponses(op)) {
        const content = asObject(asObject(response)?.content) ?? {};
        const json = asObject(content['application/json']);
        // 204 and other bodyless successes have nothing to exemplify.
        if (!json) continue;
        if (!('example' in json) && !asObject(json.examples)) {
          withoutExample.push(status);
        }
      }

      expect(
        withoutExample,
        `${describeOperation(op)} has no example for ${withoutExample.join(', ')}`
      ).toEqual([]);
    }
  );

  it.each(operations.map((op) => ({ name: describeOperation(op), op })))(
    '$name declares at least one 4xx response',
    ({ op }) => {
      const clientErrors = Object.keys(asObject(op.operation.responses) ?? {}).filter((status) =>
        status.startsWith('4')
      );
      expect(clientErrors.length).toBeGreaterThan(0);
    }
  );

  it('gives every operation a unique operationId', () => {
    const operationIds = operations.map((op) => op.operation.operationId);
    expect(operationIds.every((value) => typeof value === 'string' && value.length > 0)).toBe(true);
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  /**
   * The other direction.
   *
   * Everything above walks spec → app, so a route that exists only in the code
   * is invisible to it — which is how `GET /files/cv/{key}` reached the app
   * with no spec entry, no contract assertion and no reviewer's attention. The
   * app is now walked too, so the gap closes on the commit that opens it.
   */
  it('has a spec entry for every route the app serves', () => {
    const declared = new Set(operations.map((op) => `${op.method} ${op.path}`.toLowerCase()));

    const served = [...registeredPublicRoutes(), ...registeredAdminRoutes()].flatMap((route) => {
      // Express writes `:id`; OpenAPI writes `{id}`.
      const path = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

      // One route serves all seven content collections, and the spec lists
      // them explicitly so the dashboard gets a concrete type per collection
      // (ADR-033). Expanded here, so both sides describe the same surface.
      if (path.includes('{collection}')) {
        return ADMIN_COLLECTIONS.map((collection) =>
          `${route.method} ${path.replace('{collection}', collection)}`.toLowerCase()
        );
      }

      return [`${route.method} ${path}`.toLowerCase()];
    });

    const undocumented = [...new Set(served)].filter((route) => !declared.has(route)).sort();

    expect(
      undocumented,
      `these routes are served but absent from openapi.yaml: ${undocumented.join(', ')}`
    ).toEqual([]);
  });
});
