import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CourseReviewSummaryView } from "../components/documents/CourseReviewSummaryView.js";
import type { MindMapDto } from "@avana/contracts";

// Mocks
const mockGetReviewSummary = vi.fn();
const mockListDocuments = vi.fn();
const mockGetPersonalSummary = vi.fn();
const mockGetMindMap = vi.fn();
const mockGenerateMindMap = vi.fn();
const mockUpdateMindMap = vi.fn();
const mockExpandMindMapNode = vi.fn();
const mockResetMindMap = vi.fn();
const mockListVersions = vi.fn().mockResolvedValue({ versions: [], currentVersion: 0 });
const mockRestoreVersion = vi.fn();

vi.mock("../lib/api/generation.js", () => ({
  createGenerationApi: () => ({
    getReviewSummary: mockGetReviewSummary,
  }),
}));

vi.mock("../lib/api/documents.js", () => ({
  createDocumentsApi: () => ({
    listDocuments: mockListDocuments,
  }),
}));

vi.mock("../lib/api/personal-summary.js", () => ({
  createPersonalSummaryApi: () => ({
    getPersonalSummary: mockGetPersonalSummary,
  }),
}));

vi.mock("../lib/api/mind-map.js", () => ({
  createMindMapApi: () => ({
    getMindMap: mockGetMindMap,
    generateMindMap: mockGenerateMindMap,
    updateMindMap: mockUpdateMindMap,
    expandNode: mockExpandMindMapNode,
    resetToAiBase: mockResetMindMap,
    resetMindMap: mockResetMindMap,
    listVersions: mockListVersions,
    restoreVersion: mockRestoreVersion,
  }),
}));

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "user-123", email: "student@avana.ir" },
    memberships: [],
  })),
}));

