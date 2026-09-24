import { z } from 'zod';
import { USER_ROLES } from '../constants/enums.js';
import { pagination } from './common.validator.js';

const password = z.string().min(12, 'must be at least 12 characters').max(200);

/** The role name, which is the login identifier (ADR-043). */
const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9_-]*$/, 'must be a username, not an email address');

export const loginBody = z.object({
  username,
  password: z.string().min(1).max(200),
});

/**
 * What the holder of an account may change about themselves.
 *
 * Not their roles and not their activation: those belong to an administrator,
 * and an account that could grant itself a role would make the whole matrix
 * decorative.
 */
export const profileUpdateBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  });

export const passwordChangeBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

export const createUserBody = z.object({
  username,
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
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
  actor: z
    .string()
    .regex(/^[0-9a-f]{24}$/i)
    .optional(),
});

export type LoginBody = z.infer<typeof loginBody>;
export type CreateUserBody = z.infer<typeof createUserBody>;
export type UpdateUserBody = z.infer<typeof updateUserBody>;
