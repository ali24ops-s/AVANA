import { describe, it, expect } from "vitest";
import {
  validateMindMapAiBase,
  computeEffectiveMindMap,
  MAX_MINDMAP_DEPTH,
  detectSemanticClusters,
  getSemanticClusterColor,
  AVANA_SEMANTIC_PALETTE,
} from "../mind-map.js";
import { DomainError } from "../errors.js";
import type { MindMapPayload } from "@avana/contracts";

describe("Mind Map Domain Validations", () => {
  const validBase = {
    rootNodeId: "root",
    generatedAt: "2026-11-03T00:00:00.000Z",
    model: "gemini-3.5-flash-lite",
    nodes: {
      root: {
        id: "root",
        parentId: null,
        title: "فارماکولوژی قلب و عروق",
        shortDescription: "بررسی دسته‌های دارویی مؤثر بر دستگاه قلبی-عروقی",
        keyPoints: ["آشنایی با بتابلوکرها", "مهارکننده‌های ACE"],
      },
      b1: {
        id: "b1",
        parentId: "root",
        title: "بتابلوکرها",
        shortDescription: "مهارگیرنده‌های بتا آدرنرژیک",
        keyPoints: ["پروپرانولول", "متوپرولول"],
      },
      b1_detail: {
        id: "b1_detail",
        parentId: "b1",
        title: "پروپرانولول",
        shortDescription: "بتابلوکر غیرانتخابی",
        examTips: ["کنترااندیکاسیون در آسم"],
      },
    },
  };

  it("validates a healthy mind map tree structure", () => {
    const validated = validateMindMapAiBase(validBase);
    expect(validated.rootNodeId).toBe("root");
    expect(Object.keys(validated.nodes)).toHaveLength(3);
    expect(validated.nodes["b1_detail"].parentId).toBe("b1");
  });

  it("supports array of nodes from AI gateway with automatic normalization", () => {
    const arrayBase = {
      rootNodeId: "root",
      nodes: [
        { id: "root", parentId: null, title: "ریشه" },
        { id: "c1", parentId: "root", title: "شاخه اول" },
      ],
    };
    const validated = validateMindMapAiBase(arrayBase);
    expect(validated.nodes["c1"]).toBeDefined();
    expect(validated.nodes["c1"].title).toBe("شاخه اول");
  });

  it("rejects trees with missing root node", () => {
    const invalid = {
      rootNodeId: "missing_root",
      nodes: {
        node1: { id: "node1", parentId: null, title: "نود" },
        node2: { id: "node2", parentId: "node1", title: "نود ۲" },
      },
    };
    expect(() => validateMindMapAiBase(invalid)).toThrow(DomainError);
    expect(() => validateMindMapAiBase(invalid)).toThrow("گره ریشه مشخص‌شده");
  });

  it("rejects trees where root has a parent", () => {
    const invalid = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", parentId: "something", title: "ریشه" },
        c1: { id: "c1", parentId: "root", title: "فرزند" },
      },
    };
    expect(() => validateMindMapAiBase(invalid)).toThrow("گره ریشه نباید والد");
  });

  it("rejects trees with multiple root nodes (parentId === null)", () => {
    const invalid = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", parentId: null, title: "ریشه ۱" },
        root2: { id: "root2", parentId: null, title: "ریشه ۲" },
      },
    };
    expect(() => validateMindMapAiBase(invalid)).toThrow("دقیقا یک گره ریشه");
  });

  it("rejects trees with invalid parent references", () => {
    const invalid = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", parentId: null, title: "ریشه" },
        c1: { id: "c1", parentId: "non_existent_parent", title: "فرزند" },
      },
    };
    expect(() => validateMindMapAiBase(invalid)).toThrow("یافت نشد");
  });

  it("detects self-referencing nodes", () => {
    const invalid = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", parentId: null, title: "ریشه" },
        c1: { id: "c1", parentId: "c1", title: "خود والد" },
      },
    };
    expect(() => validateMindMapAiBase(invalid)).toThrow("نمی‌تواند والد خودش باشد");
  });

  it("detects cyclic loops in hierarchy", () => {
    const cyclic = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", parentId: null, title: "ریشه" },
        a: { id: "a", parentId: "root", title: "گره A" },
        b: { id: "b", parentId: "c", title: "گره B" },
        c: { id: "c", parentId: "b", title: "گره C" },
      },
    };
    // Note: b and c form a cycle and are not reachable from root
    expect(() => validateMindMapAiBase(cyclic)).toThrow(DomainError);
  });

  it("detects cyclic loops connected to root", () => {
    const cyclic = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", parentId: null, title: "ریشه" },
        a: { id: "a", parentId: "root", title: "A" },
        b: { id: "b", parentId: "a", title: "B" },
        c: { id: "c", parentId: "b", title: "C" },
      },
    };
    // inject cycle: a -> b -> c -> a
    cyclic.nodes.a.parentId = "c";
    // Now root is alone, a is parented by c
    expect(() => validateMindMapAiBase(cyclic)).toThrow(DomainError);
  });

  it("accepts trees up to depth 8 and rejects trees exceeding maximum depth limit", () => {
    const validDeep: Record<string, { id: string; parentId: string | null; title: string }> = {
      n1: { id: "n1", parentId: null, title: "سطح ۱" },
    };
    for (let i = 2; i <= MAX_MINDMAP_DEPTH; i++) {
      validDeep[`n${i}`] = { id: `n${i}`, parentId: `n${i - 1}`, title: `سطح ${i}` };
    }
    const validated = validateMindMapAiBase({ rootNodeId: "n1", nodes: validDeep });
    expect(validated.nodes[`n${MAX_MINDMAP_DEPTH}`]).toBeDefined();

    const tooDeep = { ...validDeep, [`n${MAX_MINDMAP_DEPTH + 1}`]: { id: `n${MAX_MINDMAP_DEPTH + 1}`, parentId: `n${MAX_MINDMAP_DEPTH}`, title: "سطح ۹" } };
    expect(() => validateMindMapAiBase({ rootNodeId: "n1", nodes: tooDeep })).toThrow("عمق درخت");
  });

  it("accepts comprehensive mind maps with 80+ nodes and rejects beyond MAX_MINDMAP_NODES (120)", () => {
    const largeNodes: Record<string, { id: string; parentId: string | null; title: string }> = {
      root: { id: "root", parentId: null, title: "ریشه سرفصل" },
    };
    for (let i = 1; i <= 80; i++) {
      largeNodes[`node_${i}`] = { id: `node_${i}`, parentId: "root", title: `گره مفهوم ${i}` };
    }
    const validated = validateMindMapAiBase({ rootNodeId: "root", nodes: largeNodes });
    expect(Object.keys(validated.nodes)).toHaveLength(81);

    // Exceed limit (> 120)
    for (let i = 81; i <= 125; i++) {
      largeNodes[`node_${i}`] = { id: `node_${i}`, parentId: "root", title: `گره مفهوم ${i}` };
    }
    expect(() => validateMindMapAiBase({ rootNodeId: "root", nodes: largeNodes })).toThrow("بیشتر از حداکثر مجاز (120)");
  });

  it("detects disconnected orphan subtrees", () => {
    const disconnected = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", parentId: null, title: "ریشه" },
        c1: { id: "c1", parentId: "root", title: "فرزند ریشه" },
        orphan_parent: { id: "orphan_parent", parentId: "c1", title: "والد یتیم" },
        orphan_child: { id: "orphan_child", parentId: "orphan_parent", title: "فرزند یتیم" },
      },
    };
    // Make disconnected by breaking link
    disconnected.nodes.orphan_parent.parentId = "missing_parent";
    expect(() => validateMindMapAiBase(disconnected)).toThrow("یافت نشد");
  });

  it("computes effective mind map by merging 3 layers correctly", () => {
    const payload: MindMapPayload = {
      kind: "mind_map",
      version: 1,
      sourceType: "reference_document",
      sourceId: "doc-1",
      updatedAt: "2026-11-03T00:00:00Z",
      aiBase: {
        rootNodeId: "root",
        generatedAt: "2026-11-03T00:00:00Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: { id: "root", parentId: null, title: "ریشه اصلی", shortDescription: "توضیح" },
          n1: { id: "n1", parentId: "root", title: "عنوان اولیه", shortDescription: "توضیح اولیه" },
          n2: { id: "n2", parentId: "root", title: "نود دو", shortDescription: "توضیح دو" },
        },
      },
      userModifications: {
        deletedNodeIds: ["n2"], // User deleted n2
        customNodes: {
          custom_1: { id: "custom_1", parentId: "root", title: "نود شخصی", shortDescription: "دست‌ساز" },
        },
        overrides: {
          n1: { title: "عنوان ویرایش‌شده توسط کاربر" },
        },
      },
      userNotes: {
        n1: { noteText: "یادداشت من روی نود ۱", updatedAt: "2026-11-03T01:00:00Z" },
      },
    };

    const effective = computeEffectiveMindMap(payload);
    expect(effective.nodes["n2"]).toBeUndefined(); // Deleted
    expect(effective.nodes["n1"].title).toBe("عنوان ویرایش‌شده توسط کاربر"); // Overridden
    expect(effective.nodes["n1"].isOverridden).toBe(true);
    expect(effective.nodes["n1"].userNote).toBe("یادداشت من روی نود ۱");
    expect(effective.nodes["custom_1"]).toBeDefined(); // Custom node added
    expect(effective.nodes["custom_1"].isUserCustom).toBe(true);
  });

  it("cascading deletion prunes all orphaned descendants without re-parenting to root", () => {
    const payload: MindMapPayload = {
      kind: "mind_map",
      version: 1,
      sourceType: "reference_document",
      sourceId: "doc-1",
      updatedAt: "2026-11-03T00:00:00Z",
      aiBase: {
        rootNodeId: "root",
        generatedAt: "2026-11-03T00:00:00Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: { id: "root", parentId: null, title: "ریشه", shortDescription: "توضیح" },
          branchA: { id: "branchA", parentId: "root", title: "شاخه الف", shortDescription: "توضیح" },
          childA1: { id: "childA1", parentId: "branchA", title: "فرزند الف ۱", shortDescription: "توضیح" },
          grandchildA1_1: { id: "grandchildA1_1", parentId: "childA1", title: "نوه الف", shortDescription: "توضیح" },
          branchB: { id: "branchB", parentId: "root", title: "شاخه ب", shortDescription: "توضیح" },
        },
      },
      userModifications: {
        deletedNodeIds: ["branchA"], // User deleted branchA
        customNodes: {},
        overrides: {},
      },
      userNotes: {},
    };

    const effective = computeEffectiveMindMap(payload);
    expect(effective.nodes["branchA"]).toBeUndefined();
    // Descendants must be cleanly pruned, NOT attached to root
    expect(effective.nodes["childA1"]).toBeUndefined();
    expect(effective.nodes["grandchildA1_1"]).toBeUndefined();
    // Unrelated branch must remain
    expect(effective.nodes["branchB"]).toBeDefined();
    expect(effective.nodes["root"]).toBeDefined();
  });
});

