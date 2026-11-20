import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { StudioService } from "./studio-service.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import { DomainError, asUserId, asOrganizationId, type Actor } from "@avana/domain";
import type { SubmitAttemptInput } from "./types.js";

export interface PublicQuizRouteOptions extends Partial<AuthMiddlewareDeps> {
  studioService: StudioService;
}

/**
 * Capacity & Eviction Policy:
 * 1. Tier 1 (Expired Pruning): Entries where now > resetAt are removed first.
 * 2. Tier 2 (Non-Blocked Low-Usage Eviction): If still at capacity, evict active entries
 *    that are NOT blocked (count < maxRequests). This frees space for legitimate new users
 *    WITHOUT allowing blocked attackers (count >= maxRequests) to bypass their rate limit.
 * 3. Tier 3 (Fail-Closed on Saturation): If the store remains at capacity and every single entry
 *    is an active blocked record, new incoming keys cannot be allocated and checkLimit fails closed
 *    (returns true -> HTTP 429) to prevent unbounded memory growth and protect server stability.
 */
export class AttemptRateLimiter {
  private readonly store = new Map<string, { count: number; resetAt: number }>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(
    public readonly maxRequests = 10,
    public readonly windowMs = 60_000,
    public readonly maxEntries = 5000,
  ) {
    this.cleanupTimer = setInterval(() => this.pruneExpired(), 60_000);
    this.cleanupTimer.unref();
  }

  get size(): number {
    return this.store.size;
  }

  checkLimit(key: string): boolean {
    const now = Date.now();
    const record = this.store.get(key);
    if (record) {
      return now <= record.resetAt && record.count >= this.maxRequests;
    }
    // New key: if store is at capacity, run eviction to attempt freeing space
    if (this.store.size >= this.maxEntries) {
      this.pruneExpired();
      // If store remains completely saturated with active blocked entries, fail-closed for new keys
      if (this.store.size >= this.maxEntries) {
        return true;
      }
    }
    return false;
  }

  record(key: string): void {
    const now = Date.now();
    const record = this.store.get(key);
    if (record) {
      if (now > record.resetAt) {
        record.count = 1;
        record.resetAt = now + this.windowMs;
      } else {
        record.count++;
      }
      return;
    }

    // New key
    if (this.store.size >= this.maxEntries) {
      this.pruneExpired();
    }
    // Only insert if space is available (preserves maxEntries cap)
    if (this.store.size < this.maxEntries) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
    }
  }

  pruneExpired(): void {
    const now = Date.now();

    // Pass 1: Prune naturally expired records
    for (const [k, rec] of this.store.entries()) {
      if (now > rec.resetAt) {
        this.store.delete(k);
      }
    }

    // Pass 2: If still at or over capacity, evict active NON-BLOCKED entries
    // (Preserves all active blocked entries: count >= maxRequests so attackers cannot unblock)
    if (this.store.size >= this.maxEntries) {
      for (const [k, rec] of this.store.entries()) {
        const isBlocked = now <= rec.resetAt && rec.count >= this.maxRequests;
        if (!isBlocked) {
          this.store.delete(k);
          if (this.store.size < this.maxEntries) break;
        }
      }
    }
  }

  clear(): void {
    this.store.clear();
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
  }
}

