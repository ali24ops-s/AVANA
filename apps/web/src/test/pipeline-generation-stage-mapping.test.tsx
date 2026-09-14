/**
 * Pipeline Generation Stage Mapping & Parity Tests.
 *
 * Verifies:
 * 1. Exact Persian label mapping for each stage:
 *    queued → صف
 *    planning → برنامه‌ریزی
 *    lessons → تولید درس‌ها
 *    flashcards → تولید فلش‌کارت‌ها
 *    mcqs → تولید سوالات
 *    completed → تکمیل
 * 2. Stage transitions from queued -> planning -> lessons -> flashcards -> mcqs -> completed
 *    guaranteeing User UI tracks the active stage accurately without being stuck on planning/step 0.
 * 3. Regression test guaranteeing Admin and User UI display the same canonical stage for identical state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  normalizeGenerationStage,
  CANONICAL_STAGE_LABELS_FA,
  type CanonicalGenerationStage,
} from "@avana/domain";
import { GlobalGenerationIndicator } from "../components/generation/GlobalGenerationIndicator.js";
import { GenerationDetailsModal } from "../components/generation/GenerationDetailsModal.js";
import { AdminDocumentDetailPage } from "../pages/admin/AdminDocumentDetailPage.js";
import type { ActiveGenerationItem } from "../lib/api/generation.js";

// Mock AuthProvider
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "admin@avana.ir", role: "organization_admin" },
    memberships: [{ organization_id: "00000000-0000-0000-0000-000000000001", role: "organization_admin" }],
    isAuthenticated: true,
  }),
}));

const { mockGetActiveGenerations, mockAdminGet } = vi.hoisted(() => ({
  mockGetActiveGenerations: vi.fn(),
  mockAdminGet: vi.fn(),
}));

vi.mock("../lib/api/generation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api/generation.js")>();
  return {
    ...actual,
    createGenerationApi: () => ({
      getActiveGenerations: mockGetActiveGenerations,
    }),
  };
});

vi.mock("../lib/api/admin.js", () => ({
  api: {
    get: mockAdminGet,
  },
}));

vi.mock("../hooks/useAdmin.js", () => ({
  useAdmin: () => ({
    retryDocument: vi.fn(),
    deleteDocument: vi.fn(),
    getDownloadUrl: vi.fn(() => "http://download"),
  }),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

describe("Pipeline Generation Stage Mapping & Traceability", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockDocId = "doc-test-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Canonical Stage Label & Normalization Mapping", () => {
    const expectedMappings: Array<{
      inputStage: string | null;
      inputStatus?: string;
      expectedCanonical: CanonicalGenerationStage;
      expectedLabelFa: string;
    }> = [
      { inputStage: null, inputStatus: "queued", expectedCanonical: "queued", expectedLabelFa: "صف" },
      { inputStage: "queued", expectedCanonical: "queued", expectedLabelFa: "صف" },
      { inputStage: "planning", expectedCanonical: "planning", expectedLabelFa: "برنامه‌ریزی" },
      { inputStage: "analysis", expectedCanonical: "planning", expectedLabelFa: "برنامه‌ریزی" },
      { inputStage: "lesson", expectedCanonical: "lessons", expectedLabelFa: "تولید درس‌ها" },
      { inputStage: "lessons", expectedCanonical: "lessons", expectedLabelFa: "تولید درس‌ها" },
      { inputStage: "flashcard", expectedCanonical: "flashcards", expectedLabelFa: "تولید فلش‌کارت‌ها" },
      { inputStage: "flashcards", expectedCanonical: "flashcards", expectedLabelFa: "تولید فلش‌کارت‌ها" },
      { inputStage: "quiz", expectedCanonical: "mcqs", expectedLabelFa: "تولید سوالات" },
      { inputStage: "quizzes", expectedCanonical: "mcqs", expectedLabelFa: "تولید سوالات" },
      { inputStage: "mcq", expectedCanonical: "mcqs", expectedLabelFa: "تولید سوالات" },
      { inputStage: "mcqs", expectedCanonical: "mcqs", expectedLabelFa: "تولید سوالات" },
      { inputStage: "exam", expectedCanonical: "mcqs", expectedLabelFa: "تولید سوالات" },
      { inputStage: null, inputStatus: "completed", expectedCanonical: "completed", expectedLabelFa: "تکمیل" },
      { inputStage: "completed", expectedCanonical: "completed", expectedLabelFa: "تکمیل" },
    ];

    expectedMappings.forEach(({ inputStage, inputStatus, expectedCanonical, expectedLabelFa }) => {
      it(`maps stage="${inputStage}" (status="${inputStatus || ""}") -> canonical "${expectedCanonical}" -> label "${expectedLabelFa}"`, () => {
        const canonical = normalizeGenerationStage(inputStage, inputStatus);
        expect(canonical).toBe(expectedCanonical);
        expect(CANONICAL_STAGE_LABELS_FA[canonical]).toBe(expectedLabelFa);
      });
    });
  });

  describe("2. Single-Mount Live Stage Transitions & Polling Refetch", () => {
    it("dynamically updates active stage without unmounting as API responses progress", async () => {
      const queryClient = createTestQueryClient();

      let currentStepIndex = 0;
      const steps: ActiveGenerationItem[] = [
        {
          documentId: mockDocId,
          documentName: "pharmacology-cardio.pdf",
          courseId: "course-1",
          organizationId: mockOrgId,
          status: "queued",
          stage: null,
          stageLabel: null,
          progress: null,
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        },
        {
          documentId: mockDocId,
          documentName: "pharmacology-cardio.pdf",
          courseId: "course-1",
          organizationId: mockOrgId,
          status: "planning",
          stage: "planning",
          stageLabel: null,
          progress: { current: 1, total: 1, percentage: 10 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        },
        {
          documentId: mockDocId,
          documentName: "pharmacology-cardio.pdf",
          courseId: "course-1",
          organizationId: mockOrgId,
          status: "generating",
          stage: "lesson",
          stageLabel: null,
          progress: { current: 2, total: 8, percentage: 35 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        },
        {
          documentId: mockDocId,
          documentName: "pharmacology-cardio.pdf",
          courseId: "course-1",
          organizationId: mockOrgId,
          status: "generating",
          stage: "flashcard",
          stageLabel: null,
          progress: { current: 4, total: 8, percentage: 60 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        },
        {
          documentId: mockDocId,
          documentName: "pharmacology-cardio.pdf",
          courseId: "course-1",
          organizationId: mockOrgId,
          status: "generating",
          stage: "quiz",
          stageLabel: null,
          progress: { current: 7, total: 8, percentage: 85 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        },
      ];

      mockGetActiveGenerations.mockImplementation(async () => ({
        request_id: `req-step-${currentStepIndex}`,
        items: [steps[currentStepIndex]],
      }));

      // Render ONCE without unmounting
      const { unmount } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GlobalGenerationIndicator organizationId={mockOrgId} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Step 0: queued -> "صف"
      await waitFor(() => {
        expect(screen.getByText(/صف/i)).toBeInTheDocument();
      });

      // Step 1: planning -> "برنامه‌ریزی"
      currentStepIndex = 1;
      await queryClient.refetchQueries({ queryKey: ["active-generations", mockOrgId] });
      await waitFor(() => {
        expect(screen.getByText(/برنامه‌ریزی/i)).toBeInTheDocument();
        expect(screen.getByText(/10٪/)).toBeInTheDocument();
      });

      // Step 2: lesson -> "تولید درس‌ها"
      currentStepIndex = 2;
      await queryClient.refetchQueries({ queryKey: ["active-generations", mockOrgId] });
      await waitFor(() => {
        expect(screen.getByText(/تولید درس‌ها/i)).toBeInTheDocument();
        expect(screen.getByText(/35٪/)).toBeInTheDocument();
        expect(screen.getByText(/2\/8/)).toBeInTheDocument();
      });

      // Step 3: flashcard -> "تولید فلش‌کارت‌ها"
      currentStepIndex = 3;
      await queryClient.refetchQueries({ queryKey: ["active-generations", mockOrgId] });
      await waitFor(() => {
        expect(screen.getByText(/تولید فلش‌کارت‌ها/i)).toBeInTheDocument();
        expect(screen.getByText(/60٪/)).toBeInTheDocument();
        expect(screen.getByText(/4\/8/)).toBeInTheDocument();
      });

      // Step 4: quiz -> "تولید سوالات"
      currentStepIndex = 4;
      await queryClient.refetchQueries({ queryKey: ["active-generations", mockOrgId] });
      await waitFor(() => {
        expect(screen.getByText(/تولید سوالات/i)).toBeInTheDocument();
        expect(screen.getByText(/85٪/)).toBeInTheDocument();
        expect(screen.getByText(/7\/8/)).toBeInTheDocument();
      });

      unmount();
    });

    it("immediately overwrites stale stage (e.g. planning -> lessons) without lingering old text", async () => {
      const queryClient = createTestQueryClient();

      const planningItem: ActiveGenerationItem = {
        documentId: mockDocId,
        documentName: "test.pdf",
        courseId: "course-1",
        organizationId: mockOrgId,
        status: "planning",
        stage: "planning",
        stageLabel: "برنامه‌ریزی",
        progress: { current: 1, total: 1, percentage: 10 },
        stageStartedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        error: null,
        updatedAt: new Date().toISOString(),
      };

      const lessonItem: ActiveGenerationItem = {
        documentId: mockDocId,
        documentName: "test.pdf",
        courseId: "course-1",
        organizationId: mockOrgId,
        status: "generating",
        stage: "lesson",
        stageLabel: null,
        progress: { current: 1, total: 5, percentage: 30 },
        stageStartedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        error: null,
        updatedAt: new Date().toISOString(),
      };

      let active = planningItem;
      mockGetActiveGenerations.mockImplementation(async () => ({
        request_id: "req-1",
        items: [active],
      }));

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GlobalGenerationIndicator organizationId={mockOrgId} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/برنامه‌ریزی/i)).toBeInTheDocument();
      });

      // Backend advances to lesson stage
      active = lessonItem;
      await queryClient.refetchQueries({ queryKey: ["active-generations", mockOrgId] });

      await waitFor(() => {
        expect(screen.getByText(/تولید درس‌ها/i)).toBeInTheDocument();
        expect(screen.queryByText(/برنامه‌ریزی/i)).toBeNull();
      });
    });

    it("handles transition to completed gracefully", async () => {
      const queryClient = createTestQueryClient();

      let items: ActiveGenerationItem[] = [
        {
          documentId: mockDocId,
          documentName: "test.pdf",
          courseId: "course-1",
          organizationId: mockOrgId,
          status: "generating",
          stage: "quiz",
          stageLabel: null,
          progress: { current: 8, total: 8, percentage: 95 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        },
      ];

      mockGetActiveGenerations.mockImplementation(async () => ({
        request_id: "req-1",
        items,
      }));

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GlobalGenerationIndicator organizationId={mockOrgId} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/تولید سوالات/i)).toBeInTheDocument();
      });

      // Backend completes generation (status: completed)
      items = [
        {
          ...items[0],
          status: "completed",
          stage: "completed",
          progress: { current: 8, total: 8, percentage: 100 },
        },
      ];

      await queryClient.refetchQueries({ queryKey: ["active-generations", mockOrgId] });

      // Active indicator dismisses/hides cleanly when no active item remains in queue
      await waitFor(() => {
        expect(screen.queryByText(/تولید سوالات/i)).toBeNull();
        expect(screen.queryByRole("button", { name: /نشانگر وضعیت تولید محتوا/i })).toBeNull();
      });
    });

    it("verifies Modal Timeline shows active step progress for single mount across all stages", async () => {
      const initialItem: ActiveGenerationItem = {
        documentId: mockDocId,
        documentName: "test-timeline.pdf",
        courseId: "course-1",
        organizationId: mockOrgId,
        status: "generating",
        stage: "lesson",
        stageLabel: null,
        progress: { current: 3, total: 10, percentage: 30 },
        stageStartedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        error: null,
        updatedAt: new Date().toISOString(),
      };

      const { rerender } = render(
        <GenerationDetailsModal
          isOpen={true}
          onClose={vi.fn()}
          items={[initialItem]}
        />,
      );

      // Verify lesson is active
      expect(screen.getByText("3 / 10")).toBeInTheDocument();

      // Transition to flashcards
      const updatedItem: ActiveGenerationItem = {
        ...initialItem,
        stage: "flashcard",
        progress: { current: 6, total: 10, percentage: 60 },
      };

      rerender(
        <GenerationDetailsModal
          isOpen={true}
          onClose={vi.fn()}
          items={[updatedItem]}
        />,
      );

      expect(screen.getByText("6 / 10")).toBeInTheDocument();
    });
  });

  describe("3. Regression Parity Test: Admin UI & User UI Stage Consistency", () => {
    const testCases: Array<{
      backendStage: string;
      backendStatus: string;
      expectedCanonical: CanonicalGenerationStage;
    }> = [
      { backendStage: "planning", backendStatus: "planning", expectedCanonical: "planning" },
      { backendStage: "lesson", backendStatus: "generating", expectedCanonical: "lessons" },
      { backendStage: "flashcard", backendStatus: "generating", expectedCanonical: "flashcards" },
      { backendStage: "quiz", backendStatus: "generating", expectedCanonical: "mcqs" },
    ];

    testCases.forEach(({ backendStage, backendStatus, expectedCanonical }) => {
      it(`resolves the exact same canonical stage (${expectedCanonical}) across Admin UI and User UI for stage="${backendStage}"`, async () => {
        // 1. Check User UI resolution
        const userResolved = normalizeGenerationStage(backendStage, backendStatus);
        expect(userResolved).toBe(expectedCanonical);

        // 2. Check Admin UI integration
        mockAdminGet.mockResolvedValue({
          id: mockDocId,
          originalName: "test-doc.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024000,
          status: backendStatus,
          createdAt: new Date().toISOString(),
          generationProgress: {
            status: backendStatus,
            stage: backendStage,
            stageLabel: CANONICAL_STAGE_LABELS_FA[expectedCanonical],
            progress: { current: 3, total: 6, percentage: 50 },
            stageStartedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            error: null,
          },
        });

        const queryClient = createTestQueryClient();

        render(
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[`/admin/documents/${mockDocId}`]}>
              <Routes>
                <Route path="/admin/documents/:id" element={<AdminDocumentDetailPage />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>,
        );

        // Admin page should display the stage label matching the canonical stage
        await waitFor(() => {
          expect(screen.getAllByText(new RegExp(CANONICAL_STAGE_LABELS_FA[expectedCanonical], "i")).length).toBeGreaterThan(0);
        });
      });
    });
  });
});

