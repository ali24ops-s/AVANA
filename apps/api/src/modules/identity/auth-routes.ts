import type { FastifyPluginAsync } from "fastify";
import type { IdentityAdapter, UserId, Actor } from "@avana/domain";
import {
  DomainError,
  resolveEffectiveRole,
  validateAndNormalizeIranPhone,
  isValidAcademicField,
  validateTeacherAcademicProfile,
  type Role,
} from "@avana/domain";
import { type SessionService, generateSessionToken, hashToken } from "./session-service.js";
import type { UserRecord, UserStore } from "./user-store.js";
import type { EmailVerificationStore } from "./email-verification-store.js";
import type { PasswordResetStore } from "./password-reset-store.js";
import type { EmailService } from "./email-service.js";
import type { SmsProvider } from "./sms-service.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import { OrganizationService, generateSlug } from "../organizations/organization-service.js";
import { hashPassword, verifyPassword } from "./password-hasher.js";
import { randomInt, createHmac, randomUUID, randomBytes, createHash } from "node:crypto";
import type { DeviceService } from "./device-service.js";
import { detectDeviceType } from "./device-service.js";

import type { NotificationService } from "../notifications/notification-service.js";

export interface AuthRouteOptions {
  identityAdapter?: IdentityAdapter;
  sessionService: SessionService;
  userStore: UserStore;
  deviceService?: DeviceService;
  emailVerificationStore?: EmailVerificationStore;
  passwordResetStore?: PasswordResetStore;
  emailService?: EmailService;
  smsProvider?: SmsProvider;
  organizationStore?: OrganizationStore;
  verificationSecret?: string;
  notificationService?: NotificationService;
  referralService?: import("../referral/referral-service.js").ReferralService;
  appUrl?: string;
}

/**
 * Resolve the current user's organization memberships into a compact
 * `{ organization_id, role }` shape for the auth response.
 */
async function resolveMemberships(
  organizationStore: OrganizationStore | undefined,
  userId: string,
): Promise<Array<{ organization_id: string; role: string }>> {
  if (!organizationStore) {
    return [];
  }
  const memberships = await organizationStore.listMembershipsByUserId(
    userId as Parameters<OrganizationStore["listMembershipsByUserId"]>[0],
  );
  return memberships.map((m) => ({
    organization_id: m.organizationId,
    role: m.role,
  }));
}

/**
 * Generate a cryptographically secure 6-digit random code.
 */
function generateVerificationCode(): string {
  return randomInt(100000, 1000000).toString();
}

/**
 * Hash verification code with HMAC-SHA256 for secure DB storage against offline brute force.
 */
function hashVerificationCode(
  secret: string,
  userId: string,
  channel: string,
  target: string,
  code: string,
): string {
  return createHmac("sha256", secret)
    .update(`${userId}:${channel}:${target}:${code.trim()}`)
    .digest("hex");
}

