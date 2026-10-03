import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StudentAssignmentSubmissionModal } from "../components/student/assignments/StudentAssignmentSubmissionModal.js";
import type { StudentAssignmentDetailDTO } from "../lib/api/student-platform.js";

// Mock hooks
const mockSubmitAssignment = vi.fn();
let mockStudentAssignmentData: StudentAssignmentDetailDTO | undefined;
let mockIsLoading = false;

vi.mock("../hooks/useStudentAssignments.js", () => ({
  useStudentAssignment: () => ({
    data: mockStudentAssignmentData,
    isLoading: mockIsLoading,
    error: null,
  }),
  useSubmitAssignment: () => ({
    mutateAsync: mockSubmitAssignment,
    isPending: false,
  }),
}));

// Mock API client for file upload
const mockUploadAttachment = vi.fn();
vi.mock("../lib/api/client.js", () => ({
  createApiClient: () => ({}),
  getApiBaseUrl: () => "http://localhost:3000",
}));
vi.mock("../lib/api/student-platform.js", () => ({
  createStudentPlatformApi: () => ({
    uploadAssignmentAttachment: mockUploadAttachment,
  }),
}));

describe("StudentAssignmentSubmissionModal — Enhanced UI/UX & Attachments", () => {
  let queryClient: QueryClient;

  const sampleAssignment = {
    id: "asg-100",
    classroomId: "cls-100",
    teacherId: "tch-100",
    title: "تکلیف مدارهای الکتریکی پیشرفته",
    description: "پاسخ مسائل فصل ۳ و پیوست فایل شماتیک شبیه‌سازی",
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    status: "published" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
    mockIsLoading = false;
    mockStudentAssignmentData = {
      assignment: sampleAssignment,
      submission: null,
      runtimeState: "active",
      canSubmit: true,
    };
  });

  it("renders the modal in spacious layout with assignment details and instructions", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <StudentAssignmentSubmissionModal
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-100"
          classroomId="cls-100"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("تکلیف مدارهای الکتریکی پیشرفته")).toBeInTheDocument();
    expect(screen.getByText(/مشاهده توضیحات و ارسال پاسخ متنی/)).toBeInTheDocument();
    expect(screen.getByText(/پاسخ مسائل فصل ۳/)).toBeInTheDocument();
    expect(screen.getByText(/مهلت ارسال:/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/متن پاسخ خود را به صورت کامل/)).toBeInTheDocument();
    expect(screen.getByText(/پیوست پاسخ \(اختیاری\)/)).toBeInTheDocument();
  });

  it("allows typing long multi-paragraph text and updates character counter accurately", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <StudentAssignmentSubmissionModal
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-100"
          classroomId="cls-100"
        />
      </QueryClientProvider>,
    );

    const textarea = screen.getByPlaceholderText(/متن پاسخ خود را به صورت کامل/);
    const longText = "پاراگراف ۱: تحلیل گره‌های مدار اصلی.\n\nپاراگراف ۲: محاسبات ماتریس امپدانس.";
    fireEvent.change(textarea, { target: { value: longText } });

    expect((textarea as HTMLTextAreaElement).value).toBe(longText);
    expect(screen.getByText(/۱۵[٬,]?۰۰۰ کاراکتر/)).toBeInTheDocument();
  });

  it("submits text-only response successfully", async () => {
    mockSubmitAssignment.mockResolvedValueOnce({
      submission: { id: "sub-1", answerText: "پاسخ متنی دانشجو" },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <StudentAssignmentSubmissionModal
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-100"
          classroomId="cls-100"
        />
      </QueryClientProvider>,
    );

    const textarea = screen.getByPlaceholderText(/متن پاسخ خود را به صورت کامل/);
    fireEvent.change(textarea, { target: { value: "پاسخ متنی کامل دانشجو" } });

    const submitBtn = screen.getByRole("button", { name: /ارسال پاسخ/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSubmitAssignment).toHaveBeenCalledWith({
        answerText: "پاسخ متنی کامل دانشجو",
        attachmentUrl: null,
        attachmentName: null,
        attachmentSizeBytes: null,
      });
    });
  });

  it("shows error when attempting to submit with both empty text and empty file", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <StudentAssignmentSubmissionModal
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-100"
          classroomId="cls-100"
        />
      </QueryClientProvider>,
    );

    const submitBtn = screen.getByRole("button", { name: /ارسال پاسخ/i });
    expect(submitBtn).toBeDisabled();
  });

  it("allows file-only submission when attachment is uploaded", async () => {
    mockUploadAttachment.mockResolvedValueOnce({
      attachmentUrl: "/v1/student/assignments/attachments/assignments%2Fcircuit-schema.pdf",
      attachmentName: "circuit-schema.pdf",
      attachmentSizeBytes: 1048576,
      storageKey: "assignments/circuit-schema.pdf",
    });

    mockSubmitAssignment.mockResolvedValueOnce({
      submission: {
        id: "sub-2",
        answerText: "",
        attachmentUrl: "/v1/student/assignments/attachments/assignments%2Fcircuit-schema.pdf",
        attachmentName: "circuit-schema.pdf",
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <StudentAssignmentSubmissionModal
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-100"
          classroomId="cls-100"
        />
      </QueryClientProvider>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new window.File(["dummy pdf content"], "circuit-schema.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput, { target: { files: [testFile] } });

    await waitFor(() => {
      expect(mockUploadAttachment).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("circuit-schema.pdf")).toBeInTheDocument();
    expect(screen.getByText("آماده ارسال")).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: /ارسال پاسخ/i });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSubmitAssignment).toHaveBeenCalledWith({
        answerText: "",
        attachmentUrl: "/v1/student/assignments/attachments/assignments%2Fcircuit-schema.pdf",
        attachmentName: "circuit-schema.pdf",
        attachmentSizeBytes: 1048576,
      });
    });
  });

  it("allows removing an attached file before submit", async () => {
    mockUploadAttachment.mockResolvedValueOnce({
      attachmentUrl: "/v1/student/assignments/attachments/assignments%2Ftemp.png",
      attachmentName: "temp.png",
      attachmentSizeBytes: 50000,
      storageKey: "assignments/temp.png",
    });

    render(
      <QueryClientProvider client={queryClient}>
        <StudentAssignmentSubmissionModal
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-100"
          classroomId="cls-100"
        />
      </QueryClientProvider>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new window.File(["img"], "temp.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    expect(await screen.findByText("temp.png")).toBeInTheDocument();

    const deleteBtn = screen.getByTitle("حذف فایل پیوست");
    fireEvent.click(deleteBtn);

    expect(screen.queryByText("temp.png")).not.toBeInTheDocument();
    expect(screen.getByText(/برای انتخاب فایل کلیک کنید/)).toBeInTheDocument();
  });

  it("loads existing submission with text and attachment in view mode, and opens edit mode", async () => {
    mockStudentAssignmentData = {
      assignment: sampleAssignment,
      submission: {
        id: "sub-submitted-1",
        assignmentId: "asg-100",
        studentId: "std-100",
        answerText: "پاسخ ثبت‌شده قبلی توسط دانشجو",
        attachmentUrl: "/v1/student/assignments/attachments/assignments%2Fsubmitted.pdf",
        attachmentName: "submitted-solution.pdf",
        attachmentSizeBytes: 2048576,
        status: "submitted",
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      runtimeState: "active",
      canSubmit: true,
    };

    render(
      <QueryClientProvider client={queryClient}>
        <StudentAssignmentSubmissionModal
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-100"
          classroomId="cls-100"
        />
      </QueryClientProvider>,
    );

    // Displays submitted text and attachment card
    expect(screen.getByText("پاسخ ثبت‌شده قبلی توسط دانشجو")).toBeInTheDocument();
    expect(screen.getByText("submitted-solution.pdf")).toBeInTheDocument();
    expect(screen.getByText("دانلود / مشاهده")).toBeInTheDocument();

    // Click edit
    const editBtn = screen.getByRole("button", { name: /ویرایش و ارسال مجدد/i });
    fireEvent.click(editBtn);

    // Enters edit workspace with pre-populated values
    expect(screen.getByDisplayValue("پاسخ ثبت‌شده قبلی توسط دانشجو")).toBeInTheDocument();
    expect(screen.getByText("submitted-solution.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "بروزرسانی و ارسال مجدد" })).toBeInTheDocument();
  });

  it("accepts exactly 15,000 characters and submits successfully", async () => {
    const exact15kText = "ا".repeat(15000);
    mockSubmitAssignment.mockResolvedValueOnce({
      submission: { id: "sub-15k", answerText: exact15kText },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <StudentAssignmentSubmissionModal
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-100"
          classroomId="cls-100"
        />
      </QueryClientProvider>,
    );

    const textarea = screen.getByPlaceholderText(/متن پاسخ خود را به صورت کامل/);
    fireEvent.change(textarea, { target: { value: exact15kText } });

    expect((textarea as HTMLTextAreaElement).value.length).toBe(15000);
    const submitBtn = screen.getByRole("button", { name: /ارسال پاسخ/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSubmitAssignment).toHaveBeenCalledWith({
        answerText: exact15kText,
        attachmentUrl: null,
        attachmentName: null,
        attachmentSizeBytes: null,
      });
    });
  });

  it("prevents submission and displays warning when text exceeds 15,000 characters without silent truncation", () => {
    const pastedText15001 = "ب".repeat(15001);

    render(
      <QueryClientProvider client={queryClient}>
        <StudentAssignmentSubmissionModal
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-100"
          classroomId="cls-100"
        />
      </QueryClientProvider>,
    );

    const textarea = screen.getByPlaceholderText(/متن پاسخ خود را به صورت کامل/);
    fireEvent.change(textarea, { target: { value: pastedText15001 } });

    // Preserves full text without silent truncation
    expect((textarea as HTMLTextAreaElement).value.length).toBe(15001);

    // Shows clear validation warning
    expect(
      screen.getByText(/متن پاسخ نمی‌تواند بیشتر از ۱۵[٬,]?۰۰۰ کاراکتر باشد/),
    ).toBeInTheDocument();

    // Disables submit button
    const submitBtn = screen.getByRole("button", { name: /ارسال پاسخ/i });
    expect(submitBtn).toBeDisabled();
  });

  it("displays backend validation error message in UI if submission fails", async () => {
    const { ApiError } = await import("../lib/api/errors.js");
    mockSubmitAssignment.mockRejectedValueOnce(
      new ApiError({
        error: {
          code: "bad_request",
          message: "متن پاسخ نمی‌تواند بیشتر از ۱۵٬۰۰۰ کاراکتر باشد",
        },
      }),
    );

    render(
      <QueryClientProvider client={queryClient}>
        <StudentAssignmentSubmissionModal
          isOpen={true}
          onClose={vi.fn()}
          assignmentId="asg-100"
          classroomId="cls-100"
        />
      </QueryClientProvider>,
    );

    const textarea = screen.getByPlaceholderText(/متن پاسخ خود را به صورت کامل/);
    fireEvent.change(textarea, { target: { value: "پاسخ معتبر" } });

    const submitBtn = screen.getByRole("button", { name: /ارسال پاسخ/i });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText("متن پاسخ نمی‌تواند بیشتر از ۱۵٬۰۰۰ کاراکتر باشد"),
    ).toBeInTheDocument();
  });
});
