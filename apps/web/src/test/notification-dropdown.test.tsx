import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationDropdown } from "../components/notifications/NotificationDropdown.js";
import type { NotificationItem } from "@avana/domain";

const mockNotifications: NotificationItem[] = [
  {
    id: "notif-1" as any,
    userId: "user-1" as any,
    type: "purchase_completed",
    title: "خرید اشتراک با موفقیت انجام شد",
    message: "اشتراک ویژه شما فعال گردید.",
    isRead: false,
    readAt: null,
    metadata: { orderId: "order-1" },
    actionUrl: "/courses",
    createdAt: new Date().toISOString(),
  },
  {
    id: "notif-2" as any,
    userId: "user-1" as any,
    type: "login_success",
    title: "ورود موفق به حساب کاربری",
    message: "ورود با آی‌پی 127.0.0.1",
    isRead: true,
    readAt: new Date(Date.now() - 3600000).toISOString(),
    metadata: null,
    actionUrl: null,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
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
    const badge = await screen.findByText("1");
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
});
