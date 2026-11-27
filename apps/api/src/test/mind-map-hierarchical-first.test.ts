import { describe, it, expect, beforeEach } from "vitest";
import { MindMapService } from "../modules/study/mind-map-service.js";
import {
  extractSourceOutline,
  parseSkeletonResponse,
  flattenSkeletonToAiBaseNodes,
  analyzeSkeletonAnomalies,
  cleanDeterministicSkeletonDefects,
  buildHydrationBatches,
  selectRelevantSourceForBatch,
  type MindMapSkeletonNode,
} from "../modules/study/mind-map-hierarchy.js";
import { adaptToGeminiJsonSchema } from "../modules/generation/gateway/gemini.js";
import { InMemoryPersonalSummaryStore } from "../modules/study/personal-summary-store.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import type { CourseStore } from "../modules/courses/course-store.js";
import type { ModelGateway } from "../generation/gateway/types.js";
import type {
  Actor,
  UserId,
  CourseId,
  OrganizationId,
  ModuleId,
  LessonId,
} from "@avana/domain";
import { validateMindMapAiBase, computeEffectiveMindMap } from "@avana/domain";
import type {
  MindMapAiBase,
  MindMapNodeBase,
  MindMapNodeCategory,
  MindMapNodeRole,
  MindMapPayload,
} from "@avana/contracts";

function computeTreeMetrics(nodes: Record<string, MindMapNodeBase>, rootNodeId: string) {
  const totalNodes = Object.keys(nodes).length;
  const rootChildren = Object.values(nodes).filter((n) => n.parentId === rootNodeId);
  const categoryCount = Object.values(nodes).filter((n) => n.nodeRole === "category").length;
  const conceptCount = Object.values(nodes).filter((n) => n.nodeRole === "concept").length;

  let maxDepth = 0;
  for (const id of Object.keys(nodes)) {
    let d = 1;
    let curr = nodes[id]?.parentId;
    const seen = new Set<string>([id]);
    while (curr && !seen.has(curr)) {
      seen.add(curr);
      d++;
      curr = nodes[curr]?.parentId ?? null;
    }
    if (d > maxDepth) maxDepth = d;
  }

  return {
    totalNodes,
    firstLevelBranches: rootChildren.length,
    maxDepth,
    categoryCount,
    conceptCount,
  };
}

