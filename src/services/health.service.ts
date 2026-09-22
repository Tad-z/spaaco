import mongoose from 'mongoose';
import type { IHealthStatus } from '../interfaces/health.interface.js';

/**
 * Liveness checks.
 *
 * The service returns facts, not a response shape: turning them into the
 * `Health` payload is the serializer's job. /health is small on purpose, so it
 * doubles as the worked example of a request crossing every layer.
 */

/**
 * Ping the database rather than trusting `readyState`, which still reports
 * "connected" for a socket that has silently gone away.
 */
async function pingDatabase(): Promise<boolean> {
  const { db, readyState } = mongoose.connection;
  if (readyState !== mongoose.ConnectionStates.connected || !db) return false;

  try {
    await db.admin().ping();
    return true;
  } catch {
    // A failing ping is the answer, not an error: /health reports db: "down".
    return false;
  }
}

export async function checkHealth(): Promise<IHealthStatus> {
  return { dbConnected: await pingDatabase() };
}
