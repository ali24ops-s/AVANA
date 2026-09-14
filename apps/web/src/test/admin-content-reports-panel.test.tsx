import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminContentReportsPanel } from "../components/admin/reports/AdminContentReportsPanel.js";
import type { AdminContentReportItem } from "@avana/contracts";

const mockReports: AdminContentReportItem[] = [
  {
    id: "rep-1",
    userId: "usr-1",
    lessonId: "les-1",
    courseId: "crs-1",
    selectedText: "این متن آزمایشی دارای اشکال تایپی است",
    category: "typo",
    comment: "لطفاً این کلمه را اصلاح فرمایید",
    status: "pending",
    createdAt: "2026-09-10T12:00:00.000Z",
    courseName: "فارماکولوژی بالینی",
    moduleTitle: "فصل اول: داروشناسی پایه",
    lessonTitle: "مکانیسم اثر گیرنده‌ها",
  },
];

describe("AdminContentReportsPanel UI Component", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/v1/admin/content-reports")) {
        return new Response(
          JSON.stringify({
            items: mockReports,
            totalCount: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });
  });

  it("renders table with triage info and does NOT render selectedText in table rows", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AdminContentReportsPanel />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی بالینی")).toBeInTheDocument();
    });
    expect(screen.getByText("فصل اول: داروشناسی پایه")).toBeInTheDocument();
    expect(screen.getByText("مکانیسم اثر گیرنده‌ها")).toBeInTheDocument();
    expect(screen.getAllByText("غلط املایی / نگارشی").length).toBeGreaterThanOrEqual(1);

    // Check table headers
    expect(screen.getByText("دوره")).toBeInTheDocument();
    expect(screen.getByText("فصل")).toBeInTheDocument();
    expect(screen.getByText("درسنامه")).toBeInTheDocument();
    expect(screen.getByText("نوع مشکل")).toBeInTheDocument();
    expect(screen.getByText("وضعیت")).toBeInTheDocument();
    expect(screen.getByText("تاریخ ثبت")).toBeInTheDocument();
    expect(screen.getByText("عملیات")).toBeInTheDocument();

    // Verify selectedText is NOT rendered in the table before opening dialog
    expect(
      screen.queryByText(/این متن آزمایشی دارای اشکال تایپی است/),
    ).not.toBeInTheDocument();
  });

  it("displays selectedText inside the review dialog when 'بررسی' is clicked", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AdminContentReportsPanel />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی بالینی")).toBeInTheDocument();
    });

    // Click "بررسی" button to open review dialog
    const reviewBtn = screen.getByRole("button", { name: "بررسی" });
    fireEvent.click(reviewBtn);

    // Verify dialog header and details
    await waitFor(() => {
      expect(screen.getByText("بررسی گزارش مشکل درسنامه")).toBeInTheDocument();
      expect(screen.getByText("متن انتخاب‌شده توسط دانشجو:")).toBeInTheDocument();
      // selectedText MUST be visible inside the dialog!
      expect(
        screen.getByText(/این متن آزمایشی دارای اشکال تایپی است/),
      ).toBeInTheDocument();
      // Student comment is also visible
      expect(
        screen.getByText("لطفاً این کلمه را اصلاح فرمایید"),
      ).toBeInTheDocument();
    });
  });
});