describe("User Modifications & Notes Validation", () => {
  const sampleAiBase = {
    rootNodeId: "root",
    generatedAt: "2026-11-03T00:00:00.000Z",
    model: "gemini-3.5-flash-lite",
    nodes: {
      root: { id: "root", parentId: null, title: "ریشه اصلی", shortDescription: "توضیح ریشه" },
      n1: { id: "n1", parentId: "root", title: "گره ۱", shortDescription: "توضیح ۱" },
      n2: { id: "n2", parentId: "root", title: "گره ۲", shortDescription: "توضیح ۲" },
    },
  };

  it("rejects attempt to delete root node", async () => {
    const { validateUserModificationsAndNotes } = await import("../mind-map.js");
    expect(() =>
      validateUserModificationsAndNotes(sampleAiBase, {
        deletedNodeIds: ["root"],
        customNodes: {},
        overrides: {},
      }, {}),
    ).toThrow("قابل حذف نیست");
  });

  it("rejects more than 20 custom nodes", async () => {
    const { validateUserModificationsAndNotes } = await import("../mind-map.js");
    const customNodes: Record<string, any> = {};
    for (let i = 1; i <= 21; i++) {
      customNodes[`c_${i}`] = {
        id: `c_${i}`,
        parentId: "root",
        title: `گره سفارشی ${i}`,
      };
    }

    expect(() =>
      validateUserModificationsAndNotes(sampleAiBase, {
        deletedNodeIds: [],
        customNodes,
        overrides: {},
      }, {}),
    ).toThrow("بیش از حد مجاز (20 گره)");
  });

  it("rejects user note exceeding 5000 characters", async () => {
    const { validateUserModificationsAndNotes } = await import("../mind-map.js");
    const longNote = "ا".repeat(5001);

    expect(() =>
      validateUserModificationsAndNotes(
        sampleAiBase,
        { deletedNodeIds: [], customNodes: {}, overrides: {} },
        { n1: { noteText: longNote, updatedAt: new Date().toISOString() } },
      ),
    ).toThrow("بیش از حد مجاز (5000 کاراکتر)");
  });

  it("detects cycle in user custom nodes", async () => {
    const { validateUserModificationsAndNotes } = await import("../mind-map.js");
    expect(() =>
      validateUserModificationsAndNotes(sampleAiBase, {
        deletedNodeIds: [],
        customNodes: {
          c1: { id: "c1", parentId: "c2", title: "گره ۱" },
          c2: { id: "c2", parentId: "c1", title: "گره ۲" },
        },
        overrides: {},
      }, {}),
    ).toThrow("Cycle");
  });

  it("getDescendantNodeIds recursively finds all descendants", async () => {
    const { getDescendantNodeIds } = await import("../mind-map.js");
    const nodes = {
      root: { id: "root", parentId: null, title: "ریشه" },
      a: { id: "a", parentId: "root", title: "الف" },
      a1: { id: "a1", parentId: "a", title: "الف ۱" },
      a2: { id: "a2", parentId: "a", title: "الف ۲" },
      a1_sub: { id: "a1_sub", parentId: "a1", title: "زیر الف ۱" },
      b: { id: "b", parentId: "root", title: "ب" },
    };

    const descendantsA = getDescendantNodeIds("a", nodes);
    expect(descendantsA).toHaveLength(3);
    expect(descendantsA).toContain("a1");
    expect(descendantsA).toContain("a2");
    expect(descendantsA).toContain("a1_sub");

    const descendantsB = getDescendantNodeIds("b", nodes);
    expect(descendantsB).toHaveLength(0);
  });

  describe("Structural MindMapPayload & computeEffectiveMindMap Robustness", () => {
    it("rejects empty payload ({})", async () => {
      const { computeEffectiveMindMap, validateMindMapPayload } = await import("../mind-map.js");
      expect(() => computeEffectiveMindMap({} as any)).toThrow("ساختار مایندمپ فاقد بخش هوش مصنوعی (aiBase) است.");
      expect(() => validateMindMapPayload({})).toThrow("ساختار مایندمپ فاقد لایه هوش مصنوعی (aiBase) است.");
    });

    it("rejects payload without aiBase", async () => {
      const { computeEffectiveMindMap, validateMindMapPayload } = await import("../mind-map.js");
      expect(() => computeEffectiveMindMap({ kind: "mind_map" } as any)).toThrow("فاقد بخش هوش مصنوعی");
      expect(() => validateMindMapPayload({ kind: "mind_map" })).toThrow("فاقد لایه هوش مصنوعی");
    });

    it("rejects aiBase without rootNodeId", async () => {
      const { computeEffectiveMindMap, validateMindMapPayload } = await import("../mind-map.js");
      const badPayload = {
        kind: "mind_map",
        aiBase: { nodes: { n1: { id: "n1", title: "گره ۱", parentId: null } } },
      };
      expect(() => computeEffectiveMindMap(badPayload as any)).toThrow("گره ریشه (rootNodeId)");
      expect(() => validateMindMapPayload(badPayload)).toThrow("گره ریشه (rootNodeId)");
    });

    it("rejects aiBase with empty/whitespace rootNodeId", async () => {
      const { computeEffectiveMindMap, validateMindMapPayload } = await import("../mind-map.js");
      const badPayload = {
        kind: "mind_map",
        aiBase: { rootNodeId: "   ", nodes: {} },
      };
      expect(() => computeEffectiveMindMap(badPayload as any)).toThrow("گره ریشه (rootNodeId)");
      expect(() => validateMindMapPayload(badPayload)).toThrow("گره ریشه (rootNodeId)");
    });

    it("rejects aiBase without nodes object", async () => {
      const { computeEffectiveMindMap, validateMindMapPayload } = await import("../mind-map.js");
      const badPayload = {
        kind: "mind_map",
        aiBase: { rootNodeId: "root" },
      };
      expect(() => computeEffectiveMindMap(badPayload as any)).toThrow("گره‌های هوش مصنوعی (aiBase.nodes) نامعتبر است.");
      expect(() => validateMindMapPayload(badPayload)).toThrow("گره‌های هوش مصنوعی (aiBase.nodes) در ساختار مایندمپ نامعتبر است.");
    });

    it("validateMindMapAiBase rejects node without title, null title, or empty title", async () => {
      const { validateMindMapAiBase } = await import("../mind-map.js");
      expect(() =>
        validateMindMapAiBase({
          rootNodeId: "root",
          nodes: {
            root: { id: "root", parentId: null, title: "ریشه" },
            n1: { id: "n1", parentId: "root" }, // missing title
          },
        }),
      ).toThrow("عنوان گره \"n1\" خالی است.");

      expect(() =>
        validateMindMapAiBase({
          rootNodeId: "root",
          nodes: {
            root: { id: "root", parentId: null, title: "ریشه" },
            n1: { id: "n1", parentId: "root", title: null }, // null title
          },
        }),
      ).toThrow("عنوان گره \"n1\" خالی است.");

      expect(() =>
        validateMindMapAiBase({
          rootNodeId: "root",
          nodes: {
            root: { id: "root", parentId: null, title: "ریشه" },
            n1: { id: "n1", parentId: "root", title: "   " }, // empty title
          },
        }),
      ).toThrow("عنوان گره \"n1\" خالی است.");
    });

    it("handles valid legacy payload cleanly in computeEffectiveMindMap and validateMindMapPayload", async () => {
      const { computeEffectiveMindMap, validateMindMapPayload } = await import("../mind-map.js");
      const legacyPayload = {
        kind: "mind_map",
        version: 1,
        sourceType: "lessons",
        sourceId: "mod-1",
        updatedAt: "2026-10-01T12:00:00Z",
        aiBase: {
          rootNodeId: "root",
          generatedAt: "2026-10-01T12:00:00Z",
          model: "gemini-3.5-flash-lite",
          nodes: {
            root: { id: "root", parentId: null, title: "ریشه قدیمی", shortDescription: "توضیح ریشه" },
            n1: { id: "n1", parentId: "root", title: "گره فرعی ۱", shortDescription: "توضیح ۱" },
          },
        },
      };

      const validated = validateMindMapPayload(legacyPayload);
      expect(validated.kind).toBe("mind_map");
      expect(validated.aiBase.rootNodeId).toBe("root");
      expect(validated.userModifications.deletedNodeIds).toEqual([]);

      const effective = computeEffectiveMindMap(legacyPayload as any);
      expect(effective.rootNodeId).toBe("root");
      expect(Object.keys(effective.nodes)).toHaveLength(2);
      expect(effective.nodes["root"].title).toBe("ریشه قدیمی");
    });

    it("validates and cleans customEdges and maintains backward compatibility when customEdges is omitted", async () => {
      const { validateUserModificationsAndNotes } = await import("../mind-map.js");
      const aiBase = {
        rootNodeId: "root",
        generatedAt: "2026-11-01T00:00:00Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: { id: "root", parentId: null, title: "ریشه", shortDescription: "" },
          n1: { id: "n1", parentId: "root", title: "شاخه ۱", shortDescription: "" },
          n2: { id: "n2", parentId: "root", title: "شاخه ۲", shortDescription: "" },
        },
      };

      // 1. Legacy modifications without customEdges
      const legacyResult = validateUserModificationsAndNotes(aiBase as any, {
        deletedNodeIds: [],
        customNodes: {},
        overrides: {},
      }, {});
      expect(legacyResult.userModifications.customEdges).toEqual([]);

      // 2. Modifications with valid, invalid, duplicate, and deleted edges
      const edgeResult = validateUserModificationsAndNotes(aiBase as any, {
        deletedNodeIds: ["n2"],
        customNodes: {},
        overrides: {},
        customEdges: [
          { id: "e1", source: "root", target: "n1", sourceHandle: "bottom", targetHandle: "top" },
          { id: "e1_dup", source: "root", target: "n1", sourceHandle: "bottom", targetHandle: "top" }, // Duplicate -> should be ignored
          { id: "e_self", source: "root", target: "root" }, // Self-loop -> should be ignored
          { id: "e_deleted", source: "root", target: "n2" }, // Deleted node target -> should be ignored
          { id: "e_invalid", source: "root", target: "nonexistent" }, // Nonexistent target -> should be ignored
        ],
      }, {});

      expect(edgeResult.userModifications.customEdges).toHaveLength(1);
      expect(edgeResult.userModifications.customEdges![0]).toEqual({
        id: "e1",
        source: "root",
        target: "n1",
        sourceHandle: "bottom",
        targetHandle: "top",
      });
    });
  });

  describe("Structured Details & Semantic Clustering Domain Tests", () => {
    it("preserves semanticGroup, category, structuredDetails, and sections in validateMindMapAiBase", () => {
      const baseWithStructured = {
        rootNodeId: "root",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "آنتی‌نئوپلاستیک‌ها",
            shortDescription: "داروهای ضد تومور و شیمی‌درمانی",
            category: "treatment" as const,
          },
          gemcitabine: {
            id: "gemcitabine",
            parentId: "root",
            title: "جمسیتابین (Gemcitabine)",
            shortDescription: "آنالوگ پیریمیدین و مهارکننده سنتز DNA در فاز S چرخه سلولی با کاربرد وسیع در کانسر پانکراس",
            category: "drug" as const,
            semanticGroup: "آنالوگ‌های پیریمیدین",
            structuredDetails: {
              drugClass: "Antimetabolite / Pyrimidine Analog",
              mechanism: "مهار ریبونوکلئوتید ردوکتاز و ادغام در ساختار زنجیره DNA و مهار همانندسازی",
              indications: ["سرطان پانکراس", "سرطان ریه غیرسلول کوچک", "سرطان مثانه"],
              pharmacokinetics: "متابولیسم درون‌سلولی به فرم‌های فعال دی‌فسفات و تری‌فسفات",
              adverseEffects: ["سرکوب مغز استخوان", "سندرم شبه آنفلوآنزا", "سمیت ریوی نادر"],
              contraindications: ["حساسیت شدید", "نارسایی شدید کبدی/کلیوی"],
              interactions: ["واکسن‌های زنده ضعیف‌شده", "وارفارین"],
              clinicalPearls: ["انفوزیون طولانی‌مدت سمیت را افزایش می‌دهد."],
              examTips: ["داروی خط اول کارسینوم ادنوکارسینومای پانکراس پیشرفته"],
              commonPitfalls: ["اشتباه گرفتن دوز هفتگی با رژیم روزانه"],
              relatedConcepts: ["سیتارابین", "۵-فلورواوراسیل"],
            },
            sections: [
              {
                id: "dosing",
                title: "دوزاژ بالینی",
                content: "۱۰۰۰ میلی‌گرم بر متر مربع طی ۳۰ دقیقه",
                type: "clinical" as const,
              },
            ],
          },
        },
      };

      const validated = validateMindMapAiBase(baseWithStructured);
      const gem = validated.nodes["gemcitabine"];
      expect(gem).toBeDefined();
      expect(gem.semanticGroup).toBe("آنالوگ‌های پیریمیدین");
      expect(gem.category).toBe("drug");
      expect(gem.structuredDetails?.mechanismOfAction).toContain("ریبونوکلئوتید ردوکتاز");
      expect(gem.structuredDetails?.indications).toHaveLength(3);
      expect(gem.structuredDetails?.adverseEffects).toContain("سرکوب مغز استخوان");
      expect(gem.sections).toHaveLength(1);
      expect(gem.sections![0].title).toBe("دوزاژ بالینی");
    });

    it("computeEffectiveMindMap propagates structuredDetails and user overrides seamlessly", () => {
      const payload: MindMapPayload = {
        kind: "mind_map",
        version: 1,
        sourceType: "reference_document",
        sourceId: "doc-med-1",
        updatedAt: "2026-11-06T00:00:00Z",
        aiBase: {
          rootNodeId: "root",
          generatedAt: "2026-11-06T00:00:00Z",
          model: "gemini-3.5-flash-lite",
          nodes: {
            root: { id: "root", parentId: null, title: "فارماکولوژی", shortDescription: "" },
            nodeA: {
              id: "nodeA",
              parentId: "root",
              title: "آتورواستاتین",
              shortDescription: "مهارکننده HMG-CoA ردوکتاز",
              semanticGroup: "استاتین‌ها",
              structuredDetails: {
                drugClass: "Statin",
                indications: ["هیپرکلسترولمی"],
              },
            },
          },
        },
        userModifications: {
          deletedNodeIds: [],
          customNodes: {},
          overrides: {
            nodeA: {
              shortDescription: "مهارکننده قوی سنتز کلسترول با اثر پایدار",
            },
          },
        },
        userNotes: {},
      };

      const effective = computeEffectiveMindMap(payload);
      const nodeA = effective.nodes["nodeA"];
      expect(nodeA.shortDescription).toBe("مهارکننده قوی سنتز کلسترول با اثر پایدار");
      expect(nodeA.semanticGroup).toBe("استاتین‌ها");
      expect(nodeA.structuredDetails?.drugClass).toBe("Statin");
      expect(nodeA.isOverridden).toBe(true);
    });

    it("detectSemanticClusters groups 12 siblings into multiple clusters with stable colors and unclustered fallbacks", () => {
      // 12 siblings under same parent:
      // - 5 statins (atorvastatin, rosuvastatin, simvastatin, pravastatin, lovastatin)
      // - 4 adverse effect nodes (adverse liver, adverse muscle, adverse GI, adverse renal)
      // - 2 beta-blockers via explicit semanticGroup (metoprolol, propranolol)
      // - 1 unique unrelated node (dietary counseling)
      const siblings = [
        "drug_atorva",
        "drug_rosuva",
        "drug_simva",
        "drug_prava",
        "drug_lova",
        "adv_liver",
        "adv_muscle",
        "adv_gi",
        "adv_renal",
        "bb_meto",
        "bb_propran",
        "other_diet",
      ];

      const nodesDict: Record<string, any> = {
        drug_atorva: { id: "drug_atorva", parentId: "root", title: "آتورواستاتین" },
        drug_rosuva: { id: "drug_rosuva", parentId: "root", title: "رزوواستاتین" },
        drug_simva: { id: "drug_simva", parentId: "root", title: "سیمواستاتین" },
        drug_prava: { id: "drug_prava", parentId: "root", title: "پراواستاتین" },
        drug_lova: { id: "drug_lova", parentId: "root", title: "لوواستاتین" },
        adv_liver: { id: "adv_liver", parentId: "root", title: "عوارض کبدی و ترانس‌آمینازها" },
        adv_muscle: { id: "adv_muscle", parentId: "root", title: "عوارض عضلانی و رابدومیولیز" },
        adv_gi: { id: "adv_gi", parentId: "root", title: "عوارض گوارشی شایع" },
        adv_renal: { id: "adv_renal", parentId: "root", title: "عوارض کلیوی ثانویه" },
        bb_meto: {
          id: "bb_meto",
          parentId: "root",
          title: "متوپرولول",
          semanticGroup: "بلوک‌کننده‌های گیرنده بتا",
        },
        bb_propran: {
          id: "bb_propran",
          parentId: "root",
          title: "پروپرانولول",
          semanticGroup: "بلوک‌کننده‌های گیرنده بتا",
        },
        other_diet: {
          id: "other_diet",
          parentId: "root",
          title: "مشاوره رژیم غذایی کم‌چرب",
        },
      };

      const clusters = detectSemanticClusters(siblings, nodesDict);

      // Verify that statin siblings are grouped into the statin cluster
      const statinCluster = clusters.get("drug_atorva");
      expect(statinCluster).toBeDefined();
      expect(clusters.get("drug_rosuva")?.clusterId).toBe(statinCluster?.clusterId);
      expect(clusters.get("drug_simva")?.clusterId).toBe(statinCluster?.clusterId);
      expect(clusters.get("drug_prava")?.clusterId).toBe(statinCluster?.clusterId);
      expect(clusters.get("drug_lova")?.clusterId).toBe(statinCluster?.clusterId);

      // Verify that adverse effect siblings are grouped into the adverse cluster
      const advCluster = clusters.get("adv_liver");
      expect(advCluster).toBeDefined();
      expect(clusters.get("adv_muscle")?.clusterId).toBe(advCluster?.clusterId);
      expect(clusters.get("adv_gi")?.clusterId).toBe(advCluster?.clusterId);
      expect(clusters.get("adv_renal")?.clusterId).toBe(advCluster?.clusterId);
      expect(advCluster?.clusterId).not.toBe(statinCluster?.clusterId);

      // Verify explicit semanticGroup cluster for beta-blockers
      const bbCluster = clusters.get("bb_meto");
      expect(bbCluster).toBeDefined();
      expect(clusters.get("bb_propran")?.clusterId).toBe(bbCluster?.clusterId);
      expect(bbCluster?.clusterId).not.toBe(statinCluster?.clusterId);
      expect(bbCluster?.clusterId).not.toBe(advCluster?.clusterId);

      // Verify unique unclustered node is NOT in the cluster map
      expect(clusters.get("other_diet")).toBeUndefined();

      // Verify color assignment uses AVANA_SEMANTIC_PALETTE
      expect(AVANA_SEMANTIC_PALETTE).toContain(statinCluster!.color);
      expect(AVANA_SEMANTIC_PALETTE).toContain(advCluster!.color);
      expect(AVANA_SEMANTIC_PALETTE).toContain(bbCluster!.color);
    });

    it("getSemanticClusterColor gracefully handles negative or boundary indexes", () => {
      expect(getSemanticClusterColor(0)).toBe(AVANA_SEMANTIC_PALETTE[0]);
      expect(getSemanticClusterColor(5)).toBe(AVANA_SEMANTIC_PALETTE[5]);
      expect(getSemanticClusterColor(6)).toBe(AVANA_SEMANTIC_PALETTE[0]); // Wraps modulo 6
      expect(getSemanticClusterColor(-1)).toBe("#94a3b8"); // Fallback
      expect(getSemanticClusterColor(NaN)).toBe("#94a3b8"); // Fallback
    });

    it("preserves nodeRole (category vs concept) in validateMindMapAiBase and computeEffectiveMindMap", () => {
      const treeWithRoles = {
        rootNodeId: "root",
        generatedAt: "2026-11-06T00:00:00.000Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "فشار خون",
            shortDescription: "بررسی بالینی",
          },
          node_treatment: {
            id: "node_treatment",
            parentId: "root",
            title: "رویکردهای درمانی",
            shortDescription: "راهبردهای دارویی",
            nodeRole: "category",
          },
          node_captopril: {
            id: "node_captopril",
            parentId: "node_treatment",
            title: "کاپتوپریل",
            shortDescription: "مهارکننده ACE",
            nodeRole: "concept",
          },
          node_independent_def: {
            id: "node_independent_def",
            parentId: "root",
            title: "تعریف و کلیات",
            shortDescription: "مفهوم پایه بدون دسته",
          },
        },
      };

      const validated = validateMindMapAiBase(treeWithRoles);
      expect(validated.nodes["node_treatment"].nodeRole).toBe("category");
      expect(validated.nodes["node_captopril"].nodeRole).toBe("concept");
      expect(validated.nodes["node_independent_def"].nodeRole).toBeUndefined();

      const payload: MindMapPayload = {
        kind: "mind_map",
        version: 1,
        sourceType: "reference_document",
        sourceId: "doc_1",
        updatedAt: "2026-11-06T00:00:00.000Z",
        aiBase: validated,
        userModifications: {
          deletedNodeIds: [],
          customNodes: {
            custom_cat: {
              id: "custom_cat",
              parentId: "root",
              title: "دسته سفارشی کاربر",
              shortDescription: "توضیح دسته کاربر",
              nodeRole: "category",
            },
          },
          overrides: {
            node_captopril: {
              nodeRole: "category", // User switched role
            },
          },
        },
        userNotes: {},
      };

      const effective = computeEffectiveMindMap(payload);
      expect(effective.nodes["node_treatment"].nodeRole).toBe("category");
      expect(effective.nodes["node_captopril"].nodeRole).toBe("category"); // Overridden
      expect(effective.nodes["custom_cat"].nodeRole).toBe("category"); // Custom node with category role
      expect(effective.nodes["node_independent_def"].nodeRole).toBeUndefined(); // Legacy compatibility
    });
  });
});


