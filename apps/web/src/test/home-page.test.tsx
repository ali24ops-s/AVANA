import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { HomePage } from "../pages/HomePage.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("HomePage Component", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const courseId = "00000000-0000-0000-0000-000000000002";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders Persian hero title, subtitle, CTA, 4-step workflow, and capability cards", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-me",
              user: {
                id: "user-1",
                email: "student@avana.ir",
                role: "student",
              },
            }),
        } as Response);
      }
      if (urlStr.includes("/organizations/") && urlStr.includes("/courses")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-c",
              items: [
                {
                  id: courseId,
                  organization_id: orgId,
                  title: "فیزیولوژی قلب و عروق",
                  subject: "پزشکی",
                  code: "MED101",
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
            }),
        } as Response);
      }
      if (urlStr.includes("/organizations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-orgs",
              items: [{ id: orgId, name: "دانشگاه آوانا", slug: "avana-univ" }],
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/home"]}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Verify Persian Hero section
    expect(screen.getByText("آوانا؛ همراه هوشمند یادگیری شما")).toBeInTheDocument();
    expect(
      screen.getByText(
        /جزوات و فایل‌های درسی PDF خود را بارگذاری کنید/i,
      ),
    ).toBeInTheDocument();

    // Verify CTA buttons
    const ctaButton = screen.getByRole("link", { name: /شروع یادگیری/i });
    expect(ctaButton).toBeInTheDocument();
    expect(ctaButton).toHaveAttribute("href", "/courses");

    expect(screen.getByText("بارگذاری فایل PDF")).toBeInTheDocument();

    // Verify PDF upload section in start learning area
    expect(screen.getByText("شروع یادگیری با بارگذاری منبع درسی")).toBeInTheDocument();
    expect(screen.getByText("بارگذاری فایل PDF و تولید بسته یادگیری")).toBeInTheDocument();

    // Verify 4-step workflow
    expect(screen.getByText("چطور با آوانا یاد بگیریم؟")).toBeInTheDocument();
    expect(screen.getByText("بارگذاری یا انتخاب درس")).toBeInTheDocument();
    expect(screen.getByText("یادگیری")).toBeInTheDocument();
    expect(screen.getByText("مرور")).toBeInTheDocument();
    expect(screen.getByText("ارزیابی")).toBeInTheDocument();

    // Verify real capability cards (NO fake AI LLM claims)
    expect(screen.getByText("دوره‌ها و درس‌ها")).toBeInTheDocument();
    expect(screen.getByText("مطالعه و ثبت پیشرفت")).toBeInTheDocument();
    expect(screen.getByText("فلش‌کارت‌های مرور فاصله‌دار")).toBeInTheDocument();
    expect(screen.getByText("آزمون‌های خودسنجی")).toBeInTheDocument();
    expect(screen.getByText("تحلیل پیشرفت و عملکرد")).toBeInTheDocument();
    expect(screen.getByText("پیشنهادهای مطالعه")).toBeInTheDocument();
    expect(screen.getByText("مدیریت منابع و اسناد")).toBeInTheDocument();

    // Verify user courses and document uploader loaded from real API
    await waitFor(() => {
      expect(screen.getByText("فیزیولوژی قلب و عروق")).toBeInTheDocument();
      expect(screen.getByText("ورود به دوره")).toBeInTheDocument();
      expect(screen.getByText(/فایل جزوه، اسلاید یا سرفصل دوره را بارگذاری کنید/i)).toBeInTheDocument();
    });
  });
});
