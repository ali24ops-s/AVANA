import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import { TicketConversationModal } from "../components/support/TicketConversationModal.js";
import * as useSupportModule from "../hooks/useSupport.js";
import { asUserId, type SupportTicketItem } from "@avana/domain";

describe("Support Read Receipt UI & Observation Tracking", () => {
  let queryClient: QueryClient;
  const mockMarkMessagesAsRead = vi.fn().mockResolvedValue({ success: true, markedCount: 1 });

  const mockTicketData: { ticket: SupportTicketItem } = {
    ticket: {
      id: "ticket-123",
      userId: asUserId("user-456"),
      userName: "علی رضایی",
      userEmail: "ali@example.com",
      category: "technical" as const,
      priority: "medium" as const,
      status: "answered" as const,
      title: "خطای درگاه پرداخت",
      description: "پرداخت ناموفق بود ولی مبلغ کسر شد.",
      attachmentUrl: null,
      lastActivityAt: "2026-10-23T10:00:00.000Z",
      closedAt: null,
      createdAt: "2026-10-23T09:00:00.000Z",
      updatedAt: "2026-10-23T10:00:00.000Z",
      messages: [
        {
          id: "msg-user-1",
          ticketId: "ticket-123",
          senderId: asUserId("user-456"),
          senderRole: "user" as const,
          senderName: "علی رضایی",
          body: "پرداخت ناموفق بود ولی مبلغ کسر شد.",
          attachmentUrl: null,
          isInternalNote: false,
          createdAt: "2026-10-23T09:00:00.000Z",
        },
        {
          id: "msg-admin-read",
          ticketId: "ticket-123",
          senderId: asUserId("admin-999"),
          senderRole: "admin" as const,
          senderName: "پشتیبانی آوانا",
          body: "سلام، تراکنش شما بررسی شد و مبلغ برگشت خورد.",
          attachmentUrl: null,
          isInternalNote: false,
          createdAt: "2026-10-23T09:30:00.000Z",
          readAt: "2026-10-23T09:45:00.000Z", // Already read
        },
        {
          id: "msg-admin-unread",
          ticketId: "ticket-123",
          senderId: asUserId("admin-999"),
          senderRole: "admin" as const,
          senderName: "پشتیبانی آوانا",
          body: "لطفاً رسید جدید را بررسی فرمایید.",
          attachmentUrl: null,
          isInternalNote: false,
          createdAt: "2026-10-23T10:00:00.000Z",
          readAt: null, // Unread
        },
        {
          id: "msg-admin-internal",
          ticketId: "ticket-123",
          senderId: asUserId("admin-999"),
          senderRole: "admin" as const,
          senderName: "مدیر سیستم",
          body: "یادداشت داخلی: تیکت جهت بایگانی بررسی شود.",
          attachmentUrl: null,
          isInternalNote: true,
          createdAt: "2026-10-23T10:05:00.000Z",
          readAt: null,
        },
      ],
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    mockMarkMessagesAsRead.mockReset();
    mockMarkMessagesAsRead.mockResolvedValue({ success: true, markedCount: 1 });
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.spyOn(useSupportModule, "useMyTicketDetails").mockReturnValue({
      data: mockTicketData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as UseQueryResult<{ ticket: SupportTicketItem }, Error>);

    vi.spyOn(useSupportModule, "useAdminTicketDetails").mockReturnValue({
      data: mockTicketData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as UseQueryResult<{ ticket: SupportTicketItem }, Error>);

    vi.spyOn(useSupportModule, "useMarkMessagesAsRead").mockReturnValue({
      mutateAsync: mockMarkMessagesAsRead,
      isPending: false,
    } as unknown as UseMutationResult<{ success: boolean; markedCount: number }, Error, { ticketId: string; messageIds: string[] }>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const renderModal = (isAdminMode = false, isOpen = true) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <TicketConversationModal
          ticketId="ticket-123"
          isOpen={isOpen}
          onClose={vi.fn()}
          isAdminMode={isAdminMode}
        />
      </QueryClientProvider>,
    );
  };

  it("1. Admin mode renders 'دیده شده' for read admin message and 'دیده نشده' for unread admin message", () => {
    renderModal(true);

    // Read admin message: msg-admin-read
    const readReceiptBadge = screen.getByTestId("read-receipt-msg-admin-read");
    expect(readReceiptBadge).toBeInTheDocument();
    expect(readReceiptBadge.textContent).toContain("دیده شده");

    // Unread admin message: msg-admin-unread
    const unreadReceiptBadge = screen.getByTestId("read-receipt-msg-admin-unread");
    expect(unreadReceiptBadge).toBeInTheDocument();
    expect(unreadReceiptBadge.textContent).toContain("دیده نشده");
  });

  it("2. Admin mode DOES NOT render read receipt for user message or internal note", () => {
    renderModal(true);

    expect(screen.queryByTestId("read-receipt-msg-user-1")).toBeNull();
    expect(screen.queryByTestId("read-receipt-msg-admin-internal")).toBeNull();
  });

  it("3. User mode NEVER renders any read receipt text or badge for any message", () => {
    renderModal(false);

    expect(screen.queryByText("دیده شده")).toBeNull();
    expect(screen.queryByText("دیده نشده")).toBeNull();
    expect(screen.queryByTestId("read-receipt-msg-admin-read")).toBeNull();
    expect(screen.queryByTestId("read-receipt-msg-admin-unread")).toBeNull();
    expect(screen.queryByTestId("read-receipt-msg-user-1")).toBeNull();
  });

  it("4. User mode tracks unread admin message via IntersectionObserver with dwell time and debounced batching", async () => {
    type ObserverEntry = { target: Element; isIntersecting: boolean; intersectionRatio: number };
    let observerCallback: (entries: ObserverEntry[]) => void = () => {};
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();

    // Mock IntersectionObserver in browser/JSDOM
    class MockIntersectionObserver {
      constructor(callback: (entries: ObserverEntry[]) => void) {
        observerCallback = callback;
      }
      observe = observeMock;
      disconnect = disconnectMock;
      unobserve = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    renderModal(false);

    expect(observeMock).toHaveBeenCalled();

    // Find the tracked unread admin message element
    const trackedElement = document.querySelector('[data-message-id="msg-admin-unread"]');
    expect(trackedElement).not.toBeNull();

    // Simulate entering viewport with >= 50% visibility
    act(() => {
      observerCallback([
        {
          target: trackedElement!,
          isIntersecting: true,
          intersectionRatio: 0.6,
        },
      ]);
    });

    // Before 400ms dwell time completes -> mutation should not be called yet
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(mockMarkMessagesAsRead).not.toHaveBeenCalled();

    // After 400ms dwell time + 300ms batch delay -> mutation should be called with message ID
    act(() => {
      vi.advanceTimersByTime(550);
    });

    expect(mockMarkMessagesAsRead).toHaveBeenCalledWith({
      ticketId: "ticket-123",
      messageIds: ["msg-admin-unread"],
    });

    // Fast repeated scroll or re-render should NOT trigger duplicate API call
    act(() => {
      observerCallback([
        {
          target: trackedElement!,
          isIntersecting: true,
          intersectionRatio: 0.8,
        },
      ]);
      vi.advanceTimersByTime(1000);
    });

    expect(mockMarkMessagesAsRead).toHaveBeenCalledTimes(1);
  });

  it("5. Quick scroll-past (dwell time not reached) cancels observation without firing API call", () => {
    type ObserverEntry = { target: Element; isIntersecting: boolean; intersectionRatio: number };
    let observerCallback: (entries: ObserverEntry[]) => void = () => {};
    class MockIntersectionObserver {
      constructor(callback: (entries: ObserverEntry[]) => void) {
        observerCallback = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    renderModal(false);

    const trackedElement = document.querySelector('[data-message-id="msg-admin-unread"]');
    expect(trackedElement).not.toBeNull();

    // Enter viewport
    act(() => {
      observerCallback([
        {
          target: trackedElement!,
          isIntersecting: true,
          intersectionRatio: 0.7,
        },
      ]);
    });

    // Advance 150ms then leave viewport (user scrolled past quickly)
    act(() => {
      vi.advanceTimersByTime(150);
      observerCallback([
        {
          target: trackedElement!,
          isIntersecting: false,
          intersectionRatio: 0,
        },
      ]);
      vi.advanceTimersByTime(1000);
    });

    // Should NOT have triggered read receipt
    expect(mockMarkMessagesAsRead).not.toHaveBeenCalled();
  });

  it("6. Failed read request retries up to 3 times with backoff, committing on success", async () => {
    type ObserverEntry = { target: Element; isIntersecting: boolean; intersectionRatio: number };
    let observerCallback: (entries: ObserverEntry[]) => void = () => {};
    class MockIntersectionObserver {
      constructor(callback: (entries: ObserverEntry[]) => void) {
        observerCallback = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    // Fail first 2 attempts, succeed on 3rd attempt
    mockMarkMessagesAsRead
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockRejectedValueOnce(new Error("500 Internal Server Error"))
      .mockResolvedValueOnce({ success: true, markedCount: 1 });

    renderModal(false);

    const trackedElement = document.querySelector('[data-message-id="msg-admin-unread"]');
    expect(trackedElement).not.toBeNull();

    // Trigger dwell time
    act(() => {
      observerCallback([
        {
          target: trackedElement!,
          isIntersecting: true,
          intersectionRatio: 0.6,
        },
      ]);
    });

    // 400ms dwell + 300ms debounce -> 1st attempt (fails)
    await act(async () => {
      vi.advanceTimersByTime(750);
    });
    expect(mockMarkMessagesAsRead).toHaveBeenCalledTimes(1);

    // 1000ms retry backoff -> 2nd attempt (fails)
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(mockMarkMessagesAsRead).toHaveBeenCalledTimes(2);

    // 2000ms retry backoff -> 3rd attempt (succeeds)
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(mockMarkMessagesAsRead).toHaveBeenCalledTimes(3);

    // Now committed; advancing further time should NOT fire any more calls
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockMarkMessagesAsRead).toHaveBeenCalledTimes(3);
  });

  it("7. Closing modal cleans up all observers, timers, and pending queues", () => {
    type ObserverEntry = { target: Element; isIntersecting: boolean; intersectionRatio: number };
    let observerCallback: (entries: ObserverEntry[]) => void = () => {};
    const disconnectMock = vi.fn();
    class MockIntersectionObserver {
      constructor(callback: (entries: ObserverEntry[]) => void) {
        observerCallback = callback;
      }
      observe = vi.fn();
      disconnect = disconnectMock;
      unobserve = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    const { rerender } = renderModal(false, true);

    const trackedElement = document.querySelector('[data-message-id="msg-admin-unread"]');
    expect(trackedElement).not.toBeNull();

    act(() => {
      observerCallback([
        {
          target: trackedElement!,
          isIntersecting: true,
          intersectionRatio: 0.6,
        },
      ]);
    });

    // Modal closes before dwell completes
    rerender(
      <QueryClientProvider client={queryClient}>
        <TicketConversationModal
          ticketId="ticket-123"
          isOpen={false}
          onClose={vi.fn()}
          isAdminMode={false}
        />
      </QueryClientProvider>,
    );

    expect(disconnectMock).toHaveBeenCalled();

    // Advance timers -> no read call should be fired
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockMarkMessagesAsRead).not.toHaveBeenCalled();
  });
});
