import { createVirusScanner } from '../integrations/virus-scan/index.js';
import type {
  IVirusScanner,
  ScanVerdict,
} from '../interfaces/integrations/virus-scan.interface.js';

/** The scanner, behind a setter so tests can swap it. */
let scanner: IVirusScanner | undefined;

export function setVirusScanner(next: IVirusScanner | undefined): void {
  scanner = next;
}

export function scanFile(buffer: Buffer): Promise<ScanVerdict> {
  scanner ??= createVirusScanner();
  return scanner.scan(buffer);
}
