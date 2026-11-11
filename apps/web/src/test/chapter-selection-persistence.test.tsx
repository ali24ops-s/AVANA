import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, useSearchParams } from "react-router-dom";
import {
  resolveChapterDocument,
  type ChapterModule,
} from "../utils/chapterResolver.js";
import {
  CourseReviewSummaryView,
  type SummaryTab,
} from "../components/documents/CourseReviewSummaryView.js";
import { LearningPage } from "../pages/LearningPage.js";

// Mocks
const mockGetReviewSummary = vi.fn();
const mockListDocuments = vi.fn();
const mockGetPersonalSummary = vi.fn();
const mockGetMindMap = vi.fn();
const mockGenerateMindMap = vi.fn();
const mockGetCourseLearning = vi.fn();
const mockListOrganizations = vi.fn();

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
    updateMindMap: vi.fn(),
    expandNode: vi.fn(),
    resetToAiBase: vi.fn(),
    resetMindMap: vi.fn(),
    listVersions: vi.fn().mockResolvedValue({ versions: [], currentVersion: 0 }),
    restoreVersion: vi.fn(),
  }),
}));

vi.mock("../lib/api/learning.js", () => ({
  createLearningApi: () => ({
    getCourseLearning: mockGetCourseLearning,
    markLessonComplete: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock("../lib/api/organizations.js", () => ({
  createOrganizationApi: () => ({
    listOrganizations: mockListOrganizations,
  }),
}));

vi.mock("../lib/api/review.js", () => ({
  createReviewApi: () => ({
    getReviewQueue: vi.fn().mockResolvedValue({ pending: [] }),
  }),
}));

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "user-1", email: "student@avana.ir" },
    memberships: [{ organization_id: "org-1" }],
    isLoading: false,
  })),
}));

