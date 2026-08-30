import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminGenerationPage } from "../pages/admin/AdminGenerationPage";
import { AdminGenerationDetailPage } from "../pages/admin/AdminGenerationDetailPage";
import * as useAdminModule from "../hooks/useAdmin";
import { api } from "../lib/api/admin";

vi.mock("../hooks/useAdmin", () => ({
  useAdmin: vi.fn(),
}));

vi.mock("../lib/api/admin", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
    }
  };
});

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return { queryClient };
}

describe("Admin Generation Center Frontend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("renders generation jobs and handles debounced search (List Page)", async () => {
    const listSpy = vi.fn().mockResolvedValue({
      jobs: [
        { id: "job-1", type: "lesson", status: "completed", userEmail: "test@example.com", documentName: "doc1.pdf", createdAt: new Date().toISOString() },
      ],
      totalCount: 1,
    });
    vi.mocked(useAdminModule.useAdmin).mockReturnValue({
      listGenerationJobs: listSpy,
    } as any);

    const { queryClient } = setup();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/generation"]}>
          <Routes>
            <Route path="/admin/generation" element={<AdminGenerationPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Initial load
    expect(screen.getByText("مرکز هوش مصنوعی (Generation Center)")).toBeInTheDocument();
    
    // Wait for the data
    await waitFor(() => {
      expect(screen.getByText("doc1.pdf")).toBeInTheDocument();
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });

    // Check API call structure
    expect(listSpy).toHaveBeenCalledWith(1, 20, "", ""); // page, pageSize, status, search

    // 2. Search functionality
    const searchInput = screen.getByPlaceholderText(/جستجو بر اساس ایمیل/i);
    fireEvent.change(searchInput, { target: { value: "query" } });

    // Debounce wait
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(1, 20, "", "query");
    }, { timeout: 1000 });
    
    // Status filter
    const statusSelect = screen.getByRole("combobox");
    fireEvent.change(statusSelect, { target: { value: "failed" } });
    
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(1, 20, "failed", "query");
    });
  });

  it("shows empty state when no jobs are found", async () => {
    vi.mocked(useAdminModule.useAdmin).mockReturnValue({
      listGenerationJobs: vi.fn().mockResolvedValue({ jobs: [], totalCount: 0 }),
    } as any);

    const { queryClient } = setup();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/generation"]}>
          <Routes>
            <Route path="/admin/generation" element={<AdminGenerationPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/رکوردی یافت نشد/i)).toBeInTheDocument();
    });
  });

  it("renders detail page with user, doc, token usage, model, payload, and retry", async () => {
    const mockDetail = {
      id: "job-2",
      type: "flashcard",
      status: "failed",
      errorMessage: "AI timeout",
      createdAt: new Date().toISOString(),
      model: "gpt-4",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      payload: { test: "data" },
      user: { id: "u1", email: "user@test.com" },
      document: { id: "d1", originalName: "my-doc.pdf" },
      organization: { id: "org1", name: "Test Org" },
      course: { id: "c1", name: "Biology 101" }
    };

    vi.mocked(api.get).mockResolvedValue(mockDetail);
    
    const retrySpy = vi.fn().mockResolvedValue({ success: true });
    vi.mocked(useAdminModule.useAdmin).mockReturnValue({
      retryGenerationJob: retrySpy,
    } as any);

    const { queryClient } = setup();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/generation/job-2"]}>
          <Routes>
            <Route path="/admin/generation/:id" element={<AdminGenerationDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Initial Loading State
    expect(screen.getByText("در حال بارگذاری...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("در حال بارگذاری...")).not.toBeInTheDocument();
    });

    // Validates relations display
    expect(screen.getByText("user@test.com")).toBeInTheDocument();
    expect(screen.getByText("my-doc.pdf")).toBeInTheDocument();
    expect(screen.getByText("Test Org")).toBeInTheDocument();
    expect(screen.getByText("Biology 101")).toBeInTheDocument();
    
    // Model & Token usage
    expect(screen.getByText("gpt-4")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument(); // total tokens
    
    // Payload json representation
    expect(screen.getByText(/"test": "data"/)).toBeInTheDocument();

    // Error message
    expect(screen.getByText("AI timeout")).toBeInTheDocument();

    // Retry functionality (should be visible for failed job)
    const retryBtn = screen.getByRole("button", { name: /تلاش مجدد/i });
    expect(retryBtn).toBeInTheDocument();
    
    fireEvent.click(retryBtn);

    // Modal opens
    const confirmBtn = screen.getByRole("button", { name: /تأیید/i }); // Ensure this matches the button text in your AdminConfirmModal
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(retrySpy).toHaveBeenCalledWith("job-2");
    });
  });

  it("does not show retry button for successful jobs and handles missing token usage gracefully", async () => {
    const mockDetail = {
      id: "job-3",
      type: "flashcard",
      status: "completed",
      errorMessage: null,
      createdAt: new Date().toISOString(),
      // no token usage, no payload, no user
    };

    vi.mocked(api.get).mockResolvedValue(mockDetail);
    vi.mocked(useAdminModule.useAdmin).mockReturnValue({} as any);

    const { queryClient } = setup();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/generation/job-3"]}>
          <Routes>
            <Route path="/admin/generation/:id" element={<AdminGenerationDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("job-3")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /تلاش مجدد/i })).not.toBeInTheDocument();
    expect(screen.getByText("اطلاعات مصرف توکن موجود نیست")).toBeInTheDocument();
    expect(screen.getByText("برای این Job خروجی تولیدی موجود نیست.")).toBeInTheDocument();
  });
});
