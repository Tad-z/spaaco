---
name: new-resource
description: Scaffold a new API resource across every layer (interface, model, validator, service, serializer, public/admin controllers and routes, tests), following this repo's TypeScript layered structure. Use whenever a roadmap task introduces a new collection or endpoint group, such as practice-areas, people, insights, offices, jobs, faqs, recognitions, media, enquiries, messages or applications, even if the user just says "add the X endpoints".
argument-hint: "<resource-name in kebab-case, singular, e.g. practice-area>"
---

# Scaffold resource `$ARGUMENTS`

Every resource should look identical across the layers. Then any session can find anything, and deviations stand out in review.

## Before creating files
1. Find the collection in `docs/DATA_MODEL.md` and its endpoints in `openapi/openapi.yaml`. If the endpoints aren't in the spec yet, add them first, then run `npm run types:gen`.
2. Open the most complete existing resource and mirror its structure, naming and style exactly.

## Files (create only the ones the task needs)
| File | Contents |
|---|---|
| `src/interfaces/$ARGUMENTS.interface.ts` | `I<Name>` for the stored document (extends `IContentFields` for content collections). |
| `src/models/$ARGUMENTS.model.ts` | `new Schema<I<Name>>`, `contentPlugin` where applicable, all indexes, exported model. |
| `src/validators/$ARGUMENTS.validator.ts` | Zod `listQuery`, `slugParams`/`idParams`, `createBody`, `updateBody`, plus exported inferred types. |
| `src/services/$ARGUMENTS.service.ts` | Public `list`/`getBySlug({ preview })` and admin `create/update/remove/publish/unpublish/reorder`, with revision checks, cache invalidation and audit. |
| `src/serializers/$ARGUMENTS.serializer.ts` | `toSummary`/`toDetail`/`toAdmin`, with return types from `types/api.ts`. |
| `src/controllers/public/$ARGUMENTS.controller.ts` | Thin handlers. |
| `src/controllers/admin/$ARGUMENTS.controller.ts` | Thin handlers (if the task covers admin). |
| `src/routes/public/$ARGUMENTS.routes.ts` | `validate(...)` on each route; `optionalPreviewAuth` on reads. |
| `src/routes/admin/$ARGUMENTS.routes.ts` | `requireAuth`, `requireRole(...)` per the role matrix in `docs/API.md`, and `ifMatch` on PUT/PATCH. |

Then:
- Mount the routers in `src/routes/index.ts`.
- Add a type alias in `src/types/api.ts` for any new spec schema.
- Add a factory in `tests/support/factories.ts`.
- Add cache tags in `src/constants/cache-tags.ts`, and register any media fields in `src/constants/media-refs.ts`.
- Add tests:
  - `tests/integration/public/$ARGUMENTS.test.ts`: happy path + contract assertion, 400, 404, draft exclusion.
  - `tests/integration/admin/$ARGUMENTS.test.ts`: CRUD, 401/403 per role, stale `If-Match` → 409, and a GET → PUT round-trip.

## Finish
Run `npm run check`. Report the files created and anything the spec or DATA_MODEL left unspecified, where you had to choose.
