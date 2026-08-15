/**
 * Worker configuration.
 *
 * Reuses the API config loader (`loadApiConfig`) so the worker shares the
 * same database, Redis, and generation queue wiring as the API. The worker
 * does not need HTTP/session config, but reusing the loader avoids diverging
 * defaults and keeps a single source of truth for shared settings.
 */

import { loadApiConfig } from "@avana/api/config";

export type WorkerConfig = ReturnType<typeof loadApiConfig>;

export function loadWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  return loadApiConfig(env);
}
