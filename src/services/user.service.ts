import { User } from '../models/index.js';
import { ConflictError, NotFoundError } from '../core/errors.js';
import { toSkip } from '../helpers/pagination.helper.js';
import { hashPassword, revokeAllSessions } from './auth.service.js';
import type { IUser } from '../interfaces/user.interface.js';
import type { UserRole } from '../types/api.js';

/** Admin account management. Administrators only; the routes enforce that. */

export interface ListUsersOptions {
  readonly page: number;
  readonly pageSize: number;
}

export async function listUsers(
  options: ListUsersOptions
): Promise<{ items: IUser[]; total: number }> {
  const [items, total] = await Promise.all([
    User.find()
      .sort({ createdAt: -1 })
      .skip(toSkip(options.page, options.pageSize))
      .limit(options.pageSize)
      .lean<IUser[]>(),
    User.countDocuments(),
  ]);

  return { items, total };
}

export interface CreateUserInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly roles: UserRole[];
}

export async function createUser(input: CreateUserInput): Promise<IUser> {
  const email = input.email.toLowerCase();

  if (await User.exists({ email })) {
    throw new ConflictError('An account with that email already exists');
  }

  const created = await User.create({
    name: input.name,
    email,
    passwordHash: await hashPassword(input.password),
    roles: input.roles,
  });

  return created.toObject<IUser>();
}

export interface UpdateUserInput {
  readonly name?: string;
  readonly roles?: UserRole[];
  readonly isActive?: boolean;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<IUser> {
  const updated = await User.findByIdAndUpdate(id, input, {
    new: true,
    runValidators: true,
  }).lean<IUser | null>();

  if (!updated) throw new NotFoundError('User');

  // Deactivating must end the sessions the user already holds, or they keep
  // working until their refresh token happens to expire.
  if (input.isActive === false) await revokeAllSessions(updated._id);

  return updated;
}
