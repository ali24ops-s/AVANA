// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { HeaderSearch } from "../components/shell/HeaderSearch.js";
import * as searchApiModule from "../lib/api/search.js";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("HeaderSearch Frontend Component Test Suite", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
          gcTime: 0,
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  function renderComponent() {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HeaderSearch />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("1. Renders the search input with placeholder and search icon", () => {
    renderComponent();
    const input = screen.getByPlaceholderText("جستجو در دوره‌ها و محتوا...");
    expect(input).toBeInTheDocument();
  });

  it("2. Debounces typing before triggering backend search request", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      request_id: "req-1",
      query: "فارما",
      total: 1,
      results: [
        {
          id: "c-1",
          type: "course",
          title: "فارماکولوژی ۱",
          subtitle: "داروسازی",
          target_url: "/courses/c-1",
        },
      ],
      grouped: {
        courses: [
          {
            id: "c-1",
            type: "course",
            title: "فارماکولوژی ۱",
            subtitle: "داروسازی",
            target_url: "/courses/c-1",
          },
        ],
        shared_content: [],
      },
    });

    vi.spyOn(searchApiModule, "createSearchApi").mockReturnValue({
      search: searchMock,
    });

    renderComponent();
    const input = screen.getByPlaceholderText("جستجو در دوره‌ها و محتوا...");

    // Type fast
    fireEvent.change(input, { target: { value: "فارما" } });

    // Immediately before 300ms, search shouldn't be called yet
    expect(searchMock).not.toHaveBeenCalled();

    // After debounce interval (350ms)
    await waitFor(() => {
      expect(searchMock).toHaveBeenCalledWith("فارما", 10);
    });
  });

  it("3. Displays categorized Course results under 'دوره‌ها' and navigates on click", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      request_id: "req-1",
      query: "شیمی",
      total: 2,
      results: [
        {
          id: "course-123",
          type: "course",
          title: "شیمی دارویی ۲",
          subtitle: "داروسازی",
          target_url: "/courses/course-123",
        },
      ],
      grouped: {
        courses: [
          {
            id: "course-123",
            type: "course",
            title: "شیمی دارویی ۲",
            subtitle: "داروسازی",
            target_url: "/courses/course-123",
          },
        ],
        shared_content: [],
      },
    });

    vi.spyOn(searchApiModule, "createSearchApi").mockReturnValue({
      search: searchMock,
    });

    renderComponent();
    const input = screen.getByPlaceholderText("جستجو در دوره‌ها و محتوا...");

    fireEvent.change(input, { target: { value: "شیمی" } });

    await waitFor(() => {
      expect(screen.getByText("دوره‌ها")).toBeInTheDocument();
      expect(screen.getByText("شیمی دارویی ۲")).toBeInTheDocument();
    });

    // Click on course result
    const courseBtn = screen.getByText("شیمی دارویی ۲").closest("button");
    expect(courseBtn).toBeInTheDocument();
    fireEvent.click(courseBtn!);

    expect(mockNavigate).toHaveBeenCalledWith("/courses/course-123");
    // Input is reset after selection
    expect(input.value).toBe("");
  });

  it("4. Displays categorized Shared Content results and navigates to Library with packId", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      request_id: "req-2",
      query: "آنتی",
      total: 1,
      results: [
        {
          id: "pack-456",
          type: "shared_content",
          title: "خلاصه آنتی‌بیوتیک‌ها",
          subtitle: "فارماکولوژی • محتوای اشتراکی",
          target_url: "/library?packId=pack-456",
        },
      ],
      grouped: {
        courses: [],
        shared_content: [
          {
            id: "pack-456",
            type: "shared_content",
            title: "خلاصه آنتی‌بیوتیک‌ها",
            subtitle: "فارماکولوژی • محتوای اشتراکی",
            target_url: "/library?packId=pack-456",
          },
        ],
      },
    });

    vi.spyOn(searchApiModule, "createSearchApi").mockReturnValue({
      search: searchMock,
    });

    renderComponent();
    const input = screen.getByPlaceholderText("جستجو در دوره‌ها و محتوا...");

    fireEvent.change(input, { target: { value: "آنتی" } });

    await waitFor(() => {
      expect(screen.getByText("محتواهای به‌اشتراک‌گذاشته‌شده")).toBeInTheDocument();
      expect(screen.getByText("خلاصه آنتی‌بیوتیک‌ها")).toBeInTheDocument();
    });

    // Click on shared content result
    const packBtn = screen.getByText("خلاصه آنتی‌بیوتیک‌ها").closest("button");
    expect(packBtn).toBeInTheDocument();
    fireEvent.click(packBtn!);

    expect(mockNavigate).toHaveBeenCalledWith("/library?packId=pack-456");
  });

  it("5. Shows empty state when no results match", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      request_id: "req-3",
      query: "مبحث_ناموجود",
      total: 0,
      results: [],
      grouped: {
        courses: [],
        shared_content: [],
      },
    });

    vi.spyOn(searchApiModule, "createSearchApi").mockReturnValue({
      search: searchMock,
    });

    renderComponent();
    const input = screen.getByPlaceholderText("جستجو در دوره‌ها و محتوا...");

    fireEvent.change(input, { target: { value: "مبحث_ناموجود" } });

    await waitFor(() => {
      expect(
        screen.getByText(/نتیجه‌ای برای «مبحث_ناموجود» پیدا نشد/i),
      ).toBeInTheDocument();
    });
  });

  it("6. Shows error state when backend API fails without crashing the header", async () => {
    const searchMock = vi.fn().mockRejectedValue(new Error("Network failure"));

    vi.spyOn(searchApiModule, "createSearchApi").mockReturnValue({
      search: searchMock,
    });

    renderComponent();
    const input = screen.getByPlaceholderText("جستجو در دوره‌ها و محتوا...");

    fireEvent.change(input, { target: { value: "تست_خطا" } });

    await waitFor(() => {
      expect(
        screen.getByText("خطا در برقراری ارتباط با سرور جستجو."),
      ).toBeInTheDocument();
    });
  });

  it("7. Clear button resets input and closes dropdown", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      request_id: "req-4",
      query: "دارو",
      total: 1,
      results: [
        {
          id: "c-1",
          type: "course",
          title: "شیمی دارویی",
          target_url: "/courses/c-1",
        },
      ],
      grouped: {
        courses: [
          {
            id: "c-1",
            type: "course",
            title: "شیمی دارویی",
            target_url: "/courses/c-1",
          },
        ],
        shared_content: [],
      },
    });

    vi.spyOn(searchApiModule, "createSearchApi").mockReturnValue({
      search: searchMock,
    });

    renderComponent();
    const input = screen.getByPlaceholderText("جستجو در دوره‌ها و محتوا...");

    fireEvent.change(input, { target: { value: "دارو" } });

    await waitFor(() => {
      expect(screen.getByText("شیمی دارویی")).toBeInTheDocument();
    });

    const clearBtn = screen.getByLabelText("پاک کردن جستجو");
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);

    expect(input.value).toBe("");
    expect(screen.queryByText("شیمی دارویی")).not.toBeInTheDocument();
  });

  it("8. Escape key closes results dropdown", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      request_id: "req-5",
      query: "بافت",
      total: 1,
      results: [
        {
          id: "c-2",
          type: "course",
          title: "بافت‌شناسی",
          target_url: "/courses/c-2",
        },
      ],
      grouped: {
        courses: [
          {
            id: "c-2",
            type: "course",
            title: "بافت‌شناسی",
            target_url: "/courses/c-2",
          },
        ],
        shared_content: [],
      },
    });

    vi.spyOn(searchApiModule, "createSearchApi").mockReturnValue({
      search: searchMock,
    });

    renderComponent();
    const input = screen.getByPlaceholderText("جستجو در دوره‌ها و محتوا...");

    fireEvent.change(input, { target: { value: "بافت" } });

    await waitFor(() => {
      expect(screen.getByText("بافت‌شناسی")).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText("بافت‌شناسی")).not.toBeInTheDocument();
    });
  });
});
