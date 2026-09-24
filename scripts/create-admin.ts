#!/usr/bin/env tsx
/**
 * Creates the first administrator.
 *
 * The only way an account comes into being without an existing admin, so it is
 * a deliberate CLI step rather than anything reachable over HTTP. The new user
 * enrols their own authenticator on first sign-in; two-factor is required
 * before they can touch any other admin route.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { connectDatabase, disconnectDatabase } from '../src/core/db.js';
import { logger } from '../src/core/logger.js';
import { User } from '../src/models/index.js';
import { hashPassword } from '../src/services/auth.service.js';
import { USER_ROLES } from '../src/constants/enums.js';
import type { UserRole } from '../src/types/api.js';

const MIN_PASSWORD_LENGTH = 12;

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    await connectDatabase();

    const name = (await rl.question('Name: ')).trim();
    const email = (await rl.question('Email: ')).trim().toLowerCase();
    const password = (await rl.question('Password (min 12 characters): ')).trim();
    const rolesInput = (
      await rl.question(`Roles [${USER_ROLES.values.join(', ')}] (default: admin): `)
    ).trim();

    if (name.length < 2) throw new Error('Name must be at least 2 characters.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That is not a valid email.');
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${String(MIN_PASSWORD_LENGTH)} characters.`);
    }

    const roles: UserRole[] =
      rolesInput === '' ? ['admin'] : rolesInput.split(',').map((role) => role.trim() as UserRole);

    const unknown = roles.filter((role) => !USER_ROLES.values.includes(role));
    if (unknown.length > 0) throw new Error(`Unknown roles: ${unknown.join(', ')}`);

    if (await User.exists({ email })) {
      throw new Error(`An account already exists for ${email}.`);
    }

    const user = await User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
      roles,
    });

    logger.info({ id: user._id.toString(), roles }, 'admin user created');
    stdout.write(
      `\nCreated ${email} with roles: ${roles.join(', ')}.\n` +
        `Sign in to the dashboard and enrol an authenticator: two-factor is required\n` +
        `before any other admin route will answer.\n`
    );
  } finally {
    rl.close();
    await disconnectDatabase();
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'failed to create the admin user');
  stdout.write(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
