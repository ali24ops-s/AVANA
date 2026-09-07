import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GenerateContentModal } from "../components/documents/GenerateContentModal.js";
import { GlobalGenerationIndicator } from "../components/generation/GlobalGenerationIndicator.js";
import { GenerationDetailsModal } from "../components/generation/GenerationDetailsModal.js";
import { useActiveGenerations } from "../hooks/useActiveGenerations.js";
import type { ActiveGenerationItem } from "../lib/api/generation.js";

// Mock AuthProvider
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "user@avana.ir", role: "organization_admin" },
    memberships: [{ organization_id: "00000000-0000-0000-0000-000000000001", role: "organization_admin" }],
    isAuthenticated: true,
  }),
}));

const {
  mockGetActiveGenerations,
  mockGetDocumentGenerationProgress,
  mockTriggerGeneration,
} = vi.hoisted(() => ({
  mockGetActiveGenerations: vi.fn(),
  mockGetDocumentGenerationProgress: vi.fn(),
  mockTriggerGeneration: vi.fn(),
}));

vi.mock("../lib/api/generation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api/generation.js")>();
  return {
    ...actual,
    createGenerationApi: () => ({
      getActiveGenerations: mockGetActiveGenerations,
      getDocumentGenerationProgress: mockGetDocumentGenerationProgress,
      triggerGeneration: mockTriggerGeneration,
    }),
  };
});

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

