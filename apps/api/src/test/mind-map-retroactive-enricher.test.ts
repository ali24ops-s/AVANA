import { describe, it, expect, beforeEach } from "vitest";
import { MindMapService } from "../modules/study/mind-map-service.js";
import { InMemoryPersonalSummaryStore } from "../modules/study/personal-summary-store.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import type { ModelGateway } from "../generation/gateway/types.js";
import type { Actor, UserId, CourseId, OrganizationId, DocumentId } from "@avana/domain";
import { DomainError } from "@avana/domain";
import fastifyCookie from "@fastify/cookie";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { studyRoutes } from "../modules/study/study-routes.js";
import type {
  MindMapPayload,
  MindMapNodeBase,
  MindMapChemicalStructure,
} from "@avana/contracts";

describe("Retroactive Chemical Enrichment Test Suite (Phase 3)", () => {
  let store: InMemoryPersonalSummaryStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let courseStore: InMemoryCourseStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let gateway: ModelGateway;
  let service: MindMapService;

  const userA: Actor = { userId: "user-alice" as UserId, role: "student" };
  const userB: Actor = { userId: "user-bob" as UserId, role: "student" };

  const orgId = "org-1" as OrganizationId;
  const courseId = "course-1" as CourseId;
  const moduleId = "11111111-1111-4111-8111-111111111111";
  const documentId = "doc-1" as DocumentId;

  // Helper to deep snapshot non-chemical node fields
  const snapshotNonChemicalFields = (nodes: Record<string, MindMapNodeBase>) => {
    return Object.fromEntries(
      Object.entries(nodes).map(([id, n]) => [
        id,
        {
          id: n.id,
          parentId: n.parentId,
          title: n.title,
          shortDescription: n.shortDescription,
          detailedExplanation: n.detailedExplanation,
          keyPoints: n.keyPoints,
          examples: n.examples,
          examTips: n.examTips,
          sourceReferences: n.sourceReferences,
          sortOrder: n.sortOrder,
          semanticGroup: n.semanticGroup,
          category: n.category,
          nodeRole: n.nodeRole,
          structuredDetails: n.structuredDetails,
          sections: n.sections,
        },
      ]),
    );
  };

  beforeEach(async () => {
    store = new InMemoryPersonalSummaryStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    courseStore = new InMemoryCourseStore();
    chunkStore = new InMemoryDocumentChunkStore();

    courseStore = {
      findByIdForUser: async (cid: CourseId, uid: UserId) => {
        if (cid === courseId && (uid === userA.userId || uid === userB.userId)) {
          return { id: courseId, title: "شیمی دارویی جامع", organizationId: orgId } as unknown as import("@avana/contracts").CourseSummary;
        }
        return null;
      },
      findById: async (cid: CourseId) => {
        if (cid === courseId) {
          return { id: courseId, title: "شیمی دارویی جامع", organizationId: orgId } as unknown as import("@avana/contracts").CourseSummary;
        }
        return null;
      },
    } as unknown as InMemoryCourseStore;

    moduleStore = {
      findById: async (mid: string) => {
        if (mid === moduleId) {
          return {
            id: moduleId,
            courseId,
            documentId,
            title: "شیمی دارویی ۱ - ضددردها و بی‌حس‌کننده‌ها",
            sortOrder: 1,
            organizationId: orgId,
          } as unknown as import("../modules/learning/learning-store.js").ModuleRecord;
        }
        return null;
      },
    } as unknown as InMemoryModuleStore;

    chunkStore = {
      listByDocumentId: async () => [],
    } as unknown as InMemoryDocumentChunkStore;

    lessonStore = {
      listByModuleId: async () => [],
    } as unknown as InMemoryLessonStore;

    gateway = {
      generateJson: async () => ({}),
      generateText: async () => "",
    } as unknown as ModelGateway;

    const mockOrgStore = {
      listMembershipsByUserId: async (uid: UserId) =>
        uid === userA.userId ? [{ organizationId: orgId, role: "student" as const }] : [],
    } as unknown as import("../modules/organizations/organization-store.js").OrganizationStore;

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

  const createLegacyMindMapRecord = async (
    recordId: string,
    nodes: Record<string, MindMapNodeBase>,
    overrides?: Partial<MindMapPayload>,
  ) => {
    const payload: MindMapPayload = {
      kind: "mind_map",
      version: 1,
      sourceType: "lessons",
      sourceId: moduleId,
      updatedAt: "2026-10-15T12:00:00.000Z",
      aiBase: {
        rootNodeId: "root",
        generatedAt: "2026-10-15T12:00:00.000Z",
        model: "gemini-3.5-flash-lite",
        nodes,
      },
      userModifications: overrides?.userModifications ?? {
        deletedNodeIds: [],
        customNodes: {},
        overrides: {},
      },
      userNotes: overrides?.userNotes ?? {},
      ...overrides,
    };

    return store.createPending({
      id: recordId,
      userId: userA.userId,
      courseId,
      moduleId,
      contentType: "mind_map",
      version: 1,
      status: "completed",
      payload: payload as unknown as Record<string, unknown>,
      inputSnapshot: { highlights: [], notes: [], totalLength: 0 },
      highlightsCount: 0,
      notesCount: 0,
      costToman: 0,
      idempotencyKey: `legacy_${recordId}`,
    });
  };

  it("1. enriches legacy mindmap containing Aspirin node with valid 2D SMILES and metadata", async () => {
    const recordId = "mm-aspirin-legacy-1";
    await createLegacyMindMapRecord(recordId, {
      root: {
        id: "root",
        parentId: null,
        title: "داروهای ضددرد و ضدالتهاب",
        shortDescription: "طبقه‌بندی داروهای ضددرد",
      },
      node_nsaid: {
        id: "node_nsaid",
        parentId: "root",
        title: "داروهای ضدالتهاب غیراستروئیدی (NSAIDs)",
        shortDescription: "مهارکننده‌های سیکلواکسیژناز",
        nodeRole: "category",
      },
      node_aspirin: {
        id: "node_aspirin",
        parentId: "node_nsaid",
        title: "آسپرین (Aspirin)",
        shortDescription: "مهارکننده غیرقابل برگشت COX-1 و COX-2",
        category: "drug",
        keyPoints: ["استیل‌سالیسیلیک اسید", "اثر ضدپلاکتی"],
        examTips: ["سندرم ری در کودکان"],
      },
    });

    const result = await service.enrichMindMapChemicals(userA, recordId);

    expect(result.mindMapId).toBe(recordId);
    expect(result.enrichedNodes).toBe(1);
    expect(result.notRequiredNodes).toBe(2); // root + node_nsaid (category)
    expect(result.changedNodes).toBeGreaterThanOrEqual(1);

    const aspirinNode = result.mind_map.payload.aiBase.nodes["node_aspirin"];
    expect(aspirinNode.chemicalStatus).toBe("enriched");
    expect(aspirinNode.chemicalStructure).toBeDefined();
    expect(aspirinNode.chemicalStructure?.compoundName).toBe("Aspirin (Acetylsalicylic Acid)");
    expect(aspirinNode.chemicalStructure?.smiles).toBe("CC(=O)Oc1ccccc1C(=O)O");
    expect(aspirinNode.chemicalStructure?.formula).toBe("C9H8O4");
    expect(aspirinNode.chemicalStructure?.molecularWeight).toBeCloseTo(180.16, 1);
    expect(aspirinNode.chemicalStructure?.isValidated).toBe(true);
    expect(aspirinNode.chemicalStructure?.confidence).toBe("high");
  });

  it("2. enriches legacy mindmap containing Lidocaine node with valid chemical structure", async () => {
    const recordId = "mm-lidocaine-legacy-2";
    await createLegacyMindMapRecord(recordId, {
      root: {
        id: "root",
        parentId: null,
        title: "بی‌حس‌کننده‌های موضعی",
        shortDescription: "بررسی بی‌حس‌کننده‌های موضعی",
      },
      node_lidocaine: {
        id: "node_lidocaine",
        parentId: "root",
        title: "لیدوکائین (Lidocaine)",
        shortDescription: "بی‌حس‌کننده موضعی از دسته آمیدها",
        category: "drug",
        keyPoints: ["بلوک کانال‌های سدیمی ولتاژی"],
      },
    });

    const result = await service.enrichMindMapChemicals(userA, recordId);

    expect(result.enrichedNodes).toBe(1);
    const lidocaineNode = result.mind_map.payload.aiBase.nodes["node_lidocaine"];
    expect(lidocaineNode.chemicalStatus).toBe("enriched");
    expect(lidocaineNode.chemicalStructure?.compoundName).toBe("Lidocaine");
    expect(lidocaineNode.chemicalStructure?.smiles).toBe("CCN(CC)CC(=O)Nc1c(C)cccc1C");
    expect(lidocaineNode.chemicalStructure?.isValidated).toBe(true);
    expect(lidocaineNode.chemicalStructure?.confidence).toBe("high");
  });

  it("3. does NOT attach chemical structure to pharmacokinetics aspect node of Aspirin", async () => {
    const recordId = "mm-pk-aspect-3";
    await createLegacyMindMapRecord(recordId, {
      root: {
        id: "root",
        parentId: null,
        title: "آسپرین",
        shortDescription: "کلیات",
      },
      node_pk: {
        id: "node_pk",
        parentId: "root",
        title: "فارماکوکینتیک و متابولیسم آسپرین",
        shortDescription: "جذب سریع از معده و هیدرولیز به اسید سالیسیلیک",
      },
    });

    const result = await service.enrichMindMapChemicals(userA, recordId);

    const pkNode = result.mind_map.payload.aiBase.nodes["node_pk"];
    expect(pkNode.chemicalStatus).toBe("not_required");
    expect(pkNode.chemicalStructure).toBeUndefined();
  });

  it("4. does NOT attach chemical structure to general SAR concept node", async () => {
    const recordId = "mm-general-sar-4";
    await createLegacyMindMapRecord(recordId, {
      root: {
        id: "root",
        parentId: null,
        title: "شیمی دارویی",
        shortDescription: "کلیات",
      },
      node_sar: {
        id: "node_sar",
        parentId: "root",
        title: "رابطه ساختار و فعالیت (SAR) عمومی بتابلوکرها",
        shortDescription: "بررسی کلی اهمیت حلقه آروماتیک و زنجیره آلکیل",
      },
    });

    const result = await service.enrichMindMapChemicals(userA, recordId);

    const sarNode = result.mind_map.payload.aiBase.nodes["node_sar"];
    expect(sarNode.chemicalStructure).toBeUndefined();
    expect(sarNode.chemicalStatus).not.toBe("enriched");
  });

  it("5. assigns 'needs_review' and prevents hallucinating SMILES for drug outside registry", async () => {
    const recordId = "mm-unregistered-drug-5";
    await createLegacyMindMapRecord(recordId, {
      root: {
        id: "root",
        parentId: null,
        title: "داروهای آزمایشی",
        shortDescription: "فاز تحقیقاتی",
      },
      node_xyz: {
        id: "node_xyz",
        parentId: "root",
        title: "داروی آزمایشی تارگت‌نشده XYZ-999",
        shortDescription: "مولکول جدید در فاز مطالعات بالینی",
        category: "drug",
      },
    });

    const result = await service.enrichMindMapChemicals(userA, recordId);

    expect(result.needsReviewNodes).toBe(1);
    const xyzNode = result.mind_map.payload.aiBase.nodes["node_xyz"];
    expect(xyzNode.chemicalStatus).toBe("needs_review");
    expect(xyzNode.chemicalStructure).toBeUndefined();
  });

  it("6. preserves already validated existing structure without overwriting", async () => {
    const recordId = "mm-preserve-existing-6";
    const existingStructure: MindMapChemicalStructure = {
      compoundName: "آسپرین",
      smiles: "CC(=O)Oc1ccccc1C(=O)O",
      formula: "C9H8O4",
      molecularWeight: 180.16,
      isValidated: true,
      confidence: "high",
      educationalNote: "یادداشت آموزشی قبلی",
    };

    await createLegacyMindMapRecord(recordId, {
      root: {
        id: "root",
        parentId: null,
        title: "ریشه",
        shortDescription: "ریشه",
      },
      node_aspirin: {
        id: "node_aspirin",
        parentId: "root",
        title: "آسپرین (Aspirin)",
        shortDescription: "ضددرد",
        category: "drug",
        chemicalStructure: existingStructure,
        chemicalStatus: "enriched",
      },
    });

    const result = await service.enrichMindMapChemicals(userA, recordId);

    expect(result.preservedExistingNodes).toBe(1);
    expect(result.enrichedNodes).toBe(0);
    const node = result.mind_map.payload.aiBase.nodes["node_aspirin"];
    expect(node.chemicalStructure?.educationalNote).toBe("یادداشت آموزشی قبلی");
  });

  it("7. guarantees 100% preservation of all non-chemical educational content fields", async () => {
    const recordId = "mm-preserve-content-7";
    const initialNodes: Record<string, MindMapNodeBase> = {
      root: {
        id: "root",
        parentId: null,
        title: "شیمی دارویی ۱",
        shortDescription: "فصل اول",
      },
      node_morphine: {
        id: "node_morphine",
        parentId: "root",
        title: "مورفین (Morphine)",
        shortDescription: "آگونیست قوی گیرنده‌های مو اپیوئیدی",
        detailedExplanation: "مورفین پروتوتایپ ضددردهای اوپیوئیدی با ساختار پنج‌حلقه‌ای فنانترن است.",
        keyPoints: ["مهار انتقال درد در شاخ خلفی نخاع", "وابستگی شدید"],
        examTips: ["میوز و دپرسیون تنفسی از علائم مسمومیت است."],
        examples: ["قرص ام‌اس‌کانتین", "آمپول مورفین سولفات"],
        sourceReferences: [{ chunkId: "chk_morphine_1", pageNumber: 42 }],
        sortOrder: 2,
        semanticGroup: "opioids_group",
        category: "drug",
        nodeRole: "concept",
      },
    };

    const beforeSnapshot = snapshotNonChemicalFields(initialNodes);
    await createLegacyMindMapRecord(recordId, initialNodes);

    const result = await service.enrichMindMapChemicals(userA, recordId);
    const afterSnapshot = snapshotNonChemicalFields(result.mind_map.payload.aiBase.nodes);

    expect(afterSnapshot).toEqual(beforeSnapshot);
  });

  it("8. preserves user notes and manual user modifications intact", async () => {
    const recordId = "mm-preserve-user-data-8";
    const userModifications = {
      deletedNodeIds: ["old_deleted_node"],
      customNodes: {
        user_custom_1: {
          id: "user_custom_1",
          parentId: "root",
          title: "خلاصه مطالعه خودم",
          shortDescription: "یادداشت آزمون",
        },
      },
      overrides: {
        node_aspirin: {
          title: "آسپرین (عنوان ویرایش‌شده توسط دانشجو)",
        },
      },
    };
    const userNotes = {
      node_aspirin: { noteText: "این گره برای امتحان پایان‌ترم بسیار مهم است." },
    };

    await createLegacyMindMapRecord(
      recordId,
      {
        root: { id: "root", parentId: null, title: "ریشه", shortDescription: "ریشه" },
        node_aspirin: {
          id: "node_aspirin",
          parentId: "root",
          title: "آسپرین",
          shortDescription: "ضدالتهاب",
          category: "drug",
        },
      },
      { userModifications, userNotes },
    );

    const result = await service.enrichMindMapChemicals(userA, recordId);

    expect(result.mind_map.payload.userNotes).toEqual(userNotes);
    expect(result.mind_map.payload.userModifications).toEqual(userModifications);
  });

  it("9. preserves tree hierarchy, parent-child links, and sortOrder", async () => {
    const recordId = "mm-preserve-hierarchy-9";
    const initialNodes: Record<string, MindMapNodeBase> = {
      root: { id: "root", parentId: null, title: "ریشه", shortDescription: "", sortOrder: 0 },
      branch_a: { id: "branch_a", parentId: "root", title: "شاخه الف", shortDescription: "", sortOrder: 1 },
      branch_b: { id: "branch_b", parentId: "root", title: "شاخه ب", shortDescription: "", sortOrder: 2 },
      leaf_1: { id: "leaf_1", parentId: "branch_a", title: "آسپرین", shortDescription: "", sortOrder: 1, category: "drug" },
      leaf_2: { id: "leaf_2", parentId: "branch_b", title: "لیدوکائین", shortDescription: "", sortOrder: 1, category: "drug" },
    };

    await createLegacyMindMapRecord(recordId, initialNodes);
    const result = await service.enrichMindMapChemicals(userA, recordId);

    const nodes = result.mind_map.payload.aiBase.nodes;
    expect(nodes["leaf_1"].parentId).toBe("branch_a");
    expect(nodes["leaf_2"].parentId).toBe("branch_b");
    expect(nodes["branch_a"].sortOrder).toBe(1);
    expect(nodes["branch_b"].sortOrder).toBe(2);
  });

  it("10. guarantees idempotency upon repeated executions", async () => {
    const recordId = "mm-idempotency-10";
    await createLegacyMindMapRecord(recordId, {
      root: { id: "root", parentId: null, title: "ریشه", shortDescription: "" },
      node_aspirin: { id: "node_aspirin", parentId: "root", title: "آسپرین", shortDescription: "", category: "drug" },
    });

    // Pass 1: Fresh enrichment
    const pass1 = await service.enrichMindMapChemicals(userA, recordId);
    expect(pass1.enrichedNodes).toBe(1);
    expect(pass1.preservedExistingNodes).toBe(0);
    expect(pass1.changedNodes).toBe(2); // root (not_required) + aspirin (enriched)

    // Pass 2: Repeated execution
    const pass2 = await service.enrichMindMapChemicals(userA, recordId);
    expect(pass2.enrichedNodes).toBe(0);
    expect(pass2.preservedExistingNodes).toBe(1);
    expect(pass2.changedNodes).toBe(0); // Nothing changed!

    // Verify payloads between pass 1 and pass 2 are functionally identical
    expect(pass2.mind_map.payload.aiBase.nodes["node_aspirin"].chemicalStructure).toEqual(
      pass1.mind_map.payload.aiBase.nodes["node_aspirin"].chemicalStructure,
    );
  });

  it("11. node failure does not corrupt other nodes or original node content", async () => {
    const recordId = "mm-node-failure-11";
    await createLegacyMindMapRecord(recordId, {
      root: { id: "root", parentId: null, title: "ریشه", shortDescription: "" },
      node_valid: { id: "node_valid", parentId: "root", title: "آسپرین", shortDescription: "توضیح سالم", category: "drug" },
      node_corrupt: { id: "node_corrupt", parentId: "root", title: "نامعتبر", shortDescription: "توضیح دست‌نخورده", category: "drug" },
    });

    const result = await service.enrichMindMapChemicals(userA, recordId);

    // Valid node is enriched
    expect(result.mind_map.payload.aiBase.nodes["node_valid"].chemicalStatus).toBe("enriched");
    // Corrupt / unmapped node is safely marked needs_review without destroying its title or description
    const corruptNode = result.mind_map.payload.aiBase.nodes["node_corrupt"];
    expect(corruptNode.title).toBe("نامعتبر");
    expect(corruptNode.shortDescription).toBe("توضیح دست‌نخورده");
    expect(corruptNode.chemicalStatus).toBe("needs_review");
  });

  it("12. strictly prevents a user from enriching or accessing another user's mind map", async () => {
    const recordId = "mm-alice-private-12";
    await createLegacyMindMapRecord(recordId, {
      root: { id: "root", parentId: null, title: "ریشه آلیس", shortDescription: "" },
    });

    // Bob tries to enrich Alice's mindmap
    await expect(service.enrichMindMapChemicals(userB, recordId)).rejects.toThrow(
      new DomainError("forbidden", "شما به این مایندمپ دسترسی ندارید."),
    );
  });

  it("13. prevents Lost Updates using optimistic concurrency control (conflict on outdated timestamp)", async () => {
    const recordId = "mm-concurrency-13";
    const initialRecord = await createLegacyMindMapRecord(recordId, {
      root: { id: "root", parentId: null, title: "ریشه", shortDescription: "" },
      node_aspirin: { id: "node_aspirin", parentId: "root", title: "آسپرین", shortDescription: "", category: "drug" },
    });

    const staleUpdatedAt = initialRecord.updatedAt;

    // Simulate concurrent update by another process changing updatedAt
    await store.updatePayload(recordId, { dummy: true });

    // Attempting retroactive enrichment with stale client timestamp must conflict
    await expect(
      service.enrichMindMapChemicals(userA, recordId, { expectedUpdatedAt: staleUpdatedAt }),
    ).rejects.toThrow(DomainError);
  });

  it("14. entire operation failure leaves stored payload untouched", async () => {
    const recordId = "mm-fail-safe-14";
    const record = await createLegacyMindMapRecord(recordId, {
      root: { id: "root", parentId: null, title: "ریشه اولیه", shortDescription: "بدون تغییر" },
    });

    const originalPayload = { ...record.payload };

    // Pass invalid mind map ID
    await expect(service.enrichMindMapChemicals(userA, "non-existent-id")).rejects.toThrow(DomainError);

    // Verify original record payload in store remains completely unchanged
    const stored = await store.findById(recordId);
    expect(stored?.payload).toEqual(originalPayload);
  });

  describe("15. Fastify HTTP Routes for Retroactive Enrichment", () => {
    it("handles POST /v1/study/mind-maps/:id/enrich-chemicals with auth & ownership verification", async () => {
      const config = loadApiConfig();
      config.session.maxAgeMs = 86400000;
      config.logging.level = "silent";

      const sessionStore = new InMemorySessionStore();
      const orgStore = {
        listMembershipsByUserId: async (uid: UserId) =>
          uid === userA.userId ? [{ organizationId: orgId, role: "student" as const }] : [],
      } as unknown as import("../modules/organizations/organization-store.js").OrganizationStore;
      const userStore = new InMemoryUserStore(orgStore);
      const sessionService = new SessionService(sessionStore, config.session);

      const userRecord = await userStore.createUserWithPassword({
        email: "alice@avana.org",
        passwordHash: "secret",
      });
      userStore.insert({ ...userRecord, id: userA.userId });

      const session = await sessionService.createSession(userA.userId);

      const app = createApp({ config });
      await app.register(fastifyCookie);
      await app.register(studyRoutes, {
        sessionService,
        userStore,
        organizationStore: orgStore,
        flashcardStore: {} as unknown as import("../modules/study/study-store.js").FlashcardStore,
        flashcardReviewStore: {} as unknown as import("../modules/study/study-store.js").FlashcardReviewStore,
        quizStore: {} as unknown as import("../modules/study/study-store.js").QuizStore,
        quizQuestionStore: {} as unknown as import("../modules/study/study-store.js").QuizQuestionStore,
        quizAttemptStore: {} as unknown as import("../modules/study/study-store.js").QuizAttemptStore,
        moduleStore: moduleStore as unknown as import("../modules/learning/learning-store.js").ModuleStore,
        lessonStore: lessonStore as unknown as import("../modules/learning/learning-store.js").LessonStore,
        progressStore: {} as unknown as import("../modules/study/study-store.js").UserFlashcardScheduleStore,
        mindMapService: service as unknown as MindMapService,
      });

      const recordId = "mm-http-route-test-15";
      await createLegacyMindMapRecord(recordId, {
        root: { id: "root", parentId: null, title: "ریشه", shortDescription: "" },
        node_aspirin: { id: "node_aspirin", parentId: "root", title: "آسپرین (Aspirin)", shortDescription: "", category: "drug" },
      });

      // 1. Unauthenticated request -> 401 Unauthorized
      const unauthRes = await app.inject({
        method: "POST",
        url: `/v1/study/mind-maps/${recordId}/enrich-chemicals`,
      });
      expect(unauthRes.statusCode).toBe(401);

      // 2. Authenticated request -> 200 OK with full enrichment report
      const authRes = await app.inject({
        method: "POST",
        url: `/v1/study/mind-maps/${recordId}/enrich-chemicals`,
        headers: { authorization: `Bearer ${session.sessionToken}` },
        cookies: { avana_session: session.sessionToken },
      });
      expect(authRes.statusCode).toBe(200);
      const body = authRes.json();
      expect(body.mindMapId).toBe(recordId);
      expect(body.enrichedNodes).toBe(1);
      expect(body.totalNodes).toBe(2);
      expect(body.mind_map).toBeDefined();
      expect(body.mind_map.payload.aiBase.nodes["node_aspirin"].chemicalStatus).toBe("enriched");

      // 3. Module route POST /v1/study/modules/:moduleId/personal-summary/mind-map/enrich-chemicals -> 200 OK
      const moduleRouteRes = await app.inject({
        method: "POST",
        url: `/v1/study/modules/${moduleId}/personal-summary/mind-map/enrich-chemicals`,
        headers: { authorization: `Bearer ${session.sessionToken}` },
        cookies: { avana_session: session.sessionToken },
      });
      expect(moduleRouteRes.statusCode).toBe(200);
      const moduleBody = moduleRouteRes.json();
      expect(moduleBody.preservedExistingNodes).toBe(1); // Idempotent!

      // 4. Course route POST /v1/courses/:courseId/modules/:moduleId/... with matching courseId -> 200 OK
      const courseRouteRes = await app.inject({
        method: "POST",
        url: `/v1/courses/${courseId}/modules/${moduleId}/personal-summary/mind-map/enrich-chemicals`,
        headers: { authorization: `Bearer ${session.sessionToken}` },
        cookies: { avana_session: session.sessionToken },
      });
      expect(courseRouteRes.statusCode).toBe(200);

      // 5. Course route with mismatched courseId -> 400 Bad Request
      const mismatchedCourseRes = await app.inject({
        method: "POST",
        url: `/v1/courses/wrong-course-id-999/modules/${moduleId}/personal-summary/mind-map/enrich-chemicals`,
        headers: { authorization: `Bearer ${session.sessionToken}` },
        cookies: { avana_session: session.sessionToken },
      });
      expect(mismatchedCourseRes.statusCode).toBe(400);
      const mismatchedBody = mismatchedCourseRes.json();
      expect(mismatchedBody.error?.message).toContain("متعلق به این دوره نیست");

      await app.close();
    });

    it("verifies courseId parameter matching directly via service", async () => {
      const recordId = "mm-course-match-service";
      await createLegacyMindMapRecord(recordId, {
        root: { id: "root", parentId: null, title: "ریشه", shortDescription: "" },
      });

      // Mismatched courseId should be rejected with bad_request
      await expect(
        service.enrichMindMapChemicals(userA, recordId, { courseId: "wrong-course-id" }),
      ).rejects.toThrow(
        new DomainError("bad_request", "سرفصل یا ماژول انتخاب‌شده متعلق به این دوره نیست."),
      );

      // Matching courseId succeeds
      const successResult = await service.enrichMindMapChemicals(userA, recordId, { courseId });
      expect(successResult.mindMapId).toBe(recordId);
    });
  });

  describe("16. Concurrent CAS Race Condition & Lost-Update Prevention", () => {
    it("guarantees only one concurrent request succeeds while the other fails with conflict when expectedUpdatedAt is identical", async () => {
      const recordId = "mm-concurrent-race-16";
      const initialRecord = await createLegacyMindMapRecord(recordId, {
        root: { id: "root", parentId: null, title: "ریشه", shortDescription: "" },
        node_aspirin: { id: "node_aspirin", parentId: "root", title: "آسپرین (Aspirin)", shortDescription: "", category: "drug" },
      });

      // User additions / notes to verify data preservation
      await store.updatePayload(recordId, {
        ...initialRecord.payload,
        userNotes: {
          node_aspirin: { content: "یادداشت اختصاصی دانشجویی در مورد آسپرین", updatedAt: "2026-01-01T00:00:00.000Z" },
        },
        userModifications: {
          overrides: {
            node_aspirin: { title: "آسپرین خوراکی با دوز ۸۰" },
          },
          customNodes: {},
          deletedNodeIds: [],
        },
      });

      const freshRecord = (await store.findById(recordId))!;
      const sharedExpectedUpdatedAt = freshRecord.updatedAt;

      // Launch two enrichment requests simultaneously with the exact same expectedUpdatedAt
      const [res1, res2] = await Promise.allSettled([
        service.enrichMindMapChemicals(userA, recordId, { expectedUpdatedAt: sharedExpectedUpdatedAt }),
        service.enrichMindMapChemicals(userA, recordId, { expectedUpdatedAt: sharedExpectedUpdatedAt }),
      ]);

      const fulfilled = [res1, res2].filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<unknown>[];
      const rejected = [res1, res2].filter((r) => r.status === "rejected") as PromiseRejectedResult[];

      // Exactly ONE must succeed and ONE must be rejected
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // The rejected request must be DomainError with code 'conflict'
      const rejectedError = rejected[0].reason;
      expect(rejectedError).toBeInstanceOf(DomainError);
      expect((rejectedError as DomainError).code).toBe("conflict");
      expect((rejectedError as DomainError).message).toContain("این سند همزمان در نشست دیگری ویرایش شده است");

      // Verify the final stored payload in the store:
      // 1. Must be valid
      // 2. Chemical enrichment has succeeded
      // 3. User notes and modifications are completely preserved!
      const finalStored = (await store.findById(recordId))!;
      const finalPayload = finalStored.payload as unknown as MindMapPayload;

      expect(finalPayload.aiBase.nodes["node_aspirin"].chemicalStatus).toBe("enriched");
      expect(finalPayload.aiBase.nodes["node_aspirin"].chemicalStructure?.compoundName).toBe("Aspirin (Acetylsalicylic Acid)");
      expect(finalPayload.userNotes?.["node_aspirin"]?.content).toBe("یادداشت اختصاصی دانشجویی در مورد آسپرین");
      expect(finalPayload.userModifications?.overrides?.["node_aspirin"]?.title).toBe("آسپرین خوراکی با دوز ۸۰");
    });
  });
});

