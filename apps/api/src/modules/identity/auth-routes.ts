import type { FastifyPluginAsync } from "fastify";
import type { IdentityAdapter } from "@avana/domain";
import { DomainError, resolveEffectiveRole, type Role } from "@avana/domain";
import type { SessionService } from "./session-service.js";
import type { UserStore } from "./user-store.js";
import type { EmailVerificationStore } from "./email-verification-store.js";
import type { EmailService } from "./email-service.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import { OrganizationService } from "../organizations/organization-service.js";
import { hashPassword, verifyPassword } from "./password-hasher.js";
import { randomInt, createHash } from "node:crypto";

export interface AuthRouteOptions {
  identityAdapter?: IdentityAdapter;
  sessionService: SessionService;
  userStore: UserStore;
  emailVerificationStore?: EmailVerificationStore;
  emailService?: EmailService;
  organizationStore?: OrganizationStore;
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
 * Hash verification code with SHA-256 for secure DB storage.
 */
function hashVerificationCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (
  app,
  opts,
) => {
  const {
    sessionService,
    userStore,
    emailVerificationStore,
    emailService,
    organizationStore,
  } = opts;

  // Custom Rate Limiting store for Auth Brute Force Protection (IP + Target Email)
  const rateLimitAttempts = new Map<string, { count: number; resetAt: number }>();
  const RATE_LIMIT_MAX = 10;
  const RATE_LIMIT_WINDOW_MS = 60_000;

  // Resend cooldown tracking (Rate limiting email resends)
  const resendCooldowns = new Map<string, number>();
  const RESEND_COOLDOWN_MS = 60_000;

  const getKey = (request: import("fastify").FastifyRequest) => {
    const email =
      typeof request.body === "object" && request.body !== null
        ? (request.body as { email?: string }).email ?? ""
        : "";
    const cleanEmail = email.trim().toLowerCase();
    return cleanEmail ? `auth_${request.ip}_${cleanEmail}` : `auth_${request.ip}_anon`;
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
   * Issue a 6-digit email verification code for a user and send via EmailService.
   */
  async function issueVerificationChallenge(
    userId: string,
    email: string,
  ): Promise<void> {
    if (!emailVerificationStore) return;

    // Invalidate existing active codes for user
    await emailVerificationStore.invalidateAllForUser(userId as any);

    const code = generateVerificationCode();
    const codeHash = hashVerificationCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    await emailVerificationStore.createCode({
      userId: userId as any,
      codeHash,
      expiresAt,
    });

    resendCooldowns.set(userId, Date.now() + RESEND_COOLDOWN_MS);

    if (emailService) {
      try {
        await emailService.sendVerificationCode(email, code);
      } catch (err) {
        await emailVerificationStore.invalidateAllForUser(userId as any);
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
  }

  /**
   * GET /v1/me — Returns the current authenticated user.
   */
  app.get("/v1/me", async (request, _reply) => {
    const sessionCookie = request.cookies?.["avana_session"];
    if (!sessionCookie) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const user = await sessionService.validateSession(sessionCookie);
    if (!user) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const userRecord = await userStore.findById(user.userId);
    if (!userRecord) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const memberships = await resolveMemberships(
      organizationStore,
      userRecord.id,
    );

    const isVerified = Boolean(
      userRecord.emailVerifiedAt ?? userRecord.emailVerified,
    );

    const membershipRoles = memberships.map((m) => m.role as Role);
    const effectiveRole = membershipRoles.length > 0
      ? resolveEffectiveRole(membershipRoles)
      : (userRecord.role as Role || "student");

    return {
      request_id: request.id,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        role: effectiveRole,
        emailVerified: isVerified,
      },
      memberships,
    };
  });

  /**
   * Helper to set session and CSRF cookies, preventing session fixation by revoking prior token.
   */
  async function issueSessionCookies(
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
    userId: string,
  ) {
    const existingSessionCookie = request.cookies?.["avana_session"];
    if (existingSessionCookie) {
      await sessionService.revokeSession(existingSessionCookie);
    }

    const { sessionToken } = await sessionService.createSession(userId);
    const config = sessionService.getConfig();

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
   * POST /v1/auth/register — Create a new user account with Email + Password.
   */
  const handleRegister = async (
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
  ) => {
    const body = request.body as {
      email?: string;
      password?: string;
      name?: string;
    };

    const email = body?.email?.trim().toLowerCase();
    const password = body?.password;

    if (!email || !email.includes("@")) {
      throw new DomainError("bad_request", "نشانی ایمیل معتبر نیست.");
    }

    if (!password || password.length < 8) {
      throw new DomainError("bad_request", "رمز عبور باید حداقل ۸ کاراکتر باشد.");
    }

    // Check duplicate user
    const existingUser = await userStore.findByEmail(email);
    if (existingUser) {
      throw new DomainError(
        "conflict",
        "امکان ثبت‌نام با این ایمیل وجود ندارد.",
      );
    }

    const hashedPassword = await hashPassword(password);
    const userRecord = await userStore.createUserWithPassword({
      email,
      passwordHash: hashedPassword,
      name: body.name,
    });

    if (organizationStore) {
      const orgService = new OrganizationService(organizationStore);
      const actor = { userId: userRecord.id as any, role: userRecord.role as any };
      const orgName = body.name ? `فضای یادگیری ${body.name}` : "فضای یادگیری آوانا";
      try {
        await orgService.createOrganization(actor, orgName);
      } catch {
        try {
          await orgService.createOrganization(actor, `فضای یادگیری ${userRecord.id.slice(0, 8)}`);
        } catch {
          // Ignore if organization creation fails
        }
      }
    }

    // Generate email verification challenge
    try {
      await issueVerificationChallenge(userRecord.id, userRecord.email);
    } catch (err) {
      if (userStore.deleteUser) {
        await userStore.deleteUser(userRecord.id);
      }
      throw err;
    }

    // Issue session cookies (unverified session)
    await issueSessionCookies(request, reply, userRecord.id);

    const memberships = await resolveMemberships(
      organizationStore,
      userRecord.id,
    );

    const membershipRoles = memberships.map((m) => m.role as Role);
    const effectiveRole = membershipRoles.length > 0
      ? resolveEffectiveRole(membershipRoles)
      : (userRecord.role as Role || "student");

    return {
      request_id: request.id,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        role: effectiveRole,
        emailVerified: false,
      },
      memberships,
    };
  };

  app.post("/v1/auth/register", { preHandler: [rateLimitPreHandler] }, handleRegister);
  app.post("/v1/auth/sign-up", { preHandler: [rateLimitPreHandler] }, handleRegister);

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
        // First login via adapter / test double with password
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

    await issueSessionCookies(request, reply, userRecord.id);

    const memberships = await resolveMemberships(
      organizationStore,
      userRecord.id,
    );

    const isVerified = Boolean(
      userRecord.emailVerifiedAt ?? userRecord.emailVerified,
    );

    const membershipRoles = memberships.map((m) => m.role as Role);
    const effectiveRole = membershipRoles.length > 0
      ? resolveEffectiveRole(membershipRoles)
      : (userRecord.role as Role || "student");

    return {
      request_id: request.id,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        role: effectiveRole,
        emailVerified: isVerified,
      },
      memberships,
    };
  });

