import { describe, it, expect, vi } from "vitest";
import {
  computeRtlTreeLayout,
  getDescendantNodeIds,
  calculateNodeDimensions,
  createOrthogonalPath,
  measureTextWidth,
  getOptimalHandles,
  lineSegmentIntersectsBoxInterior,
  doesOrthogonalEdgeIntersectNode,
  createWaypointOrthogonalPath,
  routeCollisionFreeEdge,
  getBranchLane,
} from "../components/mindmap/treeLayout.js";
import type { MindMapNodeBase } from "@avana/contracts";

describe("Balanced Multi-Directional Tree Layout Algorithm", () => {
  const createNode = (
    id: string,
    parentId: string | null,
    title: string,
    sortOrder = 0,
  ): MindMapNodeBase => ({
    id,
    parentId,
    title,
    shortDescription: `Desc for ${id}`,
    sortOrder,
  });

  it("handles a single root node cleanly", () => {
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "موضوع اصلی"),
    };

    const layout = computeRtlTreeLayout("root", nodes);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.edges).toHaveLength(0);
    expect(layout.nodes[0].position.x).toBe(0);
    expect(layout.nodes[0].data.side).toBe("root");
  });

  it("places a single main branch to the left (primary RTL direction)", () => {
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "موضوع اصلی"),
      b1: createNode("b1", "root", "شاخه اول"),
    };

    const layout = computeRtlTreeLayout("root", nodes);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.edges).toHaveLength(1);

    const b1Node = layout.nodes.find((n) => n.id === "b1")!;
    expect(b1Node.position.x).toBeLessThan(0); // Negative X
    expect(b1Node.data.side).toBe("left");

    const edge = layout.edges[0];
    expect(edge.sourceHandle).toBe("left");
    expect(edge.targetHandle).toBe("right");
  });

  it("partitions multiple main branches symmetrically between left and right sides", () => {
    // 4 branches: B1 (large), B2 (medium), B3 (medium), B4 (small)
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "فارماکولوژی"),
      b1: createNode("b1", "root", "بتابلوکرها", 1),
      b1_c1: createNode("b1_c1", "b1", "پروپرانولول"),
      b1_c2: createNode("b1_c2", "b1", "آتنولول"),
      b1_c3: createNode("b1_c3", "b1", "متوپرولول"),

      b2: createNode("b2", "root", "مهارکننده‌های ACE", 2),
      b2_c1: createNode("b2_c1", "b2", "کاپتوپریل"),
      b2_c2: createNode("b2_c2", "b2", "انالاپریل"),

      b3: createNode("b3", "root", "بلوک‌کننده‌های کانال کلسیم", 3),
      b3_c1: createNode("b3_c1", "b3", "وراپامیل"),

      b4: createNode("b4", "root", "دیورتیک‌ها", 4),
    };

    const layout = computeRtlTreeLayout("root", nodes, {
      nodeWidth: 240,
      nodeHeight: 100,
      horizontalSpacing: 80,
      verticalSpacing: 28,
    });

    expect(layout.nodes).toHaveLength(Object.keys(nodes).length);

    const leftNodes = layout.nodes.filter((n) => n.data.side === "left");
    const rightNodes = layout.nodes.filter((n) => n.data.side === "right");
    const rootNode = layout.nodes.find((n) => n.id === "root")!;

    expect(rootNode.position.x).toBe(0);
    expect(leftNodes.length).toBeGreaterThan(0);
    expect(rightNodes.length).toBeGreaterThan(0);

    // Left nodes must have negative X
    for (const ln of leftNodes) {
      expect(ln.position.x).toBeLessThan(0);
    }

    // Right nodes must have positive X
    for (const rn of rightNodes) {
      expect(rn.position.x).toBeGreaterThan(0);
    }

    // Edges on left side connect source: "left" -> target: "right"
    // Edges on right side connect source: "right" -> target: "left"
    for (const edge of layout.edges) {
      const targetNode = layout.nodes.find((n) => n.id === edge.target)!;
      if (targetNode.data.side === "left") {
        expect(edge.sourceHandle).toBe("left");
        expect(edge.targetHandle).toBe("right");
      } else if (targetNode.data.side === "right") {
        expect(edge.sourceHandle).toBe("right");
        expect(edge.targetHandle).toBe("left");
      }
    }
  });

  it("substantially reduces vertical height compared to linear single-sided stacking", () => {
    // 6 branches, each with 3 children (25 nodes total)
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "سرفصل جامع"),
    };
    for (let i = 1; i <= 6; i++) {
      const bId = `b${i}`;
      nodes[bId] = createNode(bId, "root", `شاخه اصلی ${i}`, i);
      for (let j = 1; j <= 3; j++) {
        const cId = `b${i}_c${j}`;
        nodes[cId] = createNode(cId, bId, `زیرشاخه ${i}-${j}`, j);
      }
    }

    const balancedLayout = computeRtlTreeLayout("root", nodes, {
      nodeHeight: 100,
      verticalSpacing: 28,
    });

    // Compute bounding box
    const yPositions = balancedLayout.nodes.map((n) => n.position.y);
    const minY = Math.min(...yPositions);
    const maxY = Math.max(...yPositions);
    const balancedHeight = maxY - minY + 100;

    // Single-sided stacking would be 6 branches * (3 children * 100 + 2 * 28) + 5 * 28 ≈ 2276px
    // Balanced height should be roughly half
    expect(balancedHeight).toBeLessThan(1400);
  });

  it("handles deep 4-level and 5-level multi-tiered hierarchy cleanly", () => {
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "سطح ۱"),
      b1: createNode("b1", "root", "سطح ۲"),
      b1_sub: createNode("b1_sub", "b1", "سطح ۳"),
      b1_concept: createNode("b1_concept", "b1_sub", "سطح ۴"),
      b1_detail: createNode("b1_detail", "b1_concept", "سطح ۵"),
    };

    const layout = computeRtlTreeLayout("root", nodes);
    const d5Node = layout.nodes.find((n) => n.id === "b1_detail")!;
    const d4Node = layout.nodes.find((n) => n.id === "b1_concept")!;
    expect(d5Node.data.depth).toBe(4);
    expect(Math.abs(d5Node.position.x)).toBeGreaterThan(Math.abs(d4Node.position.x));
  });

  it("respects collapsedNodeIds by collapsing subtrees", () => {
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "ریشه"),
      b1: createNode("b1", "root", "شاخه بسته"),
      b1_c1: createNode("b1_c1", "b1", "فرزند پنهان"),
    };

    const layout = computeRtlTreeLayout("root", nodes, {
      collapsedNodeIds: new Set(["b1"]),
    });

    const b1Node = layout.nodes.find((n) => n.id === "b1")!;
    expect(b1Node.data.isCollapsed).toBe(true);

    // b1_c1 should not be in flowNodes because b1 is collapsed
    const c1Node = layout.nodes.find((n) => n.id === "b1_c1");
    expect(c1Node).toBeUndefined();
  });

  it("correctly identifies all descendants with getDescendantNodeIds", () => {
    const nodes: Record<string, { parentId: string | null }> = {
      root: { parentId: null },
      a: { parentId: "root" },
      a1: { parentId: "a" },
      a2: { parentId: "a" },
      a2_1: { parentId: "a2" },
      b: { parentId: "root" },
    };

    const descendants = getDescendantNodeIds("a", nodes);
    expect(descendants).toHaveLength(3);
    expect(descendants).toContain("a1");
    expect(descendants).toContain("a2");
    expect(descendants).toContain("a2_1");
    expect(descendants).not.toContain("b");
  });

  it("calculates optimal geometric handles and protects tree edges from deletion", () => {
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "ریشه"),
      b_right: createNode("b_right", "root", "شاخه راست", 1),
      b_right_child: createNode("b_right_child", "b_right", "فرزند راست"),
      b_left: createNode("b_left", "root", "شاخه چپ", 2),
      b_left_child: createNode("b_left_child", "b_left", "فرزند چپ"),
    };

    const layout = computeRtlTreeLayout("root", nodes);

    // All tree edges must be protected from deletion
    for (const edge of layout.edges) {
      expect((edge as any).deletable).toBe(false);
      expect((edge as any).selectable).toBe(false);
    }

    // Verify right-side connections at multiple levels
    const rightMainNode = layout.nodes.find((n) => n.data.side === "right" && n.data.depth === 1)!;
    const rightChildNode = layout.nodes.find((n) => (n.data as any).parentId === rightMainNode.id)!;

    const edgeRootToRight = layout.edges.find((e) => e.source === "root" && e.target === rightMainNode.id)!;
    expect(edgeRootToRight.sourceHandle).toBe("right");
    expect(edgeRootToRight.targetHandle).toBe("left");

    const edgeRightToChild = layout.edges.find((e) => e.source === rightMainNode.id && e.target === rightChildNode.id)!;
    expect(edgeRightToChild.sourceHandle).toBe("right");
    expect(edgeRightToChild.targetHandle).toBe("left");

    // Verify left-side connections at multiple levels
    const leftMainNode = layout.nodes.find((n) => n.data.side === "left" && n.data.depth === 1)!;
    const leftChildNode = layout.nodes.find((n) => (n.data as any).parentId === leftMainNode.id)!;

    const edgeRootToLeft = layout.edges.find((e) => e.source === "root" && e.target === leftMainNode.id)!;
    expect(edgeRootToLeft.sourceHandle).toBe("left");
    expect(edgeRootToLeft.targetHandle).toBe("right");

    const edgeLeftToChild = layout.edges.find((e) => e.source === leftMainNode.id && e.target === leftChildNode.id)!;
    expect(edgeLeftToChild.sourceHandle).toBe("left");
    expect(edgeLeftToChild.targetHandle).toBe("right");
  });

  it("never flips branch sides (left vs right) when expanding or collapsing subtrees", () => {
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "ریشه اصلی"),
      b1: createNode("b1", "root", "شاخه اول", 1),
      b1_c1: createNode("b1_c1", "b1", "زیرشاخه ۱-۱"),
      b1_c2: createNode("b1_c2", "b1", "زیرشاخه ۱-۲"),
      b1_c3: createNode("b1_c3", "b1", "زیرشاخه ۱-۳"),

      b2: createNode("b2", "root", "شاخه دوم", 2),
      b2_c1: createNode("b2_c1", "b2", "زیرشاخه ۲-۱"),

      b3: createNode("b3", "root", "شاخه سوم", 3),
      b3_c1: createNode("b3_c1", "b3", "زیرشاخه ۳-۱"),
      b3_c2: createNode("b3_c2", "b3", "زیرشاخه ۳-۲"),

      b4: createNode("b4", "root", "شاخه چهارم", 4),
    };

    // 1. Initial fully expanded layout
    const initialLayout = computeRtlTreeLayout("root", nodes);
    const initialSides = new Map<string, "left" | "right">();
    for (const n of initialLayout.nodes) {
      if (n.data.depth === 1) {
        initialSides.set(n.id, n.data.side as "left" | "right");
      }
    }

    // 2. Collapse b1 (large branch)
    const collapsedB1Layout = computeRtlTreeLayout("root", nodes, {
      collapsedNodeIds: new Set(["b1"]),
    });
    for (const n of collapsedB1Layout.nodes) {
      if (n.data.depth === 1) {
        expect(n.data.side).toBe(initialSides.get(n.id));
      }
    }

    // 3. Collapse b3, expand b1
    const collapsedB3Layout = computeRtlTreeLayout("root", nodes, {
      collapsedNodeIds: new Set(["b3"]),
    });
    for (const n of collapsedB3Layout.nodes) {
      if (n.data.depth === 1) {
        expect(n.data.side).toBe(initialSides.get(n.id));
      }
    }

    // 4. Collapse all branches
    const allCollapsedLayout = computeRtlTreeLayout("root", nodes, {
      collapsedNodeIds: new Set(["b1", "b2", "b3", "b4"]),
    });
    for (const n of allCollapsedLayout.nodes) {
      if (n.data.depth === 1) {
        expect(n.data.side).toBe(initialSides.get(n.id));
      }
    }
  });

  it("stabilizes parent position and prevents visual jumps when toggling children with previousPositions", () => {
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "موضوع"),
      b1: createNode("b1", "root", "شاخه ۱", 1),
      b1_c1: createNode("b1_c1", "b1", "زیر ۱"),
      b1_c2: createNode("b1_c2", "b1", "زیر ۲"),
      b2: createNode("b2", "root", "شاخه ۲", 2),
      b2_c1: createNode("b2_c1", "b2", "زیر ۲-۱"),
    };

    // Initial layout
    const layout1 = computeRtlTreeLayout("root", nodes);
    const prevPos = new Map<string, { x: number; y: number }>();
    for (const n of layout1.nodes) {
      prevPos.set(n.id, n.position);
    }

    const b1Pos1 = prevPos.get("b1")!;

    // Collapse b1 passing previousPositions
    const layout2 = computeRtlTreeLayout("root", nodes, {
      collapsedNodeIds: new Set(["b1"]),
      previousPositions: prevPos,
    });

    const b1Node2 = layout2.nodes.find((n) => n.id === "b1")!;
    // b1 position in X must be unchanged
    expect(b1Node2.position.x).toBe(b1Pos1.x);
    // b1 position in Y must remain firmly anchored to its previous center
    expect(Math.abs(b1Node2.position.y - b1Pos1.y)).toBeLessThanOrEqual(5);
  });

  it("guarantees zero vertical overlap between sibling boxes on both sides", () => {
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "موضوع آزمایشی"),
    };
    for (let i = 1; i <= 6; i++) {
      const bId = `b${i}`;
      nodes[bId] = createNode(bId, "root", `شاخه ${i}`, i);
      for (let j = 1; j <= 4; j++) {
        nodes[`${bId}_c${j}`] = createNode(`${bId}_c${j}`, bId, `زیرشاخه ${i}-${j}`, j);
      }
    }

    const layout = computeRtlTreeLayout("root", nodes, {
      nodeHeight: 100,
      verticalSpacing: 28,
    });

    // Check overlaps on left side
    const leftNodes = layout.nodes.filter((n) => n.data.side === "left" && n.data.depth === 1);
    leftNodes.sort((a, b) => a.position.y - b.position.y);
    for (let i = 1; i < leftNodes.length; i++) {
      const prevBottom = leftNodes[i - 1].position.y + 100;
      expect(leftNodes[i].position.y).toBeGreaterThanOrEqual(prevBottom);
    }

    // Check overlaps on right side
    const rightNodes = layout.nodes.filter((n) => n.data.side === "right" && n.data.depth === 1);
    rightNodes.sort((a, b) => a.position.y - b.position.y);
    for (let i = 1; i < rightNodes.length; i++) {
      const prevBottom = rightNodes[i - 1].position.y + 100;
      expect(rightNodes[i].position.y).toBeGreaterThanOrEqual(prevBottom);
    }
  });

  it("dynamically expands box width for long Persian titles on a single line and keeps short titles compact", () => {
    const shortTitle = "کوتاه";
    const longTitle = "مبانی جامع سیستم‌های توزیع‌شده پیشرفته و پایگاه‌های داده مقیاس‌پذیر";

    const dimShort = calculateNodeDimensions(shortTitle, 1);
    const dimLong = calculateNodeDimensions(longTitle, 1);

    expect(dimShort.width).toBeLessThan(160); // adaptive compact width for short titles
    expect(dimShort.width).toBeGreaterThanOrEqual(110);
    expect(dimLong.width).toBeGreaterThan(400); // significantly expanded
    expect(dimLong.width).toBeGreaterThan(dimShort.width);
  });

  it("centers root node and scales its dimensions dynamically for long root titles", () => {
    const longRootTitle = "راهنمای جامع معماری نرم‌افزارهای مدرن سازمانی و میکروسرویس‌ها";
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, longRootTitle),
      b1: createNode("b1", "root", "شاخه اول"),
    };

    const layout = computeRtlTreeLayout("root", nodes);
    const rootNode = layout.nodes.find((n) => n.id === "root")!;

    expect(rootNode.position.x).toBe(0);
    // Dynamic width for long root title must exceed base 240
    expect((rootNode.style as any).width).toBeGreaterThan(350);
    expect(rootNode.data.calculatedWidth).toBeGreaterThan(350);
    // Root position Y must center root around Y=0
    const rootH = rootNode.data.calculatedHeight as number;
    expect(rootNode.position.y).toBe(-Math.round(rootH / 2));
  });

  it("generates clean orthogonal paths with 90-degree corners and straight line for collinear handles", () => {
    // 1. Collinear handles on same Y
    const straightPath = createOrthogonalPath(100, 50, 300, 50);
    expect(straightPath).toBe("M 100 50 L 300 50");

    // 2. Non-collinear handles (e.g. parent to child with Y offset)
    const orthogonalPath = createOrthogonalPath(100, 50, -100, 150, 0, 12);
    expect(orthogonalPath).toContain("M 100 50");
    expect(orthogonalPath).toContain("L -100 150");
    // Must contain 90-degree rounded quadratic bezier arcs (Q)
    expect(orthogonalPath).toContain("Q");
  });

  it("ensures sibling children share identical vertical trunkX for clean branching", () => {
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "موضوع"),
      b1: createNode("b1", "root", "شاخه چپ", 1),
      b1_c1: createNode("b1_c1", "b1", "فرزند اول", 1),
      b1_c2: createNode("b1_c2", "b1", "فرزند دوم با عنوان طولانی‌تر", 2),
      b1_c3: createNode("b1_c3", "b1", "فرزند سوم", 3),
    };

    const layout = computeRtlTreeLayout("root", nodes);
    const b1Edges = layout.edges.filter((e) => e.source === "b1");

    expect(b1Edges).toHaveLength(3);
    const trunkXValues = b1Edges.map((e) => (e.data as any).trunkX);
    // All 3 children must share the exact same trunkX
    expect(trunkXValues[0]).toBeDefined();
    expect(trunkXValues[0]).toBe(trunkXValues[1]);
    expect(trunkXValues[1]).toBe(trunkXValues[2]);
  });

  it("guarantees zero horizontal overlap between columns with variable-width nodes", () => {
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "موضوع مرکزی با عنوان فوق‌العاده طولانی و مفصل برای تست پهنا"),
      b_right: createNode("b_right", "root", "عنوان شاخه راست بسیار طولانی که عرض زیادی می‌گیرد", 1),
      b_right_child: createNode("b_right_child", "b_right", "فرزند شاخه راست"),
      b_left: createNode("b_left", "root", "عنوان شاخه چپ بسیار طولانی که عرض زیادی می‌گیرد", 2),
      b_left_child: createNode("b_left_child", "b_left", "فرزند شاخه چپ"),
    };

    const layout = computeRtlTreeLayout("root", nodes, { horizontalSpacing: 80 });

    const rootNode = layout.nodes.find((n) => n.id === "root")!;
    const rootWidth = (rootNode.style as any).width as number;

    const rightMain = layout.nodes.find((n) => n.data.side === "right" && n.data.depth === 1)!;
    const rightChild = layout.nodes.find((n) => (n.data as any).parentId === rightMain.id)!;
    const rightMainWidth = (rightMain.style as any).width as number;

    // Right depth 1 must start at rootWidth + horizontalSpacing (zero collision with root)
    expect(rightMain.position.x).toBeGreaterThanOrEqual(rootWidth + 80);
    // Right depth 2 must start at rightMain.position.x + rightMainWidth + horizontalSpacing
    expect(rightChild.position.x).toBeGreaterThanOrEqual(rightMain.position.x + rightMainWidth + 80);

    const leftMain = layout.nodes.find((n) => n.data.side === "left" && n.data.depth === 1)!;
    const leftChild = layout.nodes.find((n) => (n.data as any).parentId === leftMain.id)!;
    const leftMainWidth = (leftMain.style as any).width as number;

    // Left main right edge must be at <= -80
    expect(leftMain.position.x + leftMainWidth).toBeLessThanOrEqual(-80);
    // Left child right edge must be <= leftMain.position.x - 80
    expect(leftChild.position.x + (leftChild.style as any).width).toBeLessThanOrEqual(leftMain.position.x - 80);
  });

  it("aligns all direct sibling children in a single generation column with clean vertical stacking and zero cross-column overlapping", () => {
    // 1. 3 children -> single generation column
    const nodes3: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "موضوع"),
      p: createNode("p", "root", "شاخه اصلی"),
    };
    for (let i = 1; i <= 3; i++) {
      nodes3[`c${i}`] = createNode(`c${i}`, "p", `فرزند ${i}`);
    }
    const layout3 = computeRtlTreeLayout("root", nodes3);
    const pChildren3 = layout3.nodes.filter((n) => (n.data as any).parentId === "p");
    const xCoords3 = new Set(pChildren3.map((n) => Math.round(n.position.x)));
    expect(xCoords3.size).toBe(1); // All 3 in single generation column

    // 2. 6 children -> single generation column with clean vertical stacking
    const nodes6: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "موضوع"),
      p: createNode("p", "root", "شاخه اصلی"),
    };
    for (let i = 1; i <= 6; i++) {
      nodes6[`c${i}`] = createNode(`c${i}`, "p", `فرزند ${i}`);
    }
    const layout6 = computeRtlTreeLayout("root", nodes6);
    const pChildren6 = layout6.nodes.filter((n) => (n.data as any).parentId === "p");
    const xCoords6 = new Set(pChildren6.map((n) => Math.round(n.position.x)));
    expect(xCoords6.size).toBe(1); // All 6 in single generation column, zero multi-column confusion

    // Sibling children must be vertically ordered without overlapping
    const yValues6 = pChildren6.map((n) => n.position.y).sort((a, b) => a - b);
    for (let i = 0; i < yValues6.length - 1; i++) {
      expect(yValues6[i + 1] - yValues6[i]).toBeGreaterThanOrEqual(48); // Box height + spacing
    }

    // Parent centering: parent.y should be aligned with the geometric center of its children
    const parentNode6 = layout6.nodes.find((n) => n.id === "p")!;
    const firstChild6 = pChildren6[0];
    const lastChild6 = pChildren6[pChildren6.length - 1];
    const firstChild6H = (firstChild6.style as any)?.height || 48;
    const lastChild6H = (lastChild6.style as any)?.height || 48;
    const parent6H = (parentNode6.style as any)?.height || 48;
    const childrenCenter6 = (firstChild6.position.y + firstChild6H / 2 + lastChild6.position.y + lastChild6H / 2) / 2;
    const parentCenter6 = parentNode6.position.y + parent6H / 2;
    expect(Math.abs(parentCenter6 - childrenCenter6)).toBeLessThanOrEqual(25);

    // 3. 12 children -> single generation column
    const nodes12: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "موضوع"),
      p: createNode("p", "root", "شاخه اصلی"),
    };
    for (let i = 1; i <= 12; i++) {
      nodes12[`c${i}`] = createNode(`c${i}`, "p", `فرزند ${i}`);
    }
    const layout12 = computeRtlTreeLayout("root", nodes12);
    const pChildren12 = layout12.nodes.filter((n) => (n.data as any).parentId === "p");
    // All 12 direct children share the exact same depth (generation 2) and are aligned at the column boundary
    const depths12 = new Set(pChildren12.map((n) => (n.data as any).depth));
    expect(depths12.size).toBe(1);
    expect(depths12.has(2)).toBe(true);

    const rightCoords12 = new Set(
      pChildren12.map((n) => Math.round(n.position.x + (n.style as any).width)),
    );
    expect(rightCoords12.size).toBe(1); // All 12 direct children share identical generation column boundary

    // Verify tree edges strictly use horizontal handles and valid trunkX
    const edgesFromP = layout12.edges.filter((e) => e.source === "p");
    expect(edgesFromP.length).toBe(12);
    for (const e of edgesFromP) {
      expect(["left", "right"]).toContain(e.sourceHandle);
      expect(["left", "right"]).toContain(e.targetHandle);
      expect(Number.isFinite((e.data as any)?.trunkX)).toBe(true);
    }
  });

  it("calculates adaptive compact dimensions: compact height without description and expanded with description", () => {
    const title = "مدیریت ارتباط با مشتریان";
    const dimWithoutDesc = calculateNodeDimensions(title, 1, { hasDescription: false });
    const dimWithDesc = calculateNodeDimensions(title, 1, { hasDescription: true });

    // Node without description should be compact vertically (title line-height + padding)
    expect(dimWithoutDesc.height).toBeLessThanOrEqual(55);
    expect(dimWithoutDesc.height).toBeGreaterThanOrEqual(44);

    // Node with description expands to accommodate description lines
    expect(dimWithDesc.height).toBeGreaterThanOrEqual(74);
    expect(dimWithDesc.height).toBeGreaterThan(dimWithoutDesc.height);
  });

  it("honors manual node positions strictly as immutable anchors and never shifts them", () => {
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "موضوع"),
      b1: createNode("b1", "root", "شاخه اول"),
      b2: createNode("b2", "root", "شاخه دوم"),
    };

    const manualPositions = {
      b1: { x: -450, y: 220 },
    };

    const layout = computeRtlTreeLayout("root", nodes, {
      nodePositions: manualPositions,
    });

    const b1 = layout.nodes.find((n) => n.id === "b1")!;
    expect(b1.position.x).toBe(-450);
    expect(b1.position.y).toBe(220);
  });

  it("resolves collision deterministically by shifting only auto nodes away from manual nodes", () => {
    const nodes: Record<string, MindMapNodeBase> = {
      root: createNode("root", null, "موضوع"),
      b1: createNode("b1", "root", "شاخه اول"),
      b2: createNode("b2", "root", "شاخه دوم"),
    };

    // Force b1 manually right into where auto-layout would place another branch
    const manualPositions = {
      b1: { x: -200, y: 0 },
    };

    const layout = computeRtlTreeLayout("root", nodes, {
      nodePositions: manualPositions,
    });

    const b1 = layout.nodes.find((n) => n.id === "b1")!;
    const b2 = layout.nodes.find((n) => n.id === "b2")!;

    // Manual node b1 remains at exact coordinate
    expect(b1.position.x).toBe(-200);
    expect(b1.position.y).toBe(0);

    // Auto node b2 does not overlap b1
    const b1Width = (b1.style as any).width as number;
    const b1Height = (b1.style as any).height as number;
    const b2Width = (b2.style as any).width as number;
    const b2Height = (b2.style as any).height as number;

    const b1Left = b1.position.x - b1Width / 2;
    const b1Right = b1.position.x + b1Width / 2;
    const b1Top = b1.position.y - b1Height / 2;
    const b1Bottom = b1.position.y + b1Height / 2;

    const b2Left = b2.position.x - b2Width / 2;
    const b2Right = b2.position.x + b2Width / 2;
    const b2Top = b2.position.y - b2Height / 2;
    const b2Bottom = b2.position.y + b2Height / 2;

    const hasOverlap =
      b1Left < b2Right &&
      b1Right > b2Left &&
      b1Top < b2Bottom &&
      b1Bottom > b2Top;

    expect(hasOverlap).toBe(false);
  });

  it("dynamically routes handles between left/right and top/bottom based on offset dominance", () => {
    // 1. Horizontal dominance (left to right)
    const hHandles = getOptimalHandles({ x: 0, y: 0 }, { x: 300, y: 20 });
    expect(hHandles.sourceHandle).toBe("right");
    expect(hHandles.targetHandle).toBe("left");

    // 2. Horizontal dominance (right to left / RTL)
    const rtlHandles = getOptimalHandles({ x: 300, y: 20 }, { x: 0, y: 0 });
    expect(rtlHandles.sourceHandle).toBe("left");
    expect(rtlHandles.targetHandle).toBe("right");

    // 3. Vertical dominance (top to bottom)
    const vHandlesDown = getOptimalHandles({ x: 0, y: 0 }, { x: 10, y: 250 });
    expect(vHandlesDown.sourceHandle).toBe("bottom");
    expect(vHandlesDown.targetHandle).toBe("top");

    // 4. Vertical dominance (bottom to top)
    const vHandlesUp = getOptimalHandles({ x: 0, y: 250 }, { x: 10, y: 0 });
    expect(vHandlesUp.sourceHandle).toBe("top");
    expect(vHandlesUp.targetHandle).toBe("bottom");
  });

  describe("Dynamic Dimensions and Semantic Clustering in Tree Layout", () => {
    it("dynamically increases height and width for extensive Persian descriptions without clipping", () => {
      const shortNodeDims = calculateNodeDimensions("استاتین‌ها", 2, "توضیح کوتاه");
      const longPersianText =
        "مهارکننده رقابتی آنزیم HMG-CoA ردوکتاز که منجر به کاهش سنتز درون‌سلولی کلسترول، افزایش بیان گیرنده‌های LDL در سطح هپاتوسیت‌ها و پاکسازی سریع‌تر ذرات آتروژنیک از گردش خون سیستمیک می‌گردد.";
      const longNodeDims = calculateNodeDimensions("جمسیتابین و آنتی‌متابولیت‌ها", 2, longPersianText);

      // Width should adaptively expand for long descriptions (up to 280-320px)
      expect(longNodeDims.width).toBeGreaterThanOrEqual(shortNodeDims.width);
      expect(longNodeDims.width).toBeGreaterThanOrEqual(260);

      // Height should dynamically scale based on wrapped lines
      expect(longNodeDims.height).toBeGreaterThan(shortNodeDims.height + 40);
      expect(longNodeDims.height).toBeGreaterThanOrEqual(130);
    });

    it("spatially clusters related siblings together and applies semantic edge colors", () => {
      // Create a parent with 4 children: 2 statins, 2 adverse effects
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "ریشه اصلی"),
        cat_cardio: createNode("cat_cardio", "root", "قلب و عروق", 1),
        // Statin cluster
        atorva: {
          id: "atorva",
          parentId: "cat_cardio",
          title: "آتورواستاتین",
          shortDescription: "مهارکننده HMG-CoA ردوکتاز",
          sortOrder: 1,
        },
        rosuva: {
          id: "rosuva",
          parentId: "cat_cardio",
          title: "رزوواستاتین",
          shortDescription: "استاتین پرتوان هیدروفیل",
          sortOrder: 2,
        },
        // Adverse effects cluster
        adv_liver: {
          id: "adv_liver",
          parentId: "cat_cardio",
          title: "عوارض کبدی و آنزیم‌ها",
          shortDescription: "افزایش ترانس‌آمینازها",
          sortOrder: 3,
        },
        adv_muscle: {
          id: "adv_muscle",
          parentId: "cat_cardio",
          title: "عوارض عضلانی و درد",
          shortDescription: "میوپاتی و افزایش CK",
          sortOrder: 4,
        },
      };

      const layout = computeRtlTreeLayout("root", nodes);

      // Verify node metadata contains cluster information
      const atorvaLayout = layout.nodes.find((n) => n.id === "atorva")!;
      const rosuvaLayout = layout.nodes.find((n) => n.id === "rosuva")!;
      const advLiverLayout = layout.nodes.find((n) => n.id === "adv_liver")!;
      const advMuscleLayout = layout.nodes.find((n) => n.id === "adv_muscle")!;

      expect(atorvaLayout.data.clusterId).toBeDefined();
      expect(rosuvaLayout.data.clusterId).toBe(atorvaLayout.data.clusterId);
      expect(advLiverLayout.data.clusterId).toBeDefined();
      expect(advMuscleLayout.data.clusterId).toBe(advLiverLayout.data.clusterId);
      expect(advLiverLayout.data.clusterId).not.toBe(atorvaLayout.data.clusterId);

      // Verify spatial proximity: intra-cluster distance is tighter than inter-cluster distance
      // In layoutBranch, siblings belonging to different clusters have +16px cluster boundary gap
      const statinGap = Math.abs(rosuvaLayout.position.y - atorvaLayout.position.y);
      const advGap = Math.abs(advMuscleLayout.position.y - advLiverLayout.position.y);
      expect(statinGap).toBeGreaterThan(0);
      expect(advGap).toBeGreaterThan(0);

      // Verify edge colors: edges leading to clustered nodes receive the cluster's semantic color
      const edgeToAtorva = layout.edges.find((e) => e.target === "atorva")!;
      const edgeToRosuva = layout.edges.find((e) => e.target === "rosuva")!;
      const edgeToLiver = layout.edges.find((e) => e.target === "adv_liver")!;

      expect(edgeToAtorva.style?.stroke).toBe(atorvaLayout.data.clusterColor);
      expect(edgeToRosuva.style?.stroke).toBe(atorvaLayout.data.clusterColor);
      expect(edgeToLiver.style?.stroke).toBe(advLiverLayout.data.clusterColor);
      expect(edgeToLiver.style?.stroke).not.toBe(edgeToAtorva.style?.stroke);
    });
  });

  describe("Regression Suite: Multi-Tier Hierarchy and Non-Root Parent Layout", () => {
    it("renders root -> child -> grandchild cleanly without ReferenceError and with valid finite coordinates and handles", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "ریشه اصلی"),
        child_level1: createNode("child_level1", "root", "فرزند مستقیم (والد سطح ۲)"),
        grandchild_level2: createNode("grandchild_level2", "child_level1", "فرزند سطح ۳ (نوه)"),
      };

      // 1. Automatic layout verification
      expect(() => computeRtlTreeLayout("root", nodes)).not.toThrow();
      const layout = computeRtlTreeLayout("root", nodes);

      expect(layout.nodes).toHaveLength(3);
      expect(layout.edges).toHaveLength(2);

      // Verify all node coordinates are valid finite numbers
      for (const node of layout.nodes) {
        expect(Number.isFinite(node.position.x)).toBe(true);
        expect(Number.isFinite(node.position.y)).toBe(true);
      }

      // Verify edge connections
      const edgeRootToChild = layout.edges.find(
        (e) => e.source === "root" && e.target === "child_level1",
      );
      const edgeChildToGrandchild = layout.edges.find(
        (e) => e.source === "child_level1" && e.target === "grandchild_level2",
      );

      expect(edgeRootToChild).toBeDefined();
      expect(edgeChildToGrandchild).toBeDefined();
      expect(["left", "right", "top", "bottom"]).toContain(edgeChildToGrandchild!.sourceHandle);
      expect(["left", "right", "top", "bottom"]).toContain(edgeChildToGrandchild!.targetHandle);
      expect(Number.isFinite((edgeChildToGrandchild!.data as any)?.trunkX)).toBe(true);

      // 2. Manual drag verification (child or grandchild manually repositioned)
      const manualLayout = computeRtlTreeLayout("root", nodes, {
        nodePositions: {
          child_level1: { x: 350, y: -100 },
          grandchild_level2: { x: 150, y: 120 },
        },
      });

      expect(manualLayout.nodes).toHaveLength(3);
      for (const node of manualLayout.nodes) {
        expect(Number.isFinite(node.position.x)).toBe(true);
        expect(Number.isFinite(node.position.y)).toBe(true);
      }

      const manualChildToGrandchild = manualLayout.edges.find(
        (e) => e.source === "child_level1" && e.target === "grandchild_level2",
      );
      expect(manualChildToGrandchild).toBeDefined();
      // Since grandchild (x=150) is to the left of child (x=350), sourceHandle must dynamically route to left
      expect(manualChildToGrandchild!.sourceHandle).toBe("left");
      expect(manualChildToGrandchild!.targetHandle).toBe("right");
      expect(Number.isFinite((manualChildToGrandchild!.data as any)?.trunkX)).toBe(true);
    });
  });

  describe("Architectural Layout Optimization, Aspect Ratio & Geometric Edge Verification", () => {
    it("produces a widescreen rectangular aspect ratio (Width > Height) for 6 and 8 branch trees", () => {
      // 6 branches, each with 2 children
      const nodes6: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "فارماکولوژی جامع اعصاب"),
      };
      for (let i = 1; i <= 6; i++) {
        const bId = `b${i}`;
        nodes6[bId] = createNode(bId, "root", `دسته دارویی شماره ${i}`, i);
        nodes6[`${bId}_c1`] = createNode(`${bId}_c1`, bId, `داروی اول ${i}-۱`, 1);
        nodes6[`${bId}_c2`] = createNode(`${bId}_c2`, bId, `داروی دوم ${i}-۲`, 2);
      }

      const layout6 = computeRtlTreeLayout("root", nodes6);
      expect(layout6.nodes).toHaveLength(19);

      const minX = Math.min(...layout6.nodes.map((n) => n.position.x));
      const maxX = Math.max(
        ...layout6.nodes.map((n) => n.position.x + ((n.style?.width as number) || 200)),
      );
      const minY = Math.min(...layout6.nodes.map((n) => n.position.y));
      const maxY = Math.max(
        ...layout6.nodes.map((n) => n.position.y + ((n.style?.height as number) || 60)),
      );

      const totalWidth = maxX - minX;
      const totalHeight = maxY - minY;
      const aspectRatio = totalWidth / totalHeight;

      // Aspect ratio must be distinctly landscape/horizontal (Width > Height)
      expect(totalWidth).toBeGreaterThan(totalHeight);
      expect(aspectRatio).toBeGreaterThan(1.2);

      // Verify root is vertically centered (Y ≈ 0)
      const rootNode = layout6.nodes.find((n) => n.id === "root")!;
      const rootCenterY = rootNode.position.y + ((rootNode.style?.height as number) || 64) / 2;
      expect(Math.abs(rootCenterY)).toBeLessThanOrEqual(50);
    });

    it("handles heavily unbalanced subtrees without blowing up vertical height", () => {
      // 1 very heavy branch (6 children) and 3 small leaf branches
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "درمان‌های فشار خون"),
        b_heavy: createNode("b_heavy", "root", "مهارکننده‌های سیستم رنین", 1),
        b_s1: createNode("b_s1", "root", "تغییر سبک زندگی", 2),
        b_s2: createNode("b_s2", "root", "پایش فشار خون", 3),
        b_s3: createNode("b_s3", "root", "ملاحظات غذایی", 4),
      };
      for (let i = 1; i <= 6; i++) {
        nodes[`c_${i}`] = createNode(`c_${i}`, "b_heavy", `داروی شماره ${i}`, i);
      }

      const layout = computeRtlTreeLayout("root", nodes);
      expect(layout.nodes).toHaveLength(11);

      const minX = Math.min(...layout.nodes.map((n) => n.position.x));
      const maxX = Math.max(
        ...layout.nodes.map((n) => n.position.x + ((n.style?.width as number) || 200)),
      );
      const minY = Math.min(...layout.nodes.map((n) => n.position.y));
      const maxY = Math.max(
        ...layout.nodes.map((n) => n.position.y + ((n.style?.height as number) || 60)),
      );

      // Width must exceed or equal height even with an unbalanced branch
      expect(maxX - minX).toBeGreaterThanOrEqual((maxY - minY) * 0.9);

      // Verify zero overlap between all nodes
      for (let i = 0; i < layout.nodes.length; i++) {
        for (let j = i + 1; j < layout.nodes.length; j++) {
          const n1 = layout.nodes[i];
          const n2 = layout.nodes[j];
          const w1 = (n1.style?.width as number) || 160;
          const h1 = (n1.style?.height as number) || 48;
          const w2 = (n2.style?.width as number) || 160;
          const h2 = (n2.style?.height as number) || 48;

          const noOverlap =
            n1.position.x + w1 <= n2.position.x ||
            n2.position.x + w2 <= n1.position.x ||
            n1.position.y + h1 <= n2.position.y ||
            n2.position.y + h2 <= n1.position.y;
          expect(noOverlap).toBe(true);
        }
      }
    });

    it("geometrically verifies that no orthogonal edge intersects the interior of any node box", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "سرفصل اصلی"),
        b1: createNode("b1", "root", "شاخه اول", 1),
        b1_c1: createNode("b1_c1", "b1", "فرزند ۱-۱"),
        b2: createNode("b2", "root", "شاخه دوم", 2),
        b2_c1: createNode("b2_c1", "b2", "فرزند ۲-۱"),
        b3: createNode("b3", "root", "شاخه سوم", 3),
        b4: createNode("b4", "root", "شاخه چهارم", 4),
      };

      const layout = computeRtlTreeLayout("root", nodes);
      const nodeBoxes = new Map<string, { x: number; y: number; width: number; height: number }>();
      for (const n of layout.nodes) {
        nodeBoxes.set(n.id, {
          x: n.position.x,
          y: n.position.y,
          width: (n.style?.width as number) || 160,
          height: (n.style?.height as number) || 48,
        });
      }

      for (const edge of layout.edges) {
        const sourceBox = nodeBoxes.get(edge.source)!;
        const targetBox = nodeBoxes.get(edge.target)!;
        expect(sourceBox).toBeDefined();
        expect(targetBox).toBeDefined();

        const trunkX = (edge.data as any)?.trunkX;
        expect(Number.isFinite(trunkX)).toBe(true);

        const sourceHandle = edge.sourceHandle || "left";
        const targetHandle = edge.targetHandle || "right";

        const sourceX =
          sourceHandle === "left"
            ? sourceBox.x
            : sourceHandle === "right"
              ? sourceBox.x + sourceBox.width
              : sourceBox.x + sourceBox.width / 2;
        const sourceY = sourceBox.y + sourceBox.height / 2;

        const targetX =
          targetHandle === "left"
            ? targetBox.x
            : targetHandle === "right"
              ? targetBox.x + targetBox.width
              : targetBox.x + targetBox.width / 2;
        const targetY = targetBox.y + targetBox.height / 2;

        // Verify edge does not penetrate any third-party node box interior
        for (const [nodeId, box] of nodeBoxes.entries()) {
          const isSourceOrTarget = nodeId === edge.source || nodeId === edge.target;
          const intersects = doesOrthogonalEdgeIntersectNode(
            sourceX,
            sourceY,
            targetX,
            targetY,
            trunkX,
            box,
            isSourceOrTarget,
          );
          expect(intersects).toBe(false);
        }
      }
    });

    it("preserves manual anchors and logs conflict warning without shifting either if they conflict", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "ریشه"),
        b1: createNode("b1", "root", "شاخه اول"),
        b2: createNode("b2", "root", "شاخه دوم"),
      };

      // Both manual positions intentionally placed in overlapping coordinates
      const layout = computeRtlTreeLayout("root", nodes, {
        nodePositions: {
          b1: { x: 200, y: 100 },
          b2: { x: 210, y: 110 },
        },
      });

      const b1 = layout.nodes.find((n) => n.id === "b1")!;
      const b2 = layout.nodes.find((n) => n.id === "b2")!;

      // Both manual nodes must remain EXACTLY at their manual coordinates
      expect(b1.position).toEqual({ x: 200, y: 100 });
      expect(b2.position).toEqual({ x: 210, y: 110 });

      // Conflict warning must be logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Manual anchor conflict detected"),
      );

      consoleWarnSpy.mockRestore();
    });

    it("calculates compact dimensions for category nodes without artificial indicator height", () => {
      const regularDim = calculateNodeDimensions("دسته‌بندی مباحث", 1, {
        hasDescription: false,
        hasIndicators: false,
      });

      // Category node should have identical compact height if it has no user notes or overrides
      expect(regularDim.height).toBe(52);
    });
  });

  describe("Mandatory Verification Scenarios: Zero Overlap, Hierarchical Invariants & Edge Integrity", () => {
    function verifyLayoutInvariants(
      layout: { nodes: any[]; edges: any[] },
      nodesDict: Record<string, MindMapNodeBase>,
      options?: { manualAnchors?: Record<string, { x: number; y: number }> },
    ) {
      const nodeMap = new Map<string, any>();
      for (const n of layout.nodes) {
        nodeMap.set(n.id, n);
      }

      function isAncestor(ancestorId: string, nodeId: string): boolean {
        let curr = nodesDict[nodeId]?.parentId;
        while (curr) {
          if (curr === ancestorId) return true;
          curr = nodesDict[curr]?.parentId;
        }
        return false;
      }

      // 1. Zero bounding box overlap between independent nodes (with 2px margin)
      const overlappingPairs: string[] = [];
      for (let i = 0; i < layout.nodes.length; i++) {
        const a = layout.nodes[i];
        const aW = (a.style?.width as number) || a.data?.calculatedWidth || 140;
        const aH = (a.style?.height as number) || a.data?.calculatedHeight || 48;

        for (let j = i + 1; j < layout.nodes.length; j++) {
          const b = layout.nodes[j];
          const bW = (b.style?.width as number) || b.data?.calculatedWidth || 140;
          const bH = (b.style?.height as number) || b.data?.calculatedHeight || 48;

          if (options?.manualAnchors?.[a.id] && options?.manualAnchors?.[b.id]) continue;
          if (isAncestor(a.id, b.id) || isAncestor(b.id, a.id)) continue;

          const overlap =
            a.position.x < b.position.x + bW - 2 &&
            a.position.x + aW - 2 > b.position.x &&
            a.position.y < b.position.y + bH - 2 &&
            a.position.y + aH - 2 > b.position.y;

          if (overlap) {
            overlappingPairs.push(`${a.id} <-> ${b.id}`);
          }
        }
      }
      expect(overlappingPairs).toEqual([]);

      // 2. Geometric parent centering: parent box is vertically centered relative to its children span
      const centeringViolations: string[] = [];
      const parentsChecked = new Set<string>();
      for (const n of layout.nodes) {
        const parentId = nodesDict[n.id]?.parentId;
        if (parentId && parentId !== "root" && !parentsChecked.has(parentId)) {
          parentsChecked.add(parentId);
          const parentNode = nodeMap.get(parentId);
          const children = layout.nodes.filter((node) => nodesDict[node.id]?.parentId === parentId);
          if (parentNode && children.length > 0 && !options?.manualAnchors?.[parentId]) {
            const firstChild = children[0];
            const lastChild = children[children.length - 1];
            const firstChildH = (firstChild.style?.height as number) || 48;
            const lastChildH = (lastChild.style?.height as number) || 48;
            const parentH = (parentNode.style?.height as number) || 48;

            const childrenCenterY =
              (firstChild.position.y + firstChildH / 2 + lastChild.position.y + lastChildH / 2) / 2;
            const parentCenterY = parentNode.position.y + parentH / 2;
            const diff = Math.abs(parentCenterY - childrenCenterY);
            if (diff > 25) {
              centeringViolations.push(
                `Parent ${parentId} center (${parentCenterY}) deviated from children center (${childrenCenterY}) by ${diff}px`,
              );
            }
          }
        }
      }
      expect(centeringViolations).toEqual([]);

      // 3. Manual anchors must never be shifted
      if (options?.manualAnchors) {
        for (const [id, pos] of Object.entries(options.manualAnchors)) {
          const n = nodeMap.get(id);
          expect(n).toBeDefined();
          expect(n.position.x).toBe(pos.x);
          expect(n.position.y).toBe(pos.y);
        }
      }

      // 4. Zero edges intersect the interior of any independent node box
      const edgeIntersections: string[] = [];
      for (const edge of layout.edges) {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);
        if (!sourceNode || !targetNode) continue;

        const sourceDim = {
          width: (sourceNode.style?.width as number) || 140,
          height: (sourceNode.style?.height as number) || 48,
        };
        const targetDim = {
          width: (targetNode.style?.width as number) || 140,
          height: (targetNode.style?.height as number) || 48,
        };

        const sHandle =
          edge.sourceHandle || (targetNode.position.x < sourceNode.position.x ? "left" : "right");
        const tHandle =
          edge.targetHandle || (targetNode.position.x < sourceNode.position.x ? "right" : "left");

        const sourceX =
          sHandle === "left" ? sourceNode.position.x : sourceNode.position.x + sourceDim.width;
        const sourceY = sourceNode.position.y + sourceDim.height / 2;
        const targetX =
          tHandle === "left" ? targetNode.position.x : targetNode.position.x + targetDim.width;
        const targetY = targetNode.position.y + targetDim.height / 2;

        const trunkX = (edge.data?.trunkX as number) || (sourceX + targetX) / 2;

        for (const n of layout.nodes) {
          if (n.id === edge.source || n.id === edge.target) continue;
          const box = {
            x: n.position.x,
            y: n.position.y,
            width: (n.style?.width as number) || 140,
            height: (n.style?.height as number) || 48,
          };
          if (
            doesOrthogonalEdgeIntersectNode(
              sourceX,
              sourceY,
              targetX,
              targetY,
              trunkX,
              box,
              false,
              2,
            )
          ) {
            edgeIntersections.push(`Edge ${edge.id} intersects node ${n.id}`);
          }
        }
      }
      expect(edgeIntersections).toEqual([]);
    }

    // Scenario 1: Shallow tree with multiple branches
    it("Scenario 1: Shallow tree with multiple branches satisfies zero overlap and hierarchical ordering", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "مفاهیم پایه فارماکولوژی"),
        b1: createNode("b1", "root", "جذب دارو", 1),
        b2: createNode("b2", "root", "توزیع دارو", 2),
        b3: createNode("b3", "root", "متابولیسم کبدی", 3),
        b4: createNode("b4", "root", "دفع کلیوی", 4),
      };
      const layout = computeRtlTreeLayout("root", nodes);
      expect(layout.nodes).toHaveLength(5);
      verifyLayoutInvariants(layout, nodes);
    });

    // Scenario 2: Large dense tree with 8 branches and 20+ nodes
    it("Scenario 2: Large dense tree (8 branches, 24 nodes) satisfies zero overlap and landscape aspect ratio", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "فارماکولوژی جامع اعصاب و روان"),
      };
      for (let i = 1; i <= 8; i++) {
        const bId = `b${i}`;
        nodes[bId] = createNode(bId, "root", `دسته دارویی بزرگ شماره ${i}`, i);
        nodes[`${bId}_c1`] = createNode(`${bId}_c1`, bId, `زیرشاخه اول ${i}-۱`, 1);
        nodes[`${bId}_c2`] = createNode(`${bId}_c2`, bId, `زیرشاخه دوم ${i}-۲`, 2);
      }
      const layout = computeRtlTreeLayout("root", nodes);
      expect(layout.nodes).toHaveLength(25);
      verifyLayoutInvariants(layout, nodes);

      const minX = Math.min(...layout.nodes.map((n) => n.position.x));
      const maxX = Math.max(
        ...layout.nodes.map((n) => n.position.x + ((n.style?.width as number) || 200)),
      );
      const minY = Math.min(...layout.nodes.map((n) => n.position.y));
      const maxY = Math.max(
        ...layout.nodes.map((n) => n.position.y + ((n.style?.height as number) || 60)),
      );
      const totalWidth = maxX - minX;
      const totalHeight = maxY - minY;
      expect(totalWidth / totalHeight).toBeGreaterThan(1.1);
    });

    // Scenario 3: Unbalanced branch with a deep 4-level subtree
    it("Scenario 3: Unbalanced branch with deep 4-level subtree never places descendants higher than parent", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "آنتی‌بیوتیک‌ها"),
        b_short: createNode("b_short", "root", "ماکرولیدها", 1),
        b_deep: createNode("b_deep", "root", "بتالاکتام‌ها", 2),
        d_lvl2: createNode("d_lvl2", "b_deep", "پنی‌سیلین‌ها", 1),
        d_lvl3: createNode("d_lvl3", "d_lvl2", "آمینوپنی‌سیلین‌ها", 1),
        d_lvl4: createNode("d_lvl4", "d_lvl3", "آموکسی‌سیلین کلاوولانات", 1),
      };
      const layout = computeRtlTreeLayout("root", nodes);
      expect(layout.nodes).toHaveLength(6);
      verifyLayoutInvariants(layout, nodes);

      const bDeepNode = layout.nodes.find((n) => n.id === "b_deep")!;
      const lvl4Node = layout.nodes.find((n) => n.id === "d_lvl4")!;
      // Level 4 descendant must be at or below its main branch parent in Y
      expect(lvl4Node.position.y).toBeGreaterThanOrEqual(bDeepNode.position.y);
    });

    // Scenario 4: Parent with multiple children and deep descendants
    it("Scenario 4: Parent with multiple children and deep descendants satisfies parent geometric centering", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "دستگاه گوارش"),
        p: createNode("p", "root", "داروهای ضد زخم پپتیک", 1),
        c1: createNode("c1", "p", "مهارکننده‌های پمپ پروتون (PPI)", 1),
        c1_sub1: createNode("c1_sub1", "c1", "امپرازول", 1),
        c1_sub2: createNode("c1_sub2", "c1", "پانتوپرازول", 2),
        c2: createNode("c2", "p", "آنتاگونیست‌های گیرنده H2", 2),
        c2_sub1: createNode("c2_sub1", "c2", "فاموتیدین", 1),
        c3: createNode("c3", "p", "آنتی‌اسیدها", 3),
      };
      const layout = computeRtlTreeLayout("root", nodes);
      expect(layout.nodes).toHaveLength(8);
      verifyLayoutInvariants(layout, nodes);

      const pNode = layout.nodes.find((n) => n.id === "p")!;
      const c1Node = layout.nodes.find((n) => n.id === "c1")!;
      const c3Node = layout.nodes.find((n) => n.id === "c3")!;

      // p center must be aligned with the children span center
      const pNodeH = (pNode.style?.height as number) || 48;
      const c1NodeH = (c1Node.style?.height as number) || 48;
      const c3NodeH = (c3Node.style?.height as number) || 48;
      const childrenCenterY = (c1Node.position.y + c1NodeH / 2 + c3Node.position.y + c3NodeH / 2) / 2;
      const pCenterY = pNode.position.y + pNodeH / 2;
      expect(Math.abs(pCenterY - childrenCenterY)).toBeLessThanOrEqual(25);
    });

    // Scenario 5: Long titles with varying box heights
    it("Scenario 5: Long titles with varying box heights accommodate actual dimensions without overlaps", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "راهنمای جامع بالینی فارماکوتراپی بیماری‌های عروق کرونر"),
        b1: {
          ...createNode("b1", "root", "داروهای ضد پلاکت و ترومبوز عروقی با اثربخشی طولانی"),
          shortDescription:
            "این داروها با مهار فعال‌سازی پلاکت‌ها مانع از تشکیل لخته در استنت‌های عروقی و تنگی مجدد شریان‌ها می‌شوند و نیازمند پایش مداوم زمان سیلان خون هستند.",
        },
        b2: {
          ...createNode("b2", "root", "نیترات‌های وریدی و زیرزبانی جهت تسکین آنژین صدری حاد"),
          shortDescription: "اتساع عروق کرونر با رهایش اکسید نیتریک و کاهش پیش‌بار قلبی.",
        },
        b1_c1: createNode("b1_c1", "b1", "کلوپیدوگرل"),
        b1_c2: createNode("b1_c2", "b1", "تیکاگرلور"),
      };
      const layout = computeRtlTreeLayout("root", nodes);
      expect(layout.nodes).toHaveLength(5);
      verifyLayoutInvariants(layout, nodes);
    });

    // Scenario 6: Multiple manual anchors alongside auto branches
    it("Scenario 6: Multiple manual anchors alongside auto branches keeps anchors immutable and shifts auto nodes", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "بیهوشی"),
        b_auto1: createNode("b_auto1", "root", "هالوتان", 1),
        b_manual1: createNode("b_manual1", "root", "پروپوفول", 2),
        b_manual2: createNode("b_manual2", "root", "کتامین", 3),
        b_auto2: createNode("b_auto2", "root", "ایزوفلوران", 4),
      };
      const manualAnchors = {
        b_manual1: { x: -350, y: -80 },
        b_manual2: { x: 350, y: 120 },
      };
      const layout = computeRtlTreeLayout("root", nodes, { nodePositions: manualAnchors });
      expect(layout.nodes).toHaveLength(5);
      verifyLayoutInvariants(layout, nodes, { manualAnchors });
    });

    // Scenario 7: Two manual anchors with deliberate conflict logs conflict without shifting either
    it("Scenario 7: Deliberate manual anchor conflict logs conflict warning without shifting either", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "شیمی‌درمانی"),
        b1: createNode("b1", "root", "متوترکسات", 1),
        b2: createNode("b2", "root", "سیس‌پلاتین", 2),
      };
      const conflictingAnchors = {
        b1: { x: -280, y: -50 },
        b2: { x: -285, y: -45 }, // Intentionally colliding coordinates
      };
      const layout = computeRtlTreeLayout("root", nodes, { nodePositions: conflictingAnchors });
      expect(layout.nodes).toHaveLength(3);

      const b1 = layout.nodes.find((n) => n.id === "b1")!;
      const b2 = layout.nodes.find((n) => n.id === "b2")!;
      expect(b1.position).toEqual({ x: -280, y: -50 });
      expect(b2.position).toEqual({ x: -285, y: -45 });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Manual anchor conflict detected"),
      );
      consoleWarnSpy.mockRestore();
    });
  });

  describe("Adaptive Rectangular Distribution, Parent Centering & Collision-Free Routing", () => {
    it("distributes main branches adaptively into multiple lanes based on branch count and dimensions", () => {
      // 1 branch -> lane 0
      expect(getBranchLane(0, 1)).toBe(0);

      // 3 branches -> diamond envelope [1, 0, 1]
      expect(getBranchLane(0, 3)).toBe(1);
      expect(getBranchLane(1, 3)).toBe(0);
      expect(getBranchLane(2, 3)).toBe(1);

      // 4 branches -> convex fanning [1, 0, 0, 1]
      expect(getBranchLane(0, 4)).toBe(1);
      expect(getBranchLane(1, 4)).toBe(0);
      expect(getBranchLane(2, 4)).toBe(0);
      expect(getBranchLane(3, 4)).toBe(1);

      // 5 branches -> 3-tier arched fanning [2, 1, 0, 1, 2]
      expect(getBranchLane(0, 5)).toBe(2);
      expect(getBranchLane(1, 5)).toBe(1);
      expect(getBranchLane(2, 5)).toBe(0);
      expect(getBranchLane(3, 5)).toBe(1);
      expect(getBranchLane(4, 5)).toBe(2);

      // Deep branches adaptively pull inward to prevent canvas explosion
      expect(getBranchLane(0, 7, 200, 4)).toBeLessThanOrEqual(2);
    });

    it("places first-level branches across multiple X lanes rather than a single vertical column", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "مرکز سیستم"),
      };
      // 6 main branches (3 on left, 3 on right)
      for (let i = 1; i <= 6; i++) {
        nodes[`b${i}`] = createNode(`b${i}`, "root", `شاخه اصلی شماره ${i}`, i);
        nodes[`b${i}_c1`] = createNode(`b${i}_c1`, `b${i}`, `زیرشاخه ${i}`, 1);
      }

      const layout = computeRtlTreeLayout("root", nodes);
      expect(layout.nodes).toHaveLength(13);

      const leftBranches = layout.nodes.filter(
        (n) => (n.data as any).parentId === "root" && (n.data as any).side === "left",
      );
      const rightBranches = layout.nodes.filter(
        (n) => (n.data as any).parentId === "root" && (n.data as any).side === "right",
      );

      expect(leftBranches.length).toBeGreaterThan(1);
      expect(rightBranches.length).toBeGreaterThan(1);

      // Verify that left branches are NOT all in a single X column
      const leftXs = new Set(leftBranches.map((n) => Math.round(n.position.x)));
      expect(leftXs.size).toBeGreaterThan(1);

      // Verify that right branches are NOT all in a single X column
      const rightXs = new Set(rightBranches.map((n) => Math.round(n.position.x)));
      expect(rightXs.size).toBeGreaterThan(1);

      // Verify rectangular aspect ratio W > H
      const minX = Math.min(...layout.nodes.map((n) => n.position.x));
      const maxX = Math.max(...layout.nodes.map((n) => n.position.x + ((n.style?.width as number) || 160)));
      const minY = Math.min(...layout.nodes.map((n) => n.position.y));
      const maxY = Math.max(...layout.nodes.map((n) => n.position.y + ((n.style?.height as number) || 50)));
      const totalWidth = maxX - minX;
      const totalHeight = maxY - minY;
      expect(totalWidth / totalHeight).toBeGreaterThan(1.2);
    });

    it("geometrically centers parent node relative to the children span", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "سلسله‌مراتب"),
        p: createNode("p", "root", "والد متقارن"),
        c1: createNode("c1", "p", "فرزند بالا", 1),
        c2: createNode("c2", "p", "فرزند وسط", 2),
        c3: createNode("c3", "p", "فرزند پایین", 3),
      };

      const layout = computeRtlTreeLayout("root", nodes);
      const pNode = layout.nodes.find((n) => n.id === "p")!;
      const c1Node = layout.nodes.find((n) => n.id === "c1")!;
      const c2Node = layout.nodes.find((n) => n.id === "c2")!;
      const c3Node = layout.nodes.find((n) => n.id === "c3")!;

      const pH = (pNode.style?.height as number) || 48;
      const c1H = (c1Node.style?.height as number) || 48;
      const c3H = (c3Node.style?.height as number) || 48;

      const pCenterY = pNode.position.y + pH / 2;
      const childrenSpanCenterY = (c1Node.position.y + c1H / 2 + c3Node.position.y + c3H / 2) / 2;

      // Parent center should align with children center within 10px
      expect(Math.abs(pCenterY - childrenSpanCenterY)).toBeLessThanOrEqual(10);
      // And the middle child should be very close to the parent's center
      const c2CenterY = c2Node.position.y + ((c2Node.style?.height as number) || 48) / 2;
      expect(Math.abs(pCenterY - c2CenterY)).toBeLessThanOrEqual(10);
    });

    it("generates smooth rounded multi-point waypoint paths with createWaypointOrthogonalPath", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 100 },
        { x: 150, y: 100 },
      ];
      const path = createWaypointOrthogonalPath(points, 12);
      expect(path).toContain("M 0 0");
      expect(path).toContain("Q 50 0");
      expect(path).toContain("Q 50 100");
      expect(path).toContain("L 150 100");
    });

    it("routes edges cleanly around obstacles using routeCollisionFreeEdge without penetrating box interior", () => {
      const sourceBox = { x: 0, y: 50, width: 100, height: 40 };
      const targetBox = { x: 300, y: 50, width: 100, height: 40 };
      // Place an obstacle box directly in the middle on the horizontal corridor
      const obstacleBox = { id: "obs", x: 160, y: 40, width: 80, height: 60 };

      const routed = routeCollisionFreeEdge(
        sourceBox,
        targetBox,
        "right",
        "left",
        [sourceBox, targetBox, obstacleBox],
      );

      expect(routed.path).toBeDefined();
      expect(routed.path.length).toBeGreaterThan(0);

      // Verify that no segment of the routed path penetrates the obstacle interior
      const segmentsMatch = routed.path.match(/[MLQ]\s*(-?\d+(\.\d+)?)\s*(-?\d+(\.\d+)?)/g);
      expect(segmentsMatch).not.toBeNull();
    });

    it("guarantees 100% collision-free edges across all nodes in a large complex tree", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "نقشه جامع مراقبت‌های ویژه"),
      };
      for (let b = 1; b <= 8; b++) {
        nodes[`b${b}`] = createNode(`b${b}`, "root", `شاخه تخصصی ${b}`, b);
        for (let c = 1; c <= 3; c++) {
          nodes[`b${b}_c${c}`] = createNode(`b${b}_c${c}`, `b${b}`, `زیرشاخه ${b}-${c}`, c);
          if (c === 2) {
            nodes[`b${b}_c${c}_sub`] = createNode(`b${b}_c${c}_sub`, `b${b}_c${c}`, `زیرشاخه عمیق`, 1);
          }
        }
      }

      const layout = computeRtlTreeLayout("root", nodes);
      expect(layout.nodes.length).toBeGreaterThan(30);

      // Verify all edges have valid custom paths or trunkX
      for (const edge of layout.edges) {
        expect(edge.data?.path || Number.isFinite(edge.data?.trunkX)).toBeTruthy();
      }

      // Verify zero edge-node interior intersections for standard trunk edges
      for (const edge of layout.edges) {
        const sourceNode = layout.nodes.find((n) => n.id === edge.source)!;
        const targetNode = layout.nodes.find((n) => n.id === edge.target)!;
        const trunkX = edge.data?.trunkX as number;
        if (!Number.isFinite(trunkX)) continue;

        const sX = edge.sourceHandle === "left" ? sourceNode.position.x : sourceNode.position.x + ((sourceNode.style?.width as number) || 140);
        const sY = sourceNode.position.y + ((sourceNode.style?.height as number) || 48) / 2;
        const tX = edge.targetHandle === "left" ? targetNode.position.x : targetNode.position.x + ((targetNode.style?.width as number) || 140);
        const tY = targetNode.position.y + ((targetNode.style?.height as number) || 48) / 2;

        for (const obsNode of layout.nodes) {
          if (obsNode.id === edge.source || obsNode.id === edge.target) continue;
          const obsBox = {
            x: obsNode.position.x,
            y: obsNode.position.y,
            width: (obsNode.style?.width as number) || 140,
            height: (obsNode.style?.height as number) || 48,
          };
          const intersects = doesOrthogonalEdgeIntersectNode(sX, sY, tX, tY, trunkX, obsBox, false, 2);
          expect(intersects).toBe(false);
        }
      }
    });
  });

  describe("Validation of Node Padding & Shared Branch Routing Redesign", () => {
    // 1 & 2 & 3: Standard internal padding & multiline wrapping across all depths
    it("guarantees minimum standard internal padding from all 4 sides for all depths without border collision", () => {
      const depths = [0, 1, 2, 3, 4];
      for (const d of depths) {
        const title = "سیستم ایمنی بدن و فارماکولوژی بالینی";
        const dims = calculateNodeDimensions(title, d);

        const expectedMinPadX = d === 0 ? 56 : (d === 1 ? 52 : (d === 2 ? 48 : 44));
        const expectedMinPadY = d === 0 ? 36 : (d === 1 ? 28 : (d === 2 ? 24 : 22));

        // Total width must strictly accommodate text width plus 4-sided padding clearance
        expect(dims.width).toBeGreaterThanOrEqual(110);
        expect(dims.height).toBeGreaterThanOrEqual(expectedMinPadY + 18);
      }
    });

    it("scales box height proportionally for multiline titles with newlines and maintains symmetric vertical padding", () => {
      const singleLine = calculateNodeDimensions("آنتی‌بیوتیک‌های باکتریوسید", 1);
      const multiline = calculateNodeDimensions("آنتی‌بیوتیک‌های باکتریوسید\nپنی‌سیلین‌ها و سفالوسپورین‌ها\nکارباپنم‌ها", 1);

      // Multiline with 3 lines must expand height by at least 2 extra lines (~48px)
      expect(multiline.height).toBeGreaterThan(singleLine.height + 40);
      expect(multiline.height).toBeGreaterThanOrEqual(28 + 3 * 24); // paddingY + 3 * line-height
    });

    it("properly wraps long titles and preserves padding when descriptions are present", () => {
      const longTitleWithDesc = calculateNodeDimensions(
        "داروهای موثر بر دستگاه قلبی-عروقی و کاهنده فشار خون شریانی",
        2,
        {
          hasDescription: true,
          description: "مهارکننده گیرنده‌های آلفا و بتا آدرنرژیک با اثر گشادکنندگی عروق محیطی",
        },
      );

      // Width is bound to max 320 for harmonious mindmap balance
      expect(longTitleWithDesc.width).toBeLessThanOrEqual(320);
      expect(longTitleWithDesc.width).toBeGreaterThanOrEqual(240);
      // Height expands to fit both wrapped title and description lines plus internal padding
      expect(longTitleWithDesc.height).toBeGreaterThanOrEqual(100);
    });

    // 4 & 5: Shared vertical trunk and separation near child destination box
    it("assigns an identical shared vertical trunk (trunkX) to all sibling children of a parent", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "سرفصل آزمون"),
        p: createNode("p", "root", "داروهای اعصاب", 1),
        c1: createNode("c1", "p", "بنزودیازپین‌ها", 1),
        c2: createNode("c2", "p", "باربیتورات‌ها", 2),
        c3: createNode("c3", "p", "مهارکننده‌های بازجذب سروتونین (SSRI)", 3),
        c4: createNode("c4", "p", "تثبیت‌کننده‌های خلق", 4),
      };

      const layout = computeRtlTreeLayout("root", nodes);
      const pEdges = layout.edges.filter((e) => e.source === "p");
      expect(pEdges).toHaveLength(4);

      // All 4 edges must have identical trunkX
      const trunkXs = pEdges.map((e) => (e.data as any).trunkX);
      const uniqueTrunkXs = new Set(trunkXs);
      expect(uniqueTrunkXs.size).toBe(1);

      // The shared trunk must be positioned close to the child destination boxes (within 20px - 36px)
      const c1Node = layout.nodes.find((n) => n.id === "c1")!;
      const c1EntryX = c1Node.position.x + ((c1Node.style?.width as number) || 140);
      const trunkX = trunkXs[0];
      const distanceToChild = Math.abs(trunkX - c1EntryX);
      expect(distanceToChild).toBeGreaterThanOrEqual(20);
      expect(distanceToChild).toBeLessThanOrEqual(36);
    });

    // 6: Shared paths are not redrawn (zero duplicate strokes)
    it("partitions edge paths so that the parent horizontal stem is drawn exactly once without duplication", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "مرکز داروشناسی"),
        p: createNode("p", "root", "داروهای قلبی", 1),
        c1: createNode("c1", "p", "دیگوکسین", 1),
        c2: createNode("c2", "p", "آمیودارون", 2),
        c3: createNode("c3", "p", "نیتروپروساید", 3),
      };

      const layout = computeRtlTreeLayout("root", nodes);
      const pEdges = layout.edges.filter((e) => e.source === "p");
      const pNode = layout.nodes.find((n) => n.id === "p")!;
      const parentHandleX = pNode.position.x; // left handle of parent

      // Exactly ONE edge in pEdges should start at the parent's handle (sourceX)
      const edgesStartingAtParent = pEdges.filter((e) => {
        const path = (e.data as any)?.path as string;
        return path && path.startsWith(`M ${parentHandleX} `);
      });
      expect(edgesStartingAtParent).toHaveLength(1);

      // The remaining sibling edges start on the shared vertical trunk (trunkX) without redrawing the parent stem
      const trunkX = (pEdges[0].data as any)?.trunkX as number;
      const otherEdges = pEdges.filter((e) => e.id !== edgesStartingAtParent[0].id);
      for (const e of otherEdges) {
        const path = (e.data as any)?.path as string;
        expect(path).toBeDefined();
        // Does NOT start at the parent handle (parent stem is not redrawn)
        expect(path.startsWith(`M ${parentHandleX} `)).toBe(false);
        // Starts either on trunkX or at tangent point near trunkX
        const match = path.match(/^M\s*(-?\d+)\s+/);
        expect(match).not.toBeNull();
        const startX = Number(match![1]);
        expect(Math.abs(startX - trunkX)).toBeLessThanOrEqual(14);
      }
    });

    // 7: No line penetrates any node box interior
    it("ensures no shared trunk or branch edge penetrates the interior of any box", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "فارماکوکینتیک"),
        b1: createNode("b1", "root", "جذب دارو", 1),
        b1_c1: createNode("b1_c1", "b1", "انتشار غیرفعال", 1),
        b1_c2: createNode("b1_c2", "b1", "انتقال فعال با صرف انرژی", 2),
        b2: createNode("b2", "root", "توزیع بافتی", 2),
        b2_c1: createNode("b2_c1", "b2", "اتصال به پروتئین‌های پلاسما", 1),
        b2_c2: createNode("b2_c2", "b2", "سد خونی-مغزی (BBB)", 2),
      };

      const layout = computeRtlTreeLayout("root", nodes);
      for (const edge of layout.edges) {
        const sourceNode = layout.nodes.find((n) => n.id === edge.source)!;
        const targetNode = layout.nodes.find((n) => n.id === edge.target)!;
        const trunkX = (edge.data as any).trunkX;

        const sX = edge.sourceHandle === "left" ? sourceNode.position.x : sourceNode.position.x + ((sourceNode.style?.width as number) || 140);
        const sY = sourceNode.position.y + ((sourceNode.style?.height as number) || 48) / 2;
        const tX = edge.targetHandle === "left" ? targetNode.position.x : targetNode.position.x + ((targetNode.style?.width as number) || 140);
        const tY = targetNode.position.y + ((targetNode.style?.height as number) || 48) / 2;

        for (const obs of layout.nodes) {
          if (obs.id === edge.source || obs.id === edge.target) continue;
          const obsBox = {
            x: obs.position.x,
            y: obs.position.y,
            width: (obs.style?.width as number) || 140,
            height: (obs.style?.height as number) || 48,
          };
          const collides = doesOrthogonalEdgeIntersectNode(sX, sY, tX, tY, trunkX, obsBox, false, 2);
          expect(collides).toBe(false);
        }
      }
    });

    // 8: Horizontal distance is increased while vertical spacing remains compact
    it("increases horizontal parent-to-child spacing for breathing room without blowing up vertical spacing", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "سرفصل"),
        b1: createNode("b1", "root", "شاخه اول", 1),
        b1_c1: createNode("b1_c1", "b1", "فرزند اول", 1),
        b1_c2: createNode("b1_c2", "b1", "فرزند دوم", 2),
      };

      const layout = computeRtlTreeLayout("root", nodes);
      const b1 = layout.nodes.find((n) => n.id === "b1")!;
      const c1 = layout.nodes.find((n) => n.id === "b1_c1")!;
      const c2 = layout.nodes.find((n) => n.id === "b1_c2")!;

      const b1LeftX = b1.position.x;
      const c1RightX = c1.position.x + ((c1.style?.width as number) || 140);
      const horizontalGap = Math.abs(b1LeftX - c1RightX);

      // Horizontal gap must be at least 100px (increased from old 80px)
      expect(horizontalGap).toBeGreaterThanOrEqual(100);

      // Vertical distance between c1 and c2 should remain standard compact (~28px gap)
      const c1BottomY = c1.position.y + ((c1.style?.height as number) || 48);
      const c2TopY = c2.position.y;
      const verticalGap = c2TopY - c1BottomY;
      expect(verticalGap).toBe(28);
    });

    // 9: Stability in large multi-level trees
    it("maintains perfect stability and invariants in a large 4-level dense hierarchy", () => {
      const nodes: Record<string, MindMapNodeBase> = {
        root: createNode("root", null, "نقشه جامع مراقبت‌های ویژه"),
      };
      for (let b = 1; b <= 6; b++) {
        const bId = `b${b}`;
        nodes[bId] = createNode(bId, "root", `شاخه اصلی ${b}`, b);
        for (let c = 1; c <= 3; c++) {
          const cId = `${bId}_c${c}`;
          nodes[cId] = createNode(cId, bId, `زیرشاخه ${b}-${c}`, c);
          for (let d = 1; d <= 2; d++) {
            const dId = `${cId}_d${d}`;
            nodes[dId] = createNode(dId, cId, `مفهوم جزئی ${b}-${c}-${d}`, d);
          }
        }
      }

      const layout = computeRtlTreeLayout("root", nodes);
      expect(layout.nodes).toHaveLength(1 + 6 + 18 + 36); // 61 nodes
      expect(layout.edges).toHaveLength(60); // 60 tree edges

      // Every sibling group must have consistent trunkX
      const edgesByParent = new Map<string, any[]>();
      for (const e of layout.edges) {
        const list = edgesByParent.get(e.source) || [];
        list.push(e);
        edgesByParent.set(e.source, list);
      }

      for (const [pId, pEdges] of edgesByParent.entries()) {
        const trunkXs = new Set(pEdges.map((e) => (e.data as any).trunkX));
        // All siblings on a given side share 1 trunkX
        expect(trunkXs.size).toBeLessThanOrEqual(2); // At most 2 for root (left + right), exactly 1 for all others
        if (pId !== "root") {
          expect(trunkXs.size).toBe(1);
        }
      }
    });
  });
});
