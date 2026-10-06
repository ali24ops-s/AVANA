import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthenticatedShell } from "../components/shell/AuthenticatedShell.js";
import { GlobalGenerationIndicator } from "../components/generation/GlobalGenerationIndicator.js";
import type { ActiveGenerationItem } from "../lib/api/generation.js";

// Mock mutable auth state
let mockCurrentUser: { id: string; email: string; role: string; name?: string } | null = null;
let mockUserMemberships: { organization_id: string; role: string }[] = [];

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    memberships: mockUserMemberships,
    isLoading: false,
    error: null,
    isAuthenticated: mockCurrentUser !== null,
    signOut: vi.fn(),
  }),
}));

// Mock Commerce hook
vi.mock("../hooks/useCommerce.js", () => ({
  useMySubscription: () => ({
    data: null,
    isLoading: false,
  }),
}));

const { mockGetActiveGenerations } = vi.hoisted(() => ({
  mockGetActiveGenerations: vi.fn(),
}));

vi.mock("../lib/api/generation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api/generation.js")>();
  return {
    ...actual,
    createGenerationApi: () => ({
      getActiveGenerations: mockGetActiveGenerations,
      stopGeneration: vi.fn(),
      deleteGeneration: vi.fn(),
      triggerGeneration: vi.fn(),
    }),
  };
});

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

