import { config } from '../../config/env.js';
import { noopVirusScanner } from './noop.driver.js';
import { createClamAvScanner } from './clamav.driver.js';
import type { IVirusScanner } from '../../interfaces/integrations/virus-scan.interface.js';

/** Picks the scanner from config. */
export function createVirusScanner(): IVirusScanner {
  if (config.VIRUS_SCAN_DRIVER === 'clamav' && config.CLAMAV_HOST !== undefined) {
    return createClamAvScanner(config.CLAMAV_HOST, config.CLAMAV_PORT);
  }

  return noopVirusScanner;
}
