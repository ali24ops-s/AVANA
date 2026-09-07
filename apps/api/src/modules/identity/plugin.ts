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

import type { DeviceStore } from "./device-store.js";
import { DeviceService } from "./device-service.js";
import type { EmailVerificationStore } from "./email-verification-store.js";
import type { EmailService } from "./email-service.js";
import type { SmsProvider } from "./sms-service.js";

export interface IdentityPluginOptions {
  config: ApiConfig;
  sessionStore: SessionStore;
  userStore: UserStore;
  deviceStore?: DeviceStore;
  deviceService?: DeviceService;
  emailVerificationStore?: EmailVerificationStore;
  emailService?: EmailService;
  smsProvider?: SmsProvider;
  organizationStore?: OrganizationStore;
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
    smsProvider,
    organizationStore,
  } = options;

  // Register cookie parsing plugin
  await app.register(fastifyCookie);

  // Create identity adapter (local/mock for Sprint 1)
  const allowedDomains =
    config.nodeEnv === "test" ? ["example.com"] : undefined;
  const identityAdapter = new LocalIdentityAdapter(allowedDomains);

  // Create session service
  const sessionService = new SessionService(sessionStore, config.session);

  // Wire sessionStore into deviceStore if supported (e.g. in-memory test store)
  if (options.deviceStore && "setSessionStore" in options.deviceStore) {
    (options.deviceStore as { setSessionStore: (s: typeof sessionStore) => void }).setSessionStore(sessionStore);
  }

  // Create device service
  const deviceService =
    options.deviceService ??
    (options.deviceStore ? new DeviceService(options.deviceStore) : undefined);

  // Register auth routes as a Fastify plugin with typed options
  const authOpts: AuthRouteOptions = {
    identityAdapter,
    sessionService,
    userStore,
    deviceService,
    emailVerificationStore,
    emailService,
    smsProvider,
    organizationStore,
    verificationSecret: config.auth?.verificationSecret,
  };
  await app.register(authRoutes, authOpts);
}
