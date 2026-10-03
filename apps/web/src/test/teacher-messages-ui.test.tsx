import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TeacherMessageStatusBadge } from "../components/teacher/messages/TeacherMessageStatusBadge.js";
import { TeacherMessageCategoryBadge } from "../components/teacher/messages/TeacherMessageCategoryBadge.js";
import { StudentSendMessageModal } from "../components/student/messages/StudentSendMessageModal.js";
import { StudentConversationDetailModal } from "../components/student/messages/StudentConversationDetailModal.js";
import { StudentClassroomMessages } from "../components/student/messages/StudentClassroomMessages.js";
import { TeacherMessagesPage } from "../pages/teacher/TeacherMessagesPage.js";
import {
  TeacherMessageCategories,
  TeacherMessageStatuses,
  TEACHER_MESSAGE_CATEGORY_LABELS,
  TEACHER_MESSAGE_STATUS_LABELS,
} from "@avana/domain";

// Mock hooks
const mockCreateConversationMutateAsync = vi.fn();
const mockReplyMessageMutateAsync = vi.fn();
const mockUpdateStatusMutateAsync = vi.fn();

let mockStudentConversationsData: any = { conversations: [] };
let mockStudentConversationData: any = null;
let mockTeacherConversationsData: any = { conversations: [] };
let mockTeacherConversationData: any = null;

vi.mock("../hooks/useStudentMessages.js", () => ({
  useStudentConversations: () => ({
    data: mockStudentConversationsData,
    isLoading: false,
    isError: false,
  }),
  useStudentConversation: () => ({
    data: mockStudentConversationData,
    isLoading: false,
    isError: false,
  }),
  useStudentCreateConversation: () => ({
    mutateAsync: mockCreateConversationMutateAsync,
    isPending: false,
  }),
  useStudentReplyMessage: () => ({
    mutateAsync: mockReplyMessageMutateAsync,
    isPending: false,
  }),
}));

vi.mock("../hooks/useTeacherMessages.js", () => ({
  useTeacherConversations: () => ({
    data: mockTeacherConversationsData,
    isLoading: false,
    isError: false,
  }),
  useTeacherConversation: () => ({
    data: mockTeacherConversationData,
    isLoading: false,
    isError: false,
  }),
  useTeacherReplyMessage: () => ({
    mutateAsync: mockReplyMessageMutateAsync,
    isPending: false,
  }),
  useTeacherUpdateConversationStatus: () => ({
    mutateAsync: mockUpdateStatusMutateAsync,
    isPending: false,
  }),
}));

