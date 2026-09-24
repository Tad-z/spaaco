import { config } from '../config/env.js';
import { logger } from '../core/logger.js';
import { User } from '../models/index.js';
import { hashPassword } from './auth.service.js';
import type { UserRole } from '../types/api.js';

/**
 * The four role accounts, created at first boot.
 *
 * There is no sign-up and no invitation flow: this is a private dashboard for
 * one firm, with one account per job (ADR-043). Each is created from a
 * password in the deployment's environment, so nothing secret lives in the
 * repository and rotating one is an environment change plus a restart.
 *
 * An account whose password variable is unset is simply not created — the API
 * still starts, and the firm can add the variable later. What this will never
 * do is invent a password: an account nobody chose the credentials for is an
 * account nobody knows is there.
 */

interface RoleAccount {
  readonly username: string;
  readonly name: string;
  readonly role: UserRole;
  readonly password: string | undefined;
  /** Which environment variable supplies the password, for the log message. */
  readonly variable: string;
}

/**
 * Where the passwords come from.
 *
 * Injectable because `config` is frozen when the module loads, so a test
 * cannot vary it through `process.env` — and the behaviour worth testing here
 * is exactly what happens when one of these is missing.
 */
export interface RolePasswords {
  readonly ADMIN_PASSWORD?: string | undefined;
  readonly EDITOR_PASSWORD?: string | undefined;
  readonly HR_PASSWORD?: string | undefined;
  readonly BIZDEV_PASSWORD?: string | undefined;
}

const accounts = (passwords: RolePasswords): RoleAccount[] => [
  {
    username: 'admin',
    name: 'Administrator',
    role: 'admin',
    password: passwords.ADMIN_PASSWORD,
    variable: 'ADMIN_PASSWORD',
  },
  {
    username: 'editor',
    name: 'Website Editor',
    role: 'editor',
    password: passwords.EDITOR_PASSWORD,
    variable: 'EDITOR_PASSWORD',
  },
  {
    username: 'hr',
    name: 'Human Resources',
    role: 'hr',
    password: passwords.HR_PASSWORD,
    variable: 'HR_PASSWORD',
  },
  {
    username: 'business_dev',
    name: 'Business Development',
    role: 'business_dev',
    password: passwords.BIZDEV_PASSWORD,
    variable: 'BIZDEV_PASSWORD',
  },
];

export interface BootstrapResult {
  readonly created: string[];
  readonly skipped: string[];
}

/**
 * Create any role account that does not exist yet.
 *
 * Deliberately *not* an upsert: an existing account is left alone, password
 * and all. Otherwise every restart would silently reset a password the firm
 * had changed, and `credentialsChangedAt` would invalidate their sessions for
 * no reason they could see.
 */
export async function ensureRoleAccounts(
  passwords: RolePasswords = config
): Promise<BootstrapResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const account of accounts(passwords)) {
    if (await User.exists({ username: account.username })) continue;

    if (account.password === undefined || account.password.trim() === '') {
      skipped.push(`${account.username} (${account.variable} is not set)`);
      continue;
    }

    await User.create({
      username: account.username,
      name: account.name,
      // Set by whoever holds the account, from the dashboard. Until then this
      // role's notifications have nowhere to go, which is logged when one is
      // due rather than failing the submission.
      email: null,
      passwordHash: await hashPassword(account.password),
      roles: [account.role],
    });

    created.push(account.username);
  }

  if (created.length > 0) logger.info({ created }, 'created the role accounts');
  if (skipped.length > 0) logger.warn({ skipped }, 'some role accounts were not created');

  return { created, skipped };
}
