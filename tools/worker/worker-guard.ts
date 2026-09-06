/**
 * Runtime Production Database Guard for Worker mode.
 *
 * Ensures that any Worker process (API, Worker queue, or scripts) immediately
 * fails closed if an attempt is made to connect to a remote or production database.
 */

import { isLocalDatabaseUrl } from "./worker-env.js";

export function enforceWorkerSafety(dbUrl?: string): void {
  const isWorker =
    process.env.WORKER_MODE === "true" || Boolean(process.env.WORKER_ID);

  if (isWorker) {
    const url = dbUrl || process.env.DATABASE_URL;
    if (url && !isLocalDatabaseUrl(url)) {
      process.stderr.write(
        "\n🚨 [FATAL SECURITY ERROR]: Worker mode detected an attempt to connect to a non-local/production database!\n" +
          "Workers are strictly forbidden from connecting to remote or production databases.\n" +
          `Detected URL target: ${url.replace(/:[^:@]+@/, ":****@")}\n` +
          "Worker process terminated immediately.\n\n",
      );
      process.exit(1);
    }
  }
}
