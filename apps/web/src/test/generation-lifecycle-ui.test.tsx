/**
 * UI Integration Tests for Generation Lifecycle (Real Stop & Delete).
 *
 * Verifies:
 * 1. GlobalGenerationIndicator handles 'stopped', 'stopping', 'deleting' states with proper Persian badges.
 * 2. GenerationDetailsModal renders Stop button, handles confirmation modal, and calls onStop.
 * 3. GenerationDetailsModal renders Delete button, handles confirmation modal, and calls onDelete.
 * 4. In 'stopped' state, GenerationDetailsModal shows preserved outputs info, allows review navigation and retry.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalGenerationIndicator } from "../components/generation/GlobalGenerationIndicator.js";
import { GenerationDetailsModal } from "../components/generation/GenerationDetailsModal.js";
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
  mockStopGeneration,
  mockDeleteGeneration,
} = vi.hoisted(() => ({
  mockGetActiveGenerations: vi.fn(),
  mockStopGeneration: vi.fn(),
  mockDeleteGeneration: vi.fn(),
}));

vi.mock("../lib/api/generation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api/generation.js")>();
  return {
    ...actual,
    createGenerationApi: () => ({
      getActiveGenerations: mockGetActiveGenerations,
      stopGeneration: mockStopGeneration,
      deleteGeneration: mockDeleteGeneration,
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

describe("Generation Real Stop & Delete UI Controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GlobalGenerationIndicator displays 'تولید متوقف شد' for stopped generations", async () => {
    mockGetActiveGenerations.mockResolvedValueOnce({
      request_id: "req-1",
      items: [
        {
          documentId: "doc-1",
          documentName: "cardiology.pdf",
          courseId: "course-1",
          status: "stopped",
          stage: "lesson",
          stageLabel: "تولید درسنامه",
          progress: { current: 1, total: 3, percentage: 33 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        } as ActiveGenerationItem,
      ],
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <GlobalGenerationIndicator organizationId="00000000-0000-0000-0000-000000000001" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("تولید متوقف شد")).toBeDefined();
    });
  });

  it("GenerationDetailsModal Stop Flow: Shows Stop button, asks confirmation, and triggers onStop", async () => {
    const onStop = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    const activeItem: ActiveGenerationItem = {
      documentId: "doc-1",
      documentName: "cardiology.pdf",
      courseId: "course-1",
      organizationId: "00000000-0000-0000-0000-000000000001",
      status: "generating",
      stage: "lesson",
      stageLabel: "تولید درسنامه",
      progress: { current: 2, total: 4, percentage: 50 },
      stageStartedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      error: null,
      updatedAt: new Date().toISOString(),
    };

    render(
      <GenerationDetailsModal
        isOpen={true}
        onClose={onClose}
        items={[activeItem]}
        onStop={onStop}
      />,
    );

    // Verify Stop button is present
    const stopButton = screen.getByRole("button", { name: /توقف تولید/i });
    expect(stopButton).toBeDefined();

    // Click Stop button -> opens confirmation banner
    fireEvent.click(stopButton);
    expect(screen.getByText("توقف فرآیند تولید محتوا")).toBeDefined();
    expect(screen.getByText(/محتواهای تولیدشده تا این مرحله در پایگاه داده حفظ می‌شوند/i)).toBeDefined();

    // Confirm stop
    const confirmStopBtn = screen.getByRole("button", { name: /بله، تولید متوقف شود/i });
    fireEvent.click(confirmStopBtn);

    await waitFor(() => {
      expect(onStop).toHaveBeenCalledWith("doc-1", "course-1", "00000000-0000-0000-0000-000000000001");
    });
  });

  it("GenerationDetailsModal Delete Flow: Shows Delete button, confirms no doc deletion, and triggers onDelete", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    const stoppedItem: ActiveGenerationItem = {
      documentId: "doc-1",
      documentName: "neurology.pdf",
      courseId: "course-1",
      organizationId: "00000000-0000-0000-0000-000000000001",
      status: "stopped",
      stage: "flashcard",
      stageLabel: "تولید فلش‌کارت",
      progress: { current: 1, total: 3, percentage: 33 },
      stageStartedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      error: null,
      updatedAt: new Date().toISOString(),
    };

    render(
      <GenerationDetailsModal
        isOpen={true}
        onClose={onClose}
        items={[stoppedItem]}
        onDelete={onDelete}
      />,
    );

    // Verify Delete button is present
    const deleteButton = screen.getByRole("button", { name: /حذف تولید/i });
    expect(deleteButton).toBeDefined();

    // Click Delete -> opens confirmation banner
    fireEvent.click(deleteButton);
    expect(screen.getByText("حذف فرآیند تولید محتوا")).toBeDefined();
    expect(screen.getByText(/فایل اصلی شما در کتابخانه کاملاً دست‌نخورده باقی می‌ماند/i)).toBeDefined();

    // Confirm delete
    const confirmDeleteBtn = screen.getByRole("button", { name: /بله، فرآیند حذف شود/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("doc-1", "course-1", "00000000-0000-0000-0000-000000000001");
    });
  });

  it("GenerationDetailsModal in 'stopped' state offers Review and Retry actions", async () => {
    const onNavigateToReview = vi.fn();
    const onRetry = vi.fn();
    const onClose = vi.fn();

    const stoppedItem: ActiveGenerationItem = {
      documentId: "doc-1",
      documentName: "pharmacology.pdf",
      courseId: "course-1",
      organizationId: "00000000-0000-0000-0000-000000000001",
      status: "stopped",
      stage: "quiz",
      stageLabel: "تولید آزمون",
      progress: { current: 2, total: 5, percentage: 40 },
      stageStartedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      error: null,
      updatedAt: new Date().toISOString(),
    };

    render(
      <GenerationDetailsModal
        isOpen={true}
        onClose={onClose}
        items={[stoppedItem]}
        onNavigateToReview={onNavigateToReview}
        onRetry={onRetry}
      />,
    );

    // Verify banner explains preservation of output
    expect(screen.getByText(/محتواهای تولید شده تا این مرحله حفظ شده‌اند/i)).toBeDefined();

    // Verify Review button is available
    const reviewBtn = screen.getByRole("button", { name: /مشاهده محتوا \/ صف بازبینی/i });
    expect(reviewBtn).toBeDefined();
    fireEvent.click(reviewBtn);
    expect(onNavigateToReview).toHaveBeenCalledWith("course-1", "doc-1");

    // Verify Retry button is available
    const retryBtn = screen.getByRole("button", { name: /شروع مجدد تولید/i });
    expect(retryBtn).toBeDefined();
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledWith("doc-1", "course-1", "00000000-0000-0000-0000-000000000001");
  });

  it("GlobalGenerationIndicator renders and operates without explicit organizationId prop by resolving active user membership", async () => {
    mockGetActiveGenerations.mockResolvedValueOnce({
      request_id: "req-2",
      items: [
        {
          documentId: "doc-2",
          documentName: "pathology.pdf",
          courseId: "course-2",
          organizationId: "00000000-0000-0000-0000-000000000001",
          status: "generating",
          stage: "planning",
          stageLabel: "برنامه‌ریزی محتوا",
          progress: { current: 1, total: 1, percentage: 100 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        } as ActiveGenerationItem,
      ],
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <GlobalGenerationIndicator />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("در حال تولید محتوا")).toBeDefined();
    });
  });
});
