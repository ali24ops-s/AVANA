/**
 * Shared refund helper for generation jobs.
 *
 * Ensures a single authoritative implementation for generation debit refunds across:
 * - Generation processor (terminal errors, stopped errors, post-execution stops)
 * - Generation routes / lifecycle (queued job stops, enqueue failures)
 * - Generation recovery service (stale lease expiry, orphaned jobs)
 */

import type { GenerationJobId, DocumentId, OrganizationId, UserId } from "@avana/domain";
import type { WalletService } from "../wallet/wallet-service.js";
import type { WalletStore } from "../wallet/wallet-store.js";

export interface RefundGenerationJobParams {
  walletService?: WalletService;
  walletStore?: WalletStore;
  jobId: GenerationJobId | string;
  actorUserId?: UserId | string;
  documentId?: DocumentId;
  organizationId?: OrganizationId;
  reason: string;
}

/**
 * Atomically and idempotently refund the exact original debit for a generation job.
 *
 * Invariants:
 * 1. Queries original debit via idempotencyKey `generation-debit:${jobId}`.
 * 2. If no original debit exists (e.g. admin generation, free retry, zero-cost), does NOTHING.
 * 3. Uses idempotencyKey `generation-refund:${jobId}` to guarantee exactly-once refund execution.
 * 4. Uses the exact original debit amount from the ledger.
 * 5. Uses the debited user ID (from original debit or fallback to actorUserId).
 */
export async function refundGenerationJobDebit(
  params: RefundGenerationJobParams,
): Promise<{ refunded: boolean; amount?: number }> {
  const { walletService, walletStore, jobId, reason, documentId, organizationId } = params;
  if (!walletService || !walletStore || !jobId) {
    return { refunded: false };
  }

  try {
    const originalDebit = await walletStore.findTransactionByIdempotencyKey(
      `generation-debit:${jobId}`,
    );

    if (!originalDebit || originalDebit.amount <= 0) {
      return { refunded: false };
    }

    const targetUserId = (params.actorUserId ?? originalDebit.userId) as UserId;

    await walletService.refund({
      userId: targetUserId,
      amount: originalDebit.amount,
      source: "generation_refund",
      referenceType: "generation_job",
      referenceId: jobId,
      idempotencyKey: `generation-refund:${jobId}`,
      metadata: {
        jobId,
        documentId,
        organizationId,
        reason,
      },
    });

    process.stdout.write(
      `[GENERATION] Refunded ${originalDebit.amount} Tomans for job ${jobId} (reason: ${reason})\n`,
    );

    return { refunded: true, amount: originalDebit.amount };
  } catch (err) {
    process.stderr.write(
      `[GENERATION] Failed to refund debit for job ${jobId}: ${String(err)}\n`,
    );
    return { refunded: false };
  }
}