export const publicQuizRoutes: FastifyPluginAsync<PublicQuizRouteOptions> = async (
  app,
  opts,
) => {
  const { studioService } = opts;
  const authMiddleware = opts.sessionService && opts.userStore
    ? makeAuthMiddleware(opts as AuthMiddlewareDeps)
    : null;
  const optionalAuth = authMiddleware ? authMiddleware.optionalAuth : async () => {};
  const requireAuth = authMiddleware ? authMiddleware.requireAuth : async () => {
    throw new DomainError("unauthorized", "ورود به حساب کاربری الزامی است.");
  };

  // Independent Bounded Rate Limiting store for Public Quiz Attempt Submissions (per IP + slug)
  const rateLimiter = new AttemptRateLimiter(10, 60_000, 5000);

  app.addHook("onClose", (_instance, done) => {
    rateLimiter.destroy();
    done();
  });

  const rateLimitAttemptPreHandler = async (request: FastifyRequest) => {
    const { slug } = (request.params as { slug?: string }) || {};
    const ip = request.ip || "unknown";
    const key = `quiz_attempt_${ip}_${slug || "all"}`;

    if (rateLimiter.checkLimit(key)) {
      throw new DomainError(
        "too_many_requests",
        "تعداد تلاش‌های شما بیش از حد مجاز است. لطفاً یک دقیقه دیگر دوباره تلاش کنید.",
      );
    }
  };

  const recordAttemptSubmission = (request: FastifyRequest) => {
    const { slug } = (request.params as { slug?: string }) || {};
    const ip = request.ip || "unknown";
    const key = `quiz_attempt_${ip}_${slug || "all"}`;
    rateLimiter.record(key);
  };

  function getOptionalActor(request: FastifyRequest): Actor | null {
    const reqAny = request as unknown as {
      user?: {
        userId: string;
        email: string;
        role: string;
        globalRole?: string | null;
        memberships?: Array<{ organizationId: string; role: string }>;
      };
    };
    if (!reqAny.user) {
      return null;
    }
    return {
      userId: asUserId(reqAny.user.userId),
      role: reqAny.user.role as Actor["role"],
      globalRole: (reqAny.user.globalRole as Actor["globalRole"]) ?? undefined,
      memberships: reqAny.user.memberships?.map((m) => ({
        organizationId: asOrganizationId(m.organizationId),
        role: m.role as Actor["role"],
      })),
    };
  }

  function getActor(request: FastifyRequest): Actor {
    const actor = getOptionalActor(request);
    if (!actor) {
      throw new DomainError("unauthorized", "ورود به حساب کاربری الزامی است.");
    }
    return actor;
  }

  /**
   * Public quiz details for taking the quiz.
   * Strips correct answers and explanations!
   * Supports draft preview when preview=true for authorized studio actors.
   */
  app.get(
    "/v1/public/quizzes/:slug",
    { preHandler: [optionalAuth] },
    async (request) => {
      const { slug } = request.params as { slug: string };
      if (!slug) {
        throw new DomainError("bad_request", "اسلاگ آزمون نامعتبر است.");
      }
      const query = (request.query as Record<string, string | undefined>) ?? {};
      const isPreview = query.preview === "true" || query.preview === "1";
      const actor = getOptionalActor(request);

      const quiz = await studioService.getPublicQuizBySlug(slug, actor, isPreview);
      return { quiz };
    },
  );

  /**
   * Submits answers for a quiz attempt.
   * Open to guests; optionally records userId if logged in.
   * Score evaluation is strictly performed in backend.
   * In preview mode (preview=true on draft quiz with authorized actor),
   * evaluates score without writing to attempt store or modifying quiz stats.
   */
  app.post(
    "/v1/public/quizzes/:slug/attempt",
    { preHandler: [rateLimitAttemptPreHandler, optionalAuth] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const body = (request.body as SubmitAttemptInput) ?? { answers: {} };

      if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
        throw new DomainError("bad_request", "پاسخ‌ها به درستی ارسال نشده‌اند.");
      }

      const answerKeys = Object.keys(body.answers);
      if (answerKeys.length > 100) {
        throw new DomainError("bad_request", "تعداد پاسخ‌ها بیش از حد مجاز است.");
      }

      if (body.idempotencyKey && (typeof body.idempotencyKey !== "string" || body.idempotencyKey.length > 128)) {
        throw new DomainError("bad_request", "کلید تکرارناپذیری نامعتبر است.");
      }

      const query = (request.query as Record<string, string | undefined>) ?? {};
      const isPreview = query.preview === "true" || query.preview === "1";
      const actor = getOptionalActor(request);
      const userId = actor?.userId ?? null;

      const result = await studioService.submitQuizAttempt(
        slug,
        body,
        userId,
        actor,
        isPreview,
      );
      // Only an authorized in-memory preview of a Draft quiz is exempt from rate limiting.
      // Published quizzes (even with preview=true) and regular attempts MUST record against rate limiter.
      if (!result.isDraftPreview) {
        recordAttemptSubmission(request);
      }

      // Do not leak internal flags into the public API response
      delete result.isDraftPreview;

      reply.status(201);
      return { result };
    },
  );

  /**
   * Retrieves sanitized attempt result by secure attemptToken.
   * Viewable only by holder of the attemptToken.
   * Does NOT leak correct answers or explanations.
   */
  app.get(
    "/v1/public/quizzes/attempts/:token",
    async (request) => {
      const { token } = request.params as { token: string };
      if (!token) {
        throw new DomainError("bad_request", "توکن نتیجه الزامی است.");
      }
      const result = await studioService.getAttemptResult(token);
      return { result };
    },
  );

  /**
   * Claims an anonymous/guest attempt to the authenticated user account.
   * Strictly requires auth. Atomic and idempotent.
   */
  app.post(
    "/v1/public/quizzes/attempts/:token/claim",
    { preHandler: [requireAuth] },
    async (request) => {
      const { token } = request.params as { token: string };
      if (!token) {
        throw new DomainError("bad_request", "توکن نتیجه الزامی است.");
      }
      const actor = getActor(request);
      const claimResult = await studioService.claimQuizAttempt(actor, token);
      return claimResult;
    },
  );

  /**
   * Retrieves full solutions and explanations for an attempt.
   * STRICTLY requires authentication and verifies attempt ownership.
   */
  app.get(
    "/v1/public/quizzes/attempts/:token/solutions",
    { preHandler: [requireAuth] },
    async (request) => {
      const { token } = request.params as { token: string };
      if (!token) {
        throw new DomainError("bad_request", "توکن نتیجه الزامی است.");
      }
      const actor = getActor(request);
      const solutions = await studioService.getAttemptSolutions(actor, token);
      return { solutions };
    },
  );
};