describe("Header GlobalGenerationIndicator - Admin Restriction & Polling Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveGenerations.mockResolvedValue({ request_id: "default", items: [] });
  });

  it("Normal User (student): does NOT render GlobalGenerationIndicator and does NOT query /v1/generation/active", async () => {
    mockCurrentUser = {
      id: "student-1",
      email: "student@avana.ir",
      role: "student",
      name: "دانشجو",
    };
    mockUserMemberships = [
      { organization_id: "00000000-0000-0000-0000-000000000001", role: "student" },
    ];

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <AuthenticatedShell />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Give time for any unexpected effect/query to run
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 1. /v1/generation/active should NEVER be called for student
    expect(mockGetActiveGenerations).not.toHaveBeenCalled();

    // 2. GlobalGenerationIndicator should NOT be in DOM
    expect(screen.queryByLabelText("نشانگر وضعیت تولید محتوا")).toBeNull();
    expect(screen.queryByText("در حال تولید محتوا")).toBeNull();
    expect(screen.queryByText("تولید متوقف شد")).toBeNull();
  });

  it("Normal User (student) isolated component mount: renders null and does NOT query /v1/generation/active", async () => {
    mockCurrentUser = {
      id: "student-1",
      email: "student@avana.ir",
      role: "student",
      name: "دانشجو",
    };
    mockUserMemberships = [
      { organization_id: "00000000-0000-0000-0000-000000000001", role: "student" },
    ];

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <GlobalGenerationIndicator />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGetActiveGenerations).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("نشانگر وضعیت تولید محتوا")).toBeNull();
  });

  it("Admin User (platform_admin): renders GlobalGenerationIndicator in Header and queries /v1/generation/active", async () => {
    mockCurrentUser = {
      id: "admin-1",
      email: "admin@avana.ir",
      role: "platform_admin",
      name: "مدیر سیستم",
    };
    mockUserMemberships = [];

    mockGetActiveGenerations.mockResolvedValueOnce({
      request_id: "req-admin-1",
      items: [
        {
          documentId: "doc-global-1",
          documentName: "neurology-handbook.pdf",
          courseId: "course-101",
          organizationId: "system-org-uuid",
          status: "generating",
          stage: "lesson",
          stageLabel: "تولید درسنامه",
          progress: { current: 2, total: 5, percentage: 40 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        } as ActiveGenerationItem,
      ],
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <AuthenticatedShell />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 1. Should query /v1/generation/active for admin
    await waitFor(() => {
      expect(mockGetActiveGenerations).toHaveBeenCalledTimes(1);
    });

    // 2. GlobalGenerationIndicator should be rendered and visible in Header
    await waitFor(() => {
      expect(screen.getByLabelText("نشانگر وضعیت تولید محتوا")).toBeDefined();
      expect(screen.getByText("در حال تولید محتوا")).toBeDefined();
      expect(screen.getByText("۴۰٪")).toBeDefined();
    });
  });

  it("Admin User (organization_admin membership): renders GlobalGenerationIndicator in Header", async () => {
    mockCurrentUser = {
      id: "org-admin-1",
      email: "orgadmin@avana.ir",
      role: "student",
      name: "مدیر موسسه",
    };
    mockUserMemberships = [
      { organization_id: "00000000-0000-0000-0000-000000000001", role: "organization_admin" },
    ];

    mockGetActiveGenerations.mockResolvedValueOnce({
      request_id: "req-org-admin-1",
      items: [
        {
          documentId: "doc-org-1",
          documentName: "pharmacology.pdf",
          courseId: "course-202",
          organizationId: "00000000-0000-0000-0000-000000000001",
          status: "stopped",
          stage: "lesson",
          stageLabel: "تولید درسنامه",
          progress: { current: 1, total: 4, percentage: 25 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        } as ActiveGenerationItem,
      ],
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <AuthenticatedShell />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mockGetActiveGenerations).toHaveBeenCalled();
      expect(screen.getByText("تولید متوقف شد")).toBeDefined();
    });
  });

  it("Course Editor (course_editor): renders Course Management entry in header and profile menu", async () => {
    mockCurrentUser = {
      id: "editor-1",
      email: "editor@avana.ir",
      role: "course_editor",
      name: "ویرایشگر دوره",
    };
    mockUserMemberships = [
      { organization_id: "00000000-0000-0000-0000-000000000001", role: "course_editor" },
    ];

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <AuthenticatedShell />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 1. Course Management badge link should be in DOM
    const courseManageBadge = screen.getByLabelText("مدیریت دوره‌ها");
    expect(courseManageBadge).toBeDefined();
    expect(courseManageBadge.closest("a")).toHaveAttribute("href", "/admin/courses");

    // 2. GlobalGenerationIndicator should NOT be rendered (non-admin)
    expect(screen.queryByLabelText("نشانگر وضعیت تولید محتوا")).toBeNull();
  });

  it("Student user: does NOT render Course Management entry in header", async () => {
    mockCurrentUser = {
      id: "student-1",
      email: "student@avana.ir",
      role: "student",
      name: "دانشجو",
    };
    mockUserMemberships = [
      { organization_id: "00000000-0000-0000-0000-000000000001", role: "student" },
    ];

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <AuthenticatedShell />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Course Management badge link should NOT be in DOM for regular student
    expect(screen.queryByLabelText("مدیریت دوره‌ها")).toBeNull();
    expect(screen.queryByLabelText("پنل مدیریت")).toBeNull();
    expect(screen.queryByLabelText("پنل اساتید")).toBeNull();

    // In mobile drawer, student should not see any management links
    const mobileMenuButton = screen.getByRole("button", { name: "منو" });
    fireEvent.click(mobileMenuButton);

    expect(screen.queryByText("مدیریت دوره‌ها و محتوا")).toBeNull();
    expect(screen.queryByText("پنل مدیریت")).toBeNull();
    expect(screen.queryByText("پنل اساتید")).toBeNull();
  });

  it("Platform Admin: Desktop, Mobile Drawer, and User Profile Dropdown all display 'پنل مدیریت' -> /admin, and NEVER 'مدیریت دوره‌ها و محتوا'", async () => {
    mockCurrentUser = {
      id: "admin-1",
      email: "admin@avana.ir",
      role: "platform_admin",
      name: "مدیر ارشد",
    };
    mockUserMemberships = [];

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <AuthenticatedShell />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 1. Desktop Badge: Has "پنل مدیریت" pointing to /admin
    const adminBadge = screen.getByLabelText("پنل مدیریت");
    expect(adminBadge).toBeDefined();
    expect(adminBadge.closest("a")).toHaveAttribute("href", "/admin");

    // Must NOT have Course Management badge
    expect(screen.queryByLabelText("مدیریت دوره‌ها")).toBeNull();

    // 2. User Profile Dropdown: Click profile chip and verify options
    const profileChip = screen.getByRole("link", { name: /حساب کاربری مدیر ارشد/i });
    fireEvent.click(profileChip);

    // Should find "پنل مدیریت" pointing to /admin
    const dropdownAdminLinks = screen.getAllByRole("link", { name: "پنل مدیریت" });
    expect(dropdownAdminLinks.some((link) => link.getAttribute("href") === "/admin")).toBe(true);

    // Must NOT find "مدیریت دوره‌ها و محتوا"
    expect(screen.queryByText("مدیریت دوره‌ها و محتوا")).toBeNull();

    // Close user menu
    fireEvent.click(profileChip);

    // 3. Mobile Drawer: Open mobile menu and verify options
    const mobileMenuButton = screen.getByRole("button", { name: "منو" });
    fireEvent.click(mobileMenuButton);

    const mobileAdminLinks = screen.getAllByRole("link", { name: "پنل مدیریت" });
    expect(mobileAdminLinks.some((link) => link.getAttribute("href") === "/admin")).toBe(true);

    // Critical assertion: Platform Admin must NEVER see "مدیریت دوره‌ها و محتوا" in Mobile Drawer
    expect(screen.queryByText("مدیریت دوره‌ها و محتوا")).toBeNull();
  });

  it("Course Editor: Desktop, Mobile Drawer, and User Profile Dropdown all display Course Management -> /admin/courses, and NEVER 'پنل مدیریت'", async () => {
    mockCurrentUser = {
      id: "editor-1",
      email: "editor@avana.ir",
      role: "course_editor",
      name: "ویرایشگر دوره",
    };
    mockUserMemberships = [];

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <AuthenticatedShell />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 1. Desktop Badge: Shows "مدیریت دوره‌ها" pointing to /admin/courses
    const courseBadge = screen.getByLabelText("مدیریت دوره‌ها");
    expect(courseBadge).toBeDefined();
    expect(courseBadge.closest("a")).toHaveAttribute("href", "/admin/courses");
    expect(screen.queryByLabelText("پنل مدیریت")).toBeNull();

    // 2. User Profile Dropdown: Displays "مدیریت دوره‌ها و محتوا" -> /admin/courses
    const profileChip = screen.getByRole("link", { name: /حساب کاربری ویرایشگر دوره/i });
    fireEvent.click(profileChip);

    const dropdownCourseLinks = screen.getAllByRole("link", { name: "مدیریت دوره‌ها و محتوا" });
    expect(dropdownCourseLinks.some((link) => link.getAttribute("href") === "/admin/courses")).toBe(true);
    expect(screen.queryByRole("link", { name: "پنل مدیریت" })).toBeNull();

    // Close dropdown
    fireEvent.click(profileChip);

    // 3. Mobile Drawer: Displays "مدیریت دوره‌ها و محتوا" -> /admin/courses
    const mobileMenuButton = screen.getByRole("button", { name: "منو" });
    fireEvent.click(mobileMenuButton);

    const mobileCourseLinks = screen.getAllByRole("link", { name: "مدیریت دوره‌ها و محتوا" });
    expect(mobileCourseLinks.some((link) => link.getAttribute("href") === "/admin/courses")).toBe(true);
    expect(screen.queryByRole("link", { name: "پنل مدیریت" })).toBeNull();
  });

  it("Teacher: Desktop Badge, Mobile Drawer, and User Profile Dropdown all display 'پنل اساتید' -> /teacher", async () => {
    mockCurrentUser = {
      id: "teacher-1",
      email: "teacher@avana.ir",
      role: "teacher",
      name: "استاد محترم",
    };
    mockUserMemberships = [];

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <AuthenticatedShell />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 1. Desktop Badge: Has "پنل اساتید" pointing to /teacher
    const teacherBadge = screen.getByLabelText("پنل اساتید");
    expect(teacherBadge).toBeDefined();
    expect(teacherBadge.closest("a")).toHaveAttribute("href", "/teacher");

    // 2. User Profile Dropdown
    const profileChip = screen.getByRole("link", { name: /حساب کاربری استاد محترم/i });
    fireEvent.click(profileChip);

    const dropdownTeacherLinks = screen.getAllByRole("link", { name: "پنل اساتید" });
    expect(dropdownTeacherLinks.some((link) => link.getAttribute("href") === "/teacher")).toBe(true);

    // Close dropdown
    fireEvent.click(profileChip);

    // 3. Mobile Drawer
    const mobileMenuButton = screen.getByRole("button", { name: "منو" });
    fireEvent.click(mobileMenuButton);

    const mobileTeacherLinks = screen.getAllByRole("link", { name: "پنل اساتید" });
    expect(mobileTeacherLinks.some((link) => link.getAttribute("href") === "/teacher")).toBe(true);
  });
});
