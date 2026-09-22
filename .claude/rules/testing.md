---
paths:
  - "tests/**/*.ts"
---

# Testing rules (Vitest)

- Use `buildTestApp()` and `setupTestDb()` from `tests/support/`. Tests run against real Mongoose models on mongodb-memory-server; don't mock the DB.
- Mock only at integration boundaries (mailer, storage, captcha, virus-scan, revalidate) by passing noop/log drivers or `vi.fn()` spies through `buildTestApp({ deps })`.
- Every successful response in an integration test calls `expectToMatchContract(res, 'get', '/pages/{key}')`.
- Build test data with `tests/support/factories.ts` (`makePerson({ role: 'partner' })`).
- For each endpoint, test: the happy path, 400, 404, draft exclusion, and for admin routes, 401 plus a 403 for each disallowed role.
- Name tests by behaviour: `it('excludes draft insights from the listing')`.
- Don't snapshot API payloads. Tests are independent: clear collections in `afterEach` and never rely on test order.
- Unit tests for helpers and serializers live in `tests/unit/`, mirroring `src/`.
