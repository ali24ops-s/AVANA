/**
 * Presentation Generation Operation Service.
 *
 * Orchestrates financial lifecycle, atomic DB concurrency locking, AI execution,
 * content persistence, and crash recovery with refund guarantees.
 */

import { randomUUID } from "node:crypto";
import {
  type Actor,
  type PresentationProjectId,
  type PresentationSlideId,
  type PresentationBatchId,
  type PresentationGenerationOperationRecord,
  type PresentationGenerationInstructions,
  type SlideGenerationResult,
  PRESENTATION_SLIDE_COST_TOMAN,
  DomainError,
} from "@avana/domain";
import type { PresentationGenerationOperationStore } from "./presentation-generation-operation-store.js";
import type { PresentationSlideStore } from "./presentation-store.js";
import type { PresentationGenerationService } from "./presentation-generation-service.js";
import type { PresentationLayoutService } from "./presentation-layout-service.js";
import type { WalletService } from "../wallet/wallet-service.js";

export interface ExecuteSlideGenerationParams {
  actor: Actor;
  projectId: PresentationProjectId;
  slideId: PresentationSlideId;
  batchId?: PresentationBatchId;
  idempotencyKey?: string;
  instructions?: PresentationGenerationInstructions;
  previousSlideSummary?: string | null;
  nextSlideTitle?: string | null;
  allSlidesOutline?: Array<{ slideIndex: number; title: string | null }>;
  coveredKeyConcepts?: string[];
  onSnapshotNeeded?: () => Promise<void>;
}

export interface ExecuteSlideGenerationResult {
  operation: PresentationGenerationOperationRecord;
  generationResult: SlideGenerationResult;
  costToman: number;
  isAlreadyPaid: boolean;
}

export interface StaleOperationRecoveryStats {
  examined: number;
  refunded: number;
  completed: number;
  failedWithoutRefund: number;
  skippedActiveLock: number;
}

export class PresentationGenerationOperationService {
  constructor(
    private readonly operationStore: PresentationGenerationOperationStore,
    private readonly slideStore: PresentationSlideStore,
    private readonly generationService: PresentationGenerationService,
    private readonly walletService?: WalletService,
    private readonly layoutService?: PresentationLayoutService,
  ) {}

