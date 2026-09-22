import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IGeoPoint, IOffice } from '../interfaces/office.interface.js';
import { contentPlugin } from './plugins/content.plugin.js';

const geoPointSchema = new Schema<IGeoPoint>(
  {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    // GeoJSON order is [longitude, latitude]; the API serialises { lat, lng }
    // instead, because reversed pairs are a classic frontend bug (ADR-020).
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value: number[]): boolean =>
          value.length === 2 &&
          value[0] !== undefined &&
          value[1] !== undefined &&
          value[0] >= -180 &&
          value[0] <= 180 &&
          value[1] >= -90 &&
          value[1] <= 90,
        message: 'coordinates must be [longitude, latitude] within valid ranges',
      },
    },
  },
  { _id: false, versionKey: false }
);

const officeSchema = new Schema<IOffice>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    address: { type: String, required: true, trim: true, maxlength: 400 },
    location: { type: geoPointSchema, default: null },
    directionsUrl: { type: String, default: null, trim: true, maxlength: 2048 },
    hours: { type: String, required: true, trim: true, maxlength: 200 },
    phone: { type: String, default: null, trim: true, maxlength: 40 },
    email: { type: String, default: null, trim: true, lowercase: true, maxlength: 254 },
  },
  { timestamps: true, strict: 'throw' }
);

officeSchema.plugin(contentPlugin, { source: 'name' });

officeSchema.index({ status: 1, order: 1 });
officeSchema.index({ location: '2dsphere' });

export const Office: Model<IOffice> = model<IOffice>('Office', officeSchema);
