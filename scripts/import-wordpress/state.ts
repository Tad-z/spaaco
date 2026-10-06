/**
 * What earlier runs against the same API did, kept between runs so a re-run is
 * idempotent: which files are already in the media library, and the revision
 * each imported record had after the import last wrote it. A record whose
 * revision has moved on since was edited by someone, so a re-run leaves it
 * alone unless told otherwise.
 *
 * One file per API host, so a staging run never reuses production's media ids.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { UploadedMedia } from './api.js';

export interface RunState {
  media: Record<string, UploadedMedia>;
  /** `"<collection>/<slug>"` → revision after the import's last write. */
  records: Record<string, number>;
}

export function loadState(path: string): RunState {
  if (!existsSync(path)) return { media: {}, records: {} };
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<RunState>;
  return { media: parsed.media ?? {}, records: parsed.records ?? {} };
}

export function saveState(path: string, state: RunState): void {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export const stateFileName = (apiUrl: string): string =>
  `state.${new URL(apiUrl).host.replace(/[^a-z0-9.-]/gi, '_')}.json`;
