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

/**
 * Would this change leave the firm with no way in?
 *
 * Demoting or deactivating the last administrator locks the firm out of its
 * own dashboard, and the only remedy is a developer with database access. It
 * is an easy mistake to make while tidying up accounts, so it is refused.
 */
async function wouldRemoveLastAdmin(id: string, input: UpdateUserInput): Promise<boolean> {
  const losingAdmin =
    input.isActive === false || (input.roles !== undefined && !input.roles.includes('admin'));

  if (!losingAdmin) return false;

  const target = await User.findById(id).select('roles isActive').lean<IUser | null>();
  if (!target?.roles.includes('admin') || !target.isActive) return false;

  const others = await User.countDocuments({
    _id: { $ne: target._id },
    roles: 'admin',
    isActive: true,
  });

  return others === 0;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<IUser> {
  if (await wouldRemoveLastAdmin(id, input)) {
    throw new ConflictError(
      'This is the only active administrator. Promote another account before changing this one.',
      [{ path: 'roles', message: 'the last administrator cannot be removed' }]
    );
  }

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
