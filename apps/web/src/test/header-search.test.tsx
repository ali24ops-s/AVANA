import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
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

describe("HeaderSearch Floating Dropdown Test Suite", () => {
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

  function openDropdown() {
    const trigger = screen.getByRole("button", { name: "جستجو در سامانه" });
    fireEvent.click(trigger);
    return screen.getByPlaceholderText("جستجو در دوره‌ها و محتوا...") as HTMLInputElement;
  }

  it("1. Initial state renders only the small compact trigger button", () => {
    renderComponent();
    expect(screen.queryByPlaceholderText("جستجو در دوره‌ها و محتوا...")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "پنل جستجو" })).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: "جستجو در سامانه" });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveClass("w-9", "h-9", "shrink-0");
  });

  it("2. Click on trigger opens the floating dropdown", () => {
    renderComponent();
    const trigger = screen.getByRole("button", { name: "جستجو در سامانه" });
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "پنل جستجو" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("جستجو در دوره‌ها و محتوا...")).toBeInTheDocument();
  });

  it("3. Opening dropdown does not alter header layout flow (trigger dimensions unchanged, dropdown is floating/absolute)", () => {
    const { container } = renderComponent();
    const wrapper = container.firstElementChild as HTMLElement;
    const trigger = screen.getByRole("button", { name: "جستجو در سامانه" });

    // Initial classes
    expect(wrapper).toHaveClass("relative", "shrink-0");
    expect(trigger).toHaveClass("w-9", "h-9", "shrink-0");

    // Open dropdown
    fireEvent.click(trigger);

    // Wrapper and trigger still retain their fixed shrink-0 layout footprint
    expect(wrapper).toHaveClass("relative", "shrink-0");
    expect(trigger).toHaveClass("w-9", "h-9", "shrink-0");

    // Dropdown is floating with absolute/fixed out-of-flow positioning
    const dropdown = screen.getByRole("dialog", { name: "پنل جستجو" });
    expect(dropdown).toHaveClass("sm:absolute", "shadow-xl", "z-50");
  });

  it("4. Input is autofocused when dropdown opens", () => {
    renderComponent();
    const input = openDropdown();
    expect(input).toHaveFocus();
  });

  it("5. Click outside closes the dropdown", async () => {
    renderComponent();
    openDropdown();
    expect(screen.getByRole("dialog", { name: "پنل جستجو" })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "پنل جستجو" })).not.toBeInTheDocument();
    });
  });

  it("6. Escape key closes the dropdown", async () => {
    renderComponent();
    const input = openDropdown();
    expect(screen.getByRole("dialog", { name: "پنل جستجو" })).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "پنل جستجو" })).not.toBeInTheDocument();
    });
  });

  it("7 & 8. Query is preserved when closed, and reopening displays previous query", async () => {
    renderComponent();
    const input = openDropdown();

    fireEvent.change(input, { target: { value: "فارماکولوژی" } });
    expect(input.value).toBe("فارماکولوژی");

    // Close via outside click
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "پنل جستجو" })).not.toBeInTheDocument();
    });

    // Reopen dropdown
    const trigger = screen.getByRole("button", { name: "جستجو در سامانه" });
    fireEvent.click(trigger);

    // Verify query is retained
    const reopenedInput = screen.getByPlaceholderText("جستجو در دوره‌ها و محتوا...") as HTMLInputElement;
    expect(reopenedInput.value).toBe("فارماکولوژی");
  });

  it("9. Debounces typing before triggering backend search request", async () => {
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
    const input = openDropdown();

    // Type fast
    fireEvent.change(input, { target: { value: "فارما" } });

    // Immediately before 300ms, search shouldn't be called yet
    expect(searchMock).not.toHaveBeenCalled();

    // After debounce interval (350ms)
    await waitFor(() => {
      expect(searchMock).toHaveBeenCalledWith("فارما", 10);
    });
  });

  it("10. Displays categorized Course results under 'دوره‌ها' and navigates on click", async () => {
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
    const input = openDropdown();

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
    // Dropdown closes after selection
    expect(screen.queryByRole("dialog", { name: "پنل جستجو" })).not.toBeInTheDocument();
  });

  it("11. Filters out Educational Pack results from general search and does not navigate to packId", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      request_id: "req-2",
      query: "آنتی",
      total: 1,
      results: [
        {
          id: "pack-456",
          type: "educational_pack",
          title: "خلاصه آنتی‌بیوتیک‌ها",
          subtitle: "فارماکولوژی • بسته آموزشی",
          target_url: "/library?packId=pack-456",
        },
      ],
      grouped: {
        courses: [],
        educational_packs: [
          {
            id: "pack-456",
            type: "educational_pack",
            title: "خلاصه آنتی‌بیوتیک‌ها",
            subtitle: "فارماکولوژی • بسته آموزشی",
            target_url: "/library?packId=pack-456",
          },
        ],
        shared_content: [],
      },
    });

    vi.spyOn(searchApiModule, "createSearchApi").mockReturnValue({
      search: searchMock,
    });

    renderComponent();
    const input = openDropdown();

    fireEvent.change(input, { target: { value: "آنتی" } });

    await waitFor(() => {
      // Educational packs are suppressed from user search
      expect(screen.queryByText("بسته‌های آموزشی")).not.toBeInTheDocument();
      expect(screen.queryByText("خلاصه آنتی‌بیوتیک‌ها")).not.toBeInTheDocument();
      expect(screen.getByText(/نتیجه‌ای برای «آنتی» پیدا نشد/)).toBeInTheDocument();
    });
  });

  it("12. Shows empty state when no results match", async () => {
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
    const input = openDropdown();

    fireEvent.change(input, { target: { value: "مبحث_ناموجود" } });

    await waitFor(() => {
      expect(
        screen.getByText(/نتیجه‌ای برای «مبحث_ناموجود» پیدا نشد/i),
      ).toBeInTheDocument();
    });
  });

  it("13. Shows error state when backend API fails without crashing the header", async () => {
    const searchMock = vi.fn().mockRejectedValue(new Error("Network failure"));

    vi.spyOn(searchApiModule, "createSearchApi").mockReturnValue({
      search: searchMock,
    });

    renderComponent();
    const input = openDropdown();

    fireEvent.change(input, { target: { value: "تست_خطا" } });

    await waitFor(() => {
      expect(
        screen.getByText("خطا در برقراری ارتباط با سرور جستجو."),
      ).toBeInTheDocument();
    });
  });

  it("14. Clear button resets input in dropdown", async () => {
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
    const input = openDropdown();

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

  it("15. Supports keyboard navigation (ArrowDown, ArrowUp, Enter) to select search results", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      request_id: "req-6",
      query: "قلب",
      total: 2,
      results: [
        {
          id: "c-cardio-1",
          type: "course",
          title: "فیزیولوژی قلب",
          target_url: "/courses/cardio-1",
        },
        {
          id: "c-cardio-2",
          type: "course",
          title: "فارماکولوژی قلب",
          target_url: "/courses/cardio-2",
        },
      ],
      grouped: {
        courses: [
          {
            id: "c-cardio-1",
            type: "course",
            title: "فیزیولوژی قلب",
            target_url: "/courses/cardio-1",
          },
          {
            id: "c-cardio-2",
            type: "course",
            title: "فارماکولوژی قلب",
            target_url: "/courses/cardio-2",
          },
        ],
        shared_content: [],
      },
    });

    vi.spyOn(searchApiModule, "createSearchApi").mockReturnValue({
      search: searchMock,
    });

    renderComponent();
    const input = openDropdown();

    fireEvent.change(input, { target: { value: "قلب" } });

    await waitFor(() => {
      expect(screen.getByText("فیزیولوژی قلب")).toBeInTheDocument();
      expect(screen.getByText("فارماکولوژی قلب")).toBeInTheDocument();
    });

    // Press ArrowDown to select first item
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const items = screen.getAllByRole("option");
    expect(items[0]).toHaveAttribute("aria-selected", "true");
    expect(items[1]).toHaveAttribute("aria-selected", "false");

    // Press ArrowDown again to select second item
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(items[0]).toHaveAttribute("aria-selected", "false");
    expect(items[1]).toHaveAttribute("aria-selected", "true");

    // Press Enter to navigate
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockNavigate).toHaveBeenCalledWith("/courses/cardio-2");
  });

  it("16. Only displays Courses section and suppresses Educational Packs section when both exist in API response", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      request_id: "req-7",
      query: "ژنتیک",
      total: 2,
      results: [
        {
          id: "course-genetics",
          type: "course",
          title: "ژنتیک پایه",
          subtitle: "پزشکی",
          target_url: "/courses/course-genetics",
        },
        {
          id: "pack-genetics",
          type: "educational_pack",
          title: "بسته آموزشی ژنتیک مولکولی",
          subtitle: "پزشکی • بسته آموزشی",
          target_url: "/library?packId=pack-genetics",
        },
      ],
      grouped: {
        courses: [
          {
            id: "course-genetics",
            type: "course",
            title: "ژنتیک پایه",
            subtitle: "پزشکی",
            target_url: "/courses/course-genetics",
          },
        ],
        educational_packs: [
          {
            id: "pack-genetics",
            type: "educational_pack",
            title: "بسته آموزشی ژنتیک مولکولی",
            subtitle: "پزشکی • بسته آموزشی",
            target_url: "/library?packId=pack-genetics",
          },
        ],
      },
    });

    vi.spyOn(searchApiModule, "createSearchApi").mockReturnValue({
      search: searchMock,
    });

    renderComponent();
    const input = openDropdown();

    fireEvent.change(input, { target: { value: "ژنتیک" } });

    await waitFor(() => {
      // Courses category exists, but Educational Packs category does not
      expect(screen.getByText("دوره‌ها")).toBeInTheDocument();
      expect(screen.queryByText("بسته‌های آموزشی")).not.toBeInTheDocument();

      // Course exists, Educational Pack does not
      expect(screen.getByText("ژنتیک پایه")).toBeInTheDocument();
      expect(screen.queryByText("بسته آموزشی ژنتیک مولکولی")).not.toBeInTheDocument();
    });

    // Selecting course navigates to course page
    const courseBtn = screen.getByText("ژنتیک پایه").closest("button");
    fireEvent.click(courseBtn!);
    expect(mockNavigate).toHaveBeenCalledWith("/courses/course-genetics");
  });

  it("17. Does not display Educational Pack when only Educational Packs are returned from API", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      request_id: "req-8",
      query: "نورولوژی",
      total: 1,
      results: [
        {
          id: "pack-neuro-99",
          type: "educational_pack",
          title: "بسته آموزشی اعصاب",
          target_url: "",
        },
      ],
      grouped: {
        courses: [],
        educational_packs: [
          {
            id: "pack-neuro-99",
            type: "educational_pack",
            title: "بسته آموزشی اعصاب",
            target_url: "",
          },
        ],
      },
    });

    vi.spyOn(searchApiModule, "createSearchApi").mockReturnValue({
      search: searchMock,
    });

    renderComponent();
    const input = openDropdown();

    fireEvent.change(input, { target: { value: "نورولوژی" } });

    await waitFor(() => {
      expect(screen.queryByText("بسته آموزشی اعصاب")).not.toBeInTheDocument();
      expect(screen.getByText(/نتیجه‌ای برای «نورولوژی» پیدا نشد/)).toBeInTheDocument();
    });
  });
});
