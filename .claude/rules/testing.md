---
paths:
  - "tests/**/*.ts"
---

# Testing rules (Vitest)

The suite runs on every task, so its speed is a feature. Prove each behaviour
**once, in the cheapest place that proves it**. Duplicated coverage slows every
future task without catching anything new.

## Harness

- Use `buildTestApp()` and `setupTestDb()` from `tests/support/`. Tests run against real Mongoose models on mongodb-memory-server; don't mock the DB.
- **One mongod is started once, in `globalSetup`, and shared by the whole run.** Each Vitest worker gets its own database on that server, so files stay isolated without paying a server start each. Never call `MongoMemoryServer.create()` in a test file, and never drop or recreate the database per file — `setupTestDb()` clears collections in `afterEach`, which keeps indexes intact.
- Mock only at integration boundaries (mailer, storage, captcha, virus-scan, revalidate) by passing noop/log drivers or `vi.fn()` spies through `buildTestApp({ deps })`.
- Build test data with `tests/support/factories.ts` (`makePerson({ role: 'partner' })`).

## What to cover, and where

- Every successful response in an integration test calls `expectToMatchContract(res, 'get', '/api/v1/pages/{key}')`.
- **Per endpoint, exactly:** the happy path with a contract assertion, one validation error (400), and a 404 where the endpoint can produce one. Add more only for logic genuinely unique to that endpoint (a sort order, a computed field, a filter's semantics).
- **Draft exclusion:** once per public resource, not once per endpoint.
- **Role enforcement (401/403):** only in `tests/integration/admin/roles.test.ts`, one table-driven test over every admin route × role, checked against the matrix in `docs/API.md`. Do not repeat it in a resource's own test file.
- **The generic CRUD factory:** tested thoroughly once, on its own. Each content collection then gets a single admin smoke test — create → update with `If-Match` → publish → public read.
- Unit tests for helpers and serializers live in `tests/unit/`, mirroring `src/`.

## Style

- Name tests by behaviour: `it('excludes draft insights from the listing')`.
- Don't snapshot API payloads.
- Tests are independent: never rely on order, and never leak state between files.
- A test that cannot fail is worse than no test. When a helper or assertion is doing the real work, prove it bites — feed it a deliberately wrong value and assert it throws.

## Running them

- While working a task, run only what you touched, plus lint and typecheck:
  ```bash
  npx vitest run tests/integration/public/people.test.ts
  npm run lint && npm run typecheck
  ```
- Run the full `npm run check` at the end of each phase.
