import type {
  IErrorTracker,
  TrackedError,
} from '../interfaces/integrations/error-tracking.interface.js';

/**
 * Where unexpected failures go.
 *
 * The holder lives in `core` because the error middleware is what reports, and
 * a middleware may not reach into `integrations`. The concrete driver is
 * injected at startup by `app.ts`, which can — so the dependency points inwards
 * and the default remains "report nowhere".
 */

const noop: IErrorTracker = {
  name: 'unconfigured',
  capture(): void {
    // The error middleware has already logged it; without a tracker
    // configured, that is the whole story.
  },
};

let tracker: IErrorTracker = noop;

export function setErrorTracker(next: IErrorTracker | undefined): void {
  tracker = next ?? noop;
}

/** Never throws: reporting a failure must not become a second failure. */
export function captureError(event: TrackedError): void {
  try {
    tracker.capture(event);
  } catch {
    // Deliberately silent. The logger has the error either way, and there is
    // nowhere left to report a failure of the thing that reports failures.
  }
}
