import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  MindMapService,
} from "../modules/study/mind-map-service.js";
import { InMemoryPersonalSummaryStore } from "../modules/study/personal-summary-store.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryWalletStore, WalletService } from "../modules/wallet/index.js";
import type { Actor, UserId, CourseId, OrganizationId, DocumentId, ModuleId } from "@avana/domain";
import { DomainError, MIND_MAP_COST_TOMAN } from "@avana/domain";

describe("Mind Map Billing Integration & Idempotency", () => {
  let store: InMemoryPersonalSummaryStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let courseStore: InMemoryCourseStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let walletStore: InMemoryWalletStore;
  let walletService: WalletService;
  let gateway: any;
  let service: MindMapService;

  const userA: Actor = { userId: "user-a" as UserId, role: "student" };
  const userB: Actor = { userId: "user-b" as UserId, role: "student" };

  const orgId = "org-1" as OrganizationId;
  const courseId = "course-1" as CourseId;
  const moduleId = "11111111-1111-4111-8111-111111111111";
  const documentId = "doc-1" as DocumentId;

  const validTreeJson = JSON.stringify({
    rootNodeId: "root",
    nodes: {
      root: {
        id: "root",
        parentId: null,
        title: "فارماکولوژی قلب و عروق",
        shortDescription: "بررسی دسته‌های دارویی مؤثر بر دستگاه قلبی-عروقی",
        keyPoints: ["نکته ۱", "نکته ۲"],
      },
      node_beta_blockers: {
        id: "node_beta_blockers",
        parentId: "root",
        title: "داروهای بتابلوکر",
        shortDescription: "مهارکننده گیرنده‌های بتا",
        keyPoints: ["پروپرانولول", "متوپرولول"],
        examTips: ["کنترااندیکاسیون در آسم"],
        sourceReferences: [{ chunkId: "chunk-1", pageNumber: 1 }],
      },
    },
  });

  const mockOrgStore = {
    listMembershipsByUserId: async (uid: UserId) =>
      [{ organizationId: orgId, role: "student" as const }],
  } as any;

  beforeEach(async () => {
    store = new InMemoryPersonalSummaryStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    courseStore = new InMemoryCourseStore();
    chunkStore = new InMemoryDocumentChunkStore();
    walletStore = new InMemoryWalletStore();
    walletService = new WalletService(walletStore);

    // Give userA and userB initial wallet balances
    await walletService.credit({
      userId: userA.userId,
      amount: 10000,
      source: "gift",
      referenceType: "topup",
      referenceId: randomUUID(),
    });

    await walletService.credit({
      userId: userB.userId,
      amount: 5000,
      source: "gift",
      referenceType: "topup",
      referenceId: randomUUID(),
    });

    courseStore = {
      findByIdForUser: async (cid: CourseId, uid: UserId) => {
        return {
          id: courseId,
          organizationId: orgId,
          name: "دوره داروشناسی",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any;
      },
      findById: async (cid: CourseId) => {
        return {
          id: courseId,
          organizationId: orgId,
          name: "دوره داروشناسی",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any;
      },
    } as any;

    await moduleStore.create({
      id: moduleId as ModuleId,
      courseId,
      title: "فصل ۱: داروهای قلبی",
      sortOrder: 1,
      documentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const lesson = await lessonStore.create({
      moduleId: moduleId as ModuleId,
      title: "درس ۱",
      sortOrder: 1,
    });

    await chunkStore.createMany([
      {
        id: "chunk-1" as any,
        documentId,
        organizationId: orgId,
        sequence: 1,
        content: "داروهای بتابلوکر مانند پروپرانولول و متوپرولول در درمان پرفشاری خون و آریتمی کاربرد دارند.",
        tokenCount: 25,
      },
    ]);

    gateway = {
      complete: async () => ({
        text: validTreeJson,
        model: "gemini-3.5-flash-lite",
      }),
    };

    service = new MindMapService(
      store,
      gateway,
      moduleStore,
      lessonStore,
      courseStore,
      chunkStore,
      undefined,
      mockOrgStore,
      undefined,
      orgId,
      undefined,
      walletService,
    );
  });

  it("first generation debits 2,500 Toman and marks cost_toman and is_paid", async () => {
    const initialBalance = await walletService.getUserWallet(userA.userId);
    expect(initialBalance.balance).toBe(10000);

    const result = await service.generateMindMap(userA, moduleId, undefined, courseId);

    expect(result.mind_map.costToman).toBe(MIND_MAP_COST_TOMAN);
    expect(result.mind_map.status).toBe("completed");

    const newBalance = await walletService.getUserWallet(userA.userId);
    expect(newBalance.balance).toBe(10000 - MIND_MAP_COST_TOMAN);

    // Verify GetMindMap response reports is_paid = true and cost_toman = 0 for future generations
    const getRes = await service.getMindMap(userA, moduleId, courseId);
    expect(getRes.is_paid).toBe(true);
    expect(getRes.cost_toman).toBe(0);
  });

  it("subsequent regeneration for the same user and module is free (costs 0, no debit)", async () => {
    // 1st generation (paid)
    await service.generateMindMap(userA, moduleId, undefined, courseId);
    const balanceAfterFirst = await walletService.getUserWallet(userA.userId);
    expect(balanceAfterFirst.balance).toBe(7500);

    // Add a custom user note to test note preservation
    await service.updateMindMap(userA, moduleId, {
      userModifications: {
        deletedNodeIds: [],
        customNodes: {},
        overrides: {},
      },
      userNotes: {
        node_beta_blockers: { noteText: "یادداشت درباره بتابلوکر", updatedAt: new Date().toISOString() },
      },
    }, courseId);

    // 2nd generation (free regeneration)
    const secondResult = await service.generateMindMap(userA, moduleId, undefined, courseId);

    expect(secondResult.mind_map.costToman).toBe(0);
    expect(secondResult.mind_map.status).toBe("completed");

    // Balance must be unchanged
    const balanceAfterSecond = await walletService.getUserWallet(userA.userId);
    expect(balanceAfterSecond.balance).toBe(7500);

    // Custom note is preserved via non-destructive reconcile
    expect(secondResult.mind_map.payload.userNotes?.["node_beta_blockers"]?.noteText).toBe("یادداشت درباره بتابلوکر");
  });

  it("cross-user isolation: User B must pay 2,500 Toman even if User A already generated", async () => {
    await service.generateMindMap(userA, moduleId, undefined, courseId);

    const bBalanceBefore = await walletService.getUserWallet(userB.userId);
    expect(bBalanceBefore.balance).toBe(5000);

    const bResult = await service.generateMindMap(userB, moduleId, undefined, courseId);
    expect(bResult.mind_map.costToman).toBe(2500);

    const bBalanceAfter = await walletService.getUserWallet(userB.userId);
    expect(bBalanceAfter.balance).toBe(2500);
  });

  it("historical free mindmaps (costToman = 0 or transactionId = null) require payment on new generation", async () => {
    // Seed an existing legacy mindmap with costToman = 0 and transactionId = null
    const rec = await store.createPending({
      userId: userA.userId,
      courseId,
      moduleId,
      contentType: "mind_map",
      version: 1,
      inputSnapshot: { highlights: [], notes: [], totalChunks: 1 },
      highlightsCount: 0,
      notesCount: 0,
      costToman: 0,
      transactionId: null,
      idempotencyKey: "test-legacy",
    });
    await store.markCompleted(rec.id, {
      summaryData: JSON.parse(validTreeJson),
      markdownContent: "",
    });

    // Before generating, getMindMap should report is_paid = false and cost_toman = 2500
    const initialGet = await service.getMindMap(userA, moduleId, courseId);
    expect(initialGet.is_paid).toBe(false);
    expect(initialGet.cost_toman).toBe(2500);

    // Triggering generation now should debit 2500 Toman
    const genResult = await service.generateMindMap(userA, moduleId, undefined, courseId);
    expect(genResult.mind_map.costToman).toBe(2500);

    const bal = await walletService.getUserWallet(userA.userId);
    expect(bal.balance).toBe(7500);
  });

  it("AI gateway failure triggers automatic 2,500 Toman refund and marks status refunded", async () => {
    const failingGateway = {
      complete: async () => {
        throw new Error("Gemini quota exceeded or network timeout");
      },
    };

    const failingService = new MindMapService(
      store,
      failingGateway as any,
      moduleStore,
      lessonStore,
      courseStore,
      chunkStore,
      undefined,
      mockOrgStore,
      undefined,
      orgId,
      undefined,
      walletService,
    );

    const balanceBefore = await walletService.getUserWallet(userA.userId);
    expect(balanceBefore.balance).toBe(10000);

    await expect(
      failingService.generateMindMap(userA, moduleId, undefined, courseId),
    ).rejects.toThrow("Gemini quota exceeded or network timeout");

    // Balance must be fully restored (debit 2500 then refund 2500 = 10000)
    const balanceAfter = await walletService.getUserWallet(userA.userId);
    expect(balanceAfter.balance).toBe(10000);

    // Stored record must be marked refunded
    const history = await store.listVersions(userA.userId, moduleId, "mind_map");
    expect(history.length).toBe(1);
    expect(history[0].status).toBe("failed");
    expect(history[0].refundStatus).toBe("refunded");
  });

  it("subsequent retry after failure debits a fresh 2,500 Toman with new idempotency key", async () => {
    let callCount = 0;
    const flakeyGateway = {
      complete: async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Temporary network glitch");
        }
        return {
          text: validTreeJson,
          model: "gemini-3.5-flash-lite",
        };
      },
    };

    const retryService = new MindMapService(
      store,
      flakeyGateway as any,
      moduleStore,
      lessonStore,
      courseStore,
      chunkStore,
      undefined,
      mockOrgStore,
      undefined,
      orgId,
      undefined,
      walletService,
    );

    // 1st attempt fails & refunded
    await expect(retryService.generateMindMap(userA, moduleId, undefined, courseId)).rejects.toThrow();
    let bal = await walletService.getUserWallet(userA.userId);
    expect(bal.balance).toBe(10000);

    // 2nd attempt succeeds with fresh debit
    const successResult = await retryService.generateMindMap(userA, moduleId, undefined, courseId);
    expect(successResult.mind_map.status).toBe("completed");
    expect(successResult.mind_map.costToman).toBe(2500);

    bal = await walletService.getUserWallet(userA.userId);
    expect(bal.balance).toBe(7500);
  });

  it("insufficient wallet balance throws DomainError without debiting or generating", async () => {
    const poorUser: Actor = { userId: "user-poor" as UserId, role: "student" };
    // Poor user has only 1,000 Toman (less than 2,500)
    await walletService.credit({
      userId: poorUser.userId,
      amount: 1000,
      source: "gift",
      referenceType: "topup",
      referenceId: randomUUID(),
    });

    await expect(
      service.generateMindMap(poorUser, moduleId, undefined, courseId),
    ).rejects.toThrow(DomainError);

    // Balance remains 1000
    const bal = await walletService.getUserWallet(poorUser.userId);
    expect(bal.balance).toBe(1000);

    // No completed summary records created
    const completed = await store.findLatestCompleted(poorUser.userId, moduleId, "mind_map");
    expect(completed).toBeNull();
  });
});