vi.mock("../hooks/useTeacher.js", () => ({
  useTeacherClassrooms: () => ({
    data: {
      classrooms: [
        { id: "cls-1", title: "کلاس ریاضی مهندسی" },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock("../components/teacher/TeacherOrganizationContext.js", () => ({
  useTeacherOrganization: () => ({
    selectedOrgId: "org-1",
  }),
}));

describe("Teacher Messages UI Components & Pages", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  describe("TeacherMessageStatusBadge", () => {
    it("renders new status badge with correct Persian label", () => {
      render(<TeacherMessageStatusBadge status={TeacherMessageStatuses.NEW} />);
      expect(
        screen.getByText(TEACHER_MESSAGE_STATUS_LABELS[TeacherMessageStatuses.NEW]),
      ).toBeInTheDocument();
    });

    it("renders in_progress status badge with correct Persian label", () => {
      render(
        <TeacherMessageStatusBadge
          status={TeacherMessageStatuses.IN_PROGRESS}
        />,
      );
      expect(
        screen.getByText(
          TEACHER_MESSAGE_STATUS_LABELS[TeacherMessageStatuses.IN_PROGRESS],
        ),
      ).toBeInTheDocument();
    });

    it("renders answered status badge with correct Persian label", () => {
      render(
        <TeacherMessageStatusBadge status={TeacherMessageStatuses.ANSWERED} />,
      );
      expect(
        screen.getByText(
          TEACHER_MESSAGE_STATUS_LABELS[TeacherMessageStatuses.ANSWERED],
        ),
      ).toBeInTheDocument();
    });

    it("renders closed status badge with correct Persian label", () => {
      render(
        <TeacherMessageStatusBadge status={TeacherMessageStatuses.CLOSED} />,
      );
      expect(
        screen.getByText(
          TEACHER_MESSAGE_STATUS_LABELS[TeacherMessageStatuses.CLOSED],
        ),
      ).toBeInTheDocument();
    });
  });

  describe("TeacherMessageCategoryBadge", () => {
    it("renders all 7 message category badges with Persian labels", () => {
      const categories = Object.values(TeacherMessageCategories);
      for (const cat of categories) {
        const { unmount } = render(
          <TeacherMessageCategoryBadge category={cat} />,
        );
        expect(
          screen.getByText(TEACHER_MESSAGE_CATEGORY_LABELS[cat]),
        ).toBeInTheDocument();
        unmount();
      }
    });
  });

  describe("StudentSendMessageModal", () => {
    it("renders modal form and submits valid message", async () => {
      const onClose = vi.fn();
      mockCreateConversationMutateAsync.mockResolvedValueOnce({
        conversation: { id: "conv-123" },
      });

      render(
        <StudentSendMessageModal
          isOpen={true}
          onClose={onClose}
          classroomId="cls-1"
          classroomTitle="کلاس ریاضی مهندسی"
        />,
      );

      expect(screen.getByText("ارسال پیام به استاد")).toBeInTheDocument();
      expect(screen.getByText(/کلاس ریاضی مهندسی/)).toBeInTheDocument();

      const subjectInput = screen.getByLabelText(/عنوان پیام/i);
      const bodyInput = screen.getByLabelText(/متن پیام/i);

      fireEvent.change(subjectInput, {
        target: { value: "سؤال درباره انتگرال فوریه" },
      });
      fireEvent.change(bodyInput, {
        target: { value: "سلام استاد، در تبدیل فوریه مسأله ۳ نیاز به توضیح بیشتر دارم." },
      });

      const submitButton = screen.getByRole("button", { name: /ارسال پیام/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateConversationMutateAsync).toHaveBeenCalledWith({
          classroomId: "cls-1",
          category: TeacherMessageCategories.STUDY_QUESTION,
          subject: "سؤال درباره انتگرال فوریه",
          body: "سلام استاد، در تبدیل فوریه مسأله ۳ نیاز به توضیح بیشتر دارم.",
        });
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  describe("StudentClassroomMessages & Detail Modal", () => {
    it("renders empty state when no conversations exist", () => {
      mockStudentConversationsData = { conversations: [] };

      render(
        <StudentClassroomMessages
          classroomId="cls-1"
          classroomTitle="کلاس ریاضی مهندسی"
        />,
      );

      expect(
        screen.getByText("هنوز پیامی برای استاد این کلاس ارسال نکرده‌اید"),
      ).toBeInTheDocument();
    });

    it("renders conversation list and opens detail modal", () => {
      mockStudentConversationsData = {
        conversations: [
          {
            id: "conv-1",
            subject: "سؤال فصل اول",
            category: TeacherMessageCategories.STUDY_QUESTION,
            status: TeacherMessageStatuses.ANSWERED,
            teacherName: "دکتر رضایی",
            lastActivityAt: new Date().toISOString(),
            lastSenderRole: "teacher",
            studentReadAt: null,
          },
        ],
      };

      mockStudentConversationData = {
        conversation: {
          id: "conv-1",
          subject: "سؤال فصل اول",
          category: TeacherMessageCategories.STUDY_QUESTION,
          status: TeacherMessageStatuses.ANSWERED,
          teacherName: "دکتر رضایی",
        },
        messages: [
          {
            id: "msg-1",
            body: "سلام استاد، مبحث فصل اول واضح نبود.",
            senderRole: "student",
            createdAt: new Date().toISOString(),
          },
          {
            id: "msg-2",
            body: "سلام، فایل ضمیمه را در بخش محتوا مشاهده کنید.",
            senderRole: "teacher",
            createdAt: new Date().toISOString(),
          },
        ],
      };

      render(
        <StudentClassroomMessages
          classroomId="cls-1"
          classroomTitle="کلاس ریاضی مهندسی"
        />,
      );

      expect(screen.getByText("سؤال فصل اول")).toBeInTheDocument();
      expect(screen.getByText(/پاسخ جدید استاد/)).toBeInTheDocument();

      // Click on conversation card to open thread
      fireEvent.click(screen.getByText("سؤال فصل اول"));

      expect(
        screen.getByText("سلام، فایل ضمیمه را در بخش محتوا مشاهده کنید."),
      ).toBeInTheDocument();
    });
  });

  describe("TeacherMessagesPage", () => {
    it("renders master-detail view with filters and allows status transition", async () => {
      mockTeacherConversationsData = {
        conversations: [
          {
            id: "conv-10",
            subject: "اشکال در آزمون میان‌ترم",
            category: TeacherMessageCategories.EXAM,
            status: TeacherMessageStatuses.NEW,
            studentName: "علی احمدی",
            studentEmail: "ali@avana.io",
            classroomTitle: "کلاس ریاضی مهندسی",
            lastActivityAt: new Date().toISOString(),
            lastSenderRole: "student",
            teacherReadAt: null,
          },
        ],
      };

      mockTeacherConversationData = {
        conversation: {
          id: "conv-10",
          subject: "اشکال در آزمون میان‌ترم",
          category: TeacherMessageCategories.EXAM,
          status: TeacherMessageStatuses.NEW,
          studentName: "علی احمدی",
          classroomTitle: "کلاس ریاضی مهندسی",
        },
        messages: [
          {
            id: "m-101",
            body: "سلام استاد، سؤال شماره ۴ ابهام دارد.",
            senderRole: "student",
            createdAt: new Date().toISOString(),
          },
        ],
      };

      render(
        <BrowserRouter>
          <QueryClientProvider client={queryClient}>
            <TeacherMessagesPage />
          </QueryClientProvider>
        </BrowserRouter>,
      );

      expect(screen.getByText("پیام‌های دانشجویان")).toBeInTheDocument();
      expect(screen.getByText("اشکال در آزمون میان‌ترم")).toBeInTheDocument();
      expect(screen.getByText("علی احمدی")).toBeInTheDocument();

      // Select conversation to view detail
      fireEvent.click(screen.getByText("اشکال در آزمون میان‌ترم"));

      expect(
        screen.getByText("سلام استاد، سؤال شماره ۴ ابهام دارد."),
      ).toBeInTheDocument();

      // Change status to in_progress
      const statusSelect = screen.getByLabelText("تغییر وضعیت گفتگو");
      fireEvent.change(statusSelect, {
        target: { value: TeacherMessageStatuses.IN_PROGRESS },
      });

      expect(mockUpdateStatusMutateAsync).toHaveBeenCalledWith({
        status: TeacherMessageStatuses.IN_PROGRESS,
      });
    });
  });
});
