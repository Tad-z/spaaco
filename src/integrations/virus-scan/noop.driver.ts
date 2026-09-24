import type {
  IVirusScanner,
  ScanVerdict,
} from '../../interfaces/integrations/virus-scan.interface.js';

/**
 * The credential-free default: everything is clean.
 *
 * Honest about what it is — a stand-in so the upload path can be built and
 * tested without a ClamAV daemon. `config/env.ts` does not force `clamav` in
 * production, because a firm may reasonably scan at the storage layer instead;
 * see the deployment notes.
 */
export const noopVirusScanner: IVirusScanner = {
  name: 'noop',

  scan(): Promise<ScanVerdict> {
    return Promise.resolve('clean');
  },
};