// Mock @xyflow/react components to render in jsdom
vi.mock("@xyflow/react", () => {
  return {
    ReactFlow: ({ nodes, children }: any) => (
      <div data-testid="react-flow-mock">
        <div data-testid="rf-nodes-count">{nodes?.length ?? 0} nodes</div>
        {nodes?.map((n: any) => (
          <div key={n.id} data-testid={`rf-node-${n.id}`}>
            {n.data?.title || n.data?.node?.title || n.data?.label}
          </div>
        ))}
        {children}
      </div>
    ),
    ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
    useReactFlow: () => ({
      fitView: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      setCenter: vi.fn(),
      getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
      setViewport: vi.fn(),
    }),
    useNodesState: (initial: any) => [initial, vi.fn(), vi.fn()],
    useEdgesState: (initial: any) => [initial, vi.fn(), vi.fn()],
    Position: {
      Right: "right",
      Left: "left",
      Top: "top",
      Bottom: "bottom",
    },
    ConnectionMode: {
      Loose: "loose",
      Strict: "strict",
    },
    Handle: () => <div data-testid="flow-handle" />,
  };
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockModules = [
  {
    id: "mod-1",
    title: "فصل اول: بیوشیمی کربوهیدرات‌ها",
    document_id: "doc-1",
    sort_order: 1,
  },
];

const mockSampleMindMapDto: MindMapDto = {
  id: "mm-1",
  userId: "user-123",
  moduleId: "mod-1",
  version: 1,
  status: "completed",
  costToman: 0,
  createdAt: "2026-11-03T10:00:00Z",
  updatedAt: "2026-11-03T10:00:00Z",
  payload: {
    version: 1,
    sourceType: "reference_document",
    sourceLanguage: "fa",
    aiBase: {
      rootNodeId: "node_carbs",
      nodes: {
        node_carbs: {
          id: "node_carbs",
          parentId: null,
          title: "بیوشیمی کربوهیدرات‌ها",
          shortDescription: "مقدمه ساختار و انواع قندها",
          keyPoints: ["منبع اصلی انرژی سلولی"],
          examTips: ["تفاوت ساختار D و L پرتکرار است"],
          order: 0,
        },
        node_monosaccharides: {
          id: "node_monosaccharides",
          parentId: "node_carbs",
          title: "مونوساکاریدها",
          shortDescription: "ساده‌ترین قندها",
          keyPoints: ["گلوکز، فروکتوز و گالاکتوز"],
          examTips: ["گلوکز آلدوز و فروکتوز کتوز است"],
          order: 0,
        },
        node_disaccharides: {
          id: "node_disaccharides",
          parentId: "node_carbs",
          title: "دی‌ساکاریدها",
          shortDescription: "قندهای دوتایی",
          keyPoints: ["ساکارز، لاکتوز و مالتوز"],
          examTips: ["پیوند گلیکوزیدی لاکتوز بتا ۱ به ۴ است"],
          order: 1,
        },
      },
    },
    userModifications: {
      addedNodes: {},
      modifiedNodes: {},
      deletedNodeIds: [],
    },
    userNotes: {
      node_monosaccharides: {
        note: "یادداشت من: این مبحث در آزمون دستیاری ۱۴۰۲ آمده بود",
        updatedAt: "2026-11-03T11:00:00Z",
      },
    },
    createdAt: "2026-11-03T10:00:00Z",
    updatedAt: "2026-11-03T10:00:00Z",
  },
};

describe("Interactive AI Mind Map UI & Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Renders empty Mind Map CTA card when personal summary tab is opened and no mind map exists", async () => {
    mockGetReviewSummary.mockResolvedValue({
      content: {
        id: "gen-1",
        status: "draft",
        payload: {
          kind: "review_summary",
          title: "خلاصه رسمی بیوشیمی",
          sections: [{ title: "مقدمه", keyPoints: ["نکته ۱"] }],
        },
      },
    });

    mockGetPersonalSummary.mockResolvedValue({
      has_personal_summary: true,
      summary: {
        id: "p-1",
        userId: "user-123",
        moduleId: "mod-1",
        version: 1,
        status: "completed",
        payload: {
          kind: "review_summary",
          title: "خلاصه شخصی من",
          sections: [{ title: "نکات من", keyPoints: ["نکته شخصی"] }],
        },
        highlightsCount: 2,
        notesCount: 1,
      },
      current_annotations: { total_count: 3 },
    });

    mockGetMindMap.mockResolvedValue({
      has_mind_map: false,
      mind_map: null,
      source_available: true,
      source_type: "reference_document",
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={mockModules}
      />,
      { wrapper: createWrapper() },
    );

    // Verify Mind Map tab exists and switch to it
    const mindMapTab = await screen.findByRole("tab", { name: /نقشه مفهومی/ });
    expect(mindMapTab).toBeDefined();
    fireEvent.click(mindMapTab);

    // Should see CTA card to generate Mind Map
    expect(
      await screen.findByText(/نقشه مفهومی هوشمند \(Interactive AI Mind Map\)/),
    ).toBeDefined();
    expect(screen.getByText("رایگان (۰ تومان)")).toBeDefined();
    expect(screen.getByText("ساخت نقشه مفهومی با هوش مصنوعی")).toBeDefined();
  });

  it("Renders Mind Map canvas with nodes when mind map is available", async () => {
    mockGetReviewSummary.mockResolvedValue({ content: null });

    mockGetPersonalSummary.mockResolvedValue({
      has_personal_summary: false,
      summary: null,
      current_annotations: { total_count: 0 },
    });

    mockGetMindMap.mockResolvedValue({
      has_mind_map: true,
      mind_map: mockSampleMindMapDto,
      source_available: true,
      source_type: "reference_document",
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={mockModules}
      />,
      { wrapper: createWrapper() },
    );

    // Since only mind map exists, auto-switches to personal tab and mind map view
    expect(await screen.findByTestId("react-flow-mock")).toBeDefined();
    expect(screen.getByText("3 nodes")).toBeDefined();
    expect(screen.getByText("بیوشیمی کربوهیدرات‌ها")).toBeDefined();
    expect(screen.getByText("مونوساکاریدها")).toBeDefined();
    expect(screen.getByText("دی‌ساکاریدها")).toBeDefined();
  });

  it("Triggers generateMindMap on CTA button click", async () => {
    mockGetReviewSummary.mockResolvedValue({ content: null });
    mockGetPersonalSummary.mockResolvedValue({
      has_personal_summary: false,
      summary: null,
      current_annotations: { total_count: 0 },
    });

    mockGetMindMap.mockResolvedValue({
      has_mind_map: false,
      mind_map: null,
      source_available: true,
      source_type: "reference_document",
    });

    mockGenerateMindMap.mockResolvedValue({
      mind_map: mockSampleMindMapDto,
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={mockModules}
      />,
      { wrapper: createWrapper() },
    );

    const generateBtn = await screen.findByRole("button", {
      name: /ساخت نقشه مفهومی/,
    });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(mockGenerateMindMap).toHaveBeenCalledWith("mod-1", "course-1");
    });
  });

  it("Displays error banner with retry button when generateMindMap fails and allows retrying", async () => {
    mockGetReviewSummary.mockResolvedValue({ content: null });
    mockGetPersonalSummary.mockResolvedValue({
      has_personal_summary: false,
      summary: null,
      current_annotations: { total_count: 0 },
    });
    mockGetMindMap.mockResolvedValue({
      has_mind_map: false,
      mind_map: null,
      source_available: true,
      source_type: "reference_document",
    });

    mockGenerateMindMap.mockRejectedValueOnce(new Error("خطای مدل هوش مصنوعی در استخراج مفاهیم"));

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={mockModules}
      />,
      { wrapper: createWrapper() },
    );

    const generateBtn = await screen.findByRole("button", {
      name: /ساخت نقشه مفهومی/,
    });
    fireEvent.click(generateBtn);

    // Error banner should be shown with Persian error message
    expect(await screen.findByTestId("mind-map-generate-error")).toBeDefined();
    expect(screen.getByText("خطای مدل هوش مصنوعی در استخراج مفاهیم")).toBeDefined();

    // Retry button should be present
    const retryBtn = screen.getByRole("button", { name: "تلاش مجدد" });
    expect(retryBtn).toBeDefined();

    // Now clicking retry succeeds
    mockGenerateMindMap.mockResolvedValueOnce({
      mind_map: mockSampleMindMapDto,
    });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockGenerateMindMap).toHaveBeenCalledTimes(2);
    });
  });

  it("Resets mind map generation error banner when switching chapters", async () => {
    const twoModules = [
      {
        id: "mod-1",
        title: "فصل اول: بیوشیمی کربوهیدرات‌ها",
        document_id: "doc-1",
        sort_order: 1,
      },
      {
        id: "mod-2",
        title: "فصل دوم: بیوشیمی لیپیدها",
        document_id: "doc-2",
        sort_order: 2,
      },
    ];

    mockGetReviewSummary.mockResolvedValue({ content: null });
    mockGetPersonalSummary.mockResolvedValue({
      has_personal_summary: false,
      summary: null,
      current_annotations: { total_count: 0 },
    });
    mockGetMindMap.mockResolvedValue({
      has_mind_map: false,
      mind_map: null,
      source_available: true,
      source_type: "reference_document",
    });

    mockGenerateMindMap.mockRejectedValueOnce(new Error("خطای موقت در فصل ۱"));

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={twoModules}
      />,
      { wrapper: createWrapper() },
    );

    const generateBtn = await screen.findByRole("button", {
      name: /ساخت نقشه مفهومی/,
    });
    fireEvent.click(generateBtn);

    // Error banner appears
    expect(await screen.findByTestId("mind-map-generate-error")).toBeDefined();
    expect(screen.getByText("خطای موقت در فصل ۱")).toBeDefined();

    // Switch chapter to mod-2
    const drawerBtn = screen.getByRole("button", { name: /نمایش سرفصل‌های دوره/ });
    fireEvent.click(drawerBtn);

    const chapter2Btns = screen.getAllByText(/لیپیدها/);
    fireEvent.click(chapter2Btns[0]);

    // Error banner should be gone on the new chapter
    await waitFor(() => {
      expect(screen.queryByTestId("mind-map-generate-error")).toBeNull();
    });
  });

  it("Renders Version History modal and allows restoring earlier versions", async () => {
    mockGetReviewSummary.mockResolvedValue({ content: null });
    mockGetPersonalSummary.mockResolvedValue({
      has_personal_summary: false,
      summary: null,
      current_annotations: { total_count: 0 },
    });

    mockGetMindMap.mockResolvedValue({
      has_mind_map: true,
      mind_map: mockSampleMindMapDto,
      source_available: true,
      source_type: "reference_document",
    });

    mockListVersions.mockResolvedValue({
      currentVersion: 2,
      versions: [
        {
          version: 2,
          status: "completed",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sourceType: "reference_document",
          nodesCount: 5,
          customNodesCount: 1,
          notesCount: 1,
        },
        {
          version: 1,
          status: "completed",
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 3600000).toISOString(),
          sourceType: "reference_document",
          nodesCount: 3,
          customNodesCount: 0,
          notesCount: 0,
        },
      ],
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={mockModules}
      />,
      { wrapper: createWrapper() },
    );

    // Open version history modal
    const versionsBtn = await screen.findByTitle("تاریخچه نسخه‌ها و بازیابی");
    fireEvent.click(versionsBtn);

    // Modal title should appear
    expect(await screen.findByText("تاریخچه نسخه‌های مایندمپ")).toBeDefined();
    // Current version badge
    expect(screen.getByText("نسخه فعلی")).toBeDefined();
    // Restore button for version 1
    const restoreBtn = screen.getByText("بازیابی این نسخه");
    expect(restoreBtn).toBeDefined();
  });

  it("Scenario 4: Changing chapter resets state cleanly without stale data leakage and keeps active tab", async () => {
    const twoModules = [
      {
        id: "mod-1",
        title: "فصل اول: بیوشیمی کربوهیدرات‌ها",
        document_id: "doc-1",
        sort_order: 1,
      },
      {
        id: "mod-2",
        title: "فصل دوم: لیپیدها",
        document_id: "doc-2",
        sort_order: 2,
      },
    ];

    mockGetReviewSummary.mockImplementation((orgId, docId) => {
      if (docId === "doc-1") {
        return Promise.resolve({
          content: {
            id: "gen-1",
            payload: {
              kind: "review_summary",
              title: "خلاصه کربوهیدرات‌ها",
              sections: [{ title: "قندها", keyPoints: ["گلوکز اصلی است"] }],
            },
          },
        });
      }
      return Promise.resolve({
        content: {
          id: "gen-2",
          payload: {
            kind: "review_summary",
            title: "خلاصه لیپیدها",
            sections: [{ title: "چربی‌ها", keyPoints: ["اسیدهای چرب اشباع"] }],
          },
        },
      });
    });

    mockGetPersonalSummary.mockImplementation((modId) => {
      return Promise.resolve({
        has_personal_summary: false,
        summary: null,
        current_annotations: { total_count: 0 },
      });
    });

    mockGetMindMap.mockImplementation((modId) => {
      if (modId === "mod-1") {
        return Promise.resolve({
          has_mind_map: true,
          mind_map: mockSampleMindMapDto,
          source_available: true,
          source_type: "reference_document",
        });
      }
      return Promise.resolve({
        has_mind_map: false,
        mind_map: null,
        source_available: true,
        source_type: "reference_document",
      });
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={twoModules}
      />,
      { wrapper: createWrapper() },
    );

    // Initial load: switch to mind map tab
    const mindMapTab = await screen.findByRole("tab", { name: /نقشه مفهومی/ });
    fireEvent.click(mindMapTab);

    // Mod 1 has mind map
    expect(await screen.findByText("بیوشیمی کربوهیدرات‌ها")).toBeDefined();

    // Open curriculum drawer to switch chapter
    const drawerBtn = screen.getByRole("button", { name: /نمایش سرفصل‌های دوره/ });
    fireEvent.click(drawerBtn);

    // Click on chapter 2
    const chapter2Btns = screen.getAllByText(/لیپیدها/);
    fireEvent.click(chapter2Btns[0]);

    // Mod 2 does not have mind map yet, activeTab should still be "mindmap" and show empty CTA
    expect(
      await screen.findByText(/نقشه مفهومی هوشمند \(Interactive AI Mind Map\)/),
    ).toBeDefined();
    // Old node from mod-1 should not be displayed
    expect(screen.queryByText("بیوشیمی کربوهیدرات‌ها")).toBeNull();
  });

  it("Scenario 7: Error and retry handling for official summary", async () => {
    mockGetReviewSummary.mockRejectedValueOnce(new Error("Network Error"));
    mockGetPersonalSummary.mockResolvedValue({
      has_personal_summary: false,
      summary: null,
      current_annotations: { total_count: 0 },
    });
    mockGetMindMap.mockResolvedValue({
      has_mind_map: false,
      mind_map: null,
      source_available: true,
      source_type: "reference_document",
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={mockModules}
      />,
      { wrapper: createWrapper() },
    );

    // Switch to official tab to check error card
    const officialTab = await screen.findByRole("tab", { name: /خلاصه رسمی آوانا/ });
    fireEvent.click(officialTab);

    expect(await screen.findByText("خطا در دریافت خلاصه مروری رسمی")).toBeDefined();
    const retryBtn = screen.getByRole("button", { name: "تلاش مجدد" });
    expect(retryBtn).toBeDefined();

    // Refetch successfully
    mockGetReviewSummary.mockResolvedValueOnce({
      content: {
        id: "gen-1",
        payload: {
          kind: "review_summary",
          title: "خلاصه بازیابی شده",
          sections: [{ title: "مقدمه", keyPoints: ["نکته جدید"] }],
        },
      },
    });
    fireEvent.click(retryBtn);

    expect(await screen.findByText("خلاصه بازیابی شده")).toBeDefined();
  });

  it("Scenario 8: Renders hierarchical mind map with category role nodes and independent root concepts", async () => {
    const hierarchicalMindMap: MindMapDto = {
      id: "mm-hierarchical",
      courseId: "course-1",
      userId: "user-123",
      moduleId: "mod-1",
      version: 2,
      status: "completed",
      costToman: 0,
      createdAt: "2026-11-06T10:00:00Z",
      updatedAt: "2026-11-06T10:00:00Z",
      payload: {
        kind: "mind_map",
        version: 2,
        sourceType: "reference_document",
        sourceId: "mod-1",
        updatedAt: "2026-11-06T10:00:00Z",
        aiBase: {
          rootNodeId: "root",
          generatedAt: "2026-11-06T10:00:00Z",
          model: "gemini-3.5-flash-lite",
          nodes: {
            root: {
              id: "root",
              parentId: null,
              title: "فارماکولوژی قلب و عروق",
              shortDescription: "بررسی دسته‌های دارویی",
            },
            node_definition: {
              id: "node_definition",
              parentId: "root",
              title: "تعریف کلی",
              shortDescription: "مفهوم پایه مستقل",
            },
            node_treatment: {
              id: "node_treatment",
              parentId: "root",
              title: "رویکردهای درمانی",
              shortDescription: "دسته‌بندی داروها",
              nodeRole: "category",
            },
            node_captopril: {
              id: "node_captopril",
              parentId: "node_treatment",
              title: "کاپتوپریل",
              shortDescription: "مهارکننده ACE",
            },
          },
        },
        userModifications: {
          deletedNodeIds: [],
          customNodes: {},
          overrides: {},
        },
        userNotes: {},
      },
    };

    mockGetReviewSummary.mockResolvedValue({ content: null });
    mockGetPersonalSummary.mockResolvedValue({ has_personal_summary: false, summary: null, current_annotations: { total_count: 0 } });
    mockGetMindMap.mockResolvedValue({
      has_mind_map: true,
      mind_map: hierarchicalMindMap,
      source_available: true,
      source_type: "reference_document",
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={mockModules}
      />,
      { wrapper: createWrapper() },
    );

    const mindMapTab = await screen.findByRole("tab", { name: /نقشه مفهومی/ });
    fireEvent.click(mindMapTab);

    // Verify all nodes rendered in the tree hierarchy
    expect(await screen.findByText("فارماکولوژی قلب و عروق")).toBeDefined();
    expect(screen.getByText("تعریف کلی")).toBeDefined();
    expect(screen.getByText("رویکردهای درمانی")).toBeDefined();
    expect(screen.getByText("کاپتوپریل")).toBeDefined();
  });
});
