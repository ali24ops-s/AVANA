import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StudioPollsPage } from "../pages/studio/StudioPollsPage.js";
import * as AuthModule from "../providers/AuthProvider.js";
import * as StudioPollsHookModule from "../hooks/useStudioPolls.js";

describe("StudioPollsPage (Step 2)", () => {
  const mockPolls = [
    {
      id: "poll-1",
      title: "نظرسنجی کیفیت تدریس",
      slug: "teaching-quality",
      description: "بررسی رضایت دانشجویان",
      status: "published" as const,
      questionsCount: 5,
      responsesCount: 42,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { allowAnonymous: true },
    },
    {
      id: "poll-2",
      title: "نظرسنجی خدمات رفاهی",
      slug: "welfare-services",
      description: "بررسی خدمات تغذیه و خوابگاه",
      status: "draft" as const,
      questionsCount: 2,
      responsesCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { allowAnonymous: true },
    },
  ];

  const mockMutations = {
    createMutation: { mutateAsync: vi.fn(), isPending: false },
    deleteMutation: { mutateAsync: vi.fn(), isPending: false },
    publishMutation: { mutateAsync: vi.fn(), isPending: false },
    closeMutation: { mutateAsync: vi.fn(), isPending: false },
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(StudioPollsHookModule, "useStudioPolls").mockReturnValue({
      data: mockPolls,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(StudioPollsHookModule, "useCreatePollMutation").mockReturnValue(mockMutations.createMutation as any);
    vi.spyOn(StudioPollsHookModule, "useDeletePollMutation").mockReturnValue(mockMutations.deleteMutation as any);
    vi.spyOn(StudioPollsHookModule, "usePublishPollMutation").mockReturnValue(mockMutations.publishMutation as any);
    vi.spyOn(StudioPollsHookModule, "useClosePollMutation").mockReturnValue(mockMutations.closeMutation as any);
  });

  it("renders page header, status tabs, and poll cards for platform_admin", () => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: { id: "u1", role: "platform_admin", name: "مدیر کل" } as any,
      memberships: [],
      isLoading: false,
      isAuthenticated: true,
    } as any);

    render(
      <MemoryRouter>
        <StudioPollsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("نظرسنجی‌ها و فرم‌ها")).toBeInTheDocument();
    expect(screen.getByText("نظرسنجی کیفیت تدریس")).toBeInTheDocument();
    expect(screen.getByText("نظرسنجی خدمات رفاهی")).toBeInTheDocument();

    // Check status badges
    expect(screen.getAllByText("منتشر شده").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("پیش‌نویس").length).toBeGreaterThanOrEqual(1);

    // Verify admin can see publish / delete actions
    expect(screen.getByText("انتشار نظرسنجی")).toBeInTheDocument();
  });

  it("restricts content_worker from publishing or deleting polls", () => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: { id: "u2", role: "content_worker", name: "کارشناس محتوا" } as any,
      memberships: [{ organizationId: "org-1", role: "content_worker" }],
      isLoading: false,
      isAuthenticated: true,
    } as any);

    render(
      <MemoryRouter>
        <StudioPollsPage />
      </MemoryRouter>,
    );

    // Verify content_worker sees the role explanation banner
    expect(screen.getByText(/نقش شما/)).toBeInTheDocument();

    // Verify content_worker CANNOT see publish or delete buttons
    expect(screen.queryByText("انتشار نظرسنجی")).not.toBeInTheDocument();
    expect(screen.queryByTitle("حذف نظرسنجی")).not.toBeInTheDocument();
  });

  it("filters polls by search query", () => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: { id: "u1", role: "platform_admin" } as any,
      memberships: [],
      isLoading: false,
      isAuthenticated: true,
    } as any);

    render(
      <MemoryRouter>
        <StudioPollsPage />
      </MemoryRouter>,
    );

    const searchInput = screen.getByPlaceholderText("جستجو در نظرسنجی‌ها...");
    fireEvent.change(searchInput, { target: { value: "تدریس" } });

    expect(screen.getByText("نظرسنجی کیفیت تدریس")).toBeInTheDocument();
    expect(screen.queryByText("نظرسنجی خدمات رفاهی")).not.toBeInTheDocument();
  });

  it("opens create modal and invokes createPollMutation", async () => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: { id: "u1", role: "platform_admin" } as any,
      memberships: [],
      isLoading: false,
      isAuthenticated: true,
    } as any);

    mockMutations.createMutation.mutateAsync.mockResolvedValueOnce({
      poll: { id: "poll-3", title: "نظرسنجی تازه" },
    });

    render(
      <MemoryRouter>
        <StudioPollsPage />
      </MemoryRouter>,
    );

    const createBtn = screen.getByRole("button", { name: /نظرسنجی جدید/ });
    fireEvent.click(createBtn);

    expect(screen.getByText("ایجاد نظرسنجی جدید")).toBeInTheDocument();

    const titleInput = screen.getByPlaceholderText(/کیفیت دوره‌های آموزشی/);
    fireEvent.change(titleInput, { target: { value: "نظرسنجی تازه" } });

    const submitBtn = screen.getByText("ایجاد و ورود به ویرایشگر");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockMutations.createMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ title: "نظرسنجی تازه" }),
      );
    });
  });
});
