import { describe, expect, it } from 'vitest';
import { ConfigError, parseEnv } from '../../../src/config/env.js';
import { MINIMAL_VALID_ENV } from '../../support/test-env.js';

/**
 * Configuration is validated once, at startup. These tests pin the two things
 * that matter: a valid environment produces the right typed values, and an
 * invalid one fails immediately with a message naming every problem — not a
 * single first error, and not an `undefined` surfacing later in a request.
 */

const withEnv = (
  overrides: Record<string, string | undefined>
): Record<string, string | undefined> => ({
  ...MINIMAL_VALID_ENV,
  ...overrides,
});

/** Run the parser and return the ConfigError it threw. */
const expectConfigError = (source: Record<string, string | undefined>): ConfigError => {
  try {
    parseEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return error as ConfigError;
  }
  throw new Error('expected parseEnv to throw, but it returned a config');
};

describe('parseEnv', () => {
  describe('a valid environment', () => {
    it('parses the minimum set of required variables', () => {
      const config = parseEnv(withEnv({}));

      expect(config.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/spa-ajibade');
      expect(config.NODE_ENV).toBe('development');
    });

    it('applies documented defaults for anything omitted', () => {
      const config = parseEnv(withEnv({}));

      expect(config.PORT).toBe(4000);
      expect(config.JWT_ACCESS_TTL).toBe('15m');
      expect(config.REFRESH_TOKEN_TTL_DAYS).toBe(14);
      expect(config.RETENTION_ENQUIRY_DAYS).toBe(730);
      expect(config.RETENTION_APPLICATION_DAYS).toBe(365);
      expect(config.LOG_LEVEL).toBe('info');
    });

    it('defaults every integration to its credential-free driver', () => {
      const config = parseEnv(withEnv({}));

      expect(config.STORAGE_PUBLIC_DRIVER).toBe('local');
      expect(config.STORAGE_PRIVATE_DRIVER).toBe('local');
      expect(config.MAILER_DRIVER).toBe('log');
      expect(config.CAPTCHA_DRIVER).toBe('noop');
      expect(config.VIRUS_SCAN_DRIVER).toBe('noop');
      expect(config.REVALIDATE_DRIVER).toBe('noop');
    });

    it('coerces numeric variables from their string form', () => {
      const config = parseEnv(withEnv({ PORT: '8080', RETENTION_APPLICATION_DAYS: '90' }));

      expect(config.PORT).toBe(8080);
      expect(config.RETENTION_APPLICATION_DAYS).toBe(90);
    });

    it('splits CORS_ORIGINS into a trimmed list', () => {
      const config = parseEnv(
        withEnv({ CORS_ORIGINS: 'https://spaajibade.com, https://admin.spaajibade.com ' })
      );

      expect(config.CORS_ORIGINS).toEqual([
        'https://spaajibade.com',
        'https://admin.spaajibade.com',
      ]);
    });

    it('treats a blank optional variable as absent rather than an empty string', () => {
      const config = parseEnv(withEnv({ SENTRY_DSN: '', CLOUDINARY_URL: '  ' }));

      expect(config.SENTRY_DSN).toBeUndefined();
      expect(config.CLOUDINARY_URL).toBeUndefined();
    });

    it('returns a frozen object, so nothing can mutate config at runtime', () => {
      const config = parseEnv(withEnv({}));

      expect(Object.isFrozen(config)).toBe(true);
    });
  });

  describe('an invalid environment', () => {
    it('rejects a missing MONGODB_URI and names it', () => {
      const error = expectConfigError(withEnv({ MONGODB_URI: undefined }));

      expect(error.issues.join('\n')).toContain('MONGODB_URI');
    });

    it('rejects a JWT secret shorter than 32 characters', () => {
      const error = expectConfigError(withEnv({ JWT_ACCESS_SECRET: 'too-short' }));

      expect(error.issues.join('\n')).toContain('JWT_ACCESS_SECRET must be at least 32 characters');
    });

    it('rejects an ENCRYPTION_KEY that is not 32 bytes of hex', () => {
      const error = expectConfigError(withEnv({ ENCRYPTION_KEY: 'not-hex' }));

      expect(error.issues.join('\n')).toContain('ENCRYPTION_KEY must be 64 hex characters');
    });

    it('rejects an unknown NODE_ENV', () => {
      const error = expectConfigError(withEnv({ NODE_ENV: 'staging-2' }));

      expect(error.issues.join('\n')).toContain('NODE_ENV');
    });

    it('reports every problem at once, not just the first', () => {
      const error = expectConfigError(
        withEnv({ MONGODB_URI: undefined, JWT_ACCESS_SECRET: 'short', ENCRYPTION_KEY: 'nope' })
      );

      expect(error.issues.length).toBeGreaterThanOrEqual(3);
      const joined = error.issues.join('\n');
      expect(joined).toContain('MONGODB_URI');
      expect(joined).toContain('JWT_ACCESS_SECRET');
      expect(joined).toContain('ENCRYPTION_KEY');
    });

    it('puts every issue in the thrown message, so a failed boot is readable', () => {
      const error = expectConfigError(withEnv({ JWT_ACCESS_SECRET: 'short' }));

      expect(error.message).toContain('Invalid environment configuration');
      expect(error.message).toContain('JWT_ACCESS_SECRET');
    });
  });

  describe('drivers that need credentials', () => {
    it('rejects the cloudinary driver without CLOUDINARY_URL', () => {
      const error = expectConfigError(withEnv({ STORAGE_PUBLIC_DRIVER: 'cloudinary' }));

      expect(error.issues.join('\n')).toContain(
        'CLOUDINARY_URL is required when STORAGE_PUBLIC_DRIVER is "cloudinary"'
      );
    });

    it('accepts the cloudinary driver once CLOUDINARY_URL is set', () => {
      const config = parseEnv(
        withEnv({
          STORAGE_PUBLIC_DRIVER: 'cloudinary',
          CLOUDINARY_URL: 'cloudinary://key:secret@cloud',
        })
      );

      expect(config.STORAGE_PUBLIC_DRIVER).toBe('cloudinary');
    });

    it('names every missing S3 variable, not just the first', () => {
      const error = expectConfigError(withEnv({ STORAGE_PRIVATE_DRIVER: 's3' }));
      const joined = error.issues.join('\n');

      expect(joined).toContain('S3_BUCKET_PRIVATE');
      expect(joined).toContain('S3_REGION');
      expect(joined).toContain('S3_ACCESS_KEY_ID');
      expect(joined).toContain('S3_SECRET_ACCESS_KEY');
    });

    it('rejects the turnstile, clamav, resend and http drivers without their secrets', () => {
      for (const [field, driver, missing] of [
        ['CAPTCHA_DRIVER', 'turnstile', 'TURNSTILE_SECRET_KEY'],
        ['VIRUS_SCAN_DRIVER', 'clamav', 'CLAMAV_HOST'],
        ['MAILER_DRIVER', 'resend', 'RESEND_API_KEY'],
        ['REVALIDATE_DRIVER', 'http', 'FRONTEND_REVALIDATE_URL'],
      ] as const) {
        const error = expectConfigError(withEnv({ [field]: driver }));
        expect(error.issues.join('\n')).toContain(missing);
      }
    });
  });

  describe('production hardening', () => {
    const productionEnv = {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://user:pass@cluster/spa-ajibade',
      JWT_ACCESS_SECRET: 'a-real-production-secret-of-good-length',
      ENCRYPTION_KEY: 'c'.repeat(64),
      IP_HASH_SALT: 'a-real-production-salt-value',
      // Production refuses every dev-only driver: the local ones write files
      // nothing serves, `noop` calls every CV clean, and `log` sends no mail.
      STORAGE_PUBLIC_DRIVER: 'cloudinary',
      CLOUDINARY_URL: 'cloudinary://key:secret@spa-ajibade',
      STORAGE_PRIVATE_DRIVER: 's3',
      S3_BUCKET_PRIVATE: 'spa-ajibade-cvs',
      S3_REGION: 'eu-west-1',
      S3_ACCESS_KEY_ID: 'AKIAEXAMPLE',
      S3_SECRET_ACCESS_KEY: 'a-real-looking-secret-access-key',
      VIRUS_SCAN_DRIVER: 'clamav',
      CLAMAV_HOST: 'clamav.internal',
      MAILER_DRIVER: 'resend',
      RESEND_API_KEY: 're_example_key',
    };

    it('accepts real secrets', () => {
      const config = parseEnv(productionEnv);

      expect(config.NODE_ENV).toBe('production');
    });

    it('refuses the local image driver in production, which would store dead URLs', () => {
      const error = expectConfigError({
        ...productionEnv,
        STORAGE_PUBLIC_DRIVER: 'local',
        CLOUDINARY_URL: undefined,
      });

      expect(error.issues.join('\n')).toContain('STORAGE_PUBLIC_DRIVER');
    });

    it.each([
      ['STORAGE_PRIVATE_DRIVER', 'local'],
      ['VIRUS_SCAN_DRIVER', 'noop'],
      ['MAILER_DRIVER', 'log'],
    ])('refuses the dev-only %s=%s in production', (field, value) => {
      const error = expectConfigError({ ...productionEnv, [field]: value });

      expect(error.issues.join('\n')).toContain(field);
    });

    it('refuses the .env.example placeholder secret in production', () => {
      const error = expectConfigError({
        ...productionEnv,
        JWT_ACCESS_SECRET: 'change-me-change-me-change-me-32',
      });

      expect(error.issues.join('\n')).toContain('still holds the .env.example placeholder');
    });

    it('refuses an all-zero ENCRYPTION_KEY in production', () => {
      const error = expectConfigError({ ...productionEnv, ENCRYPTION_KEY: '0'.repeat(64) });

      expect(error.issues.join('\n')).toContain('ENCRYPTION_KEY');
    });

    it('allows the same placeholders outside production, so local dev still boots', () => {
      const config = parseEnv({
        ...productionEnv,
        NODE_ENV: 'development',
        JWT_ACCESS_SECRET: 'change-me-change-me-change-me-32',
        ENCRYPTION_KEY: '0'.repeat(64),
      });

      expect(config.NODE_ENV).toBe('development');
    });
  });
});
