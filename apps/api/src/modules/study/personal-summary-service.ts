/**
 * Personal Summary Service.
 *
 * Coordinates AI-powered personal summary generation from user's own highlights and notes.
 * Enforces:
 * - 3,000 Toman wallet deduction & automatic idempotent refund on failure.
 * - Persistent DB lease with active heartbeat extension during Gemini calls.
 * - Stale lease reclamation and crash recovery.
 * - Strictly isolated personal data & non-overwriting monotonic versioning.
 * - Snapshot-grounded educational synthesis via Gemini.
 */

import { randomUUID } from "node:crypto";
import {
  DomainError,
  type Actor,
  type UserId,
  type CourseId,
  type OrganizationId,
  type DocumentId,
  type AuthorizationPolicy,
  type ResourceContext,
  validateReviewSummaryPayload,
  buildActor,
  defaultPolicy,
} from "@avana/domain";
import type {
  GetPersonalSummaryResponse,
  GeneratePersonalSummaryResponse,
  PersonalSummaryDto,
  PersonalContentSnapshot,
} from "@avana/contracts";
import type { PersonalSummaryStore, PersonalSummaryRecord } from "./personal-summary-store.js";
import type { WalletService } from "../wallet/wallet-service.js";
import type { ModelGateway } from "../generation/gateway/types.js";
import type { ModuleStore, LessonStore } from "../learning/learning-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import { cleanAndParseJson } from "../generation/engine/resilient-json-parser.js";

export const PERSONAL_SUMMARY_COST_TOMAN = 3000;
export const PERSONAL_SUMMARY_LEASE_DURATION_MS = 180_000; // 3 minutes
export const HEARTBEAT_INTERVAL_MS = 10_000; // 10 seconds

export interface PersonalSummaryRecoveryCycleStats {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  recordsExamined: number;
  recordsRecovered: number;
  refundsSuccessful: number;
  refundsFailed: number;
  unexpectedErrors: number;
}

export class PersonalSummaryService {
  constructor(
    private readonly store: PersonalSummaryStore,
    private readonly walletService: WalletService,
    private readonly gateway: ModelGateway,
    private readonly moduleStore: ModuleStore,
    _lessonStore: LessonStore,
    private readonly courseStore: CourseStore,
    private readonly organizationStore?: OrganizationStore,
    private readonly policy: AuthorizationPolicy = defaultPolicy,
    private readonly systemOrganizationId?: OrganizationId,
  ) {}

  /**
   * Verify actor has read access to the module's course.
   */
  private async verifyModuleAccess(
    actor: Actor,
    moduleId: string,
  ): Promise<{ courseId: CourseId; organizationId: OrganizationId; moduleTitle: string }> {
    const moduleRecord = await this.moduleStore.findById(moduleId);
    if (!moduleRecord) {
      throw new DomainError("not_found", "Module/Chapter not found");
    }

    const course = await this.courseStore.findByIdForUser(
      moduleRecord.courseId,
      actor.userId,
      this.systemOrganizationId,
    );
    if (!course) {
      throw new DomainError(
        "forbidden",
        "You do not have access to this course or chapter",
      );
    }

    const isSystemResource =
      !!this.systemOrganizationId &&
      this.systemOrganizationId === course.organizationId;

    const memberships = this.organizationStore
      ? await this.organizationStore.listMembershipsByUserId(actor.userId)
      : [];

    const fullActor = buildActor({
      userId: actor.userId,
      globalRole: actor.globalRole,
      role: actor.role,
      memberships,
    });

    const resourceContext: ResourceContext = {
      organizationId: course.organizationId,
      resourceType: "module",
      resourceId: moduleRecord.id,
      courseId: course.id,
      moduleId: moduleRecord.id,
      isSystemResource,
    };

    if (!this.policy.can(fullActor, "study:read", resourceContext)) {
      throw new DomainError(
        "forbidden",
        "You do not have access to this course or chapter",
      );
    }

    return {
      courseId: course.id,
      organizationId: course.organizationId,
      moduleTitle: moduleRecord.title,
    };
  }

