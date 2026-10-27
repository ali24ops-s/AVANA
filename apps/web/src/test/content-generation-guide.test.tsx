import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContentGenerationGuideModal } from "../components/documents/ContentGenerationGuideModal.js";
import { CourseDocumentsView } from "../components/documents/CourseDocumentsView.js";
import * as AuthProviderModule from "../providers/AuthProvider.js";
import type { UserResource } from "@avana/contracts";

const createMockLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const mockLocalStorage = createMockLocalStorage();
Object.defineProperty(window, "localStorage", {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Content Generation Onboarding Guide", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId1 = "course-math-101";
  const mockCourseId2 = "course-physics-202";

  beforeEach(() => {
    mockLocalStorage.clear();
    vi.restoreAllMocks();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ request_id: "req-guide-test", items: [] }),
    });
  });

  afterEach(() => {
    mockLocalStorage.clear();
  });

  describe("ContentGenerationGuideModal Component", () => {
    it("renders dialog with 5 core tips, encouragement message, and RTL layout", () => {
      const handleClose = vi.fn();
      const handleStartLearning = vi.fn();

      render(
        <ContentGenerationGuideModal
          isOpen={true}
          onClose={handleClose}
          onStartLearning={handleStartLearning}
        />,
      );

      // Title & Subtitle
      expect(
        screen.getByText("راهنمای تولید محتوای هوشمند در آوانا"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/۵ نکته کلیدی برای تولید دقیق‌ترین درسنامه‌ها/),
      ).toBeInTheDocument();

      // Tip 1: Readability score (> 90%)
      const tip1 = screen.getByTestId("guide-tip-readability");
      expect(tip1).toBeInTheDocument();
      expect(tip1).toHaveTextContent(/کیفیت خوانش فایل/);
      expect(tip1).toHaveTextContent(/۹۰٪/);

      // Tip 2: Low-quality files -> copy to Word
      const tip2 = screen.getByTestId("guide-tip-low-quality");
      expect(tip2).toBeInTheDocument();
      expect(tip2).toHaveTextContent(/فایل‌های کم‌کیفیت یا اسکن‌شده/);
      expect(tip2).toHaveTextContent(/Word/);

      // Tip 3: Large files -> split into chapters
      const tip3 = screen.getByTestId("guide-tip-large-files");
      expect(tip3).toBeInTheDocument();
      expect(tip3).toHaveTextContent(/فایل‌های حجیم و منابع بزرگ/);
      expect(tip3).toHaveTextContent(/فصل‌ها یا بخش‌های کوچک‌تر/);

      // Tip 4: Check Library first
      const tip4 = screen.getByTestId("guide-tip-library");
      expect(tip4).toBeInTheDocument();
      expect(tip4).toHaveTextContent(/بررسی کتابخونه آوانا پیش از تولید/);
      expect(tip4).toHaveTextContent(/پرداخت هزینه غیرضروری/);

      // Tip 5: Poor output & reproduction check
      const tip5 = screen.getByTestId("guide-tip-reproduction");
      expect(tip5).toBeInTheDocument();
      expect(tip5).toHaveTextContent(/خروجی غیرعادی ضعیف و بازتولید/);
      expect(tip5).toHaveTextContent(/هزینه اضافی بدون تغییر نتیجه/);

      // Encouraging closing message
      const closing = screen.getByTestId("guide-closing-encouragement");
      expect(closing).toBeInTheDocument();
      expect(closing).toHaveTextContent(/آماده‌اید؟/);
      expect(closing).toHaveTextContent(/یک فصل باکیفیت و با حجم مناسب/);

      // Action button
      const confirmBtn = screen.getByRole("button", {
        name: /متوجه شدم و شروع/,
      });
      expect(confirmBtn).toBeInTheDocument();
      fireEvent.click(confirmBtn);

      expect(handleClose).toHaveBeenCalledTimes(1);
      expect(handleStartLearning).toHaveBeenCalledTimes(1);
    });

    it("triggers onClose when clicking header close button", () => {
      const handleClose = vi.fn();

      render(
        <ContentGenerationGuideModal isOpen={true} onClose={handleClose} />,
      );

      const closeBtn = screen.getByLabelText("بستن پنجره");
      expect(closeBtn).toBeInTheDocument();
      fireEvent.click(closeBtn);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Integrated Behavior in CourseDocumentsView", () => {
    it("1. Automatically opens guide modal on first visit to documents tab", async () => {
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <CourseDocumentsView
            organizationId={mockOrgId}
            courseId={mockCourseId1}
            isActiveTab={true}
          />
        </QueryClientProvider>,
      );

      // Modal appears automatically
      await waitFor(() => {
        expect(
          screen.getByText("راهنمای تولید محتوای هوشمند در آوانا"),
        ).toBeInTheDocument();
      });

      // Five tips are shown
      expect(screen.getByTestId("guide-tip-readability")).toBeInTheDocument();
      expect(screen.getByTestId("guide-tip-low-quality")).toBeInTheDocument();
      expect(screen.getByTestId("guide-tip-large-files")).toBeInTheDocument();
      expect(screen.getByTestId("guide-tip-library")).toBeInTheDocument();
      expect(screen.getByTestId("guide-tip-reproduction")).toBeInTheDocument();
    });

    it("2. Does NOT show guide automatically when active tab is not documents", async () => {
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <CourseDocumentsView
            organizationId={mockOrgId}
            courseId={mockCourseId1}
            isActiveTab={false}
          />
        </QueryClientProvider>,
      );

      // Guide modal should NOT be displayed
      expect(
        screen.queryByText("راهنمای تولید محتوای هوشمند در آوانا"),
      ).not.toBeInTheDocument();
    });

    it("3. Does NOT show again after closing and re-rendering (persisted in localStorage)", async () => {
      const queryClient = createTestQueryClient();

      const { unmount } = render(
        <QueryClientProvider client={queryClient}>
          <CourseDocumentsView
            organizationId={mockOrgId}
            courseId={mockCourseId1}
            isActiveTab={true}
          />
        </QueryClientProvider>,
      );

      // Wait for modal to appear
      await waitFor(() => {
        expect(
          screen.getByText("راهنمای تولید محتوای هوشمند در آوانا"),
        ).toBeInTheDocument();
      });

      // Close modal
      const confirmBtn = screen.getByRole("button", {
        name: /متوجه شدم و شروع/,
      });
      fireEvent.click(confirmBtn);

      // Verify stored in localStorage (guest user when no auth provider)
      expect(
        window.localStorage.getItem(
          `avana_content_guide_seen_guest_${mockCourseId1}`,
        ),
      ).toBe("true");

      unmount();

      // Re-mount / simulate page reload with fresh queryClient
      const freshQueryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={freshQueryClient}>
          <CourseDocumentsView
            organizationId={mockOrgId}
            courseId={mockCourseId1}
            isActiveTab={true}
          />
        </QueryClientProvider>,
      );

      // Modal should NOT be open
      expect(
        screen.queryByText("راهنمای تولید محتوای هوشمند در آوانا"),
      ).not.toBeInTheDocument();
    });

    it("4. Maintains independent status per course (shows automatically for course 2 even if course 1 is seen)", async () => {
      // Mark course 1 as seen
      window.localStorage.setItem(
        `avana_content_guide_seen_guest_${mockCourseId1}`,
        "true",
      );

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <CourseDocumentsView
            organizationId={mockOrgId}
            courseId={mockCourseId2}
            isActiveTab={true}
          />
        </QueryClientProvider>,
      );

      // Course 2 was never seen, so guide MUST appear
      await waitFor(() => {
        expect(
          screen.getByText("راهنمای تولید محتوای هوشمند در آوانا"),
        ).toBeInTheDocument();
      });
    });

    it("5. Scopes viewed state to authenticated user and preserves guest isolation", async () => {
      const mockUser1 = { id: "user-alpha-123" } as unknown as UserResource;
      const mockUser2 = { id: "user-beta-456" } as unknown as UserResource;

      // Mock useAuth returning user 1
      const useAuthSpy = vi.spyOn(AuthProviderModule, "useAuth");
      useAuthSpy.mockReturnValue({
        user: mockUser1,
        memberships: [],
        isLoading: false,
        isAuthenticated: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        isVerified: true,
        signIn: vi.fn(),
        workerAutoLogin: vi.fn(),
        sendPhoneLoginOtp: vi.fn(),
        verifyPhoneLoginOtp: vi.fn(),
        signUp: vi.fn(),
        sendVerification: vi.fn(),
        verifyChannel: vi.fn(),
        verifyEmail: vi.fn(),
        resendVerification: vi.fn(),
        forgotPassword: vi.fn(),
        resetPassword: vi.fn(),
        updateProfile: vi.fn(),
        signOut: vi.fn(),
        clearError: vi.fn(),
        error: null,
      });

      const queryClient = createTestQueryClient();

      const { unmount } = render(
        <QueryClientProvider client={queryClient}>
          <CourseDocumentsView
            organizationId={mockOrgId}
            courseId={mockCourseId1}
            isActiveTab={true}
          />
        </QueryClientProvider>,
      );

      // Modal opens for user 1
      await waitFor(() => {
        expect(
          screen.getByText("راهنمای تولید محتوای هوشمند در آوانا"),
        ).toBeInTheDocument();
      });

      // User 1 closes guide
      fireEvent.click(screen.getByRole("button", { name: /متوجه شدم و شروع/ }));

      // Key must be saved for user 1 specifically
      expect(
        window.localStorage.getItem(
          `avana_content_guide_seen_user-alpha-123_${mockCourseId1}`,
        ),
      ).toBe("true");
      expect(
        window.localStorage.getItem(
          `avana_content_guide_seen_user-beta-456_${mockCourseId1}`,
        ),
      ).toBeNull();
      expect(
        window.localStorage.getItem(
          `avana_content_guide_seen_guest_${mockCourseId1}`,
        ),
      ).toBeNull();

      unmount();

      // Now switch to user 2 in same browser session
      useAuthSpy.mockReturnValue({
        user: mockUser2,
        memberships: [],
        isLoading: false,
        isAuthenticated: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        isVerified: true,
        signIn: vi.fn(),
        workerAutoLogin: vi.fn(),
        sendPhoneLoginOtp: vi.fn(),
        verifyPhoneLoginOtp: vi.fn(),
        signUp: vi.fn(),
        sendVerification: vi.fn(),
        verifyChannel: vi.fn(),
        verifyEmail: vi.fn(),
        resendVerification: vi.fn(),
        forgotPassword: vi.fn(),
        resetPassword: vi.fn(),
        updateProfile: vi.fn(),
        signOut: vi.fn(),
        clearError: vi.fn(),
        error: null,
      });

      const freshQueryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={freshQueryClient}>
          <CourseDocumentsView
            organizationId={mockOrgId}
            courseId={mockCourseId1}
            isActiveTab={true}
          />
        </QueryClientProvider>,
      );

      // Guide MUST open for user 2 because user 2 hasn't seen it yet
      await waitFor(() => {
        expect(
          screen.getByText("راهنمای تولید محتوای هوشمند در آوانا"),
        ).toBeInTheDocument();
      });
    });

    it("6. Re-opens guide via 'راهنمای تولید محتوا' toolbar button without breaking auto-show suppression", async () => {
      // Mark as seen initially
      window.localStorage.setItem(
        `avana_content_guide_seen_guest_${mockCourseId1}`,
        "true",
      );

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <CourseDocumentsView
            organizationId={mockOrgId}
            courseId={mockCourseId1}
            isActiveTab={true}
          />
        </QueryClientProvider>,
      );

      // Not open automatically
      expect(
        screen.queryByText("راهنمای تولید محتوای هوشمند در آوانا"),
      ).not.toBeInTheDocument();

      // Toolbar button exists
      const guideBtn = screen.getByRole("button", {
        name: /راهنمای تولید محتوا/,
      });
      expect(guideBtn).toBeInTheDocument();

      // Click to open manually
      fireEvent.click(guideBtn);

      await waitFor(() => {
        expect(
          screen.getByText("راهنمای تولید محتوای هوشمند در آوانا"),
        ).toBeInTheDocument();
      });

      // Close manually opened modal
      fireEvent.click(screen.getByRole("button", { name: /متوجه شدم و شروع/ }));

      // Key is still intact
      expect(
        window.localStorage.getItem(
          `avana_content_guide_seen_guest_${mockCourseId1}`,
        ),
      ).toBe("true");
    });

    it("7. Does NOT block file upload or multi-source generation controls", async () => {
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <CourseDocumentsView
            organizationId={mockOrgId}
            courseId={mockCourseId1}
            isActiveTab={true}
          />
        </QueryClientProvider>,
      );

      // Guide is open
      await waitFor(() => {
        expect(
          screen.getByText("راهنمای تولید محتوای هوشمند در آوانا"),
        ).toBeInTheDocument();
      });

      // Close guide
      fireEvent.click(screen.getByRole("button", { name: /متوجه شدم و شروع/ }));

      // File upload dropzone is fully interactive and functional
      expect(
        screen.getByText(/برای انتخاب فایل کلیک کنید یا فایل را به اینجا بکشید/),
      ).toBeInTheDocument();

      const multiModeBtn = screen.getByRole("button", {
        name: /تولید محتوا از چند فایل/,
      });
      expect(multiModeBtn).toBeInTheDocument();
      fireEvent.click(multiModeBtn);

      // Switches cleanly to multi-file mode
      expect(screen.getByText("حالت چندفایلی")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /بازگشت به حالت یک فایل/ }),
      ).toBeInTheDocument();
    });

    it("8. Closes guide when pressing Escape key and saves viewed state", async () => {
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <CourseDocumentsView
            organizationId={mockOrgId}
            courseId={mockCourseId1}
            isActiveTab={true}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(
          screen.getByText("راهنمای تولید محتوای هوشمند در آوانا"),
        ).toBeInTheDocument();
      });

      // Press Escape key
      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(
          screen.queryByText("راهنمای تولید محتوای هوشمند در آوانا"),
        ).not.toBeInTheDocument();
      });

      expect(
        window.localStorage.getItem(
          `avana_content_guide_seen_guest_${mockCourseId1}`,
        ),
      ).toBe("true");
    });

    it("9. Handles localStorage errors gracefully (e.g. private browsing quota/security exception)", async () => {
      // Force localStorage.getItem to throw
      vi.spyOn(mockLocalStorage, "getItem").mockImplementation(() => {
        throw new Error("SecurityError: Access is denied for this document");
      });
      const setItemSpy = vi
        .spyOn(mockLocalStorage, "setItem")
        .mockImplementation(() => {
          throw new Error("QuotaExceededError");
        });

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <CourseDocumentsView
            organizationId={mockOrgId}
            courseId={mockCourseId1}
            isActiveTab={true}
          />
        </QueryClientProvider>,
      );

      // Should open safely without crashing
      await waitFor(() => {
        expect(
          screen.getByText("راهنمای تولید محتوای هوشمند در آوانا"),
        ).toBeInTheDocument();
      });

      // Close modal - setItem will throw, but handled gracefully via inMemorySeenKeys
      fireEvent.click(screen.getByRole("button", { name: /متوجه شدم و شروع/ }));

      await waitFor(() => {
        expect(
          screen.queryByText("راهنمای تولید محتوای هوشمند در آوانا"),
        ).not.toBeInTheDocument();
      });

      expect(setItemSpy).toHaveBeenCalled();
    });
  });
});
