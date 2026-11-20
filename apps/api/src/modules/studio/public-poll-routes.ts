import crypto from "crypto";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { DomainError } from "@avana/domain";
import { isValidOriginOrReferer } from "../../http/authMiddleware.js";
import { AttemptRateLimiter } from "./public-quiz-routes.js";
import type { PollService } from "./poll-service.js";
import type { SubmitPollVoteInput, PollStatus } from "./poll-types.js";

export interface PublicPollRouteOptions {
  pollService: PollService;
  allowedOrigins?: string[];
}

export interface PublicSanitizedPoll {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  status: PollStatus;
  startsAt?: Date | null;
  endsAt?: Date | null;
  settings: {
    allowAnonymous?: boolean;
    showResultsAfterVote?: boolean;
    requireAllQuestions?: boolean;
    ctaTitle?: string;
    ctaUrl?: string;
    ctaButtonText?: string;
  };
  questions?: Array<{
    id: string;
    questionText: string;
    description?: string | null;
    questionType: string;
    isRequired: boolean;
    sortOrder: number;
    minChoices?: number | null;
    maxChoices?: number | null;
    options?: Array<{
      id: string;
      optionText: string;
      sortOrder: number;
    }>;
  }>;
  userVoted?: boolean;
}

export const publicPollRoutes: FastifyPluginAsync<PublicPollRouteOptions> = async (
  app,
  opts,
) => {
  const { pollService, allowedOrigins = [] } = opts;

  // Independent Bounded Rate Limiting store for Public Poll Submissions (10 votes / min per IP + slug)
  const rateLimiter = new AttemptRateLimiter(10, 60_000, 5000);

  app.addHook("onClose", (_instance, done) => {
    rateLimiter.destroy();
    done();
  });

  const rateLimitVotePreHandler = async (request: FastifyRequest) => {
    const { slug } = (request.params as { slug?: string }) || {};
    const ip = request.ip || "unknown";
    const key = `poll_vote_${ip}_${slug || "all"}`;

    if (rateLimiter.checkLimit(key)) {
      throw new DomainError(
        "too_many_requests",
        "تعداد تلاش‌های شما بیش از حد مجاز است. لطفاً یک دقیقه دیگر دوباره تلاش کنید.",
      );
    }
  };

  const recordVoteSubmission = (request: FastifyRequest) => {
    const { slug } = (request.params as { slug?: string }) || {};
    const ip = request.ip || "unknown";
    const key = `poll_vote_${ip}_${slug || "all"}`;
    rateLimiter.record(key);
  };

  /**
   * Helper to retrieve or issue a persistent anonymous participant ID cookie.
   * Format: 24 cryptographically random bytes encoded as base64url.
   */
  function getOrSetParticipantId(request: FastifyRequest, reply: FastifyReply): string {
    const existingPid = request.cookies?.["avana_poll_pid"];
    if (existingPid && typeof existingPid === "string" && existingPid.trim().length >= 16) {
      return existingPid.trim();
    }

    const newPid = crypto.randomBytes(24).toString("base64url");
    reply.setCookie("avana_poll_pid", newPid, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 365 * 24 * 60 * 60, // 1 year
    });
    return newPid;
  }

  // ---------------------------------------------------------------------------
  // Public Poll Endpoints
  // ---------------------------------------------------------------------------

  /**
   * GET /v1/public/polls/:slug
   * Retrieves sanitized poll metadata and questions for public taking.
   * Strips administrative properties (createdBy, organizationId, deletedAt).
   * Checks whether the current participant has already voted using their cookie.
   */
  app.get(
    "/v1/public/polls/:slug",
    async (request) => {
      const { slug } = request.params as { slug: string };
      if (!slug || typeof slug !== "string") {
        throw new DomainError("bad_request", "اسلاگ نظرسنجی نامعتبر است.");
      }

      const poll = await pollService.getPollBySlug(slug);
      if (!poll || poll.deletedAt) {
        throw new DomainError("not_found", "نظرسنجی مورد نظر یافت نشد.");
      }

      if (poll.status !== "published" && poll.status !== "closed") {
        throw new DomainError("not_found", "نظرسنجی مورد نظر در دسترس نیست.");
      }

      // Check user voted status if cookie present
      let userVoted = false;
      const existingPid = request.cookies?.["avana_poll_pid"];
      if (existingPid && typeof existingPid === "string" && existingPid.trim()) {
        try {
          userVoted = await pollService.hasParticipantVoted(slug, existingPid.trim());
        } catch {
          userVoted = false;
        }
      }

      // Sanitize output for public consumers
      const sanitizedPoll: PublicSanitizedPoll = {
        id: poll.id,
        slug: poll.slug,
        title: poll.title,
        description: poll.description,
        coverImageUrl: poll.coverImageUrl,
        status: poll.status,
        startsAt: poll.startsAt,
        endsAt: poll.endsAt,
        settings: {
          allowAnonymous: poll.settings.allowAnonymous,
          showResultsAfterVote: poll.settings.showResultsAfterVote,
          requireAllQuestions: poll.settings.requireAllQuestions,
          ctaTitle: poll.settings.ctaTitle,
          ctaUrl: poll.settings.ctaUrl,
          ctaButtonText: poll.settings.ctaButtonText,
        },
        questions: (poll.questions ?? []).map((q) => ({
          id: q.id,
          questionText: q.questionText,
          description: q.description,
          questionType: q.questionType,
          isRequired: q.isRequired,
          sortOrder: q.sortOrder,
          minChoices: q.minChoices,
          maxChoices: q.maxChoices,
          options: (q.options ?? []).map((opt) => ({
            id: opt.id,
            optionText: opt.optionText,
            sortOrder: opt.sortOrder,
          })),
        })),
        userVoted,
      };

      return { poll: sanitizedPoll };
    },
  );

  /**
   * POST /v1/public/polls/:slug/vote
   * Submits answers for a public poll.
   * Protected with:
   * 1. Rate limiter (AttemptRateLimiter)
   * 2. Origin validation (if origin / referer header present)
   * 3. Anonymous participant cookie (avana_poll_pid)
   * 4. Idempotency / duplicate vote prevention via HMAC participant hash & DB unique index
   */
  app.post(
    "/v1/public/polls/:slug/vote",
    { preHandler: [rateLimitVotePreHandler] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      if (!slug || typeof slug !== "string") {
        throw new DomainError("bad_request", "اسلاگ نظرسنجی نامعتبر است.");
      }

      // Origin / Referer validation if present
      const hasOriginOrReferer = Boolean(request.headers["origin"] || request.headers["referer"]);
      if (hasOriginOrReferer) {
        const originCheck = isValidOriginOrReferer(request, allowedOrigins);
        if (!originCheck.valid) {
          throw new DomainError("forbidden", `درخواست نامعتبر از مبدا ناشناخته: ${originCheck.reason}`);
        }
      }

      const body = (request.body as SubmitPollVoteInput) ?? { answers: {} };
      if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
        throw new DomainError("bad_request", "پاسخ‌های نظرسنجی به درستی ارسال نشده‌اند.");
      }

      const answerCount = Object.keys(body.answers).length;
      if (answerCount > 100) {
        throw new DomainError("bad_request", "تعداد پاسخ‌ها بیش از حد مجاز است.");
      }

      const participantId = getOrSetParticipantId(request, reply);

      const result = await pollService.submitResponse(
        slug,
        body,
        participantId,
        {
          ip: request.ip,
          userAgent: request.headers["user-agent"],
        },
      );

      recordVoteSubmission(request);

      reply.status(201);
      return {
        success: true,
        responseId: result.responseId,
        results: result.results,
      };
    },
  );

  /**
   * GET /v1/public/polls/:slug/results
   * Public results endpoint.
   * Only returns aggregates if showResultsAfterVote is enabled.
   * Short text answers are strictly stripped from public results.
   */
  app.get(
    "/v1/public/polls/:slug/results",
    async (request) => {
      const { slug } = request.params as { slug: string };
      if (!slug || typeof slug !== "string") {
        throw new DomainError("bad_request", "اسلاگ نظرسنجی نامعتبر است.");
      }

      const results = await pollService.getPollResultsBySlug(slug, true);
      return { results };
    },
  );
};
