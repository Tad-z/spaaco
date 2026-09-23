import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IRefreshToken } from '../interfaces/refresh-token.interface.js';

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: Schema.Types.ObjectId, ref: 'RefreshToken', default: null },
  },
  { timestamps: true, strict: 'throw' }
);

// Mongo removes expired tokens itself, so the collection cannot grow without
// bound and an abandoned session cannot be revived later.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken: Model<IRefreshToken> = model<IRefreshToken>(
  'RefreshToken',
  refreshTokenSchema
);
