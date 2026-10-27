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
import type { PasswordResetStore } from "./password-reset-store.js";
import type { EmailService } from "./email-service.js";
import type { SmsProvider } from "./sms-service.js";
import type { NotificationService } from "../notifications/notification-service.js";

export interface IdentityPluginOptions {
  config: ApiConfig;
  sessionStore: SessionStore;
  userStore: UserStore;
  deviceStore?: DeviceStore;
  deviceService?: DeviceService;
  emailVerificationStore?: EmailVerificationStore;
  passwordResetStore?: PasswordResetStore;
  emailService?: EmailService;
  smsProvider?: SmsProvider;
  organizationStore?: OrganizationStore;
  notificationService?: NotificationService;
  referralService?: import("../referral/referral-service.js").ReferralService;
  auditService?: import("../../observability/audit-service.js").AuditService;
  welcomeGiftStore?: import("./welcome-gift-store.js").WelcomeGiftStore;
  welcomeGiftService?: import("./welcome-gift-service.js").WelcomeGiftService;
  onboardingTourStore?: import("./onboarding-tour-store.js").OnboardingTourStore;
  onboardingTourService?: import("./onboarding-tour-service.js").OnboardingTourService;
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

  // Create welcome gift service if store or service provided
  const welcomeGiftService =
    options.welcomeGiftService ??
    (options.welcomeGiftStore
      ? new (await import("./welcome-gift-service.js")).WelcomeGiftService({
          store: options.welcomeGiftStore,
          userStore,
          notificationService: options.notificationService,
          auditService: options.auditService,
        })
      : undefined);

  // Create onboarding tour service if store or service provided
  const onboardingTourService =
    options.onboardingTourService ??
    (options.onboardingTourStore
      ? new (await import("./onboarding-tour-service.js")).OnboardingTourService({
          store: options.onboardingTourStore,
          userStore,
        })
      : undefined);

  // Register auth routes as a Fastify plugin with typed options
  const authOpts: AuthRouteOptions = {
    identityAdapter,
    sessionService,
    userStore,
    deviceService,
    emailVerificationStore,
    passwordResetStore: options.passwordResetStore,
    emailService,
    smsProvider,
    organizationStore,
    verificationSecret: config.auth?.verificationSecret,
    notificationService: options.notificationService,
    referralService: options.referralService,
    auditService: options.auditService,
    welcomeGiftService,
    onboardingTourService,
    appUrl: config.appUrl,
  };
  await app.register(authRoutes, authOpts);
}
