import { vi } from 'vitest';
import { logger } from '../../src/core/logger.js';

/**
 * Captures everything the logger writes, so a test can assert on it.
 *
 * Pino writes to stdout, so stdout is what is intercepted — the alternative,
 * inspecting a mock logger, would prove the call site passed the right object
 * and say nothing about what redaction actually emitted. Here the assertion is
 * on the bytes that would have left the process.
 */
export interface CapturedLogs {
  /** Everything written since the capture began; also restores stdout. */
  release: () => string;
}

export function captureLogs(level = 'info'): CapturedLogs {
  const written: string[] = [];

  // The suite runs at `silent`, so a capture has to turn logging on or it
  // would assert that nothing leaked by arranging for nothing to be written.
  const previousLevel = logger.level;
  logger.level = level;

  const spy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array): boolean => {
      written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });

  return {
    release: (): string => {
      spy.mockRestore();
      logger.level = previousLevel;
      return written.join('');
    },
  };
}
