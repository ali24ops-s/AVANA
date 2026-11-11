import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { exportMindMapToSvg } from "../components/mindmap/export/mindMapSvgExporter.js";
import { exportMindMapToHtml, sanitizeChemicalSvg } from "../components/mindmap/export/mindMapHtmlExporter.js";
import { sanitizeFilename, escapeXml, escapeHtml } from "../components/mindmap/export/mindMapExportUtils.js";
import { MindMapCanvas } from "../components/mindmap/MindMapCanvas.js";
import { computeRtlTreeLayout } from "../components/mindmap/treeLayout.js";
import { computeEffectiveMindMap } from "@avana/domain";
import type { MindMapPayload } from "@avana/contracts";

// Mock AuthProvider
let mockUserRole: string | null = "platform_admin";
let mockUserGlobalRole: string | null = null;

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: mockUserRole ? { id: "user-1", email: "admin@avana.org", role: mockUserRole, globalRole: mockUserGlobalRole } : null,
    isAuthenticated: Boolean(mockUserRole),
  }),
}));

// Mock @xyflow/react components to render in jsdom
vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<any>("@xyflow/react");
  return {
    ...actual,
    ReactFlow: ({ nodes, children }: any) => (
      <div data-testid="react-flow-mock">
        {nodes?.map((n: any) => (
          <div key={n.id} data-testid={`node-${n.id}`}>
            {n.data?.title}
          </div>
        ))}
        {children}
      </div>
    ),
    useReactFlow: () => ({
      fitView: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
      setViewport: vi.fn(),
    }),
  };
});

