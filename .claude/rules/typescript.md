---
paths:
  - 'src/**/*.ts'
  - 'scripts/**/*.ts'
  - 'tests/**/*.ts'
---

# TypeScript rules

- Strict mode is on, with `noUncheckedIndexedAccess`. Don't loosen tsconfig to make an error go away; fix the types.
- `any` is banned. For untrusted data use `unknown` and narrow it (usually with Zod). `as` casts are allowed only right after a runtime check, or for `.lean<T>()` results.
- Don't use `!` non-null assertions in `src/`. Handle the null (usually by throwing `NotFoundError`).
- Relative imports end in `.js`, even though the file is `.ts` (NodeNext resolution).
- Type-only imports use `import type { … }` (`verbatimModuleSyntax`).
- **Where types come from:**
  - **API response shapes:** `types/api.ts` aliases over `types/api.generated.ts`. Never hand-write a type for something the spec defines.
  - **Request shapes:** `z.infer<typeof schema>` from `validators/`.
  - **Stored document shapes:** `interfaces/*.interface.ts`, used as `Schema<IThing>` and `lean<Lean<IThing>>()`.
- Never edit `types/api.generated.ts`. Change `openapi.yaml`, then run `npm run types:gen`.
- Prefer `readonly` arrays and properties for config and constants. Build enums with `as const` objects rather than TS `enum`.
- Exported functions declare explicit return types. This matters most for services and serializers, where the return type _is_ the contract.