describe("Hierarchical-First MindMap Architecture (P0, P1, P2 & 5 Scenarios)", () => {
  describe("P0: Gateway JSON Schemas & Skeleton Flattener", () => {
    it("adaptToGeminiJsonSchema returns valid schemas for mind_map_skeleton, mind_map_hydration, and mind_map_coverage", () => {
      const skelSchema = adaptToGeminiJsonSchema({ type: "mind_map_skeleton" }) as {
        type: string;
        required: string[];
        properties: { root: { properties: { nodeRole: { enum: string[] } } } };
      };
      expect(skelSchema).toBeTruthy();
      expect(skelSchema.type).toBe("object");
      expect(skelSchema.required).toContain("root");
      expect(skelSchema.properties.root.properties.nodeRole.enum).toEqual(["category", "concept"]);

      const hydSchema = adaptToGeminiJsonSchema({ type: "mind_map_hydration" }) as {
        properties: { items: { type: string } };
      };
      expect(hydSchema).toBeTruthy();
      expect(hydSchema.properties.items.type).toBe("array");

      const covSchema = adaptToGeminiJsonSchema({ type: "mind_map_coverage" }) as {
        required: string[];
      };
      expect(covSchema).toBeTruthy();
      expect(covSchema.required).toContain("overallCoverageScore");
      expect(covSchema.required).toContain("missingConcepts");
    });

    it("flattenSkeletonToAiBaseNodes generates server-owned unique IDs and preserves hierarchy & sortOrder", () => {
      const raw = {
        root: {
          id: "root",
          title: "داروهای کورتیکواستروئیدی",
          nodeRole: "category",
          category: "general",
          children: [
            {
              id: "node_concept",
              title: "گلوکوکورتیکوئیدها",
              nodeRole: "category",
              category: "drug",
              children: [
                {
                  id: "node_concept",
                  title: "پردنیزولون",
                  nodeRole: "concept",
                  category: "drug",
                  children: [],
                },
              ],
            },
          ],
        },
      };

      const parsed = parseSkeletonResponse(raw);
      expect(parsed).not.toBeNull();
      const flattened = flattenSkeletonToAiBaseNodes(parsed!, "داروهای کورتیکواستروئیدی");

      expect(flattened.rootNodeId).toBe("root");
      const ids = Object.keys(flattened.nodes);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);

      const gluco = Object.values(flattened.nodes).find((n) => n.title === "گلوکوکورتیکوئیدها")!;
      const pred = Object.values(flattened.nodes).find((n) => n.title === "پردنیزولون")!;
      expect(gluco.parentId).toBe("root");
      expect(gluco.nodeRole).toBe("category");
      expect(pred.parentId).toBe(gluco.id);
      expect(pred.nodeRole).toBe("concept");

      const validated = validateMindMapAiBase({
        rootNodeId: flattened.rootNodeId,
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash-lite",
        nodes: flattened.nodes,
      });
      expect(Object.keys(validated.nodes)).toHaveLength(3);
    });

    it("extractSourceOutline extracts lesson and markdown headings cleanly", () => {
      const source = `--- درسنامه ۱: «مقدمه» ---\n## گلوکوکورتیکوئیدها\nمتن...\n### پردنیزولون\n--- درسنامه ۲: «مینرالوکورتیکوئیدها» ---`;
      const outline = extractSourceOutline(source);
      expect(outline).toContain("مقدمه");
      expect(outline).toContain("گلوکوکورتیکوئیدها");
      expect(outline).toContain("پردنیزولون");
      expect(outline).toContain("مینرالوکورتیکوئیدها");
    });
  });

  describe("P1: Semantic Refiner, Sanitizer Depth Preservation & Hydration Batching", () => {
    it("analyzeSkeletonAnomalies detects root spillover, misplaced dependent attributes, and empty categories without fabricating links", () => {
      const badSkeleton: MindMapSkeletonNode = {
        id: "root",
        title: "داروهای ضد صرع",
        nodeRole: "category",
        category: "general",
        children: [
          { id: "n1", title: "مکانیسم اثر", nodeRole: "concept", category: "cellular_mechanism", children: [] },
          { id: "n2", title: "عوارض جانبی", nodeRole: "concept", category: "drug", children: [] },
          { id: "n3", title: "سایر موارد", nodeRole: "category", category: "general", children: [] },
          { id: "n4", title: "فنی‌توئین", nodeRole: "concept", category: "drug", children: [] },
          { id: "n5", title: "کاربامازپین", nodeRole: "concept", category: "drug", children: [] },
          { id: "n6", title: "والپروات", nodeRole: "concept", category: "drug", children: [] },
          { id: "n7", title: "لوتیراستام", nodeRole: "concept", category: "drug", children: [] },
          { id: "n8", title: "اتوسوکسیمید", nodeRole: "concept", category: "drug", children: [] },
          { id: "n9", title: "فنوباربیتال", nodeRole: "concept", category: "drug", children: [] },
        ],
      };

      const report = analyzeSkeletonAnomalies(badSkeleton);
      expect(report.needsAiRepair).toBe(true);
      expect(report.misplacedDependentCount).toBe(2);
      expect(report.anomalies.some((a) => a.type === "root_spillover")).toBe(true);
      expect(report.anomalies.some((a) => a.type === "artificial_category")).toBe(true);
      expect(report.anomalies.some((a) => a.type === "empty_category")).toBe(true);
    });

    it("cleanDeterministicSkeletonDefects removes identical single-child wrappers and duplicate siblings only", () => {
      const skel: MindMapSkeletonNode = {
        id: "root",
        title: "آدرنال",
        nodeRole: "category",
        children: [
          {
            id: "w1",
            title: "گلوکوکورتیکوئیدها",
            nodeRole: "category",
            children: [
              {
                id: "w2",
                title: "گلوکوکورتیکوئیدها",
                nodeRole: "category",
                children: [{ id: "p", title: "پردنیزولون", nodeRole: "concept", children: [] }],
              },
            ],
          },
          { id: "dup", title: "گلوکوکورتیکوئیدها", nodeRole: "category", children: [] },
        ],
      };

      const cleaned = cleanDeterministicSkeletonDefects(skel);
      expect(cleaned.children).toHaveLength(1);
      expect(cleaned.children[0].children).toHaveLength(1);
      expect(cleaned.children[0].children[0].title).toBe("پردنیزولون");
    });

    it("sanitizeAiMindMapTree repairs excessive depth (> 8) by attaching to nearest valid ancestor instead of root", () => {
      const store = new InMemoryPersonalSummaryStore();
      const service = new MindMapService(
        store,
        { complete: async () => ({ text: "{}" }) } as unknown as ModelGateway,
        new InMemoryModuleStore(),
        new InMemoryLessonStore(),
        {} as unknown as CourseStore,
      );

      const nodes: Record<string, Record<string, unknown>> = {
        root: { id: "root", parentId: null, title: "ریشه", shortDescription: "توضیح" },
      };
      let prev = "root";
      for (let depth = 2; depth <= 10; depth++) {
        const id = `d${depth}`;
        nodes[id] = { id, parentId: prev, title: `گره ${depth}`, shortDescription: "توضیح" };
        prev = id;
      }

      const { sanitized, metrics } = service.sanitizeAiMindMapTree({ rootNodeId: "root", nodes }, "root");
      expect(metrics.depthLimitsFixed).toBeGreaterThan(0);
      expect(metrics.sanitizationWarnings?.some((w) => w.startsWith("depth_repaired:"))).toBe(true);
      const sNodes = (sanitized as { nodes: Record<string, { parentId: string | null }> }).nodes;
      expect(sNodes.d9.parentId).not.toBe("root");
      expect(sNodes.d10.parentId).not.toBe("root");
      const validated = validateMindMapAiBase(sanitized);
      expect(Object.keys(validated.nodes)).toHaveLength(10);
    });

    it("partitions large trees coherently into hydration batches with ancestorPath and siblingTitles", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: {
          id: "root",
          parentId: null,
          title: "ریشه",
          nodeRole: "category",
          sortOrder: 0,
          shortDescription: "",
        },
      };
      for (let b = 0; b < 3; b++) {
        const catId = `cat_${b}`;
        nodes[catId] = {
          id: catId,
          parentId: "root",
          title: `دسته ${b}`,
          nodeRole: "category",
          sortOrder: b,
          shortDescription: "",
        };
        for (let c = 0; c < 14; c++) {
          const cid = `c_${b}_${c}`;
          nodes[cid] = {
            id: cid,
            parentId: catId,
            title: `مفهوم ${b}-${c}`,
            nodeRole: "concept",
            sortOrder: c,
            shortDescription: "",
          };
        }
      }

      const batches = buildHydrationBatches(nodes, "root", 20);
      expect(batches.length).toBeGreaterThanOrEqual(2);
      const totalHydratedIds = batches.flatMap((b) => b.nodes.map((n) => n.id));
      expect(new Set(totalHydratedIds).size).toBe(Object.keys(nodes).length);

      const sampleLeaf = batches.flatMap((b) => b.nodes).find((n) => n.id === "c_1_0")!;
      expect(sampleLeaf.ancestorPath).toEqual(["ریشه", "دسته 1", "مفهوم 1-0"]);
      expect(sampleLeaf.siblingTitles.length).toBeGreaterThan(0);
    });

    it("P0: hydrateSkeletonNodes preserves successful batches, retries only failed/incomplete nodes, and throws on persistent failure", async () => {
      const store = new InMemoryPersonalSummaryStore();
      const baseNodes: Record<string, MindMapNodeBase> = {
        root: { id: "root", parentId: null, title: "ریشه", shortDescription: "نقشه مفهومی جامع ریشه", nodeRole: "category", sortOrder: 0 },
      };
      // Create 2 batches (>35 nodes)
      for (let b = 0; b < 2; b++) {
        const catId = `cat_${b}`;
        baseNodes[catId] = { id: catId, parentId: "root", title: `دسته ${b}`, shortDescription: "", nodeRole: "category", sortOrder: b };
        for (let c = 0; c < 20; c++) {
          const cid = `n_${b}_${c}`;
          baseNodes[cid] = { id: cid, parentId: catId, title: `مفهوم ${b}-${c}`, shortDescription: "", nodeRole: "concept", sortOrder: c };
        }
      }

      // Case 1: Batch 1 fails once, retry succeeds, Batch 0 preserved
      let batch1Attempts = 0;
      const retrySuccessGateway: ModelGateway = {
        complete: async (req) => {
          const userMsg = req.messages.find((m) => m.role === "user")?.content ?? "";
          if (req.promptVersion === "2.0-hydration" && userMsg.includes("دسته 1") && batch1Attempts === 0) {
            batch1Attempts++;
            throw new Error("Transient 503 error on batch 1");
          }
          const idMatches = Array.from(userMsg.matchAll(/"id":\s*"([^"]+)"/g)).map((m) => m[1]);
          return {
            text: JSON.stringify({
              items: idMatches.map((id) => ({
                id,
                shortDescription: `توضیح علمی کامل و مستند برای ${id} بر اساس متن منبع.`,
                keyPoints: [`نکته کلیدی اختصاصی ${id}`],
              })),
            }),
            model: "gemini-3.5-flash-lite",
            provider: "gemini",
          };
        },
      };

      const svcSuccess = new MindMapService(
        store,
        retrySuccessGateway,
        new InMemoryModuleStore(),
        new InMemoryLessonStore(),
        {} as unknown as CourseStore,
      );
      const hydrated = await svcSuccess.hydrateSkeletonNodes(
        { rootNodeId: "root", nodes: baseNodes },
        "متن منبع آموزشی",
        "cid_retry_ok",
        "org-1" as OrganizationId,
        null,
      );
      expect(batch1Attempts).toBe(1);
      expect(Object.values(hydrated).every((n) => n.shortDescription.length >= 8)).toBe(true);

      // Case 2: Persistent failure on retry throws traceable DomainError
      const retryFailGateway: ModelGateway = {
        complete: async (req) => {
          const userMsg = req.messages.find((m) => m.role === "user")?.content ?? "";
          if (req.promptVersion === "2.0-hydration-retry" || userMsg.includes("دسته 1")) {
            throw new Error("Persistent Gemini outage");
          }
          const idMatches = Array.from(userMsg.matchAll(/"id":\s*"([^"]+)"/g)).map((m) => m[1]);
          return {
            text: JSON.stringify({
              items: idMatches.map((id) => ({
                id,
                shortDescription: `توضیح علمی کامل برای ${id}.`,
                keyPoints: [`نکته ${id}`],
              })),
            }),
            model: "gemini-3.5-flash-lite",
            provider: "gemini",
          };
        },
      };

      const svcFail = new MindMapService(
        store,
        retryFailGateway,
        new InMemoryModuleStore(),
        new InMemoryLessonStore(),
        {} as unknown as CourseStore,
      );
      await expect(
        svcFail.hydrateSkeletonNodes(
          { rootNodeId: "root", nodes: baseNodes },
          "متن منبع آموزشی",
          "cid_retry_fail",
          "org-1" as OrganizationId,
          null,
        ),
      ).rejects.toThrow(/تکمیل محتوای علمی/);
    });

    it("P1: selectRelevantSourceForBatch preserves important concepts located at the very end of a >30,000 char source", () => {
      const filler = "متن عمومی مقدماتی درباره مباحث پایه فارماکولوژی و کلیات سلولی. ".repeat(600); // > 35,000 chars
      const endSection = "\n--- درسنامه ۹: «زولپیدم» ---\nزولپیدم آگونیست انتخابی زیرواحد آلفا-۱ گیرنده GABAA در درمان بی‌خوابی کوتاه‌مدت است.";
      const longSource = filler + endSection;
      expect(longSource.length).toBeGreaterThan(30_000);

      const selected = selectRelevantSourceForBatch(
        longSource,
        [{ title: "زولپیدم", ancestorPath: ["داروهای خواب‌آور", "زولپیدم"] }],
        "- کلیات\n- زولپیدم",
        10_000,
      );
      expect(selected).toContain("زولپیدم");
      expect(selected).toContain("آلفا-۱");
      expect(selected.length).toBeLessThanOrEqual(10_500);
    });

    it("P2 & P3: validateSourceCoverage processes ungroundedNodeIds conservatively and never inserts empty category nodes", async () => {
      const gateway: ModelGateway = {
        complete: async (req) => {
          if (req.promptVersion === "2.0-coverage") {
            return {
              text: JSON.stringify({
                overallCoverageScore: 88,
                ungroundedNodeIds: ["node_drug_a", "unknown_nonexistent_id"],
                missingConcepts: [
                  {
                    title: "داروهای متفرقه بی‌فرزند",
                    suggestedParentId: "root",
                    nodeRole: "category",
                    category: "drug",
                    shortDescription: "دسته بدون فرزند که نباید وارد شود",
                  },
                  {
                    title: "داروی جدید ب",
                    suggestedParentId: "root",
                    nodeRole: "concept",
                    category: "drug",
                    shortDescription: "داروی مستند موجود در منبع",
                  },
                ],
              }),
              model: "gemini-3.5-flash-lite",
              provider: "gemini",
            };
          }
          return {
            text: JSON.stringify({
              items: [
                {
                  id: "node_drug_a",
                  shortDescription: "توضیح بازسازی‌شده مستند از متن منبع برای داروی الف.",
                  keyPoints: ["نکته مستند"],
                },
              ],
            }),
            model: "gemini-3.5-flash-lite",
            provider: "gemini",
          };
        },
      };

      const svc = new MindMapService(
        new InMemoryPersonalSummaryStore(),
        gateway,
        new InMemoryModuleStore(),
        new InMemoryLessonStore(),
        {} as unknown as CourseStore,
      );

      const result = await svc.validateSourceCoverage(
        {
          rootNodeId: "root",
          generatedAt: new Date().toISOString(),
          model: "gemini-3.5-flash-lite",
          nodes: {
            root: { id: "root", parentId: null, title: "ریشه", shortDescription: "توضیح", nodeRole: "category" },
            node_drug_a: { id: "node_drug_a", parentId: "root", title: "داروی الف", shortDescription: "ادعای مشکوک", nodeRole: "concept" },
          },
        },
        "داروی الف و داروی جدید ب در منبع توضیح داده شده‌اند.",
        "cid_cov",
        "org-1" as OrganizationId,
        null,
      );

      expect(result.ungroundedCount).toBe(1);
      expect(result.ungroundedWarnings).toContain("unknown_ungrounded_id:unknown_nonexistent_id");
      expect(result.ungroundedWarnings).toContain("regrounded_node:node_drug_a");
      expect(result.nodes["node_drug_a"].shortDescription).toContain("بازسازی‌شده");
      expect(result.suggestedCategories).toContain("داروهای متفرقه بی‌فرزند");
      // Empty category must NOT be inserted, while valid concept IS inserted
      expect(Object.values(result.nodes).some((n) => n.title === "داروهای متفرقه بی‌فرزند")).toBe(false);
      expect(Object.values(result.nodes).some((n) => n.title === "داروی جدید ب")).toBe(true);
    });

    it("P4: flattenSkeletonToAiBaseNodes tracks >120 node truncation explicitly in metrics without silent loss", () => {
      const children: MindMapSkeletonNode[] = [];
      for (let i = 0; i < 130; i++) {
        children.push({
          id: `node_item_${i}`,
          title: `مفهوم ${i}`,
          nodeRole: "concept",
          category: "general",
          children: [],
        });
      }
      const bigSkeleton: MindMapSkeletonNode = {
        id: "root",
        title: "مبحث بزرگ",
        nodeRole: "category",
        category: "general",
        children,
      };

      const flattened = flattenSkeletonToAiBaseNodes(bigSkeleton, "مبحث بزرگ");
      expect(flattened.metrics.inputNodeCount).toBe(131);
      expect(flattened.metrics.acceptedNodeCount).toBe(120);
      expect(flattened.metrics.droppedNodeCount).toBe(11);
      expect(flattened.metrics.warnings.some((w) => w.startsWith("node_budget_exceeded:"))).toBe(true);
    });
  });

  describe("P2: Reconciliation Preserves User Notes & Overrides Across Re-parenting", () => {
    it("reconcileMindMap preserves userNote and override when a node moves from root under a newly created category", () => {
      const service = new MindMapService(
        new InMemoryPersonalSummaryStore(),
        { complete: async () => ({ text: "{}" }) } as unknown as ModelGateway,
        new InMemoryModuleStore(),
        new InMemoryLessonStore(),
        {} as unknown as CourseStore,
      );

      const previousPayload: MindMapPayload = {
        kind: "mind_map",
        version: 1,
        sourceType: "lessons",
        sourceId: "mod-1",
        updatedAt: new Date().toISOString(),
        aiBase: {
          rootNodeId: "root",
          generatedAt: new Date().toISOString(),
          model: "gemini-3.5-flash-lite",
          nodes: {
            root: {
              id: "root",
              parentId: null,
              title: "کورتیکواستروئیدها",
              shortDescription: "...",
            },
            old_pred: {
              id: "old_pred",
              parentId: "root",
              title: "پردنیزولون",
              shortDescription: "توضیح قبلی",
              nodeRole: "concept",
              category: "drug",
            },
          },
        },
        userModifications: {
          deletedNodeIds: [],
          customNodes: {},
          overrides: {
            old_pred: { shortDescription: "یادداشت ویرایش‌شده کاربر" },
          },
        },
        userNotes: {
          old_pred: {
            noteText: "نکته مهم امتحانی من درباره پردنیزولون",
            updatedAt: new Date().toISOString(),
          },
        },
      };

      const newAiBase: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "کورتیکواستروئیدها",
            shortDescription: "...",
            nodeRole: "category",
          },
          node_gluco: {
            id: "node_gluco",
            parentId: "root",
            title: "گلوکوکورتیکوئیدها",
            shortDescription: "رده دارویی",
            nodeRole: "category",
            category: "drug",
          },
          node_prednisolone_new: {
            id: "node_prednisolone_new",
            parentId: "node_gluco",
            title: "پردنیزولون",
            shortDescription: "توضیح جدید",
            nodeRole: "concept",
            category: "drug",
          },
        },
      };

      const reconciled = service.reconcileMindMap(newAiBase, previousPayload);
      expect(reconciled.userNotes["node_prednisolone_new"]?.noteText).toBe(
        "نکته مهم امتحانی من درباره پردنیزولون",
      );
      expect(reconciled.userModifications.overrides["node_prednisolone_new"]?.shortDescription).toBe(
        "یادداشت ویرایش‌شده کاربر",
      );
      expect(Object.keys(reconciled.userModifications.customNodes)).toHaveLength(0);

      const effective = computeEffectiveMindMap(reconciled);
      expect(effective.nodes["node_prednisolone_new"].parentId).toBe("node_gluco");
      expect(effective.nodes["node_prednisolone_new"].userNote).toBe(
        "نکته مهم امتحانی من درباره پردنیزولون",
      );
    });
  });

  describe("5 Educational Scenarios: End-to-End Hierarchical-First Pipeline Verification", () => {
    let store: InMemoryPersonalSummaryStore;
    let moduleStore: InMemoryModuleStore;
    let lessonStore: InMemoryLessonStore;
    let courseStore: CourseStore;
    let chunkStore: InMemoryDocumentChunkStore;

    const userA: Actor = { userId: "user-a" as UserId, role: "student" };
    const orgId = "org-1" as OrganizationId;
    const courseId = "course-1" as CourseId;

    beforeEach(() => {
      store = new InMemoryPersonalSummaryStore();
      moduleStore = new InMemoryModuleStore();
      lessonStore = new InMemoryLessonStore();
      chunkStore = new InMemoryDocumentChunkStore();
      courseStore = {
        findByIdForUser: async (cid: CourseId, uid: UserId) =>
          cid === courseId && uid === userA.userId
            ? {
                id: courseId,
                organizationId: orgId,
                name: "دوره تست",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : null,
        findById: async () => null,
      } as unknown as CourseStore;
    });

    async function runScenario(params: {
      scenarioName: string;
      moduleTitle: string;
      lessonContent: string;
      skeletonResponse: unknown;
      hydrationItems: Array<{
        id: string;
        titleHint: string;
        shortDescription: string;
        keyPoints: string[];
        examTips?: string[];
      }>;
      coverageMissing?: Array<{
        title: string;
        suggestedParentId: string;
        nodeRole: MindMapNodeRole;
        category?: MindMapNodeCategory;
        shortDescription: string;
        keyPoints?: string[];
      }>;
    }) {
      const modId = `mod-${Math.random().toString(36).slice(2, 10)}` as ModuleId;
      await moduleStore.create({
        id: modId,
        courseId,
        title: params.moduleTitle,
        sortOrder: 1,
        documentId: null,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Parameters<InMemoryModuleStore["create"]>[0]);

      await lessonStore.create({
        id: `lesson-${modId}` as LessonId,
        moduleId: modId,
        title: params.moduleTitle,
        contentMarkdown: params.lessonContent,
        publicationStatus: "published",
        sortOrder: 1,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Parameters<InMemoryLessonStore["create"]>[0]);

      const gateway: ModelGateway = {
        complete: async (req) => {
          const schemaType = (req.jsonSchema as { type?: string } | undefined)?.type;
          if (schemaType === "mind_map_skeleton") {
            return {
              text: JSON.stringify(params.skeletonResponse),
              model: "gemini-3.5-flash-lite",
              provider: "gemini",
            };
          }
          if (schemaType === "mind_map_hydration") {
            const userMsg = req.messages.find((m) => m.role === "user")?.content ?? "";
            const items: Array<Record<string, unknown>> = [];
            const allNodeMatches = Array.from(
              userMsg.matchAll(/"id":\s*"([^"]+)"[^}]*"title":\s*"([^"]+)"/gs),
            );
            for (const m of allNodeMatches) {
              const id = m[1];
              const title = m[2];
              const override = params.hydrationItems.find((h) => title.includes(h.titleHint));
              items.push({
                id,
                shortDescription:
                  override?.shortDescription ??
                  `توضیح علمی مستند برای «${title}» بر اساس محتوای آموزشی سرفصل ${params.moduleTitle}.`,
                keyPoints: override?.keyPoints ?? [`نکته کلیدی مرتبط با ${title}`],
                examTips: override?.examTips ?? [],
              });
            }
            return {
              text: JSON.stringify({ items }),
              model: "gemini-3.5-flash-lite",
              provider: "gemini",
            };
          }
          if (schemaType === "mind_map_coverage") {
            return {
              text: JSON.stringify({
                overallCoverageScore: 96,
                missingConcepts: params.coverageMissing ?? [],
              }),
              model: "gemini-3.5-flash-lite",
              provider: "gemini",
            };
          }
          return {
            text: JSON.stringify({ supplementary: {} }),
            model: "gemini-3.5-flash-lite",
            provider: "gemini",
          };
        },
      };

      const service = new MindMapService(
        store,
        gateway,
        moduleStore,
        lessonStore,
        courseStore,
        chunkStore,
        undefined,
        undefined,
        undefined,
        orgId,
      );
      const res = await service.generateMindMap(userA, modId, `cid_${modId}`, courseId);
      const aiBase = res.mind_map.payload.aiBase;
      const metrics = computeTreeMetrics(aiBase.nodes, aiBase.rootNodeId);
      return { aiBase, metrics };
    }

    it("Scenario 1: Comprehensive Pharmacology (Corticosteroids) builds deep multi-family hierarchy", async () => {
      const { aiBase, metrics } = await runScenario({
        scenarioName: "Pharmacology",
        moduleTitle: "داروهای کورتیکواستروئیدی",
        lessonContent:
          "کورتیکواستروئیدها به دو دسته گلوکوکورتیکوئیدها (پردنیزولون، دگزامتازون) و مینرالوکورتیکوئیدها (فلودروکورتیزون) تقسیم می‌شوند. مکانیسم اثر، موارد مصرف و عوارض جانبی هر یک بررسی می‌شود.",
        skeletonResponse: {
          root: {
            id: "root",
            title: "داروهای کورتیکواستروئیدی",
            nodeRole: "category",
            category: "general",
            children: [
              {
                id: "node_gluco",
                title: "گلوکوکورتیکوئیدها",
                nodeRole: "category",
                category: "drug",
                children: [
                  {
                    id: "node_pred",
                    title: "پردنیزولون",
                    nodeRole: "concept",
                    category: "drug",
                    children: [
                      { id: "n1", title: "مکانیسم اثر", nodeRole: "concept", category: "cellular_mechanism", children: [] },
                      { id: "n2", title: "موارد مصرف", nodeRole: "concept", category: "disease", children: [] },
                      { id: "n3", title: "عوارض جانبی", nodeRole: "concept", category: "drug", children: [] },
                    ],
                  },
                  {
                    id: "node_dexa",
                    title: "دگزامتازون",
                    nodeRole: "concept",
                    category: "drug",
                    children: [
                      { id: "n4", title: "مکانیسم اثر دگزامتازون", nodeRole: "concept", category: "cellular_mechanism", children: [] },
                      { id: "n5", title: "کاربرد در ادم مغزی", nodeRole: "concept", category: "disease", children: [] },
                    ],
                  },
                ],
              },
              {
                id: "node_mineralo",
                title: "مینرالوکورتیکوئیدها",
                nodeRole: "category",
                category: "drug",
                children: [
                  {
                    id: "node_fludro",
                    title: "فلودروکورتیزون",
                    nodeRole: "concept",
                    category: "drug",
                    children: [
                      { id: "n6", title: "بازجذب سدیم و دفع پتاسیم", nodeRole: "concept", category: "cellular_mechanism", children: [] },
                      { id: "n7", title: "درمان بیماری آدیسون", nodeRole: "concept", category: "disease", children: [] },
                    ],
                  },
                ],
              },
            ],
          },
        },
        hydrationItems: [
          {
            id: "root",
            titleHint: "داروهای کورتیکواستروئیدی",
            shortDescription: "هورمون‌های استروئیدی قشر آدرنال و آنالوگ‌های صناعی با اثرات متابولیک، ضدالتهابی و تنظیم‌کننده آب و الکترولیت.",
            keyPoints: ["تقسیم به دو خانواده گلوکوکورتیکوئید و مینرالوکورتیکوئید"],
          },
          {
            id: "node_gluco",
            titleHint: "گلوکوکورتیکوئیدها",
            shortDescription: "داروهای ضدالتهاب و سرکوب‌کننده ایمنی مؤثر بر متابولیسم کربوهیدرات و پروتئین از طریق گیرنده‌های سیتوپلاسمی GR.",
            keyPoints: ["مهار فسفولیپاز A2 و کاهش سنتز پروستاگلاندین‌ها و لکوترین‌ها"],
          },
          {
            id: "node_pred",
            titleHint: "پردنیزولون",
            shortDescription: "گلوکوکورتیکوئید خوراکی با نیمه‌عمر متوسط و فعالیت ضدالتهابی ۴ برابر کورتیزول.",
            keyPoints: ["متابولیت فعال پردنیزون در کبد"],
          },
          {
            id: "node_dexa",
            titleHint: "دگزامتازون",
            shortDescription: "گلوکوکورتیکوئید طولانی‌اثر با قدرت ضدالتهابی بالا و فاقد اثر مینرالوکورتیکوئیدی.",
            keyPoints: ["انتخاب اول در ادم مغزی و تست سرکوب محور HPA"],
          },
          {
            id: "node_fludro",
            titleHint: "فلودروکورتیزون",
            shortDescription: "مینرالوکورتیکوئید صناعی پرقدرت با میل بالا به گیرنده MR در توبول دیستال کلیه.",
            keyPoints: ["خط اول درمان جایگزینی نارسایی اولیه آدرنال"],
          },
        ],
      });

      expect(metrics.totalNodes).toBe(13);
      expect(metrics.firstLevelBranches).toBe(2);
      expect(metrics.maxDepth).toBe(4);
      expect(metrics.categoryCount).toBe(3);
      expect(metrics.conceptCount).toBe(10);
      expect(
        Object.values(aiBase.nodes).some(
          (n) => n.title === "پردنیزولون" && n.shortDescription.includes("کورتیزول"),
        ),
      ).toBe(true);
    });

    it("Scenario 2: Single Specific Drug (Metformin) organizes attributes directly under root drug", async () => {
      const { metrics } = await runScenario({
        scenarioName: "Single Drug",
        moduleTitle: "متفورمین",
        lessonContent:
          "متفورمین داروی خط اول دیابت نوع ۲ از دسته بیگوانیدها است. با فعال‌سازی AMPK گلوکونئوژنز کبدی را مهار می‌کند. عارضه نادر ولی خطرناک آن اسیدوز لاکتیک است.",
        skeletonResponse: {
          root: {
            id: "root",
            title: "متفورمین",
            nodeRole: "category",
            category: "drug",
            children: [
              {
                id: "m1",
                title: "مکانیسم اثر سلولی",
                nodeRole: "concept",
                category: "cellular_mechanism",
                children: [
                  { id: "m1a", title: "فعال‌سازی AMPK و مهار گلوکونئوژنز", nodeRole: "concept", category: "biochemistry", children: [] },
                ],
              },
              {
                id: "m2",
                title: "کاربردهای بالینی",
                nodeRole: "concept",
                category: "disease",
                children: [
                  { id: "m2a", title: "خط اول دیابت نوع ۲", nodeRole: "concept", category: "disease", children: [] },
                ],
              },
              {
                id: "m3",
                title: "عوارض و منع مصرف",
                nodeRole: "category",
                category: "drug",
                children: [
                  { id: "m3a", title: "اسیدوز لاکتیک", nodeRole: "concept", category: "disease", children: [] },
                  { id: "m3b", title: "نارسایی کلیوی (eGFR < 30)", nodeRole: "concept", category: "disease", children: [] },
                ],
              },
            ],
          },
        },
        hydrationItems: [
          {
            id: "root",
            titleHint: "متفورمین",
            shortDescription: "داروی خوراکی کاهنده قند خون از رده بیگوانیدها بدون ایجاد هیپوگلیسمی.",
            keyPoints: ["کاهش هموگلوبین A1c و بهبود حساسیت به انسولین"],
          },
        ],
      });

      expect(metrics.firstLevelBranches).toBe(3);
      expect(metrics.maxDepth).toBe(3);
      expect(metrics.totalNodes).toBe(8);
    });

    it("Scenario 3: Physiology with Cause-Effect (RAAS) preserves sequential causal chain", async () => {
      const { metrics } = await runScenario({
        scenarioName: "Physiology",
        moduleTitle: "سیستم رنین-آنژیوتانسین-آلدوسترون (RAAS)",
        lessonContent:
          "کاهش فشار خون کلیوی باعث ترشح رنین از سلول‌های جوکستاگلومرولار می‌شود. رنین آنژیوتانسینوژن را به آنژیوتانسین I تبدیل کرده و ACE آن را به آنژیوتانسین II تبدیل می‌کند.",
        skeletonResponse: {
          root: {
            id: "root",
            title: "سیستم رنین-آنژیوتانسین-آلدوسترون",
            nodeRole: "category",
            category: "biochemistry",
            children: [
              {
                id: "r1",
                title: "محرک‌های ترشح رنین",
                nodeRole: "category",
                category: "cellular_mechanism",
                children: [
                  { id: "r1a", title: "کاهش پرفیوژن کلیوی", nodeRole: "concept", category: "cellular_mechanism", children: [] },
                  { id: "r1b", title: "تحریک بتا-۱ آدرنرژیک", nodeRole: "concept", category: "cellular_mechanism", children: [] },
                ],
              },
              {
                id: "r2",
                title: "آبشار آنزیمی",
                nodeRole: "category",
                category: "biochemistry",
                children: [
                  { id: "r2a", title: "تبدیل به آنژیوتانسین I توسط رنین", nodeRole: "concept", category: "biochemistry", children: [] },
                  { id: "r2b", title: "تبدیل به آنژیوتانسین II توسط ACE", nodeRole: "concept", category: "biochemistry", children: [] },
                ],
              },
              {
                id: "r3",
                title: "اثرات فیزیولوژیک نهایی",
                nodeRole: "category",
                category: "cellular_mechanism",
                children: [
                  { id: "r3a", title: "انقباض عروقی شریول‌ها", nodeRole: "concept", category: "cellular_mechanism", children: [] },
                  { id: "r3b", title: "ترشح آلدوسترون و بازجذب سدیم", nodeRole: "concept", category: "cellular_mechanism", children: [] },
                ],
              },
            ],
          },
        },
        hydrationItems: [
          {
            id: "r2b",
            titleHint: "تبدیل به آنژیوتانسین II",
            shortDescription: "آنزیم مبدل آنژیوتانسین (ACE) در عروق ریوی آنژیوتانسین I را به پپتید فعال آنژیوتانسین II تبدیل می‌کند.",
            keyPoints: ["ACE همزمان برادی‌کینین را نیز غیرفعال می‌سازد"],
          },
        ],
      });

      expect(metrics.firstLevelBranches).toBe(3);
      expect(metrics.maxDepth).toBe(3);
      expect(metrics.categoryCount).toBe(4);
    });

    it("Scenario 4: Pathology (Anemias) classifies diseases under morphological categories", async () => {
      const { metrics } = await runScenario({
        scenarioName: "Pathology",
        moduleTitle: "طبقه‌بندی کم‌خونی‌ها",
        lessonContent:
          "کم‌خونی‌ها بر اساس MCV به میکروسیتیک (فقر آهن، تالاسمی)، نورموسیتیک و ماکروسیتیک (مگالوبلاستیک ناشی از کمبود B12 و فولات) تقسیم می‌شوند.",
        skeletonResponse: {
          root: {
            id: "root",
            title: "طبقه‌بندی کم‌خونی‌ها",
            nodeRole: "category",
            category: "disease",
            children: [
              {
                id: "a1",
                title: "کم‌خونی‌های میکروسیتیک",
                nodeRole: "category",
                category: "disease",
                children: [
                  { id: "a1a", title: "کم‌خونی فقر آهن", nodeRole: "concept", category: "disease", children: [] },
                  { id: "a1b", title: "تالاسمی‌ها", nodeRole: "concept", category: "disease", children: [] },
                ],
              },
              {
                id: "a2",
                title: "کم‌خونی‌های ماکروسیتیک",
                nodeRole: "category",
                category: "disease",
                children: [
                  { id: "a2a", title: "کمبود ویتامین B12", nodeRole: "concept", category: "disease", children: [] },
                  { id: "a2b", title: "کمبود اسید فولیک", nodeRole: "concept", category: "disease", children: [] },
                ],
              },
            ],
          },
        },
        hydrationItems: [],
        coverageMissing: [
          {
            title: "کم‌خونی‌های نورموسیتیک",
            suggestedParentId: "root",
            nodeRole: "category",
            category: "disease",
            shortDescription: "کم‌خونی با MCV طبیعی (۸۰ تا ۱۰۰ فمتولیتر) شامل کم‌خونی بیماری‌های مزمن و همولیتیک.",
            keyPoints: ["شمارش رتیکولوسیت‌ها در افتراق علت مغز استخوانی از تخریب محیطی کلیدی است."],
          },
        ],
      });

      expect(metrics.firstLevelBranches).toBe(3);
      expect(metrics.totalNodes).toBe(8);
      expect(metrics.maxDepth).toBe(3);
    });

    it("Scenario 5: Small Linear Topic stays compact without artificial categories", async () => {
      const { metrics } = await runScenario({
        scenarioName: "Linear Small Topic",
        moduleTitle: "جذب خوراکی داروها",
        lessonContent:
          "جذب داروها از دستگاه گوارش عمدتاً از طریق انتشار غیرفعال در روده کوچک رخ می‌دهد. pH محیط و میزان یونیزاسیون دارو طبق معادله هندرسون-هاسلباخ بر عبور از غشا اثر می‌گذارد.",
        skeletonResponse: {
          root: {
            id: "root",
            title: "جذب خوراکی داروها",
            nodeRole: "category",
            category: "general",
            children: [
              {
                id: "s1",
                title: "انتشار غیرفعال",
                nodeRole: "concept",
                category: "cellular_mechanism",
                children: [
                  { id: "s1a", title: "عبور از غشای لیپیدی", nodeRole: "concept", category: "cellular_mechanism", children: [] },
                ],
              },
              {
                id: "s2",
                title: "اثر pH و یونیزاسیون",
                nodeRole: "concept",
                category: "biochemistry",
                children: [
                  { id: "s2a", title: "معادله هندرسون-هاسلباخ", nodeRole: "concept", category: "biochemistry", children: [] },
                ],
              },
              { id: "s3", title: "نقش روده کوچک", nodeRole: "concept", category: "general", children: [] },
            ],
          },
        },
        hydrationItems: [
          {
            id: "s2a",
            titleHint: "معادله هندرسون-هاسلباخ",
            shortDescription: "نسبت فرم غیریونیزه به یونیزه دارو را بر اساس pKa دارو و pH محیط تعیین می‌کند.",
            keyPoints: ["اسیدهای ضعیف در محیط اسیدی فرم غیریونیزه بیشتری دارند."],
          },
        ],
      });

      expect(metrics.totalNodes).toBe(6);
      expect(metrics.firstLevelBranches).toBe(3);
      expect(metrics.maxDepth).toBe(3);
    });
  });
});
