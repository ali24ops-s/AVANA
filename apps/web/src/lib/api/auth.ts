/**
 * Auth API calls using the typed client and contract types.
 *
 * All types come from @avana/contracts — no manual duplication.
 */

import type {
  MeResponse,
  SignInRequest,
  SignInResponse,
  RegisterRequest,
  RegisterResponse,
  PhoneSendOtpRequest,
  PhoneSendOtpResponse,
  PhoneVerifyOtpRequest,
  PhoneVerifyOtpResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
  ResendVerificationRequest,
  ResendVerificationResponse,
  VerificationChannel,
  SendVerificationRequest,
  SendVerificationResponse,
  VerifyChannelRequest,
  VerifyChannelResponse,
} from "@avana/contracts";
import type { ApiClient } from "./client.js";

export function createAuthApi(client: ApiClient) {
  return {
    /**
     * GET /v1/me — Current authenticated user.
     */
    getMe(): Promise<MeResponse> {
      return client.get<MeResponse>("/v1/me");
    },

    /**
     * POST /v1/auth/sign-in — Authenticate and create session via Email + Password.
     */
    signIn(email: string, password: string): Promise<SignInResponse> {
      const body: SignInRequest = { email, password };
      return client.post<SignInResponse>("/v1/auth/sign-in", body);
    },

    /**
     * POST /v1/auth/phone/send-otp — Request login OTP for phone.
     */
    sendPhoneLoginOtp(phoneNumber: string): Promise<PhoneSendOtpResponse> {
      const body: PhoneSendOtpRequest = { phoneNumber };
      return client.post<PhoneSendOtpResponse>("/v1/auth/phone/send-otp", body);
    },

    /**
     * POST /v1/auth/phone/verify-otp — Verify login OTP and create session.
     */
    verifyPhoneLoginOtp(
      phoneNumber: string,
      code: string,
    ): Promise<PhoneVerifyOtpResponse> {
      const body: PhoneVerifyOtpRequest = { phoneNumber, code };
      return client.post<PhoneVerifyOtpResponse>("/v1/auth/phone/verify-otp", body);
    },

    /**
     * POST /v1/auth/register — Create account and session.
     */
    signUp(
      email: string,
      password: string,
      name?: string,
      phoneNumber?: string,
      firstName?: string,
      lastName?: string,
    ): Promise<RegisterResponse> {
      const body: RegisterRequest = {
        email,
        password,
        name,
        phoneNumber,
        firstName,
        lastName,
      };
      return client.post<RegisterResponse>("/v1/auth/register", body);
    },

    /**
     * POST /v1/auth/verification/send — Request verification code for chosen channel.
     */
    sendVerification(channel: VerificationChannel): Promise<SendVerificationResponse> {
      const body: SendVerificationRequest = { channel };
      return client.post<SendVerificationResponse>("/v1/auth/verification/send", body);
    },

    /**
     * POST /v1/auth/verification/verify — Verify code for chosen channel.
     */
    verifyChannel(
      channel: VerificationChannel,
      code: string,
    ): Promise<VerifyChannelResponse> {
      const body: VerifyChannelRequest = { channel, code };
      return client.post<VerifyChannelResponse>("/v1/auth/verification/verify", body);
    },

    /**
     * POST /v1/auth/verify-email — Verify 6-digit verification code (legacy).
     */
    verifyEmail(code: string): Promise<VerifyEmailResponse> {
      const body: VerifyEmailRequest = { code };
      return client.post<VerifyEmailResponse>("/v1/auth/verify-email", body);
    },

    /**
     * POST /v1/auth/resend-verification — Request a new verification code (legacy).
     */
    resendVerification(email?: string): Promise<ResendVerificationResponse> {
      const body: ResendVerificationRequest = { email };
      return client.post<ResendVerificationResponse>("/v1/auth/resend-verification", body);
    },

    /**
     * POST /v1/auth/sign-out — Revoke session.
     */
    signOut(): Promise<void> {
      return client.post<void>("/v1/auth/sign-out");
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
