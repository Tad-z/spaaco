import { describe, expect, it } from 'vitest';
import type { Response } from 'supertest';
import { expectToMatchContract } from '../support/contract.js';

/**
 * The contract helper is the thing every endpoint test leans on, so its failure
 * modes are tested directly.
 *
 * The important cases are not "does a good response pass" but "does a bad one
 * actually fail": a helper that silently passes on a typo'd path, an
 * undeclared status or a malformed body would make every test using it read as
 * covered while asserting nothing at all.
 */

/** A minimal stand-in for a Supertest response. */
const fakeResponse = (status: number, body: unknown, contentType = 'application/json'): Response =>
  ({ status, body, headers: { 'content-type': contentType } }) as unknown as Response;

const validHealth = { data: { status: 'ok', db: 'up', version: '0.1.0' } };

describe('expectToMatchContract', () => {
  it('passes for a response that matches the spec', () => {
    expect(() => {
      expectToMatchContract(fakeResponse(200, validHealth), 'get', '/api/v1/health');
    }).not.toThrow();
  });

  it('fails when the body has an extra field the spec does not allow', () => {
    const body = { data: { ...validHealth.data, uptime: 1234 } };

    expect(() => {
      expectToMatchContract(fakeResponse(200, body), 'get', '/api/v1/health');
    }).toThrow(/does not match the contract/);
  });

  it('fails when a required field is missing', () => {
    const body = { data: { status: 'ok', db: 'up' } };

    expect(() => {
      expectToMatchContract(fakeResponse(200, body), 'get', '/api/v1/health');
    }).toThrow(/does not match the contract/);
  });

  it('fails when a field has the wrong type', () => {
    const body = { data: { ...validHealth.data, version: 1 } };

    expect(() => {
      expectToMatchContract(fakeResponse(200, body), 'get', '/api/v1/health');
    }).toThrow(/does not match the contract/);
  });

  it('fails when an enum value is outside the spec', () => {
    const body = { data: { ...validHealth.data, db: 'maybe' } };

    expect(() => {
      expectToMatchContract(fakeResponse(200, body), 'get', '/api/v1/health');
    }).toThrow(/does not match the contract/);
  });

  it('fails loudly on a path the spec does not have, rather than passing silently', () => {
    expect(() => {
      expectToMatchContract(fakeResponse(200, validHealth), 'get', '/api/v1/heath');
    }).toThrow(/has no "GET \/api\/v1\/heath"/);
  });

  it('fails when the /api/v1 prefix is left off the path', () => {
    expect(() => {
      expectToMatchContract(fakeResponse(200, validHealth), 'get', '/health');
    }).toThrow(/has no "GET \/health"/);
  });

  it('fails on a method the operation does not define', () => {
    expect(() => {
      expectToMatchContract(fakeResponse(200, validHealth), 'post', '/api/v1/health');
    }).toThrow(/has no "POST \/api\/v1\/health"/);
  });

  it('fails on a status the spec never declares', () => {
    expect(() => {
      expectToMatchContract(fakeResponse(418, validHealth), 'get', '/api/v1/health');
    }).toThrow(/responded 418, which openapi\.yaml does not declare/);
  });

  it('fails when a JSON response is not served as JSON', () => {
    expect(() => {
      expectToMatchContract(fakeResponse(200, validHealth, 'text/html'), 'get', '/api/v1/health');
    }).toThrow();
  });

  it('validates declared error responses too', () => {
    const notFound = { error: { code: 'NOT_FOUND', message: 'Insight not found' } };

    expect(() => {
      expectToMatchContract(fakeResponse(404, notFound), 'get', '/api/v1/insights/{slug}');
    }).not.toThrow();

    expect(() => {
      expectToMatchContract(
        fakeResponse(404, { error: { code: 'NOPE', message: 'x' } }),
        'get',
        '/api/v1/insights/{slug}'
      );
    }).toThrow(/does not match the contract/);
  });
});
