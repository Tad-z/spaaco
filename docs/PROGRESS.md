# Progress

One line per completed roadmap task: what was built, and anything a later session
(or the firm) needs to know. Blockers are recorded here too, so a skipped task is
never silently lost.

## Phase 0: Contract and mocks

- **0.1 Scaffold the TypeScript repo** — package.json (ESM, Node ≥ 24, every CLAUDE.md script), strict tsconfig + build config, Vitest, Prettier, and an ESLint flat config whose `import/no-restricted-paths` zones implement the ARCHITECTURE.md layer table. The boundary rule is covered by `tests/unit/layer-boundaries.test.ts`, which lints a throwaway controller→model import and asserts it errors, so the rule can't silently stop matching. Notable: the rule needs `eslint-import-resolver-typescript`, because NodeNext imports are written `.js` while the file on disk is `.ts` — without it the zones match nothing and pass vacuously. sharp pinned to ≥ 0.35.4 (0.33 carries high-severity libvips advisories); `npm audit` is clean.
- **0.2 OpenAPI spec for the public API** — `openapi/openapi.yaml` (3.1) covering all 17 public operations, with 77 reusable component schemas, shared parameters and error responses; `npm run types:gen` emits `src/types/api.generated.ts` and `src/types/api.ts` aliases every schema. `npm run types:check` fails the build when the generated types drift from the spec. Notable: response examples are `$ref`s into `fixtures/responses/`, which Prism resolves but Redocly's `no-invalid-media-type-examples` cannot (it validates the literal `{$ref}` node), so that one rule is off and fixture/schema validation is done with ajv in the contract tests instead. Response fixtures landed in this commit because the spec cannot lint without them.
