import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationDropdown } from "../components/notifications/NotificationDropdown.js";
import type { NotificationItem } from "@avana/domain";
import { asNotificationId, asUserId } from "@avana/domain";

const mockNotifications: NotificationItem[] = [
  {
    id: asNotificationId("notif-1"),
    userId: asUserId("user-1"),
    type: "purchase_completed",
    title: "خرید اشتراک با موفقیت انجام شد",
    message: "اشتراک ویژه شما فعال گردید.",
    isRead: false,
    readAt: null,
    metadata: { orderId: "order-1" },
    action: { type: "navigate", url: "/courses" },
    createdAt: new Date().toISOString(),
  },
  {
    id: asNotificationId("notif-2"),
    userId: asUserId("user-1"),
    type: "login_success",
    title: "ورود موفق به حساب کاربری",
    message: "ورود با آی‌پی 127.0.0.1",
    isRead: true,
    readAt: new Date(Date.now() - 3600000).toISOString(),
    metadata: null,
    action: null,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: asNotificationId("notif-3"),
    userId: asUserId("user-1"),
    type: "classroom_exam_published",
    title: "آزمون جدید",
    message: "آزمون «میان‌ترم فارماکولوژی» در کلاس «فارماکولوژی پزشکی» اضافه شد.",
    isRead: false,
    readAt: null,
    metadata: { examId: "exam-1", classroomId: "class-1" },
    action: { type: "navigate", url: "/classrooms/class-1/exams/exam-1" },
    createdAt: new Date().toISOString(),
  },
  {
    id: asNotificationId("notif-4"),
    userId: asUserId("user-1"),
    type: "classroom_assignment_published",
    title: "تکلیف جدید",
    message: "تکلیف «گزارش آزمایشگاه» در کلاس «فیزیولوژی» اضافه شد.",
    isRead: false,
    readAt: null,
    metadata: { assignmentId: "assign-1", classroomId: "class-2" },
    action: { type: "navigate", url: "/classrooms/class-2" },
    createdAt: new Date().toISOString(),
  },
];

const mockGetUnreadCount = vi.fn();
const mockGetNotifications = vi.fn();
const mockMarkAsRead = vi.fn();
const mockMarkAllAsRead = vi.fn();

vi.mock("../lib/api/notifications.js", () => ({
  createNotificationsApi: () => ({
    getUnreadCount: mockGetUnreadCount,
    getNotifications: mockGetNotifications,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
  }),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

describe("NotificationDropdown Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUnreadCount.mockResolvedValue({ unread_count: 1 });
    mockGetNotifications.mockImplementation(async (params?: { unread_only?: boolean }) => {
      const items = params?.unread_only
        ? mockNotifications.filter((n) => !n.isRead)
        : mockNotifications;
      return {
        items,
        total: items.length,
        unread_count: 1,
        page: 1,
        limit: 20,
      };
    });
    mockMarkAsRead.mockResolvedValue({
      notification: { ...mockNotifications[0]!, isRead: true, readAt: new Date().toISOString() },
    });
    mockMarkAllAsRead.mockResolvedValue({
      success: true,
      updated_count: 1,
    });
  });

  const renderComponent = () => {
    const queryClient = createTestQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <NotificationDropdown />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it("renders the bell icon and displays the unread badge", async () => {
    renderComponent();

    // The badge with unread count "1" should be rendered
    const badge = await screen.findByText(/1|۱/);
    expect(badge).toBeDefined();
    expect(screen.getByRole("button", { name: /اعلان/i })).toBeDefined();
  });

  it("opens popover on click and shows notifications", async () => {
    renderComponent();

    const bellBtn = screen.getByRole("button", { name: /اعلان/i });
    fireEvent.click(bellBtn);

    // Header and titles should be visible in popover
    await waitFor(() => {
      expect(screen.getByText("اعلانات")).toBeDefined();
      expect(screen.getByText("خرید اشتراک با موفقیت انجام شد")).toBeDefined();
      expect(screen.getByText("ورود موفق به حساب کاربری")).toBeDefined();
    });
  });

  it("filters unread notifications when unread tab is clicked", async () => {
    renderComponent();

    const bellBtn = screen.getByRole("button", { name: /اعلان/i });
    fireEvent.click(bellBtn);

    await screen.findByText("ورود موفق به حساب کاربری");

    const unreadTab = await screen.findByRole("button", { name: /خوانده‌نشده/i });
    fireEvent.click(unreadTab);

    // Only unread notif should appear
    expect(await screen.findByText("خرید اشتراک با موفقیت انجام شد")).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByText("ورود موفق به حساب کاربری")).toBeNull();
    });
  });

  it("calls markAllAsRead when clicking read-all button", async () => {
    renderComponent();

    const bellBtn = screen.getByRole("button", { name: /اعلان/i });
    fireEvent.click(bellBtn);

    const markAllBtn = await screen.findByRole("button", { name: /خواندن همه/i });
    fireEvent.click(markAllBtn);

    await waitFor(() => {
      expect(mockMarkAllAsRead).toHaveBeenCalled();
    });
  });

  it("renders classroom exam and assignment notifications with titles and messages", async () => {
    renderComponent();

    const bellBtn = screen.getByRole("button", { name: /اعلان/i });
    fireEvent.click(bellBtn);

    await waitFor(() => {
      expect(screen.getByText("آزمون جدید")).toBeDefined();
      expect(
        screen.getByText(
          "آزمون «میان‌ترم فارماکولوژی» در کلاس «فارماکولوژی پزشکی» اضافه شد.",
        ),
      ).toBeDefined();
      expect(screen.getByText("تکلیف جدید")).toBeDefined();
      expect(
        screen.getByText(
          "تکلیف «گزارش آزمایشگاه» در کلاس «فیزیولوژی» اضافه شد.",
        ),
      ).toBeDefined();
    });
  });

  it("calls markAsRead when clicking an unread classroom notification item", async () => {
    renderComponent();

    const bellBtn = screen.getByRole("button", { name: /اعلان/i });
    fireEvent.click(bellBtn);

    const examNotifTitle = await screen.findByText("آزمون جدید");
    fireEvent.click(examNotifTitle);

    await waitFor(() => {
      expect(mockMarkAsRead).toHaveBeenCalledWith("notif-3");
    });
  });
});