describe("Background Generation UX & Global Status Visibility", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId = "00000000-0000-0000-0000-000000000002";
  const mockDocId = "00000000-0000-0000-0000-000000000003";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Close ≠ Cancel (GenerateContentModal)", () => {
    it("allows closing the modal during active generation without blocking or cancelling", async () => {
      const onClose = vi.fn();
      const onConfirmGenerate = vi.fn();

      const { rerender } = render(
        <GenerateContentModal
          isOpen={true}
          onClose={onClose}
          documentName="lecture-notes.pdf"
          isGenerating={false}
          onConfirmGenerate={onConfirmGenerate}
        />,
      );

      // Verify modal is open with submit button
      expect(screen.getByText("انتخاب محتوای موردنظر")).toBeDefined();
      const submitBtn = screen.getByRole("button", { name: /تولید محتوا/i });
      expect(submitBtn).toBeDefined();

      // Trigger generation
      fireEvent.click(submitBtn);
      expect(onConfirmGenerate).toHaveBeenCalledWith({
        lesson: true,
        flashcards: true,
        exam: true,
        review_summary: false,
      });

      // Now re-render with isGenerating = true
      rerender(
        <GenerateContentModal
          isOpen={true}
          onClose={onClose}
          documentName="lecture-notes.pdf"
          isGenerating={true}
          onConfirmGenerate={onConfirmGenerate}
        />,
      );

      // Verify generating indicator in button
      expect(screen.getByText("در حال تولید هوشمند...")).toBeDefined();

      // Close button in footer should show "بستن پنجره" and be ENABLED
      const closeFooterBtn = screen.getByRole("button", { name: "بستن پنجره" });
      expect(closeFooterBtn).not.toBeDisabled();
      fireEvent.click(closeFooterBtn);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("allows closing the modal via Escape key and backdrop click during active generation", async () => {
      const onClose = vi.fn();
      const onConfirmGenerate = vi.fn();

      render(
        <GenerateContentModal
          isOpen={true}
          onClose={onClose}
          documentName="lecture-notes.pdf"
          isGenerating={true}
          onConfirmGenerate={onConfirmGenerate}
        />,
      );

      // Press Escape
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);

      // Close button (X in top right)
      const closeTopBtn = screen.getByRole("button", { name: "بستن" });
      fireEvent.click(closeTopBtn);
      expect(onClose).toHaveBeenCalledTimes(2);
    });
  });

  describe("2. Global Generation Status Indicator", () => {
    it("renders nothing when there are no active generations", async () => {
      const queryClient = createTestQueryClient();
      mockGetActiveGenerations.mockResolvedValue({
        requestId: "req-1",
        organizationId: mockOrgId,
        items: [],
        totalActive: 0,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GlobalGenerationIndicator organizationId={mockOrgId} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /نشانگر وضعیت تولید محتوا/i })).toBeNull();
      });
    });

    it("renders active progress pill with stage label, counter, percentage and badge", async () => {
      const queryClient = createTestQueryClient();
      const items: ActiveGenerationItem[] = [
        {
          documentId: mockDocId,
          documentName: "biology-chapter-1.pdf",
          courseId: mockCourseId,
          status: "generating",
          stage: "lesson",
          stageLabel: "تولید درسنامه",
          progress: { current: 3, total: 12, percentage: 45 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        },
        {
          documentId: "doc-2",
          documentName: "chemistry-chapter-2.pdf",
          courseId: mockCourseId,
          status: "planning",
          stage: "planning",
          stageLabel: "برنامه‌ریزی محتوا",
          progress: { current: 1, total: 12, percentage: 15 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        },
      ];

      mockGetActiveGenerations.mockResolvedValue({
        requestId: "req-1",
        organizationId: mockOrgId,
        totalActive: 2,
        items,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GlobalGenerationIndicator organizationId={mockOrgId} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        // Multi-active count label
        expect(screen.getByText(/2 تولید محتوای فعال/i)).toBeDefined();
        // Stage label
        expect(screen.getByText(/تولید درسنامه/i)).toBeDefined();
        // Counter
        expect(screen.getByText(/3\/12/i)).toBeDefined();
        // Percentage
        expect(screen.getByText(/45٪/i)).toBeDefined();
      });
    });

    it("opens GenerationDetailsModal when clicked", async () => {
      const queryClient = createTestQueryClient();
      const items: ActiveGenerationItem[] = [
        {
          documentId: mockDocId,
          documentName: "physics-notes.pdf",
          courseId: mockCourseId,
          status: "generating",
          stage: "flashcard",
          stageLabel: "تولید فلش‌کارت",
          progress: { current: 6, total: 12, percentage: 60 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        },
      ];

      mockGetActiveGenerations.mockResolvedValue({
        requestId: "req-1",
        organizationId: mockOrgId,
        totalActive: 1,
        items,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GlobalGenerationIndicator organizationId={mockOrgId} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const indicatorBtn = await screen.findByRole("button", { name: /نشانگر وضعیت تولید محتوا/i });
      fireEvent.click(indicatorBtn);

      // Verify details modal opened
      await waitFor(() => {
        expect(screen.getAllByText("physics-notes.pdf").length).toBeGreaterThan(0);
        expect(screen.getAllByText("تولید فلش‌کارت").length).toBeGreaterThan(0);
        expect(screen.getByText("تحلیل فایل")).toBeDefined();
        expect(screen.getByText("برنامه‌ریزی محتوا")).toBeDefined();
      });
    });
  });

  describe("3. Generation Details Modal (Stages, Stale Warnings, Safe Error Messages)", () => {
    it("renders canonical 8 stages with active step and multi-document tabs", async () => {
      const items: ActiveGenerationItem[] = [
        {
          documentId: mockDocId,
          documentName: "math-module.pdf",
          courseId: mockCourseId,
          status: "generating",
          stage: "quiz",
          stageLabel: "تولید آزمون",
          progress: { current: 9, total: 12, percentage: 75 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        },
        {
          documentId: "doc-math-2",
          documentName: "math-exercises.pdf",
          courseId: mockCourseId,
          status: "planning",
          stage: "planning",
          stageLabel: "برنامه‌ریزی محتوا",
          progress: { current: 2, total: 12, percentage: 20 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        },
      ];

      render(
        <MemoryRouter>
          <GenerationDetailsModal
            isOpen={true}
            onClose={vi.fn()}
            items={items}
          />
        </MemoryRouter>,
      );

      // Multi-item tabs
      expect(screen.getAllByText("math-module.pdf").length).toBeGreaterThan(0);
      expect(screen.getAllByText("math-exercises.pdf").length).toBeGreaterThan(0);

      // Canonical 8 stages
      expect(screen.getByText("تحلیل فایل")).toBeDefined();
      expect(screen.getByText("برنامه‌ریزی محتوا")).toBeDefined();
      expect(screen.getByText("تولید درسنامه")).toBeDefined();
      expect(screen.getByText("تولید فلش‌کارت")).toBeDefined();
      expect(screen.getByText("تولید آزمون")).toBeDefined();
      expect(screen.getByText("تولید خلاصه")).toBeDefined();
      expect(screen.getByText("بازبینی و اعتبارسنجی")).toBeDefined();
      expect(screen.getByText("انتشار")).toBeDefined();
    });

    it("displays safe sanitized Persian error message and retry button on failure", async () => {
      const items: ActiveGenerationItem[] = [
        {
          documentId: mockDocId,
          documentName: "failed-doc.pdf",
          courseId: mockCourseId,
          status: "failed",
          stage: "lesson",
          stageLabel: "خطا در تولید",
          progress: { current: 3, total: 12, percentage: 30 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: "Rate limit quota exceeded (HTTP 429) at line 152: internal stack trace",
          updatedAt: new Date().toISOString(),
        },
      ];

      render(
        <MemoryRouter>
          <GenerationDetailsModal
            isOpen={true}
            onClose={vi.fn()}
            items={items}
            onRetry={vi.fn()}
          />
        </MemoryRouter>,
      );

      // Raw technical stack trace should NOT be displayed directly to user
      expect(screen.queryByText(/at line 152: internal stack trace/i)).toBeNull();
      // Safe Persian error should be displayed
      expect(screen.getByText(/سهمیه سرویس هوش مصنوعی در حال حاضر به پایان رسیده است/i)).toBeDefined();
      // Retry button should be visible
      expect(screen.getByRole("button", { name: /تلاش مجدد/i })).toBeDefined();
    });

    it("displays stale warning banner when generation has been inactive for > 3 minutes", async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const items: ActiveGenerationItem[] = [
        {
          documentId: mockDocId,
          documentName: "stalled-doc.pdf",
          courseId: mockCourseId,
          status: "generating",
          stage: "lesson",
          stageLabel: "تولید درسنامه",
          progress: { current: 2, total: 12, percentage: 25 },
          stageStartedAt: fiveMinutesAgo,
          lastActivityAt: fiveMinutesAgo,
          error: null,
          updatedAt: fiveMinutesAgo,
        },
      ];

      render(
        <MemoryRouter>
          <GenerationDetailsModal
            isOpen={true}
            onClose={vi.fn()}
            items={items}
          />
        </MemoryRouter>,
      );

      expect(screen.getByText(/بیش از ۳ دقیقه است که تغییری در این فرآیند ثبت نشده است/i)).toBeDefined();
    });
  });

  describe("4. React Query Cache Sharing & Deduplicated Polling", () => {
    it("shares cache across multiple consumers and only calls API once per interval", async () => {
      const queryClient = createTestQueryClient();
      const items: ActiveGenerationItem[] = [
        {
          documentId: mockDocId,
          documentName: "shared.pdf",
          courseId: mockCourseId,
          status: "generating",
          stage: "lesson",
          stageLabel: "تولید درسنامه",
          progress: { current: 6, total: 12, percentage: 50 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        },
      ];

      mockGetActiveGenerations.mockResolvedValue({
        requestId: "req-1",
        organizationId: mockOrgId,
        totalActive: 1,
        items,
      });

      function HeaderConsumer() {
        const { items } = useActiveGenerations(mockOrgId);
        return <div data-testid="header-count">{items.length}</div>;
      }

      function AdminHeaderConsumer() {
        const { items } = useActiveGenerations(mockOrgId);
        return <div data-testid="admin-count">{items.length}</div>;
      }

      function PageConsumer() {
        const { items } = useActiveGenerations(mockOrgId);
        return <div data-testid="page-count">{items.length}</div>;
      }

      render(
        <QueryClientProvider client={queryClient}>
          <HeaderConsumer />
          <AdminHeaderConsumer />
          <PageConsumer />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("header-count").textContent).toBe("1");
        expect(screen.getByTestId("admin-count").textContent).toBe("1");
        expect(screen.getByTestId("page-count").textContent).toBe("1");
      });

      // Crucial: Despite 3 simultaneous hook mounts, getActiveGenerations should only be called ONCE
      expect(mockGetActiveGenerations).toHaveBeenCalledTimes(1);
    });
  });

  describe("5. End-to-End Global Generation Pipeline Discovery & Resilience", () => {
    it("Scenario A: Polling does not stop on empty response, discovers new generation and renders without reload", async () => {
      const queryClient = createTestQueryClient();

      // Step 1: Initial call returns empty
      mockGetActiveGenerations.mockResolvedValueOnce({
        requestId: "req-empty",
        items: [],
      });

      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GlobalGenerationIndicator />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify nothing is rendered initially
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /نشانگر وضعیت تولید محتوا/i })).toBeNull();
      });

      // Step 2: Generation starts in background
      const activeItem: ActiveGenerationItem = {
        documentId: "doc-live-1",
        documentName: "pharmacology-chapter1.pdf",
        courseId: "course-1",
        status: "queued",
        stage: null,
        stageLabel: null,
        progress: null,
        stageStartedAt: null,
        lastActivityAt: new Date().toISOString(),
        error: null,
        updatedAt: new Date().toISOString(),
      };

      mockGetActiveGenerations.mockResolvedValue({
        requestId: "req-active",
        items: [activeItem],
      });

      // Step 3: Next poll / invalidate queries
      await queryClient.invalidateQueries({ queryKey: ["active-generations"] });

      // Step 4: Header renders active generation without page reload
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /نشانگر وضعیت تولید محتوا/i })).toBeDefined();
        expect(screen.getByText(/در حال تولید محتوا/i)).toBeDefined();
      });
    });

    it("Scenario B: Preserves generation status across page refresh / remount", async () => {
      const activeItem: ActiveGenerationItem = {
        documentId: "doc-persist-1",
        documentName: "cardiology-review.pdf",
        courseId: "course-2",
        status: "generating",
        stage: "lesson",
        stageLabel: "تولید درسنامه",
        progress: { current: 5, total: 10, percentage: 50 },
        stageStartedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        error: null,
        updatedAt: new Date().toISOString(),
      };

      mockGetActiveGenerations.mockResolvedValue({
        requestId: "req-persist",
        items: [activeItem],
      });

      // Initial Mount
      const queryClient1 = createTestQueryClient();
      const { unmount } = render(
        <QueryClientProvider client={queryClient1}>
          <MemoryRouter>
            <GlobalGenerationIndicator />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/تولید درسنامه/i)).toBeDefined();
        expect(screen.getByText(/50٪/i)).toBeDefined();
      });

      // Simulate Page Refresh (Unmount & Mount new QueryClient/Component)
      unmount();

      const queryClient2 = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient2}>
          <MemoryRouter>
            <GlobalGenerationIndicator />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/تولید درسنامه/i)).toBeDefined();
        expect(screen.getByText(/50٪/i)).toBeDefined();
      });
    });

    it("Scenario C: Discovers generation from an organization that is not memberships[0]", async () => {
      const queryClient = createTestQueryClient();
      const nonPrimaryOrgId = "00000000-0000-0000-0000-000000000099";

      const itemInOtherOrg: ActiveGenerationItem = {
        documentId: "doc-other-org",
        documentName: "neurology-notes.pdf",
        courseId: "course-other",
        organizationId: nonPrimaryOrgId,
        status: "planning",
        stage: "planning",
        stageLabel: "برنامه‌ریزی محتوا",
        progress: { current: 1, total: 5, percentage: 20 },
        stageStartedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        error: null,
        updatedAt: new Date().toISOString(),
      };

      mockGetActiveGenerations.mockResolvedValue({
        requestId: "req-other-org",
        items: [itemInOtherOrg],
      });

      // Render Header without explicit organizationId (must use global discovery)
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GlobalGenerationIndicator />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/برنامه‌ریزی محتوا/i)).toBeDefined();
        expect(screen.getByText(/20٪/i)).toBeDefined();
      });
    });

    it("Scenario D: Discovers generation in system organization for authorized actor", async () => {
      const queryClient = createTestQueryClient();
      const systemOrgId = "00000000-0000-0000-0000-000000000000";

      const systemItem: ActiveGenerationItem = {
        documentId: "doc-system-1",
        documentName: "official-pharmacology.pdf",
        courseId: "official-course-1",
        organizationId: systemOrgId,
        status: "generating",
        stage: "quiz",
        stageLabel: "تولید آزمون",
        progress: { current: 8, total: 10, percentage: 80 },
        stageStartedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        error: null,
        updatedAt: new Date().toISOString(),
      };

      mockGetActiveGenerations.mockResolvedValue({
        requestId: "req-system",
        items: [systemItem],
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GlobalGenerationIndicator />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/تولید آزمون/i)).toBeDefined();
        expect(screen.getByText(/80٪/i)).toBeDefined();
      });
    });

    it("Scenario E: Header displays indicator ONLY for active generation phases (queued, planning, generating, stopping, deleting) and HIDES for post-generation (reviewing, validating, publishing, completed)", async () => {
      const activeStatuses: Array<ActiveGenerationItem["status"]> = [
        "queued",
        "planning",
        "generating",
        "stopping",
        "deleting",
      ];

      for (const status of activeStatuses) {
        const queryClient = createTestQueryClient();
        const item: ActiveGenerationItem = {
          documentId: `doc-${status}`,
          documentName: `${status}-document.pdf`,
          courseId: "course-1",
          status,
          stage: status === "generating" ? "lesson" : status === "planning" ? "planning" : null,
          stageLabel: status === "generating" ? "تولید درسنامه" : status === "planning" ? "برنامه‌ریزی محتوا" : null,
          progress: status === "generating" ? { current: 2, total: 4, percentage: 50 } : null,
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        };

        mockGetActiveGenerations.mockResolvedValue({
          requestId: `req-${status}`,
          items: [item],
        });

        const { unmount } = render(
          <QueryClientProvider client={queryClient}>
            <MemoryRouter>
              <GlobalGenerationIndicator />
            </MemoryRouter>
          </QueryClientProvider>,
        );

        await waitFor(() => {
          expect(screen.getByRole("button", { name: /نشانگر وضعیت تولید محتوا/i })).toBeDefined();
        });

        unmount();
      }

      // Non-active post-generation / completed statuses
      const postGenerationCases: Array<{ status: ActiveGenerationItem["status"]; stage?: ActiveGenerationItem["stage"] }> = [
        { status: "reviewing", stage: "review" },
        { status: "completed", stage: "publishing" },
        { status: "generating", stage: "review" },
        { status: "generating", stage: "publishing" },
      ];

      for (const { status, stage } of postGenerationCases) {
        const queryClient = createTestQueryClient();
        const item: ActiveGenerationItem = {
          documentId: `doc-post-${status}-${stage}`,
          documentName: `post-${status}-document.pdf`,
          courseId: "course-1",
          status,
          stage: stage ?? null,
          stageLabel: stage === "review" ? "بازبینی و اعتبارسنجی" : "انتشار",
          progress: null,
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        };

        mockGetActiveGenerations.mockResolvedValue({
          requestId: `req-${status}-${stage}`,
          items: [item],
        });

        const { unmount } = render(
          <QueryClientProvider client={queryClient}>
            <MemoryRouter>
              <GlobalGenerationIndicator />
            </MemoryRouter>
          </QueryClientProvider>,
        );

        await waitFor(() => {
          expect(screen.queryByRole("button", { name: /نشانگر وضعیت تولید محتوا/i })).toBeNull();
        });

        unmount();
      }
    });

    it("Transition Flow: Header displays indicator during generating, and immediately removes it when transitioning to reviewing", async () => {
      const queryClient = createTestQueryClient();

      // 1. Initial State: generating
      const generatingItem: ActiveGenerationItem = {
        documentId: mockDocId,
        documentName: "biochemistry.pdf",
        courseId: mockCourseId,
        status: "generating",
        stage: "lesson",
        stageLabel: "تولید درسنامه",
        progress: { current: 3, total: 4, percentage: 75 },
        stageStartedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        error: null,
        updatedAt: new Date().toISOString(),
      };

      mockGetActiveGenerations.mockResolvedValue({
        requestId: "req-gen-1",
        items: [generatingItem],
      });

      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GlobalGenerationIndicator organizationId={mockOrgId} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify indicator is displayed during generating
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /نشانگر وضعیت تولید محتوا/i })).toBeDefined();
        expect(screen.getByText("تولید درسنامه")).toBeDefined();
      });

      // 2. Generation phase concludes and enters reviewing: active endpoint returns empty items (or reviewing item)
      mockGetActiveGenerations.mockResolvedValue({
        requestId: "req-gen-2",
        items: [],
      });

      // Invalidate query to trigger refetch
      await queryClient.invalidateQueries({ queryKey: ["active-generations", mockOrgId] });

      rerender(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GlobalGenerationIndicator organizationId={mockOrgId} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify Header indicator is completely removed from DOM
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /نشانگر وضعیت تولید محتوا/i })).toBeNull();
      });
    });

    it("Stop/Delete controls gating: Stop/Delete are only available for active generation phases and never shown post-generation", async () => {
      const onStop = vi.fn();
      const onDelete = vi.fn();

      // 1. Active generation item: Stop and Delete buttons should exist
      const activeGenItem: ActiveGenerationItem = {
        documentId: "doc-active-1",
        documentName: "active-lecture.pdf",
        status: "generating",
        stage: "quiz",
        stageLabel: "تولید آزمون",
        progress: { current: 1, total: 5, percentage: 20 },
        stageStartedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        error: null,
        updatedAt: new Date().toISOString(),
      };

      const { rerender, unmount } = render(
        <GenerationDetailsModal
          isOpen={true}
          onClose={vi.fn()}
          items={[activeGenItem]}
          onStop={onStop}
          onDelete={onDelete}
        />,
      );

      expect(screen.getByRole("button", { name: /توقف تولید/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /حذف تولید/i })).toBeDefined();
      unmount();

      // 2. Reviewing/completed item: Stop button MUST NOT exist
      const reviewingItem: ActiveGenerationItem = {
        documentId: "doc-rev-1",
        documentName: "reviewing-lecture.pdf",
        status: "reviewing",
        stage: "review",
        stageLabel: "بازبینی و اعتبارسنجی",
        progress: null,
        stageStartedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        error: null,
        updatedAt: new Date().toISOString(),
      };

      render(
        <GenerationDetailsModal
          isOpen={true}
          onClose={vi.fn()}
          items={[reviewingItem]}
          onStop={onStop}
          onDelete={onDelete}
        />,
      );

      expect(screen.queryByRole("button", { name: /توقف تولید/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /حذف تولید/i })).toBeNull();
    });
  });
});
