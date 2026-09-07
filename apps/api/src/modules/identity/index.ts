/**
 * Identity module - Public API.
 *
 * Exports the identity module plugin and key types for use by
 * the application composition root.
 */

export { registerIdentityModule } from "./plugin.js";
export type { IdentityPluginOptions } from "./plugin.js";
export type { UserRecord, UserStore } from "./user-store.js";
export type { SessionRecord, SessionStore } from "./session-store.js";
export {
  SessionService,
  generateSessionToken,
  hashToken,
} from "./session-service.js";
export { LocalIdentityAdapter } from "./local-adapter.js";
export { authRoutes } from "./auth-routes.js";
export type { AuthRouteOptions } from "./auth-routes.js";
export {
  generateBoundCsrfToken,
  validateCsrfToken,
  generateCsrfToken,
} from "./csrf.js";
export type {
  EmailVerificationCodeRecord,
  EmailVerificationStore,
} from "./email-verification-store.js";
export type { EmailService } from "./email-service.js";
export { MockEmailService, ResendEmailService } from "./email-service.js";
export type {
  SmsProvider,
  HttpSmsProviderOptions,
  MedianaSmsProviderOptions,
} from "./sms-service.js";
export {
  ConsoleSmsProvider,
  MockSmsProvider,
  HttpSmsProvider,
  MedianaSmsProvider,
  formatMedianaRecipient,
  maskPhoneNumberForLogs,
} from "./sms-service.js";
export type {
  DeviceStore,
  RegisterDeviceInput,
  RecordAttemptInput,
} from "./device-store.js";
export {
  DeviceService,
  generateDeviceId,
  detectDeviceType,
  parseDeviceName,
} from "./device-service.js";
export {
  DrizzleSessionStore,
  DrizzleUserStore,
  DrizzleEmailVerificationStore,
  DrizzleDeviceStore,
} from "./drizzle-stores.js";