// Mock @xyflow/react
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ nodes, children }: any) => (
    <div data-testid="react-flow-mock">
      {nodes?.map((n: any) => (
        <div key={n.id} data-testid={`rf-node-${n.id}`}>
          {n.data?.title || n.data?.label}
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
  Position: { Right: "right", Left: "left", Top: "top", Bottom: "bottom" },
  ConnectionMode: { Loose: "loose", Strict: "strict" },
  Handle: () => <div data-testid="flow-handle" />,
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

describe("Chapter Selection & Persistence Test Suite", () => {
  const mockModules: ChapterModule[] = [
    { id: "mod-1", title: "فصل اول: مقدمات قلب", document_id: "doc-1", sort_order: 1 },
    { id: "mod-2", title: "فصل دوم: فیزیولوژی عروق", document_id: "doc-2", sort_order: 2 },
    { id: "mod-3", title: "فصل سوم: پاتولوژی جامع", document_id: "doc-3", sort_order: 3 },
  ];

  const mockDocuments = [
    { id: "doc-1", title: "فصل اول: مقدمات قلب", original_name: "فصل اول: مقدمات قلب" },
    { id: "doc-2", title: "فصل دوم: فیزیولوژی عروق", original_name: "فصل دوم: فیزیولوژی عروق" },
    { id: "doc-3", title: "فصل سوم: پاتولوژی جامع", original_name: "فصل سوم: پاتولوژی جامع" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockListOrganizations.mockResolvedValue({
      items: [{ id: "org-1", name: "دانشکده آزمایشی" }],
    });
    mockGetReviewSummary.mockResolvedValue({
      content: {
        payload: {
          sections: [{ title: "بخش تست", keyPoints: ["نکته ۱"] }],
        },
      },
    });
    mockGetPersonalSummary.mockResolvedValue({
      has_personal_summary: false,
      summary: null,
      current_annotations: { total_count: 0 },
    });
    mockGetMindMap.mockResolvedValue({
      has_mind_map: true,
      mind_map: {
        id: "mm-1",
        version: 1,
        payload: {
          version: 1,
          sourceType: "reference_document",
          sourceLanguage: "fa",
          aiBase: {
            rootNodeId: "node-1",
            nodes: {
              "node-1": {
                id: "node-1",
                parentId: null,
                title: "مفاهیم قلب",
                shortDescription: "مقدمه دستگاه گردش خون",
                order: 0,
              },
              "node-2": {
                id: "node-2",
                parentId: "node-1",
                title: "بطن چپ",
                shortDescription: "پمپاژ خون به آئورت",
                order: 1,
              },
            },
            edges: [],
          },
        },
      },
    });
    mockListDocuments.mockResolvedValue({ items: mockDocuments });
  });

  // -------------------------------------------------------------------------
  // 1. Centralized Resolver Unit Tests
  // -------------------------------------------------------------------------
  describe("1. Centralized resolveChapterDocument unit tests", () => {
    it("Priority 1: resolves by module.id", () => {
      const result = resolveChapterDocument({
        chapterId: "mod-2",
        modules: mockModules,
        documents: mockDocuments,
      });
      expect(result.activeDocument?.id).toBe("doc-2");
      expect(result.activeModule?.id).toBe("mod-2");
      expect(result.canonicalChapterId).toBe("mod-2");
      expect(result.isResolved).toBe(true);
    });

    it("Priority 2: resolves by document.id directly", () => {
      const result = resolveChapterDocument({
        chapterId: "doc-3",
        modules: mockModules,
        documents: mockDocuments,
      });
      expect(result.activeDocument?.id).toBe("doc-3");
      expect(result.activeModule?.id).toBe("mod-3");
      expect(result.canonicalChapterId).toBe("mod-3");
      expect(result.isResolved).toBe(true);
    });

    it("Priority 3: resolves by module.document_id", () => {
      const result = resolveChapterDocument({
        chapterId: "doc-2",
        modules: mockModules,
        documents: mockDocuments,
      });
      expect(result.activeDocument?.id).toBe("doc-2");
      expect(result.canonicalChapterId).toBe("mod-2");
    });

    it("Requirement 6: does NOT fallback when documents are loading", () => {
      const result = resolveChapterDocument({
        chapterId: "mod-3",
        modules: mockModules,
        documents: [],
        isDocumentsLoading: true,
      });
      expect(result.isResolved).toBe(false);
      expect(result.activeDocument).toBeNull();
      expect(result.activeModule).toBeNull();
    });

    it("Requirement 4 (Fallback): returns canonicalPreviewDocId or first document on invalid chapterId", () => {
      const result = resolveChapterDocument({
        chapterId: "invalid-chapter-999",
        modules: mockModules,
        documents: mockDocuments,
        canonicalPreviewDocId: "doc-1",
      });
      expect(result.activeDocument?.id).toBe("doc-1");
      expect(result.canonicalChapterId).toBe("mod-1");
      expect(result.isResolved).toBe(true);
    });

    it("Requirement 6 (Course change): invalid chapterId from previous course falls back to chapter 1 of new course", () => {
      const result = resolveChapterDocument({
        chapterId: "old-course-chapter-xyz",
        modules: mockModules,
        documents: mockDocuments,
      });
      expect(result.activeDocument?.id).toBe("doc-1");
      expect(result.canonicalChapterId).toBe("mod-1");
    });

    it("Requirement: resolves module without document_id (independent of document presence)", () => {
      const moduleWithoutDoc: ChapterModule = {
        id: "mod-no-doc",
        title: "فصل مستقل درسنامه",
        document_id: null,
      };
      const result = resolveChapterDocument({
        chapterId: "mod-no-doc",
        modules: [moduleWithoutDoc],
        documents: [],
      });
      expect(result.activeModule?.id).toBe("mod-no-doc");
      expect(result.canonicalChapterId).toBe("mod-no-doc");
      expect(result.activeDocument).toBeNull();
      expect(result.isResolved).toBe(true);
    });

    it("Requirement: resolves module when document is deleted from documents list", () => {
      const moduleWithDeletedDoc: ChapterModule = {
        id: "mod-del",
        title: "فصل با سند حذف‌شده",
        document_id: "doc-deleted-id",
      };
      const result = resolveChapterDocument({
        chapterId: "mod-del",
        modules: [moduleWithDeletedDoc],
        documents: [],
      });
      expect(result.activeModule?.id).toBe("mod-del");
      expect(result.canonicalChapterId).toBe("mod-del");
      expect(result.activeDocument).toBeNull();
      expect(result.isResolved).toBe(true);
    });

    it("Requirement: falls back to first module when documents list is empty", () => {
      const moduleA: ChapterModule = { id: "mod-a", title: "فصل اول", document_id: null };
      const moduleB: ChapterModule = { id: "mod-b", title: "فصل دوم", document_id: null };
      const result = resolveChapterDocument({
        chapterId: null,
        modules: [moduleA, moduleB],
        documents: [],
      });
      expect(result.activeModule?.id).toBe("mod-a");
      expect(result.canonicalChapterId).toBe("mod-a");
      expect(result.isResolved).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Refresh & Unmount/Mount Lifecycle Tests in CourseReviewSummaryView
  // -------------------------------------------------------------------------
  describe("2. Refresh Simulation & Persistence in CourseReviewSummaryView", () => {
    it("Test 1: Select chapter 2 and simulate Refresh → remains on chapter 2", async () => {
      let currentUrlChapterId: string | null = null;
      const handleSelectChapter = vi.fn((id: string) => {
        currentUrlChapterId = id;
      });

      // 1. First mount (initial load)
      const queryClient1 = createTestQueryClient();
      const { unmount } = render(
        <QueryClientProvider client={queryClient1}>
          <CourseReviewSummaryView
            organizationId="org-1"
            courseId="course-1"
            modules={mockModules}
            selectedChapterId={currentUrlChapterId}
            onSelectChapter={handleSelectChapter}
          />
        </QueryClientProvider>,
      );

      // Open curriculum drawer and select Chapter 2
      const triggerBtn = await screen.findByRole("button", { name: /سرفصل‌ها/ });
      fireEvent.click(triggerBtn);

      const chapter2Btn = await screen.findByRole("button", { name: /فیزیولوژی عروق/ });
      fireEvent.click(chapter2Btn);

      expect(handleSelectChapter).toHaveBeenCalledWith("mod-2");
      expect(currentUrlChapterId).toBe("mod-2");

      // 2. Simulate Refresh: Unmount component completely
      unmount();

      // 3. Mount fresh instance with the preserved URL chapterId ("mod-2")
      const queryClient2 = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient2}>
          <CourseReviewSummaryView
            organizationId="org-1"
            courseId="course-1"
            modules={mockModules}
            selectedChapterId={currentUrlChapterId}
            onSelectChapter={handleSelectChapter}
          />
        </QueryClientProvider>,
      );

      // Verify that after refresh, Chapter 2 is active
      expect(
        await screen.findByText(/فصل فعال: فیزیولوژی عروق/),
      ).toBeDefined();
    });

    it("Test 2: Select last chapter (Chapter 3) and simulate Refresh → remains on last chapter", async () => {
      let currentUrlChapterId: string | null = null;
      const handleSelectChapter = vi.fn((id: string) => {
        currentUrlChapterId = id;
      });

      // Initial render
      const qc1 = createTestQueryClient();
      const { unmount } = render(
        <QueryClientProvider client={qc1}>
          <CourseReviewSummaryView
            organizationId="org-1"
            courseId="course-1"
            modules={mockModules}
            selectedChapterId={currentUrlChapterId}
            onSelectChapter={handleSelectChapter}
          />
        </QueryClientProvider>,
      );

      // Select Chapter 3 (last chapter)
      const triggerBtn = await screen.findByRole("button", { name: /سرفصل‌ها/ });
      fireEvent.click(triggerBtn);

      const chapter3Btn = await screen.findByRole("button", { name: /پاتولوژی جامع/ });
      fireEvent.click(chapter3Btn);

      expect(handleSelectChapter).toHaveBeenCalledWith("mod-3");
      expect(currentUrlChapterId).toBe("mod-3");

      // Refresh
      unmount();

      const qc2 = createTestQueryClient();
      render(
        <QueryClientProvider client={qc2}>
          <CourseReviewSummaryView
            organizationId="org-1"
            courseId="course-1"
            modules={mockModules}
            selectedChapterId={currentUrlChapterId}
            onSelectChapter={handleSelectChapter}
          />
        </QueryClientProvider>,
      );

      expect(
        await screen.findByText(/فصل فعال: پاتولوژی جامع/),
      ).toBeDefined();
    });

    it("Test 3: Direct URL navigation with valid chapterId → renders that chapter immediately", async () => {
      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <CourseReviewSummaryView
            organizationId="org-1"
            courseId="course-1"
            modules={mockModules}
            selectedChapterId="mod-2"
          />
        </QueryClientProvider>,
      );

      expect(
        await screen.findByText(/فصل فعال: فیزیولوژی عروق/),
      ).toBeDefined();
    });

    it("Test 4: Direct URL navigation with invalid chapterId → safe fallback to Chapter 1", async () => {
      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <CourseReviewSummaryView
            organizationId="org-1"
            courseId="course-1"
            modules={mockModules}
            selectedChapterId="non-existent-chap-xyz"
          />
        </QueryClientProvider>,
      );

      expect(
        await screen.findByText(/فصل فعال: مقدمات قلب/),
      ).toBeDefined();
    });

    it("Test 5: Delayed loading of modules → does not prematurely lock to chapter 1", async () => {
      const qc = createTestQueryClient();
      // 1. Initial render when data is not yet available (modules=undefined)
      const { rerender } = render(
        <QueryClientProvider client={qc}>
          <CourseReviewSummaryView
            organizationId="org-1"
            courseId="course-1"
            modules={undefined}
            selectedChapterId="mod-3"
          />
        </QueryClientProvider>,
      );

      // Initially in loading state (does not render active chapter or lock to chapter 1)
      expect(screen.queryByText(/فصل فعال/)).toBeNull();

      // 2. Data arrives with chapters
      rerender(
        <QueryClientProvider client={qc}>
          <CourseReviewSummaryView
            organizationId="org-1"
            courseId="course-1"
            modules={mockModules}
            selectedChapterId="mod-3"
          />
        </QueryClientProvider>,
      );

      // After loading, it successfully resolves chapter 3 without resetting to chapter 1
      expect(
        await screen.findByText(/فصل فعال: پاتولوژی جامع/),
      ).toBeDefined();
    });

    it("Test 7: Switching between summary and mindmap tabs → preserves selected chapter", async () => {
      let currentTab: SummaryTab = "official";
      const onSelectSummaryTab = vi.fn((tab: SummaryTab) => {
        currentTab = tab;
      });

      const qc = createTestQueryClient();
      const { rerender } = render(
        <QueryClientProvider client={qc}>
          <CourseReviewSummaryView
            organizationId="org-1"
            courseId="course-1"
            modules={mockModules}
            selectedChapterId="mod-2"
            activeSummaryTab={currentTab}
            onSelectSummaryTab={onSelectSummaryTab}
          />
        </QueryClientProvider>,
      );

      // Verify currently on chapter 2
      expect(await screen.findByText(/فصل فعال: فیزیولوژی عروق/)).toBeDefined();

      // Click Mind Map tab
      const mindMapTab = await screen.findByRole("tab", { name: /نقشه مفهومی/ });
      fireEvent.click(mindMapTab);

      expect(onSelectSummaryTab).toHaveBeenCalledWith("mindmap");
      currentTab = "mindmap";

      rerender(
        <QueryClientProvider client={qc}>
          <CourseReviewSummaryView
            organizationId="org-1"
            courseId="course-1"
            modules={mockModules}
            selectedChapterId="mod-2"
            activeSummaryTab={currentTab}
            onSelectSummaryTab={onSelectSummaryTab}
          />
        </QueryClientProvider>,
      );

      // Mind map canvas is visible
      expect(await screen.findByTestId("react-flow-mock")).toBeDefined();
      // Chapter is STILL Chapter 2!
      expect(screen.getByText(/فصل فعال: فیزیولوژی عروق/)).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Full Integration with LearningPage & Router
  // -------------------------------------------------------------------------
  describe("3. Full Integration with LearningPage & Router", () => {
    const mockCourseLearnData = {
      course: {
        id: "course-1",
        title: "قلب و عروق",
        organization_id: "org-1",
        is_official: false,
      },
      modules: [
        {
          id: "mod-1",
          title: "فصل اول: مقدمات قلب",
          document_id: "doc-1",
          sort_order: 1,
          lessons: [{ id: "les-1", title: "آناتومی دهلیز", is_completed: false }],
        },
        {
          id: "mod-2",
          title: "فصل دوم: فیزیولوژی عروق",
          document_id: "doc-2",
          sort_order: 2,
          lessons: [{ id: "les-2", title: "فشار خون", is_completed: false }],
        },
      ],
      progress: {
        completed_lessons_count: 0,
        total_lessons_count: 2,
        completion_percentage: 0,
        last_studied_lesson_id: null,
      },
    };

    beforeEach(() => {
      mockGetCourseLearning.mockResolvedValue(mockCourseLearnData);
    });

    it("Direct navigation to ?tab=review_summary&chapterId=mod-2 renders chapter 2", async () => {
      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/courses/course-1?tab=review_summary&chapterId=mod-2"]}>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(
        await screen.findByText(/فصل فعال: فیزیولوژی عروق/),
      ).toBeDefined();
    });

    it("Direct navigation to ?tab=mindmap&chapterId=mod-2 opens Mind Map on chapter 2", async () => {
      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/courses/course-1?tab=mindmap&chapterId=mod-2"]}>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify Mind Map canvas is rendered directly
      expect(await screen.findByTestId("react-flow-mock")).toBeDefined();
      expect(screen.getByText(/فصل فعال: فیزیولوژی عروق/)).toBeDefined();
    });

    it("Requirement 8: Unrelated URL parameters are preserved when switching tabs", async () => {
      let latestSearchParams: URLSearchParams | null = null;
      function ParamSpy() {
        const [params] = useSearchParams();
        latestSearchParams = params;
        return null;
      }

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter
            initialEntries={["/courses/course-1?utm_campaign=winter&customParam=hello&tab=lessons"]}
          >
            <ParamSpy />
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Switch to review_summary tab
      const summaryTabBtn = await screen.findByRole("tab", { name: /خلاصه مروری/ });
      fireEvent.click(summaryTabBtn);

      await waitFor(() => {
        expect(latestSearchParams?.get("tab")).toBe("review_summary");
        expect(latestSearchParams?.get("utm_campaign")).toBe("winter");
        expect(latestSearchParams?.get("customParam")).toBe("hello");
      });
    });

    it("Test 6: Switching courses atomically clears stale chapterId of previous course", async () => {
      const course2Data = {
        course: {
          id: "course-2",
          title: "نورولوژی جامع",
          organization_id: "org-1",
          is_official: false,
        },
        modules: [
          {
            id: "mod-neuro-1",
            title: "فصل اول: قشر مخ",
            document_id: "doc-neuro-1",
            sort_order: 1,
            lessons: [{ id: "les-n1", title: "لوب فرونتال", is_completed: false }],
          },
          {
            id: "mod-neuro-2",
            title: "فصل دوم: ساقه مغز",
            document_id: "doc-neuro-2",
            sort_order: 2,
            lessons: [{ id: "les-n2", title: "بصل‌النخاع", is_completed: false }],
          },
        ],
        progress: {
          completed_lessons_count: 0,
          total_lessons_count: 2,
          completion_percentage: 0,
          last_studied_lesson_id: null,
        },
      };

      mockGetCourseLearning.mockImplementation(async (cId: string) => {
        if (cId === "course-2") return course2Data;
        return mockCourseLearnData;
      });

      let latestParams: URLSearchParams | null = null;
      function RouterInspector() {
        const [p] = useSearchParams();
        latestParams = p;
        return null;
      }

      const qc = createTestQueryClient();
      // Start in course-2 with chapterId="mod-2" (which belonged to course-1!)
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter
            initialEntries={["/courses/course-2?tab=review_summary&chapterId=mod-2"]}
          >
            <RouterInspector />
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // It must fall back to course-2's first valid chapter (قشر مخ)
      expect(
        await screen.findByText(/فصل فعال: قشر مخ/),
      ).toBeDefined();

      // Stale chapterId is cleaned from searchParams
      await waitFor(() => {
        expect(latestParams?.get("chapterId")).toBeNull();
      });
    });
  });
});
