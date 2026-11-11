import { describe, it, expect, beforeEach } from "vitest";
import {
  MindMapService,
  type MindMapLifecycleEvent,
  normalizePersianText,
  hasValidSupplementaryContent,
  isClicheEducationalContent,
  isDuplicateOfNodeContent,
} from "../modules/study/mind-map-service.js";
import { InMemoryPersonalSummaryStore } from "../modules/study/personal-summary-store.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import type { ModelGateway } from "../generation/gateway/types.js";
import type { Actor, UserId, CourseId, OrganizationId, DocumentId, ModuleId } from "@avana/domain";
import { DomainError, validateMindMapAiBase, computeEffectiveMindMap } from "@avana/domain";

describe("MindMapService — Unit & Integration Test Suite", () => {
  let store: InMemoryPersonalSummaryStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let courseStore: InMemoryCourseStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let gateway: ModelGateway;
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

  beforeEach(async () => {
    store = new InMemoryPersonalSummaryStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    courseStore = new InMemoryCourseStore();
    chunkStore = new InMemoryDocumentChunkStore();

    // Setup course mock
    courseStore = {
      findByIdForUser: async (cid: CourseId, uid: UserId) => {
        if (cid === courseId && uid === userA.userId) {
          return {
            id: courseId,
            organizationId: orgId,
            name: "دوره داروشناسی",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as any;
        }
        return null;
      },
      findById: async (cid: CourseId) => {
        if (cid === courseId) {
          return {
            id: courseId,
            organizationId: orgId,
            name: "دوره داروشناسی",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as any;
        }
        return null;
      },
    } as any;

    // Setup module
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

    gateway = {
      complete: async () => ({
        text: validTreeJson,
        model: "gemini-3.5-flash-lite",
      }),
    };

    const mockOrgStore = {
      listMembershipsByUserId: async (uid: UserId) =>
        uid === userA.userId ? [{ organizationId: orgId, role: "student" as const }] : [],
    } as any;

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
    );
  });

  describe("1. Source Material Resolution & Priority Fallback", () => {
    it("selects Priority 1 (documentChunks) when reference document has valid chunks", async () => {
      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "مقدمه",
          content: "این یک متن طولانی معتبر از فایل مرجع داروشناسی است که برای تست استخراج استفاده می‌شود.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 50,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);

      const source = await service.resolveEducationalSource(moduleId, documentId);
      expect(source.sourceType).toBe("reference_document");
      expect(source.sourceId).toBe(documentId);
      expect(source.sourceText).toContain("چانک 1");
    });

    it("falls back to Priority 2 (lessons) when document chunks are empty/unavailable", async () => {
      // No chunks added, but lessons added
      await lessonStore.create({
        id: "lesson-1" as any,
        moduleId: moduleId as ModuleId,
        title: "درسنامه بتابلوکرها",
        contentType: "markdown",
        contentMarkdown: "متن درسنامه تدوین‌شده معتبر درباره فارماکولوژی داروهای بتابلوکر.",
        sortOrder: 1,
        publicationStatus: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const source = await service.resolveEducationalSource(moduleId, null);
      expect(source.sourceType).toBe("lessons");
      expect(source.sourceId).toBe(moduleId);
      expect(source.sourceText).toContain("درسنامه 1: «درسنامه بتابلوکرها»");
    });

    it("throws DomainError with clear Persian message when neither reference chunks nor lessons exist", async () => {
      await expect(service.resolveEducationalSource(moduleId, null)).rejects.toThrow(DomainError);
      await expect(service.resolveEducationalSource(moduleId, null)).rejects.toThrow("منبع آموزشی معتبر در دسترس نیست");
    });
  });

  describe("2. Generation & Lifecycle Management", () => {
    beforeEach(async () => {
      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "بتابلوکرها",
          content: "متن مرجع داروشناسی با حجم مناسب و اطلاعات علمی کافی برای تولید مایندمپ.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 40,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);
    });

    it("generates mind map with cost = 0 and version = 1 without debiting wallet", async () => {
      const res = await service.generateMindMap(userA, moduleId);
      expect(res.success).toBe(true);
      expect(res.mind_map.version).toBe(1);
      expect(res.mind_map.costToman).toBe(0);
      expect(res.mind_map.payload.aiBase.rootNodeId).toBe("root");
      expect(res.mind_map.payload.aiBase.nodes["node_beta_blockers"]).toBeDefined();
    });

    it("blocks concurrent in-flight generation requests for the same user and module", async () => {
      // Create pending active record
      await store.createPending({
        userId: userA.userId,
        courseId,
        moduleId,
        contentType: "mind_map",
        version: 1,
        status: "pending",
        inputSnapshot: {} as any,
        highlightsCount: 0,
        notesCount: 0,
        costToman: 0,
        idempotencyKey: "pending_key",
        leaseExpiresAt: new Date(Date.now() + 60000),
      });

      await expect(service.generateMindMap(userA, moduleId)).rejects.toThrow(DomainError);
      await expect(service.generateMindMap(userA, moduleId)).rejects.toThrow("در حال انجام است");
    });

    it("increments version monotonically on re-generation without overwriting", async () => {
      const v1 = await service.generateMindMap(userA, moduleId);
      expect(v1.mind_map.version).toBe(1);

      const v2 = await service.generateMindMap(userA, moduleId);
      expect(v2.mind_map.version).toBe(2);

      const latest = await store.findLatestCompleted(userA.userId, moduleId, "mind_map");
      expect(latest?.version).toBe(2);
    });
  });

  describe("3. 3-Layer Reconciliation & Preservation", () => {
    it("preserves user modifications and notes across AI regenerations", async () => {
      const aiBaseV1 = {
        rootNodeId: "root",
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: { id: "root", parentId: null, title: "ریشه", shortDescription: "ریشه" },
          node_beta_blockers: { id: "node_beta_blockers", parentId: "root", title: "بتابلوکرها", shortDescription: "شرح" },
        },
      };

      const reconciled1 = service.reconcileMindMap(aiBaseV1, null);
      // User modifies title and adds personal note
      reconciled1.userModifications.overrides["node_beta_blockers"] = {
        title: "داروهای بتابلوکر قلبی (ویرایش من)",
      };
      reconciled1.userNotes["node_beta_blockers"] = {
        noteText: "نکته مهم کنکور دستیاری",
        updatedAt: new Date().toISOString(),
      };
      reconciled1.userModifications.customNodes["custom_my_node"] = {
        id: "custom_my_node",
        parentId: "root",
        title: "نود شخصی کاربر",
        shortDescription: "توضیح شخصی",
      };

      // Now AI regenerates (Version 2)
      const aiBaseV2 = {
        rootNodeId: "root",
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: { id: "root", parentId: null, title: "ریشه جدید", shortDescription: "ریشه" },
          node_beta_blockers: { id: "node_beta_blockers", parentId: "root", title: "بتابلوکرها", shortDescription: "شرح بازنویسی‌شده" },
          node_ace_inhibitors: { id: "node_ace_inhibitors", parentId: "root", title: "مهارکننده‌های ACE", shortDescription: "شاخه جدید" },
        },
      };

      const reconciled2 = service.reconcileMindMap(aiBaseV2, reconciled1);

      // Verify user changes survived
      expect(reconciled2.userModifications.overrides["node_beta_blockers"]?.title).toBe("داروهای بتابلوکر قلبی (ویرایش من)");
      expect(reconciled2.userNotes["node_beta_blockers"]?.noteText).toBe("نکته مهم کنکور دستیاری");
      expect(reconciled2.userModifications.customNodes["custom_my_node"]).toBeDefined();
    });

    it("preserves notes on removed AI nodes by attaching to preserved branch", () => {
      const aiBaseV1 = {
        rootNodeId: "root",
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: { id: "root", parentId: null, title: "ریشه", shortDescription: "ریشه" },
          node_old_topic: { id: "node_old_topic", parentId: "root", title: "موضوع قدیمی", shortDescription: "شرح" },
        },
      };
      const prevPayload = service.reconcileMindMap(aiBaseV1, null);
      prevPayload.userNotes["node_old_topic"] = {
        noteText: "یادداشت روی موضوعی که بعدا در AI جدید حذف شد",
        updatedAt: new Date().toISOString(),
      };

      // AI V2 removed node_old_topic completely
      const aiBaseV2 = {
        rootNodeId: "root",
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: { id: "root", parentId: null, title: "ریشه", shortDescription: "ریشه" },
          node_different_topic: { id: "node_different_topic", parentId: "root", title: "موضوع متفاوت", shortDescription: "شرح" },
        },
      };

      const reconciled = service.reconcileMindMap(aiBaseV2, prevPayload);
      // The old node should be preserved under customNodes as user_preserved_node_old_topic
      const preservedKey = "user_preserved_node_old_topic";
      expect(reconciled.userModifications.customNodes[preservedKey]).toBeDefined();
      expect(reconciled.userNotes[preservedKey]?.noteText).toBe("یادداشت روی موضوعی که بعدا در AI جدید حذف شد");
    });
  });

  describe("4. On-Demand Node Expansion & Caching", () => {
    beforeEach(async () => {
      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "مرجع",
          content: "متن مرجع داروشناسی برای تولید مایندمپ.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 40,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);
      await service.generateMindMap(userA, moduleId);
    });

    it("expands a specific node and caches the detailed explanation", async () => {
      gateway.complete = async () => ({
        text: JSON.stringify({
          detailedExplanation: "مکانیسم عمل مولکولی بتابلوکرها از طریق بلوک گیرنده‌های بتا-۱ و بتا-۲ آدرنرژیک.",
          examples: ["پروپرانولول در اضطراب عملکردی", "متوپرولول در نارسایی قلبی"],
          examTips: ["شایع‌ترین عارضه برادی‌کاردی است"],
        }),
        model: "gemini-3.5-flash-lite",
      });

      const res = await service.expandNode(userA, moduleId, "node_beta_blockers");
      expect(res.success).toBe(true);
      expect(res.nodeId).toBe("node_beta_blockers");
      expect(res.detailedExplanation).toContain("مکانیسم عمل مولکولی");
      expect(res.examples).toHaveLength(2);

      // Verify saved in DB payload
      const latest = await store.findLatestCompleted(userA.userId, moduleId, "mind_map");
      const savedPayload = latest?.payload as any;
      expect(savedPayload.aiBase.nodes["node_beta_blockers"].detailedExplanation).toContain("مکانیسم عمل مولکولی");
    });
  });

  describe("5. User Updates & Optimistic Concurrency", () => {
    beforeEach(async () => {
      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "مرجع",
          content: "متن مرجع داروشناسی برای تولید مایندمپ.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 40,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);
      await service.generateMindMap(userA, moduleId);
    });

    it("saves user modifications and notes", async () => {
      const latest = await store.findLatestCompleted(userA.userId, moduleId, "mind_map");
      const clientUpdatedAt = latest!.updatedAt;

      const updated = await service.updateMindMap(userA, moduleId, {
        userModifications: {
          deletedNodeIds: [],
          customNodes: {
            custom_1: { id: "custom_1", parentId: "root", title: "نود شخصی", shortDescription: "شرح" },
          },
          overrides: {
            node_beta_blockers: { title: "عنوان تغییریافته" },
          },
        },
        userNotes: {
          node_beta_blockers: { noteText: "یادداشت تست", updatedAt: new Date().toISOString() },
        },
        clientUpdatedAt,
      });

      expect(updated.payload.userModifications.overrides["node_beta_blockers"]?.title).toBe("عنوان تغییریافته");
      expect(updated.payload.userNotes["node_beta_blockers"]?.noteText).toBe("یادداشت تست");
    });

    it("detects lost update and throws 409 conflict on stale timestamp", async () => {
      const staleTimestamp = new Date(Date.now() - 60000).toISOString();

      await expect(
        service.updateMindMap(userA, moduleId, {
          userModifications: { deletedNodeIds: [], customNodes: {}, overrides: {} },
          userNotes: {},
          clientUpdatedAt: staleTimestamp,
        }),
      ).rejects.toThrow(DomainError);
    });

    describe("Optimistic Locking & Concurrency Race Condition Scenarios", () => {
      it("1. Two concurrent requests with identical clientUpdatedAt: exactly one succeeds, the other gets conflict, and first write is preserved", async () => {
        const current = await service.getMindMap(userA, moduleId, courseId);
        const baseUpdatedAt = current!.mind_map!.updatedAt;

        const req1Promise = service.updateMindMap(userA, moduleId, {
          userModifications: {
            deletedNodeIds: [],
            customNodes: {},
            overrides: {},
            nodePositions: { node_beta_blockers: { x: 150, y: 250 } },
          },
          userNotes: {},
          clientUpdatedAt: baseUpdatedAt,
        });

        const req2Promise = service.updateMindMap(userA, moduleId, {
          userModifications: {
            deletedNodeIds: [],
            customNodes: {},
            overrides: {},
            nodePositions: { node_beta_blockers: { x: 999, y: 999 } },
          },
          userNotes: {},
          clientUpdatedAt: baseUpdatedAt,
        });

        const results = await Promise.allSettled([req1Promise, req2Promise]);
        const statuses = results.map((r) => r.status);

        expect(statuses).toContain("fulfilled");
        expect(statuses).toContain("rejected");

        const rejectedResult = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
        expect(rejectedResult.reason).toBeInstanceOf(DomainError);
        expect((rejectedResult.reason as DomainError).code).toBe("conflict");

        // Verify that the rejected request DID NOT overwrite the accepted request
        const afterConcurrent = await service.getMindMap(userA, moduleId, courseId);
        expect(afterConcurrent?.mind_map?.payload.userModifications?.nodePositions?.["node_beta_blockers"]).toEqual({
          x: 150,
          y: 250,
        });
      });

      it("2. Two sequential requests: second request with refreshed timestamp succeeds cleanly", async () => {
        const step1 = await service.getMindMap(userA, moduleId, courseId);
        const res1 = await service.updateMindMap(userA, moduleId, {
          userModifications: {
            deletedNodeIds: [],
            customNodes: {},
            overrides: {},
            nodePositions: { node_beta_blockers: { x: 200, y: 300 } },
          },
          userNotes: {},
          clientUpdatedAt: step1!.mind_map!.updatedAt,
        });

        expect(res1.payload.userModifications.nodePositions?.["node_beta_blockers"]).toEqual({ x: 200, y: 300 });

        // Second request with refreshed timestamp from res1
        const res2 = await service.updateMindMap(userA, moduleId, {
          userModifications: {
            deletedNodeIds: [],
            customNodes: {},
            overrides: {},
            nodePositions: { node_beta_blockers: { x: 300, y: 400 } },
          },
          userNotes: {},
          clientUpdatedAt: res1.updatedAt,
        });

        expect(res2.payload.userModifications.nodePositions?.["node_beta_blockers"]).toEqual({ x: 300, y: 400 });
      });

      it("3. Request with stale version: rejects with conflict error", async () => {
        const staleTime = new Date(Date.now() - 120_000).toISOString();
        await expect(
          service.updateMindMap(userA, moduleId, {
            userModifications: {
              deletedNodeIds: [],
              customNodes: {},
              overrides: {},
              nodePositions: { node_beta_blockers: { x: 50, y: 50 } },
            },
            userNotes: {},
            clientUpdatedAt: staleTime,
          }),
        ).rejects.toThrow(DomainError);
      });

      it("4. Request without clientUpdatedAt: preserves previous backward-compatible behavior", async () => {
        const res = await service.updateMindMap(userA, moduleId, {
          userModifications: {
            deletedNodeIds: [],
            customNodes: {},
            overrides: {},
            nodePositions: { node_beta_blockers: { x: 500, y: 600 } },
          },
          userNotes: {},
        });

        expect(res.payload.userModifications.nodePositions?.["node_beta_blockers"]).toEqual({ x: 500, y: 600 });
      });

      it("5. Group save (Shift + Drag): saves entire subtree coordinates in a single atomic transaction without partial state", async () => {
        const current = await service.getMindMap(userA, moduleId, courseId);
        const groupPositions = {
          root: { x: 0, y: 0 },
          node_beta_blockers: { x: -240, y: 120 },
        };

        const res = await service.updateMindMap(userA, moduleId, {
          userModifications: {
            deletedNodeIds: [],
            customNodes: {},
            overrides: {},
            nodePositions: groupPositions,
          },
          userNotes: {},
          clientUpdatedAt: current!.mind_map!.updatedAt,
        });

        expect(res.payload.userModifications.nodePositions).toEqual(groupPositions);

        const persisted = await service.getMindMap(userA, moduleId, courseId);
        expect(persisted?.mind_map?.payload.userModifications?.nodePositions).toEqual(groupPositions);
      });

      it("6. Same-millisecond consecutive updates: ensures monotonic timestamp progression (v2 > v1) and rejects stale v1 CAS", async () => {
        const current = await service.getMindMap(userA, moduleId, courseId);
        const v0Time = current!.mind_map!.updatedAt;

        // Perform first update
        const res1 = await service.updateMindMap(userA, moduleId, {
          userModifications: {
            deletedNodeIds: [],
            customNodes: {},
            overrides: {},
            nodePositions: { node_beta_blockers: { x: 111, y: 222 } },
          },
          userNotes: {},
          clientUpdatedAt: v0Time,
        });

        // Perform second update immediately (even if clock hasn't ticked or within same ms)
        const res2 = await service.updateMindMap(userA, moduleId, {
          userModifications: {
            deletedNodeIds: [],
            customNodes: {},
            overrides: {},
            nodePositions: { node_beta_blockers: { x: 333, y: 444 } },
          },
          userNotes: {},
          clientUpdatedAt: res1.updatedAt,
        });

        // 1. Version 2 must be strictly greater than Version 1
        const time1 = new Date(res1.updatedAt).getTime();
        const time2 = new Date(res2.updatedAt).getTime();
        expect(time2).toBeGreaterThan(time1);

        // 2. An attempt to save using stale Version 1 must be rejected with conflict
        await expect(
          service.updateMindMap(userA, moduleId, {
            userModifications: {
              deletedNodeIds: [],
              customNodes: {},
              overrides: {},
              nodePositions: { node_beta_blockers: { x: 999, y: 999 } },
            },
            userNotes: {},
            clientUpdatedAt: res1.updatedAt,
          }),
        ).rejects.toThrow(DomainError);

        // 3. Guarantees that newer data (res2) is preserved and was not overwritten
        const persisted = await service.getMindMap(userA, moduleId, courseId);
        expect(persisted?.mind_map?.payload.userModifications?.nodePositions?.["node_beta_blockers"]).toEqual({
          x: 333,
          y: 444,
        });
        expect(persisted?.mind_map?.updatedAt).toBe(res2.updatedAt);
      });
    });

    it("resets user modifications back to AI Base cleanly", async () => {
      // First modify
      await service.updateMindMap(userA, moduleId, {
        userModifications: {
          deletedNodeIds: ["node_beta_blockers"],
          customNodes: {},
          overrides: {},
        },
        userNotes: {},
      });

      // Now reset
      const reset = await service.resetToAiBase(userA, moduleId);
      expect(reset.payload.userModifications.deletedNodeIds).toHaveLength(0);
      expect(reset.payload.aiBase.nodes["node_beta_blockers"]).toBeDefined();
    });
  });

  describe("6. Security & Tenant Isolation", () => {
    it("prevents IDOR: User B cannot access User A's mind map", async () => {
      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "مرجع",
          content: "متن مرجع داروشناسی برای تولید مایندمپ.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 40,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);
      await service.generateMindMap(userA, moduleId);

      // User B has not joined course
      await expect(service.getMindMap(userB, moduleId)).rejects.toThrow(DomainError);
      await expect(service.getMindMap(userB, moduleId)).rejects.toThrow("دسترسی ندارید");
    });
  });

  describe("7. Advanced Reconciliation & Ambiguity Resolution", () => {
    it("handles same-name ambiguous nodes without incorrect transfer and preserves idempotently across 3 regenerations", () => {
      const oldAiBase = {
        rootNodeId: "root",
        generatedAt: "2026-11-03T00:00:00Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: { id: "root", parentId: null, title: "فارماکولوژی", shortDescription: "شرح" },
          drug1: { id: "drug1", parentId: "root", title: "داروی اول", shortDescription: "شرح" },
          drug1_side: { id: "drug1_side", parentId: "drug1", title: "عوارض جانبی", shortDescription: "شرح عوارض ۱" },
          drug2: { id: "drug2", parentId: "root", title: "داروی دوم", shortDescription: "شرح" },
          drug2_side: { id: "drug2_side", parentId: "drug2", title: "عوارض جانبی", shortDescription: "شرح عوارض ۲" },
        },
      };

      const previousPayload: any = {
        kind: "mind_map",
        version: 1,
        sourceType: "reference_document",
        sourceId: "doc-1",
        updatedAt: "2026-11-03T00:00:00Z",
        aiBase: oldAiBase,
        userModifications: {
          deletedNodeIds: [],
          customNodes: {},
          overrides: {
            drug1_side: { title: "عوارض جانبی مهم" },
          },
        },
        userNotes: {
          drug1_side: { noteText: "یادداشت روی عوارض داروی اول", updatedAt: "2026-11-03T00:00:00Z" },
        },
      };

      // New AI tree completely reorganizes nodes and removes drug1
      const newAiBase1 = {
        rootNodeId: "root",
        generatedAt: "2026-11-03T01:00:00Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: { id: "root", parentId: null, title: "فارماکولوژی مدرن", shortDescription: "شرح ریشه" },
          drug3: { id: "drug3", parentId: "root", title: "داروی سوم", shortDescription: "شرح داروی ۳" },
          drug3_side: { id: "drug3_side", parentId: "drug3", title: "عوارض جانبی", shortDescription: "شرح عوارض ۳" },
        },
      };

      // First regeneration: drug1_side should NOT be transferred to drug3_side (ambiguous title!),
      // but should be preserved under user_preserved_drug1_side
      const reconciled1 = service.reconcileMindMap(newAiBase1, previousPayload);
      expect(reconciled1.userModifications.customNodes["user_preserved_drug1_side"]).toBeDefined();
      expect(reconciled1.userNotes["user_preserved_drug1_side"]?.noteText).toBe("یادداشت روی عوارض داروی اول");
      // Overridden title is preserved
      expect(reconciled1.userModifications.customNodes["user_preserved_drug1_side"].title).toBe("عوارض جانبی مهم");
      // Must NOT be attached to drug3_side
      expect(reconciled1.userNotes["drug3_side"]).toBeUndefined();

      // Second regeneration:
      const newAiBase2 = {
        rootNodeId: "root",
        generatedAt: "2026-11-03T02:00:00Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: { id: "root", parentId: null, title: "فارماکولوژی ویرایش دوم", shortDescription: "شرح" },
          drug4: { id: "drug4", parentId: "root", title: "داروی چهارم", shortDescription: "شرح" },
        },
      };
      const reconciled2 = service.reconcileMindMap(newAiBase2, reconciled1);
      // Key must REMAIN user_preserved_drug1_side and NOT become user_preserved_user_preserved_drug1_side
      expect(reconciled2.userModifications.customNodes["user_preserved_drug1_side"]).toBeDefined();
      expect(reconciled2.userModifications.customNodes["user_preserved_user_preserved_drug1_side"]).toBeUndefined();
      expect(reconciled2.userNotes["user_preserved_drug1_side"]?.noteText).toBe("یادداشت روی عوارض داروی اول");

      // Third regeneration:
      const newAiBase3 = {
        rootNodeId: "root",
        generatedAt: "2026-11-03T03:00:00Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: { id: "root", parentId: null, title: "فارماکولوژی ویرایش سوم", shortDescription: "شرح" },
          drug5: { id: "drug5", parentId: "root", title: "داروی پنجم", shortDescription: "شرح" },
        },
      };
      const reconciled3 = service.reconcileMindMap(newAiBase3, reconciled2);
      expect(reconciled3.userModifications.customNodes["user_preserved_drug1_side"]).toBeDefined();
      expect(reconciled3.userModifications.customNodes["user_preserved_user_preserved_drug1_side"]).toBeUndefined();
      expect(reconciled3.userNotes["user_preserved_drug1_side"]?.noteText).toBe("یادداشت روی عوارض داروی اول");
    });
  });

  describe("8. expandNode Educational Grounding", () => {
    it("fails with DomainError when expanding a node with no available educational source", async () => {
      // Create empty module without document and without published lessons
      const emptyModuleId = "22222222-2222-4222-8222-222222222222" as ModuleId;
      await moduleStore.create({
        id: emptyModuleId,
        courseId,
        title: "فصل خالی",
        sortOrder: 2,
        documentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // Insert completed mind map directly into store for this module
      await store.createPending({
        userId: userA.userId,
        courseId,
        moduleId: emptyModuleId,
        contentType: "mind_map",
        version: 1,
        status: "completed",
        payload: {
          kind: "mind_map",
          version: 1,
          sourceType: "lessons",
          sourceId: emptyModuleId,
          updatedAt: new Date().toISOString(),
          aiBase: {
            rootNodeId: "root",
            generatedAt: new Date().toISOString(),
            model: "gemini-3.5-flash-lite",
            nodes: {
              root: { id: "root", parentId: null, title: "ریشه" },
              target: { id: "target", parentId: "root", title: "گره هدف" },
            },
          },
          userModifications: { deletedNodeIds: [], customNodes: {}, overrides: {} },
          userNotes: {},
        },
        inputSnapshot: {
          capturedAt: new Date().toISOString(),
          moduleId: emptyModuleId,
          moduleTitle: "فصل خالی",
          courseId,
          totalHighlights: 0,
          totalNotes: 0,
          items: [],
        },
        highlightsCount: 0,
        notesCount: 0,
        costToman: 0,
        idempotencyKey: "test_key",
      });

      await expect(service.expandNode(userA, emptyModuleId, "target")).rejects.toThrow(DomainError);
      await expect(service.expandNode(userA, emptyModuleId, "target")).rejects.toThrow("منبع آموزشی معتبر");
    });

    it("selects topically relevant chunk from the end of a long document (page 85) over earlier unrelated chunks", async () => {
      const chunkEarly = {
        id: "chunk-early" as any,
        documentId,
        organizationId: orgId,
        sequence: 1,
        heading: "مقدمات زیست‌شناسی",
        content: "سلول‌ها واحدهای ساختمانی تمام موجودات زنده هستند و ساختار غشایی دارند.",
        startPage: 10,
        endPage: 11,
        tokenEstimate: 50,
        contentHash: "hash-early",
        createdAt: new Date().toISOString(),
      };

      const chunkLate = {
        id: "chunk-late-85" as any,
        documentId,
        organizationId: orgId,
        sequence: 85,
        heading: "داروهای مسدودکننده گیرنده بتا",
        content: "داروهای بتابلوکر مانند پروپرانولول و متوپرولول با کاهش ضربان قلب و فشار خون عمل می‌کنند و در بیماران آسمی منع مصرف دارند.",
        startPage: 85,
        endPage: 86,
        tokenEstimate: 60,
        contentHash: "hash-85",
        createdAt: new Date().toISOString(),
      };

      await chunkStore.createMany([chunkEarly, chunkLate]);
      await service.generateMindMap(userA, moduleId);

      let capturedPrompt = "";
      gateway.complete = async (req: any) => {
        capturedPrompt = req.messages?.find((m: any) => m.role === "user")?.content ?? "";
        return {
          text: JSON.stringify({
            detailedExplanation: "توضیح عمیق بتابلوکرها برگرفته از صفحه ۸۵",
            examples: ["مثال پروپرانولول"],
            examTips: ["کنترااندیکاسیون آسم"],
          }),
          model: "gemini-3.5-flash-lite",
        };
      };

      const result = await service.expandNode(userA, moduleId, "node_beta_blockers");
      expect(result.detailedExplanation).toBe("توضیح عمیق بتابلوکرها برگرفته از صفحه ۸۵");
      expect(capturedPrompt).toContain("داروهای مسدودکننده گیرنده بتا");
      expect(capturedPrompt).toContain("صفحه 85");
      expect(capturedPrompt).not.toContain("مقدمات زیست‌شناسی");
    });

    it("prioritizes chunk matching sourceReferences chunkId with bonus score", async () => {
      const chunkRef = {
        id: "chunk-1" as any,
        documentId,
        organizationId: orgId,
        sequence: 5,
        heading: "ارجاع مستقیم",
        content: "متن ارجاع مستقیم به پروپرانولول برای نود بتابلوکر.",
        startPage: 1,
        endPage: 1,
        tokenEstimate: 50,
        contentHash: "hash-ref",
        createdAt: new Date().toISOString(),
      };
      await chunkStore.createMany([chunkRef]);
      await service.generateMindMap(userA, moduleId);

      let capturedPrompt = "";
      gateway.complete = async (req: any) => {
        capturedPrompt = req.messages?.find((m: any) => m.role === "user")?.content ?? "";
        return {
          text: JSON.stringify({
            detailedExplanation: "توضیح ارجاع مستقیم",
            examples: [],
            examTips: [],
          }),
          model: "gemini-3.5-flash-lite",
        };
      };

      const res = await service.expandNode(userA, moduleId, "node_beta_blockers");
      expect(res.detailedExplanation).toBe("توضیح ارجاع مستقیم");
      expect(capturedPrompt).toContain("متن ارجاع مستقیم به پروپرانولول");
    });

    it("returns cached explanation on second invocation without calling gateway", async () => {
      const chunkRef = {
        id: "chunk-1" as any,
        documentId,
        organizationId: orgId,
        sequence: 1,
        heading: "داروشناسی",
        content: "متن داروشناسی برای بتابلوکرها و پروپرانولول.",
        startPage: 1,
        endPage: 1,
        tokenEstimate: 40,
        contentHash: "hash-ref2",
        createdAt: new Date().toISOString(),
      };
      await chunkStore.createMany([chunkRef]);
      await service.generateMindMap(userA, moduleId);

      let callCount = 0;
      gateway.complete = async () => {
        callCount++;
        return {
          text: JSON.stringify({
            detailedExplanation: "توضیح اول",
            examples: ["مثال"],
            examTips: ["نکته"],
          }),
          model: "gemini-3.5-flash-lite",
        };
      };

      const first = await service.expandNode(userA, moduleId, "node_beta_blockers");
      expect(first.detailedExplanation).toBe("توضیح اول");
      expect(callCount).toBe(1);

      // Second call
      const second = await service.expandNode(userA, moduleId, "node_beta_blockers");
      expect(second.detailedExplanation).toBe("توضیح اول");
      expect(callCount).toBe(1);
    });

    it("falls back to published lessons when document has no matching chunks", async () => {
      const unrelatedChunk = {
        id: "chunk-unrelated" as any,
        documentId,
        organizationId: orgId,
        sequence: 1,
        heading: "شیمی آلی",
        content: "پیوندهای هیدروکربنی و ساختارهای آلکان‌ها.",
        startPage: 10,
        endPage: 11,
        tokenEstimate: 50,
        contentHash: "hash-unrelated",
        createdAt: new Date().toISOString(),
      };
      await chunkStore.createMany([unrelatedChunk]);

      await lessonStore.create({
        id: "lesson-1" as any,
        moduleId: moduleId as ModuleId,
        title: "درس اختصاصی بتابلوکرها",
        contentType: "text",
        contentMarkdown: "درس جامع در مورد داروهای بتابلوکر و اثرات قلبی آن.",
        sortOrder: 1,
        estimatedMinutes: 10,
        publicationStatus: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await service.generateMindMap(userA, moduleId);

      let capturedPrompt = "";
      gateway.complete = async (req: any) => {
        capturedPrompt = req.messages?.find((m: any) => m.role === "user")?.content ?? "";
        return {
          text: JSON.stringify({
            detailedExplanation: "توضیح از درس",
            examples: [],
            examTips: [],
          }),
          model: "gemini-3.5-flash-lite",
        };
      };

      const res = await service.expandNode(userA, moduleId, "node_beta_blockers");
      expect(res.detailedExplanation).toBe("توضیح از درس");
      expect(capturedPrompt).toContain("درس اختصاصی بتابلوکرها");
    });

    it("throws DomainError when neither document chunks nor lessons have topical relevance to the node", async () => {
      const docGeo = "doc-geo" as DocumentId;
      const geologyChunk = {
        id: "chunk-geo" as any,
        documentId: docGeo,
        organizationId: orgId,
        sequence: 1,
        heading: "زمین‌شناسی",
        content: "لایه‌های رسوبی و سنگ‌های آذرین در پوسته زمین.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-geo",
        createdAt: new Date().toISOString(),
      };
      await chunkStore.createMany([geologyChunk]);

      const customModuleId = "33333333-3333-4333-8333-333333333333" as ModuleId;
      await moduleStore.create({
        id: customModuleId,
        courseId,
        title: "فصل زمین",
        sortOrder: 3,
        documentId: docGeo,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await store.createPending({
        userId: userA.userId,
        courseId,
        moduleId: customModuleId,
        contentType: "mind_map",
        version: 1,
        status: "completed",
        payload: {
          kind: "mind_map",
          version: 1,
          sourceType: "document",
          sourceId: docGeo,
          updatedAt: new Date().toISOString(),
          aiBase: {
            rootNodeId: "root",
            generatedAt: new Date().toISOString(),
            model: "gemini-3.5-flash-lite",
            nodes: {
              root: { id: "root", parentId: null, title: "ریشه" },
              quantum_physics: { id: "quantum_physics", parentId: "root", title: "مکانیک کوانتومی پیشرفته" },
            },
          },
          userModifications: { deletedNodeIds: [], customNodes: {}, overrides: {} },
          userNotes: {},
        },
        inputSnapshot: {
          capturedAt: new Date().toISOString(),
          moduleId: customModuleId,
          moduleTitle: "فصل زمین",
          courseId,
          totalHighlights: 0,
          totalNotes: 0,
          items: [],
        },
        highlightsCount: 0,
        notesCount: 0,
        costToman: 0,
        idempotencyKey: "test_key",
      });

      await expect(service.expandNode(userA, customModuleId, "quantum_physics")).rejects.toThrow(DomainError);
      await expect(service.expandNode(userA, customModuleId, "quantum_physics")).rejects.toThrow("منبع آموزشی معتبر و مرتبط با مفهوم");
    });
  });

  describe("9. Version History & Non-Destructive Restore", () => {
    it("lists versions and restores historical version monotonically", async () => {
      // 1. Setup valid chunk source
      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "مرجع",
          content: "متن مرجع داروشناسی برای تولید مایندمپ.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 40,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);

      // Generate version 1
      const gen1 = await service.generateMindMap(userA, moduleId);
      expect(gen1.mind_map.version).toBe(1);

      // Add user note to v1
      await service.updateMindMap(userA, moduleId, {
        userModifications: { deletedNodeIds: [], customNodes: {}, overrides: {} },
        userNotes: {
          node_beta_blockers: { noteText: "یادداشت نسخه ۱", updatedAt: new Date().toISOString() },
        },
      });

      // Generate version 2
      const gen2 = await service.generateMindMap(userA, moduleId);
      expect(gen2.mind_map.version).toBe(2);

      // List versions
      const versionsList = await service.listVersions(userA, moduleId);
      expect(versionsList.versions.length).toBeGreaterThanOrEqual(2);
      expect(versionsList.currentVersion).toBe(2);

      // Restore version 1 -> should create version 3
      const restoreRes = await service.restoreVersion(userA, moduleId, 1);
      expect(restoreRes.success).toBe(true);
      expect(restoreRes.restoredVersion).toBe(3);
      expect(restoreRes.mind_map.version).toBe(3);

      // Historical version 1 must remain untouched
      const v1 = await service.getVersion(userA, moduleId, 1);
      expect(v1.mind_map?.version).toBe(1);

      // Current active version is now 3
      const latest = await service.getMindMap(userA, moduleId);
      expect(latest.mind_map?.version).toBe(3);
    });
  });

  describe("10. Mandatory Error Diagnostics & Concurrency Suite", () => {
    it("safely handles DB record with empty payload ({}) without throwing 500", async () => {
      // Insert a corrupted/legacy record with payload: {}
      const emptyRecord = await store.createPending({
        userId: userA.userId,
        courseId,
        moduleId,
        contentType: "mind_map",
        version: 1,
        status: "completed",
        payload: {}, // Empty JSON object from DB
        inputSnapshot: {
          capturedAt: new Date().toISOString(),
          moduleId,
          moduleTitle: "فصل ۱",
          courseId,
          totalHighlights: 0,
          totalNotes: 0,
          items: [],
        },
        highlightsCount: 0,
        notesCount: 0,
        costToman: 0,
        idempotencyKey: "test_empty_payload_key",
      });

      const getRes = await service.getMindMap(userA, moduleId);
      expect(getRes.has_mind_map).toBe(true);
      expect(getRes.mind_map).toBeDefined();
      expect(getRes.mind_map?.payload.aiBase).toBeDefined();
      expect(getRes.mind_map?.payload.aiBase.rootNodeId).toBe("root");
      expect(getRes.mind_map?.payload.aiBase.nodes["root"]).toBeDefined();
      expect(getRes.mind_map?.payload.aiBase.nodes["root"].title).toBe("گره اصلی");

      // Expanding a nonexistent node should return 404 domain error, not 500 TypeError
      await expect(service.expandNode(userA, moduleId, "nonexistent")).rejects.toThrow("در مایندمپ یافت نشد");
    });

    it("rejects expandNode when target node has empty, null, or missing title with DomainError", async () => {
      // Record with node having empty title
      await store.createPending({
        userId: userA.userId,
        courseId,
        moduleId,
        contentType: "mind_map",
        version: 1,
        status: "completed",
        payload: {
          kind: "mind_map",
          version: 1,
          sourceType: "lessons",
          sourceId: moduleId,
          updatedAt: new Date().toISOString(),
          aiBase: {
            rootNodeId: "root",
            generatedAt: new Date().toISOString(),
            model: "gemini-3.5-flash-lite",
            nodes: {
              root: { id: "root", parentId: null, title: "ریشه" },
              no_title: { id: "no_title", parentId: "root", title: "" }, // empty title
            },
          },
          userModifications: { deletedNodeIds: [], customNodes: {}, overrides: {} },
          userNotes: {},
        },
        inputSnapshot: {
          capturedAt: new Date().toISOString(),
          moduleId,
          moduleTitle: "فصل ۱",
          courseId,
          totalHighlights: 0,
          totalNotes: 0,
          items: [],
        },
        highlightsCount: 0,
        notesCount: 0,
        costToman: 0,
        idempotencyKey: "test_empty_title_key",
      });

      await expect(service.expandNode(userA, moduleId, "no_title")).rejects.toThrow(
        "فاقد عنوان معتبر برای توسعه (Expand) است",
      );
    });

    it("throws 409 Conflict on concurrent mind map generation with same version", async () => {
      await store.createPending({
        userId: userA.userId,
        courseId,
        moduleId,
        contentType: "mind_map",
        version: 1,
        status: "pending",
        payload: {},
        inputSnapshot: {
          capturedAt: new Date().toISOString(),
          moduleId,
          moduleTitle: "فصل ۱",
          courseId,
          totalHighlights: 0,
          totalNotes: 0,
          items: [],
        },
        highlightsCount: 0,
        notesCount: 0,
        costToman: 0,
        idempotencyKey: "key_v1_race",
      });

      // Attempting to create duplicate version 1 throws DomainError conflict (409)
      await expect(
        store.createPending({
          userId: userA.userId,
          courseId,
          moduleId,
          contentType: "mind_map",
          version: 1,
          status: "pending",
          payload: {},
          inputSnapshot: {
            capturedAt: new Date().toISOString(),
            moduleId,
            moduleTitle: "فصل ۱",
            courseId,
            totalHighlights: 0,
            totalNotes: 0,
            items: [],
          },
          highlightsCount: 0,
          notesCount: 0,
          costToman: 0,
          idempotencyKey: "key_v1_race_second",
        }),
      ).rejects.toThrow("یک درخواست همزمان برای ایجاد این نسخه در جریان است.");
    });

    it("throws 409 Conflict on duplicate request with same idempotency key", async () => {
      await store.createPending({
        userId: userA.userId,
        courseId,
        moduleId,
        contentType: "mind_map",
        version: 1,
        status: "pending",
        payload: {},
        inputSnapshot: {
          capturedAt: new Date().toISOString(),
          moduleId,
          moduleTitle: "فصل ۱",
          courseId,
          totalHighlights: 0,
          totalNotes: 0,
          items: [],
        },
        highlightsCount: 0,
        notesCount: 0,
        costToman: 0,
        idempotencyKey: "idempotency_12345",
      });

      await expect(
        store.createPending({
          userId: userA.userId,
          courseId,
          moduleId,
          contentType: "mind_map",
          version: 2,
          status: "pending",
          payload: {},
          inputSnapshot: {
            capturedAt: new Date().toISOString(),
            moduleId,
            moduleTitle: "فصل ۱",
            courseId,
            totalHighlights: 0,
            totalNotes: 0,
            items: [],
          },
          highlightsCount: 0,
          notesCount: 0,
          costToman: 0,
          idempotencyKey: "idempotency_12345",
        }),
      ).rejects.toThrow("درخواست تکراری با این کلید یکتا قبلاً ثبت شده است.");
    });

    it("expands node with cache hit without calling gateway", async () => {
      await store.createPending({
        userId: userA.userId,
        courseId,
        moduleId,
        contentType: "mind_map",
        version: 1,
        status: "completed",
        payload: {
          kind: "mind_map",
          version: 1,
          sourceType: "lessons",
          sourceId: moduleId,
          updatedAt: new Date().toISOString(),
          aiBase: {
            rootNodeId: "root",
            generatedAt: new Date().toISOString(),
            model: "gemini-3.5-flash-lite",
            nodes: {
              root: { id: "root", parentId: null, title: "ریشه" },
              cached_node: {
                id: "cached_node",
                parentId: "root",
                title: "گره کش‌شده",
                detailedExplanation: "توضیحات تفصیلی کش‌شده",
                examples: ["مثال کش‌شده ۱"],
                examTips: ["نکته آزمون کش‌شده"],
              },
            },
          },
          userModifications: { deletedNodeIds: [], customNodes: {}, overrides: {} },
          userNotes: {},
        },
        inputSnapshot: {
          capturedAt: new Date().toISOString(),
          moduleId,
          moduleTitle: "فصل ۱",
          courseId,
          totalHighlights: 0,
          totalNotes: 0,
          items: [],
        },
        highlightsCount: 0,
        notesCount: 0,
        costToman: 0,
        idempotencyKey: "test_cached_key",
      });

      const res = await service.expandNode(userA, moduleId, "cached_node");
      expect(res.success).toBe(true);
      expect(res.detailedExplanation).toBe("توضیحات تفصیلی کش‌شده");
      expect(res.examples).toContain("مثال کش‌شده ۱");
    });

    it("rejects updateMindMap when request body is empty, null, or non-object", async () => {
      await expect(
        service.updateMindMap(userA, moduleId, null as any),
      ).rejects.toThrow(DomainError);

      await expect(
        service.updateMindMap(userA, moduleId, undefined as any),
      ).rejects.toThrow(DomainError);

      await expect(
        service.updateMindMap(userA, moduleId, "string-body" as any),
      ).rejects.toThrow(DomainError);
    });

    it("rejects updateMindMap when userModifications is invalid", async () => {
      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "مقدمه",
          content: "این یک متن طولانی معتبر از فایل مرجع داروشناسی است که برای تست استخراج استفاده می‌شود.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 40,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);
      await service.generateMindMap(userA, moduleId);

      await expect(
        service.updateMindMap(userA, moduleId, {
          userModifications: "not-an-object" as any,
          userNotes: {},
        }),
      ).rejects.toThrow("ساختار تغییرات کاربر (userModifications) نامعتبر است.");
    });

    it("successfully saves valid userModifications and userNotes via updateMindMap", async () => {
      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "مقدمه",
          content: "این یک متن طولانی معتبر از فایل مرجع داروشناسی است که برای تست استخراج استفاده می‌شود.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 40,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);
      await service.generateMindMap(userA, moduleId);

      const updated = await service.updateMindMap(userA, moduleId, {
        userModifications: {
          deletedNodeIds: [],
          customNodes: {
            custom_1: {
              id: "custom_1",
              parentId: "root",
              title: "گره تستی جدید",
              shortDescription: "توضیحات گره",
            },
          },
          overrides: {},
        },
        userNotes: {
          root: { noteText: "یادداشت روی ریشه", updatedAt: new Date().toISOString() },
        },
      });

      expect(updated.payload.userModifications.customNodes["custom_1"]).toBeDefined();
      expect(updated.payload.userNotes["root"]?.noteText).toBe("یادداشت روی ریشه");
    });

    it("handles expandNode with Gateway timeout mapped to timeout DomainError", async () => {
      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "مقدمه",
          content: "این یک متن طولانی معتبر از فایل مرجع داروشناسی است که برای تست استخراج استفاده می‌شود.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 40,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);
      await service.generateMindMap(userA, moduleId);

      const timeoutGateway: ModelGateway = {
        provider: "gemini",
        complete: async () => {
          throw new Error("Gemini API request timed out after 30000ms");
        },
      };
      const mockOrgStore = {
        listMembershipsByUserId: async (uid: UserId) =>
          uid === userA.userId ? [{ organizationId: orgId, role: "student" as const }] : [],
      } as any;
      const timeoutService = new MindMapService(
        store,
        timeoutGateway,
        moduleStore,
        lessonStore,
        courseStore,
        chunkStore,
        undefined,
        mockOrgStore,
        undefined,
        orgId,
      );

      await expect(
        timeoutService.expandNode(userA, moduleId, "node_beta_blockers"),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "timeout",
        }),
      );
    });

    it("handles expandNode with HTTP 429 mapped to rate_limit_exceeded DomainError", async () => {
      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "مقدمه",
          content: "این یک متن طولانی معتبر از فایل مرجع داروشناسی است که برای تست استخراج استفاده می‌شود.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 40,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);
      await service.generateMindMap(userA, moduleId);

      const rateLimitGateway: ModelGateway = {
        provider: "gemini",
        complete: async () => {
          throw new Error("HTTP 429 Too Many Requests: Resource has been exhausted (e.g. check quota)");
        },
      };
      const mockOrgStore = {
        listMembershipsByUserId: async (uid: UserId) =>
          uid === userA.userId ? [{ organizationId: orgId, role: "student" as const }] : [],
      } as any;
      const rateLimitService = new MindMapService(
        store,
        rateLimitGateway,
        moduleStore,
        lessonStore,
        courseStore,
        chunkStore,
        undefined,
        mockOrgStore,
        undefined,
        orgId,
      );

      await expect(
        rateLimitService.expandNode(userA, moduleId, "node_beta_blockers"),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "rate_limit_exceeded",
        }),
      );
    });

    it("handles generateMindMap with HTTP 401 mapped to unauthorized DomainError", async () => {
      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "مقدمه",
          content: "این یک متن طولانی معتبر از فایل مرجع داروشناسی است که برای تست استخراج استفاده می‌شود.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 40,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);
      const authErrorGateway: ModelGateway = {
        provider: "gemini",
        complete: async () => {
          throw new Error("HTTP 401 Unauthorized: API key not valid");
        },
      };
      const mockOrgStore = {
        listMembershipsByUserId: async (uid: UserId) =>
          uid === userA.userId ? [{ organizationId: orgId, role: "student" as const }] : [],
      } as any;
      const authService = new MindMapService(
        store,
        authErrorGateway,
        moduleStore,
        lessonStore,
        courseStore,
        chunkStore,
        undefined,
        mockOrgStore,
        undefined,
        orgId,
      );

      await expect(
        authService.generateMindMap(userA, moduleId),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "unauthorized",
        }),
      );
    });

    it("handles generateMindMap with invalid JSON output mapped to unprocessable DomainError", async () => {
      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "مقدمه",
          content: "این یک متن طولانی معتبر از فایل مرجع داروشناسی است که برای تست استخراج استفاده می‌شود.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 40,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);
      const invalidJsonGateway: ModelGateway = {
        provider: "gemini",
        complete: async () => ({
          text: "{ broken json...",
          model: "gemini-3.5-flash-lite",
          usage: { inputTokens: 10, outputTokens: 10 },
          finishReason: "STOP",
        }),
      };
      const mockOrgStore = {
        listMembershipsByUserId: async (uid: UserId) =>
          uid === userA.userId ? [{ organizationId: orgId, role: "student" as const }] : [],
      } as any;
      const invalidJsonService = new MindMapService(
        store,
        invalidJsonGateway,
        moduleStore,
        lessonStore,
        courseStore,
        chunkStore,
        undefined,
        mockOrgStore,
        undefined,
        orgId,
      );

      await expect(
        invalidJsonService.generateMindMap(userA, moduleId),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "unprocessable",
        }),
      );
    });

    it("handles unknown Gateway errors without masking as 503, preserving internal_error", async () => {
      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "مقدمه",
          content: "این یک متن طولانی معتبر از فایل مرجع داروشناسی است که برای تست استخراج استفاده می‌شود.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 40,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);
      const unknownError = new Error("Something completely unforeseen happened in external driver");
      const unknownGateway: ModelGateway = {
        provider: "gemini",
        complete: async () => {
          throw unknownError;
        },
      };
      const mockOrgStore = {
        listMembershipsByUserId: async (uid: UserId) =>
          uid === userA.userId ? [{ organizationId: orgId, role: "student" as const }] : [],
      } as any;
      const unknownService = new MindMapService(
        store,
        unknownGateway,
        moduleStore,
        lessonStore,
        courseStore,
        chunkStore,
        undefined,
        mockOrgStore,
        undefined,
        orgId,
      );

      await expect(
        unknownService.generateMindMap(userA, moduleId),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "internal_error",
        }),
      );
    });
  });

  describe("11. Structured Lifecycle Logging with Correlation ID Suite", () => {
    it("emits all 10 lifecycle events in order with correlationId, durations, and non-sensitive metadata on success", async () => {
      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "مقدمه",
          content: "این یک متن معتبر آموزشی از مرجع سرفصل فارماکولوژی است که حداقل ۳۰ کاراکتر دارد.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 40,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);

      const capturedEvents: MindMapLifecycleEvent[] = [];
      const mockOrgStore = {
        listMembershipsByUserId: async (uid: UserId) =>
          uid === userA.userId ? [{ organizationId: orgId, role: "student" as const }] : [],
      } as any;

      const loggedService = new MindMapService(
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
        (event) => capturedEvents.push(event),
      );

      const customCorrelationId = "req-test-corr-12345";
      const result = await loggedService.generateMindMap(userA, moduleId, customCorrelationId);
      expect(result.success).toBe(true);

      const expectedStages = [
        "REQUEST_RECEIVED",
        "MODULE_RESOLVED",
        "SOURCE_RESOLVED",
        "SOURCE_CONTENT_LOADED",
        "GEMINI_REQUEST_STARTED",
        "GEMINI_RESPONSE_RECEIVED",
        "MODEL_OUTPUT_PARSED",
        "MIND_MAP_VALIDATED",
        "MIND_MAP_SAVED",
        "RESPONSE_RETURNED",
      ];

      expect(capturedEvents.length).toBe(10);
      expect(capturedEvents.map((e) => e.stage)).toEqual(expectedStages);

      for (const ev of capturedEvents) {
        expect(ev.correlationId).toBe(customCorrelationId);
        expect(ev.moduleId).toBe(moduleId);
        expect(ev.userId).toBe(userA.userId);
        expect(ev.status).toBe("SUCCESS");
        expect(typeof ev.timestamp).toBe("string");
        expect(typeof ev.durationMs).toBe("number");
        expect(ev.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it("captures failure event with FAILED status, duration, exceptionName, and stackTrace on error", async () => {
      const capturedEvents: MindMapLifecycleEvent[] = [];
      const failingGateway: ModelGateway = {
        provider: "gemini",
        complete: async () => {
          const err = new Error("RESOURCE_EXHAUSTED: Gemini API quota exceeded (HTTP 429)");
          (err as any).statusCode = 429;
          throw err;
        },
      };

      await chunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "مقدمه",
          content: "متن آموزشی معتبر برای استخراج نقشه مفهومی هوشمند آوانا به صورت کامل و ساختاریافته.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 40,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);

      const mockOrgStore = {
        listMembershipsByUserId: async (uid: UserId) =>
          uid === userA.userId ? [{ organizationId: orgId, role: "student" as const }] : [],
      } as any;

      const failingService = new MindMapService(
        store,
        failingGateway,
        moduleStore,
        lessonStore,
        courseStore,
        chunkStore,
        undefined,
        mockOrgStore,
        undefined,
        orgId,
        (event) => capturedEvents.push(event),
      );

      const correlationId = "corr-fail-test-429";
      await expect(
        failingService.generateMindMap(userA, moduleId, correlationId),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "rate_limit_exceeded",
        }),
      );

      const failedEvent = capturedEvents.find((e) => e.status === "FAILED");
      expect(failedEvent).toBeDefined();
      expect(failedEvent?.stage).toBe("GEMINI_RESPONSE_RECEIVED");
      expect(failedEvent?.correlationId).toBe(correlationId);
      expect(failedEvent?.error?.exceptionName).toBe("Error");
      expect(failedEvent?.error?.errorMessage).toContain("RESOURCE_EXHAUSTED");
      expect(failedEvent?.error?.geminiHttpStatus).toBe(429);
      expect(failedEvent?.error?.stackTrace).toBeDefined();
    });
  });

  describe("12. Scientific & Structural Domain Scenarios", () => {
    it("Scenario 1: Pharmacology — Corticosteroids deep decomposition with independent child nodes", () => {
      const pharmacologyTree: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "کورتیکواستروئیدها",
            shortDescription: "بررسی دسته‌بندی و فارماکولوژی هورمون‌های کورتیکواستروئیدی",
          },
          node_mineralocorticoids: {
            id: "node_mineralocorticoids",
            parentId: "root",
            title: "مینرالوکورتیکوئیدها",
            shortDescription: "تنظیم‌کننده‌های هومئوستاز آب و سدیم و ترشح پتاسیم",
          },
          node_fludrocortisone: {
            id: "node_fludrocortisone",
            parentId: "node_mineralocorticoids",
            title: "فلودروکورتیزون",
            shortDescription: "مینرالوکورتیکوئید صناعی قوی با اثر گلوکوکورتیکوئیدی کم",
          },
          node_fludro_mechanism: {
            id: "node_fludro_mechanism",
            parentId: "node_fludrocortisone",
            title: "مکانیسم اثر",
            shortDescription: "فعال‌سازی گیرنده‌های داخل سلولی MR در توبول دیستال و مجاری جمع‌کننده",
          },
          node_fludro_na_reabsorp: {
            id: "node_fludro_na_reabsorp",
            parentId: "node_fludro_mechanism",
            title: "بازجذب سدیم",
            shortDescription: "تحریک بیان پمپ Na+/K+ ATPase و کانال‌های اپیتلیالی سدیم (ENaC)",
          },
          node_fludro_k_excretion: {
            id: "node_fludro_k_excretion",
            parentId: "node_fludro_mechanism",
            title: "دفع پتاسیم",
            shortDescription: "افزایش گرادیان الکتروشیمیایی و دفع پتاسیم و یون هیدروژن به لومن ادراری",
          },
          node_fludro_uses: {
            id: "node_fludro_uses",
            parentId: "node_fludrocortisone",
            title: "کاربرد بالینی",
            shortDescription: "درمان جایگزینی در نارسایی اولیه آدرنال (بیماری آدیسون) و هیپوتانسیون ارتوستاتیک",
          },
          node_fludro_adverse: {
            id: "node_fludro_adverse",
            parentId: "node_fludrocortisone",
            title: "عوارض و پایش",
            shortDescription: "احتباس مایعات، پرفشاری خون، هیپوکالمی و آلکالوز متابولیک",
            keyPoints: ["پایش فشار خون و سطح پتاسیم سرم در فواصل منظم"],
            examTips: ["تفاوت اصلی با دگزامتازون: میل ترکیبی بسیار بالا به گیرنده مینرالوکورتیکوئید"],
          },
        },
      };

      const validated = validateMindMapAiBase(pharmacologyTree);
      expect(validated.rootNodeId).toBe("root");
      expect(Object.keys(validated.nodes).length).toBe(8);

      // Verify that major scientific concepts are independent child nodes, not compressed into keyPoints
      expect(validated.nodes["node_fludro_mechanism"].parentId).toBe("node_fludrocortisone");
      expect(validated.nodes["node_fludro_na_reabsorp"].parentId).toBe("node_fludro_mechanism");
      expect(validated.nodes["node_fludro_k_excretion"].parentId).toBe("node_fludro_mechanism");
      expect(validated.nodes["node_fludro_uses"].parentId).toBe("node_fludrocortisone");
      expect(validated.nodes["node_fludro_adverse"].parentId).toBe("node_fludrocortisone");
      expect(validated.nodes["node_fludro_adverse"].keyPoints).toHaveLength(1);
    });

    it("Scenario 2: Pathology — Acute Kidney Injury (AKI) etiology, pathophysiology, diagnosis and treatment", () => {
      const akiTree: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "نارسایی حاد کلیه (AKI)",
            shortDescription: "کاهش ناگهانی عملکرد فیلتراسیون کلیه طی ساعات تا روزها",
          },
          node_aki_etiology: {
            id: "node_aki_etiology",
            parentId: "root",
            title: "اتیولوژی و طبقه‌بندی",
            shortDescription: "طبقه‌بندی بر اساس محل آناتومیک اختلال زمینه‌ای",
          },
          node_prerenal: {
            id: "node_prerenal",
            parentId: "node_aki_etiology",
            title: "پره‌رنال (پیش‌کلیوی)",
            shortDescription: "کاهش پرفیوژن کلیوی ناشی از کاهش حجم موثر داخل عروقی یا نارسایی قلبی",
          },
          node_intrinsic: {
            id: "node_intrinsic",
            parentId: "node_aki_etiology",
            title: "اینترینسیک (داخلی)",
            shortDescription: "آسیب مستقیم به پارانشیم، توبول‌ها، گلومرول‌ها یا عروق کلیه",
          },
          node_atn: {
            id: "node_atn",
            parentId: "node_intrinsic",
            title: "نکروز حاد توبولار (ATN)",
            shortDescription: "شایع‌ترین علت داخلی AKI بر اثر ایسکمی طولانی یا نفروتوکسین‌ها",
          },
          node_postrenal: {
            id: "node_postrenal",
            parentId: "node_aki_etiology",
            title: "پست‌رنال (پس‌کلیوی)",
            shortDescription: "انسداد مکانیکی در مسیر خروجی ادرار از لگنچه تا مجرا",
          },
          node_aki_pathophysiology: {
            id: "node_aki_pathophysiology",
            parentId: "root",
            title: "پاتوفیزیولوژی",
            shortDescription: "مکانیسم‌های سلولی منجر به افت فیلتراسیون گلومرولی",
          },
          node_gfr_reduction: {
            id: "node_gfr_reduction",
            parentId: "node_aki_pathophysiology",
            title: "افت GFR",
            shortDescription: "کاهش فشار هیدروستاتیک مویرگ‌های گلومرولی و انقباض آرتریول آفرنت",
          },
          node_aki_manifestations: {
            id: "node_aki_manifestations",
            parentId: "root",
            title: "تظاهرات بالینی",
            shortDescription: "علائم و نشانه‌های سیستمیک ناشی از عدم تعادل آب و الکترولیت‌ها",
          },
          node_oliguria: {
            id: "node_oliguria",
            parentId: "node_aki_manifestations",
            title: "الیگوری و احتباس",
            shortDescription: "کاهش حجم ادرار به کمتر از ۴۰۰ میلی‌لیتر در ۲۴ ساعت و ادم ریوی/محیطی",
          },
          node_aki_diagnosis: {
            id: "node_aki_diagnosis",
            parentId: "root",
            title: "روش‌های تشخیص",
            shortDescription: "آزمایش‌های بیوشیمیایی و ارزیابی رسوب ادرار",
          },
          node_creatinine_rise: {
            id: "node_creatinine_rise",
            parentId: "node_aki_diagnosis",
            title: "افزایش کراتینین و BUN",
            shortDescription: "افزایش حاد حداقل ۰.۳ mg/dL کراتینین یا ۱.۵ برابر مقدار پایه",
          },
          node_aki_treatment: {
            id: "node_aki_treatment",
            parentId: "root",
            title: "راهبردهای درمانی",
            shortDescription: "اقدامات حمایتی، درمان علت زمینه‌ای و جایگزینی کلیه",
          },
          node_hemodialysis: {
            id: "node_hemodialysis",
            parentId: "node_aki_treatment",
            title: "دیالیز اورژانسی",
            shortDescription: "اندیکاسیون‌های AEIOU (اسیدوز، الکترولیت هیپوکالمی، مسمومیت، اورلود، اورمی)",
          },
        },
      };

      const validated = validateMindMapAiBase(akiTree);
      expect(validated.rootNodeId).toBe("root");
      expect(Object.keys(validated.nodes).length).toBe(14);
      expect(validated.nodes["node_atn"].parentId).toBe("node_intrinsic");
      expect(validated.nodes["node_intrinsic"].parentId).toBe("node_aki_etiology");
      expect(validated.nodes["node_hemodialysis"].parentId).toBe("node_aki_treatment");
    });

    it("Scenario 3: Biochemistry — Gluconeogenesis bypass enzymes, precursors, and reciprocal regulation", () => {
      const gluconeogenesisTree: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "گلوکونئوژنز",
            shortDescription: "سنتز گلوکز از ترکیبات غیرکربوهیدراتی عمدتاً در کبد و قشر کلیه",
          },
          node_precursors: {
            id: "node_precursors",
            parentId: "root",
            title: "پیش‌سازهای گلوکوژنیک",
            shortDescription: "سوبستراهای ورودی به مسیر نوگلوکززایی در حالت ناشتایی",
          },
          node_lactate: {
            id: "node_lactate",
            parentId: "node_precursors",
            title: "لاکتات",
            shortDescription: "حاصل از گلیکولیز بی‌هوازی در گلبول‌های قرمز و عضلات فعال (چرخه کوری)",
          },
          node_glycerol: {
            id: "node_glycerol",
            parentId: "node_precursors",
            title: "گلیسرول",
            shortDescription: "آزادشده از لیپولیز بافت چربی و تبدیل به دی‌هیدروکسی‌استون فسفات",
          },
          node_alanine: {
            id: "node_alanine",
            parentId: "node_precursors",
            title: "آلانین و اسیدهای آمینه",
            shortDescription: "چرخه گلوکز-آلانین عضلانی و ورود از طریق پیرووات یا واسطه‌های چرخه کربس",
          },
          node_bypass_enzymes: {
            id: "node_bypass_enzymes",
            parentId: "root",
            title: "آنزیم‌های مراحل بای‌پس",
            shortDescription: "چهار آنزیم اختصاصی برای دور زدن سه واکنش برگشت‌ناپذیر گلیکولیز",
          },
          node_pyruvate_carboxylase: {
            id: "node_pyruvate_carboxylase",
            parentId: "node_bypass_enzymes",
            title: "پیرووات کربوکسیلاز",
            shortDescription: "آنزیم میتوکندریایی تبدیل پیرووات به اگزالواستات با مصرف ATP و بیوتین",
          },
          node_pepck: {
            id: "node_pepck",
            parentId: "node_bypass_enzymes",
            title: "آنزیم PEPCK",
            shortDescription: "فسفوانول‌پیرووات کربوکسی‌کیناز؛ تبدیل اگزالواستات به فسفوانول‌پیرووات با مصرف GTP",
          },
          node_fbpase_1: {
            id: "node_fbpase_1",
            parentId: "node_bypass_enzymes",
            title: "فروکتوز ۱و۶-بیس‌فسفاتاز-۱",
            shortDescription: "هیدرولیز فروکتوز ۱و۶-بیس‌فسفات به فروکتوز ۶-فسفات؛ نقطه اصلی تنظیم آلوستریک",
          },
          node_g6pase: {
            id: "node_g6pase",
            parentId: "node_bypass_enzymes",
            title: "گلوکز ۶-فسفاتاز",
            shortDescription: "آنزیم متصل به شبکه اندوپلاسمی برای آزادسازی گلوکز آزاد به جریان خون",
          },
          node_regulation: {
            id: "node_regulation",
            parentId: "root",
            title: "تنظیم هورمونی و آلوستریک",
            shortDescription: "کنترل هماهنگ و معکوس گلوکونئوژنز نسبت به گلیکولیز",
          },
          node_allosteric: {
            id: "node_allosteric",
            parentId: "node_regulation",
            title: "تنظیم آلوستریک",
            shortDescription: "فعال‌سازی پیرووات کربوکسیلاز با استیل-کوآ و مهار FBPase-1 با AMP و F-2,6-BP",
          },
          node_hormonal: {
            id: "node_hormonal",
            parentId: "node_regulation",
            title: "تنظیم هورمونی",
            shortDescription: "تحریک توسط گلوکاگون و گلوکوکورتیکوئیدها؛ مهار قوی توسط انسولین",
          },
        },
      };

      const validated = validateMindMapAiBase(gluconeogenesisTree);
      expect(validated.rootNodeId).toBe("root");
      expect(Object.keys(validated.nodes).length).toBe(13);
      expect(validated.nodes["node_pyruvate_carboxylase"].parentId).toBe("node_bypass_enzymes");
      expect(validated.nodes["node_pepck"].parentId).toBe("node_bypass_enzymes");
      expect(validated.nodes["node_fbpase_1"].parentId).toBe("node_bypass_enzymes");
      expect(validated.nodes["node_g6pase"].parentId).toBe("node_bypass_enzymes");
      expect(validated.nodes["node_allosteric"].parentId).toBe("node_regulation");
      expect(validated.nodes["node_hormonal"].parentId).toBe("node_regulation");
    });
  });

  describe("13. Comprehensive User Data Preservation Across 3+ Sequential Regenerations", () => {
    it("preserves userNotes, customNodes, overrides, customEdges, and nodePositions identically across 3 regenerations without loss or incorrect transfer", () => {
      // 1. Initial Tree
      const treeV1: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: "2026-11-06T10:00:00.000Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "فارماکولوژی غدد",
            shortDescription: "نقشه مفهومی داروهای هورمونی",
          },
          node_fludrocortisone: {
            id: "node_fludrocortisone",
            parentId: "root",
            title: "فلودروکورتیزون",
            shortDescription: "آگونیست قوی مینرالوکورتیکوئیدی",
          },
          node_old_beta: {
            id: "node_old_beta",
            parentId: "root",
            title: "بتابلوکر قدیمی",
            shortDescription: "گره‌ای که در نسخه بعدی توسط مدل حذف خواهد شد",
          },
        },
      };

      // User adds data on V1
      const initialPayload: import("@avana/contracts").MindMapPayload = {
        kind: "mind_map",
        version: 1,
        sourceType: "lessons",
        sourceId: moduleId,
        updatedAt: "2026-11-06T10:05:00.000Z",
        aiBase: treeV1,
        userModifications: {
          deletedNodeIds: [],
          customNodes: {
            user_custom_1: {
              id: "user_custom_1",
              parentId: "node_fludrocortisone",
              title: "نکته دست‌نویس استاد",
              shortDescription: "مصرف صبحگاهی همزمان با صبحانه برای کاهش عوارض",
              sortOrder: 1,
            },
          },
          overrides: {
            node_fludrocortisone: {
              title: "فلودروکورتیزون خوراکی (ویرایش‌شده)",
              shortDescription: "توضیح اصلاح‌شده توسط دانشجو",
            },
          },
          customEdges: [
            {
              id: "edge_custom_1",
              source: "user_custom_1",
              target: "node_fludrocortisone",
            },
          ],
          nodePositions: {
            node_fludrocortisone: { x: 300, y: 150 },
            user_custom_1: { x: 450, y: 220 },
            node_old_beta: { x: 100, y: 80 },
          },
        },
        userNotes: {
          node_fludrocortisone: {
            noteText: "یادداشت بسیار مهم بالینی: پایش پتاسیم سرم هر ۲ هفته",
            updatedAt: "2026-11-06T10:06:00.000Z",
          },
          node_old_beta: {
            noteText: "یادداشت روی گره قدیمی که نباید پس از حذف پاک شود",
            updatedAt: "2026-11-06T10:07:00.000Z",
          },
        },
      };

      // 2. Tree V2 (Generated by AI): node_old_beta is removed, new node added
      const treeV2: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: "2026-11-06T10:10:00.000Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "فارماکولوژی غدد",
            shortDescription: "نقشه مفهومی داروهای هورمونی",
          },
          node_fludrocortisone: {
            id: "node_fludrocortisone",
            parentId: "root",
            title: "فلودروکورتیزون",
            shortDescription: "آگونیست قوی مینرالوکورتیکوئیدی",
          },
          node_dexamethasone: {
            id: "node_dexamethasone",
            parentId: "root",
            title: "دگزامتازون",
            shortDescription: "گلوکوکورتیکوئید طویل‌الاثر",
          },
        },
      };

      const reconciledV2 = service.reconcileMindMap(treeV2, initialPayload);

      // Verify V2
      expect(reconciledV2.version).toBe(2);
      expect(reconciledV2.userNotes["node_fludrocortisone"]?.noteText).toBe(
        "یادداشت بسیار مهم بالینی: پایش پتاسیم سرم هر ۲ هفته",
      );
      // The removed node is preserved under user_preserved_node_old_beta
      expect(reconciledV2.userModifications.customNodes["user_preserved_node_old_beta"]).toBeDefined();
      expect(reconciledV2.userNotes["user_preserved_node_old_beta"]?.noteText).toBe(
        "یادداشت روی گره قدیمی که نباید پس از حذف پاک شود",
      );
      // Custom node is preserved
      expect(reconciledV2.userModifications.customNodes["user_custom_1"]).toBeDefined();
      expect(reconciledV2.userModifications.customNodes["user_custom_1"].title).toBe("نکته دست‌نویس استاد");
      // Override is preserved
      expect(reconciledV2.userModifications.overrides["node_fludrocortisone"]?.title).toBe(
        "فلودروکورتیزون خوراکی (ویرایش‌شده)",
      );
      // Coordinates are preserved
      expect(reconciledV2.userModifications.nodePositions?.["node_fludrocortisone"]).toEqual({ x: 300, y: 150 });
      expect(reconciledV2.userModifications.nodePositions?.["user_custom_1"]).toEqual({ x: 450, y: 220 });
      expect(reconciledV2.userModifications.nodePositions?.["user_preserved_node_old_beta"]).toEqual({ x: 100, y: 80 });

      // 3. Tree V3 (Regeneration 2)
      const treeV3: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: "2026-11-06T10:20:00.000Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "فارماکولوژی غدد",
            shortDescription: "نقشه جامع سرفصل",
          },
          node_fludrocortisone: {
            id: "node_fludrocortisone",
            parentId: "root",
            title: "فلودروکورتیزون",
            shortDescription: "آگونیست مینرالوکورتیکوئیدی",
          },
          node_hydrocortisone: {
            id: "node_hydrocortisone",
            parentId: "root",
            title: "هیدروکورتیزون",
            shortDescription: "کورتیکواستروئید با اثر دوگانه",
          },
        },
      };

      const reconciledV3 = service.reconcileMindMap(treeV3, reconciledV2);
      expect(reconciledV3.version).toBe(3);
      // Strictly idempotent: preserved ID must not nest into user_preserved_user_preserved_...
      expect(reconciledV3.userModifications.customNodes["user_preserved_node_old_beta"]).toBeDefined();
      expect(reconciledV3.userModifications.customNodes["user_preserved_user_preserved_node_old_beta"]).toBeUndefined();
      expect(reconciledV3.userNotes["user_preserved_node_old_beta"]?.noteText).toBe(
        "یادداشت روی گره قدیمی که نباید پس از حذف پاک شود",
      );
      expect(reconciledV3.userModifications.nodePositions?.["user_preserved_node_old_beta"]).toEqual({ x: 100, y: 80 });

      // 4. Tree V4 (Regeneration 3)
      const treeV4: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: "2026-11-06T10:30:00.000Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "فارماکولوژی غدد و متابولیسم",
            shortDescription: "نقشه جامع سرفصل",
          },
          node_fludrocortisone: {
            id: "node_fludrocortisone",
            parentId: "root",
            title: "فلودروکورتیزون",
            shortDescription: "آگونیست مینرالوکورتیکوئیدی",
          },
        },
      };

      const reconciledV4 = service.reconcileMindMap(treeV4, reconciledV3);
      expect(reconciledV4.version).toBe(4);

      // Verify final state after 3 regenerations
      // 1. userNotes
      expect(reconciledV4.userNotes["node_fludrocortisone"]?.noteText).toBe(
        "یادداشت بسیار مهم بالینی: پایش پتاسیم سرم هر ۲ هفته",
      );
      expect(reconciledV4.userNotes["user_preserved_node_old_beta"]?.noteText).toBe(
        "یادداشت روی گره قدیمی که نباید پس از حذف پاک شود",
      );

      // 2. customNodes
      expect(reconciledV4.userModifications.customNodes["user_custom_1"]?.title).toBe("نکته دست‌نویس استاد");
      expect(reconciledV4.userModifications.customNodes["user_preserved_node_old_beta"]?.title).toBe("بتابلوکر قدیمی");

      // 3. overrides
      expect(reconciledV4.userModifications.overrides["node_fludrocortisone"]?.title).toBe(
        "فلودروکورتیزون خوراکی (ویرایش‌شده)",
      );

      // 4. customEdges
      expect(reconciledV4.userModifications.customEdges).toHaveLength(1);
      expect(reconciledV4.userModifications.customEdges?.[0].source).toBe("user_custom_1");
      expect(reconciledV4.userModifications.customEdges?.[0].target).toBe("node_fludrocortisone");

      // 5. nodePositions
      expect(reconciledV4.userModifications.nodePositions?.["node_fludrocortisone"]).toEqual({ x: 300, y: 150 });
      expect(reconciledV4.userModifications.nodePositions?.["user_custom_1"]).toEqual({ x: 450, y: 220 });
      expect(reconciledV4.userModifications.nodePositions?.["user_preserved_node_old_beta"]).toEqual({ x: 100, y: 80 });

      // Check effective mind map merges perfectly without cycle or orphan
      const effective = computeEffectiveMindMap(reconciledV4);
      expect(effective.nodes["node_fludrocortisone"]?.title).toBe("فلودروکورتیزون خوراکی (ویرایش‌شده)");
      expect(effective.nodes["node_fludrocortisone"]?.userNote).toBe("یادداشت بسیار مهم بالینی: پایش پتاسیم سرم هر ۲ هفته");
      expect(effective.nodes["user_custom_1"]?.isUserCustom).toBe(true);
      expect(effective.nodes["user_preserved_node_old_beta"]?.isUserCustom).toBe(true);
    });

    it("prevents incorrect transfer of notes between generic/ambiguous nodes with the same title under different conceptual parents", () => {
      // Tree 1: Has "عوارض جانبی" under "متفورمین"
      const treeA: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: "2026-11-06T11:00:00.000Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: { id: "root", parentId: null, title: "دیابت", shortDescription: "سرفصل دیابت" },
          node_metformin: { id: "node_metformin", parentId: "root", title: "متفورمین", shortDescription: "بیگوانید" },
          node_adverse_1: { id: "node_adverse_1", parentId: "node_metformin", title: "عوارض جانبی", shortDescription: "عوارض متفورمین" },
        },
      };

      const payloadA: import("@avana/contracts").MindMapPayload = {
        kind: "mind_map",
        version: 1,
        sourceType: "lessons",
        sourceId: moduleId,
        updatedAt: "2026-11-06T11:05:00.000Z",
        aiBase: treeA,
        userModifications: { deletedNodeIds: [], customNodes: {}, overrides: {} },
        userNotes: {
          node_adverse_1: {
            noteText: "اسیدوز لاکتیک در نارسایی کلیه",
            updatedAt: "2026-11-06T11:06:00.000Z",
          },
        },
      };

      // Tree 2: Now only has "عوارض جانبی" under "انسولین" (an unrelated drug concept!)
      const treeB: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: "2026-11-06T11:10:00.000Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: { id: "root", parentId: null, title: "دیابت", shortDescription: "سرفصل دیابت" },
          node_insulin: { id: "node_insulin", parentId: "root", title: "انسولین", shortDescription: "هورمون انابولیک" },
          node_insulin_adverse: { id: "node_insulin_adverse", parentId: "node_insulin", title: "عوارض جانبی", shortDescription: "عوارض انسولین" },
        },
      };

      const reconciled = service.reconcileMindMap(treeB, payloadA);

      // The note about "اسیدوز لاکتیک در نارسایی کلیه" (metformin) must NOT be transferred to insulin!
      expect(reconciled.userNotes["node_insulin_adverse"]).toBeUndefined();

      // Instead, the user note must be safely preserved under user_preserved_node_adverse_1
      expect(reconciled.userModifications.customNodes["user_preserved_node_adverse_1"]).toBeDefined();
      expect(reconciled.userNotes["user_preserved_node_adverse_1"]?.noteText).toBe(
        "اسیدوز لاکتیک در نارسایی کلیه",
      );
    });
  });

  describe("14. Audit Defect Fixes & Regressions Suite", () => {
    it("Fix 1: falls back to document chunks when published lessons have 0 relevance score to target node", async () => {
      // 1. Add 1 published lesson that is completely unrelated (history of medicine)
      await lessonStore.create({
        id: "lesson-unrelated-history" as any,
        moduleId: moduleId as ModuleId,
        title: "تاریخچه طب یونان باستان و نظریه اخلاط",
        contentType: "text",
        contentMarkdown: "این درس به بررسی آرای بقراط و جالینوس درباره اخلاط چهارگانه یعنی بلغم، سودا، صفرا و دم می‌پردازد و رساله‌های باستانی طب را تحلیل می‌کند.",
        sortOrder: 1,
        estimatedMinutes: 5,
        publicationStatus: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // 2. Add document chunk specifically about the target node concept (beta blockers)
      await chunkStore.createMany([
        {
          id: "chunk-cardio-beta" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "داروهای مسدودکننده گیرنده بتا",
          content: "داروهای بتابلوکر مانند متوپرولول و پروپرانولول با مهار رقابتی گیرنده‌های بتا۱ و بتا۲ باعث کاهش ضربان قلب و کاهش برون‌ده قلبی می‌شوند.",
          startPage: 15,
          endPage: 16,
          tokenEstimate: 50,
          contentHash: "hash-beta",
          createdAt: new Date().toISOString(),
        },
      ]);

      const targetNode: MindMapNodeBase = {
        id: "node_beta_blockers",
        parentId: "root",
        title: "داروهای بتابلوکر",
        shortDescription: "مهارکننده گیرنده‌های بتا",
      };

      // Direct test of resolveRelevantSourceForNode
      const resolved = await service.resolveRelevantSourceForNode(
        moduleId,
        documentId,
        targetNode,
        null,
      );

      // Must NOT select the published lesson (which scored 0)
      expect(resolved.sourceType).toBe("reference_document");
      expect(resolved.sourceId).toBe(documentId);
      expect(resolved.sourceCitations.some((c) => c.chunkId === "chunk-cardio-beta")).toBe(true);
      expect(resolved.sourceText).toContain("متوپرولول");

      // Integration test via expandNode
      await service.generateMindMap(userA, moduleId);

      let capturedPrompt = "";
      gateway.complete = async (req: any) => {
        capturedPrompt = req.messages?.find((m: any) => m.role === "user")?.content ?? "";
        return {
          text: JSON.stringify({
            detailedExplanation: "متوپرولول مهارکننده اختصاصی بتا یک است.",
            examples: ["متوپرولول"],
            examTips: ["کنترااندیکاسیون در آسم"],
          }),
          model: "gemini-3.5-flash-lite",
        };
      };

      const expandRes = await service.expandNode(userA, moduleId, "node_beta_blockers");
      expect(expandRes.detailedExplanation).toBe("متوپرولول مهارکننده اختصاصی بتا یک است.");
      expect(capturedPrompt).toContain("داروهای بتابلوکر مانند متوپرولول");
      expect(capturedPrompt).not.toContain("جالینوس");
    });

    it("Fix 2a: normalizePersianText handles Arabic yeh/kaf, ZWNJ, and whitespace correctly", () => {
      // Arabic yeh and kaf normalization
      expect(normalizePersianText("تاكيكاردي بطني")).toBe("تاکیکاردی بطنی");
      expect(normalizePersianText("كورتيكواستروئيدها")).toBe("کورتیکواستروئیدها");

      // Half-space (ZWNJ \u200c) removed/normalized
      expect(normalizePersianText("بتا\u200cبلوکرها")).toBe("بتابلوکرها");
      expect(normalizePersianText("کورتیکو\u200cاستروئید")).toBe("کورتیکواستروئید");

      // Consecutive whitespace collapsed
      expect(normalizePersianText("داروهای    ضد   فشار   خون")).toBe("داروهای ضد فشار خون");
      expect(normalizePersianText("  متن   با   فاصله   اضافی  ")).toBe("متن با فاصله اضافی");
    });

    it("Fix 2b: findCandidatesForExpansion excludes generic container nodes and matches normalized Persian terms", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: {
          id: "root",
          parentId: null,
          title: "فارماکولوژی قلب و عروق",
          shortDescription: "سرفصل جامع داروشناسی قلب",
        },
        node_intro: {
          id: "node_intro",
          parentId: "root",
          title: "معرفی داروها",
          shortDescription: "مقدمه عمومی بر دسته‌های دارویی",
        },
        node_overview: {
          id: "node_overview",
          parentId: "root",
          title: "کلیات فارماکولوژی",
          shortDescription: "کلیات مبحث",
        },
        node_summary: {
          id: "node_summary",
          parentId: "root",
          title: "دسته‌بندی کلی داروها",
          shortDescription: "فهرست دسته‌ها",
        },
        node_beta: {
          id: "node_beta",
          parentId: "root",
          title: "داروهای بتابلوکر",
          shortDescription: "مهارکننده گیرنده‌های بتا آدرنرژیک",
          keyPoints: ["پروپرانولول"],
        },
        node_ace: {
          id: "node_ace",
          parentId: "root",
          // Node title using Arabic kaf and yeh to test normalization match
          title: "مهاركننده‌هاي آنزيم مبدل آنژيوتانسين",
          shortDescription: "مهار مسیر رنین آنژیوتانسین آلدوسترون",
          keyPoints: ["کاپتوپریل"],
        },
      };

      const sourceText = `
        داروهای بتابلوکر و مهارکننده‌های آنزیم مبدل آنژیوتانسین از ارکان اصلی درمان نارسایی قلبی و فشار خون بالا هستند.
        کاپتوپریل و انالاپریل نمونه‌های بارز این دسته می‌باشند.
      `;

      const candidates = service.findCandidatesForExpansion(nodes, "root", sourceText);
      const candidateIds = candidates.map((c) => c.id);

      // Generic container headings MUST be excluded
      expect(candidateIds).not.toContain("node_intro");
      expect(candidateIds).not.toContain("node_overview");
      expect(candidateIds).not.toContain("node_summary");

      // Valid scientific entities MUST be included
      expect(candidateIds).toContain("node_beta");
      expect(candidateIds).toContain("node_ace");
    });

    it("Fix 3: Progressive Expansion (Stage 2) performs targeted candidate chunk enrichment capped at 25000 chars without exceeding 2 Gemini calls", async () => {
      // Add document chunks with specific candidate details
      await chunkStore.createMany([
        {
          id: "chunk-macro" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "نمای کلی فارماکولوژی قلب",
          content: "داروهای سیستم قلب و عروق شامل دسته‌های اصلی بتابلوکرها و مهارکننده‌های آنزیم آنژیوتانسین هستند.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 50,
          contentHash: "hash-macro",
          createdAt: new Date().toISOString(),
        },
        {
          id: "chunk-beta-detail" as any,
          documentId,
          organizationId: orgId,
          sequence: 2,
          heading: "داروهای بتابلوکر",
          content: "داروهای بتابلوکر شامل متوپرولول، پروپرانولول و آتنولول هستند. اثر بالینی: کاهش مصرف اکسیژن میوکارد و کنترل آنژین صدری. عارضه مهم: برونکواسپاسم در بیماران حساس.",
          startPage: 3,
          endPage: 5,
          tokenEstimate: 60,
          contentHash: "hash-beta-detail",
          createdAt: new Date().toISOString(),
        },
        {
          id: "chunk-ace-detail" as any,
          documentId,
          organizationId: orgId,
          sequence: 3,
          heading: "مهارکننده‌های آنزیم مبدل آنژیوتانسین",
          content: "مهارکننده‌های آنزیم آنژیوتانسین مانند کاپتوپریل و انالاپریل از تبدیل آنژیوتانسین یک به دو جلوگیری می‌کنند. عوارض: سرفه خشک به دلیل مهار تجزیه برادی‌کینین و آنژیوادم.",
          startPage: 6,
          endPage: 8,
          tokenEstimate: 60,
          contentHash: "hash-ace-detail",
          createdAt: new Date().toISOString(),
        },
      ]);

      let callCount = 0;
      let stage1Prompt = "";
      let stage2Prompt = "";

      gateway.complete = async (req: any) => {
        callCount++;
        const prompt = req.messages?.find((m: any) => m.role === "user")?.content ?? "";

        if (callCount === 1) {
          stage1Prompt = prompt;
          // Return Stage 1 Macro Tree
          return {
            text: JSON.stringify({
              rootNodeId: "root",
              nodes: {
                root: {
                  id: "root",
                  parentId: null,
                  title: "فارماکولوژی قلب و عروق",
                  shortDescription: "سرفصل داروشناسی قلب",
                  keyPoints: ["اصول کلی داروشناسی دستگاه قلبی-عروقی"],
                },
                node_beta: {
                  id: "node_beta",
                  parentId: "root",
                  title: "داروهای بتابلوکر",
                  shortDescription: "مهارکننده گیرنده‌های بتا آدرنرژیک",
                  keyPoints: ["متوپرولول", "پروپرانولول"],
                },
                node_ace: {
                  id: "node_ace",
                  parentId: "root",
                  title: "مهارکننده‌های آنزیم آنژیوتانسین",
                  shortDescription: "مهارکننده ACE در نارسایی قلبی",
                  keyPoints: ["کاپتوپریل", "انالاپریل"],
                },
              },
            }),
            model: "gemini-3.5-flash-lite",
          };
        }

        if (callCount === 2) {
          stage2Prompt = prompt;
          // Return Stage 2 Subtrees for candidate nodes
          return {
            text: JSON.stringify({
              newNodes: {
                node_metoprolol: {
                  id: "node_metoprolol",
                  parentId: "node_beta",
                  title: "متوپرولول",
                  shortDescription: "مسدودکننده اختصاصی گیرنده بتا ۱",
                  keyPoints: ["کاهش ضربان قلب"],
                  examTips: ["کنترااندیکاسیون در برادیکاردی شدید"],
                },
                node_captopril: {
                  id: "node_captopril",
                  parentId: "node_ace",
                  title: "کاپتوپریل",
                  shortDescription: "مهارکننده کوتاه‌اثر ACE با گروه سولفیدریل",
                  keyPoints: ["دفع کلیوی", "کاهش برادی‌کینین"],
                  examTips: ["بروز سرفه خشک به دلیل تجمع برادی‌کینین"],
                },
              },
            }),
            model: "gemini-3.5-flash-lite",
          };
        }

        throw new Error(`Unexpected call #${callCount}`);
      };

      const result = await service.generateMindMap(userA, moduleId);

      // 1. Total Gemini calls must be exactly 2
      expect(callCount).toBe(2);
      expect(result.success).toBe(true);

      // 2. Stage 2 prompt must contain candidate-attributed chunk sections
      expect(stage2Prompt).toContain("--- محتوای مرجع اختصاصی برای مفهوم «داروهای بتابلوکر» (شناسه: node_beta) ---");
      expect(stage2Prompt).toContain("متوپرولول، پروپرانولول و آتنولول");
      expect(stage2Prompt).toContain("--- محتوای مرجع اختصاصی برای مفهوم «مهارکننده‌های آنزیم آنژیوتانسین» (شناسه: node_ace) ---");
      expect(stage2Prompt).toContain("سرفه خشک به دلیل مهار تجزیه برادی‌کینین");

      // 3. Resulting MindMap must contain nodes merged from Stage 2
      const allNodes = result.mind_map.payload.aiBase.nodes;
      expect(allNodes["node_metoprolol"]).toBeDefined();
      expect(allNodes["node_metoprolol"].parentId).toBe("node_beta");
      expect(allNodes["node_captopril"]).toBeDefined();
      expect(allNodes["node_captopril"].parentId).toBe("node_ace");
    });
  });

  describe("15. Central Sanitizer & Self-Parent Defect Fix Suite", () => {
    beforeEach(async () => {
      await chunkStore.createMany([
        {
          id: "chunk-reg-1" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "داروهای سایتوتوکسیک و انکولوژی",
          content: "سینتیک سلولی و داروهای سایتوتوکسیک و بتابلوکرها و آلکیلان‌ها مانند سیکلوفسفامید و استاتین‌ها.",
          startPage: 1,
          endPage: 5,
          tokenEstimate: 50,
          contentHash: "hash-reg-1",
          createdAt: new Date().toISOString(),
        },
      ]);
    });

    it("heals Self-Parent node (node_cellular_kinetics) in Stage 1 by attaching to root without throwing DomainError", async () => {
      gateway.complete = async () => ({
        text: JSON.stringify({
          rootNodeId: "root",
          nodes: {
            root: {
              id: "root",
              parentId: null,
              title: "فارماکولوژی سرطان و سینتیک سلولی",
              shortDescription: "سرفصل جامع انکولوژی",
            },
            node_cellular_kinetics: {
              id: "node_cellular_kinetics",
              parentId: "node_cellular_kinetics", // Defect reproduced: self-parent!
              title: "سینتیک سلولی",
              shortDescription: "بررسی منحنی رشد و تکثیر سلول‌های تومورال",
              keyPoints: ["فاز G1 و S", "رشد نمایی گوپرتزیان"],
            },
            node_cell_cycle_specific: {
              id: "node_cell_cycle_specific",
              parentId: "node_cellular_kinetics", // Child of self-parented node
              title: "داروهای اختصاصی چرخه سلولی",
              shortDescription: "اثر در فازهای خاص چرخه سلولی مانند S یا M",
              keyPoints: ["متوترکسات", "وین‌کریستین"],
            },
          },
        }),
        model: "gemini-3.5-flash-lite",
      });

      const result = await service.generateMindMap(userA, moduleId);
      expect(result.success).toBe(true);

      const nodes = result.mind_map.payload.aiBase.nodes;
      // 1. Node node_cellular_kinetics must exist and be re-parented to root
      expect(nodes["node_cellular_kinetics"]).toBeDefined();
      expect(nodes["node_cellular_kinetics"].parentId).toBe("root");
      expect(nodes["node_cellular_kinetics"].title).toBe("سینتیک سلولی");
      expect(nodes["node_cellular_kinetics"].keyPoints).toContain("فاز G1 و S");

      // 2. Child node node_cell_cycle_specific must still point to node_cellular_kinetics
      expect(nodes["node_cell_cycle_specific"]).toBeDefined();
      expect(nodes["node_cell_cycle_specific"].parentId).toBe("node_cellular_kinetics");

      // 3. Tree must pass strict domain validation
      expect(() => validateMindMapAiBase(result.mind_map.payload.aiBase)).not.toThrow();
    });

    it("heals Self-Parent in Stage 2 without discarding valid candidate expansions", async () => {
      let callCount = 0;
      gateway.complete = async () => {
        callCount++;
        if (callCount === 1) {
          return {
            text: JSON.stringify({
              rootNodeId: "root",
              nodes: {
                root: {
                  id: "root",
                  parentId: null,
                  title: "فارماکولوژی انکولوژی",
                  shortDescription: "سرفصل داروهای ضد سرطان",
                },
                node_chemo: {
                  id: "node_chemo",
                  parentId: "root",
                  title: "داروهای سایتوتوکسیک",
                  shortDescription: "شیمی‌درمانی کلاسیک",
                  keyPoints: ["آلکیلان‌ها"],
                },
              },
            }),
            model: "gemini-3.5-flash-lite",
          };
        }

        // Stage 2 returns a self-parented node and a valid child node
        return {
          text: JSON.stringify({
            newNodes: {
              node_alkylating_agents: {
                id: "node_alkylating_agents",
                parentId: "node_alkylating_agents", // Self-parent in Stage 2
                title: "عوامل آلکیلان",
                shortDescription: "اتصال کووالانسی به DNA",
              },
              node_cyclophosphamide: {
                id: "node_cyclophosphamide",
                parentId: "node_alkylating_agents",
                title: "سیکلوفسفامید",
                shortDescription: "پیش‌داروی آلکیلان نیازمند فعال‌سازی کبدی",
              },
            },
          }),
          model: "gemini-3.5-flash-lite",
        };
      };

      const result = await service.generateMindMap(userA, moduleId);
      expect(result.success).toBe(true);

      const nodes = result.mind_map.payload.aiBase.nodes;
      // Both Stage 2 nodes must be present and connected
      expect(nodes["node_alkylating_agents"]).toBeDefined();
      expect(nodes["node_alkylating_agents"].parentId).not.toBe("node_alkylating_agents");
      expect(nodes["node_cyclophosphamide"]).toBeDefined();
      expect(nodes["node_cyclophosphamide"].parentId).toBe("node_alkylating_agents");
      expect(() => validateMindMapAiBase(result.mind_map.payload.aiBase)).not.toThrow();
    });

    it("heals Orphan Parent by attaching to root", () => {
      const raw = {
        rootNodeId: "root",
        nodes: {
          root: { id: "root", parentId: null, title: "ریشه" },
          node_orphan: { id: "node_orphan", parentId: "non_existent_node_xyz", title: "گره یتیم" },
          node_child: { id: "node_child", parentId: "node_orphan", title: "فرزند گره یتیم" },
        },
      };

      const { sanitized, metrics } = service.sanitizeAiMindMapTree(raw);
      expect(metrics.orphanParentsFixed).toBe(1);

      const nodes = (sanitized.nodes as Record<string, any>);
      expect(nodes["node_orphan"].parentId).toBe("root");
      expect(nodes["node_child"].parentId).toBe("node_orphan");
      expect(() => validateMindMapAiBase(sanitized)).not.toThrow();
    });

    it("disambiguates Duplicate IDs without overwriting nodes, preserving children ownership", () => {
      const raw = {
        rootNodeId: "root",
        nodes: {
          root: { id: "root", parentId: null, title: "ریشه" },
          // First instance of duplicate ID
          node_kinetics: { id: "node_kinetics", parentId: "root", title: "سینتیک شیمیایی" },
          child_chem: { id: "child_chem", parentId: "node_kinetics", title: "واکنش مرتبه اول" },
          // Second instance of duplicate ID
          node_kinetics_second: { id: "node_kinetics", parentId: "root", title: "سینتیک سلولی" },
          child_cell: { id: "child_cell", parentId: "node_kinetics_second", title: "رشد تومور" },
        },
      };

      const { sanitized, metrics } = service.sanitizeAiMindMapTree(raw);
      expect(metrics.duplicateIdsFixed).toBe(1);

      const nodes = (sanitized.nodes as Record<string, any>);
      expect(nodes["node_kinetics"]).toBeDefined();
      expect(nodes["node_kinetics"].title).toBe("سینتیک شیمیایی");

      // Disambiguated second node
      expect(nodes["node_kinetics_dup2"]).toBeDefined();
      expect(nodes["node_kinetics_dup2"].title).toBe("سینتیک سلولی");

      // Child 1 points to first kinetics node
      expect(nodes["child_chem"].parentId).toBe("node_kinetics");
      // Child 2 points to disambiguated second kinetics node
      expect(nodes["child_cell"].parentId).toBe("node_kinetics_dup2");

      expect(() => validateMindMapAiBase(sanitized)).not.toThrow();
    });

    it("handles multiple nodes with duplicate IDs (3+ duplicates)", () => {
      const raw = {
        rootNodeId: "root",
        nodes: {
          root: { id: "root", parentId: null, title: "ریشه" },
          n1: { id: "node_dup", parentId: "root", title: "تکرار ۱" },
          n2: { id: "node_dup", parentId: "root", title: "تکرار ۲" },
          n3: { id: "node_dup", parentId: "root", title: "تکرار ۳" },
        },
      };

      const { sanitized, metrics } = service.sanitizeAiMindMapTree(raw);
      expect(metrics.duplicateIdsFixed).toBe(2);

      const nodes = (sanitized.nodes as Record<string, any>);
      expect(nodes["node_dup"]).toBeDefined();
      expect(nodes["node_dup_dup2"]).toBeDefined();
      expect(nodes["node_dup_dup3"]).toBeDefined();
      expect(() => validateMindMapAiBase(sanitized)).not.toThrow();
    });

    it("detects and breaks 2-node cycles (A -> B -> A)", () => {
      const raw = {
        rootNodeId: "root",
        nodes: {
          root: { id: "root", parentId: null, title: "ریشه" },
          node_a: { id: "node_a", parentId: "node_b", title: "گره الف" },
          node_b: { id: "node_b", parentId: "node_a", title: "گره ب" },
        },
      };

      const { sanitized, metrics } = service.sanitizeAiMindMapTree(raw);
      expect(metrics.cyclesFixed).toBeGreaterThanOrEqual(1);

      const nodes = (sanitized.nodes as Record<string, any>);
      expect(nodes["node_a"]).toBeDefined();
      expect(nodes["node_b"]).toBeDefined();
      expect(() => validateMindMapAiBase(sanitized)).not.toThrow();
    });

    it("detects and breaks 3-node cycles (A -> B -> C -> A)", () => {
      const raw = {
        rootNodeId: "root",
        nodes: {
          root: { id: "root", parentId: null, title: "ریشه" },
          node_a: { id: "node_a", parentId: "node_b", title: "گره الف" },
          node_b: { id: "node_b", parentId: "node_c", title: "گره ب" },
          node_c: { id: "node_c", parentId: "node_a", title: "گره ج" },
        },
      };

      const { sanitized, metrics } = service.sanitizeAiMindMapTree(raw);
      expect(metrics.cyclesFixed).toBeGreaterThanOrEqual(1);

      const nodes = (sanitized.nodes as Record<string, any>);
      expect(nodes["node_a"]).toBeDefined();
      expect(nodes["node_b"]).toBeDefined();
      expect(nodes["node_c"]).toBeDefined();
      expect(() => validateMindMapAiBase(sanitized)).not.toThrow();
    });

    it("supports multiple children for one parent cleanly", () => {
      const raw = {
        rootNodeId: "root",
        nodes: {
          root: { id: "root", parentId: null, title: "ریشه" },
          parent_node: { id: "parent_node", parentId: "root", title: "والد مشترک" },
          c1: { id: "c1", parentId: "parent_node", title: "فرزند ۱" },
          c2: { id: "c2", parentId: "parent_node", title: "فرزند ۲" },
          c3: { id: "c3", parentId: "parent_node", title: "فرزند ۳" },
          c4: { id: "c4", parentId: "parent_node", title: "فرزند ۴" },
        },
      };

      const { sanitized } = service.sanitizeAiMindMapTree(raw);
      const nodes = (sanitized.nodes as Record<string, any>);
      expect(nodes["c1"].parentId).toBe("parent_node");
      expect(nodes["c2"].parentId).toBe("parent_node");
      expect(nodes["c3"].parentId).toBe("parent_node");
      expect(nodes["c4"].parentId).toBe("parent_node");
      expect(() => validateMindMapAiBase(sanitized)).not.toThrow();
    });

    it("re-expands candidate nodes that already have 1 child", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: { id: "root", parentId: null, title: "سرفصل اصلی", shortDescription: "سرفصل" },
        node_beta: {
          id: "node_beta",
          parentId: "root",
          title: "بتابلوکرها",
          shortDescription: "داروهای مسدودکننده بتا آدرنرژیک",
          keyPoints: ["متوپرولول"],
        },
        node_beta_child1: {
          id: "node_beta_child1",
          parentId: "node_beta",
          title: "پروپرانولول",
          shortDescription: "مهارکننده غیراختصاصی",
        },
      };

      const candidates = service.findCandidatesForExpansion(nodes, "root", "متن حاوی بتابلوکرها و پروپرانولول و متوپرولول");
      // Node with 1 child should still be eligible for expansion
      expect(candidates.map((c) => c.id)).toContain("node_beta");
    });

    it("preserves IDs and scientific content of valid nodes without changes", () => {
      const raw = {
        rootNodeId: "root",
        nodes: {
          root: { id: "root", parentId: null, title: "ریشه", shortDescription: "شرح" },
          node_safe: {
            id: "node_safe",
            parentId: "root",
            title: "عنوان معتبر",
            shortDescription: "توضیح کوتاه علمی",
            keyPoints: ["نکته ۱", "نکته ۲"],
            examTips: ["نکته تستی"],
          },
        },
      };

      const { sanitized, metrics } = service.sanitizeAiMindMapTree(raw);
      expect(metrics.selfParentsFixed).toBe(0);
      expect(metrics.orphanParentsFixed).toBe(0);
      expect(metrics.duplicateIdsFixed).toBe(0);
      expect(metrics.cyclesFixed).toBe(0);

      const nodes = (sanitized.nodes as Record<string, any>);
      expect(nodes["node_safe"].id).toBe("node_safe");
      expect(nodes["node_safe"].title).toBe("عنوان معتبر");
      expect(nodes["node_safe"].shortDescription).toBe("توضیح کوتاه علمی");
      expect(nodes["node_safe"].keyPoints).toEqual(["نکته ۱", "نکته ۲"]);
    });

    it("prevents Stage 2 from overwriting Stage 1 nodes with duplicate IDs", async () => {
      let callCount = 0;
      gateway.complete = async () => {
        callCount++;
        if (callCount === 1) {
          return {
            text: JSON.stringify({
              rootNodeId: "root",
              nodes: {
                root: { id: "root", parentId: null, title: "داروشناسی", shortDescription: "سرفصل" },
                node_ace: {
                  id: "node_ace",
                  parentId: "root",
                  title: "مهارکننده آنزیم مبدل آنژیوتانسین",
                  shortDescription: "محتوای اصلی مرحله اول",
                  keyPoints: ["کاپتوپریل"],
                },
              },
            }),
            model: "gemini-3.5-flash-lite",
          };
        }

        // Stage 2 returns a node reusing node_ace ID with a different concept
        return {
          text: JSON.stringify({
            newNodes: {
              node_ace: {
                id: "node_ace",
                parentId: "node_ace",
                title: "مهارکننده گیرنده آنژیوتانسین (ARB)",
                shortDescription: "محتوای مرحله دوم",
              },
            },
          }),
          model: "gemini-3.5-flash-lite",
        };
      };

      const result = await service.generateMindMap(userA, moduleId);
      expect(result.success).toBe(true);

      const nodes = result.mind_map.payload.aiBase.nodes;
      // Stage 1 node must be intact and not overwritten
      expect(nodes["node_ace"].title).toBe("مهارکننده آنزیم مبدل آنژیوتانسین");
      expect(nodes["node_ace"].shortDescription).toBe("محتوای اصلی مرحله اول");

      // Stage 2 node must be disambiguated rather than overwriting
      expect(nodes["node_ace_ext_2"]).toBeDefined();
      expect(nodes["node_ace_ext_2"].title).toBe("مهارکننده گیرنده آنژیوتانسین (ARB)");
    });

    it("maintains maximum 2 Gemini calls limit in full generation pipeline", async () => {
      let callCount = 0;
      gateway.complete = async () => {
        callCount++;
        if (callCount === 1) {
          return {
            text: JSON.stringify({
              rootNodeId: "root",
              nodes: {
                root: { id: "root", parentId: null, title: "سرفصل", shortDescription: "توضیح", keyPoints: ["مفاهیم کلی داروشناسی"] },
                node_statin: {
                  id: "node_statin",
                  parentId: "root",
                  title: "استاتین‌ها",
                  shortDescription: "مهارکننده HMG-CoA ردوکتاز",
                  keyPoints: ["آتورواستاتین"],
                },
              },
            }),
            model: "gemini-3.5-flash-lite",
          };
        }
        return {
          text: JSON.stringify({
            newNodes: {
              node_atorva: {
                id: "node_atorva",
                parentId: "node_statin",
                title: "آتورواستاتین",
                shortDescription: "کاهش LDL پلاسما",
                keyPoints: ["مهار رقابتی HMG-CoA ردوکتاز"],
              },
            },
          }),
          model: "gemini-3.5-flash-lite",
        };
      };

      const result = await service.generateMindMap(userA, moduleId);
      expect(callCount).toBe(2);
      expect(result.success).toBe(true);
    });

    it("records sanitization metrics in lifecycle events without sensitive data", async () => {
      const emittedEvents: any[] = [];
      const loggedService = new MindMapService(
        store,
        gateway,
        moduleStore,
        lessonStore,
        courseStore,
        chunkStore,
        undefined,
        {
          listMembershipsByUserId: async (uid: UserId) =>
            uid === userA.userId ? [{ organizationId: orgId, role: "student" as const }] : [],
        } as any,
        undefined,
        orgId,
        (event) => emittedEvents.push(event),
      );

      gateway.complete = async () => ({
        text: JSON.stringify({
          rootNodeId: "root",
          nodes: {
            root: { id: "root", parentId: null, title: "سرفصل اصلی", shortDescription: "شرح" },
            node_self: { id: "node_self", parentId: "node_self", title: "گره خودوالد" },
          },
        }),
        model: "gemini-3.5-flash-lite",
      });

      const res = await loggedService.generateMindMap(userA, moduleId);
      expect(res.success).toBe(true);

      const valEvent = emittedEvents.find((e) => e.stage === "MIND_MAP_VALIDATED");
      expect(valEvent).toBeDefined();
      expect(valEvent.details.sanitization).toBeDefined();
      expect(valEvent.details.sanitization.selfParentsFixed).toBe(1);
      expect(valEvent.details.sanitization.nodesAccepted).toBe(2);
      expect(JSON.stringify(valEvent)).not.toContain("password");
      expect(JSON.stringify(valEvent)).not.toContain("bearer");
    });
  });

  describe("16. Hierarchical Category Decomposition & Reconcile NodePositions Suite", () => {
    it("generates and preserves multi-level category nodes with child entities and independent root concepts", async () => {
      await chunkStore.createMany([
        {
          id: "chunk-suite-16" as any,
          documentId,
          organizationId: orgId,
          sequence: 1,
          heading: "فارماکولوژی پرفشاری خون",
          content: "فارماکولوژی داروهای کاهنده فشار خون شامل مهارکننده‌های آنزیم مبدل آنژیوتانسین و بتابلوکرها می‌باشد.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 50,
          contentHash: "hash-suite-16",
          createdAt: new Date().toISOString(),
        },
      ]);

      gateway.complete = async () => ({
        text: JSON.stringify({
          rootNodeId: "root",
          nodes: {
            root: {
              id: "root",
              parentId: null,
              title: "فارماکولوژی پرفشاری خون",
              shortDescription: "بررسی راهبردهای دارویی و تشخیصی",
            },
            node_definition: {
              id: "node_definition",
              parentId: "root",
              title: "تعریف بالینی",
              shortDescription: "فشار سیستولی بالای ۱۳۰ یا دیاستولی بالای ۸۰",
            },
            node_treatment: {
              id: "node_treatment",
              parentId: "root",
              title: "راهبردهای درمانی",
              shortDescription: "دسته‌بندی داروهای خط اول و دوم",
              nodeRole: "category",
            },
            node_acei: {
              id: "node_acei",
              parentId: "node_treatment",
              title: "مهارکننده‌های ACE",
              shortDescription: "بلوک تبدیل آنژیوتانسین ۱ به ۲",
              nodeRole: "category",
            },
            node_captopril: {
              id: "node_captopril",
              parentId: "node_acei",
              title: "کاپتوپریل",
              shortDescription: "مهارکننده کوتاه اثر آنزیم تبدیل‌کننده",
              keyPoints: ["نیمه عمر کوتاه", "مصرف قبل از غذا"],
            },
            node_enalapril: {
              id: "node_enalapril",
              parentId: "node_acei",
              title: "انالاپریل",
              shortDescription: "پیش‌داروی طولانی اثر",
            },
            node_beta_blockers: {
              id: "node_beta_blockers",
              parentId: "node_treatment",
              title: "بتابلوکرها",
              shortDescription: "مهار سمپاتیک و کاهش برون‌ده قلبی",
              nodeRole: "category",
            },
            node_metoprolol: {
              id: "node_metoprolol",
              parentId: "node_beta_blockers",
              title: "متوپرولول",
              shortDescription: "بتابلوکر اختصاصی بتا-۱",
            },
          },
        }),
        model: "gemini-3.5-flash-lite",
      });

      const res = await service.generateMindMap(userA, moduleId);
      expect(res.success).toBe(true);
      const nodes = res.mind_map.payload.aiBase.nodes;

      // 1. Root structure
      expect(nodes["root"].parentId).toBeNull();

      // 2. Independent node directly connected to root
      expect(nodes["node_definition"].parentId).toBe("root");
      expect(nodes["node_definition"].nodeRole).toBeUndefined();

      // 3. Category node connected to root
      expect(nodes["node_treatment"].parentId).toBe("root");
      expect(nodes["node_treatment"].nodeRole).toBe("category");

      // 4. Sub-category connected to category node
      expect(nodes["node_acei"].parentId).toBe("node_treatment");
      expect(nodes["node_acei"].nodeRole).toBe("category");

      // 5. Drugs connected to their respective subcategory
      expect(nodes["node_captopril"].parentId).toBe("node_acei");
      expect(nodes["node_enalapril"].parentId).toBe("node_acei");
      expect(nodes["node_metoprolol"].parentId).toBe("node_beta_blockers");
    });

    it("resets manual position only for nodes whose parent has changed while preserving others", () => {
      // Previous tree: flat structure where captopril and definition were both directly on root
      const previousPayload: import("@avana/contracts").MindMapPayload = {
        kind: "mind_map",
        version: 1,
        sourceType: "reference_document",
        sourceId: "doc_1",
        updatedAt: "2026-11-05T00:00:00.000Z",
        aiBase: {
          rootNodeId: "root",
          generatedAt: "2026-11-05T00:00:00.000Z",
          model: "gemini-3.5-flash-lite",
          nodes: {
            root: { id: "root", parentId: null, title: "فشار خون", shortDescription: "" },
            node_definition: { id: "node_definition", parentId: "root", title: "تعریف", shortDescription: "" },
            node_captopril: { id: "node_captopril", parentId: "root", title: "کاپتوپریل", shortDescription: "" },
          },
        },
        userModifications: {
          deletedNodeIds: [],
          customNodes: {},
          overrides: {
            node_captopril: { title: "کاپتوپریل (ویرایش‌شده)" },
          },
          nodePositions: {
            node_definition: { x: 200, y: -100 },
            node_captopril: { x: 200, y: 150 },
          },
        },
        userNotes: {
          node_captopril: { noteText: "یادداشت من روی کاپتوپریل", updatedAt: "2026-11-05T00:00:00.000Z" },
        },
      };

      // New tree: captopril has moved under category node_treatment, but node_definition stayed under root
      const newAiBase: import("@avana/contracts").MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: "2026-11-06T00:00:00.000Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: { id: "root", parentId: null, title: "فشار خون", shortDescription: "" },
          node_definition: { id: "node_definition", parentId: "root", title: "تعریف", shortDescription: "" },
          node_treatment: { id: "node_treatment", parentId: "root", title: "درمان", shortDescription: "", nodeRole: "category" },
          node_captopril: { id: "node_captopril", parentId: "node_treatment", title: "کاپتوپریل", shortDescription: "" },
        },
      };

      const reconciled = service.reconcileMindMap(newAiBase, previousPayload);

      // 1. userNotes on captopril must be 100% preserved
      expect(reconciled.userNotes["node_captopril"]?.noteText).toBe("یادداشت من روی کاپتوپریل");

      // 2. overrides on captopril must be 100% preserved
      expect(reconciled.userModifications.overrides["node_captopril"]?.title).toBe("کاپتوپریل (ویرایش‌شده)");

      // 3. nodePositions: node_definition parent did NOT change -> position PRESERVED
      expect(reconciled.userModifications.nodePositions?.["node_definition"]).toEqual({ x: 200, y: -100 });

      // 4. nodePositions: node_captopril parent CHANGED from root to node_treatment -> position SAFELY RESET
      expect(reconciled.userModifications.nodePositions?.["node_captopril"]).toBeUndefined();
    });
  });

  describe("17. Specialized Nature-Adaptive Educational Quality Suite (6 Node Archetypes)", () => {
    const archetypeModuleId = "22222222-2222-4222-8222-222222222222";
    const archetypeDocId = "doc-archetypes" as DocumentId;

    const sixArchetypesSourceText = `
فصل جامع غدد و دیابت:
۱. مقاومت به انسولین (مفهوم پایه و پاتوفیزیولوژی):
کاهش پاسخ‌دهی بافت‌های محیطی (به ویژه عضلات اسکلتی و کبد) به غلظت‌های فیزیولوژیک انسولین، ناشی از اختلال در فسفوریلاسیون تیروزین در سوبستراهای گیرنده انسولین (IRS-1). این پدیده منجر به هایپرانسولینمی جبرانی و در نهایت اختلال تحمل گلوکز می‌گردد. چاقی احشایی عامل تسریع‌کننده اصلی است.

۲. متفورمین (داروشناسی و فارماکوکینتیک):
متفورمین داروی خط اول درمان دیابت نوع ۲ از دسته بیگوآنیدها است. این دارو ترشح انسولین را تحریک نمی‌کند و بنابراین خطر هایپوگلایسمی به تنهایی ندارد. دفع آن منحصراً کلیوی و بدون متابولیسم کبدی است. شایع‌ترین عوارض شامل عوارض گوارشی (تهوع و اسهال) و خطرناک‌ترین عارضه اسیدوز لاکتیک است. در نارسایی شدید کلیه (eGFR < 30) منع مصرف مطلق دارد.

۳. فعال‌سازی AMPK (مکانیسم اثر سلولی-مولکولی):
متفورمین کمپلکس I زنجیره انتقال الکترون میتوکندری را مهار می‌کند. این امر نسبت AMP به ATP را افزایش داده و آنزیم کیناز فعال‌شده با AMP (AMPK) را فعال می‌سازد. AMPK فسفوریلاسیون فاکتورهای رونویسی را تغییر داده و بیان ژن‌های کلیدی گلوکونئوژنز (مانند PEPCK و گلوکز-۶-فسفاتاز) را مهار می‌کند.

۴. مراحل گلوکونئوژنز (فرایند ترتیبی و گام‌به‌گام):
مسیر سنتز گلوکز از پیرووات شامل ۴ واکنش کلیدی است:
گام اول: تبدیل پیرووات به اگزالواستات توسط پیرووات کربوکسیلاز میتوکندریایی وابسته به بیوتین.
گام دوم: تبدیل اگزالواستات به فسفوانول‌پیرووات توسط PEPCK سیتوزولی.
گام سوم: دفسفوریلاسیون فروکتوز-۱و۶-بیس‌فسفات به فروکتوز-۶-فسفات توسط فروکتوز-۱و۶-بیس‌فسفاتاز.
گام چهارم: هیدرولیز نهایی گلوکز-۶-فسفات به گلوکز آزاد توسط گلوکز-۶-فسفاتاز در شبکه آندوپلاسمی کبد.

۵. مقایسه دیابت نوع ۱ و دیابت نوع ۲ (مفهوم مقایسه‌ای و افتراقی):
دیابت نوع ۱ ناشی از تخریب خودایمنی سلول‌های بتای پانکراس (واسطه آنتی‌بادی‌های ضد GAD65 و انسولین) با کمبود مطلق انسولین و تمایل شدید به کتواسیدوز دیابتی (DKA) در سنین پایین است. در مقابل، دیابت نوع ۲ ناشی از ترکیب مقاومت محیطی به انسولین و نقص نسبی ترشح آن با تمایل به سندرم هایپراسمولار هایپرگلایسمیک (HHS) و ارتباط قوی با سبک زندگی و چاقی است.

۶. هموگلوبین A1c (توضیحات اولیه کوتاه و آزمایشگاهی):
سنجش میانگین قند خون در دوره عمر ۲ تا ۳ ماهه گلبول‌های قرمز از طریق گلیکوزیلاسیون غیرآنزیمی هموگلوبین. معیار تشخیصی ≥ ۶.۵٪ است. در هموگلوبینوپاتی‌ها و کم‌خونی همولیتیک ممکن است کاذب باشد.
    `;

    beforeEach(async () => {
      await moduleStore.create({
        id: archetypeModuleId as ModuleId,
        courseId,
        title: "فصل دیابت و متابولیسم",
        sortOrder: 2,
        documentId: archetypeDocId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await chunkStore.create({
        id: "chunk-arch-1",
        documentId: archetypeDocId,
        sequence: 1,
        content: sixArchetypesSourceText,
        startPage: 1,
        endPage: 5,
        heading: "فصل جامع غدد و دیابت",
      });
    });

    it("verifies 6 distinct archetypes: nature-adaptive mini-lessons, strict grounding, deduplication, and caching", async () => {
      // 1. Initial Mind Map with 6 archetypes generated
      const initialNodesTree = {
        rootNodeId: "root",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "فصل دیابت و متابولیسم",
            shortDescription: "ساختار جامع پاتولوژی، فارماکولوژی و مکانیسم‌های دیابت",
            category: "general",
          },
          // 1. Concept Node
          node_insulin_resistance: {
            id: "node_insulin_resistance",
            parentId: "root",
            title: "مقاومت به انسولین",
            shortDescription: "کاهش پاسخ بافت‌های هدف به غلظت فیزیولوژیک انسولین",
            category: "disease",
            keyPoints: ["اختلال در فسفوریلاسیون تیروزین سوبستراهای گیرنده انسولین (IRS-1)"],
            examTips: ["چاقی احشایی عامل تسریع‌کننده اصلی هایپرانسولینمی جبرانی است"],
          },
          // 2. Pharmacology Node
          node_metformin: {
            id: "node_metformin",
            parentId: "root",
            title: "متفورمین",
            shortDescription: "بیگوآنید خط اول درمان دیابت نوع ۲ بدون ایجاد هایپوگلایسمی",
            category: "drug",
            keyPoints: ["دفع منحصراً کلیوی بدون متابولیسم کبدی"],
            examTips: ["منع مصرف در eGFR زیر ۳۰ به دلیل خطر اسیدوز لاکتیک"],
          },
          // 3. Cellular Mechanism Node
          node_ampk_activation: {
            id: "node_ampk_activation",
            parentId: "root",
            title: "فعال‌سازی AMPK",
            shortDescription: "تحریک کیناز حساس به انرژی به دنبال افزایش نسبت AMP به ATP",
            category: "cellular_mechanism",
            keyPoints: ["مهار بیان ژن‌های کلیدی گلوکونئوژنز کبدی (PEPCK)"],
          },
          // 4. Sequential Process Node
          node_gluconeogenesis_steps: {
            id: "node_gluconeogenesis_steps",
            parentId: "root",
            title: "مراحل گلوکونئوژنز",
            shortDescription: "مسیر سنتز گلوکز از پیرووات طی چهار واکنش آنزیمی کلیدی",
            category: "biochemistry",
            keyPoints: ["آنزیم نهایی گلوکز-۶-فسفاتاز در شبکه آندوپلاسمی کبد قرار دارد"],
          },
          // 5. Comparative Node
          node_t1d_vs_t2d: {
            id: "node_t1d_vs_t2d",
            parentId: "root",
            title: "مقایسه دیابت نوع ۱ و ۲",
            shortDescription: "تخریب خودایمنی سلول‌های بتا در برابر مقاومت محیطی با نقص نسبی",
            category: "disease",
            keyPoints: ["تمایل دیابت نوع ۱ به DKA در برابر تمایل دیابت نوع ۲ به HHS"],
            examTips: ["مارکرهای تشخیصی اختصاصی نوع ۱: آنتی‌بادی‌های ضد GAD65 و ضد انسولین"],
          },
          // 6. Short Description Node
          node_hba1c: {
            id: "node_hba1c",
            parentId: "root",
            title: "هموگلوبین A1c",
            shortDescription: "شاخص میانگین قند خون ۲ الی ۳ ماهه",
            category: "general",
            keyPoints: ["سنجش گلیکوزیلاسیون غیرآنزیمی گلبول‌های قرمز"],
            examTips: ["معیار قطعی تشخیصی دیابت: مساوی یا بیشتر از ۶.۵ درصد"],
          },
        },
      };

      let gatewayCallCount = 0;
      let lastRequestedPrompt = "";

      gateway.complete = async (req) => {
        gatewayCallCount++;
        const userMsg = req.messages.find((m) => m.role === "user")?.content || "";
        lastRequestedPrompt = userMsg;

        if (req.promptVersion === "2.0-deep") {
          return { text: JSON.stringify(initialNodesTree) } as any;
        }

        if (req.promptVersion === "2.0-specialized") {
          // Verify prompt has nature-adaptive system prompt and concept details
          expect(req.messages[0].content).toContain("Nature-Adaptive Intelligence");
          expect(req.messages[0].content).toContain("Deduplication & Deepening");
          expect(req.messages[0].content).toContain("Strict Grounding");

          if (userMsg.includes("عنوان گره: «متفورمین»")) {
            return {
              text: JSON.stringify({
                detailedExplanation: "متفورمین از رده بیگوآنیدها، با مهار کمپلکس ۱ زنجیره تنفسی میتوکندری و تحریک AMPK، گلوکونئوژنز کبد را تا ۳۰ درصد سرکوب نموده و حساسیت به انسولین را در عضلات محیطی ارتقا می‌دهد.",
                examples: ["بیمار مبتلا به دیابت نوع ۲ تازه تشخیص داده شده همراه با اضافه وزن"],
                examTips: ["عدم نیاز به تنظیم دوز بر اساس عملکرد کبد زیرا متابولیسم کبدی ندارد و دفع کلاً کلیوی است"],
                structuredDetails: {
                  mechanismOfAction: "مهار کمپلکس I میتوکندری و فعال‌سازی پروتئین کیناز وابسته به AMP (AMPK)",
                  indications: ["خط اول درمان دیابت شیرین نوع ۲"],
                  drugClass: "بیگوآنید (Biguanide)",
                  pharmacology: "دفع بدون تغییر از ادرار از طریق ترشح توبولار کلیوی",
                  adverseEffects: ["عوارض شایع گوارشی (اسهال، نفخ)", "اسیدوز لاکتیک نادر اما کشنده"],
                  contraindications: ["eGFR کمتر از ۳۰ میلی‌لیتر در دقیقه", "شوک و اسیدوز متابولیک"],
                  interactions: ["مواد حاجب یددار رادیولوژی"],
                  clinicalPearls: ["قطع مصرف ۴۸ ساعت پیش از تزریق ماده حاجب یددار"],
                  commonPitfalls: ["اشتباه گرفتن با سولفونیل‌اوره‌ها و ترس بیجا از بروز هایپوگلایسمی"],
                },
              }),
            } as any;
          }

          if (userMsg.includes("عنوان گره: «مقاومت به انسولین»")) {
            return {
              text: JSON.stringify({
                detailedExplanation: "مقاومت به انسولین پاتولوژی زمینه‌ای اصلی دیابت نوع ۲ و سندرم متابولیک است که طی آن بافت هدف علی‌رغم سطح کافی انسولین نمی‌تواند گلوکز را جذب کند. نقص در سطح ترارسانی پیام داخل‌سلولی گیرنده تیروزین کیناز رخ می‌دهد.",
                examples: ["سندرم متابولیک همراه با آکانتوزیس نیگریکانس و چاقی شکمی"],
                examTips: ["افزایش اسیدهای چرب آزاد پلاسما یکی از مهم‌ترین واسطه‌های تداخل در سیگنالینگ انسولین است"],
                structuredDetails: {
                  mechanismOfAction: "اختلال در فسفوریلاسیون تیروزین در سوبستراهای IRS-1 و مهار انتقال ترانسپورتر GLUT-4 به سطح غشا",
                  indications: ["ارزیابی پیش‌دیابت و غربالگری ریسک فاکتورهای قلبی-عروقی"],
                  clinicalPearls: ["کاهش وزن به میزان ۵ الی ۷ درصد به تنهایی حساسیت به انسولین را به شدت ارتقا می‌دهد"],
                  commonPitfalls: ["تفسیر قند خون نرمال به منزله رد مقاومت انسولین (به دلیل هایپرانسولینمی جبرانی اولیه)"],
                },
              }),
            } as any;
          }

          if (userMsg.includes("عنوان گره: «فعال‌سازی AMPK»")) {
            return {
              text: JSON.stringify({
                detailedExplanation: "پروتئین کیناز وابسته به AMP سنسور مرکزی تنظیم انرژی سلول است. در شرایط افت انرژی و افزایش نسبت AMP/ATP فعال شده و مسیرهای آنابولیک مصرف‌کننده ATP را مهار و مسیرهای کاتابولیک تولیدکننده ATP را القا می‌کند.",
                examples: ["پاسخ انطباقی هپاتوسیت‌ها به فعالیت بدنی هوازی و گرسنگی کوتاه مدت"],
                examTips: ["AMPK سبب مهار آنزیم استیل‌کوآ کربوکسیلاز (ACC) و کاهش سنتز اسید چرب می‌شود"],
                structuredDetails: {
                  mechanismOfAction: "تغییر صورت‌بندی با اتصال آلوستریک AMP و فسفوریلاسیون توسط کیناز بالادست LKB1",
                  clinicalPearls: ["هدف درمانی مشترک داروی متفورمین و ورزش منظم"],
                  commonPitfalls: ["تصور اینکه AMPK ترشح انسولین را مستقیماً از پانکراس زیاد می‌کند"],
                },
              }),
            } as any;
          }

          if (userMsg.includes("عنوان گره: «مراحل گلوکونئوژنز»")) {
            return {
              text: JSON.stringify({
                detailedExplanation: "فرایند ۴ مرحله‌ای بای‌پس مسیرهای برگشت‌ناپذیر گلیکولیز در کبد: پیرووات در میتوکندری توسط پیرووات کربوکسیلاز به اگزالواستات تبدیل می‌شود، سپس در سیتوزول با PEPCK به فسفوانول‌پیرووات بدل می‌گردد، در گام سوم فروکتوز-۱و۶-بیس‌فسفاتاز هگزوز را می‌سازد و سرانجام گلوکز-۶-فسفاتاز گلوکز آزاد ترشح می‌کند.",
                examples: ["تأمین گلوکز پایه برای مغز و گلبول‌های قرمز در دوره ناشتایی بیش از ۱۶ ساعت"],
                examTips: ["نقص گلوکز-۶-فسفاتاز منجر به بیماری فون‌ژیرکه (بیماری ذخیره گلیکوژن تیپ I) با هایپوگلایسمی شدید می‌شود"],
                structuredDetails: {
                  mechanismOfAction: "مسیر ترتیبی آنزیمی هپاتیک جهت ساخت کربوهیدرات نوترکیب از پیش‌سازهای غیرکربوهیدراتی",
                  clinicalPearls: ["استیل‌کوآ فعال‌کننده آلوستریک اجباری پیرووات کربوکسیلاز است"],
                  commonPitfalls: ["گمان اینکه بافت عضلانی می‌تواند گلوکز آزاد به خون آزاد کند (عضله فاقد آنزیم گلوکز-۶-فسفاتاز است)"],
                },
              }),
            } as any;
          }

          if (userMsg.includes("عنوان گره: «مقایسه دیابت نوع ۱ و ۲»")) {
            return {
              text: JSON.stringify({
                detailedExplanation: "تمایز بنیادی فیزیوپاتولوژیک: در نوع ۱ تخریب ایمونولوژیک بیش از ۸۰ تا ۹۰ درصد سلول‌های بتا به کمبود مطلق انسولین و آغاز ناگهانی بیماری می‌انجامد؛ در حالی که در نوع ۲ هایپرگلیسمی تدریجی ناشی از مقاومت بافتی با کاهش تدریجی ترشح انسولین سال‌ها پیش از تشخیص وجود دارد.",
                examples: ["بیمار نوجوان با لاغری، پرنوشی و کتواسیدوز در برابر فرد میانسال چاق بدون علامت حاد"],
                examTips: ["سطح پپتید C در دیابت نوع ۱ بسیار پایین یا غیرقابل اندازه‌گیری است ولی در اوایل نوع ۲ نرمال یا بالاست"],
                structuredDetails: {
                  mechanismOfAction: "ایمونولوژی خودایمن (نوع ۱) در مقایسه با لیپوتوکسیسیتی، ژنتیک پلی‌ژنیک و مقاومت انسولین (نوع ۲)",
                  clinicalPearls: ["شروع انسولین در نوع ۱ برای بقای حیات الزامی است، در نوع ۲ درمان مرحله‌ای با اصلاح سبک زندگی آغاز می‌شود"],
                  commonPitfalls: ["تشخیص اشتباه دیابت نوع ۱ به عنوان نوع ۲ در بزرگسالان مبتلا به دیابت خودایمن پنهان (LADA)"],
                },
              }),
            } as any;
          }

          if (userMsg.includes("عنوان گره: «هموگلوبین A1c»")) {
            return {
              text: JSON.stringify({
                detailedExplanation: "HbA1c محصول اتصال غیرآنزیمی گلوکز به والین انتهای آمینی زنجیره بتای هموگلوبین A0 است. به دلیل اینکه نفوذ گلوکز به داخل اریتروسیت مستقل از انسولین صورت می‌گیرد، مقدار گلیکوزیلاسیون مستقیماً بازتابنده غلظت گلوکز خون در ۱۲۰ روز گذشته است.",
                examples: ["پایش اثربخشی درمان دارویی هر ۳ الی ۶ ماه یک‌بار"],
                examTips: ["در کم‌خونی‌های همولیتیک به دلیل کاهش طول عمر گلبول‌های قرمز، مقدار HbA1c به طور کاذب پایین گزارش می‌شود"],
                structuredDetails: {
                  mechanismOfAction: "واکنش میلارد (Maillard Reaction) غیرآنزیمی و اتصال کووالانسی پایدار گلوکز به هموگلوبین",
                  clinicalPearls: ["هدف درمانی معمول در اکثر بیماران غیرباردار زیر ۷ درصد است"],
                  commonPitfalls: ["استفاده از HbA1c در بیماران دارای هموگلوبینوپاتی یا بارداری بدون در نظر گرفتن روش اندازه‌گیری"],
                },
              }),
            } as any;
          }
        }

        return { text: "{}" } as any;
      };

      // Generate the initial mind map
      const genRes = await service.generateMindMap(userA, archetypeModuleId);
      expect(genRes.success).toBe(true);
      expect(Object.keys(genRes.mind_map.payload.aiBase.nodes).length).toBe(7);

      // Verify Initial KeyPoints and ExamTips are high value and non-redundant
      const initMetformin = genRes.mind_map.payload.aiBase.nodes["node_metformin"];
      expect(initMetformin.category).toBe("drug");
      expect(initMetformin.keyPoints?.[0]).toContain("دفع منحصراً کلیوی");
      expect(initMetformin.examTips?.[0]).toContain("eGFR");

      // Verify Archetype 1: Expand Pharmacology Node (متفورمین)
      const expMetformin = await service.expandNode(userA, archetypeModuleId, "node_metformin");
      expect(expMetformin.success).toBe(true);
      expect(expMetformin.detailedExplanation).toContain("مهار کمپلکس ۱ زنجیره تنفسی");
      expect(expMetformin.structuredDetails?.drugClass).toBe("بیگوآنید (Biguanide)");
      expect(expMetformin.structuredDetails?.adverseEffects).toContain("اسیدوز لاکتیک نادر اما کشنده");
      expect(expMetformin.structuredDetails?.clinicalPearls).toBeDefined();

      // Verify Archetype 2: Expand Concept Node (مقاومت به انسولین)
      const expInsulin = await service.expandNode(userA, archetypeModuleId, "node_insulin_resistance");
      expect(expInsulin.success).toBe(true);
      expect(expInsulin.detailedExplanation).toContain("نقص در سطح ترارسانی پیام");
      expect(expInsulin.structuredDetails?.drugClass).toBeUndefined(); // Drug fields NOT hallucinated for pathology
      expect(expInsulin.structuredDetails?.mechanismOfAction).toContain("GLUT-4");

      // Verify Archetype 3: Expand Mechanism Node (فعال‌سازی AMPK)
      const expAmpk = await service.expandNode(userA, archetypeModuleId, "node_ampk_activation");
      expect(expAmpk.success).toBe(true);
      expect(expAmpk.detailedExplanation).toContain("سنسور مرکزی تنظیم انرژی");
      expect(expAmpk.structuredDetails?.commonPitfalls).toContain("تصور اینکه AMPK ترشح انسولین را مستقیماً از پانکراس زیاد می‌کند");

      // Verify Archetype 4: Expand Sequential Process Node (مراحل گلوکونئوژنز)
      const expProcess = await service.expandNode(userA, archetypeModuleId, "node_gluconeogenesis_steps");
      expect(expProcess.success).toBe(true);
      expect(expProcess.detailedExplanation).toContain("فرایند ۴ مرحله‌ای");
      expect(expProcess.structuredDetails?.commonPitfalls?.[0]).toContain("عضله فاقد آنزیم گلوکز-۶-فسفاتاز است");

      // Verify Archetype 5: Expand Comparative Node (مقایسه دیابت نوع ۱ و ۲)
      const expCompare = await service.expandNode(userA, archetypeModuleId, "node_t1d_vs_t2d");
      expect(expCompare.success).toBe(true);
      expect(expCompare.detailedExplanation).toContain("تمایز بنیادی فیزیوپاتولوژیک");
      expect(expCompare.examTips[0]).toContain("سطح پپتید C");

      // Verify Archetype 6: Expand Short Explanation Node (هموگلوبین A1c)
      const expHbA1c = await service.expandNode(userA, archetypeModuleId, "node_hba1c");
      expect(expHbA1c.success).toBe(true);
      expect(expHbA1c.detailedExplanation.length).toBeGreaterThan(100);
      expect(expHbA1c.detailedExplanation).not.toEqual(initialNodesTree.nodes.node_hba1c.shortDescription);
      expect(expHbA1c.structuredDetails?.clinicalPearls).toBeDefined();

      // Verify Caching: Second expand of node_metformin should hit cache and NOT call Gateway
      const callsBeforeCache = gatewayCallCount;
      const cachedMetformin = await service.expandNode(userA, archetypeModuleId, "node_metformin");
      expect(cachedMetformin.detailedExplanation).toBe(expMetformin.detailedExplanation);
      expect(cachedMetformin.structuredDetails).toEqual(expMetformin.structuredDetails);
      expect(gatewayCallCount).toBe(callsBeforeCache); // Zero Gateway call on cache hit!
    });
  });

  describe("18. Supplementary Educational Content Guarantee Suite", () => {
    it("unit: validates hasValidSupplementaryContent, clichés, and title/description duplicates", () => {
      // 1. Cliché detection
      expect(isClicheEducationalContent("این بخش بسیار حائز اهمیت است")).toBe(true);
      expect(isClicheEducationalContent("نکته بسیار مهم و کاربردی در آزمون")).toBe(true);
      expect(isClicheEducationalContent("از اهمیت ویژه ای برخوردار است")).toBe(true);
      expect(isClicheEducationalContent("مهار رقابتی آنزیم هیدروکسی متیل گلوتاریل کوآنزیم آ")).toBe(false);

      // 2. Duplicate detection
      const testNode: any = {
        id: "node_1",
        title: "مهارکننده ACE",
        shortDescription: "مهار آنزیم تبدیل‌کننده آنژیوتانسین در سیستم رنین-آنژیوتانسین",
      };
      expect(isDuplicateOfNodeContent("مهارکننده ACE", testNode)).toBe(true);
      expect(isDuplicateOfNodeContent("مهار آنزیم تبدیل‌کننده آنژیوتانسین در سیستم رنین-آنژیوتانسین", testNode)).toBe(true);
      expect(isDuplicateOfNodeContent("کاهش غلظت آلدوسترون و اتساع شریانچه‌های وابران کلیوی", testNode)).toBe(false);

      // 3. hasValidSupplementaryContent criteria
      const bareNode: any = {
        id: "bare",
        title: "اسپیرونولاکتون",
        shortDescription: "دیورتیک نگه‌دارنده پتاسیم",
      };
      expect(hasValidSupplementaryContent(bareNode)).toBe(false);

      const clicheNode: any = {
        ...bareNode,
        keyPoints: ["مبحثی بسیار مهم و کاربردی در آزمون‌های بالینی"],
      };
      expect(hasValidSupplementaryContent(clicheNode)).toBe(false);

      const duplicateNode: any = {
        ...bareNode,
        keyPoints: ["دیورتیک نگه‌دارنده پتاسیم"],
      };
      expect(hasValidSupplementaryContent(duplicateNode)).toBe(false);

      // Valid by keyPoints
      const validKeyPointNode: any = {
        ...bareNode,
        keyPoints: ["آنتاگونیست غیراختصاصی گیرنده آلدوسترون و آندروژن؛ ایجاد ژنیکوماستی در مردان"],
      };
      expect(hasValidSupplementaryContent(validKeyPointNode)).toBe(true);

      // Valid by examTips
      const validExamTipNode: any = {
        ...bareNode,
        examTips: ["در مقایسه با اپلرنون غیرانتخابی است؛ داروی ترجیحی در سیروز همراه با آسیت"],
      };
      expect(hasValidSupplementaryContent(validExamTipNode)).toBe(true);

      // Valid by structuredDetails
      const validStructuredNode: any = {
        ...bareNode,
        structuredDetails: {
          adverseEffects: ["هایپرکالمی و ژنیکوماستی وابسته به دوز"],
        },
      };
      expect(hasValidSupplementaryContent(validStructuredNode)).toBe(true);
    });

    it("integration: ensureAllNodesHaveSupplementaryContent enriches missing nodes and tracks unresolved ones", async () => {
      const mockDocId = "doc-supp-1" as DocumentId;
      const initialAiBase: any = {
        rootNodeId: "root",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "فارماکولوژی غدد",
            shortDescription: "داروهای مؤثر بر محور هیپوتالاموس-هیپوفیز-آدرنال",
            keyPoints: ["اصول کلی ترشح هورمون‌های استروئیدی"],
          },
          node_complete: {
            id: "node_complete",
            parentId: "root",
            title: "دگزامتازون",
            shortDescription: "گلوکوکورتیکوئید صناعی قوی و طویل‌الاثر",
            keyPoints: ["فاقد فعالیت مینرالوکورتیکوئیدی؛ داروی خط اول در ادم مغزی"],
          },
          node_missing: {
            id: "node_missing",
            parentId: "root",
            title: "فلودروکورتیزون",
            shortDescription: "مینرالوکورتیکوئید صناعی با اثر احتباس سدیم",
          },
          node_stubborn: {
            id: "node_stubborn",
            parentId: "root",
            title: "متیراپون",
            shortDescription: "مهارکننده ۱۱-بتا هیدروکسیلاز",
          },
        },
      };

      // Mock gateway responding to supplementary enrichment
      gateway.complete = async (req) => {
        const userMsg = req.messages.find((m) => m.role === "user")?.content || "";
        expect(userMsg).toContain("فلودروکورتیزون");
        expect(userMsg).toContain("متیراپون");

        return {
          text: JSON.stringify({
            nodes: {
              node_missing: {
                keyPoints: ["داروی انتخابی جایگزینی مینرالوکورتیکوئید در نارسایی اولیه آدرنال (آدیسون)"],
                examTips: ["نیاز به تنظیم دوز بر اساس فشار خون وضعیتی و پتاسیم سرم"],
              },
              node_stubborn: {
                // Returns a cliché which should be rejected
                keyPoints: ["نکته بسیار مهم و کاربردی در آزمون"],
              },
            },
          }),
        } as any;
      };

      const result = await service.ensureAllNodesHaveSupplementaryContent(
        initialAiBase,
        "متن سرفصل فارماکولوژی غدد و داروهای استروئیدی",
        "corr-supp-test",
        orgId,
        mockDocId,
      );

      // node_missing should now be enriched with valid keyPoints
      expect(result.nodes["node_missing"].keyPoints).toContain(
        "داروی انتخابی جایگزینی مینرالوکورتیکوئید در نارسایی اولیه آدرنال (آدیسون)",
      );
      expect(hasValidSupplementaryContent(result.nodes["node_missing"])).toBe(true);

      // node_stubborn failed enrichment because it only returned a cliché
      expect(result.unresolvedNodeIds).toContain("node_stubborn");
      expect(result.unresolvedNodeIds).not.toContain("node_missing");
    });

    it("end-to-end: generateMindMap ensures 100% of nodes possess valid supplementary educational content", async () => {
      const e2eModuleId = "33333333-3333-4333-8333-333333333333";
      const e2eDocId = "doc-e2e-supp" as DocumentId;

      await moduleStore.create({
        id: e2eModuleId as ModuleId,
        courseId,
        title: "فارماکولوژی دیورتیک‌ها",
        sortOrder: 3,
        documentId: e2eDocId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await chunkStore.create({
        id: "chunk-diur-1",
        documentId: e2eDocId,
        sequence: 1,
        content: "دیورتیک‌های لوپ مانند فوروزماید بر هم‌انتقال‌دهنده Na+/K+/2Cl- در بخش بالارونده ضخیم لوله لوله هنله اثر می‌گذارند. دیورتیک‌های تیازیدی بر هم‌انتقال‌دهنده Na+/Cl- توبول دیستال اثر دارند.",
        startPage: 1,
        endPage: 3,
        heading: "داروشناسی دیورتیک‌ها",
      });

      gateway.complete = async (req) => {
        if (req.promptVersion === "2.0-deep") {
          return {
            text: JSON.stringify({
              rootNodeId: "root",
              nodes: {
                root: {
                  id: "root",
                  parentId: null,
                  title: "فارماکولوژی دیورتیک‌ها",
                  shortDescription: "دسته‌بندی و فارماکودینامیک دیورتیک‌های کلیوی",
                  category: "general",
                  keyPoints: ["تقسیم‌بندی بر اساس محل اثر در نفرون از گلومرول تا مجاری جمع‌کننده"],
                },
                node_loop: {
                  id: "node_loop",
                  parentId: "root",
                  title: "دیورتیک‌های قوس هنله",
                  shortDescription: "مهارکننده هم‌انتقال‌دهنده سدیم-پتاسیم-دو کلر (NKCC2)",
                  category: "drug",
                  keyPoints: ["قوی‌ترین دیورتیک‌ها با حفظ اثر حتی در GFRهای زیر ۳۰"],
                  examTips: ["ریسک اتوتوکسیسیتی وابسته به دوز به ویژه در تجویز همزمان با آمینوگلیکوزیدها"],
                },
                node_thiazide: {
                  id: "node_thiazide",
                  parentId: "root",
                  title: "دیورتیک‌های تیازیدی",
                  shortDescription: "مهارکننده سیمپورتر Na/Cl در ابتدای توبول دیستال",
                  category: "drug",
                  keyPoints: ["کاهش دفع کلسیم ادراری و داروی انتخابی در سنگ‌های کلسیمی کلیه"],
                },
              },
            }),
          } as any;
        }

        return { text: "{}" } as any;
      };

      const genRes = await service.generateMindMap(userA, e2eModuleId);
      expect(genRes.success).toBe(true);

      const allNodes = genRes.mind_map.payload.aiBase.nodes;
      const nodeKeys = Object.keys(allNodes);
      expect(nodeKeys.length).toBeGreaterThanOrEqual(3);

      // Verify that 100% of nodes possess valid supplementary educational content
      for (const nodeId of nodeKeys) {
        const node = allNodes[nodeId];
        const hasValid = hasValidSupplementaryContent(node);
        expect(hasValid).toBe(true);
      }
    });
  });

  describe("19. Hierarchical Tree Quality & Nature-Adaptive Branching Suite", () => {
    it("Scenario 1: Drug category with 2 independent subcategories, each having multiple specific drugs without compound lumping", async () => {
      const anticancerTree: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "داروهای ضدسرطان",
            shortDescription: "فارماکولوژی داروهای سایتوتوکسیک و مهارکننده‌های میتوز",
            keyPoints: ["تفکیک بر اساس محل اثر بر چرخه سلولی و توبولین"],
          },
          node_vinca: {
            id: "node_vinca",
            parentId: "root",
            title: "آلکالوئیدهای وینکا",
            shortDescription: "داروهای مهارکننده پلیمریزاسیون توبولین و توقف میتوز در متافاز",
            nodeRole: "category",
            category: "drug",
            keyPoints: ["اتصال به بتا توبولین و مهار تشکیل دوک تقسیم سلولی"],
            examTips: ["نوروپاتی محیطی عارضه دوز-محدودکننده اصلی وینکریستین است"],
          },
          node_vincristine: {
            id: "node_vincristine",
            parentId: "node_vinca",
            title: "وینکریستین",
            shortDescription: "آلکالوئید وینکا با اثر مهار توبولین با سمیت مغز استخوان کمتر اما سمیت عصبی بیشتر",
            nodeRole: "concept",
            category: "drug",
            keyPoints: ["داروی کلیدی در رژیم‌های درمانی لوسمی لنفوبلاستیک حاد و لنفوم‌ها"],
            examTips: ["تجویز داخل نخاعی (Intrathecal) وینکریستین کشنده است و فقط وریدی تجویز می‌شود"],
          },
          node_vinblastine: {
            id: "node_vinblastine",
            parentId: "node_vinca",
            title: "وینبلاستین",
            shortDescription: "آلکالوئید وینکا با سمیت خونی شدیدتر (سرکوب مغز استخوان) در مقایسه با وینکریستین",
            nodeRole: "concept",
            category: "drug",
            keyPoints: ["کاربرد وسیع در لنفوم هاچکین و تومورهای بیضه"],
            examTips: ["برخلاف وینکریستین، سرکوب میلوسوپریشن عارضه دوز-محدودکننده اصلی آن است"],
          },
          node_taxanes: {
            id: "node_taxanes",
            parentId: "root",
            title: "تاکسان‌ها",
            shortDescription: "مهارکننده‌های دپلیمریزاسیون میکروتوبول‌ها و تثبیت ساختار دوک میتوزی",
            nodeRole: "category",
            category: "drug",
            keyPoints: ["عملکرد متضاد با وینکاها در دینامیک میکروتوبول‌ها با جلوگیری از تخریب دوک"],
          },
          node_paclitaxel: {
            id: "node_paclitaxel",
            parentId: "node_taxanes",
            title: "پاکلیتاکسل",
            shortDescription: "تاکسان طبیعی متصل‌شونده به زیرواحد بتا توبولین با القای آپوپتوز",
            nodeRole: "concept",
            category: "drug",
            keyPoints: ["کاربرد خط اول در سرطان‌های پستان، تخمدان و ریه"],
            examTips: ["پیش‌درمان با آنتی‌هیستامین و دگزامتازون جهت پیشگیری از واکنش‌های حساسیتی ناشی از حلال ضروری است"],
          },
          node_docetaxel: {
            id: "node_docetaxel",
            parentId: "node_taxanes",
            title: "دوستاکسل",
            shortDescription: "مشتق نیمه‌صناعی تاکسان با پایداری بالاتر و تمایل پیوندی قوی‌تر به توبولین",
            nodeRole: "concept",
            category: "drug",
            keyPoints: ["کاربرد اختصاصی در سرطان پروستات مقاوم به کستراسیون و سرطان پستان"],
          },
        },
      };

      const validated = validateMindMapAiBase(anticancerTree);
      expect(Object.keys(validated.nodes)).toHaveLength(7);

      // Verify hierarchical structure: Root -> Category -> Concept
      expect(validated.nodes["node_vinca"].parentId).toBe("root");
      expect(validated.nodes["node_vincristine"].parentId).toBe("node_vinca");
      expect(validated.nodes["node_vinblastine"].parentId).toBe("node_vinca");

      expect(validated.nodes["node_taxanes"].parentId).toBe("root");
      expect(validated.nodes["node_paclitaxel"].parentId).toBe("node_taxanes");
      expect(validated.nodes["node_docetaxel"].parentId).toBe("node_taxanes");

      // Verify that all nodes possess high-quality independent descriptions
      for (const [id, node] of Object.entries(validated.nodes)) {
        if (id === "root") continue;
        expect(node.shortDescription.length).toBeGreaterThanOrEqual(30);
        expect(hasValidSupplementaryContent(node)).toBe(true);
        expect(isDuplicateOfNodeContent(node.shortDescription, validated.nodes[node.parentId!])).toBe(false);
      }
    });

    it("Scenario 2: Disease category dividing into independent clinical types with distinct concepts", async () => {
      const diabetesTree: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "دیابت شیرین",
            shortDescription: "سندرم اختلال متابولیسم کربوهیدرات ناشی از نقص ترشح یا مقاومت به انسولین",
          },
          node_type1: {
            id: "node_type1",
            parentId: "root",
            title: "دیابت نوع ۱",
            shortDescription: "تخریب خودایمنی سلول‌های بتای پانکراس که به کمبود مطلق هورمون انسولین منجر می‌شود",
            nodeRole: "category",
            category: "disease",
            keyPoints: ["وابستگی دائمی و کامل به تجویز انسولین اگزوژن جهت بقا"],
          },
          node_t1_autoimmune: {
            id: "node_t1_autoimmune",
            parentId: "node_type1",
            title: "پاتوژنز اتوایمیون",
            shortDescription: "حمله لنفوسیت‌های T فعال‌شده علیه آنتی‌ژن‌های سلول بتا نظیر GAD65 و انسولین",
            nodeRole: "concept",
            category: "cellular_mechanism",
            keyPoints: ["وجود اتوآنتی‌بادی‌های سرمی سال‌ها پیش از بروز تظاهرات بالینی هیپرگلیسمی"],
          },
          node_t1_dka: {
            id: "node_t1_dka",
            parentId: "node_type1",
            title: "کتواسیدوز دیابتی (DKA)",
            shortDescription: "عوارض حاد تهدیدکننده حیات با افزایش لیپولیز، کتوژنز و اسیدوز متابولیک با آنیون گپ بالا",
            nodeRole: "concept",
            category: "disease",
            keyPoints: ["تریاد هیپرگلیسمی، کتوزیس، و اسیدوز با تنفس کاسمال و بوی استون در بازدم"],
            examTips: ["تجویز مایع‌درمانی سالین و انسولین همراه با پایش سطح پتاسیم پیش از شروع انسولین"],
          },
          node_type2: {
            id: "node_type2",
            parentId: "root",
            title: "دیابت نوع ۲",
            shortDescription: "ترکیبی از مقاومت به انسولین در بافت‌های محیطی و نقص ترشحی نسبی سلول‌های بتا",
            nodeRole: "category",
            category: "disease",
            keyPoints: ["ارتباط نزدیک با چاقی شکمی، عدم فعالیت بدنی و سندرم متابولیک"],
          },
          node_t2_insulin_res: {
            id: "node_t2_insulin_res",
            parentId: "node_type2",
            title: "مقاومت به انسولین",
            shortDescription: "کاهش پاسخ بافت‌های هدف (عضله، کبد و بافت چربی) به اثرات تحریکی انسولین در برداشت گلوکز",
            nodeRole: "concept",
            category: "cellular_mechanism",
            keyPoints: ["افزایش گلوکونئوژنز کبدی و کاهش ناقلین GLUT4 در سطح غشای میوسیت‌ها"],
          },
        },
      };

      const validated = validateMindMapAiBase(diabetesTree);
      expect(validated.nodes["node_t1_autoimmune"].parentId).toBe("node_type1");
      expect(validated.nodes["node_t1_dka"].parentId).toBe("node_type1");
      expect(validated.nodes["node_t2_insulin_res"].parentId).toBe("node_type2");

      for (const node of Object.values(validated.nodes)) {
        if (!node.parentId) continue;
        expect(hasValidSupplementaryContent(node)).toBe(true);
      }
    });

    it("Scenario 3: Metabolic pathway with distinct preparatory and payoff stages and rate-limiting enzymes", async () => {
      const glycolysisTree: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "مسیر گلیکولیز",
            shortDescription: "اکسیداسیون بیوشیمیایی ۱۰ مرحله‌ای گلوکز در سیتوزول جهت تولید ATP و پیرووات",
          },
          node_prep_phase: {
            id: "node_prep_phase",
            parentId: "root",
            title: "مرحله سرمایه‌گذاری انرژی",
            shortDescription: "پنج واکنش ابتدایی گلیکولیز شامل فسفوریلاسیون هگزوزها و مصرف ۲ مولکول ATP",
            nodeRole: "category",
            category: "biochemistry",
            keyPoints: ["تبدیل یک مولکول گلوکز به دو مولکول تریوز فسفات فعال"],
          },
          node_pfk1: {
            id: "node_pfk1",
            parentId: "node_prep_phase",
            title: "فسفوفروکتوکیناز-۱ (PFK-1)",
            shortDescription: "آنزیم متعهدکننده و کلیدی‌ترین مرحله محدودکننده سرعت در کل مسیر گلیکولیز",
            nodeRole: "concept",
            category: "biochemistry",
            keyPoints: ["تنظیم آلوستریک مثبت توسط فروکتوز ۲،۶-بیس‌فسفات و AMP، مهار توسط ATP و سیترات"],
            examTips: ["مهم‌ترین نقطه کنترل تنظیمی فلوی گلیکولیز در تمام سلول‌های پستانداران"],
          },
          node_payoff_phase: {
            id: "node_payoff_phase",
            parentId: "root",
            title: "مرحله برداشت انرژی",
            shortDescription: "پنج واکنش انتهایی اکسیداسیون گلیسرآلدئید ۳-فسفات با تولید ۴ مولکول ATP و ۲ مولکول NADH",
            nodeRole: "category",
            category: "biochemistry",
            keyPoints: ["فسفوریلاسیون در سطح سوبسترا و تولید خالص دو مولکول پیرووات"],
          },
          node_pyruvate_kinase: {
            id: "node_pyruvate_kinase",
            parentId: "node_payoff_phase",
            title: "پیرووات کیناز",
            shortDescription: "آنزیم کاتالیزکننده تبدیل فسفوانول‌پیرووات به پیرووات همراه با تولید ATP",
            nodeRole: "concept",
            category: "biochemistry",
            keyPoints: ["فعال‌سازی پیش‌خور (Feed-forward) توسط فروکتوز ۱،۶-بیس‌فسفات و مهار توسط آلانین و ATP"],
          },
        },
      };

      const validated = validateMindMapAiBase(glycolysisTree);
      expect(validated.nodes["node_pfk1"].parentId).toBe("node_prep_phase");
      expect(validated.nodes["node_pyruvate_kinase"].parentId).toBe("node_payoff_phase");
      expect(validated.nodes["node_prep_phase"].parentId).toBe("root");
    });

    it("Scenario 4: Category with only one documented concept in source is not artificially deepened", async () => {
      const singleConceptTree: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "داروهای ضد انگل",
            shortDescription: "داروهای اختصاصی نماتودها و کرم‌های لوله‌ای دستگاه گوارش",
          },
          node_benzimidazoles: {
            id: "node_benzimidazoles",
            parentId: "root",
            title: "بنزیمیدازول‌ها",
            shortDescription: "دسته دارویی ضد کرم با مهار انتخابی پلیمریزاسیون بتاتوبولین در انگل‌ها",
            nodeRole: "category",
            category: "drug",
            keyPoints: ["مهار جذب گلوکز و تخلیه ذخایر گلیکوژن در کرم‌های انگلی"],
          },
          node_mebendazole: {
            id: "node_mebendazole",
            parentId: "node_benzimidazoles",
            title: "مبندازول",
            shortDescription: "داروی انتخابی خط اول در درمان عفونت‌های انتروبیوس ورمیکولاریس و آسکاریس لومبریکوئیدس",
            nodeRole: "concept",
            category: "drug",
            keyPoints: ["جذب گوارشی بسیار ناچیز که آن را برای عفونت‌های لومن روده ایده‌آل و ایمن می‌سازد"],
            examTips: ["در سه ماهه اول بارداری به علت اثرات تراتوژنیک در مطالعات حیوانی منع مصرف دارد"],
          },
        },
      };

      const validated = validateMindMapAiBase(singleConceptTree);
      // Validated without forcing artificial sibling nodes or hallucinated drugs
      expect(Object.keys(validated.nodes)).toHaveLength(3);
      expect(validated.nodes["node_mebendazole"].parentId).toBe("node_benzimidazoles");
      expect(hasValidSupplementaryContent(validated.nodes["node_mebendazole"])).toBe(true);
    });

    it("Scenario 5: Category node with 2 children is NOT automatically excluded from expansion when source has more documented members", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: {
          id: "root",
          parentId: null,
          title: "فارماکولوژی قلب و عروق",
          shortDescription: "دسته‌های دارویی مؤثر بر دستگاه قلبی-عروقی",
        },
        node_beta: {
          id: "node_beta",
          parentId: "root",
          title: "داروهای بتابلوکر",
          shortDescription: "مهارکننده گیرنده‌های بتا آدرنرژیک",
          nodeRole: "category",
          category: "drug",
          keyPoints: ["تقسیم‌بندی به انتخابی و غیرانتخابی"],
        },
        node_propranolol: {
          id: "node_propranolol",
          parentId: "node_beta",
          title: "پروپرانولول",
          shortDescription: "مهارکننده غیرانتخابی بتا یک و بتا دو",
          nodeRole: "concept",
          category: "drug",
        },
        node_metoprolol: {
          id: "node_metoprolol",
          parentId: "node_beta",
          title: "متوپرولول",
          shortDescription: "مهارکننده انتخابی بتا یک با ایمنی قلبی",
          nodeRole: "concept",
          category: "drug",
        },
      };

      const sourceText = `
        داروهای بتابلوکر شامل پروپرانولول و متوپرولول هستند.
        علاوه بر این، کارودیلول و لابتالول به عنوان بتابلوکرهای نسل سوم با اثر همزمان مسدودکنندگی گیرنده آلفا-۱ در نارسایی قلبی و هیپرتانسیون بارداری نقش اساسی دارند.
      `;

      // node_beta already has 2 children (propranolol and metoprolol)
      const candidates = service.findCandidatesForExpansion(nodes, "root", sourceText);
      const candidateIds = candidates.map((c) => c.id);

      // Category with 2 children MUST NOT be automatically discarded; it should be eligible for expansion
      expect(candidateIds).toContain("node_beta");
    });

    it("Scenario 6: Concept node branches into dedicated dimensions (mechanism, clinical uses, adverse effects) without quality loss", async () => {
      const candidateConcept: MindMapNodeBase = {
        id: "node_fludrocortisone",
        parentId: "node_mineralocorticoids",
        title: "فلودروکورتیزون",
        shortDescription: "مینرالوکورتیکوئید صناعی پرقدرت با اثر مینرالوکورتیکوئیدی ۱۰۰ برابر کورتیزول",
        nodeRole: "concept",
        category: "drug",
        keyPoints: ["داروی انتخابی خوراکی خط اول در درمان جایگزینی نارسایی اولیه کورتکس آدرنال"],
      };

      const currentTree: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "هورمون‌های قشر آدرنال",
            shortDescription: "نقشه مفهومی استروئیدهای قشر فوق کلیه",
          },
          node_mineralocorticoids: {
            id: "node_mineralocorticoids",
            parentId: "root",
            title: "مینرالوکورتیکوئیدها",
            shortDescription: "هورمون‌های تنظیم‌کننده سدیم و پتاسیم خون",
            nodeRole: "category",
          },
          node_fludrocortisone: candidateConcept,
        },
      };

      const mockGateway: ModelGateway = {
        complete: async () => ({
          text: JSON.stringify({
            newNodes: {
              node_fludro_mechanism: {
                id: "node_fludro_mechanism",
                parentId: "node_fludrocortisone",
                title: "مکانیسم اثر سلولی",
                shortDescription: "نفوذ به سلول‌های توبول دیستال، فعال‌سازی گیرنده‌های MR، و افزایش بیان کانال‌های ENaC جهت بازجذب فعال سدیم.",
                category: "cellular_mechanism",
                keyPoints: ["افزایش شیب الکتریکی منفی لومینال که موجب تحریک دفع یون پتاسیم و هیدروژن می‌شود."],
              },
              node_fludro_uses: {
                id: "node_fludro_uses",
                parentId: "node_fludrocortisone",
                title: "کاربردهای بالینی",
                shortDescription: "درمان جایگزینی در نارسایی اولیه آدرنال (بیماری آدیسون) و کنترل افت فشار خون ارتواستاتیک شدید.",
                category: "disease",
                keyPoints: ["معمولاً همراه با هیدروکورتیزون جهت تأمین همزمان اثرات گلوکوکورتیکوئیدی تجویز می‌شود."],
              },
              node_fludro_adverse: {
                id: "node_fludro_adverse",
                parentId: "node_fludrocortisone",
                title: "عوارض جانبی و سمیت",
                shortDescription: "احتباس آب و سدیم، ادم محیطی، هیپرتانسیون و ضعف عضلانی ناشی از دفع بیش از حد پتاسیم (هیپوکالمی).",
                category: "drug",
                keyPoints: ["پایش مستمر سطح الکترولیت‌ها و فشار خون در طول درمان الزامی است."],
                examTips: ["خطر آلکالوز متابولیک هیپوکالمیک در دوزهای بیش از حد نیاز بالینی."],
              },
            },
          }),
          model: "gemini-3.5-flash-lite",
        }),
      };

      const customService = new MindMapService(
        store,
        mockGateway,
        moduleStore,
        lessonStore,
        courseStore,
        chunkStore,
        undefined,
        undefined,
        undefined,
        orgId,
      );

      const expandedNodes = await customService.expandBranchesBatched(
        userA,
        moduleId,
        null,
        orgId,
        "test-concept-branch",
        [candidateConcept],
        currentTree,
        "متن کامل مرجع مینرالوکورتیکوئیدها و فلودروکورتیزون",
      );

      expect(expandedNodes["node_fludro_mechanism"]).toBeDefined();
      expect(expandedNodes["node_fludro_mechanism"].parentId).toBe("node_fludrocortisone");
      expect(expandedNodes["node_fludro_uses"].parentId).toBe("node_fludrocortisone");
      expect(expandedNodes["node_fludro_adverse"].parentId).toBe("node_fludrocortisone");

      // Verify that the candidate node itself was NOT modified or degraded
      expect(expandedNodes["node_fludrocortisone"].shortDescription).toBe(candidateConcept.shortDescription);
      expect(expandedNodes["node_fludrocortisone"].keyPoints).toEqual(candidateConcept.keyPoints);

      // Verify each new child has rich, dedicated description and valid keyPoints
      for (const childId of ["node_fludro_mechanism", "node_fludro_uses", "node_fludro_adverse"]) {
        const child = expandedNodes[childId];
        expect(child.shortDescription.length).toBeGreaterThanOrEqual(30);
        expect(hasValidSupplementaryContent(child)).toBe(true);
        expect(isDuplicateOfNodeContent(child.shortDescription, candidateConcept)).toBe(false);
      }
    });
  });
});



