import { z } from 'zod';
import { USER_ROLES } from '../constants/enums.js';
import { pagination } from './common.validator.js';

const password = z.string().min(12, 'must be at least 12 characters').max(200);
const totpCode = z.string().regex(/^[0-9]{6}$/, 'must be a six-digit code');

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
  totp: totpCode.optional(),
});

export const totpEnableBody = z.object({ code: totpCode });

export const passwordChangeBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

export const createUserBody = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password,
  roles: z.array(z.enum(USER_ROLES.values)).min(1),
});

/** At least one field: an empty PATCH is a mistake, not a no-op. */
export const updateUserBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    roles: z.array(z.enum(USER_ROLES.values)).min(1),
    isActive: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' });

export const listAuditQuery = pagination.extend({
  action: z.string().trim().max(80).optional(),
  actor: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
});

export type LoginBody = z.infer<typeof loginBody>;
export type CreateUserBody = z.infer<typeof createUserBody>;
export type UpdateUserBody = z.infer<typeof updateUserBody>;
