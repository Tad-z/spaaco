---
paths:
  - 'src/models/**/*.ts'
  - 'src/interfaces/**/*.ts'
---

# Model and interface rules

- Each collection has an interface in `interfaces/<resource>.interface.ts` (`IPracticeArea`) and a model in `models/<resource>.model.ts`, built as `new Schema<IPracticeArea>(…)` and `model<IPracticeArea>('PracticeArea', schema)`.
- In interfaces, ObjectId references are `Types.ObjectId` (or `Types.ObjectId[]`). Populated shapes are typed at the call site: `.populate<{ image: IMedia }>('image')`.
- Content collections extend `IContentFields` and apply `contentPlugin` (slug, status, order, publishedAt, revision, createdBy/updatedBy).
- Schema options: `{ timestamps: true, strict: 'throw' }`.
- Declare every index from `docs/DATA_MODEL.md` in the model file. `scripts/sync-indexes.ts` applies them at deploy time; don't rely on autoIndex in production.
- Enum values come from `constants/enums.ts` (`as const` objects with `values` and `labels`). Never inline enum arrays.
- A media reference is `{ type: Schema.Types.ObjectId, ref: 'Media' }` and **must** be added to `constants/media-refs.ts` in the same change. A test fails otherwise.
- Locations are GeoJSON `{ type: 'Point', coordinates: [lng, lat] }` with a `2dsphere` index.
- Don't store display strings (displayName, roleLabel). Serializers compute them.