  /**
   * Executes slide generation with complete financial lifecycle management:
   * 1. Check paid state & calculate cost
   * 2. Atomic Claim in database (blocks concurrency before debit)
   * 3. Atomic Debit (if cost > 0) with dedicated idempotency key
   * 4. Transition to generating
   * 5. Call Gemini AI via PresentationGenerationService
   * 6. Persist speech content and payment fields upon success -> mark completed
   * 7. Issue atomic refund upon any failure if debited -> mark refunded
   */
  async executeSlideGeneration(
    params: ExecuteSlideGenerationParams,
  ): Promise<ExecuteSlideGenerationResult> {
    const { actor, projectId, slideId, batchId, idempotencyKey, instructions } = params;

    const slide = await this.slideStore.findById(slideId, projectId);
    if (!slide) {
      throw new DomainError("not_found", "Presentation slide not found");
    }

    // Determine if slide has valid prior payment for free regeneration
    const isAlreadyPaid = Boolean(slide.paidAt && slide.paymentTransactionId);
    const costToman = isAlreadyPaid ? 0 : PRESENTATION_SLIDE_COST_TOMAN;

    // Construct persistent idempotency key
    const opIdempotencyKey =
      idempotencyKey ||
      (batchId
        ? `batch_${batchId}_slide_${slideId}_${randomUUID()}`
        : `slide_gen_${slideId}_${randomUUID()}`);

    // STEP 1: Atomic Claim BEFORE Debit
    // This utilizes DB unique constraints (idx_pres_gen_ops_active_slide)
    // to block parallel generation requests before debiting a single Toman.
    const operation = await this.operationStore.claimOperation({
      projectId,
      slideId,
      userId: actor.userId,
      batchId: batchId ?? null,
      costToman,
      idempotencyKey: opIdempotencyKey,
    });

    let currentOp = operation;

    // STEP 2: Debit wallet (if unpaid)
    if (costToman > 0 && this.walletService) {
      try {
        const debitResult = await this.walletService.debit({
          userId: actor.userId,
          amount: costToman,
          source: "content_generation",
          referenceType: "presentation_slide",
          referenceId: slideId,
          idempotencyKey: `debit_op_${operation.id}`,
          metadata: {
            projectId,
            slideIndex: slide.slideIndex,
            operationId: operation.id,
            batchId: batchId ?? null,
          },
        });

        currentOp = await this.operationStore.updateStatus(operation.id, {
          expectedCurrentStatuses: ["pending"],
          status: "debited",
          debitTransactionId: debitResult.transaction.id,
        });
      } catch (debitErr) {
        await this.operationStore.updateStatus(operation.id, {
          expectedCurrentStatuses: ["pending"],
          status: "failed",
          lastError: debitErr instanceof Error ? debitErr.message : String(debitErr),
        }).catch(() => {});

        throw debitErr;
      }
    }

    // STEP 3: Transition to generating
    currentOp = await this.operationStore.updateStatus(operation.id, {
      expectedCurrentStatuses: ["pending", "debited"],
      status: "generating",
    });

    await this.slideStore.updateSlide(slideId, projectId, {
      extractionMetadata: {
        ...(slide.extractionMetadata || {}),
        generationStatus: "generating",
        lastError: null,
      },
    }).catch(() => {});

    // STEP 4: Prepare Snapshot if callback provided
    if (params.onSnapshotNeeded) {
      try {
        await params.onSnapshotNeeded();
      } catch {
        // Snapshot error is non-fatal or will fail generation
      }
    }

    // STEP 5: Invoke Gemini Generation
    try {
      const generationResult = await this.generationService.generateSlide({
        actor,
        projectId,
        slideId,
        instructions,
        previousSlideSummary: params.previousSlideSummary,
        nextSlideTitle: params.nextSlideTitle,
        allSlidesOutline: params.allSlidesOutline,
        coveredKeyConcepts: params.coveredKeyConcepts,
      });

      if (generationResult.status === "accepted") {
        // STEP 6: Success Path — Persist content and payment info
        const nowIso = new Date().toISOString();
        const finalPaymentTxId = isAlreadyPaid
          ? slide.paymentTransactionId
          : currentOp.debitTransactionId;
        const finalPaidAt = isAlreadyPaid ? slide.paidAt : nowIso;

        await this.slideStore.updateSlide(slideId, projectId, {
          paymentTransactionId: finalPaymentTxId,
          paidAt: finalPaidAt,
          extractionMetadata: {
            ...(slide.extractionMetadata || {}),
            generationStatus: "accepted",
            lastError: null,
            speechContent: generationResult.speechContent,
          },
        });

        // Assemble layout if layout service provided
        if (this.layoutService) {
          try {
            await this.layoutService.assembleAndPersistLayout({
              actor,
              projectId,
              slideId,
            });
          } catch {
            // Layout assembly failure is non-fatal
          }
        }

        // Mark operation completed
        currentOp = await this.operationStore.updateStatus(operation.id, {
          expectedCurrentStatuses: ["generating"],
          status: "completed",
          completedAt: nowIso,
        });

        return {
          operation: currentOp,
          generationResult,
          costToman,
          isAlreadyPaid,
        };
      } else {
        // Validation failed or rejected by generator
        throw new DomainError(
          "bad_request",
          `تولید محتوای اسلاید مورد پذیرش قرار نگرفت (${generationResult.status})`,
        );
      }
    } catch (genErr) {
      // STEP 7: Failure Path — Automatic Idempotent Refund
      const errMsg = genErr instanceof Error ? genErr.message : String(genErr);

      if (currentOp.debitTransactionId && costToman > 0 && this.walletService) {
        try {
          // Transition to refund_pending
          currentOp = await this.operationStore.updateStatus(operation.id, {
            expectedCurrentStatuses: ["debited", "generating"],
            status: "refund_pending",
            lastError: errMsg,
          });

          const refundResult = await this.walletService.refund({
            userId: actor.userId,
            amount: costToman,
            source: "generation_refund",
            referenceType: "presentation_slide",
            referenceId: slideId,
            idempotencyKey: `refund_op_${operation.id}`,
            metadata: {
              reason: errMsg,
              failed_op_id: operation.id,
              debit_transaction_id: currentOp.debitTransactionId,
            },
          });

          currentOp = await this.operationStore.updateStatus(operation.id, {
            expectedCurrentStatuses: ["refund_pending"],
            status: "refunded",
            refundTransactionId: refundResult.transaction.id,
            refundedAt: new Date().toISOString(),
          });
        } catch (refundErr) {
          // Refund attempt failed, keep refund_pending for autonomous recovery cycle
          await this.operationStore.updateStatus(operation.id, {
            status: "refund_pending",
            lastError: `Generation failed: ${errMsg}. Refund error: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`,
          }).catch(() => {});
        }
      } else {
        // Free regeneration failure (no refund needed)
        await this.operationStore.updateStatus(operation.id, {
          expectedCurrentStatuses: ["pending", "generating"],
          status: "failed",
          lastError: errMsg,
        }).catch(() => {});
      }

      // Mark slide as failed
      await this.slideStore.updateSlide(slideId, projectId, {
        extractionMetadata: {
          ...(slide.extractionMetadata || {}),
          generationStatus: "failed",
          lastError: errMsg,
        },
        paymentTransactionId: isAlreadyPaid ? slide.paymentTransactionId : null,
        paidAt: isAlreadyPaid ? slide.paidAt : null,
      }).catch(() => {});

      throw genErr;
    }
  }

