/**
 * Identity module plugin.
 *
 * Wires the identity adapter, session service, user store, and
 * auth routes into the Fastify application.
 */

import type { FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import { LocalIdentityAdapter } from "./local-adapter.js";
import { SessionService } from "./session-service.js";
import type { SessionStore } from "./session-store.js";
import type { UserStore } from "./user-store.js";
import { authRoutes } from "./auth-routes.js";
import type { AuthRouteOptions } from "./auth-routes.js";
import type { ApiConfig } from "../../config.js";

export interface IdentityPluginOptions {
  config: ApiConfig;
  sessionStore: SessionStore;
  userStore: UserStore;
}

export async function registerIdentityModule(
  app: FastifyInstance,
  options: IdentityPluginOptions,
): Promise<void> {
  const { config, sessionStore, userStore } = options;

  // Register cookie parsing plugin
  await app.register(fastifyCookie);

  // Create identity adapter (local/mock for Sprint 1)
  const allowedDomains =
    config.nodeEnv === "test" ? ["example.com"] : undefined;
  const identityAdapter = new LocalIdentityAdapter(allowedDomains);

  // Create session service
  const sessionService = new SessionService(sessionStore, config.session);

  // Register auth routes as a Fastify plugin with typed options
  const authOpts: AuthRouteOptions = {
    identityAdapter,
    sessionService,
    userStore,
  };
  await app.register(authRoutes, authOpts);
}
