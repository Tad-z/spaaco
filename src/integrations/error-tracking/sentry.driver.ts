import { randomUUID } from 'node:crypto';
import { logger } from '../../core/logger.js';
import type {
  IErrorTracker,
  TrackedError,
} from '../../interfaces/integrations/error-tracking.interface.js';

/**
 * Sentry, over its envelope API.
 *
 * No SDK, for the same reason as Cloudinary and S3: the SDK is a large
 * dependency that monkey-patches http, fs and the async hooks to build traces
 * nobody here has asked for, and what this project needs is "post the error
 * somewhere a human will see it". That is one request (ADR-038).
 *
 * The trade-off is real and worth stating: no breadcrumbs, no performance
 * tracing, no release health, and stack frames are not mapped through source
 * maps at Sentry's end. If the firm later wants those, this driver is the
 * thing to replace — the interface is one method.
 */

export interface SentryDsn {
  readonly publicKey: string;
  readonly host: string;
  readonly projectId: string;
  readonly protocol: string;
}

/** `https://<publicKey>@<host>/<projectId>` */
export function parseSentryDsn(value: string): SentryDsn {
  const url = new URL(value);
  const projectId = url.pathname.replace(/^\//, '');

  if (url.username === '' || projectId === '') {
    throw new Error('SENTRY_DSN must be https://<key>@<host>/<project_id>');
  }

  return {
    publicKey: url.username,
    host: url.host,
    projectId,
    protocol: url.protocol.replace(':', ''),
  };
}

/**
 * How much of a message may leave the building.
 *
 * An error message is not always ours. Mongoose quotes the offending value in
 * a validation message, a driver may quote a document, and either can carry a
 * name, an address or a matter summary — which would then sit in a
 * third-party processor's issue tracker. Truncating is a blunt control, but
 * the alternative is trusting every library's message template.
 */
const MESSAGE_MAX = 300;

const clamp = (value: string): string =>
  value.length <= MESSAGE_MAX ? value : `${value.slice(0, MESSAGE_MAX)}… [truncated]`;

/** What Sentry shows as the title of an issue. */
function describe(error: unknown): { type: string; value: string; stack?: string } {
  if (error instanceof Error) {
    return {
      type: error.name,
      value: clamp(error.message),
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }

  return {
    type: 'UnknownError',
    value: typeof error === 'string' ? clamp(error) : 'Non-Error thrown',
  };
}

/** Stack frames, newest last, as Sentry's `stacktrace.frames` wants them. */
function framesFrom(stack: string | undefined): { filename: string; function: string }[] {
  if (stack === undefined) return [];

  return stack
    .split('\n')
    .slice(1)
    .map((line) => /at (?<fn>[^(]+)\((?<file>[^)]+)\)/.exec(line.trim())?.groups)
    .filter((groups): groups is Record<string, string> => groups !== undefined)
    .map((groups) => ({
      filename: groups.file ?? 'unknown',
      function: (groups.fn ?? 'unknown').trim(),
    }))
    .reverse();
}

export function createSentryTracker(
  dsn: SentryDsn,
  environment: string,
  release: string,
  fetchImpl: typeof fetch = fetch
): IErrorTracker {
  const endpoint = `${dsn.protocol}://${dsn.host}/api/${dsn.projectId}/envelope/`;

  return {
    name: 'sentry',

    capture(event: TrackedError): void {
      const eventId = randomUUID().replace(/-/g, '');
      const sentAt = new Date().toISOString();
      const described = describe(event.error);

      const payload = {
        event_id: eventId,
        timestamp: sentAt,
        platform: 'node',
        level: 'error',
        environment,
        release,
        // Route pattern and request id only. A concrete path can carry an id
        // that identifies a person's submission.
        tags: {
          ...(event.route === undefined ? {} : { route: event.route }),
          ...(event.method === undefined ? {} : { method: event.method }),
        },
        ...(event.requestId === undefined ? {} : { extra: { requestId: event.requestId } }),
        exception: {
          values: [
            {
              type: described.type,
              value: described.value,
              stacktrace: { frames: framesFrom(described.stack) },
            },
          ],
        },
      };

      // An envelope is newline-delimited JSON: header, item header, item.
      const body = [
        JSON.stringify({ event_id: eventId, sent_at: sentAt }),
        JSON.stringify({ type: 'event' }),
        JSON.stringify(payload),
      ].join('\n');

      // Deliberately not awaited: a request must not wait on an error
      // reporter, and a reporter that is down must not turn one failure into
      // two.
      void fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-sentry-envelope',
          'x-sentry-auth': `Sentry sentry_version=7, sentry_client=spa-ajibade/1, sentry_key=${dsn.publicKey}`,
        },
        body,
      }).catch((error: unknown) => {
        logger.warn({ err: error }, 'could not report an error to Sentry');
      });
    },
  };
}
