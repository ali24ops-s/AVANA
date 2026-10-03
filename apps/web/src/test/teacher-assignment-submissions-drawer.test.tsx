import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AssignmentSubmissionsDrawer,
  getAssignmentErrorMessage,
} from "../components/teacher/assignments/AssignmentSubmissionsDrawer.js";
import type { TeacherAssignmentSubmissionsListDTO } from "../lib/api/teacher.js";
import { ApiError } from "../lib/api/errors.js";

// Mock hooks
let mockSubmissionsData: TeacherAssignmentSubmissionsListDTO | undefined;
let mockIsLoading = false;
let mockError: unknown = null;
const mockRefetch = vi.fn();

vi.mock("../hooks/useTeacherAssignments.js", () => ({
  useTeacherAssignmentSubmissions: () => ({
    data: mockSubmissionsData,
    isLoading: mockIsLoading,
    error: mockError,
    refetch: mockRefetch,
  }),
}));

describe("Teacher Assignment Submissions Drawer — 8 Flow & State Scenarios", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
    mockIsLoading = false;
    mockError = null;
    mockSubmissionsData = undefined;
  });

  const baseAssignment = {
    id: "asg-test-1",
    classroomId: "cls-1",
    teacherId: "teacher-1",
    title: "تکلیف مدارهای منطقی",
    description: "طراحی دیکدر ۳ به ۸ با گیت‌های پایه",
    status: "published" as const,
    createdAt: new Date(Date.now() - 100000).toISOString(),
    updatedAt: new Date(Date.now() - 100000).toISOString(),
  };

  // Scenario 1: Valid assignment + Before start date + Zero submissions
  it("Scenario 1: shows clear notice when submission period has not started yet (upcoming + 0 submissions)", () => {
    const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const futureDue = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    mockSubmissionsData = {
      assignment: {
        ...baseAssignment,
        startsAt: futureStart,
        dueAt: futureDue,
      },
      submissions: [
        {
          studentId: "std-1",
          studentName: "سارا احمدی",
          studentEmail: "sara@example.com",
          submitted: false,
          submission: null,
        },
      ],
      stats: {
        submittedCount: 0,
        totalStudentsCount: 1,
      },
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AssignmentSubmissionsDrawer
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-test-1"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("مهلت ارسال این تکلیف هنوز شروع نشده است.")).toBeInTheDocument();
    expect(screen.getByText(/فعلاً پاسخی برای بررسی وجود ندارد/)).toBeInTheDocument();
    expect(screen.getByText("سارا احمدی")).toBeInTheDocument();
    expect(screen.getAllByText("ارسال نشده").length).toBeGreaterThanOrEqual(1);
  });

  // Scenario 2: Valid assignment + Active period + Zero submissions
  it("Scenario 2: shows clear notice when deadline is active but no submissions have been registered yet", () => {
    const pastStart = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const futureDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    mockSubmissionsData = {
      assignment: {
        ...baseAssignment,
        startsAt: pastStart,
        dueAt: futureDue,
      },
      submissions: [
        {
          studentId: "std-1",
          studentName: "امیر حسینی",
          studentEmail: "amir@example.com",
          submitted: false,
          submission: null,
        },
      ],
      stats: {
        submittedCount: 0,
        totalStudentsCount: 1,
      },
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AssignmentSubmissionsDrawer
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-test-1"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("هنوز پاسخی برای این تکلیف ثبت نشده است.")).toBeInTheDocument();
    expect(screen.getByText(/برای ثبت پاسخ خود مهلت دارند/)).toBeInTheDocument();
    expect(screen.getByText("امیر حسینی")).toBeInTheDocument();
  });

  // Scenario 3: Valid assignment + Active period + Has submissions
  it("Scenario 3: opens normally and shows student submissions when deadline is active and students submitted answers", () => {
    const pastStart = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const futureDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    mockSubmissionsData = {
      assignment: {
        ...baseAssignment,
        startsAt: pastStart,
        dueAt: futureDue,
      },
      submissions: [
        {
          studentId: "std-1",
          studentName: "مریم کریمی",
          studentEmail: "maryam@example.com",
          submitted: true,
          submission: {
            id: "sub-1",
            answerText: "پاسخ مدار با گیت‌های NAND پیاده‌سازی شد.",
            attachmentUrl: null,
            attachmentName: null,
            attachmentSizeBytes: null,
            submittedAt: new Date(Date.now() - 3600000).toISOString(),
          },
        },
      ],
      stats: {
        submittedCount: 1,
        totalStudentsCount: 1,
      },
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AssignmentSubmissionsDrawer
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-test-1"
        />
      </QueryClientProvider>,
    );

    // No empty state alert
    expect(screen.queryByText("هنوز پاسخی برای این تکلیف ثبت نشده است.")).not.toBeInTheDocument();
    expect(screen.getByText("مریم کریمی")).toBeInTheDocument();
    expect(screen.getAllByText("ارسال شده").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /باز کردن پاسخ/i })).toBeInTheDocument();

    // Opening answer details
    fireEvent.click(screen.getByRole("button", { name: /باز کردن پاسخ/i }));
    expect(screen.getByText("پاسخ مدار با گیت‌های NAND پیاده‌سازی شد.")).toBeInTheDocument();
  });

  // Scenario 4: Valid assignment + Deadline passed + Has submissions
  it("Scenario 4: renders existing submissions and displays deadline closed indicator when deadline has passed with answers", () => {
    const pastStart = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const pastDue = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    mockSubmissionsData = {
      assignment: {
        ...baseAssignment,
        startsAt: pastStart,
        dueAt: pastDue,
      },
      submissions: [
        {
          studentId: "std-1",
          studentName: "رضا محمدی",
          studentEmail: "reza@example.com",
          submitted: true,
          submission: {
            id: "sub-2",
            answerText: "پاسخ تکلیف ارسال‌شده پیش از پایان مهلت.",
            attachmentUrl: "/attachments/circuit.png",
            attachmentName: "circuit.png",
            attachmentSizeBytes: 102400,
            submittedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
          },
        },
      ],
      stats: {
        submittedCount: 1,
        totalStudentsCount: 1,
      },
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AssignmentSubmissionsDrawer
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-test-1"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("مهلت ارسال این تکلیف به پایان رسیده است.")).toBeInTheDocument();
    expect(screen.getByText(/پاسخ‌های ثبت‌شده دانشجویان در ادامه قابل مشاهده و بررسی هستند/)).toBeInTheDocument();
    expect(screen.getByText("رضا محمدی")).toBeInTheDocument();
    expect(screen.getAllByText("ارسال شده").length).toBeGreaterThanOrEqual(1);
  });

  // Scenario 5: Valid assignment + Deadline passed + Zero submissions
  it("Scenario 5: displays appropriate expired empty state when deadline has passed with 0 submissions", () => {
    const pastStart = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const pastDue = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    mockSubmissionsData = {
      assignment: {
        ...baseAssignment,
        startsAt: pastStart,
        dueAt: pastDue,
      },
      submissions: [
        {
          studentId: "std-1",
          studentName: "علی کاظمی",
          studentEmail: "ali@example.com",
          submitted: false,
          submission: null,
        },
      ],
      stats: {
        submittedCount: 0,
        totalStudentsCount: 1,
      },
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AssignmentSubmissionsDrawer
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-test-1"
        />
      </QueryClientProvider>,
    );

    expect(
      screen.getByText("مهلت ارسال این تکلیف به پایان رسیده و هنوز پاسخی ثبت نشده است."),
    ).toBeInTheDocument();
    expect(screen.getByText(/مهلت نهایی ارسال در تاریخ/)).toBeInTheDocument();
  });

  // Scenario 6: Invalid assignment / Not Found (404)
  it("Scenario 6: renders clear not found error message when assignment is invalid or not found (404)", () => {
    mockError = new ApiError({
      request_id: "req-404",
      error: {
        code: "not_found",
        message: "تکلیف یافت نشد",
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AssignmentSubmissionsDrawer
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="non-existent-id"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("خطا در بارگذاری اطلاعات تکلیف")).toBeInTheDocument();
    expect(
      screen.getByText("تکلیف مورد نظر یافت نشد یا ممکن است حذف شده باشد."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /تلاش مجدد/i })).toBeInTheDocument();
  });

  // Scenario 7: Teacher has no access / Forbidden (403)
  it("Scenario 7: renders clear permission error when teacher is not authorized to view the assignment (403)", () => {
    mockError = new ApiError({
      request_id: "req-403",
      error: {
        code: "forbidden",
        message: "Access denied",
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AssignmentSubmissionsDrawer
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="forbidden-asg-id"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("خطا در بارگذاری اطلاعات تکلیف")).toBeInTheDocument();
    expect(
      screen.getByText("شما مجوز لازم برای مشاهده پاسخ‌های این تکلیف را ندارید."),
    ).toBeInTheDocument();
  });

  // Scenario 8: Unexpected server error (500) / Network error
  it("Scenario 8: renders server error message and retry button when unexpected API/server error occurs (500)", () => {
    mockError = new ApiError({
      request_id: "req-500",
      error: {
        code: "internal_error",
        message: "Internal server error",
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AssignmentSubmissionsDrawer
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-500"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("خطا در بارگذاری اطلاعات تکلیف")).toBeInTheDocument();
    expect(
      screen.getByText("خطا در دریافت اطلاعات تکلیف از سرور. لطفاً دوباره تلاش کنید."),
    ).toBeInTheDocument();

    // Clicking retry calls refetch
    const retryBtn = screen.getByRole("button", { name: /تلاش مجدد/i });
    fireEvent.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  // Helper unit tests for getAssignmentErrorMessage
  describe("getAssignmentErrorMessage unit tests", () => {
    it("handles unauthorized, bad_request, network error, and unknown error types", () => {
      expect(
        getAssignmentErrorMessage(
          new ApiError({
            request_id: "1",
            error: { code: "unauthorized", message: "Unauthorized" },
          }),
        ),
      ).toBe("نشست کاربری شما منقضی شده است. لطفاً دوباره وارد حساب کاربری خود شوید.");

      expect(
        getAssignmentErrorMessage(
          new ApiError({
            request_id: "2",
            error: { code: "bad_request", message: "Bad request" },
          }),
        ),
      ).toBe("شناسه یا اطلاعات درخواست تکلیف نامعتبر است.");

      expect(
        getAssignmentErrorMessage(new Error("Failed to fetch from Network")),
      ).toBe("خطای ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کرده و مجدداً تلاش کنید.");
    });

    it("safely handles null or undefined startsAt and dueAt without throwing or crashing", () => {
      mockSubmissionsData = {
        assignment: {
          ...baseAssignment,
          startsAt: "" as any,
          dueAt: null as any,
          createdAt: "" as any,
        },
        submissions: [],
        stats: {
          submittedCount: 0,
          totalStudentsCount: 0,
        },
      };

      expect(() => {
        render(
          <QueryClientProvider client={queryClient}>
            <AssignmentSubmissionsDrawer
              isOpen={true}
              onClose={vi.fn()}
              assignmentId="asg-test-1"
            />
          </QueryClientProvider>,
        );
      }).not.toThrow();

      expect(screen.getByText("تکلیف مدارهای منطقی")).toBeInTheDocument();
      expect(screen.getByText("هیچ دانشجویی در این کلاس عضو نیست.")).toBeInTheDocument();
    });
  });
});