  /**
   * Reconcile any expired pending generation attempts for this user and module.
   * If a previous generation crashed or timed out after debit, refunds the user automatically.
   */
  async sweepExpiredPending(userId?: UserId, moduleId?: string): Promise<void> {
    const now = new Date();
    const expiredList = await this.store.findExpiredPending(now);
    const targetExpired = expiredList.filter((r) => {
      if (userId && r.userId !== userId) return false;
      if (moduleId && r.moduleId !== moduleId) return false;
      return true;
    });

    for (const record of targetExpired) {
      if (
        record.transactionId &&
        (record.refundStatus === "none" || record.refundStatus === "pending")
      ) {
        try {
          const refundRes = await this.walletService.refund({
            userId: record.userId as UserId,
            amount: record.costToman,
            source: "generation_refund",
            referenceType: "generation_job",
            referenceId: record.id,
            idempotencyKey: `refund_ps_${record.id}`,
            metadata: {
              reason: "stale_lease_or_pending_refund_recovery",
              originalFailureReason: record.failureReason,
            },
          });

          await this.store.markFailed(
            record.id,
            record.failureReason ?? "lease_expired_crash_recovery",
            refundRes.transaction.id,
            "refunded",
          );
        } catch {
          await this.store.markFailed(
            record.id,
            record.failureReason ?? "lease_expired_crash_recovery",
            null,
            "pending",
          );
        }
      } else if (record.status === "pending") {
        await this.store.markFailed(
          record.id,
          "lease_expired_crash_recovery",
          null,
          record.refundStatus,
        );
      }
    }
  }

  /**
   * Atomically claims and recovers a batch of expired or pending-refund records.
   * Safe for concurrent execution across multiple API/Worker instances (SKIP LOCKED).
   * Never invokes Gemini during recovery.
   */
  async claimAndRecoverBatch(
    workerId: string = `recovery-${randomUUID().slice(0, 8)}`,
    limit = 50,
  ): Promise<PersonalSummaryRecoveryCycleStats> {
    const startedAt = new Date();
    let recordsRecovered = 0;
    let refundsSuccessful = 0;
    let refundsFailed = 0;
    let unexpectedErrors = 0;

    let claimedRecords: PersonalSummaryRecord[] = [];
    try {
      claimedRecords = await this.store.claimExpiredPending(workerId, 120, limit);
    } catch {
      unexpectedErrors++;
      const completedAt = new Date();
      return {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        recordsExamined: 0,
        recordsRecovered: 0,
        refundsSuccessful: 0,
        refundsFailed: 0,
        unexpectedErrors,
      };
    }

    for (const record of claimedRecords) {
      try {
        if (
          record.transactionId &&
          (record.refundStatus === "none" || record.refundStatus === "pending")
        ) {
          try {
            const refundRes = await this.walletService.refund({
              userId: record.userId as UserId,
              amount: record.costToman,
              source: "generation_refund",
              referenceType: "generation_job",
              referenceId: record.id,
              idempotencyKey: `refund_ps_${record.id}`,
              metadata: {
                reason: "autonomous_recovery_cycle",
                originalFailureReason: record.failureReason,
                recoveredByWorkerId: workerId,
              },
            });

            await this.store.markFailed(
              record.id,
              record.failureReason ?? "lease_expired_crash_recovery",
              refundRes.transaction.id,
              "refunded",
            );
            refundsSuccessful++;
            recordsRecovered++;
          } catch {
            await this.store.markFailed(
              record.id,
              record.failureReason ?? "lease_expired_crash_recovery",
              null,
              "pending",
            );
            refundsFailed++;
          }
        } else if (record.status === "pending") {
          await this.store.markFailed(
            record.id,
            "lease_expired_crash_recovery",
            null,
            record.refundStatus,
          );
          recordsRecovered++;
        }
      } catch {
        unexpectedErrors++;
      }
    }

    const completedAt = new Date();
    return {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      recordsExamined: claimedRecords.length,
      recordsRecovered,
      refundsSuccessful,
      refundsFailed,
      unexpectedErrors,
    };
  }

