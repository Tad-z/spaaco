import { pino } from 'pino';
import type { Logger, LoggerOptions } from 'pino';
import { config } from '../config/env.js';

/**
 * The application logger.
 *
 * This API handles enquiries, messages and job applications, so logs are a
 * genuine disclosure risk under the NDPA 2023. Redaction here is a backstop,
 * not the control: `.claude/rules/submissions.md` forbids logging request
 * bodies and personal fields in the first place. Both exist because either one
 * alone eventually fails.
 */

/**
 * Paths pino removes before anything is written.
 *
 * `req.body` goes wholesale: every form body is personal data, and listing the
 * fields individually would mean a new field silently leaking on the day it is
 * added. The named paths catch personal data passed as log context by mistake.
 */
export const REDACTED_PATHS = [
  // credentials in transit
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',

  // request payloads: always potentially personal
  'req.body',
  'body',
  '*.body',

  // secrets at rest or in flight
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'token',
  '*.token',
  'refreshToken',
  '*.refreshToken',
  'turnstileToken',
  '*.turnstileToken',
  'secretEncrypted',
  '*.secretEncrypted',
  'totp',
  '*.totp',

  // personal data
  'email',
  '*.email',
  // Mail recipients: an acknowledgement goes to the person who submitted the
  // form, so the address is personal data wherever it appears.
  'to',
  '*.to',
  'replyTo',
  '*.replyTo',
  'recipient',
  '*.recipient',
  'fullName',
  '*.fullName',
  'phone',
  '*.phone',
  'organization',
  '*.organization',
  'coverNote',
  '*.coverNote',
  'cv',
  '*.cv',
  'originalName',
  '*.originalName',
  'originalFilename',
  '*.originalFilename',

  // raw IPs: only the salted hash is ever stored, so never log the address
  'ip',
  '*.ip',
  'req.remoteAddress',
  'remoteAddress',
] as const;

const options: LoggerOptions = {
  level: config.LOG_LEVEL,
  redact: { paths: [...REDACTED_PATHS], censor: '[redacted]' },
  base: { env: config.NODE_ENV },
  // Log a stable field name and an ISO timestamp, so shipping logs elsewhere
  // does not need a translation layer.
  messageKey: 'msg',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
};

/**
 * Where log lines go.
 *
 * Pino's default destination resolves file descriptor 1 once, at construction.
 * Writing through this indirection instead keeps the target late-bound, which
 * has two benefits: tests can intercept what redaction actually emitted rather
 * than inspecting the arguments a call site passed, and every line is written
 * synchronously, so a crash cannot take the last few log lines with it.
 */
const destination = {
  write(chunk: string): void {
    process.stdout.write(chunk);
  },
};

export const logger: Logger = pino(options, destination);

/** A child logger tagged with the request id, used by the request-id middleware. */
export const requestLogger = (requestId: string): Logger => logger.child({ requestId });
