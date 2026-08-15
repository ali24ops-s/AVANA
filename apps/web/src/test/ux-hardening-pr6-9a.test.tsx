/**
 * PR6-9A UX & Product Hardening Comprehensive Test Suite.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createApiClient } from "../lib/api/client.js";
import { ApiError } from "../lib/api/errors.js";
import { AuthProvider } from "../providers/AuthProvider.js";
import { AuthenticatedShell } from "../components/shell/AuthenticatedShell.js";
import { ReviewQueueList } from "../components/review/ReviewQueueList.js";
import { EditContentDialog } from "../components/review/EditContentDialog.js";
import { RejectContentDialog } from "../components/review/RejectContentDialog.js";
import { QuizListView } from "../components/quiz/QuizListView.js";
import { DocumentUploader } from "../components/documents/DocumentUploader.js";
import { FlashcardExperience } from "../components/flashcards/FlashcardExperience.js";
import type { ReactNode } from "react";
import type { GeneratedContentResource, FlashcardResource } from "@avana/contracts";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithClient(ui: ReactNode, queryClient = createTestQueryClient()) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/"]}>{ui}</MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe("PR6-9A Hardening: API Resilience", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles non-JSON 502 Bad Gateway response without JSON parse crash", async () => {
    const mockResponse = {
      ok: false,
      status: 502,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve("<html><body>502 Bad Gateway</body></html>"),
    } as unknown as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    const client = createApiClient({ baseUrl: "" });
    await expect(client.get("/v1/courses")).rejects.toThrow(ApiError);

    try {
      await client.get("/v1/courses");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe("internal_error");
      expect(apiErr.statusCode).toBe(500);
      expect(apiErr.message).toContain("Service temporarily unavailable");
    }
  });

  it("handles non-JSON 413 Payload Too Large error gracefully", async () => {
    const mockResponse = {
      ok: false,
      status: 413,
      headers: new Headers({ "content-type": "text/plain" }),
      text: () => Promise.resolve("Request Entity Too Large"),
    } as unknown as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    const client = createApiClient({ baseUrl: "" });
    try {
      await client.post("/v1/organizations/org-1/documents", {});
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe("bad_request");
      expect(apiErr.message).toContain("The uploaded file is too large");
    }
  });

  it("ApiError constructor handles null or malformed envelopes safely", () => {
    const err = new ApiError(null);
    expect(err.message).toBe("An unexpected error occurred");
    expect(err.code).toBe("internal_error");
    expect(err.statusCode).toBe(500);
    expect(err.requestId).toBe("");
  });
});

describe("PR6-9A Hardening: Shell Navigation & Active Route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("links to /courses and maintains active highlight for /courses and sub-routes", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            request_id: "req-1",
            user: { id: "u-1", email: "doc@avana.test", role: "student" },
          }),
        ),
    } as unknown as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMeResponse);

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/courses/c123/manage"]}>
          <AuthProvider>
            <Routes>
              <Route element={<AuthenticatedShell />}>
                <Route
                  path="courses/:courseId/manage"
                  element={<div data-testid="manage-page">Manage</div>}
                />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("دوره‌ها")).toBeInTheDocument();
    });

    const coursesLink = screen.getByRole("link", { name: "دوره‌ها" });
    expect(coursesLink).toHaveAttribute("href", "/courses");
    expect(coursesLink.className).toContain("text-[#008080]");
  });
});

describe("PR6-9A Hardening: Review Dialogs Query Invalidation Key Fix", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("EditContentDialog invalidates review-detail key upon successful edit", async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            request_id: "req-edit",
            content: {
              id: "content-1",
              generation_id: "gen-1",
              type: "lesson",
              status: "draft",
              payload: { title: "Updated Title", content_markdown: "# Content" },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        ),
    } as unknown as Response);

    const sampleContent: GeneratedContentResource = {
      id: "content-1",
      document_id: "doc-1",
      course_id: "course-1",
      type: "lesson",
      status: "draft",
      payload: { title: "Original Title", content_markdown: "# Original" },
      prompt_version: null,
      model: null,
      token_usage: { input_tokens: 10, output_tokens: 20 },
      citations: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    render(
      <QueryClientProvider client={queryClient}>
        <EditContentDialog
          content={sampleContent}
          organizationId="org-1"
          courseId="course-1"
          isOpen={true}
          onClose={() => {}}
        />
      </QueryClientProvider>,
    );

    const saveBtn = screen.getByRole("button", { name: /ذخیره تغییرات/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["review-detail", "org-1", "course-1", "content-1"],
        }),
      );
    });
  });

  it("RejectContentDialog invalidates review-detail key upon successful rejection", async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            request_id: "req-reject",
            content: {
              id: "content-2",
              document_id: "doc-1",
              course_id: "course-1",
              type: "quiz",
              status: "rejected",
              payload: {},
              prompt_version: null,
              model: null,
              token_usage: { input_tokens: 10, output_tokens: 20 },
              citations: [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        ),
    } as unknown as Response);

    render(
      <QueryClientProvider client={queryClient}>
        <RejectContentDialog
          contentId="content-2"
          organizationId="org-1"
          courseId="course-1"
          isOpen={true}
          onClose={() => {}}
        />
      </QueryClientProvider>,
    );

    const reasonInput = screen.getByPlaceholderText(/ناقص بودن عوارض دارویی/i);
    fireEvent.change(reasonInput, { target: { value: "Inaccurate dosing guide" } });

    const confirmBtn = screen.getByRole("button", { name: /تایید رد پیش‌نویس/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["review-detail", "org-1", "course-1", "content-2"],
        }),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["review-queue", "org-1", "course-1"],
        }),
      );
    });
  });
});

describe("PR6-9A Hardening: Accessibility & Error States", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("ReviewQueueList renders items as semantic accessible buttons with retry on error", async () => {
    const mockErrorResponse = {
      ok: false,
      status: 500,
      text: () => Promise.resolve(JSON.stringify({ error: { message: "Queue DB Error" } })),
    } as unknown as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockErrorResponse);

    renderWithClient(
      <ReviewQueueList organizationId="org-1" courseId="course-1" />,
    );

    await waitFor(() => {
      expect(screen.getByText("خطا در بارگذاری صف بازبینی")).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole("button", { name: /تلاش مجدد/i });
    expect(retryBtn).toBeInTheDocument();

    // Now mock success on retry
    const mockSuccessResponse = {
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            request_id: "req-q",
            pending: [
              {
                id: "item-1",
                document_id: "doc-1",
                course_id: "course-1",
                type: "lesson",
                title: "Cardiology Principles",
                status: "draft",
                updated_at: new Date().toISOString(),
              },
            ],
          }),
        ),
    } as unknown as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse);

    fireEvent.click(retryBtn);

    await waitFor(() => {
      const draftBtn = screen.getByRole("button", {
        name: /بازبینی پیش‌نویس lesson: cardiology principles/i,
      });
      expect(draftBtn).toBeInTheDocument();
    });
  });

  it("QuizListView renders quiz items as semantic accessible buttons", async () => {
    const mockSuccessResponse = {
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            request_id: "req-quiz",
            quizzes: [
              {
                id: "quiz-1",
                title: "Renal Physiology Mastery",
                status: "published",
                created_at: new Date().toISOString(),
              },
            ],
          }),
        ),
    } as unknown as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockSuccessResponse);

    renderWithClient(
      <QuizListView organizationId="org-1" courseId="course-1" />,
    );

    await waitFor(() => {
      const quizBtn = screen.getByRole("button", {
        name: /شرکت در آزمون: renal physiology mastery/i,
      });
      expect(quizBtn).toBeInTheDocument();
    });
  });

  it("DocumentUploader dropzone supports keyboard activation", () => {
    renderWithClient(
      <DocumentUploader organizationId="org-1" courseId="course-1" />,
    );

    const dropzone = screen.getByRole("button", {
      name: /فایل‌ها را به این قسمت بکشید یا برای انتخاب کلیک کنید/i,
    });
    expect(dropzone).toHaveAttribute("tabindex", "0");

    const fileInput = screen.getByTestId("document-file-input");
    const clickSpy = vi.spyOn(fileInput, "click");

    fireEvent.keyDown(dropzone, { key: "Enter" });
    expect(clickSpy).toHaveBeenCalled();
  });

  it("FlashcardExperience supports keyboard flip and rating buttons", async () => {
    const mockCards: FlashcardResource[] = [
      {
        id: "fc-1",
        organization_id: "org-1",
        course_id: "course-1",
        document_id: "doc-1",
        generated_content_id: null,
        card_type: "concept",
        difficulty: "medium",
        question: "What is the primary pacemaker of the heart?",
        answer: "Sinoatrial (SA) node",
        explanation: "Generates action potentials at 60-100 bpm",
        interval_days: 1,
        ease_factor: 2.5,
        due_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            request_id: "req-fc",
            due_cards: mockCards,
            flashcards: mockCards,
          }),
        ),
    } as unknown as Response);

    renderWithClient(
      <FlashcardExperience organizationId="org-1" courseId="course-1" />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("What is the primary pacemaker of the heart?"),
      ).toBeInTheDocument();
    });

    const cardButton = screen.getByRole("button", {
      name: /سوال فلش‌کارت/i,
    });
    expect(cardButton).toBeInTheDocument();

    // Trigger flip via space key
    fireEvent.keyDown(cardButton, { key: " " });

    await waitFor(() => {
      expect(screen.getByText("Sinoatrial (SA) node")).toBeInTheDocument();
    });

    // Rating buttons should be visible
    expect(screen.getByRole("button", { name: /تکرار/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /سخت/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /خوب/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /آسان/i })).toBeInTheDocument();
  });
});
