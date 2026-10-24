/**
 * Referral HTTP routes.
 *
 * User Endpoints:
 * - GET /v1/referrals/my-code  → Current user's referral code, invite link & stats
 * - GET /v1/referrals/me       → Alias for /v1/referrals/my-code
 * - GET /v1/referrals/history  → User's referral history (privacy-safe)
 * - GET /v1/referrals/validate/:code → Public validation check
 *
 * Admin Endpoints:
 * - GET /admin/commerce/referrals → List all referrals with filters & pagination
 * - POST /admin/commerce/referrals/retry-rewards → Trigger recovery for pending/failed rewards
 * - GET /admin/commerce/referrals/config → Get system reward config
 * - PUT /admin/commerce/referrals/config → Update system reward config
 */

import type { FastifyPluginAsync } from "fastify";
import {
  DomainError,
  type Actor,
  normalizeReferralCode,
} from "@avana/domain";
import { ReferralService } from "./referral-service.js";
import type { ReferralStore } from "./referral-store.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { WalletService } from "../wallet/wallet-service.js";
import type { NotificationService } from "../notifications/notification-service.js";
import type { AuditService } from "../../observability/audit-service.js";

export interface ReferralRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
  referralStore: ReferralStore;
  walletService?: WalletService;
  notificationService?: NotificationService;
  auditService?: AuditService;
  referralService?: ReferralService;
}

export const referralRoutes: FastifyPluginAsync<ReferralRouteOptions> = async (
  app,
  opts,
) => {
  const {
    sessionService,
    userStore,
    referralStore,
    walletService,
    notificationService,
    auditService,
  } = opts;

  const { requireAuth, requireRole } = makeAuthMiddleware({
    sessionService,
    userStore,
  });

  const service =
    opts.referralService ??
    new ReferralService(
      referralStore,
      walletService,
      notificationService,
      auditService,
    );

  function getActor(request: unknown): Actor {
    const reqAny = request as {
      user?: { userId: string; email: string; role: string };
    };
    if (!reqAny.user) {
      throw new DomainError("unauthorized", "Not signed in");
    }
    return {
      userId: reqAny.user.userId as Actor["userId"],
      role: reqAny.user.role as Actor["role"],
    };
  }

  // -----------------------------------------------------------------------
  // GET /v1/referrals/my-code & GET /v1/referrals/me
  // -----------------------------------------------------------------------
  const handleGetMyCode = async (
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
  ) => {
    const actor = getActor(request);
    const host = request.headers.host;
    const protocol = request.headers["x-forwarded-proto"] || "https";
    const baseUrl = host ? `${protocol}://${host}` : "https://aavana.ir";

    const summary = await service.getMyReferralSummary(actor, baseUrl);
    return reply.status(200).send({
      request_id: request.id,
      ...summary,
    });
  };

  app.get("/v1/referrals/my-code", { preHandler: [requireAuth] }, handleGetMyCode);
  app.get("/v1/referrals/me", { preHandler: [requireAuth] }, handleGetMyCode);

  // -----------------------------------------------------------------------
  // GET /v1/referrals/history
  // -----------------------------------------------------------------------
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>("/v1/referrals/history", { preHandler: [requireAuth] }, async (request, reply) => {
    const actor = getActor(request);
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;
    const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;

    const result = await service.getMyReferralHistory(actor, { limit, offset });
    return reply.status(200).send({
      request_id: request.id,
      referrals: result.referrals,
      total: result.total,
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/referrals/validate/:code (Public Validation)
  // -----------------------------------------------------------------------
  app.get<{
    Params: { code: string };
  }>("/v1/referrals/validate/:code", async (request, reply) => {
    const rawCode = request.params.code;
    const normalized = normalizeReferralCode(rawCode);
    if (!normalized) {
      return reply.status(200).send({ valid: false, code: "" });
    }

    const codeRecord = await referralStore.findReferralCodeByCode(normalized);
    if (!codeRecord) {
      return reply.status(200).send({ valid: false, code: normalized });
    }

    return reply.status(200).send({
      valid: true,
      code: codeRecord.code,
    });
  });

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  // Admin Endpoints
  // Dual-registered (/v1/admin/commerce/referrals* and /admin/commerce/referrals*)
  // for strict REST /v1 client standardization and backward compatibility.
  // -----------------------------------------------------------------------

  const adminReferralPaths = [
    "/v1/admin/commerce/referrals",
    "/admin/commerce/referrals",
  ];
  for (const path of adminReferralPaths) {
    app.get<{
      Querystring: { status?: string; limit?: string; offset?: string };
    }>(
      path,
      { preHandler: [requireAuth, requireRole("platform_admin")] },
      async (request, reply) => {
        const actor = getActor(request);
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
        const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;
        const status = request.query.status;

        const result = await service.listAllReferralsForAdmin(
          actor,
          status ? { status } : undefined,
          { limit, offset },
        );

        return reply.status(200).send({
          request_id: request.id,
          referrals: result.referrals,
          total: result.total,
        });
      },
    );
  }

  const adminRetryPaths = [
    "/v1/admin/commerce/referrals/retry-rewards",
    "/admin/commerce/referrals/retry-rewards",
  ];
  for (const path of adminRetryPaths) {
    app.post(
      path,
      { preHandler: [requireAuth, requireRole("platform_admin")] },
      async (request, reply) => {
        const result = await service.retryPendingRewards();
        return reply.status(200).send({
          request_id: request.id,
          ...result,
        });
      },
    );
  }

  const adminConfigPaths = [
    "/v1/admin/commerce/referrals/config",
    "/admin/commerce/referrals/config",
  ];
  for (const path of adminConfigPaths) {
    app.get(
      path,
      { preHandler: [requireAuth, requireRole("platform_admin")] },
      async (request, reply) => {
        const config = await service.getReferralSystemConfig();
        return reply.status(200).send({
          request_id: request.id,
          config,
        });
      },
    );

    app.put<{
      Body: {
        enabled?: boolean;
        rewardDays?: number;
        reward_days?: number;
        rewardAmount?: number;
        reward_amount?: number;
        maxRewardedReferrals?: number;
        max_referrals?: number;
        maxRewardDays?: number;
        max_reward_days?: number;
      };
    }>(
      path,
      { preHandler: [requireAuth, requireRole("platform_admin")] },
      async (request, reply) => {
        const actor = getActor(request);
        const body = request.body || {};

        const rawRewardDays =
          body.rewardDays ?? body.reward_days ?? body.rewardAmount ?? body.reward_amount;
        let rewardDays: number | undefined;
        if (rawRewardDays !== undefined) {
          const parsed = Number(rawRewardDays);
          if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 365) {
            throw new DomainError(
              "bad_request",
              "مدت اشتراک رایگان باید عددی صحیح بین ۰ تا ۳۶۵ روز باشد",
            );
          }
          rewardDays = parsed;
        }

        const rawMaxReferrals =
          body.maxRewardedReferrals ?? body.max_referrals;
        let maxRewardedReferrals: number | undefined;
        if (rawMaxReferrals !== undefined) {
          const parsed = Number(rawMaxReferrals);
          if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
            throw new DomainError(
              "bad_request",
              "سقف تعداد دعوت‌های پاداش‌دار باید عددی صحیح بین ۱ تا ۱۰۰ باشد",
            );
          }
          maxRewardedReferrals = parsed;
        }

        const updated = await service.updateReferralSystemConfig(actor, {
          enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
          rewardDays,
          rewardAmount: rewardDays,
          maxRewardedReferrals,
        });

        return reply.status(200).send({
          request_id: request.id,
          config: updated,
        });
      },
    );
  }
};
