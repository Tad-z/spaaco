---
name: contract-check
description: Audit the API contract. It finds spec paths without contract tests, fixtures that no longer validate, and implemented routes missing from openapi.yaml, then reports the drift. Use before handing work to the frontend, after any change to openapi/openapi.yaml, fixtures, or serializers, or when the user asks "is the API in sync with the spec?"
allowed-tools: Bash(npm run spec:lint) Bash(npm test -- tests/contract) Read Grep Glob
---

# Contract check

The frontend builds against `openapi/openapi.yaml`. Any gap between the spec, the fixtures and the running code shows up as a broken screen on their side, so this check looks for all three kinds of drift.

## Steps
0. Run `npm run spec:lint`, then `npm test -- tests/contract`, and note any failures.
1. **Spec → tests.** List every `paths` entry and method in `openapi/openapi.yaml`. For each one, grep `tests/` for an `expectToMatchContract(` call using that method and path. Record the ones that are missing.
2. **Code → spec.** List every route registered in `src/routes/**/*.routes.ts`, and flag routes that aren't in the spec. `/health` is exempt only if the spec omits it on purpose.
3. **Fixtures → spec.** Confirm that every file in `fixtures/responses/` is referenced by the spec and validates. Flag orphaned fixture files.
4. **Spec → types.** Run `npm run types:check` and confirm `src/types/api.generated.ts` is current.
5. **Seed → fixtures.** For each `/pages/:key`, confirm there is a test comparing the seeded output with its fixture.

## Report format
Give a short verdict first ("In sync", or "N issues"). Then give one table:

| Kind | Path/file | Problem | Suggested fix |

Don't modify files during this check. Offer to fix the issues afterwards as a separate step.
