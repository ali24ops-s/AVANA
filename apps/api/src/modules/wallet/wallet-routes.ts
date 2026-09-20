/**
 * Wallet HTTP routes (Phase 1).
 *
 * Exposes strictly read-only endpoints for the authenticated user:
 * - GET /v1/wallet/me           → Current balance & currency
 * - GET /v1/wallet              → Alias for /v1/wallet/me
 * - GET /v1/wallet/transactions → User's transaction ledger history
 *
 * Financial mutations (Credit, Debit, Refund) are internal-only service operations
 * and are NOT exposed as public mutation endpoints.
 */

import type { FastifyPluginAsync } from "fastify";
import {
  DomainError,
  type Actor,
} from "@avana/domain";
import { WalletService } from "./wallet-service.js";
import type { WalletStore } from "./wallet-store.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { AuditService } from "../../observability/audit-service.js";

export interface WalletRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
  walletStore: WalletStore;
  commerceStore?: import("../commerce/commerce-store.js").CommerceStore;
  auditService?: AuditService;
}

export const walletRoutes: FastifyPluginAsync<WalletRouteOptions> = async (
  app,
  opts,
) => {
  const { sessionService, userStore, walletStore, commerceStore, auditService } = opts;
  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });
  const service = new WalletService(walletStore, auditService, commerceStore);

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
  // GET /v1/wallet/me & GET /v1/wallet
  // -----------------------------------------------------------------------
  const handleGetWallet = async (request: unknown) => {
    const req = request as { id: string };
    const actor = getActor(req);
    const wallet = await service.getMyWallet(actor);

    return {
      request_id: req.id,
      balance: wallet.balance,
      currency: wallet.currency,
      formatted_balance: wallet.formatted_balance,
    };
  };

  app.get("/v1/wallet/me", { preHandler: [requireAuth] }, handleGetWallet);
  app.get("/v1/wallet", { preHandler: [requireAuth] }, handleGetWallet);

  // -----------------------------------------------------------------------
  // GET /v1/wallet/topups & GET /v1/wallet/me/topups
  // -----------------------------------------------------------------------
  const handleGetTopups = async (request: unknown) => {
    const req = request as { id: string };
    const actor = getActor(req);
    const result = await service.listMyTopupRequests(actor);

    return {
      request_id: req.id,
      topups: result.topups,
    };
  };

  app.get("/v1/wallet/topups", { preHandler: [requireAuth] }, handleGetTopups);
  app.get("/v1/wallet/me/topups", { preHandler: [requireAuth] }, handleGetTopups);

  // -----------------------------------------------------------------------
  // GET /v1/wallet/transactions & GET /v1/wallet/me/transactions
  // -----------------------------------------------------------------------
  const handleGetTransactions = async (request: unknown) => {
    const req = request as {
      id: string;
      query: { limit?: string; offset?: string };
    };
    const actor = getActor(req);
    const limit = req.query?.limit ? parseInt(req.query.limit, 10) : undefined;
    const offset = req.query?.offset ? parseInt(req.query.offset, 10) : undefined;

    const result = await service.listMyTransactions(actor, { limit, offset });

    return {
      request_id: req.id,
      transactions: result.transactions,
      total: result.total,
    };
  };

  app.get(
    "/v1/wallet/transactions",
    { preHandler: [requireAuth] },
    handleGetTransactions,
  );
  app.get(
    "/v1/wallet/me/transactions",
    { preHandler: [requireAuth] },
    handleGetTransactions,
  );
};