  /**
   * Autonomous Crash Recovery Cycle:
   * Inspects stale in-flight operations (> thresholdMs) and resolves their financial state:
   * 1. Checks if slide actually completed & saved -> marks completed (No refund).
   * 2. Checks if debit occurred (via record or wallet ledger idempotency) -> issues refund and marks refunded.
   * 3. Stale operations without debit -> marked failed.
   * 4. Multi-worker safe: Claims atomic lock per operation to prevent duplicate processing.
   */
  async recoverStaleOperations(
    staleThresholdMs = 5 * 60 * 1000,
    workerId = `recovery_worker_${process.pid}_${Date.now()}`,
  ): Promise<StaleOperationRecoveryStats> {
    const stats: StaleOperationRecoveryStats = {
      examined: 0,
      refunded: 0,
      completed: 0,
      failedWithoutRefund: 0,
      skippedActiveLock: 0,
    };

    const staleOps = await this.operationStore.findStaleOperations(staleThresholdMs);
    stats.examined = staleOps.length;

    for (const op of staleOps) {
      // 1. Claim atomic recovery lock
      const claimed = await this.operationStore.claimStaleOperation(op.id, workerId, 120);
      if (!claimed) {
        stats.skippedActiveLock++;
        continue;
      }

      try {
        const slide = await this.slideStore.findById(op.slideId, op.projectId);

        // 2. Defensive Check: Did slide actually complete & save before the crash?
        const hasValidSavedContent = Boolean(
          slide &&
            (slide.speakerNotes || slide.extractionMetadata?.speechContent) &&
            slide.paymentTransactionId &&
            slide.paidAt,
        );

        if (hasValidSavedContent) {
          // Slide completed successfully, keep payment and mark operation completed
          await this.operationStore.updateStatus(op.id, {
            status: "completed",
            completedAt: op.completedAt || new Date().toISOString(),
          });
          stats.completed++;
          continue;
        }

        // 3. Financial Check: Did a debit actually occur?
        let effectiveDebitTxId = op.debitTransactionId;
        if (!effectiveDebitTxId && op.costToman > 0 && this.walletService) {
          // Check if wallet recorded the debit despite server crashing before DB update
          const debitTx = await this.walletService.findTransactionByIdempotencyKey(
            `debit_op_${op.id}`,
          );
          if (debitTx) {
            effectiveDebitTxId = debitTx.id;
          }
        }

        // 4. If debited, issue refund
        if (effectiveDebitTxId && op.costToman > 0 && this.walletService) {
          await this.operationStore.updateStatus(op.id, {
            status: "refund_pending",
            debitTransactionId: effectiveDebitTxId,
          });

          const refundResult = await this.walletService.refund({
            userId: op.userId,
            amount: op.costToman,
            source: "generation_refund",
            referenceType: "presentation_slide",
            referenceId: op.slideId,
            idempotencyKey: `refund_op_${op.id}`,
            metadata: {
              reason: "crash_recovery_refund",
              failed_op_id: op.id,
              debit_transaction_id: effectiveDebitTxId,
              recovered_by: workerId,
            },
          });

          await this.operationStore.updateStatus(op.id, {
            status: "refunded",
            refundTransactionId: refundResult.transaction.id,
            refundedAt: new Date().toISOString(),
            lastError: "عملیات تولید به دلیل وقفه سیستم لغو و هزینه عودت داده شد.",
          });

          // Mark slide as failed
          if (slide) {
            await this.slideStore.updateSlide(op.slideId, op.projectId, {
              extractionMetadata: {
                ...(slide.extractionMetadata || {}),
                generationStatus: "failed",
                lastError: "عملیات تولید به دلیل وقفه سیستم لغو و هزینه عودت داده شد.",
              },
              paymentTransactionId: null,
              paidAt: null,
            }).catch(() => {});
          }

          stats.refunded++;
        } else {
          // 5. No debit was performed or cost was 0 (free regeneration)
          await this.operationStore.updateStatus(op.id, {
            status: "failed",
            lastError: "عملیات تولید به دلیل وقفه سیستم لغو گردید.",
          });

          if (slide) {
            const isSlidePriorPaid = Boolean(slide.paidAt && slide.paymentTransactionId);
            await this.slideStore.updateSlide(op.slideId, op.projectId, {
              extractionMetadata: {
                ...(slide.extractionMetadata || {}),
                generationStatus: "failed",
                lastError: "عملیات تولید به دلیل وقفه سیستم لغو گردید.",
              },
              // Keep prior payment intact if it was already paid prior to this attempt
              paymentTransactionId: isSlidePriorPaid ? slide.paymentTransactionId : null,
              paidAt: isSlidePriorPaid ? slide.paidAt : null,
            }).catch(() => {});
          }

          stats.failedWithoutRefund++;
        }
      } catch (recoveryErr) {
        // Recovery failed on this item; will be retried on next cycle after lock expiry
        await this.operationStore.updateStatus(op.id, {
          status: op.status,
          lastError: `Recovery error: ${recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr)}`,
        }).catch(() => {});
      }
    }

    return stats;
  }
}
