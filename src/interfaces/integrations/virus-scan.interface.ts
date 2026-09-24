/**
 * Malware scanning for uploaded files.
 *
 * A CV arrives from an unauthenticated stranger and is later opened by
 * somebody at the firm on their own machine, which makes this the one place
 * where a scan is worth the latency.
 */

export type ScanVerdict = 'clean' | 'infected';

export interface IVirusScanner {
  readonly name: string;
  /** Throws only when the scanner itself fails; a verdict is never an error. */
  scan(buffer: Buffer): Promise<ScanVerdict>;
}