  /**
   * Maps store record to client DTO.
   */
  private toDto(record: PersonalSummaryRecord): PersonalSummaryDto {
    return {
      id: record.id,
      userId: record.userId,
      courseId: record.courseId,
      moduleId: record.moduleId,
      contentType: record.contentType,
      version: record.version,
      status: record.status,
      payload: record.payload,
      highlightsCount: record.highlightsCount,
      notesCount: record.notesCount,
      costToman: record.costToman,
      transactionId: record.transactionId,
      refundTransactionId: record.refundTransactionId,
      refundStatus: record.refundStatus,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Get personal summary status for a chapter.
   */
  async getPersonalSummary(
    actor: Actor,
    moduleId: string,
  ): Promise<GetPersonalSummaryResponse> {
    await this.verifyModuleAccess(actor, moduleId);
    await this.sweepExpiredPending(actor.userId, moduleId);

    const annotations = await this.store.findAnnotationsForModule(
      actor.userId,
      moduleId,
    );

    const highlightsCount = annotations.filter((a) => a.type === "highlight").length;
    const notesCount = annotations.filter((a) => a.type === "note").length;

    const latestCompleted = await this.store.findLatestCompleted(
      actor.userId,
      moduleId,
      "review_summary",
    );

    let hasNewAnnotations = false;
    if (latestCompleted) {
      const snapItems = latestCompleted.inputSnapshot?.items ?? [];
      const snapIds = new Set(snapItems.map((i) => i.id));
      hasNewAnnotations = annotations.some((a) => !snapIds.has(a.id));
    }

    return {
      has_personal_summary: Boolean(latestCompleted),
      summary: latestCompleted ? this.toDto(latestCompleted) : null,
      current_annotations: {
        highlights_count: highlightsCount,
        notes_count: notesCount,
        total_count: annotations.length,
        has_new_annotations: hasNewAnnotations,
      },
      cost_toman: PERSONAL_SUMMARY_COST_TOMAN,
    };
  }

  /**
   * Generate (or re-generate) personal summary from user's current annotations.
   */
  async generatePersonalSummary(
    actor: Actor,
    moduleId: string,
  ): Promise<GeneratePersonalSummaryResponse> {
    const recordId = randomUUID();
    const { courseId, organizationId, moduleTitle } = await this.verifyModuleAccess(actor, moduleId);
    const moduleRecord = await this.moduleStore.findById(moduleId);
    const documentId = (moduleRecord?.documentId ?? recordId) as DocumentId;

    // 1. Recover any prior crashed/expired leases for this module
    await this.sweepExpiredPending(actor.userId, moduleId);

    // 2. Check for active in-flight generation
    const activePending = await this.store.findActivePending(
      actor.userId,
      moduleId,
      "review_summary",
    );
    if (activePending) {
      throw new DomainError(
        "conflict",
        "یک عملیات تولید خلاصه شخصی برای این فصل در حال اجراست. لطفاً چند لحظه صبر کنید.",
      );
    }

    // 3. Extract annotations directly from real database model
    const annotations = await this.store.findAnnotationsForModule(
      actor.userId,
      moduleId,
    );

    if (annotations.length === 0) {
      throw new DomainError(
        "bad_request",
        "شما هنوز هیچ هایلایت یا یادداشتی در درسنامه‌های این فصل ثبت نکرده‌اید. برای ساخت خلاصه شخصی، ابتدا نکات مهم را هایلایت کنید یا یادداشت بنویسید.",
      );
    }

    // Extract item counts strictly from the snapshot
    const highlightsCount = annotations.filter((a) => a.type === "highlight").length;
    const notesCount = annotations.filter((a) => a.type === "note").length;

    const snapshot: PersonalContentSnapshot = {
      capturedAt: new Date().toISOString(),
      moduleId,
      moduleTitle,
      courseId,
      totalHighlights: highlightsCount,
      totalNotes: notesCount,
      items: annotations,
    };

    // 4. Calculate next monotonic version
    const nextVersion = await this.store.getNextVersion(
      actor.userId,
      moduleId,
      "review_summary",
    );

    const workerId = `worker_${process.pid}_${Date.now()}`;
    const idempotencyKey = `ps_gen_${actor.userId}_${moduleId}_v${nextVersion}`;
    const leaseExpiresAt = new Date(Date.now() + PERSONAL_SUMMARY_LEASE_DURATION_MS);

    // 5. Create pending record BEFORE financial debit to ensure traceable reference
    await this.store.createPending({
      id: recordId,
      userId: actor.userId,
      courseId,
      moduleId,
      contentType: "review_summary",
      version: nextVersion,
      status: "pending",
      inputSnapshot: snapshot,
      highlightsCount,
      notesCount,
      costToman: PERSONAL_SUMMARY_COST_TOMAN,
      idempotencyKey,
      workerId,
      leaseExpiresAt,
    });

    // 6. Debit 3,000 Tomans from user's internal wallet
    let debitTxId: string;
    try {
      const debitResult = await this.walletService.debit({
        userId: actor.userId,
        amount: PERSONAL_SUMMARY_COST_TOMAN,
        source: "content_generation",
        referenceType: "generation_job",
        referenceId: recordId,
        idempotencyKey: `debit_ps_${recordId}`,
        metadata: {
          moduleId,
          version: nextVersion,
          contentType: "review_summary",
        },
      });
      debitTxId = debitResult.transaction.id;
      await this.store.updateTransactionId(recordId, debitTxId);
    } catch (debitErr) {
      // If balance is insufficient or debit rejected, fail the pending record immediately
      const reason = debitErr instanceof Error ? debitErr.message : "wallet_debit_failed";
      await this.store.markFailed(recordId, reason, null, "none");
      throw debitErr;
    }

    // 7. Start periodic heartbeat during Gemini generation
    let heartbeatTimer: NodeJS.Timeout | null = null;
    const startHeartbeat = () => {
      heartbeatTimer = setInterval(async () => {
        try {
          const extendedLease = new Date(Date.now() + PERSONAL_SUMMARY_LEASE_DURATION_MS);
          await this.store.updateHeartbeat(recordId, workerId, extendedLease);
        } catch {
          // Suppress heartbeat errors to not disrupt in-flight generation
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    const stopHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    // 8. Execute Gemini Generation & Validation
    startHeartbeat();
    try {
      const userPrompt = this.buildPrompt(snapshot, moduleTitle);
      const systemPrompt = `شما موتور تحلیل آموزشی و سنتز خلاصه‌های تحلیلی پلتفرم داروشناسی و علوم پزشکی آوانا (AVANA) هستید.
وظیفه شما تبدیل هایلایت‌ها و یادداشت‌های شخصی کاربر در یک فصل، به یک «خلاصه مروری اختصاصی و منسجم» است.

قوانین الزامی:
۱. خروجی باید کاملاً ساختاریافته در قالب JSON و منطبق بر اسکیمای مشخص‌شده باشد.
۲. مطالب باید دسته‌بندی شوند (نکات کلیدی، مکانیسم‌ها، طبقه‌بندی‌ها، مقایسه‌ها، نکات تستی پرتکرار).
۳. متن‌های هایلایت‌شده باید با حفظ دقت علمی ادغام شوند و از تکرار مطالب پرهیز شود.
۴. یادداشت‌های شخصی کاربر باید در بافت آموزشی مناسب تلفیق شوند.
۵. اگر یادداشت کاربر دارای ابهام یا گزاره غیرعلمی بود، هرگز نباید به عنوان حقیقت علمی قطعی بازنویسی شود.
۶. زبان متن باید فارسی روان، علمی و دانشگاهی باشد.
۷. خروجی صرفاً شامل آبجکت JSON معتبر باشد و هیچ توضیح اضافی خارج از JSON تولید نکنید.`;

      const response = await this.gateway.complete({
        promptVersion: "1.0",
        correlationId: recordId,
        documentId,
        organizationId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        jsonSchema: { type: "review_summary" },
        stage: "review_summary",
      });

      const parsed = cleanAndParseJson<Record<string, unknown>>(
        response.text,
        "review_summary",
      );
      const validatedPayload = validateReviewSummaryPayload(parsed);

      stopHeartbeat();

      // 9. Mark completed and store validated payload
      const completedRecord = await this.store.markCompleted(
        recordId,
        validatedPayload as unknown as Record<string, unknown>,
      );

      return {
        success: true,
        summary: this.toDto(completedRecord),
        transaction_id: debitTxId,
      };
    } catch (genError) {
      stopHeartbeat();

      const errMsg = genError instanceof Error ? genError.message : "generation_failed";

      // 10. Automatically and idempotently refund the 3,000 Tomans on failure
      try {
        const refundResult = await this.walletService.refund({
          userId: actor.userId,
          amount: PERSONAL_SUMMARY_COST_TOMAN,
          source: "generation_refund",
          referenceType: "generation_job",
          referenceId: recordId,
          idempotencyKey: `refund_ps_${recordId}`,
          metadata: {
            reason: errMsg,
            failed_operation_id: recordId,
          },
        });

        await this.store.markFailed(
          recordId,
          errMsg,
          refundResult.transaction.id,
          "refunded",
        );
      } catch {
        // Record pending refund if temporary error occurs
        await this.store.markFailed(recordId, errMsg, null, "pending");
      }

      throw new DomainError(
        "internal_error",
        `تولید خلاصه شخصی با خطا مواجه شد. هزینه ۳٬۰۰۰ تومان کسرشده به کیف پول شما بازگردانده شد. (${errMsg})`,
      );
    }
  }

  /**
   * Constructs prompt for Gemini based on snapshot items.
   */
  private buildPrompt(
    snapshot: PersonalContentSnapshot,
    moduleTitle: string,
  ): string {
    const formattedItems = snapshot.items
      .map((item, idx) => {
        const typeStr = item.type === "highlight" ? "هایلایت" : "یادداشت شخصی";
        const lessonInfo = `[درس: ${item.lessonTitle || "درسنامه"}]`;
        let content = `- مورد ${idx + 1} (${typeStr}) ${lessonInfo}:\n  متن انتخاب‌شده: «${item.selectedText}»`;
        if (item.noteText && item.noteText.trim().length > 0) {
          content += `\n  یادداشت کاربر: «${item.noteText.trim()}»`;
        }
        return content;
      })
      .join("\n\n");

    return `عنوان فصل: «${moduleTitle}»
تعداد کل هایلایت‌های کاربر: ${snapshot.totalHighlights}
تعداد کل یادداشت‌های کاربر: ${snapshot.totalNotes}

اطلاعات و یادداشت‌های ورودی کاربر در این فصل:
${formattedItems}

دستورالعمل تولید:
بر اساس هایلایت‌ها و یادداشت‌های فوق، یک خلاصه مروری منسجم و سازمان‌یافته با بالاترین چگالی اطلاعاتی (High Information Density) تولید کن.
ساختار خروجی JSON باید دقیقاً شامل فیلدهای زیر باشد:
- "title": عنوان خلاصه اختصاصی (شامل نام فصل و عبارت خلاصه شخصی)
- "estimatedReadingMinutes": زمان تخمینی مطالعه (بین ۳ تا ۱۰ دقیقه)
- "overview": مقدمه و چشم‌انداز کلی مفاهیم هایلایت‌شده
- "sections": آرایه‌ای از بخش‌های موضوعی سازماندهی‌شده شامل:
  * "title": عنوان موضوع
  * "keyPoints": آرایه‌ای از مهم‌ترین نکات کلیدی
  * "mechanisms": آرایه‌ای از مکانیسم‌های اثر یا فرایندهای علمی (در صورت وجود)
  * "classifications": آرایه‌ای از طبقه‌بندی‌های دارویی یا علمی (در صورت وجود)
  * "comparisons": آرایه‌ای از مقایسه‌ها یا وجوه افتراق مفاهیم (در صورت وجود)
  * "memorizationPoints": آرایه‌ای از نکات نیازمند به خاطرسپاری (در صورت وجود)
  * "examPoints": آرایه‌ای از نکات تستی و امتحانی مرتبط (در صورت وجود)
- "finalTakeaways": ۳ تا ۵ جمع‌بندی نهایی کلیدی برای مرور سریع شب امتحان.`;
  }
}