function resolveUserVerificationState(userRecord: UserRecord) {
  const emailVerified = Boolean(
    userRecord.emailVerifiedAt ?? userRecord.emailVerified,
  );
  const phoneVerified = Boolean(
    userRecord.phoneVerifiedAt ?? userRecord.phoneVerified,
  );
  return {
    emailVerified,
    phoneVerified,
    isVerified: emailVerified || phoneVerified,
  };
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (
  app,
  opts,
) => {
  const {
    sessionService,
    userStore,
    deviceService,
    emailVerificationStore,
    passwordResetStore,
    emailService,
    smsProvider,
    organizationStore,
    appUrl,
    // eslint-disable-next-line no-secrets/no-secrets
    verificationSecret = "avana_verification_hmac_secret_2026_dev_key",
  } = opts;

  // Custom Rate Limiting store for Auth Brute Force Protection (IP + Target Email/Phone)
  const rateLimitAttempts = new Map<string, { count: number; resetAt: number }>();
  const RATE_LIMIT_MAX = 10;
  const RATE_LIMIT_WINDOW_MS = 60_000;

  // Resend cooldown tracking (Rate limiting email/phone resends)
  const resendCooldowns = new Map<string, number>();
  const RESEND_COOLDOWN_MS = 60_000;

  const getKey = (request: import("fastify").FastifyRequest) => {
    const body =
      typeof request.body === "object" && request.body !== null
        ? (request.body as { email?: string; phoneNumber?: string })
        : {};
    const email = body.email ? body.email.trim().toLowerCase() : "";
    const phone = body.phoneNumber ? body.phoneNumber.trim() : "";
    const identifier = email || phone;
    return identifier ? `auth_${request.ip}_${identifier}` : `auth_${request.ip}_anon`;
  };

  const rateLimitPreHandler = async (
    request: import("fastify").FastifyRequest,
  ) => {
    const key = getKey(request);
    const now = Date.now();

    const record = rateLimitAttempts.get(key);
    if (record && now <= record.resetAt && record.count >= RATE_LIMIT_MAX) {
      throw new DomainError(
        "too_many_requests",
        "تعداد درخواست‌های بیش از حد مجاز. لطفاً یک دقیقه دیگر دوباره تلاش کنید.",
      );
    }
  };

  const RESET_PASSWORD_RATE_LIMIT_MAX = 10;
  const resetPasswordRateLimitPreHandler = async (
    request: import("fastify").FastifyRequest,
  ) => {
    const key = `reset_pw_ip_${request.ip}`;
    const now = Date.now();

    const record = rateLimitAttempts.get(key);
    if (record && now <= record.resetAt && record.count >= RESET_PASSWORD_RATE_LIMIT_MAX) {
      throw new DomainError(
        "too_many_requests",
        "تعداد درخواست‌های بیش از حد مجاز. لطفاً یک دقیقه دیگر دوباره تلاش کنید.",
      );
    }
  };

  const recordFailedAttempt = (request: import("fastify").FastifyRequest) => {
    const key = getKey(request);
    const now = Date.now();
    const record = rateLimitAttempts.get(key);
    if (!record || now > record.resetAt) {
      rateLimitAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    } else {
      record.count++;
    }
  };

  const clearFailedAttempts = (request: import("fastify").FastifyRequest) => {
    const key = getKey(request);
    rateLimitAttempts.delete(key);
  };

  /**
   * Issue a 6-digit verification challenge for a user and channel (email or phone).
   */
  async function issueVerificationChallenge(
    userId: string,
    channel: "email" | "phone",
    target: string,
  ): Promise<void> {
    if (!emailVerificationStore) return;

    // Invalidate existing active codes for user and this specific channel
    await emailVerificationStore.invalidateAllForUser(
      userId as UserId,
      channel,
    );

    const code = generateVerificationCode();
    const codeHash = hashVerificationCode(
      verificationSecret,
      userId,
      channel,
      target,
      code,
    );
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    await emailVerificationStore.createCode({
      userId: userId as UserId,
      codeHash,
      expiresAt,
      channel,
      target,
    });

    resendCooldowns.set(`${userId}_${channel}`, Date.now() + RESEND_COOLDOWN_MS);

    if (channel === "email") {
      if (emailService) {
        try {
          await emailService.sendVerificationCode(target, code);
        } catch (err) {
          await emailVerificationStore.invalidateAllForUser(
            userId as UserId,
            "email",
          );
          app.log.error(
            { err: err instanceof Error ? err.message : String(err) },
            "Failed to send verification email",
          );
          throw new DomainError(
            "internal_error",
            "ارسال ایمیل با خطا مواجه شد. لطفاً دوباره تلاش کنید.",
          );
        }
      }
    } else if (channel === "phone") {
      if (smsProvider) {
        try {
          await smsProvider.sendVerificationCode({
            phoneNumber: target,
            code,
          });
        } catch (err) {
          await emailVerificationStore.invalidateAllForUser(
            userId as UserId,
            "phone",
          );
          app.log.error(
            { err: err instanceof Error ? err.message : String(err) },
            "Failed to send verification SMS",
          );
          throw new DomainError(
            "internal_error",
            "ارسال پیامک با خطا مواجه شد. لطفاً دوباره تلاش کنید.",
          );
        }
      } else {
        throw new DomainError(
          "internal_error",
          "سرویس پیامک در دسترس نیست. لطفاً با مدیر سامانه تماس بگیرید یا از روش ایمیل استفاده کنید.",
        );
      }
    }
  }

  /**
   * Helper to extract session token from cookies or Authorization header.
   */
  function extractSessionToken(
    request: import("fastify").FastifyRequest,
  ): string | undefined {
    const sessionCookie = request.cookies?.["avana_session"];
    const authHeader = request.headers.authorization;
    const bearerToken =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : undefined;
    return sessionCookie || bearerToken;
  }

  /**
   * GET /v1/me — Returns the current authenticated user.
   */
  app.get("/v1/me", async (request, _reply) => {
    const token = extractSessionToken(request);
    if (!token) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const details = await sessionService.validateSessionDetails(token);
    if (details.revoked) {
      if (
        details.revocationReason === "session_takeover" ||
        details.revocationReason === "admin_reset"
      ) {
        throw new DomainError(
          "SESSION_REVOKED",
          "نشست شما به دلیل ورود از دستگاه دیگر یا بازنشانی توسط مدیر نامعتبر شده است.",
          {
            code: "SESSION_REVOKED",
            reason: details.revocationReason,
          },
        );
      }
      throw new DomainError("unauthorized", "Not signed in");
    }

    if (!details.valid || !details.user) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const user = details.user;
    const userRecord = await userStore.findById(user.userId);
    if (!userRecord) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const memberships = await resolveMemberships(
      organizationStore,
      userRecord.id,
    );

    const verificationState = resolveUserVerificationState(userRecord);

    const membershipRoles = memberships.map((m) => m.role as Role);
    const effectiveRole = resolveEffectiveRole(
      userRecord.globalRole ?? userRecord.role,
      membershipRoles,
    );

    return {
      request_id: request.id,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        role: effectiveRole,
        phoneNumber: userRecord.phoneNumber ?? null,
        major: userRecord.major ?? null,
        university: userRecord.university ?? null,
        faculty: userRecord.faculty ?? null,
        department: userRecord.department ?? null,
        emailVerified: verificationState.emailVerified,
        phoneVerified: verificationState.phoneVerified,
        isVerified: verificationState.isVerified,
      },
      memberships,
    };
  });

  /**
   * PATCH /v1/auth/profile — Update current authenticated user's profile name and/or major.
   */
  app.patch("/v1/auth/profile", async (request, _reply) => {
    const token = extractSessionToken(request);
    if (!token) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const details = await sessionService.validateSessionDetails(token);
    if (details.revoked) {
      if (
        details.revocationReason === "session_takeover" ||
        details.revocationReason === "admin_reset"
      ) {
        throw new DomainError(
          "SESSION_REVOKED",
          "نشست شما به دلیل ورود از دستگاه دیگر یا بازنشانی توسط مدیر نامعتبر شده است.",
          {
            code: "SESSION_REVOKED",
            reason: details.revocationReason,
          },
        );
      }
      throw new DomainError("unauthorized", "Not signed in");
    }

    if (!details.valid || !details.user) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const actorUserId = details.user.userId;

    const body = (typeof request.body === "object" && request.body !== null
      ? request.body
      : {}) as {
      firstName?: unknown;
      lastName?: unknown;
      name?: unknown;
      major?: unknown;
      university?: unknown;
      faculty?: unknown;
      department?: unknown;
    };

    let updatedAny = false;
    let resolvedName: string | undefined = undefined;
    let resolvedMajor: string | null | undefined = undefined;
    let resolvedUniversity: string | null | undefined = undefined;
    let resolvedFaculty: string | null | undefined = undefined;
    let resolvedDepartment: string | null | undefined = undefined;

    // 1. Handle Name update if provided
    if (body.firstName !== undefined || body.lastName !== undefined) {
      const firstStr =
        typeof body.firstName === "string"
          ? body.firstName.trim().replace(/\s+/g, " ")
          : "";
      const lastStr =
        typeof body.lastName === "string"
          ? body.lastName.trim().replace(/\s+/g, " ")
          : "";

      if (!firstStr) {
        throw new DomainError("bad_request", "نام الزامی است.");
      }
      if (firstStr.length < 2 || firstStr.length > 50) {
        throw new DomainError("bad_request", "نام باید بین ۲ تا ۵۰ کاراکتر باشد.");
      }
      if (!lastStr) {
        throw new DomainError("bad_request", "نام خانوادگی الزامی است.");
      }
      if (lastStr.length < 2 || lastStr.length > 50) {
        throw new DomainError("bad_request", "نام خانوادگی باید بین ۲ تا ۵۰ کاراکتر باشد.");
      }

      resolvedName = `${firstStr} ${lastStr}`;
      updatedAny = true;
    } else if (typeof body.name === "string") {
      const normName = body.name.trim().replace(/\s+/g, " ");
      const parts = normName.split(" ");
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        throw new DomainError("bad_request", "نام و نام خانوادگی الزامی است.");
      }
      const firstStr = parts[0];
      const lastStr = parts.slice(1).join(" ");
      if (firstStr.length < 2 || firstStr.length > 50) {
        throw new DomainError("bad_request", "نام باید بین ۲ تا ۵۰ کاراکتر باشد.");
      }
      if (lastStr.length < 2 || lastStr.length > 50) {
        throw new DomainError("bad_request", "نام خانوادگی باید بین ۲ تا ۵۰ کاراکتر باشد.");
      }

      resolvedName = `${firstStr} ${lastStr}`;
      updatedAny = true;
    }

    // 2. Handle Major update if provided
    if (body.major !== undefined) {
      if (body.major === null || body.major === "") {
        resolvedMajor = null;
        updatedAny = true;
      } else if (typeof body.major === "string") {
        const trimmedMajor = body.major.trim();
        if (!isValidAcademicField(trimmedMajor)) {
          throw new DomainError("bad_request", "رشته تحصیلی نامعتبر است.");
        }
        resolvedMajor = trimmedMajor;
        updatedAny = true;
      } else {
        throw new DomainError("bad_request", "رشته تحصیلی نامعتبر است.");
      }
    }

    // 3. Handle Teacher Academic Profile (university, faculty, department) if provided
    if (
      body.university !== undefined ||
      body.faculty !== undefined ||
      body.department !== undefined
    ) {
      const academicValidation = validateTeacherAcademicProfile({
        university: body.university,
        faculty: body.faculty,
        department: body.department,
      });
      if (!academicValidation.valid) {
        throw new DomainError(
          "bad_request",
          academicValidation.error || "اطلاعات آموزشی نامعتبر است.",
        );
      }
      if (body.university !== undefined) {
        resolvedUniversity = academicValidation.normalized?.university ?? null;
        updatedAny = true;
      }
      if (body.faculty !== undefined) {
        resolvedFaculty = academicValidation.normalized?.faculty ?? null;
        updatedAny = true;
      }
      if (body.department !== undefined) {
        resolvedDepartment = academicValidation.normalized?.department ?? null;
        updatedAny = true;
      }
    }

    if (!updatedAny) {
      throw new DomainError("bad_request", "اطلاعاتی جهت ویرایش ارسال نشده است.");
    }

    if (userStore.updateProfileFields) {
      await userStore.updateProfileFields(actorUserId, {
        name: resolvedName,
        major: resolvedMajor,
        university: resolvedUniversity,
        faculty: resolvedFaculty,
        department: resolvedDepartment,
      });
    } else {
      if (resolvedName) {
        await userStore.updateName(actorUserId, resolvedName);
      }
      if (resolvedMajor !== undefined && userStore.updateMajor) {
        await userStore.updateMajor(actorUserId, resolvedMajor);
      }
    }

    const userRecord = await userStore.findById(actorUserId);
    if (!userRecord) {
      throw new DomainError("not_found", "کاربر یافت نشد.");
    }

    const memberships = await resolveMemberships(
      organizationStore,
      userRecord.id,
    );
    const verificationState = resolveUserVerificationState(userRecord);
    const membershipRoles = memberships.map((m) => m.role as Role);
    const effectiveRole = resolveEffectiveRole(
      userRecord.globalRole ?? userRecord.role,
      membershipRoles,
    );

    return {
      request_id: request.id,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        role: effectiveRole,
        phoneNumber: userRecord.phoneNumber ?? null,
        major: userRecord.major ?? null,
        university: userRecord.university ?? null,
        faculty: userRecord.faculty ?? null,
        department: userRecord.department ?? null,
        emailVerified: verificationState.emailVerified,
        phoneVerified: verificationState.phoneVerified,
        isVerified: verificationState.isVerified,
      },
      memberships,
    };
  });

  /**
   * Helper to perform device recognition, single active session takeover, and issue cookies.
   */
  async function issueSessionCookies(
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
    userId: string,
    email = "",
    isPlatformAdmin = false,
  ) {
    const incomingDeviceId = request.cookies?.["avana_device_id"];

    const clientHint =
      (request.headers["x-device-type"] as string | undefined) ||
      (typeof request.body === "object" && request.body !== null
        ? (request.body as { device_type?: string }).device_type
        : undefined);

    const userAgent = (request.headers["user-agent"] as string | undefined) ?? "";
    const ip = request.ip;
    const deviceType = detectDeviceType(userAgent, clientHint);

    const config = sessionService.getConfig();
    let sessionToken: string;
    let canonicalDeviceId: string | null = null;

    if (deviceService) {
      sessionToken = generateSessionToken();
      const tokenHash = hashToken(sessionToken);
      const expiresAt = new Date(Date.now() + config.maxAgeMs).toISOString();

      const result = await deviceService.authenticateAndTakeover({
        userId: userId as UserId,
        email,
        incomingDeviceId,
        deviceType,
        userAgent,
        ip,
        tokenHash,
        expiresAt,
        isPlatformAdmin,
      });

      if (result.status === "LIMIT_REACHED") {
        throw new DomainError(
          "DEVICE_LIMIT_REACHED",
          `امکان ثبت دستگاه جدید وجود ندارد. سقف مجاز برای دستگاه‌های ${deviceType === "mobile" ? "موبایل" : "رایانه"} (حداکثر ۱ دستگاه) پر شده است. لطفاً با مدیر تماس بگیرید.`,
          {
            code: "DEVICE_LIMIT_REACHED",
            deviceType,
          },
        );
      }

      canonicalDeviceId = result.canonicalDeviceId;
    } else {
      const takeover = await sessionService.createSessionWithTakeover(
        userId as UserId,
        null,
        "session_takeover",
      );
      sessionToken = takeover.sessionToken;
    }

    if (canonicalDeviceId) {
      reply.setCookie("avana_device_id", canonicalDeviceId, {
        path: "/",
        httpOnly: true,
        secure: config.secure,
        sameSite: config.sameSite,
        maxAge: 400 * 24 * 60 * 60, // 400 days
      });
    }

    reply.setCookie("avana_session", sessionToken, {
      path: "/",
      httpOnly: true,
      secure: config.secure,
      sameSite: config.sameSite,
      maxAge: config.maxAgeMs / 1000,
    });

    reply.setCookie("avana_csrf", sessionToken, {
      path: "/",
      httpOnly: false,
      secure: config.secure,
      sameSite: config.sameSite,
      maxAge: config.maxAgeMs / 1000,
    });
  }

  /**
   * POST /v1/auth/register — Create a new user account with Email + Phone + Password.
   */
  const handleRegister = async (
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
  ) => {
    const body = request.body as {
      email?: string;
      password?: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      major?: string;
      university?: string;
      faculty?: string;
      department?: string;
      role?: string;
      referralCode?: string;
    };

    const firstName = body?.firstName !== undefined ? String(body.firstName).trim() : undefined;
    const lastName = body?.lastName !== undefined ? String(body.lastName).trim() : undefined;
    const rawName = body?.name !== undefined ? String(body.name).trim() : undefined;

    let fullName = "";
    let resolvedFirstName = "";
    let resolvedLastName = "";

    if (firstName !== undefined || lastName !== undefined) {
      if (!firstName) {
        throw new DomainError("bad_request", "نام الزامی است.");
      }
      if (!lastName) {
        throw new DomainError("bad_request", "نام خانوادگی الزامی است.");
      }
      resolvedFirstName = firstName;
      resolvedLastName = lastName;
      fullName = `${resolvedFirstName} ${resolvedLastName}`.trim();
    } else if (rawName) {
      fullName = rawName;
      const parts = rawName.split(/\s+/);
      resolvedFirstName = parts[0] || "";
      resolvedLastName = parts.slice(1).join(" ");
    } else {
      throw new DomainError("bad_request", "نام الزامی است.");
    }

    const rawEmail = body?.email !== undefined ? String(body.email).trim().toLowerCase() : "";
    if (!rawEmail || !rawEmail.includes("@") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      throw new DomainError("bad_request", "نشانی ایمیل معتبر نیست.");
    }
    const email = rawEmail;

    const password = body?.password;
    if (!password || typeof password !== "string" || password.length < 8) {
      throw new DomainError("bad_request", "رمز عبور باید حداقل ۸ کاراکتر باشد.");
    }

    const rawPhoneNumber = body?.phoneNumber;
    if (!rawPhoneNumber || typeof rawPhoneNumber !== "string" || !rawPhoneNumber.trim()) {
      throw new DomainError("bad_request", "شماره موبایل الزامی است.");
    }
    const phoneValidation = validateAndNormalizeIranPhone(rawPhoneNumber);
    if (!phoneValidation.valid || !phoneValidation.normalized) {
      throw new DomainError(
        "bad_request",
        phoneValidation.error || "شماره موبایل معتبر نیست.",
      );
    }
    const normalizedPhoneNumber = phoneValidation.normalized;

    // Teacher Academic Profile validation (if university, faculty, department provided)
    let resolvedUniversity: string | undefined = undefined;
    let resolvedFaculty: string | undefined = undefined;
    let resolvedDepartment: string | undefined = undefined;

    if (
      body?.university !== undefined ||
      body?.faculty !== undefined ||
      body?.department !== undefined
    ) {
      const academicValidation = validateTeacherAcademicProfile({
        university: body.university,
        faculty: body.faculty,
        department: body.department,
      });
      if (!academicValidation.valid) {
        throw new DomainError(
          "bad_request",
          academicValidation.error || "اطلاعات آموزشی نامعتبر است.",
        );
      }
      resolvedUniversity = academicValidation.normalized?.university || undefined;
      resolvedFaculty = academicValidation.normalized?.faculty || undefined;
      resolvedDepartment = academicValidation.normalized?.department || undefined;
    }

    // Major validation (optional for student, validated if provided)
    const rawMajor = body?.major;
    let major: string | undefined = undefined;
    if (rawMajor && typeof rawMajor === "string" && rawMajor.trim()) {
      const trimmedMajor = rawMajor.trim();
      if (!isValidAcademicField(trimmedMajor)) {
        throw new DomainError(
          "bad_request",
          "رشته تحصیلی انتخاب شده معتبر نیست.",
        );
      }
      major = trimmedMajor;
    }

    // Check duplicate email
    const existingUser = await userStore.findByEmail(email);
    if (existingUser) {
      throw new DomainError(
        "conflict",
        "امکان ثبت‌نام با این ایمیل وجود ندارد.",
      );
    }

    // Check duplicate phone number if store supports phone lookup
    if (normalizedPhoneNumber && userStore.findByPhoneNumber) {
      const existingPhoneUser = await userStore.findByPhoneNumber(normalizedPhoneNumber);
      if (existingPhoneUser) {
        throw new DomainError(
          "conflict",
          "این شماره موبایل قبلاً در سامانه ثبت شده است.",
        );
      }
    }

    const hashedPassword = await hashPassword(password);
    const userRecord = await userStore.createUserWithPassword({
      email,
      passwordHash: hashedPassword,
      name: fullName,
      phoneNumber: normalizedPhoneNumber,
      major,
      university: resolvedUniversity,
      faculty: resolvedFaculty,
      department: resolvedDepartment,
    });

    if (organizationStore) {
      const orgService = new OrganizationService(organizationStore);
      const actor: Actor = { userId: userRecord.id, role: resolveEffectiveRole(userRecord.role) };
      const orgName = fullName ? `فضای یادگیری ${fullName}` : "فضای یادگیری آوانا";
      try {
        await orgService.createOrganization(actor, orgName, undefined, "student");
      } catch {
        try {
          const uniqueSlug = `${generateSlug(orgName) || "org"}-${randomUUID().slice(0, 8)}`;
          await orgService.createOrganization(actor, orgName, uniqueSlug, "student");
        } catch {
          // Ignore organization creation collision fallback
        }
      }
    }

    // Attach & Process Referral Code if provided
    if (opts.referralService && body?.referralCode) {
      const incomingDeviceId = request.cookies?.["avana_device_id"];
      try {
        await opts.referralService.processReferralOnRegister({
          invitedUserId: userRecord.id,
          referralCode: body.referralCode,
          deviceId: incomingDeviceId,
          ip: request.ip,
          userAgent: request.headers["user-agent"],
        });
      } catch (err) {
        request.log.error(
          {
            err: err instanceof Error ? err.message : String(err),
            userId: userRecord.id,
            referralCode: body.referralCode,
          },
          "Failed to process referral code during registration",
        );
      }
    }

    // Generate initial email verification challenge
    try {
      await issueVerificationChallenge(userRecord.id, "email", userRecord.email);
    } catch (err) {
      app.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Initial verification email dispatch failed or deferred; user can choose channel on verification page",
      );
    }

    // Issue session cookies (unverified session)
    const isPlatformAdmin =
      userRecord.globalRole === "platform_admin" ||
      userRecord.role === "platform_admin";
    await issueSessionCookies(
      request,
      reply,
      userRecord.id,
      userRecord.email,
      isPlatformAdmin,
    );

    if (opts.notificationService) {
      void opts.notificationService
        .notifyRegistrationSuccess(userRecord.id)
        .catch((err) => {
          app.log.warn(
            { err: err instanceof Error ? err.message : String(err) },
            "Failed to dispatch registration notification",
          );
        });
    }

    const memberships = await resolveMemberships(
      organizationStore,
      userRecord.id,
    );

    const membershipRoles = memberships.map((m) => m.role as Role);
    const effectiveRole = resolveEffectiveRole(
      userRecord.globalRole ?? userRecord.role,
      membershipRoles,
    );

    return {
      request_id: request.id,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        role: effectiveRole,
        phoneNumber: userRecord.phoneNumber ?? null,
        major: userRecord.major ?? null,
        university: userRecord.university ?? null,
        faculty: userRecord.faculty ?? null,
        department: userRecord.department ?? null,
        emailVerified: false,
        phoneVerified: false,
        isVerified: false,
      },
      memberships,
    };
  };

  app.post("/v1/auth/register", { preHandler: [rateLimitPreHandler] }, handleRegister);
  app.post("/v1/auth/sign-up", { preHandler: [rateLimitPreHandler] }, handleRegister);

  /**
   * POST /v1/auth/phone/send-otp — Request login OTP for existing registered phone.
   */
  app.post(
    "/v1/auth/phone/send-otp",
    { preHandler: [rateLimitPreHandler] },
    async (request, _reply) => {
      const body = request.body as { phoneNumber?: string };
      const rawPhoneNumber = body?.phoneNumber;

      if (!rawPhoneNumber || typeof rawPhoneNumber !== "string" || !rawPhoneNumber.trim()) {
        throw new DomainError("bad_request", "شماره موبایل الزامی است.");
      }

      const phoneValidation = validateAndNormalizeIranPhone(rawPhoneNumber);
      if (!phoneValidation.valid || !phoneValidation.normalized) {
        throw new DomainError(
          "bad_request",
          phoneValidation.error || "شماره موبایل معتبر نیست.",
        );
      }
      const normalizedPhone = phoneValidation.normalized;

      if (!userStore.findByPhoneNumber) {
        throw new DomainError(
          "internal_error",
          "سرویس ورود با شماره موبایل در دسترس نیست.",
        );
      }

      const userRecord = await userStore.findByPhoneNumber(normalizedPhone);
      if (!userRecord) {
        // Requirement: Unregistered phone must return 404 without sending OTP
        throw new DomainError(
          "not_found",
          "حساب کاربری با این شماره موبایل یافت نشد.",
        );
      }

      const isPhoneVerified = Boolean(
        userRecord.phoneVerifiedAt ?? userRecord.phoneVerified,
      );
      if (!isPhoneVerified) {
        throw new DomainError(
          "forbidden",
          "شماره موبایل این حساب کاربری هنوز تأیید نشده است. لطفاً ابتدا با ایمیل و رمز عبور وارد شوید و شماره موبایل خود را تأیید کنید.",
        );
      }

      const cooldownKey = `${userRecord.id}_phone_login`;
      const now = Date.now();
      const nextAllowed = resendCooldowns.get(cooldownKey);
      if (nextAllowed && now < nextAllowed) {
        throw new DomainError(
          "too_many_requests",
          "لطفاً پیش از درخواست مجدد ۶۰ ثانیه صبر کنید.",
        );
      }

      // Purpose isolation between login OTP and verification OTP
      // Use channel "phone_login" so this OTP cannot be verified on channel "phone"
      const channel = "phone_login" as "phone";

      if (emailVerificationStore) {
        await emailVerificationStore.invalidateAllForUser(
          userRecord.id as UserId,
          channel,
        );

        const code = generateVerificationCode();
        const codeHash = hashVerificationCode(
          verificationSecret,
          userRecord.id,
          channel,
          normalizedPhone,
          code,
        );
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

        await emailVerificationStore.createCode({
          userId: userRecord.id as UserId,
          codeHash,
          expiresAt,
          channel,
          target: normalizedPhone,
        });

        resendCooldowns.set(cooldownKey, Date.now() + RESEND_COOLDOWN_MS);

        if (smsProvider) {
          try {
            await smsProvider.sendVerificationCode({
              phoneNumber: normalizedPhone,
              code,
            });
          } catch (err) {
            await emailVerificationStore.invalidateAllForUser(
              userRecord.id as UserId,
              channel,
            );
            app.log.error(
              { err: err instanceof Error ? err.message : String(err) },
              "Failed to send login SMS",
            );
            throw new DomainError(
              "internal_error",
              "ارسال پیامک با خطا مواجه شد. لطفاً دوباره تلاش کنید.",
            );
          }
        } else {
          throw new DomainError(
            "internal_error",
            "سرویس پیامک در دسترس نیست.",
          );
        }
      }

      return {
        request_id: request.id,
        message: "کد تأیید ورود برای شما ارسال شد.",
        cooldown_seconds: 60,
      };
    },
  );

  /**
   * POST /v1/auth/phone/verify-otp — Verify phone login OTP and create session.
   */
  app.post(
    "/v1/auth/phone/verify-otp",
    { preHandler: [rateLimitPreHandler] },
    async (request, reply) => {
      const body = request.body as { phoneNumber?: string; code?: string };
      const rawPhoneNumber = body?.phoneNumber;
      const rawCode = body?.code?.trim();

      if (!rawPhoneNumber || typeof rawPhoneNumber !== "string" || !rawPhoneNumber.trim()) {
        throw new DomainError("bad_request", "شماره موبایل الزامی است.");
      }

      const phoneValidation = validateAndNormalizeIranPhone(rawPhoneNumber);
      if (!phoneValidation.valid || !phoneValidation.normalized) {
        recordFailedAttempt(request);
        throw new DomainError(
          "bad_request",
          phoneValidation.error || "شماره موبایل معتبر نیست.",
        );
      }
      const normalizedPhone = phoneValidation.normalized;

      if (!rawCode || rawCode.length !== 6 || !/^\d{6}$/.test(rawCode)) {
        recordFailedAttempt(request);
        throw new DomainError("bad_request", "کد واردشده صحیح نیست.");
      }

      if (!userStore.findByPhoneNumber) {
        throw new DomainError(
          "internal_error",
          "سرویس ورود با شماره موبایل در دسترس نیست.",
        );
      }

      const userRecord = await userStore.findByPhoneNumber(normalizedPhone);
      if (!userRecord) {
        recordFailedAttempt(request);
        throw new DomainError(
          "unauthorized",
          "شماره موبایل یا کد تأیید نادرست است.",
        );
      }

      const isPhoneVerified = Boolean(
        userRecord.phoneVerifiedAt ?? userRecord.phoneVerified,
      );
      if (!isPhoneVerified) {
        recordFailedAttempt(request);
        throw new DomainError(
          "forbidden",
          "شماره موبایل این حساب کاربری هنوز تأیید نشده است. لطفاً ابتدا با ایمیل و رمز عبور وارد شوید و شماره موبایل خود را تأیید کنید.",
        );
      }

      const channel = "phone_login" as "phone";

      if (emailVerificationStore) {
        const latestCode = await emailVerificationStore.findLatestActiveCode(
          userRecord.id,
          channel,
        );

        if (!latestCode || latestCode.usedAt) {
          recordFailedAttempt(request);
          throw new DomainError(
            "bad_request",
            "کد واردشده غیرفعال است یا منقضی شده است. لطفاً کد جدیدی درخواست کنید.",
          );
        }

        if (new Date(latestCode.expiresAt).getTime() < Date.now()) {
          recordFailedAttempt(request);
          throw new DomainError(
            "bad_request",
            "کد واردشده منقضی شده است. لطفاً کد جدیدی درخواست کنید.",
          );
        }

        if (latestCode.attempts >= 5) {
          await emailVerificationStore.markAsUsed(latestCode.id);
          recordFailedAttempt(request);
          throw new DomainError(
            "bad_request",
            "تعداد تلاش‌های مجاز به پایان رسیده است. لطفاً کد جدیدی درخواست کنید.",
          );
        }

        const incomingHmac = hashVerificationCode(
          verificationSecret,
          userRecord.id,
          channel,
          normalizedPhone,
          rawCode,
        );

        if (incomingHmac !== latestCode.codeHash) {
          await emailVerificationStore.incrementAttempts(latestCode.id);
          recordFailedAttempt(request);
          throw new DomainError("bad_request", "کد واردشده صحیح نیست.");
        }

        // Success: mark code used
        await emailVerificationStore.markAsUsed(latestCode.id);
      }

      clearFailedAttempts(request);

      const isPlatformAdmin =
        userRecord.globalRole === "platform_admin" ||
        userRecord.role === "platform_admin";
      await issueSessionCookies(
        request,
        reply,
        userRecord.id,
        userRecord.email,
        isPlatformAdmin,
      );

      if (opts.notificationService) {
        void opts.notificationService
          .notifyLogin(userRecord.id, {
            ip: request.ip,
          })
          .catch((err) => {
            app.log.warn(
              { err: err instanceof Error ? err.message : String(err) },
              "Failed to dispatch phone login notification",
            );
          });
      }

      const memberships = await resolveMemberships(
        organizationStore,
        userRecord.id,
      );

      const verificationState = resolveUserVerificationState(userRecord);

      const membershipRoles = memberships.map((m) => m.role as Role);
      const effectiveRole = resolveEffectiveRole(
        userRecord.globalRole ?? userRecord.role,
        membershipRoles,
      );

      return {
        request_id: request.id,
        user: {
          id: userRecord.id,
          email: userRecord.email,
          name: userRecord.name,
          role: effectiveRole,
          phoneNumber: userRecord.phoneNumber ?? null,
          major: userRecord.major ?? null,
          university: userRecord.university ?? null,
          faculty: userRecord.faculty ?? null,
          department: userRecord.department ?? null,
          emailVerified: verificationState.emailVerified,
          phoneVerified: verificationState.phoneVerified,
          isVerified: verificationState.isVerified,
        },
        memberships,
      };
    },
  );

  /**
   * POST /v1/auth/sign-in — Authenticate using Email + Password.
   */
  app.post(
    "/v1/auth/sign-in",
    { preHandler: [rateLimitPreHandler] },
    async (request, reply) => {
    const body = request.body as { email?: string; password?: string; name?: string };

    if (!body?.email) {
      throw new DomainError("bad_request", "Email is required");
    }

    const email = body.email.trim().toLowerCase();
    const password = body.password;

    if (!email.includes("@")) {
      recordFailedAttempt(request);
      throw new DomainError(
        "unauthorized",
        "ایمیل یا رمز عبور نادرست است.",
      );
    }

    let userRecord = await userStore.findWithPasswordByEmail(email);

    if (password) {
      if (!userRecord && opts.identityAdapter) {
        try {
          const identity = await opts.identityAdapter.verifyIdentity({
            email,
            name: body.name,
          });
          const hashedPassword = await hashPassword(password);
          userRecord = await userStore.createUserWithPassword({
            email: identity.email,
            passwordHash: hashedPassword,
            name: identity.name,
          });
        } catch {
          recordFailedAttempt(request);
          throw new DomainError(
            "unauthorized",
            "ایمیل یا رمز عبور نادرست است.",
          );
        }
      } else if (!userRecord) {
        recordFailedAttempt(request);
        throw new DomainError(
          "unauthorized",
          "ایمیل یا رمز عبور نادرست است.",
        );
      } else if (userRecord.passwordHash) {
        const isMatch = await verifyPassword(password, userRecord.passwordHash);
        if (!isMatch) {
          recordFailedAttempt(request);
          throw new DomainError(
            "unauthorized",
            "ایمیل یا رمز عبور نادرست است.",
          );
        }
      } else {
        recordFailedAttempt(request);
        throw new DomainError(
          "unauthorized",
          "ایمیل یا رمز عبور نادرست است.",
        );
      }
    } else if (opts.identityAdapter) {
      // Legacy test double fallback without password
      const identity = await opts.identityAdapter.verifyIdentity({
        email,
        name: body.name,
      });
      if (!userRecord) {
        userRecord = await userStore.createFromVerifiedIdentity(identity);
      }
    } else {
      recordFailedAttempt(request);
      throw new DomainError(
        "unauthorized",
        "ایمیل یا رمز عبور نادرست است.",
      );
    }

    clearFailedAttempts(request);

    const isPlatformAdmin =
      userRecord.globalRole === "platform_admin" ||
      userRecord.role === "platform_admin";
    await issueSessionCookies(
      request,
      reply,
      userRecord.id,
      userRecord.email,
      isPlatformAdmin,
    );

    if (opts.notificationService) {
      void opts.notificationService
        .notifyLogin(userRecord.id, {
          ip: request.ip,
        })
        .catch((err) => {
          app.log.warn(
            { err: err instanceof Error ? err.message : String(err) },
            "Failed to dispatch sign-in notification",
          );
        });
    }

    const memberships = await resolveMemberships(
      organizationStore,
      userRecord.id,
    );

    const verificationState = resolveUserVerificationState(userRecord);

    const membershipRoles = memberships.map((m) => m.role as Role);
    const effectiveRole = resolveEffectiveRole(
      userRecord.globalRole ?? userRecord.role,
      membershipRoles,
    );

    return {
      request_id: request.id,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        role: effectiveRole,
        phoneNumber: userRecord.phoneNumber ?? null,
        major: userRecord.major ?? null,
        university: userRecord.university ?? null,
        faculty: userRecord.faculty ?? null,
        department: userRecord.department ?? null,
        emailVerified: verificationState.emailVerified,
        phoneVerified: verificationState.phoneVerified,
        isVerified: verificationState.isVerified,
      },
      memberships,
    };
  });

  /**
   * POST /v1/auth/verification/send — Request verification code for authenticated session user.
   */
  app.post("/v1/auth/verification/send", async (request, _reply) => {
    const token = extractSessionToken(request);
    if (!token) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const sessionUser = await sessionService.validateSession(token);
    if (!sessionUser) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const body = request.body as { channel?: string };
    const channel = body?.channel;
    if (channel !== "email" && channel !== "phone") {
      throw new DomainError(
        "bad_request",
        "روش تأیید نامعتبر است. لطفاً 'email' یا 'phone' را انتخاب کنید.",
      );
    }

    const userRecord = await userStore.findById(sessionUser.userId);
    if (!userRecord) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    let target: string;
    if (channel === "phone") {
      if (!userRecord.phoneNumber) {
        throw new DomainError(
          "bad_request",
          "شماره موبایلی برای این حساب کاربری ثبت نشده است.",
        );
      }
      target = userRecord.phoneNumber;
    } else {
      target = userRecord.email;
    }

    const cooldownKey = `${userRecord.id}_${channel}`;
    const now = Date.now();
    const nextAllowed = resendCooldowns.get(cooldownKey);
    if (nextAllowed && now < nextAllowed) {
      throw new DomainError(
        "too_many_requests",
        "لطفاً پیش از درخواست مجدد ۶۰ ثانیه صبر کنید.",
      );
    }

    await issueVerificationChallenge(userRecord.id, channel, target);

    return {
      request_id: request.id,
      channel,
      message:
        channel === "phone"
          ? "کد تأیید به شماره موبایل شما ارسال شد."
          : "کد تأیید به نشانی ایمیل شما ارسال شد.",
      cooldown_seconds: 60,
    };
  });

  /**
   * POST /v1/auth/verification/verify — Verify OTP for a given channel for authenticated session user.
   */
  app.post("/v1/auth/verification/verify", async (request, _reply) => {
    const token = extractSessionToken(request);
    if (!token) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const sessionUser = await sessionService.validateSession(token);
    if (!sessionUser) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const body = request.body as { channel?: string; code?: string };
    const channel = body?.channel;
    const rawCode = body?.code?.trim();

    if (channel !== "email" && channel !== "phone") {
      throw new DomainError(
        "bad_request",
        "روش تأیید نامعتبر است. لطفاً 'email' یا 'phone' را انتخاب کنید.",
      );
    }

    if (!rawCode || rawCode.length !== 6 || !/^\d{6}$/.test(rawCode)) {
      throw new DomainError("bad_request", "کد واردشده صحیح نیست.");
    }

    const userId = sessionUser.userId;
    const userRecord = await userStore.findById(userId);
    if (!userRecord) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    let target: string;
    if (channel === "phone") {
      if (!userRecord.phoneNumber) {
        throw new DomainError(
          "bad_request",
          "شماره موبایلی برای این حساب ثبت نشده است.",
        );
      }
      target = userRecord.phoneNumber;
    } else {
      target = userRecord.email;
    }

    if (!emailVerificationStore) {
      if (channel === "phone") {
        await userStore.setPhoneVerified(userId);
      } else {
        await userStore.setEmailVerified(userId);
      }
      const updatedUser = await userStore.findById(userId);
      const memberships = await resolveMemberships(organizationStore, userId);
      const membershipRoles = memberships.map((m) => m.role as Role);
      const effectiveRole = resolveEffectiveRole(
        updatedUser!.globalRole ?? updatedUser!.role,
        membershipRoles,
      );
      const verificationState = resolveUserVerificationState(updatedUser!);
      return {
        request_id: request.id,
        user: {
          id: updatedUser!.id,
          email: updatedUser!.email,
          name: updatedUser!.name,
          role: effectiveRole,
          phoneNumber: updatedUser!.phoneNumber ?? null,
          emailVerified: verificationState.emailVerified,
          phoneVerified: verificationState.phoneVerified,
          isVerified: verificationState.isVerified,
        },
        memberships,
      };
    }

    const latestCode = await emailVerificationStore.findLatestActiveCode(
      userId,
      channel,
    );

    if (!latestCode || latestCode.usedAt) {
      throw new DomainError(
        "bad_request",
        "کد واردشده غیرفعال است یا منقضی شده است. لطفاً کد جدیدی درخواست کنید.",
      );
    }

    if (new Date(latestCode.expiresAt).getTime() < Date.now()) {
      throw new DomainError(
        "bad_request",
        "کد واردشده منقضی شده است. لطفاً کد جدیدی درخواست کنید.",
      );
    }

    if (latestCode.attempts >= 5) {
      await emailVerificationStore.markAsUsed(latestCode.id);
      throw new DomainError(
        "bad_request",
        "تعداد تلاش‌های مجاز به پایان رسیده است. لطفاً کد جدیدی درخواست کنید.",
      );
    }

    const incomingHmac = hashVerificationCode(
      verificationSecret,
      userId,
      channel,
      target,
      rawCode,
    );

    if (incomingHmac !== latestCode.codeHash) {
      await emailVerificationStore.incrementAttempts(latestCode.id);
      throw new DomainError("bad_request", "کد واردشده صحیح نیست.");
    }

    // Success: mark code used and update user status
    await emailVerificationStore.markAsUsed(latestCode.id);
    if (channel === "phone") {
      await userStore.setPhoneVerified(userId);
    } else {
      await userStore.setEmailVerified(userId);
      if (opts.notificationService) {
        void opts.notificationService.notifyEmailVerified(userId);
      }
    }

    const updatedUser = await userStore.findById(userId);
    const memberships = await resolveMemberships(organizationStore, userId);

    const membershipRoles = memberships.map((m) => m.role as Role);
    const effectiveRole = resolveEffectiveRole(
      updatedUser!.globalRole ?? updatedUser!.role,
      membershipRoles,
    );
    const verificationState = resolveUserVerificationState(updatedUser!);

    return {
      request_id: request.id,
      user: {
        id: updatedUser!.id,
        email: updatedUser!.email,
        name: updatedUser!.name,
        role: effectiveRole,
        phoneNumber: updatedUser!.phoneNumber ?? null,
        emailVerified: verificationState.emailVerified,
        phoneVerified: verificationState.phoneVerified,
        isVerified: verificationState.isVerified,
      },
      memberships,
    };
  });

  /**
   * POST /v1/auth/verify-email — Backward-compatible Email Verification endpoint.
   */
  app.post("/v1/auth/verify-email", async (request, _reply) => {
    const token = extractSessionToken(request);
    if (!token) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const sessionUser = await sessionService.validateSession(token);
    if (!sessionUser) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const body = request.body as { code?: string };
    const rawCode = body?.code?.trim();

    if (!rawCode || rawCode.length !== 6 || !/^\d{6}$/.test(rawCode)) {
      throw new DomainError("bad_request", "کد واردشده صحیح نیست.");
    }

    const userId = sessionUser.userId;
    const userRecord = await userStore.findById(userId);
    if (!userRecord) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const target = userRecord.email;

    if (!emailVerificationStore) {
      await userStore.setEmailVerified(userId);
      const updatedUser = await userStore.findById(userId);
      const memberships = await resolveMemberships(organizationStore, userId);
      return {
        request_id: request.id,
        user: {
          id: updatedUser!.id,
          email: updatedUser!.email,
          name: updatedUser!.name,
          role: updatedUser!.role,
          phoneNumber: updatedUser!.phoneNumber ?? null,
          emailVerified: true,
          phoneVerified: Boolean(updatedUser!.phoneVerifiedAt ?? updatedUser!.phoneVerified),
          isVerified: true,
        },
        memberships,
      };
    }

    const latestCode = await emailVerificationStore.findLatestActiveCode(
      userId,
      "email",
    );

    if (!latestCode || latestCode.usedAt) {
      throw new DomainError(
        "bad_request",
        "کد واردشده غیرفعال است یا منقضی شده است. لطفاً کد جدیدی درخواست کنید.",
      );
    }

    if (new Date(latestCode.expiresAt).getTime() < Date.now()) {
      throw new DomainError(
        "bad_request",
        "کد واردشده منقضی شده است. لطفاً کد جدیدی درخواست کنید.",
      );
    }

    if (latestCode.attempts >= 5) {
      await emailVerificationStore.markAsUsed(latestCode.id);
      throw new DomainError(
        "bad_request",
        "تعداد تلاش‌های مجاز به پایان رسیده است. لطفاً کد جدیدی درخواست کنید.",
      );
    }

    const incomingHmac = hashVerificationCode(
      verificationSecret,
      userId,
      "email",
      target,
      rawCode,
    );

    if (incomingHmac !== latestCode.codeHash) {
      await emailVerificationStore.incrementAttempts(latestCode.id);
      throw new DomainError("bad_request", "کد واردشده صحیح نیست.");
    }

    // Success: mark code used and update user status
    await emailVerificationStore.markAsUsed(latestCode.id);
    await userStore.setEmailVerified(userId);
    if (opts.notificationService) {
      void opts.notificationService.notifyEmailVerified(userId);
    }

    const updatedUser = await userStore.findById(userId);
    const memberships = await resolveMemberships(organizationStore, userId);

    const membershipRoles = memberships.map((m) => m.role as Role);
    const effectiveRole = resolveEffectiveRole(
      updatedUser!.globalRole ?? updatedUser!.role,
      membershipRoles,
    );
    const verificationState = resolveUserVerificationState(updatedUser!);

    return {
      request_id: request.id,
      user: {
        id: updatedUser!.id,
        email: updatedUser!.email,
        name: updatedUser!.name,
        role: effectiveRole,
        phoneNumber: updatedUser!.phoneNumber ?? null,
        emailVerified: verificationState.emailVerified,
        phoneVerified: verificationState.phoneVerified,
        isVerified: verificationState.isVerified,
      },
      memberships,
    };
  });

  /**
   * POST /v1/auth/resend-verification — Backward-compatible Email Resend endpoint.
   */
  app.post("/v1/auth/resend-verification", async (request, _reply) => {
    let targetUserId: string | undefined;
    let targetEmail: string | undefined;

    const token = extractSessionToken(request);
    if (token) {
      const sessionUser = await sessionService.validateSession(token);
      if (sessionUser) {
        const u = await userStore.findById(sessionUser.userId);
        if (u) {
          targetUserId = u.id;
          targetEmail = u.email;
        }
      }
    }

    const body = request.body as { email?: string } | undefined;

    if (!targetUserId && body?.email) {
      const normEmail = body.email.trim().toLowerCase();
      const u = await userStore.findByEmail(normEmail);
      if (u) {
        targetUserId = u.id;
        targetEmail = u.email;
      }
    }

    const rateKey = targetUserId
      ? `${targetUserId}_email`
      : body?.email
        ? `email_${body.email.trim().toLowerCase()}`
        : `ip_${request.ip}`;
    const now = Date.now();
    const nextAllowed = resendCooldowns.get(rateKey);

    if (nextAllowed && now < nextAllowed) {
      throw new DomainError(
        "too_many_requests",
        "لطفاً پیش از درخواست مجدد ۶۰ ثانیه صبر کنید.",
      );
    }

    resendCooldowns.set(rateKey, now + RESEND_COOLDOWN_MS);

    if (targetUserId && targetEmail) {
      const userRec = await userStore.findById(targetUserId as UserId);
      if (userRec && !userRec.emailVerifiedAt && !userRec.emailVerified) {
        await issueVerificationChallenge(targetUserId, "email", targetEmail);
      }
    }

    // Generic response to prevent email enumeration
    return {
      request_id: request.id,
      message: "کد تأیید جدید به ایمیل شما ارسال شد.",
      cooldown_seconds: 60,
    };
  });

  /**
   * POST /v1/auth/forgot-password — Request secure password recovery link via email.
   */
  app.post(
    "/v1/auth/forgot-password",
    { preHandler: [rateLimitPreHandler] },
    async (request, _reply) => {
      const body =
        typeof request.body === "object" && request.body !== null
          ? (request.body as { email?: string })
          : {};
      const rawEmail = body?.email;
      const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

      if (!email || !email.includes("@") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new DomainError("bad_request", "نشانی ایمیل معتبر نیست.");
      }

      // Cooldown rate limiting to prevent spamming reset requests (60 seconds per email)
      const rateKey = `forgot_pw_${email}`;
      const now = Date.now();
      const nextAllowed = resendCooldowns.get(rateKey);

      if (nextAllowed && now < nextAllowed) {
        throw new DomainError(
          "too_many_requests",
          "لطفاً پیش از درخواست مجدد ۶۰ ثانیه صبر کنید.",
        );
      }

      resendCooldowns.set(rateKey, now + RESEND_COOLDOWN_MS);

      // Check if user exists
      const userRecord = await userStore.findByEmail(email);

      if (userRecord && passwordResetStore && emailService) {
        // Generate cryptographically secure random token (32 bytes = 64 hex chars)
        const rawToken = randomBytes(32).toString("hex");
        // Hash token with SHA-256 for secure storage (raw token never saved in DB)
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");
        // Short expiration (15 minutes)
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const tokenRecord = await passwordResetStore.createToken({
          userId: userRecord.id,
          tokenHash,
          expiresAt,
        });

        const baseUrl = appUrl || "http://localhost:5173";
        const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
        const resetUrl = `${cleanBaseUrl}/reset-password?token=${rawToken}`;

        try {
          await emailService.sendPasswordResetEmail(email, resetUrl);
        } catch (err) {
          // If sending email fails, remove the newly created token to keep state clean
          await passwordResetStore.deleteToken(tokenRecord.id).catch(() => {});
          app.log.error(
            { err: err instanceof Error ? err.message : String(err) },
            "Failed to dispatch password reset email",
          );
          throw new DomainError(
            "internal_error",
            "ارسال ایمیل بازیابی رمز عبور با خطا مواجه شد. لطفاً دوباره تلاش کنید.",
          );
        }
      }

      // Always return generic response to prevent account/user enumeration
      return {
        request_id: request.id,
        message:
          "اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی رمز عبور برای شما ارسال می‌شود.",
        cooldown_seconds: 60,
      };
    },
  );

  /**
   * POST /v1/auth/reset-password — Atomically reset password with valid one-time token.
   */
  app.post(
    "/v1/auth/reset-password",
    { preHandler: [resetPasswordRateLimitPreHandler] },
    async (request, _reply) => {
      const body =
        typeof request.body === "object" && request.body !== null
          ? (request.body as { token?: string; password?: string })
          : {};
      const token = typeof body.token === "string" ? body.token.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";

      if (!token) {
        throw new DomainError("bad_request", "توکن بازیابی رمز عبور الزامی است.");
      }

      if (!password || password.length < 8) {
        throw new DomainError(
          "bad_request",
          "رمز عبور باید حداقل ۸ کاراکتر باشد.",
        );
      }

      if (!passwordResetStore) {
        throw new DomainError(
          "internal_error",
          "سرویس بازیابی رمز عبور در دسترس نیست.",
        );
      }

      const tokenHash = createHash("sha256").update(token).digest("hex");
      const newPasswordHash = await hashPassword(password);

      // Atomic conditional update + transaction (consume token, update password, revoke all active sessions)
      const result = await passwordResetStore.atomicConsumeAndResetPassword({
        tokenHash,
        newPasswordHash,
      });

      if (!result.success) {
        // Record failed attempt for IP rate limit
        const key = `reset_pw_ip_${request.ip}`;
        const record = rateLimitAttempts.get(key);
        const now = Date.now();
        if (!record || now > record.resetAt) {
          rateLimitAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        } else {
          record.count++;
        }

        if (result.reason === "expired") {
          throw new DomainError(
            "bad_request",
            "لینک بازیابی رمز عبور منقضی شده است. لطفاً دوباره درخواست دهید.",
          );
        } else if (result.reason === "already_used") {
          throw new DomainError(
            "bad_request",
            "این لینک بازیابی قبلاً استفاده شده است. لطفاً دوباره درخواست دهید.",
          );
        } else {
          throw new DomainError(
            "bad_request",
            "لینک بازیابی رمز عبور نامعتبر است.",
          );
        }
      }

      // Clear failed rate limit attempts on success
      rateLimitAttempts.delete(`reset_pw_ip_${request.ip}`);

      return {
        request_id: request.id,
        message: "رمز عبور شما با موفقیت تغییر کرد.",
      };
    },
  );

  /**
   * POST /v1/auth/sign-out — Revoke session.
   */
  app.post("/v1/auth/sign-out", async (request, reply) => {
    const token = extractSessionToken(request);
    if (token) {
      await sessionService.revokeSession(token, "sign_out");
    }

    reply.clearCookie("avana_session", { path: "/" });
    reply.clearCookie("avana_csrf", { path: "/" });

    reply.code(204);
    return;
  });

  /**
   * POST /v1/auth/worker-auto-login — Instant seamless login for isolated Local Worker.
   * Only allowed in worker mode under non-production environments with local databases.
   */
  app.post("/v1/auth/worker-auto-login", async (request, reply) => {
    // 1. Strict Server-Side Guard
    if (!isSafeWorkerLocalEnvironment()) {
      throw new DomainError(
        "forbidden",
        "ورود خودکار ورکر در این محیط مجاز نمی‌باشد.",
      );
    }

    // 2. Find Worker User in userStore
    const workerId = (process.env.WORKER_ID || "worker-001").trim().toLowerCase();
    const targetEmail = `worker-${workerId}@avana.local`;

    let userRecord = await userStore.findByEmail(targetEmail);
    if (!userRecord) {
      // Fallback candidate emails
      const fallbacks = [
        "worker-worker-001@avana.local",
        "worker-001@avana.local",
        "worker@avana.local",
      ];
      for (const fb of fallbacks) {
        if (fb !== targetEmail) {
          const found = await userStore.findByEmail(fb);
          if (found) {
            userRecord = found;
            break;
          }
        }
      }
    }

    if (!userRecord) {
      throw new DomainError(
        "not_found",
        "حساب کاربری ورکر یافت نشد. لطفاً ابتدا دستور 'npm run worker:setup' را اجرا کنید.",
      );
    }

    const memberships = await resolveMemberships(
      organizationStore,
      userRecord.id,
    );
    const membershipRoles = memberships.map((m) => m.role as Role);
    const effectiveRole = resolveEffectiveRole(
      userRecord.globalRole ?? userRecord.role,
      membershipRoles,
    );

    // Verify role is content_worker
    if (
      effectiveRole !== "content_worker" &&
      userRecord.globalRole !== "content_worker" &&
      userRecord.role !== "content_worker"
    ) {
      throw new DomainError(
        "forbidden",
        "حساب کاربری مربوطه دسترسی ورکر را ندارد.",
      );
    }

    const verificationState = resolveUserVerificationState(userRecord);

    // 3. Check if current request already has an active valid session for this user
    const existingToken = extractSessionToken(request);
    if (existingToken) {
      const details = await sessionService.validateSessionDetails(existingToken);
      if (details.valid && details.user && details.user.userId === userRecord.id) {
        return {
          request_id: request.id,
          user: {
            id: userRecord.id,
            email: userRecord.email,
            name: userRecord.name,
            role: effectiveRole,
            phoneNumber: userRecord.phoneNumber ?? null,
            major: userRecord.major ?? null,
            university: userRecord.university ?? null,
            faculty: userRecord.faculty ?? null,
            department: userRecord.department ?? null,
            emailVerified: verificationState.emailVerified,
            phoneVerified: verificationState.phoneVerified,
            isVerified: verificationState.isVerified,
          },
          memberships,
        };
      }
    }

    // 4. Issue standard session cookies
    await issueSessionCookies(
      request,
      reply,
      userRecord.id,
      userRecord.email,
      false,
    );

    return {
      request_id: request.id,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        role: effectiveRole,
        phoneNumber: userRecord.phoneNumber ?? null,
        major: userRecord.major ?? null,
        university: userRecord.university ?? null,
        faculty: userRecord.faculty ?? null,
        department: userRecord.department ?? null,
        emailVerified: verificationState.emailVerified,
        phoneVerified: verificationState.phoneVerified,
        isVerified: verificationState.isVerified,
      },
      memberships,
    };
  });
};

/**
 * Server-side guard to verify that current environment is safe for worker auto-login.
 * Strictly prevents execution in production, remote DBs, or non-worker mode.
 */
export function isSafeWorkerLocalEnvironment(databaseUrl?: string): boolean {
  if (process.env.WORKER_MODE !== "true") return false;
  if (process.env.NODE_ENV === "production") return false;

  const url = databaseUrl || process.env.DATABASE_URL || "";
  if (!url || typeof url !== "string") return false;
  if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) return false;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname.toLowerCase().includes("prod")) return false;

    const allowedHosts = new Set([
      "localhost",
      "127.0.0.1",
      "::1",
      "[::1]",
      "0.0.0.0",
      "postgres",
      "host.docker.internal",
    ]);

    if (allowedHosts.has(hostname)) return true;
    if (/^127\.\d+\.\d+\.\d+$/.test(hostname)) return true;
    return false;
  } catch {
    return false;
  }
}
