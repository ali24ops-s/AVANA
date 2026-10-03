import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClassroomContentsTable } from "../components/teacher/contents/ClassroomContentsTable.js";
import { CreateEditContentModal } from "../components/teacher/contents/CreateEditContentModal.js";
import { StudentClassroomContents } from "../components/student/contents/StudentClassroomContents.js";
import type { ClassroomContent } from "@avana/domain";

// Mock teacher hooks
const mockCreateMutation = vi.fn().mockResolvedValue({});
const mockUpdateMutation = vi.fn().mockResolvedValue({});
const mockPublishMutation = vi.fn().mockResolvedValue({});
const mockUnpublishMutation = vi.fn().mockResolvedValue({});
const mockArchiveMutation = vi.fn().mockResolvedValue({});
const mockDeleteMutation = vi.fn().mockResolvedValue({});

vi.mock("../hooks/useTeacherContents.js", () => ({
  useCreateClassroomContent: () => ({
    mutateAsync: mockCreateMutation,
    isPending: false,
  }),
  useUpdateClassroomContent: () => ({
    mutateAsync: mockUpdateMutation,
    isPending: false,
  }),
  usePublishClassroomContent: () => ({
    mutateAsync: mockPublishMutation,
    isPending: false,
  }),
  useUnpublishClassroomContent: () => ({
    mutateAsync: mockUnpublishMutation,
    isPending: false,
  }),
  useArchiveClassroomContent: () => ({
    mutateAsync: mockArchiveMutation,
    isPending: false,
  }),
  useDeleteClassroomContent: () => ({
    mutateAsync: mockDeleteMutation,
    isPending: false,
  }),
}));

let mockStudentContents: ClassroomContent[] = [];
let mockStudentIsLoading = false;

vi.mock("../hooks/useStudentContents.js", () => ({
  useStudentClassroomContents: () => ({
    data: { contents: mockStudentContents },
    isLoading: mockStudentIsLoading,
    error: null,
  }),
}));