  /**
   * POST /v1/auth/verify-email — Verify 6-digit email verification code for authenticated user.
   */
  app.post("/v1/auth/verify-email", async (request, _reply) => {
    const sessionCookie = request.cookies?.["avana_session"];
    if (!sessionCookie) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const sessionUser = await sessionService.validateSession(sessionCookie);
    if (!sessionUser) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const body = request.body as { code?: string };
    const rawCode = body?.code?.trim();

    if (!rawCode || rawCode.length !== 6 || !/^\d{6}$/.test(rawCode)) {
      throw new DomainError("bad_request", "کد واردشده صحیح نیست.");
    }

    const userId = sessionUser.userId;

    if (!emailVerificationStore) {
      await userStore.setEmailVerified(userId);
      const userRecord = await userStore.findById(userId);
      const memberships = await resolveMemberships(organizationStore, userId);
      return {
        request_id: request.id,
        user: {
          id: userRecord!.id,
          email: userRecord!.email,
          name: userRecord!.name,
          role: userRecord!.role,
          emailVerified: true,
        },
        memberships,
      };
    }

    const latestCode = await emailVerificationStore.findLatestActiveCode(userId);

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

    const incomingHash = hashVerificationCode(rawCode);

    if (incomingHash !== latestCode.codeHash) {
      await emailVerificationStore.incrementAttempts(latestCode.id);
      throw new DomainError("bad_request", "کد واردشده صحیح نیست.");
    }

    // Success: mark code used and update user status
    await emailVerificationStore.markAsUsed(latestCode.id);
    await userStore.setEmailVerified(userId);

    const userRecord = await userStore.findById(userId);
    const memberships = await resolveMemberships(organizationStore, userId);

    const membershipRoles = memberships.map((m) => m.role as Role);
    const effectiveRole = membershipRoles.length > 0
      ? resolveEffectiveRole(membershipRoles)
      : (userRecord!.role as Role || "student");

    return {
      request_id: request.id,
      user: {
        id: userRecord!.id,
        email: userRecord!.email,
        name: userRecord!.name,
        role: effectiveRole,
        emailVerified: true,
      },
      memberships,
    };
  });

  /**
   * POST /v1/auth/resend-verification — Resend email verification code.
   */
  app.post("/v1/auth/resend-verification", async (request, _reply) => {
    let targetUserId: string | undefined;
    let targetEmail: string | undefined;

    const sessionCookie = request.cookies?.["avana_session"];
    if (sessionCookie) {
      const sessionUser = await sessionService.validateSession(sessionCookie);
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

    const rateKey = targetUserId ?? (body?.email ? `email_${body.email.trim().toLowerCase()}` : `ip_${request.ip}`);
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
      const userRec = await userStore.findById(targetUserId as any);
      if (userRec && !userRec.emailVerifiedAt && !userRec.emailVerified) {
        await issueVerificationChallenge(targetUserId, targetEmail);
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
   * POST /v1/auth/sign-out — Revoke session.
   */
  app.post("/v1/auth/sign-out", async (request, reply) => {
    const sessionCookie = request.cookies?.["avana_session"];
    if (sessionCookie) {
      await sessionService.revokeSession(sessionCookie);
    }

    reply.clearCookie("avana_session", { path: "/" });
    reply.clearCookie("avana_csrf", { path: "/" });

    reply.code(204);
    return;
  });
};
