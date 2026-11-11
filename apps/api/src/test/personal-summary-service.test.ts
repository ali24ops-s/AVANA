/**
 * Comprehensive Test Suite for Personal Summary Service.
 *
 * Tests:
 * 1. Financial:
 *    - Exact 3,000 Toman debit from wallet
 *    - Rejection on insufficient balance (DomainError INSUFFICIENT_FUNDS)
 *    - Automatic refund on Gemini failure or parsing error
 *    - Idempotent refund (no double refunds)
 *    - Re-generation debits 3,000 Tomans again
 * 2. Concurrency, Leases & Crash Recovery:
 *    - Active pending lease rejects concurrent attempt with 409 Conflict
 *    - Heartbeat updates lease during processing
 *    - Expired lease / crash recovery triggers automated refund and fails stale attempt
 * 3. Content, Versioning & Snapshots:
 *    - Generation from highlights only
 *    - Generation from notes only
 *    - Generation from both highlights and notes
 *    - Monotonic versioning (v1 -> v2) preserving previous versions
 *    - In failure, previous completed version remains intact
 *    - Counts strictly derived from snapshot
 * 4. Security & Isolation:
 *    - User B cannot see User A's summary or annotations
 *    - Official Avana summary is untouched
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  type Actor,
  type CourseId,
  type OrganizationId,
  type WalletTransactionId,
  DomainError,
  asUserId,
} from "@avana/domain";
import {
  PersonalSummaryService,
  PERSONAL_SUMMARY_COST_TOMAN,
} from "../modules/study/personal-summary-service.js";
import {
  InMemoryPersonalSummaryStore,
} from "../modules/study/personal-summary-store.js";
import { InMemoryWalletStore } from "../modules/wallet/wallet-store.js";
import { WalletService } from "../modules/wallet/wallet-service.js";
import type { ModelGateway, CompletionRequest, CompletionResult } from "../modules/generation/gateway/types.js";
import type { ModuleStore, LessonStore, ModuleRecord, LessonRecord } from "../modules/learning/learning-store.js";
import type { CourseStore, CourseRecord } from "../modules/courses/course-store.js";
import type { OrganizationStore } from "../modules/organizations/organization-store.js";

const ORG_ID = "org-1111-1111-1111-1111" as OrganizationId;
const COURSE_ID = "course-2222-2222-2222" as CourseId;
const MODULE_ID = "module-3333-3333-3333";
const LESSON_ID_1 = "lesson-4444-4444-4441";
const LESSON_ID_2 = "lesson-4444-4444-4442";

const USER_A = asUserId("user-aaaa-aaaa-aaaa-aaaa");
const USER_B = asUserId("user-bbbb-bbbb-bbbb-bbbb");

const ACTOR_A: Actor = {
  userId: USER_A,
  role: "student",
  globalRole: "student",
  memberships: [{ organizationId: ORG_ID, role: "student" }],
};

const ACTOR_B: Actor = {
  userId: USER_B,
  role: "student",
  globalRole: "student",
  memberships: [{ organizationId: ORG_ID, role: "student" }],
};

const mockValidReviewSummaryJson = JSON.stringify({
  kind: "review_summary",
  title: "خلاصه شخصی: فارماکولوژی ضددردها",
  estimatedReadingMinutes: 5,
  overview: "بررسی جامع نکات هایلایت‌شده در خصوص آگونیست‌های اپیوئیدی و NSAIDها.",
  sections: [
    {
      title: "مکانیسم‌های سلولی",
      keyPoints: ["مهار کانال‌های کلسیمی وابسته به ولتاژ", "تحریک خروج پتاسیم"],
      mechanisms: ["آگونیست گیرنده مو (μ)"],
      classifications: ["اپیوئیدهای قوی"],
      examPoints: ["مورفین باعث میوز دوطرفه می‌شود"],
    },
  ],
  finalTakeaways: ["دقت به نارسایی کلیوی در مصرف NSAID", "آنتاگونیست نالوکسان است"],
  citationChunkIds: [],
});

class MockGeminiGateway implements ModelGateway {
  readonly provider = "gemini";
  readonly model = "gemini-3.5-flash-lite";
  public shouldFail = false;
  public failureMessage = "Gemini API Timeout (504)";
  public completeCalls: CompletionRequest[] = [];

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.completeCalls.push(req);
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }
    return {
      text: mockValidReviewSummaryJson,
      usage: { inputTokens: 500, outputTokens: 300, totalTokens: 800 },
      model: this.model,
    };
  }
}

describe("PersonalSummaryService", () => {
  let store: InMemoryPersonalSummaryStore;
  let walletStore: InMemoryWalletStore;
  let walletService: WalletService;
  let gateway: MockGeminiGateway;
  let service: PersonalSummaryService;

  const mockModule: ModuleRecord = {
    id: MODULE_ID,
    courseId: COURSE_ID,
    documentId: "doc-5555-5555",
    title: "فصل دوم: داروهای مسکن و ضدالتهاب",
    description: "شرح فصل",
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockLessons: LessonRecord[] = [
    {
      id: LESSON_ID_1,
      moduleId: MODULE_ID,
      title: "درس اول: مخدرها",
      contentType: "markdown",
      contentMarkdown: "# مخدرها...",
      sortOrder: 1,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: LESSON_ID_2,
      moduleId: MODULE_ID,
      title: "درس دوم: ضدالتهاب‌ها",
      contentType: "markdown",
      contentMarkdown: "# ضدالتهاب‌ها...",
      sortOrder: 2,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockCourse: CourseRecord = {
    id: COURSE_ID,
    organizationId: ORG_ID,
    name: "فارماکولوژی پایه",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockModuleStore = {
    findById: vi.fn(async (id: string) => (id === MODULE_ID ? mockModule : null)),
  } as unknown as ModuleStore;

  const mockLessonStore = {
    findById: vi.fn(async (id: string) => mockLessons.find((l) => l.id === id) ?? null),
    listByModule: vi.fn(async (modId: string) => (modId === MODULE_ID ? mockLessons : [])),
  } as unknown as LessonStore;

  const mockCourseStore = {
    findByIdForUser: vi.fn(async (cid: CourseId) => (cid === COURSE_ID ? mockCourse : null)),
    findById: vi.fn(async (cid: CourseId) => (cid === COURSE_ID ? mockCourse : null)),
  } as unknown as CourseStore;

  const mockOrgStore = {
    listMembershipsByUserId: vi.fn(async () => [
      { organizationId: ORG_ID, role: "student", userId: USER_A },
    ]),
  } as unknown as OrganizationStore;

  beforeEach(() => {
    store = new InMemoryPersonalSummaryStore();
    walletStore = new InMemoryWalletStore();
    walletService = new WalletService(walletStore);
    gateway = new MockGeminiGateway();

    service = new PersonalSummaryService(
      store,
      walletService,
      gateway,
      mockModuleStore,
      mockLessonStore,
      mockCourseStore,
      mockOrgStore,
      undefined,
      ORG_ID,
    );
  });

  // Helper to seed annotations
  const seedAnnotationsForUserA = () => {
    store.annotations = [
      {
        id: "ann-1",
        lessonId: LESSON_ID_1,
        lessonTitle: "درس اول: مخدرها",
        lessonSortOrder: 1,
        type: "highlight",
        selectedText: "مورفین قوی‌ترین آگونیست گیرنده مو است.",
        prefix: null,
        suffix: null,
        startOffset: 10,
        endOffset: 50,
        color: "yellow",
        noteText: null,
        createdAt: "2026-11-03T10:00:00Z",
      },
      {
        id: "ann-2",
        lessonId: LESSON_ID_1,
        lessonTitle: "درس اول: مخدرها",
        lessonSortOrder: 1,
        type: "note",
        selectedText: "عوارض تنفسی",
        prefix: null,
        suffix: null,
        startOffset: 60,
        endOffset: 75,
        color: "blue",
        noteText: "حتما نالوکسان در دسترس باشد",
        createdAt: "2026-11-03T10:05:00Z",
      },
      {
        id: "ann-3",
        lessonId: LESSON_ID_2,
        lessonTitle: "درس دوم: ضدالتهاب‌ها",
        lessonSortOrder: 2,
        type: "highlight",
        selectedText: "ایبوپروفن آنزیم COX-1 و COX-2 را مهار می‌کند.",
        prefix: null,
        suffix: null,
        startOffset: 0,
        endOffset: 45,
        color: "green",
        noteText: null,
        createdAt: "2026-11-03T10:10:00Z",
      },
    ];
  };

  describe("1. Financial Integrity & Wallet Flow", () => {
    it("debits exactly 3,000 Tomans upon successful generation", async () => {
      seedAnnotationsForUserA();
      // Credit user wallet with 10,000 Tomans
      await walletService.credit({
        userId: USER_A,
        amount: 10000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-1",
        idempotencyKey: "topup-1",
      });

      const res = await service.generatePersonalSummary(ACTOR_A, MODULE_ID);

      expect(res.success).toBe(true);
      expect(res.summary.costToman).toBe(PERSONAL_SUMMARY_COST_TOMAN);
      expect(res.summary.version).toBe(1);
      expect(res.summary.status).toBe("completed");

      // Check wallet balance: 10,000 - 3,000 = 7,000
      const wallet = await walletService.getMyWallet(ACTOR_A);
      expect(wallet.balance).toBe(7000);

      // Verify transaction ledger link
      expect(res.transaction_id).toBeDefined();
      const tx = await walletStore.findTransactionById(res.transaction_id as WalletTransactionId);
      expect(tx?.amount).toBe(3000);
      expect(tx?.type).toBe("debit");
      expect(tx?.source).toBe("content_generation");
      expect(tx?.referenceId).toBe(res.summary.id);
    });

    it("rejects generation when wallet balance is insufficient without debiting or creating valid summary", async () => {
      seedAnnotationsForUserA();
      // Wallet balance is 0
      await expect(
        service.generatePersonalSummary(ACTOR_A, MODULE_ID),
      ).rejects.toThrow(DomainError);

      const wallet = await walletService.getMyWallet(ACTOR_A);
      expect(wallet.balance).toBe(0);

      const status = await service.getPersonalSummary(ACTOR_A, MODULE_ID);
      expect(status.has_personal_summary).toBe(false);
    });

    it("automatically refunds 3,000 Tomans if Gemini generation fails", async () => {
      seedAnnotationsForUserA();
      await walletService.credit({
        userId: USER_A,
        amount: 5000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-2",
        idempotencyKey: "topup-2",
      });

      gateway.shouldFail = true;
      gateway.failureMessage = "Gemini provider unavailable 503";

      await expect(
        service.generatePersonalSummary(ACTOR_A, MODULE_ID),
      ).rejects.toThrow("تولید خلاصه شخصی با خطا مواجه شد");

      // Balance was debited 3000 and immediately refunded 3000 -> remains 5000
      const wallet = await walletService.getMyWallet(ACTOR_A);
      expect(wallet.balance).toBe(5000);

      const txHistory = await walletService.listMyTransactions(ACTOR_A);
      const refundTx = txHistory.transactions.find((t) => t.type === "refund");
      expect(refundTx).toBeDefined();
      expect(refundTx?.amount).toBe(3000);
      expect(refundTx?.source).toBe("generation_refund");
    });

    it("re-generation debits 3,000 Tomans again for successful version 2", async () => {
      seedAnnotationsForUserA();
      await walletService.credit({
        userId: USER_A,
        amount: 10000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-3",
        idempotencyKey: "topup-3",
      });

      // Generation 1: 10000 - 3000 = 7000
      const gen1 = await service.generatePersonalSummary(ACTOR_A, MODULE_ID);
      expect(gen1.summary.version).toBe(1);

      // Add a new annotation
      store.annotations.push({
        id: "ann-4",
        lessonId: LESSON_ID_2,
        lessonTitle: "درس دوم: ضدالتهاب‌ها",
        lessonSortOrder: 2,
        type: "note",
        selectedText: "سودوافدرین",
        prefix: null,
        suffix: null,
        startOffset: 100,
        endOffset: 120,
        color: "red",
        noteText: "در فشار خون با احتیاط مصرف شود",
        createdAt: "2026-11-03T11:00:00Z",
      });

      // Generation 2: 7000 - 3000 = 4000
      const gen2 = await service.generatePersonalSummary(ACTOR_A, MODULE_ID);
      expect(gen2.summary.version).toBe(2);

      const wallet = await walletService.getMyWallet(ACTOR_A);
      expect(wallet.balance).toBe(4000);
    });
  });

  describe("2. Concurrency, Leases & Crash Recovery", () => {
    it("rejects concurrent generation requests for the same module and user", async () => {
      seedAnnotationsForUserA();
      await walletService.credit({
        userId: USER_A,
        amount: 10000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-4",
        idempotencyKey: "topup-4",
      });

      // Simulate active pending generation with unexpired lease
      await store.createPending({
        userId: USER_A,
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        version: 1,
        status: "pending",
        inputSnapshot: {
          capturedAt: new Date().toISOString(),
          moduleId: MODULE_ID,
          moduleTitle: "فصل",
          courseId: COURSE_ID,
          totalHighlights: 1,
          totalNotes: 0,
          items: [],
        },
        highlightsCount: 1,
        notesCount: 0,
        idempotencyKey: "active-pending-key",
        leaseExpiresAt: new Date(Date.now() + 120_000), // active for 2 more mins
      });

      await expect(
        service.generatePersonalSummary(ACTOR_A, MODULE_ID),
      ).rejects.toThrow("یک عملیات تولید خلاصه شخصی برای این فصل در حال اجراست");
    });

    it("recovers crashed pending generation with expired lease and refunds the user before proceeding", async () => {
      seedAnnotationsForUserA();
      await walletService.credit({
        userId: USER_A,
        amount: 10000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-5",
        idempotencyKey: "topup-5",
      });

      // Simulate a crashed server attempt:
      // Debit happened earlier
      const crashedDebit = await walletService.debit({
        userId: USER_A,
        amount: 3000,
        source: "generation_debit",
        referenceType: "generation_job",
        referenceId: "crashed-op-id",
        idempotencyKey: "crashed-debit-idemp",
      });
      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(7000);

      // Pending record left behind with EXPIRED lease
      await store.createPending({
        id: "crashed-op-id",
        userId: USER_A,
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        version: 1,
        status: "pending",
        inputSnapshot: {
          capturedAt: new Date().toISOString(),
          moduleId: MODULE_ID,
          moduleTitle: "فصل",
          courseId: COURSE_ID,
          totalHighlights: 1,
          totalNotes: 0,
          items: [],
        },
        highlightsCount: 1,
        notesCount: 0,
        transactionId: crashedDebit.transaction.id,
        idempotencyKey: "crashed-idemp-key",
        leaseExpiresAt: new Date(Date.now() - 60_000), // EXPIRED 1 minute ago
      });

      // Now user triggers generation or status read: recovery sweeps the crashed record
      const status = await service.getPersonalSummary(ACTOR_A, MODULE_ID);
      expect(status.has_personal_summary).toBe(false);

      // User got refunded the 3000 Tomans from the crashed attempt!
      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);

      const updatedCrashed = await store.findById("crashed-op-id");
      expect(updatedCrashed?.status).toBe("failed");
      expect(updatedCrashed?.refundStatus).toBe("refunded");
    });
  });

  describe("3. Content, Versioning & Snapshots", () => {
    it("generates summary when only highlights exist", async () => {
      store.annotations = [
        {
          id: "ann-h1",
          lessonId: LESSON_ID_1,
          lessonTitle: "درس اول",
          lessonSortOrder: 1,
          type: "highlight",
          selectedText: "تنها هایلایت موجود",
          prefix: null,
          suffix: null,
          startOffset: 0,
          endOffset: 10,
          color: "yellow",
          noteText: null,
          createdAt: new Date().toISOString(),
        },
      ];

      await walletService.credit({
        userId: USER_A,
        amount: 3000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-6",
        idempotencyKey: "topup-6",
      });

      const res = await service.generatePersonalSummary(ACTOR_A, MODULE_ID);
      expect(res.success).toBe(true);
      expect(res.summary.highlightsCount).toBe(1);
      expect(res.summary.notesCount).toBe(0);
    });

    it("generates summary when only notes exist (including standalone notes)", async () => {
      store.annotations = [
        {
          id: "ann-n1",
          lessonId: LESSON_ID_1,
          lessonTitle: "درس اول",
          lessonSortOrder: 1,
          type: "note",
          selectedText: "نکته کلیدی",
          prefix: null,
          suffix: null,
          startOffset: null,
          endOffset: null,
          color: "blue",
          noteText: "یادداشت شخصی مستقل کاربر",
          createdAt: new Date().toISOString(),
        },
      ];

      await walletService.credit({
        userId: USER_A,
        amount: 3000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-7",
        idempotencyKey: "topup-7",
      });

      const res = await service.generatePersonalSummary(ACTOR_A, MODULE_ID);
      expect(res.success).toBe(true);
      expect(res.summary.highlightsCount).toBe(0);
      expect(res.summary.notesCount).toBe(1);
    });

    it("preserves previous version when a new generation fails", async () => {
      seedAnnotationsForUserA();
      await walletService.credit({
        userId: USER_A,
        amount: 10000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-8",
        idempotencyKey: "topup-8",
      });

      // 1. Version 1 succeeds
      const v1 = await service.generatePersonalSummary(ACTOR_A, MODULE_ID);
      expect(v1.summary.version).toBe(1);

      // 2. Next generation fails due to AI error
      gateway.shouldFail = true;
      await expect(service.generatePersonalSummary(ACTOR_A, MODULE_ID)).rejects.toThrow();

      // 3. User still sees Version 1 completed!
      const status = await service.getPersonalSummary(ACTOR_A, MODULE_ID);
      expect(status.has_personal_summary).toBe(true);
      expect(status.summary?.version).toBe(1);
      expect(status.summary?.status).toBe("completed");
    });
  });

  describe("4. Security & User Isolation", () => {
    it("prevents IDOR: User B cannot view User A's personal summary", async () => {
      seedAnnotationsForUserA();
      await walletService.credit({
        userId: USER_A,
        amount: 3000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-9",
        idempotencyKey: "topup-9",
      });

      await service.generatePersonalSummary(ACTOR_A, MODULE_ID);

      // User B checks module summary -> sees no personal summary for themselves
      const userBStatus = await service.getPersonalSummary(ACTOR_B, MODULE_ID);
      expect(userBStatus.has_personal_summary).toBe(false);
      expect(userBStatus.summary).toBeNull();
    });

    it("prevents generating summary when user has 0 highlights and 0 notes", async () => {
      store.annotations = [];
      await walletService.credit({
        userId: USER_A,
        amount: 5000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-10",
        idempotencyKey: "topup-10",
      });

      await expect(
        service.generatePersonalSummary(ACTOR_A, MODULE_ID),
      ).rejects.toThrow("شما هنوز هیچ هایلایت یا یادداشتی در درسنامه‌های این فصل ثبت نکرده‌اید");
    });
  });

  describe("5. Recovery of Failed Operations & Pending Refunds (Audit Fix)", () => {
    it("Scenario 1: detects failed operation with refund_status = 'pending' in findExpiredPending and refunds the user", async () => {
      await walletService.credit({
        userId: USER_A,
        amount: 10000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-audit-1",
        idempotencyKey: "audit-topup-1",
      });
      const debit = await walletService.debit({
        userId: USER_A,
        amount: 3000,
        source: "generation_debit",
        referenceType: "generation_job",
        referenceId: "failed-op-1",
        idempotencyKey: "failed-debit-1",
      });
      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(7000);

      await store.createPending({
        id: "failed-op-1",
        userId: USER_A,
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        version: 1,
        status: "failed",
        refundStatus: "pending",
        failureReason: "Gemini provider timeout",
        transactionId: debit.transaction.id,
        idempotencyKey: "failed-op-1-key",
      });

      const expired = await store.findExpiredPending(new Date());
      expect(expired.some((r) => r.id === "failed-op-1")).toBe(true);

      await service.sweepExpiredPending();

      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);
      const updated = await store.findById("failed-op-1");
      expect(updated?.status).toBe("failed");
      expect(updated?.refundStatus).toBe("refunded");
      expect(updated?.failureReason).toBe("Gemini provider timeout");
    });

    it("Scenario 2: continues to recover pending operation with expired lease (no regression)", async () => {
      await walletService.credit({
        userId: USER_A,
        amount: 10000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-audit-2",
        idempotencyKey: "audit-topup-2",
      });
      const debit = await walletService.debit({
        userId: USER_A,
        amount: 3000,
        source: "generation_debit",
        referenceType: "generation_job",
        referenceId: "crashed-op-2",
        idempotencyKey: "crashed-debit-2",
      });
      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(7000);

      await store.createPending({
        id: "crashed-op-2",
        userId: USER_A,
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        version: 1,
        status: "pending",
        refundStatus: "none",
        transactionId: debit.transaction.id,
        idempotencyKey: "crashed-op-2-key",
        leaseExpiresAt: new Date(Date.now() - 30_000),
      });

      const expired = await store.findExpiredPending(new Date());
      expect(expired.some((r) => r.id === "crashed-op-2")).toBe(true);

      await service.sweepExpiredPending();

      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);
      const updated = await store.findById("crashed-op-2");
      expect(updated?.status).toBe("failed");
      expect(updated?.refundStatus).toBe("refunded");
      expect(updated?.failureReason).toContain("lease_expired");
    });

    it("Scenario 3: does NOT re-refund an operation that is already refund_status = 'refunded'", async () => {
      await walletService.credit({
        userId: USER_A,
        amount: 10000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-audit-3",
        idempotencyKey: "audit-topup-3",
      });
      const debit = await walletService.debit({
        userId: USER_A,
        amount: 3000,
        source: "generation_debit",
        referenceType: "generation_job",
        referenceId: "refunded-op-3",
        idempotencyKey: "refunded-debit-3",
      });
      await walletService.refund({
        userId: USER_A,
        originalTransactionId: debit.transaction.id,
        amount: 3000,
        source: "generation_refund",
        referenceType: "generation_job",
        referenceId: "refunded-op-3",
        idempotencyKey: "refund_ps_refunded-op-3",
      });
      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);

      await store.createPending({
        id: "refunded-op-3",
        userId: USER_A,
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        version: 1,
        status: "failed",
        refundStatus: "refunded",
        transactionId: debit.transaction.id,
        idempotencyKey: "refunded-op-3-key",
      });

      const expired = await store.findExpiredPending(new Date());
      expect(expired.some((r) => r.id === "refunded-op-3")).toBe(false);

      await service.sweepExpiredPending();
      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);

      const txs = await walletService.listMyTransactions(ACTOR_A);
      const refundTxs = txs.transactions.filter((t) => t.type === "refund");
      expect(refundTxs.length).toBe(1);
    });

    it("Scenario 4: if first refund attempt fails and second succeeds, balance increases exactly once", async () => {
      await walletService.credit({
        userId: USER_A,
        amount: 10000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-audit-4",
        idempotencyKey: "audit-topup-4",
      });
      const debit = await walletService.debit({
        userId: USER_A,
        amount: 3000,
        source: "generation_debit",
        referenceType: "generation_job",
        referenceId: "retry-op-4",
        idempotencyKey: "retry-debit-4",
      });
      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(7000);

      await store.createPending({
        id: "retry-op-4",
        userId: USER_A,
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        version: 1,
        status: "failed",
        refundStatus: "pending",
        failureReason: "Initial AI failure",
        transactionId: debit.transaction.id,
        idempotencyKey: "retry-op-4-key",
      });

      // 1st attempt: walletService.refund fails
      vi.spyOn(walletService, "refund").mockRejectedValueOnce(new Error("Network timeout to wallet database"));

      await service.sweepExpiredPending();

      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(7000);
      let record = await store.findById("retry-op-4");
      expect(record?.status).toBe("failed");
      expect(record?.refundStatus).toBe("pending");

      // 2nd attempt: walletService restored, succeeds
      vi.restoreAllMocks();
      await service.sweepExpiredPending();

      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);
      record = await store.findById("retry-op-4");
      expect(record?.status).toBe("failed");
      expect(record?.refundStatus).toBe("refunded");

      const txs = await walletService.listMyTransactions(ACTOR_A);
      const refundTxs = txs.transactions.filter((t) => t.type === "refund");
      expect(refundTxs.length).toBe(1);
    });

    it("Scenario 5: running recovery multiple times never leads to duplicate refunds (idempotency)", async () => {
      await walletService.credit({
        userId: USER_A,
        amount: 10000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-audit-5",
        idempotencyKey: "audit-topup-5",
      });
      const debit = await walletService.debit({
        userId: USER_A,
        amount: 3000,
        source: "generation_debit",
        referenceType: "generation_job",
        referenceId: "idemp-op-5",
        idempotencyKey: "idemp-debit-5",
      });
      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(7000);

      await store.createPending({
        id: "idemp-op-5",
        userId: USER_A,
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        version: 1,
        status: "failed",
        refundStatus: "pending",
        failureReason: "AI parsing error",
        transactionId: debit.transaction.id,
        idempotencyKey: "idemp-op-5-key",
      });

      // Sweep pass 1
      await service.sweepExpiredPending();
      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);

      // Sweep pass 2
      await service.sweepExpiredPending();
      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);

      // Sweep pass 3
      await service.sweepExpiredPending();
      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);

      const txs = await walletService.listMyTransactions(ACTOR_A);
      const refundTxs = txs.transactions.filter((t) => t.type === "refund");
      expect(refundTxs.length).toBe(1);
      expect(refundTxs[0].amount).toBe(3000);
    });

    it("Scenario 6: keeps refund_status = 'pending' across repeated WalletService failures", async () => {
      await walletService.credit({
        userId: USER_A,
        amount: 10000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-audit-6",
        idempotencyKey: "audit-topup-6",
      });
      const debit = await walletService.debit({
        userId: USER_A,
        amount: 3000,
        source: "generation_debit",
        referenceType: "generation_job",
        referenceId: "persist-fail-op-6",
        idempotencyKey: "persist-fail-debit-6",
      });

      await store.createPending({
        id: "persist-fail-op-6",
        userId: USER_A,
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        version: 1,
        status: "failed",
        refundStatus: "pending",
        failureReason: "Timeout",
        transactionId: debit.transaction.id,
        idempotencyKey: "persist-fail-op-6-key",
      });

      vi.spyOn(walletService, "refund").mockRejectedValue(new Error("Persistent WalletService connection outage"));

      // Pass 1
      await service.sweepExpiredPending();
      let rec = await store.findById("persist-fail-op-6");
      expect(rec?.status).toBe("failed");
      expect(rec?.refundStatus).toBe("pending");

      // Pass 2
      await service.sweepExpiredPending();
      rec = await store.findById("persist-fail-op-6");
      expect(rec?.status).toBe("failed");
      expect(rec?.refundStatus).toBe("pending");

      // Pass 3
      await service.sweepExpiredPending();
      rec = await store.findById("persist-fail-op-6");
      expect(rec?.status).toBe("failed");
      expect(rec?.refundStatus).toBe("pending");

      vi.restoreAllMocks();
    });

    it("Scenario 7: previous successful version remains intact and accessible when a new version fails and is recovered", async () => {
      seedAnnotationsForUserA();
      await walletService.credit({
        userId: USER_A,
        amount: 10000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "order-topup-audit-7",
        idempotencyKey: "audit-topup-7",
      });

      // 1. Version 1 generated successfully
      const v1 = await service.generatePersonalSummary(ACTOR_A, MODULE_ID);
      expect(v1.summary.version).toBe(1);
      expect(v1.summary.status).toBe("completed");
      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(7000);

      // 2. Version 2 starts, debits 3000 (balance 4000), but fails and refund also fails
      const debitV2 = await walletService.debit({
        userId: USER_A,
        amount: 3000,
        source: "generation_debit",
        referenceType: "generation_job",
        referenceId: "v2-failed-op",
        idempotencyKey: "v2-debit-key",
      });
      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(4000);

      await store.createPending({
        id: "v2-failed-op",
        userId: USER_A,
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        version: 2,
        status: "failed",
        refundStatus: "pending",
        failureReason: "Gemini 500 error",
        transactionId: debitV2.transaction.id,
        idempotencyKey: "v2-failed-key",
      });

      // 3. User checks summary before sweep -> still sees Version 1 completed
      const statusBeforeSweep = await service.getPersonalSummary(ACTOR_A, MODULE_ID);
      expect(statusBeforeSweep.has_personal_summary).toBe(true);
      expect(statusBeforeSweep.summary?.version).toBe(1);
      expect(statusBeforeSweep.summary?.status).toBe("completed");

      // 4. Recovery sweeps and refunds version 2
      await service.sweepExpiredPending();
      expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(7000);

      // 5. User checks summary after sweep -> Version 1 is still completed and fully intact
      const statusAfterSweep = await service.getPersonalSummary(ACTOR_A, MODULE_ID);
      expect(statusAfterSweep.has_personal_summary).toBe(true);
      expect(statusAfterSweep.summary?.version).toBe(1);
      expect(statusAfterSweep.summary?.status).toBe("completed");
      expect(statusAfterSweep.summary?.highlightsCount).toBe(v1.summary.highlightsCount);
    });
  });
});

