---
paths:
  - "openapi/**"
  - "fixtures/**"
---

# Contract rules

- OpenAPI 3.1. Put reusable shapes in `components/schemas`. Endpoints `$ref` them; never duplicate a shape inline.
- Every object schema sets `additionalProperties: false`, so contract tests catch accidental extra fields.
- Mark fields `required` unless they're genuinely optional. For nullable fields use `type: [string, 'null']`, and document when they are null.
- Every 200 response has an example that references a file in `fixtures/responses/` (`externalValue` or a `$ref`), so Prism serves realistic data.
- Fixtures use the real copy from `docs/SEED_CONTENT.md`. Don't use lorem ipsum. Use placeholder images from `https://placehold.co/`.
- Changing an existing field's name, type or requiredness is a **breaking change**. Add a DECISIONS.md entry and tell the user, so they can notify the frontend team.
- After any spec edit, run `npm run spec:lint`, then `npm run types:gen`, then `npm run typecheck`. Type errors in serializers show exactly which code the spec change affects.
- Name reusable schemas in PascalCase after what the UI calls them (`PracticeAreaCard`, `PersonSummary`, `InsightCard`). `types/api.ts` re-exports them under the same names.
