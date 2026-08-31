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
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { ApiConfig } from "../../config.js";

import type { EmailVerificationStore } from "./email-verification-store.js";
import type { EmailService } from "./email-service.js";
import type { DemoUserResolver } from "./demo-user-resolver.js";

export interface IdentityPluginOptions {
  config: ApiConfig;
  sessionStore: SessionStore;
  userStore: UserStore;
  emailVerificationStore?: EmailVerificationStore;
  emailService?: EmailService;
  organizationStore?: OrganizationStore;
  demoUserResolver?: DemoUserResolver;
}

export async function registerIdentityModule(
  app: FastifyInstance,
  options: IdentityPluginOptions,
): Promise<void> {
  const {
    config,
    sessionStore,
    userStore,
    emailVerificationStore,
    emailService,
    organizationStore,
    demoUserResolver,
  } = options;

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
    emailVerificationStore,
    emailService,
    organizationStore,
    demoUserResolver,
    authEnabled: config.auth?.enabled,
  };
  await app.register(authRoutes, authOpts);
}
