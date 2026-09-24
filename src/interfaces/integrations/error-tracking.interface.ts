/**
 * Where unexpected failures are reported.
 *
 * Only genuine faults go here — a 500, an unhandled rejection — never a
 * validation error or a 404, which are the API working correctly. The payload
 * follows the same rule as the logs: no request bodies, no personal data.
 */

export interface TrackedError {
  readonly error: unknown;
  /** Correlates the report with the log line for the same request. */
  readonly requestId?: string | undefined;
  /** Route pattern, never the concrete path: an id can be personal data. */
  readonly route?: string | undefined;
  readonly method?: string | undefined;
}

export interface IErrorTracker {
  readonly name: string;
  /** Fire and forget by contract: reporting must never fail a request. */
  capture(event: TrackedError): void;
}
