---
paths:
  - "src/routes/**"
  - "src/controllers/**"
  - "src/services/**"
  - "src/serializers/**"
  - "src/validators/**"
  - "src/middlewares/**"
---

# Layer rules

Full table: `docs/ARCHITECTURE.md` → "Layer rules". The short version:

- **routes/**: wire paths to `validate(...)`, auth middlewares and a controller. No logic. Public and admin routers live in separate files (`routes/public/x.routes.ts`, `routes/admin/x.routes.ts`) and are mounted only in `routes/index.ts`.
- **controllers/**: read `req.validated`, call ONE service method, serialize the result, and send `{ data }` or `{ data, meta }`. Never import models or integrations. Express 5 forwards rejected promises, so don't use try/catch just to call `next`.
- **services/**: all business logic and DB access. They take plain arguments and return lean documents, never `req`/`res`. Public reads take `{ preview }` and apply `publishedFilter(preview)` from `helpers/`. Throw `NotFoundError`/`ConflictError` from `core/errors.ts`.
- **After every admin write**, the service calls `cacheService.invalidate(tagsFor(entity, doc))` and, for publish, unpublish and delete, `auditService.record(...)`.
- **Admin PUT/PATCH** check the revision atomically with `findOneAndUpdate({ _id, revision: expected }, { …, $inc: { revision: 1 } })` and throw `ConflictError` when nothing matches.
- **serializers/**: pure functions, with no I/O and no DB. Provide `toSummary` / `toDetail` for public responses and `toAdmin(doc, expanded)` for admin ones. Return types come from `types/api.ts`, so the compiler enforces the contract.
- **validators/**: Zod schemas only. Export the schemas and their inferred types. Update bodies are `createBody.partial()` unless a field must stay required.
- **middlewares/**: cross-cutting concerns only (auth, roles, validation, rate limits, headers, errors). No resource-specific logic.
- One file per resource per layer, named `<resource>.<role>.ts`. If a file passes ~300 lines, split it by responsibility (for example `services/pages/composers/`).
