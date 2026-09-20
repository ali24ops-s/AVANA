/**
 * WalletService — Business Logic, Transaction Auditability, and Balance Mutations.
 *
 * Implements:
 * 1. User wallet queries (Guarded against unauthorized access and metadata leakage)
 * 2. Atomic credit operations (Subscription bonuses, top-ups, admin grants)
 * 3. Atomic debit operations (Content generation debits with balance checks)
 * 4. Atomic refund operations (Generation failure refunds with idempotency)
 * 5. Comprehensive Audit Logging for all financial state changes
 */

import {
  type Actor,
  type UserId,
  type WalletRecord,
  type WalletTransactionRecord,
  type CreditWalletInput,
  type DebitWalletInput,
  type RefundWalletInput,
  formatTomanPrice,
  DomainError,
} from "@avana/domain";
import type { WalletStore } from "./wallet-store.js";
import type { AuditService } from "../../observability/audit-service.js";

export interface UserTransactionDto {
  id: string;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  source: string;
  reference_type: string;
  reference_id: string;
  created_at: string;
}

export interface UserWalletDto {
  balance: number;
  currency: "toman";
  formatted_balance: string;
}

export interface UserTopupRequestDto {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  tracking_number: string | null;
  source_card_last4: string | null;
  payer_name: string | null;
  receipt_url: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export class WalletService {
  constructor(
    private readonly store: WalletStore,
    private readonly auditService?: AuditService,
    private readonly commerceStore?: import("../commerce/commerce-store.js").CommerceStore,
  ) {}

  /**
   * Returns current authenticated user's wallet balance.
   * Lazily initializes wallet on first read if not yet created.
   */
  async getMyWallet(actor: Actor): Promise<UserWalletDto> {
    if (!actor.userId) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const wallet = await this.store.getOrCreateWallet(actor.userId);
    return {
      balance: wallet.balance,
      currency: "toman",
      formatted_balance: formatTomanPrice(wallet.balance),
    };
  }

  /**
   * Returns list of wallet top-up requests for the authenticated user.
   */
  async listMyTopupRequests(actor: Actor): Promise<{ topups: UserTopupRequestDto[] }> {
    if (!actor.userId) {
      throw new DomainError("unauthorized", "Not signed in");
    }
    if (!this.commerceStore) {
      return { topups: [] };
    }

    const payments = await this.commerceStore.listWalletTopupRequestsByUser(actor.userId);
    const dtos: UserTopupRequestDto[] = payments.map((p) => ({
      id: p.id,
      order_id: p.orderId,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      tracking_number: p.trackingNumber ?? null,
      source_card_last4: p.sourceCardLast4 ?? null,
      payer_name: p.payerName ?? null,
      receipt_url: p.receiptUrl ?? null,
      rejection_reason: p.rejectionReason ?? null,
      created_at: p.createdAt,
      reviewed_at: p.reviewedAt ?? null,
    }));

    return { topups: dtos };
  }

  /**
   * Returns transaction history for the authenticated user only.
   * Strictly sanitizes transactions to ensure internal metadata or provider details
   * are never leaked to the client.
   */
  async listMyTransactions(
    actor: Actor,
    pagination: { limit?: number; offset?: number } = {},
  ): Promise<{ transactions: UserTransactionDto[]; total: number }> {
    if (!actor.userId) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const limit = Math.min(100, Math.max(1, pagination.limit ?? 20));
    const offset = Math.max(0, pagination.offset ?? 0);

    const { transactions, total } = await this.store.listTransactionsByUserId(
      actor.userId,
      limit,
      offset,
    );

    const sanitized: UserTransactionDto[] = transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balance_before: t.balanceBefore,
      balance_after: t.balanceAfter,
      source: t.source,
      reference_type: t.referenceType,
      reference_id: t.referenceId,
      created_at: t.createdAt,
    }));

    return {
      transactions: sanitized,
      total,
    };
  }

  /**
   * Internal service method to retrieve or lazily create a user's wallet.
   */
  async getOrCreateWallet(userId: UserId): Promise<WalletRecord> {
    return this.store.getOrCreateWallet(userId);
  }

  /**
   * Internal service method to credit a user's wallet atomically.
   */
  async credit(
    input: CreditWalletInput,
  ): Promise<{ wallet: WalletRecord; transaction: WalletTransactionRecord; isDuplicate: boolean }> {
    const result = await this.store.executeAtomicWalletMutation({
      userId: input.userId,
      mutationType: "credit",
      amount: input.amount,
      source: input.source,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });

    if (!result.isDuplicate && this.auditService) {
      await this.auditService.emit([
        {
          actorId: input.userId,
          organizationId: null,
          action: "wallet.credited",
          entityType: "wallet",
          entityId: result.wallet.id,
          createdAt: result.transaction.createdAt,
          details: {
            transactionId: result.transaction.id,
            amount: input.amount,
            source: input.source,
            balanceBefore: result.transaction.balanceBefore,
            balanceAfter: result.transaction.balanceAfter,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
          },
        },
      ]);
    }

    return result;
  }

  /**
   * Internal service method to debit a user's wallet atomically.
   * Throws DomainError('INSUFFICIENT_FUNDS') if user has insufficient credits.
   */
  async debit(
    input: DebitWalletInput,
  ): Promise<{ wallet: WalletRecord; transaction: WalletTransactionRecord; isDuplicate: boolean }> {
    const result = await this.store.executeAtomicWalletMutation({
      userId: input.userId,
      mutationType: "debit",
      amount: input.amount,
      source: input.source,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });

    if (!result.isDuplicate && this.auditService) {
      await this.auditService.emit([
        {
          actorId: input.userId,
          organizationId: null,
          action: "wallet.debited",
          entityType: "wallet",
          entityId: result.wallet.id,
          createdAt: result.transaction.createdAt,
          details: {
            transactionId: result.transaction.id,
            amount: input.amount,
            source: input.source,
            balanceBefore: result.transaction.balanceBefore,
            balanceAfter: result.transaction.balanceAfter,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
          },
        },
      ]);
    }

    return result;
  }

  /**
   * Internal service method to refund a user's wallet atomically.
   */
  async refund(
    input: RefundWalletInput,
  ): Promise<{ wallet: WalletRecord; transaction: WalletTransactionRecord; isDuplicate: boolean }> {
    const result = await this.store.executeAtomicWalletMutation({
      userId: input.userId,
      mutationType: "refund",
      amount: input.amount,
      source: input.source ?? "generation_refund",
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });

    if (!result.isDuplicate && this.auditService) {
      await this.auditService.emit([
        {
          actorId: input.userId,
          organizationId: null,
          action: "wallet.refunded",
          entityType: "wallet",
          entityId: result.wallet.id,
          createdAt: result.transaction.createdAt,
          details: {
            transactionId: result.transaction.id,
            amount: input.amount,
            source: input.source ?? "generation_refund",
            balanceBefore: result.transaction.balanceBefore,
            balanceAfter: result.transaction.balanceAfter,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
          },
        },
      ]);
    }

    return result;
  }
}
