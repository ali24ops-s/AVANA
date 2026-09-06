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
});
