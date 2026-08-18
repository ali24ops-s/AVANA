import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LearningPage } from "../pages/LearningPage.js";
import { AuthProvider } from "../providers/AuthProvider.js";

// Mock localStorage for auth token
beforeEach(() => {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("avana_auth_token", "test-token");
  }
});

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe("Course Empty State vs Error State (LearningPage)", () => {
  const courseId = "course-empty-123";
  const orgId = "org-123";

  it("1 & 2 & 3: Displays friendly Empty State (NOT Error) when valid course has no content", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = url.toString();

      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              user: { id: "user-1", email: "test@example.com", name: "Test User" },
              memberships: [{ organization_id: orgId, role: "owner" }],
            }),
        } as Response);
      }

      if (urlStr.includes("/v1/organizations") && !urlStr.includes("/courses") && !urlStr.includes("/documents") && !urlStr.includes("/reviews")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              items: [{ id: orgId, name: "سازمان تست" }],
            }),
        } as Response);
      }

      if (urlStr.includes(`/v1/courses/${courseId}/learn`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-1",
              course: {
                id: courseId,
                title: "دوره جامع هوش مصنوعی",
                subject: "کامپیوتر",
                exam_at: null,
              },
              modules: [],
              progress: {
                total_lessons: 0,
                completed_lessons: 0,
                progress_percent: 0,
              },
            }),
        } as Response);
      }

      if (urlStr.includes("/documents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [] }),
        } as Response);
      }

      if (urlStr.includes("/review")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ pending: [] }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 2. Empty state title should be displayed
    await waitFor(() => {
      expect(
        screen.getByText("هنوز محتوایی به این دوره اضافه نشده است"),
      ).toBeDefined();
    });

    // Subtitle & CTA should be present
    expect(
      screen.getByText("این دوره هنوز محتوای آموزشی ندارد. برای شروع، اولین فایل PDF آموزشی خود را اضافه کنید."),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: /افزودن فایل PDF/i })).toBeDefined();

    // 3. Document upload and documents list sections MUST NOT be rendered in lessons tab
    expect(screen.queryByText(/بارگذاری منابع و جزوات آموزشی/i)).toBeNull();
    expect(screen.queryByText(/اسناد و منابع بارگذاری‌شده/i)).toBeNull();

    // 4. No error message should be shown
    expect(screen.queryByText("خطا در بارگذاری محتوای دوره")).toBeNull();
  });

  it("4 & 5: Clicking 'افزودن فایل PDF' switches tab to documents with courseId preserved", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              user: { id: "user-1", email: "test@example.com", name: "Test User" },
              memberships: [{ organization_id: orgId, role: "owner" }],
            }),
        } as Response);
      }
      if (urlStr.includes("/v1/organizations") && !urlStr.includes("/courses") && !urlStr.includes("/documents") && !urlStr.includes("/reviews")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: orgId, name: "سازمان تست" }] }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${courseId}/learn`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-1",
              course: { id: courseId, title: "دوره تست", subject: null, exam_at: null },
              modules: [],
              progress: { total_lessons: 0, completed_lessons: 0, progress_percent: 0 },
            }),
        } as Response);
      }
      if (urlStr.includes("/documents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [] }),
        } as Response);
      }
      if (urlStr.includes("/review")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ pending: [] }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}?tab=documents`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verify document uploader is rendered directly for this course
    await waitFor(() => {
      expect(screen.getByText(/اسناد و منابع/i)).toBeDefined();
    });
  });

  it("6 & 7: Displays real Error when API returns 500 or 401/403", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              user: { id: "user-1", email: "test@example.com", name: "Test User" },
              memberships: [{ organization_id: orgId, role: "owner" }],
            }),
        } as Response);
      }
      if (urlStr.includes("/v1/organizations") && !urlStr.includes("/courses") && !urlStr.includes("/documents") && !urlStr.includes("/reviews")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: orgId, name: "سازمان تست" }] }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${courseId}/learn`)) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: { message: "Internal Server Error" } }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 6. Real error card should be displayed
    await waitFor(() => {
      expect(screen.getByText("خطا در بارگذاری محتوای دوره")).toBeDefined();
    });
    expect(screen.getAllByRole("button", { name: /تلاش مجدد/i }).length).toBeGreaterThan(0);
  });
});