describe("Classroom Educational Content — Frontend Flow Tests", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  const sampleContents: ClassroomContent[] = [
    {
      id: "content-1",
      classroomId: "class-1",
      teacherId: "teacher-1",
      title: "جزوه جلسه اول",
      description: "مقدمه بر جبر خطی",
      contentType: "text",
      textContent: "فضاهای برداری و پایه‌ها",
      status: "published",
      createdAt: "2026-09-01T10:00:00Z",
      updatedAt: "2026-09-01T10:00:00Z",
    },
    {
      id: "content-2",
      classroomId: "class-1",
      teacherId: "teacher-1",
      title: "فیلم آموزشی حل تمرین",
      contentType: "video_external",
      externalUrl: "https://drive.google.com/file/d/test-video-id/view",
      videoProvider: "google_drive",
      videoEmbedUrl: "https://drive.google.com/file/d/test-video-id/preview",
      status: "published",
      createdAt: "2026-09-02T10:00:00Z",
      updatedAt: "2026-09-02T10:00:00Z",
    },
    {
      id: "content-3",
      classroomId: "class-1",
      teacherId: "teacher-1",
      title: "نمودار بردارها",
      contentType: "image",
      fileUrl: "/v1/teacher/contents/files/vectors.png",
      fileName: "vectors.png",
      fileSizeBytes: 102400,
      mimeType: "image/png",
      status: "draft",
      createdAt: "2026-09-03T10:00:00Z",
      updatedAt: "2026-09-03T10:00:00Z",
    },
  ];

  describe("Teacher: ClassroomContentsTable", () => {
    it("renders educational content items and correct badges", () => {
      render(
        <QueryClientProvider client={queryClient}>
          <ClassroomContentsTable
            contents={sampleContents}
            isLoading={false}
            classroomId="class-1"
            onOpenCreateModal={vi.fn()}
          />
        </QueryClientProvider>,
      );

      expect(screen.getByText("جزوه جلسه اول")).toBeInTheDocument();
      expect(screen.getByText("فیلم آموزشی حل تمرین")).toBeInTheDocument();
      expect(screen.getByText("نمودار بردارها")).toBeInTheDocument();

      // Badges
      expect(screen.getByText("متن")).toBeInTheDocument();
      expect(screen.getByText("ویدئو (لینک خارجی)")).toBeInTheDocument();
      expect(screen.getByText("تصویر")).toBeInTheDocument();
    });

    it("renders empty state when there are no contents", () => {
      const onOpenCreateModal = vi.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <ClassroomContentsTable
            contents={[]}
            isLoading={false}
            classroomId="class-1"
            onOpenCreateModal={onOpenCreateModal}
          />
        </QueryClientProvider>,
      );

      expect(
        screen.getByText("هنوز محتوای آموزشی در این کلاس ثبت نشده است."),
      ).toBeInTheDocument();
      const createBtn = screen.getByText("ایجاد اولین محتوای آموزشی");
      fireEvent.click(createBtn);
      expect(onOpenCreateModal).toHaveBeenCalledTimes(1);
    });
  });

  describe("Teacher: CreateEditContentModal", () => {
    it("renders modal with wider 5xl layout and 25,000 character limit counter", () => {
      render(
        <QueryClientProvider client={queryClient}>
          <CreateEditContentModal
            isOpen={true}
            onClose={vi.fn()}
            classroomId="class-1"
          />
        </QueryClientProvider>,
      );

      // Check dialog has max-w-5xl class
      const dialog = screen.getByRole("dialog");
      const dialogContentBox = dialog.querySelector(".max-w-5xl");
      expect(dialogContentBox).toBeInTheDocument();

      // Check initial character counter
      expect(screen.getByText("۰ / ۲۵٬۰۰۰ کاراکتر")).toBeInTheDocument();
    });

    it("submits text content creation with valid inputs", async () => {
      const onClose = vi.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <CreateEditContentModal
            isOpen={true}
            onClose={onClose}
            classroomId="class-1"
          />
        </QueryClientProvider>,
      );

      const titleInput = screen.getByPlaceholderText(/جزوه جلسه سوم/i);
      fireEvent.change(titleInput, { target: { value: "محتوای تستی جدید" } });

      const textInput = screen.getByPlaceholderText(/متن درسی یا آموزشی/i);
      fireEvent.change(textInput, { target: { value: "این متن آزمایشی است" } });

      const submitBtn = screen.getByText("ایجاد محتوا");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockCreateMutation).toHaveBeenCalledWith({
          contentType: "text",
          title: "محتوای تستی جدید",
          description: null,
          textContent: "این متن آزمایشی است",
          fileUrl: null,
          fileName: null,
          fileSizeBytes: null,
          mimeType: null,
          externalUrl: undefined,
          status: "published",
        });
      });
    });

    it("enforces 25,000 character limit on textarea and updates counter", async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <CreateEditContentModal
            isOpen={true}
            onClose={vi.fn()}
            classroomId="class-1"
          />
        </QueryClientProvider>,
      );

      const textInput = screen.getByPlaceholderText(/متن درسی یا آموزشی/i);
      expect(textInput).toHaveAttribute("maxLength", "25000");

      fireEvent.change(textInput, { target: { value: "متن کوتاه" } });
      expect(screen.getByText("۹ / ۲۵٬۰۰۰ کاراکتر")).toBeInTheDocument();
    });

    it("displays error alert when mutation rejects with 25,000 limit error", async () => {
      mockCreateMutation.mockRejectedValueOnce(
        new Error("متن محتوا نمی‌تواند بیشتر از ۲۵٬۰۰۰ کاراکتر باشد."),
      );

      render(
        <QueryClientProvider client={queryClient}>
          <CreateEditContentModal
            isOpen={true}
            onClose={vi.fn()}
            classroomId="class-1"
          />
        </QueryClientProvider>,
      );

      const titleInput = screen.getByPlaceholderText(/جزوه جلسه سوم/i);
      fireEvent.change(titleInput, { target: { value: "محتوای تست" } });

      const textInput = screen.getByPlaceholderText(/متن درسی یا آموزشی/i);
      fireEvent.change(textInput, { target: { value: "متن نمونه" } });

      const submitBtn = screen.getByText("ایجاد محتوا");
      fireEvent.click(submitBtn);

      expect(
        await screen.findByText("متن محتوا نمی‌تواند بیشتر از ۲۵٬۰۰۰ کاراکتر باشد."),
      ).toBeInTheDocument();
    });
  });

  describe("Student: StudentClassroomContents", () => {
    it("renders published content items and filters by search", () => {
      mockStudentContents = sampleContents.filter((c) => c.status === "published");
      mockStudentIsLoading = false;

      render(
        <QueryClientProvider client={queryClient}>
          <StudentClassroomContents classroomId="class-1" />
        </QueryClientProvider>,
      );

      expect(screen.getByText("جزوه جلسه اول")).toBeInTheDocument();
      expect(screen.getByText("فیلم آموزشی حل تمرین")).toBeInTheDocument();

      // Search
      const searchInput = screen.getByPlaceholderText(/جستجو در عنوان/i);
      fireEvent.change(searchInput, { target: { value: "فیلم" } });

      expect(screen.queryByText("جزوه جلسه اول")).not.toBeInTheDocument();
      expect(screen.getByText("فیلم آموزشی حل تمرین")).toBeInTheDocument();
    });

    it("opens viewer modal when student clicks on text content", () => {
      mockStudentContents = [sampleContents[0]];

      render(
        <QueryClientProvider client={queryClient}>
          <StudentClassroomContents classroomId="class-1" />
        </QueryClientProvider>,
      );

      const readBtn = screen.getByText("مطالعه متن");
      fireEvent.click(readBtn);

      expect(screen.getByText("فضاهای برداری و پایه‌ها")).toBeInTheDocument();
    });
  });
});
