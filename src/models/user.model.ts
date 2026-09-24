import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IUser } from '../interfaces/user.interface.js';
import { USER_ROLES } from '../constants/enums.js';

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    // select: false, so a stray query cannot pull the hash into a payload.
    passwordHash: { type: String, required: true, select: false },
    roles: {
      type: [{ type: String, enum: USER_ROLES.values }],
      required: true,
      validate: {
        validator: (value: string[]): boolean => value.length > 0,
        message: 'a user needs at least one role',
      },
    },
    totp: {
      secretEncrypted: { type: String, default: null, select: false },
      enabled: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    credentialsChangedAt: { type: Date, default: null },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true, strict: 'throw' }
);

userSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const { _id, __v, passwordHash, totp, ...rest } = ret;
    return { ...rest, id: _id.toHexString(), totpEnabled: totp.enabled };
  },
});

export const User: Model<IUser> = model<IUser>('User', userSchema);