describe("Mind Map Export Engine & UI Permissions", () => {
  const samplePayload: MindMapPayload = {
    kind: "mind_map",
    version: 1,
    sourceType: "lessons",
    sourceId: "source-123",
    updatedAt: new Date().toISOString(),
    aiBase: {
      rootNodeId: "root",
      generatedAt: new Date().toISOString(),
      model: "gemini",
      nodes: {
        root: {
          id: "root",
          parentId: null,
          title: "فارماکولوژی سیستم قلبی",
          shortDescription: "بررسی داروهای قلبی و عروقی",
          detailedExplanation: "شرح جامع مکانیسم‌های سلولی داروهای کاردیوواسکولار",
          keyPoints: ["نکته ۱", "نکته ۲"],
          examTips: ["کنترااندیکاسیون بتابلوکر در آسم"],
        },
        node_branch_1: {
          id: "node_branch_1",
          parentId: "root",
          title: "بتابلوکرها",
          shortDescription: "مهارکننده گیرنده‌های بتا آدرنرژیک",
          detailedExplanation: "پروپرانولول و متوپرولول به صورت اختصاصی و غیراختصاصی عمل می‌کنند.",
          keyPoints: ["پروپرانولول غیراختصاصی", "متوپرولول بتا-۱ اختصاصی"],
          examTips: ["افت قند خون را ماسکه می‌کند"],
          structuredDetails: {
            mechanismOfAction: "مهار رقابتی گیرنده‌های بتا-۱ و بتا-۲",
            indications: ["پرفشاری خون", "آنژین صدری", "آریتمی"],
            adverseEffects: ["برادی‌کاردی", "اسپاسم برونش"],
          },
        },
        node_sub_1: {
          id: "node_sub_1",
          parentId: "node_branch_1",
          title: "پروپرانولول",
          shortDescription: "نمونه داروی نسل اول",
        },
        node_branch_2: {
          id: "node_branch_2",
          parentId: "root",
          title: "مهارکننده‌های ACE",
          shortDescription: "کاپتوپریل و انالاپریل",
        },
      },
    },
    userModifications: {
      deletedNodeIds: [],
      customNodes: {},
      overrides: {},
      customEdges: [
        {
          id: "ce-1",
          source: "node_sub_1",
          target: "node_branch_2",
        },
      ],
      nodePositions: {
        node_branch_1: { x: -280, y: -40 },
      },
    },
    userNotes: {
      node_sub_1: {
        noteText: "یادداشت شخصی: حتما در جلسه بعد مرور شود.",
        updatedAt: new Date().toISOString(),
      },
    },
  };

  beforeEach(() => {
    mockUserRole = "platform_admin";
    mockUserGlobalRole = null;
    vi.clearAllMocks();
  });

  describe("1. SVG Exporter (Vector Fidelity, Completeness & Custom Edges)", () => {
    it("generates valid standalone XML and SVG vector document", () => {
      const svg = exportMindMapToSvg(samplePayload, "فارماکولوژی قلب");

      expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('viewBox="');
      expect(svg).toContain('direction="rtl"');
      expect(svg).toContain('</svg>');
    });

    it("includes ALL nodes even if some branches were collapsed in the active view", () => {
      const svg = exportMindMapToSvg(samplePayload);

      // Root, branch 1, sub 1, branch 2
      expect(svg).toContain("فارماکولوژی سیستم قلبی");
      expect(svg).toContain("بتابلوکرها");
      expect(svg).toContain("پروپرانولول");
      expect(svg).toContain("مهارکننده‌های ACE");
      expect(svg).toContain('data-id="node_sub_1"');
    });

    it("renders structural hierarchy edges and custom user connections", () => {
      const svg = exportMindMapToSvg(samplePayload);

      // Structural edges
      expect(svg).toContain('class="mindmap-tree-edges"');
      // Custom user edge with dashed stroke
      expect(svg).toContain('class="mindmap-custom-edges"');
      expect(svg).toContain('stroke-dasharray="6,4"');
    });

    it("embeds Estedad font WOFF2 Base64 for offline fidelity", () => {
      const svg = exportMindMapToSvg(samplePayload);

      expect(svg).toContain("@font-face");
      expect(svg).toContain("font-family: 'Estedad'");
      expect(svg).toContain("data:font/woff2;charset=utf-8;base64,");
    });
  });

  describe("2. Offline Interactive HTML Exporter (Zero Dependencies, Search & XSS Safety)", () => {
    it("generates valid self-contained HTML with zero external network dependencies", () => {
      const html = exportMindMapToHtml(samplePayload, new Set(["node_branch_1"]), "فارماکولوژی", "فصل ۳");

      expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
      expect(html).toContain('<html lang="fa" dir="rtl">');
      expect(html).toContain("</script>");
      expect(html).toContain("</html>");

      // ZERO external CDN links or remote scripts
      expect(html).not.toContain('<script src="http');
      expect(html).not.toContain('<link rel="stylesheet" href="http');
      expect(html).not.toContain('googleapis.com');
      expect(html).not.toContain('cdnjs.cloudflare.com');
    });

    it("ensures expand/collapse indicators and buttons are completely absent from HTML", () => {
      const html = exportMindMapToHtml(samplePayload);

      // Verify no collapse badge elements or CSS
      expect(html).not.toContain("collapse-badge");
      expect(html).not.toContain("data-toggle-id");

      // Verify no expandAll or collapseAll buttons in toolbar
      expect(html).not.toContain("expandAllBtn");
      expect(html).not.toContain("collapseAllBtn");
      expect(html).not.toContain("باز کردن همه");
      expect(html).not.toContain("بستن همه");

      // Verify no activeCollapsed state in runtime script
      expect(html).not.toContain("activeCollapsed");
      expect(html).not.toContain('"initialCollapsed"');
    });

    it("ensures all nodes and subtrees are always rendered even if initialCollapsedNodeIds was passed", () => {
      const initialCollapsed = new Set(["node_branch_1"]);
      const html = exportMindMapToHtml(samplePayload, initialCollapsed);

      // All nodes including deep sub-nodes must be directly in the initial SVG markup
      expect(html).toContain('data-id="root"');
      expect(html).toContain('data-id="node_branch_1"');
      expect(html).toContain('data-id="node_sub_1"');
      expect(html).toContain('data-id="node_branch_2"');

      // Titles must all be present
      expect(html).toContain("فارماکولوژی سیستم قلبی");
      expect(html).toContain("بتابلوکرها");
      expect(html).toContain("پروپرانولول");
      expect(html).toContain("مهارکننده‌های ACE");
    });

    it("verifies search focusMatch selects and centers node without requiring uncollapsing ancestors", () => {
      const html = exportMindMapToHtml(samplePayload);

      expect(html).toContain("function focusMatch(index)");
      expect(html).toContain("selectedNodeId = targetId");
      expect(html).not.toContain("activeCollapsed.delete");
    });

    it("embeds rich educational details for Detail Drawer display", () => {
      const html = exportMindMapToHtml(samplePayload);

      expect(html).toContain("کنترااندیکاسیون بتابلوکر در آسم");
      expect(html).toContain("مهار رقابتی گیرنده‌های بتا-۱ و بتا-۲");
      expect(html).toContain("یادداشت شخصی: حتما در جلسه بعد مرور شود.");
      expect(html).toContain("drawerOverlay");
      expect(html).toContain("drawerTitle");
    });

    it("safely sanitizes potential XSS attempts in node titles or descriptions", () => {
      const maliciousPayload: MindMapPayload = {
        ...samplePayload,
        aiBase: {
          ...samplePayload.aiBase,
          nodes: {
            root: {
              id: "root",
              parentId: null,
              title: '<script>alert("XSS-TITLE")</script>',
              shortDescription: '<img src=x onerror="alert(1)">',
              detailedExplanation: '<iframe src="evil.com"></iframe>',
            },
            node_branch_1: {
              id: "node_branch_1",
              parentId: "root",
              title: '<b onmouseover=alert(1)>شاخه فرعی</b>',
              shortDescription: '<img src=x onerror="alert(1)">',
            },
          },
        },
      };

      const html = exportMindMapToHtml(
        maliciousPayload,
        new Set(),
        '<script>alert("XSS-TITLE")</script>',
        '<img src=x onerror="alert(1)">',
      );

      // Raw executable tags must not appear unescaped in HTML
      expect(html).not.toContain("<title><script>");
      expect(html).toContain("&lt;script&gt;alert(&quot;XSS-TITLE&quot;)&lt;/script&gt;");
      expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
      // Script tags inside embedded JSON data must be safely unicode escaped
      expect(html).toContain("\\u003cscript\\u003e");
      expect(html).toContain("\\u003c/script\\u003e");
    });

    it("validates that all exported JavaScript code has 100% valid syntax without parse errors", () => {
      const html = exportMindMapToHtml(samplePayload);
      const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
      expect(scriptMatch).not.toBeNull();
      const scriptCode = scriptMatch![1];

      // Verifies that the client engine is a valid IIFE that compiles cleanly
      expect(() => new Function(scriptCode)).not.toThrow();
    });

    it("verifies pointer events, setPointerCapture, and drag threshold in exported runtime engine", () => {
      const html = exportMindMapToHtml(samplePayload);

      // Pointer event registrations
      expect(html).toContain('container.addEventListener("pointerdown"');
      expect(html).toContain('container.addEventListener("pointermove"');
      expect(html).toContain('container.addEventListener("pointerup"');
      expect(html).toContain('container.addEventListener("pointercancel"');
      expect(html).toContain('window.addEventListener("pointerup"');
      expect(html).toContain('window.addEventListener("pointercancel"');

      // Pointer capture
      expect(html).toContain("container.setPointerCapture(activePointerId)");
      expect(html).toContain("container.releasePointerCapture(activePointerId)");

      // Movement threshold > 3px
      expect(html).toContain("Math.abs(dx) > 3 || Math.abs(dy) > 3");

      // Touch action none for canvas
      expect(html).toContain("touch-action: none;");
    });

    it("verifies cursor-anchored wheel zoom, scale boundaries (0.12 to 3.0), and passive: false", () => {
      const html = exportMindMapToHtml(samplePayload);

      // Wheel listener registered with passive: false to allow preventDefault
      expect(html).toContain('container.addEventListener("wheel"');
      expect(html).toContain("{ passive: false }");

      // Math for anchored zoom and bounds [0.12, 3.0]
      expect(html).toContain("Math.min(3.0, Math.max(0.12,");
      expect(html).toContain("e.deltaY < 0 ? 1.12 : 0.88");
      expect(html).toContain("e.clientX - rect.left");
      expect(html).toContain("e.clientY - rect.top");
    });

    it("verifies drag vs click separation so canvas drag suppresses opening node drawer", () => {
      const html = exportMindMapToHtml(samplePayload);

      // In click handler, hasDragged flag aborts opening drawer
      expect(html).toContain("if (hasDragged) {");
      expect(html).toContain("hasDragged = false;");
      expect(html).toContain("return;");

      // Node selection checks both node-group and data-node-id
      expect(html).toContain('e.target.closest(".node-group") || e.target.closest("[data-node-id]")');
    });

    it("verifies toolbar controls for zoom in/out, fit to view, and reset view", () => {
      const html = exportMindMapToHtml(samplePayload);

      expect(html).toContain('document.getElementById("zoomInBtn").addEventListener("click"');
      expect(html).toContain('document.getElementById("zoomOutBtn").addEventListener("click"');
      expect(html).toContain('document.getElementById("fitViewBtn").addEventListener("click"');
      expect(html).toContain('document.getElementById("resetViewBtn").addEventListener("click"');
    });
  });

  describe("3. UI Toolbar Export Button & Role-Based Guard in MindMapCanvas", () => {
    const mockHook: any = {
      payload: samplePayload,
      effectiveTree: {
        rootNodeId: "root",
        nodes: samplePayload.aiBase.nodes,
      },
      mindMapDto: {
        id: "mm-123",
        moduleId: "11111111-2222-4333-8444-555555555555",
        courseId: "99999999-8888-4777-8666-555555555555",
      },
      isGenerating: false,
      isSaving: false,
      saveStatus: "saved",
      isDirty: false,
      retrySave: vi.fn(),
      isExpanding: false,
      isResetting: false,
      generateMindMap: vi.fn(),
      expandNode: vi.fn(),
      resetToAiBase: vi.fn(),
      applyModification: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: false,
      canRedo: false,
      versions: [],
      currentVersion: 1,
      restoreVersion: vi.fn(),
      isRestoring: false,
      isLoadingVersions: false,
      selectedNodeId: null,
      setSelectedNodeId: vi.fn(),
      searchTerm: "",
      setSearchTerm: vi.fn(),
    };

    it("renders export button for platform_admin user", () => {
      mockUserRole = "platform_admin";
      render(<MindMapCanvas mindMapHook={mockHook} />);

      const exportBtn = screen.getByTestId("mindmap-export-button");
      expect(exportBtn).toBeDefined();
      expect(exportBtn.textContent).toContain("دریافت خروجی");
    });

    it("does NOT render export button for student user", () => {
      mockUserRole = "student";
      render(<MindMapCanvas mindMapHook={mockHook} />);

      const exportBtn = screen.queryByTestId("mindmap-export-button");
      expect(exportBtn).toBeNull();
    });

    it("does NOT render export button for organization_admin user", () => {
      mockUserRole = "organization_admin";
      render(<MindMapCanvas mindMapHook={mockHook} />);

      const exportBtn = screen.queryByTestId("mindmap-export-button");
      expect(exportBtn).toBeNull();
    });

    it("does NOT render export button for course_editor user", () => {
      mockUserRole = "course_editor";
      render(<MindMapCanvas mindMapHook={mockHook} />);

      const exportBtn = screen.queryByTestId("mindmap-export-button");
      expect(exportBtn).toBeNull();
    });

    it("opens dropdown with SVG and HTML offline options on export button click", () => {
      mockUserRole = "platform_admin";
      render(<MindMapCanvas mindMapHook={mockHook} />);

      const exportBtn = screen.getByTestId("mindmap-export-button");
      fireEvent.click(exportBtn);

      const svgOption = screen.getByTestId("export-svg-option");
      const htmlOption = screen.getByTestId("export-html-option");

      expect(svgOption).toBeDefined();
      expect(svgOption.textContent).toContain("دریافت SVG");
      expect(htmlOption).toBeDefined();
      expect(htmlOption.textContent).toContain("دریافت HTML آفلاین");
    });
  });

  describe("4. Export Utilities (Sanitization & Escaping)", () => {
    it("sanitizes filenames safely removing slashes and illegal characters", () => {
      expect(sanitizeFilename("فارماکولوژی / قلب: و عروق?", "mindmap.svg")).toBe("فارماکولوژی_-_قلب-_و_عروق-mindmap.svg");
      expect(sanitizeFilename("", "mindmap.html", "default")).toBe("default-mindmap.html");
    });

    it("escapes XML and HTML safely", () => {
      expect(escapeXml('<foo & "bar">')).toBe("&lt;foo &amp; &quot;bar&quot;&gt;");
      expect(escapeHtml("<script>alert('xss')</script>")).toBe("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
    });
  });

  describe("5. High-Fidelity Geometry, AABB Collision Avoidance & Text-Wrapping Tests", () => {
    interface NodeBox {
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }

    function extractNodeBoxesFromHtml(html: string): NodeBox[] {
      const boxes: NodeBox[] = [];
      const regex = /<g class="[^"]*node-group[^"]*" data-id="([^"]+)" transform="translate\(([^,]+),\s*([^)]+)\)">\s*<rect class="node-rect" width="([^"]+)" height="([^"]+)"/g;
      let match;
      while ((match = regex.exec(html)) !== null) {
        boxes.push({
          id: match[1],
          x: parseFloat(match[2]),
          y: parseFloat(match[3]),
          width: parseFloat(match[4]),
          height: parseFloat(match[5]),
        });
      }
      return boxes;
    }

    function checkAABBCollision(boxes: NodeBox[], minGap = 0): { collides: boolean; error?: string } {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];

          const overlapX = a.x < b.x + b.width - minGap && a.x + a.width > b.x + minGap;
          const overlapY = a.y < b.y + b.height - minGap && a.y + a.height > b.y + minGap;

          if (overlapX && overlapY) {
            return {
              collides: true,
              error: `Collision detected between "${a.id}" [x:${a.x}, y:${a.y}, w:${a.width}, h:${a.height}] and "${b.id}" [x:${b.x}, y:${b.y}, w:${b.width}, h:${b.height}] (horizontal overlap: ${Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)}px, vertical overlap: ${Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)}px)`,
            };
          }
        }
      }
      return { collides: false };
    }

    it("ensures initial layout has zero overlapping nodes (AABB collision test)", () => {
      const html = exportMindMapToHtml(samplePayload);
      const boxes = extractNodeBoxesFromHtml(html);
      expect(boxes.length).toBeGreaterThan(0);

      const collisionResult = checkAABBCollision(boxes);
      if (collisionResult.collides) {
        throw new Error(collisionResult.error);
      }
      expect(collisionResult.collides).toBe(false);
    });

    it("ensures deep tree layout with multiple hierarchical branches has zero overlapping nodes", () => {
      const deepPayload: MindMapPayload = {
        ...samplePayload,
        aiBase: {
          ...samplePayload.aiBase,
          nodes: {
            root: { id: "root", parentId: null, title: "ریشه اصلی فارماکولوژی" },
            b1: { id: "b1", parentId: "root", title: "شاخه اول" },
            b1_sub1: { id: "b1_sub1", parentId: "b1", title: "زیرشاخه ۱-۱" },
            b1_sub2: { id: "b1_sub2", parentId: "b1_sub1", title: "زیرشاخه ۱-۲" },
            b1_leaf: { id: "b1_leaf", parentId: "b1_sub2", title: "برگ عمیق ۱-۳" },
            b2: { id: "b2", parentId: "root", title: "شاخه دوم" },
            b2_sub1: { id: "b2_sub1", parentId: "b2", title: "زیرشاخه ۲-۱" },
            b2_sub2: { id: "b2_sub2", parentId: "b2_sub1", title: "زیرشاخه ۲-۲" },
            b3: { id: "b3", parentId: "root", title: "شاخه سوم" },
            b3_sub1: { id: "b3_sub1", parentId: "b3", title: "زیرشاخه ۳-۱" },
            b4: { id: "b4", parentId: "root", title: "شاخه چهارم" },
            b4_sub1: { id: "b4_sub1", parentId: "b4", title: "زیرشاخه ۴-۱" },
          },
        },
      };

      const html = exportMindMapToHtml(deepPayload);
      const boxes = extractNodeBoxesFromHtml(html);
      expect(boxes.length).toBe(12);

      const collision = checkAABBCollision(boxes);
      if (collision.collides) {
        throw new Error(collision.error);
      }
      expect(collision.collides).toBe(false);
    });

    it("ensures asymmetric branches (left-heavy vs right-light) has zero overlapping nodes", () => {
      const asymmetricPayload: MindMapPayload = {
        ...samplePayload,
        aiBase: {
          ...samplePayload.aiBase,
          nodes: {
            root: { id: "root", parentId: null, title: "ریشه نامتقارن" },
            heavy_branch: { id: "heavy_branch", parentId: "root", title: "شاخه سنگین با فرزندان زیاد" },
            h_c1: { id: "h_c1", parentId: "heavy_branch", title: "فرزند ۱" },
            h_c2: { id: "h_c2", parentId: "heavy_branch", title: "فرزند ۲" },
            h_c3: { id: "h_c3", parentId: "heavy_branch", title: "فرزند ۳" },
            h_c4: { id: "h_c4", parentId: "heavy_branch", title: "فرزند ۴" },
            h_c5: { id: "h_c5", parentId: "heavy_branch", title: "فرزند ۵" },
            h_c6: { id: "h_c6", parentId: "heavy_branch", title: "فرزند ۶" },
            light_branch: { id: "light_branch", parentId: "root", title: "شاخه سبک تک‌فرزند" },
            l_c1: { id: "l_c1", parentId: "light_branch", title: "تک‌فرزند" },
          },
        },
      };

      const html = exportMindMapToHtml(asymmetricPayload);
      const boxes = extractNodeBoxesFromHtml(html);
      expect(boxes.length).toBe(10);

      const collision = checkAABBCollision(boxes);
      if (collision.collides) {
        throw new Error(collision.error);
      }
      expect(collision.collides).toBe(false);
    });

    it("ensures nodes with multi-line long descriptions and short titles (height > 100px) do not collide with adjacent nodes", () => {
      const multiLinePayload: MindMapPayload = {
        ...samplePayload,
        aiBase: {
          ...samplePayload.aiBase,
          nodes: {
            root: { id: "root", parentId: null, title: "فارماکولوژی قلب" },
            b1: {
              id: "b1",
              parentId: "root",
              title: "داروی A",
              shortDescription: "این یک توضیح بسیار طولانی و جامع پیرامون مکانیسم عمل داروی نسل اول است که دارای چندین خط متوالی است و باید به طور کامل در چند خط شکسته شود و به هیچ وجه نباید از باکس بیرون بزند.",
            },
            b2: {
              id: "b2",
              parentId: "root",
              title: "داروی B",
              shortDescription: "توضیح تفصیلی دیگری که شامل نکات بالینی، اندیکاسیون‌ها، دوز مصرفی و عوارض جانبی مهم نظیر برادی‌کاردی و افت فشار خون وضعیتی در سالمندان است.",
            },
            b3: {
              id: "b3",
              parentId: "root",
              title: "داروی C",
              shortDescription: "مهارکننده اختصاصی با نیمه‌عمر طولانی مناسب برای مصرف یک‌بار در روز و کنترل فشار خون در بیماران دیابتی همراه با پروتئینوری کلیوی.",
            },
            b4: {
              id: "b4",
              parentId: "root",
              title: "داروی D",
              shortDescription: "توضیحات کوتاه معمولی",
            },
          },
        },
      };

      const html = exportMindMapToHtml(multiLinePayload);
      const boxes = extractNodeBoxesFromHtml(html);
      expect(boxes.length).toBe(5);

      // Verify that multi-line nodes have height > 80px calculated from calculateNodeDimensions
      const b1Box = boxes.find((b) => b.id === "b1");
      expect(b1Box).toBeDefined();
      expect(b1Box!.height).toBeGreaterThan(80);

      const collision = checkAABBCollision(boxes);
      if (collision.collides) {
        throw new Error(collision.error);
      }
      expect(collision.collides).toBe(false);
    });

    it("ensures all nodes remain visible and collision-free regardless of any initial collapsed input", () => {
      // 1. Initial without collapsed set
      const html1 = exportMindMapToHtml(samplePayload, new Set());
      const boxes1 = extractNodeBoxesFromHtml(html1);
      expect(boxes1.length).toBe(4);
      const c1 = checkAABBCollision(boxes1);
      expect(c1.collides).toBe(false);

      // 2. Caller passes branch 1 in set (should be ignored, all nodes rendered)
      const html2 = exportMindMapToHtml(samplePayload, new Set(["node_branch_1"]));
      const boxes2 = extractNodeBoxesFromHtml(html2);
      expect(boxes2.length).toBe(4);
      expect(boxes2.some((b) => b.id === "node_sub_1")).toBe(true);
      const c2 = checkAABBCollision(boxes2);
      expect(c2.collides).toBe(false);

      // 3. Caller passes multiple branches in set (all nodes still rendered)
      const html3 = exportMindMapToHtml(samplePayload, new Set(["node_branch_1", "node_branch_2"]));
      const boxes3 = extractNodeBoxesFromHtml(html3);
      expect(boxes3.length).toBe(4);
      const c3 = checkAABBCollision(boxes3);
      expect(c3.collides).toBe(false);
    });

    it("verifies <foreignObject> uses white-space: normal, word-break: break-word, overflow-wrap: anywhere and valid dimensions", () => {
      const html = exportMindMapToHtml(samplePayload);

      // CSS must have text wrapping rules
      expect(html).toContain("white-space: normal");
      expect(html).toContain("word-break: break-word");
      expect(html).toContain("overflow-wrap: anywhere");
      expect(html).toContain(".node-foreign-object");
      expect(html).toContain(".node-card-content");
      expect(html).toContain("<foreignObject");

      // Verify foreignObject dimensions match rect dimensions
      const foMatch = /<foreignObject class="node-foreign-object" x="0" y="0" width="([^"]+)" height="([^"]+)">/.exec(html);
      expect(foMatch).not.toBeNull();
      const foW = parseFloat(foMatch![1]);
      const foH = parseFloat(foMatch![2]);
      expect(foW).toBeGreaterThan(100);
      expect(foH).toBeGreaterThan(40);
    });
  });

  describe("6. Header Duplicate Title Removal & Shared Branch Paths Parity", () => {
    it("removes duplicate chapterTitle badge from toolbar header and preserves green brand badge", () => {
      const chapterTitle = "فصل ۳: فارماکولوژی قلب و عروق";
      const html = exportMindMapToHtml(samplePayload, new Set(), chapterTitle, chapterTitle);

      // Verify brand-badge exists with the chapter title
      expect(html).toContain('<div class="brand-badge">');
      expect(html).toContain(`<span>${escapeHtml(chapterTitle)}</span>`);

      // Extract the header toolbar-start block
      const toolbarStartMatch = html.match(/<div class="toolbar-start">([\s\S]*?)<\/div>\s*<div class="toolbar-start">/);
      expect(toolbarStartMatch).not.toBeNull();
      const toolbarStart = toolbarStartMatch![1];

      // Chapter title must appear EXACTLY ONCE inside the first toolbar-start
      const occurrences = (toolbarStart.match(new RegExp(escapeHtml(chapterTitle), "g")) || []).length;
      expect(occurrences).toBe(1);

      // Must not contain any secondary badge or duplicate span
      expect(toolbarStart).not.toContain("secondary-title");
      expect(toolbarStart).not.toContain("color:#94a3b8");
    });

    it("verifies sibling branches on the same side share identical trunkX and bifurcation stem without gaps", () => {
      const multiSiblingPayload: MindMapPayload = {
        ...samplePayload,
        aiBase: {
          ...samplePayload.aiBase,
          nodes: {
            root: { id: "root", parentId: null, title: "ریشه" },
            c1: { id: "c1", parentId: "root", title: "شاخه اول" },
            c2: { id: "c2", parentId: "root", title: "شاخه دوم" },
            c3: { id: "c3", parentId: "root", title: "شاخه سوم" },
          },
        },
      };

      const html = exportMindMapToHtml(multiSiblingPayload);

      // Extract all edge path 'd' attributes
      const edgeRegex = /<path class="edge-path" data-edge-id="([^"]+)" d="([^"]+)"/g;
      const edges: Record<string, string> = {};
      let match;
      while ((match = edgeRegex.exec(html)) !== null) {
        edges[match[1]] = match[2];
      }

      // Root has children c1, c2, c3
      expect(edges["e-root-c1"]).toBeDefined();
      expect(edges["e-root-c2"]).toBeDefined();
      expect(edges["e-root-c3"]).toBeDefined();

      const parseTrunkX = (d: string) => {
        const m = d.match(/^M\s+[\d.-]+\s+[\d.-]+\s+H\s+([\d.-]+)/);
        return m ? parseFloat(m[1]) : null;
      };

      const sideOf = (d: string) => {
        const parts = d.split("H");
        const startX = parseFloat(d.split(" ")[1]);
        const trunk = parseFloat(parts[1]);
        return trunk < startX ? "left" : "right";
      };

      const groupedBySide: Record<string, number[]> = {};
      for (const [id, pathD] of Object.entries(edges)) {
        if (!id.startsWith("e-root-")) continue;
        const side = sideOf(pathD);
        const trunk = parseTrunkX(pathD)!;
        groupedBySide[side] = groupedBySide[side] || [];
        groupedBySide[side].push(trunk);
      }

      for (const [side, trunks] of Object.entries(groupedBySide)) {
        if (trunks.length > 1) {
          // All siblings on this side MUST have strictly equal trunkX
          for (let i = 1; i < trunks.length; i++) {
            expect(trunks[i]).toBeCloseTo(trunks[0], 2);
          }
        }
      }
    });

    it("verifies 100% path and coordinate parity between treeLayout.ts and HTML export", () => {
      const effective = computeEffectiveMindMap(samplePayload);
      // Run computeRtlTreeLayout on effective mindmap with identical options
      const { edges: layoutEdges } = computeRtlTreeLayout(effective.rootNodeId, effective.nodes, {
        nodePositions: samplePayload.userModifications?.nodePositions,
      });

      // Generate HTML export
      const html = exportMindMapToHtml(samplePayload);

      // Extract all edge path 'd' attributes from exported HTML
      const edgeRegex = /<path class="edge-path" data-edge-id="([^"]+)" d="([^"]+)"/g;
      const htmlEdges: Record<string, string> = {};
      let match;
      while ((match = edgeRegex.exec(html)) !== null) {
        htmlEdges[match[1]] = match[2];
      }

      // Assert parity for every structural edge
      for (const le of layoutEdges) {
        const htmlPath = htmlEdges[le.id];
        expect(htmlPath).toBeDefined();
        // Path string must match identically
        expect(htmlPath).toBe((le.data as any)?.path);
      }
    });

    it("validates client-side JavaScript engine contains routeSharedBranchGroup and no naive midpoint trunks", () => {
      const html = exportMindMapToHtml(samplePayload);
      const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
      expect(scriptMatch).not.toBeNull();
      const script = scriptMatch![1];

      // Must have shared branch router functions injected
      expect(script).toContain("function routeSharedBranchGroup(");
      expect(script).toContain("function lineSegmentIntersectsBoxInterior(");

      // Must NOT contain direct naive orthogonal routing for child nodes in renderGraph
      expect(script).not.toContain("edgesHtml += `<path d=\"${createOrthogonalPath(");

      // Verifies that edgesLayer rendering uses routeSharedBranchGroup
      expect(script).toContain('routeSharedBranchGroup(parentBox, leftChildren, "left", allBoxes, 12)');
      expect(script).toContain('routeSharedBranchGroup(parentBox, rightChildren, "right", allBoxes, 12)');
    });
  });

  describe("7. AVANA Official Brand Logo & Website Link in HTML Export", () => {
    it("embeds official Avana Inline SVG logo in header toolbar with 100% offline Data URI", () => {
      const html = exportMindMapToHtml(samplePayload);

      // Verify presence of brand-link in header
      expect(html).toContain('class="brand-link"');
      expect(html).toContain('class="brand-logo"');
      expect(html).toContain('viewBox="0 0 512 346"');

      // Verify embedded high-res Data URI inside SVG (no external network asset required)
      expect(html).toContain('<image width="512" height="346" href="data:image/png;base64,');

      // Verify logo has zero external image dependencies
      expect(html).not.toContain('<image width="512" height="346" href="http');
      expect(html).not.toContain('<img src="http');
    });

    it("renders valid, clickable link to https://aavana.ir with security attributes", () => {
      const html = exportMindMapToHtml(samplePayload);

      // Verify aavana.ir link and display text
      expect(html).toContain('href="https://aavana.ir"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain('aavana.ir');

      // Verify branding is in header toolbar and NOT inside canvas-container
      const toolbarIndex = html.indexOf('<header class="toolbar">');
      const canvasIndex = html.indexOf('<main class="canvas-container"');
      const linkIndex = html.indexOf('href="https://aavana.ir"');

      expect(toolbarIndex).toBeGreaterThan(-1);
      expect(canvasIndex).toBeGreaterThan(toolbarIndex);
      expect(linkIndex).toBeGreaterThan(toolbarIndex);
      expect(linkIndex).toBeLessThan(canvasIndex);
    });

    it("ensures zero external network dependencies for CSS, scripts, fonts, and images", () => {
      const html = exportMindMapToHtml(samplePayload);

      // Zero external script imports
      expect(html).not.toContain('<script src="http');
      expect(html).not.toContain('<script src="//');

      // Zero external stylesheet links
      expect(html).not.toContain('<link rel="stylesheet"');

      // Zero external image sources
      expect(html).not.toContain('<img src="http');
      expect(html).not.toContain('<image href="http');

      // Fonts are embedded via base64 WOFF2
      expect(html).toContain("data:font/woff2;charset=utf-8;base64,");
    });

    it("verifies responsive mobile toolbar CSS rules are present", () => {
      const html = exportMindMapToHtml(samplePayload);

      expect(html).toContain("@media (max-width: 768px)");
      expect(html).toContain("@media (max-width: 540px)");
      expect(html).toContain(".brand-link");
      expect(html).toContain(".brand-logo");
      expect(html).toContain(".brand-url");
    });

    it("preserves 100% of mindmap data, deep hierarchy, and chemical structures", () => {
      const chemicalPayload = {
        aiBase: {
          rootNodeId: "root",
          nodes: {
            root: {
              id: "root",
              parentId: null,
              title: "داروشناسی بالینی",
              shortDescription: "مرور ساختارها",
              depth: 0,
              isRoot: true,
            },
            node_chem_1: {
              id: "node_chem_1",
              parentId: "root",
              title: "سفالکسین",
              shortDescription: "آنتی‌بیوتیک بتالاکتام",
              detailedExplanation: "ساختار شیمیایی دارای حلقه بتا-لاکتام متصل به حلقه دی‌هیدروتیازین.",
              chemicalStatus: "enriched",
              chemicalStructure: {
                smiles: "CC1=C(N2C(C(NC(=O)C(N)C3=CC=CC=C3)C2=O)SC1)C(=O)O",
                formula: "C16H17N3O4S",
                molecularWeight: 347.39,
                svg: "<svg class='chemical-structure-preview' viewBox='0 0 200 150'><path d='M10 10 L50 50'/></svg>",
                isValidated: true,
                confidence: "high",
              },
              depth: 1,
            },
          },
        },
      };

      const html = exportMindMapToHtml(chemicalPayload as unknown as MindMapPayload);

      // Brand is present
      expect(html).toContain("aavana.ir");
      expect(html).toContain('class="brand-logo"');

      // Chemical and tree data are 100% preserved
      expect(html).toContain("سفالکسین");
      expect(html).toContain("آنتی‌بیوتیک بتالاکتام");
      expect(html).toContain("C16H17N3O4S");
      expect(html).toContain("CC1=C(N2C(C(NC(=O)C(N)C3=CC=CC=C3)C2=O)SC1)C(=O)O");
    });
  });

  describe("8. Offline Chemical Structure Vector SVG Export in Interactive HTML Exporter", () => {
    it("renders valid offline inline vector SVG and compound metadata for nodes with verified chemical structures (Aspirin & Lidocaine)", () => {
      const payloadWithChemistry: MindMapPayload = {
        kind: "mind_map",
        version: 1,
        sourceType: "lessons",
        sourceId: "source-chem-1",
        updatedAt: new Date().toISOString(),
        aiBase: {
          rootNodeId: "root_chem",
          generatedAt: new Date().toISOString(),
          model: "gemini",
          nodes: {
            root_chem: {
              id: "root_chem",
              parentId: null,
              title: "شیمی دارویی ضددردها",
              shortDescription: "بررسی داروهای ضدالتهاب و بی‌حس‌کننده‌های موضعی",
            },
            node_aspirin: {
              id: "node_aspirin",
              parentId: "root_chem",
              title: "آسپرین (استیل‌سالیسیلیک اسید)",
              shortDescription: "داروی ضدالتهاب غیراستروئیدی (NSAID)",
              detailedExplanation: "مهارکننده برگشت‌ناپذیر آنزیم‌های سیکلواکسیژناز (COX-1 و COX-2).",
              chemicalStructure: {
                compoundName: "Aspirin",
                canonicalName: "acetylsalicylic acid",
                smiles: "CC(=O)Oc1ccccc1C(=O)O",
                formula: "C9H8O4",
                molecularWeight: 180.16,
                drugClass: "NSAID",
                iupacName: "2-acetyloxybenzoic acid",
                educationalNote: "استیلاسیون سرین ۵۳۰ در جایگاه فعال آنزیم COX-1.",
                isValidated: true,
                sarHighlights: [
                  { targetName: "گروه استیل", importance: "عامل استیلاسیون برگشت‌ناپذیر COX" },
                  { targetName: "کربوکسیلات آزاد", importance: "برهم‌کنش یونی با آرژینین ۱۲۰" },
                ],
              },
            },
            node_lidocaine: {
              id: "node_lidocaine",
              parentId: "root_chem",
              title: "لیدوکائین",
              shortDescription: "بی‌حس‌کننده موضعی از دسته آمیدها",
              chemicalStructure: {
                compoundName: "Lidocaine",
                smiles: "CCN(CC)CC(=O)Nc1c(C)cccc1C",
                formula: "C14H22N2O",
                molecularWeight: 234.34,
                drugClass: "Local Anesthetic",
                isValidated: true,
              },
            },
          },
        },
      };

      const html = exportMindMapToHtml(payloadWithChemistry);

      // Verify HTML document structure
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("chemical-structure-card");
      expect(html).toContain("chemical-svg-viewport");

      // Verify compound names and formula are safely embedded
      expect(html).toContain("Aspirin");
      expect(html).toContain("C9H8O4");
      expect(html).toContain("180.16");
      expect(html).toContain("NSAID");
      expect(html).toContain("2-acetyloxybenzoic acid");
      expect(html).toContain("استیلاسیون سرین ۵۳۰");
      expect(html).toContain("Lidocaine");
      expect(html).toContain("C14H22N2O");

      // Verify inline vector SVG markup was generated
      expect(html).toContain("<svg");
      expect(html).toContain("viewBox=");

      // Verify pure offline: NO CDN, no remote script tags
      expect(html).not.toMatch(/https?:\/\/[^"']+\.js/);
      expect(html).not.toContain("unpkg.com");
      expect(html).not.toContain("cdnjs.cloudflare.com");
      expect(html).not.toContain("cdn.jsdelivr.net");

      // Verify strict XSS safety
      expect(html).not.toContain("<script>alert");
    });

    it("gracefully handles invalid/malformed SMILES without crashing and shows friendly error viewport in drawer", () => {
      const payloadWithMalformedSmiles: MindMapPayload = {
        kind: "mind_map",
        version: 1,
        sourceType: "lessons",
        sourceId: "source-chem-err",
        updatedAt: new Date().toISOString(),
        aiBase: {
          rootNodeId: "root_err",
          generatedAt: new Date().toISOString(),
          model: "gemini",
          nodes: {
            root_err: {
              id: "root_err",
              parentId: null,
              title: "داروی تست خطا",
              shortDescription: "تست SMILES نامعتبر",
            },
            node_malformed: {
              id: "node_malformed",
              parentId: "root_err",
              title: "مولکول نامعتبر",
              shortDescription: "این ترکیب دارای فرمت ساختاری غیراستاندارد است",
              chemicalStructure: {
                compoundName: "InvalidCompound",
                smiles: "INVALID_MALFORMED_SMILES%%%$$$",
                formula: "Unknown",
                drugClass: "Unknown",
                isValidated: false,
              },
            },
          },
        },
      };

      // Must NOT throw
      let html = "";
      expect(() => {
        html = exportMindMapToHtml(payloadWithMalformedSmiles);
      }).not.toThrow();

      // Drawer template contains error fallback viewport
      expect(html).toContain("chemical-error-viewport");
      expect(html).toContain("امکان ترسیم ساختار مولکولی وجود ندارد");
      expect(html).toContain("InvalidCompound");
    });

    it("preserves normal layout and drawer behavior for nodes without chemical structure", () => {
      const payloadNoChemistry: MindMapPayload = {
        kind: "mind_map",
        version: 1,
        sourceType: "lessons",
        sourceId: "source-regular",
        updatedAt: new Date().toISOString(),
        aiBase: {
          rootNodeId: "root_plain",
          generatedAt: new Date().toISOString(),
          model: "gemini",
          nodes: {
            root_plain: {
              id: "root_plain",
              parentId: null,
              title: "فیزیولوژی کلیه",
              shortDescription: "مرور عملکرد نفرون و فیلتراسیون گلومرولی",
              detailedExplanation: "شرح جامع تنظیم فشار خون و تعادل آب و الکترولیت.",
            },
          },
        },
      };

      const html = exportMindMapToHtml(payloadNoChemistry);
      expect(html).toContain("فیزیولوژی کلیه");
      expect(html).toContain("مرور عملکرد نفرون و فیلتراسیون گلومرولی");
      // Standard drawer and graph intact
      expect(html).toContain("drawerBody");
      expect(html).not.toContain('"chemicalSvg"');
      expect(html).not.toContain('"chemicalStructure"');
    });
  });

  describe("Section 9: Strict SVG Security Sanitizer & Vector Fidelity", () => {
    it("preserves valid SmilesDrawer molecular vector SVG with masks, lines, texts, and polygons", () => {
      const validSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 380 220" style="max-height: 220px; width: 100%;">
        <defs>
          <mask id="smiles-text-mask-123">
            <rect x="0" y="0" width="380" height="220" fill="white" />
            <circle cx="50" cy="50" r="12" fill="black" />
          </mask>
        </defs>
        <g id="smiles-drawer-mol-1">
          <line x1="20" y1="20" x2="80" y2="80" stroke="#0f172a" stroke-width="1.8" mask="url(#smiles-text-mask-123)" />
          <polygon points="10,10 20,20 15,30" fill="#0f172a" />
          <text x="50" y="50" font-family="Arial" font-size="11" fill="#e11d48">O</text>
        </g>
      </svg>`;

      const sanitized = sanitizeChemicalSvg(validSvg);
      expect(sanitized).not.toBeNull();
      expect(sanitized).toContain('mask="url(#smiles-text-mask-123)"');
      expect(sanitized).toContain('id="smiles-text-mask-123"');
      expect(sanitized).toContain("<line");
      expect(sanitized).toContain("<polygon");
      expect(sanitized).toContain("<text");
      expect(sanitized).toContain("O</text>");
    });

    it("blocks <script> tags and execution vectors", () => {
      const malicious = `<svg xmlns="http://www.w3.org/2000/svg">
        <script>alert('XSS')</script>
        <circle cx="10" cy="10" r="5" />
      </svg>`;
      const sanitized = sanitizeChemicalSvg(malicious);
      expect(sanitized).not.toBeNull();
      expect(sanitized).not.toContain("<script");
      expect(sanitized).not.toContain("alert");
      expect(sanitized).toContain("<circle");
    });

    it("strips on* event handlers (onload, onerror, onclick, etc.)", () => {
      const malicious = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
        <line x1="0" y1="0" x2="10" y2="10" onerror="alert(2)" onclick="alert(3)" stroke="#000" />
      </svg>`;
      const sanitized = sanitizeChemicalSvg(malicious);
      expect(sanitized).not.toBeNull();
      expect(sanitized).not.toContain("onload");
      expect(sanitized).not.toContain("onerror");
      expect(sanitized).not.toContain("onclick");
      expect(sanitized).not.toContain("alert");
    });

    it("removes <foreignObject>, <iframe>, <image>, and <a> tags", () => {
      const malicious = `<svg xmlns="http://www.w3.org/2000/svg">
        <foreignObject width="100" height="100">
          <body xmlns="http://www.w3.org/1999/xhtml">
            <script>alert(1)</script>
            <div>evil content</div>
          </body>
        </foreignObject>
        <image href="https://attacker.com/leak.png" />
        <a href="javascript:alert('XSS')"><text>Click</text></a>
      </svg>`;
      const sanitized = sanitizeChemicalSvg(malicious);
      expect(sanitized).not.toBeNull();
      expect(sanitized).not.toContain("<foreignObject");
      expect(sanitized).not.toContain("<iframe");
      expect(sanitized).not.toContain("<image");
      expect(sanitized).not.toContain("<a");
      expect(sanitized).not.toContain("attacker.com");
      expect(sanitized).not.toContain("javascript:");
    });

    it("removes dangerous CSS injection and expressions in style attribute", () => {
      const malicious = `<svg xmlns="http://www.w3.org/2000/svg">
        <g style="background: url('javascript:alert(1)'); color: red;"></g>
        <path d="M0 0 L10 10" style="behavior: url(xss.htc); width: 10px;" />
      </svg>`;
      const sanitized = sanitizeChemicalSvg(malicious);
      expect(sanitized).not.toBeNull();
      expect(sanitized).not.toContain("javascript:");
      expect(sanitized).not.toContain("behavior:");
    });

    it("rejects mask attributes with invalid or non-existent target IDs", () => {
      const malicious = `<svg xmlns="http://www.w3.org/2000/svg">
        <line x1="0" y1="0" x2="10" y2="10" mask="url(#non-existent-mask-id)" />
        <circle cx="5" cy="5" r="2" mask="url(https://attacker.com/mask.svg#id)" />
      </svg>`;
      const sanitized = sanitizeChemicalSvg(malicious);
      expect(sanitized).not.toBeNull();
      expect(sanitized).not.toContain("mask=");
      expect(sanitized).not.toContain("attacker.com");
    });

    it("strips duplicate element IDs to prevent DOM clobbering", () => {
      const duplicateIdSvg = `<svg xmlns="http://www.w3.org/2000/svg">
        <mask id="dup-id"><rect fill="white"/></mask>
        <mask id="dup-id"><circle fill="black"/></mask>
      </svg>`;
      const sanitized = sanitizeChemicalSvg(duplicateIdSvg);
      expect(sanitized).not.toBeNull();
      const occurrences = (sanitized!.match(/id="dup-id"/g) || []).length;
      expect(occurrences).toBe(1);
    });

    it("rejects invalid XML or non-SVG root and returns null (never raw un-sanitized string)", () => {
      expect(sanitizeChemicalSvg("<invalid xml >>><<<")).toBeNull();
      expect(sanitizeChemicalSvg("<div>not an svg</div>")).toBeNull();
      expect(sanitizeChemicalSvg('<svg xmlns="http://www.w3.org/1999/xhtml"></svg>')).toBeNull();
      expect(sanitizeChemicalSvg("")).toBeNull();
      expect(sanitizeChemicalSvg(null)).toBeNull();
    });
  });
});
