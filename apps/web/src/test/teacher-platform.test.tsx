import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TeacherRouteGuard, isTeacherOrAdmin } from "../components/teacher/TeacherRouteGuard.js";
import { ExamStatusBadge } from "../components/teacher/exams/ExamStatusBadge.js";
import { ResultsMetricsCards } from "../components/teacher/results/ResultsMetricsCards.js";
import { ScoreDistributionBar } from "../components/teacher/results/ScoreDistributionBar.js";
import { createTeacherApi } from "../lib/api/teacher.js";
import type { TeacherExamResultsAggregateDTO } from "../lib/api/teacher.js";
import type { ApiClient } from "../lib/api/client.js";
import {
  TeacherOrganizationProvider,
  useTeacherOrganization,
  TEACHER_SELECTED_ORG_STORAGE_KEY,
} from "../components/teacher/TeacherOrganizationContext.js";
import { TeacherOrgSwitcher } from "../components/teacher/TeacherOrgSwitcher.js";
import { PLATFORM_ADMIN_NAV_ITEMS } from "../components/admin/adminNavigation.js";
import { TeacherDashboardPage } from "../pages/teacher/TeacherDashboardPage.js";
import { TeacherClassroomsPage } from "../pages/teacher/TeacherClassroomsPage.js";
import { TeacherExamCreatePage } from "../pages/teacher/TeacherExamCreatePage.js";
import { TeacherExamEditorPage } from "../pages/teacher/TeacherExamEditorPage.js";
import { TeacherExamDetailPage } from "../pages/teacher/TeacherExamDetailPage.js";
import { TeacherStudentResultDetailPage } from "../pages/teacher/TeacherStudentResultDetailPage.js";
import { ClassroomExamsTable } from "../components/teacher/exams/ClassroomExamsTable.js";
import { ClassroomMembersTable } from "../components/teacher/classrooms/ClassroomMembersTable.js";
import { StudentResultsTable } from "../components/teacher/results/StudentResultsTable.js";
import { TeacherShell } from "../components/teacher/TeacherShell.js";
import { AuthenticatedShell } from "../components/shell/AuthenticatedShell.js";
import { BRAND_LOGO_SRC } from "../components/brand/BrandLogo.js";
import { calculateRuntimeExamState } from "@avana/domain";
import {
  extractLocalDateAndTimeString,
  combineLocalDateAndTimeToIso,
  formatPersianExamDate,
  formatPersianTimeOnly,
  formatPersianExamDateTime,
  formatPersianExamTimeRange,
  formatStudentExamScheduleNotice,
} from "../utils/date.js";

// Mock auth state
let mockCurrentUser: { id: string; email: string; role: string } | null = null;
let mockUserMemberships: Array<{ organization_id: string; role: string }> = [];

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

// Mock organizations API
let mockOrganizationsResponse: {
  request_id: string;
  items: Array<{ id: string; name: string }>;
  pagination: { limit: number; next_cursor: string | null };
} = {
  request_id: "req-1",
  items: [],
  pagination: { limit: 10, next_cursor: null },
};

vi.mock("../lib/api/organizations.js", () => ({
  createOrganizationApi: () => ({
    listOrganizations: vi.fn().mockImplementation(() => Promise.resolve(mockOrganizationsResponse)),
  }),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

describe("Teacher Platform - TeacherRouteGuard & Role Authorization", () => {
  beforeEach(() => {
    mockCurrentUser = null;
    mockUserMemberships = [];
  });

  it("identifies teacher and admin roles accurately via isTeacherOrAdmin", () => {
    expect(isTeacherOrAdmin("teacher")).toBe(true);
    expect(isTeacherOrAdmin("organization_admin")).toBe(true);
    expect(isTeacherOrAdmin("platform_admin")).toBe(true);
    expect(isTeacherOrAdmin("student")).toBe(false);
    expect(isTeacherOrAdmin(null, [{ role: "teacher" }])).toBe(true);
    expect(isTeacherOrAdmin(null, [{ role: "student" }])).toBe(false);
    expect(isTeacherOrAdmin(undefined, [])).toBe(false);
  });

  it("renders protected child when user is authorized as teacher", () => {
    mockCurrentUser = { id: "user_1", email: "teacher@test.com", role: "teacher" };

    render(
      <MemoryRouter initialEntries={["/teacher"]}>
        <Routes>
          <Route
            path="/teacher"
            element={
              <TeacherRouteGuard>
                <div>Teacher Content Allowed</div>
              </TeacherRouteGuard>
            }
          />
          <Route path="/home" element={<div>Home Page Redirect</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Teacher Content Allowed")).toBeInTheDocument();
  });

  it("redirects unauthorized student to /home", () => {
    mockCurrentUser = { id: "user_2", email: "student@test.com", role: "student" };

    render(
      <MemoryRouter initialEntries={["/teacher"]}>
        <Routes>
          <Route
            path="/teacher"
            element={
              <TeacherRouteGuard>
                <div>Teacher Content Allowed</div>
              </TeacherRouteGuard>
            }
          />
          <Route path="/home" element={<div>Home Page Redirect</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText("Teacher Content Allowed")).not.toBeInTheDocument();
    expect(
      screen.getByText("برای استفاده از پنل استاد، ابتدا باید به‌عنوان استاد ثبت‌نام کنید."),
    ).toBeInTheDocument();
    expect(screen.getByText("ثبت‌نام استاد")).toBeInTheDocument();
  });
});

describe("Teacher Platform - ExamStatusBadge Runtime and Persisted States", () => {
  it("renders persisted draft status", () => {
    render(
      <ExamStatusBadge
        exam={{
          status: "draft",
          startsAt: null,
          endsAt: null,
          closedAt: null,
        }}
      />
    );
    expect(screen.getByText("پیش‌نویس")).toBeInTheDocument();
  });

  it("renders persisted archived status", () => {
    render(
      <ExamStatusBadge
        exam={{
          status: "archived",
          startsAt: null,
          endsAt: null,
          closedAt: null,
        }}
      />
    );
    expect(screen.getByText("بایگانی‌شده")).toBeInTheDocument();
  });

  it("renders dynamic runtime state for published active exam", () => {
    const now = Date.now();
    const oneHourAgo = new Date(now - 3600_000).toISOString();
    const oneHourLater = new Date(now + 3600_000).toISOString();

    render(
      <ExamStatusBadge
        exam={{
          status: "published",
          startsAt: oneHourAgo,
          endsAt: oneHourLater,
          closedAt: null,
        }}
      />
    );
    expect(screen.getByText(/درحال برگزاری|در حال برگزاری/)).toBeInTheDocument();
  });

  it("renders dynamic runtime state for published upcoming exam", () => {
    const now = Date.now();
    const oneHourLater = new Date(now + 3600_000).toISOString();
    const twoHoursLater = new Date(now + 7200_000).toISOString();

    render(
      <ExamStatusBadge
        exam={{
          status: "published",
          startsAt: oneHourLater,
          endsAt: twoHoursLater,
          closedAt: null,
        }}
      />
    );
    expect(screen.getByText("به‌زودی")).toBeInTheDocument();
  });

  it("renders dynamic runtime state for published closed exam", () => {
    const now = Date.now();
    const twoHoursAgo = new Date(now - 7200_000).toISOString();
    const oneHourAgo = new Date(now - 3600_000).toISOString();

    render(
      <ExamStatusBadge
        exam={{
          status: "published",
          startsAt: twoHoursAgo,
          endsAt: oneHourAgo,
          closedAt: null,
        }}
      />
    );
    expect(screen.getByText("پایان‌یافته")).toBeInTheDocument();
  });
});

describe("Teacher Platform - Results Metrics and Score Distribution", () => {
  const mockResults: TeacherExamResultsAggregateDTO = {
    examId: "exam_1",
    examTitle: "آزمون فارماکولوژی",
    enrolledCount: 30,
    submittedCount: 25,
    inProgressCount: 0,
    timedOutCount: 2,
    absentCount: 3,
    averageScore: 84.5,
    maxScore: 100,
    minScore: 45,
    passingRate: 88,
    scoreDistribution: [
      { range: "کمتر از ۵۰٪", count: 2 },
      { range: "۵۰ تا ۶۹٪", count: 3 },
      { range: "۷۰ تا ۸۴٪", count: 10 },
      { range: "۸۵ تا ۱۰۰٪", count: 12 },
    ],
    students: [],
  };

  it("renders KPI cards with formatted Persian values", () => {
    render(<ResultsMetricsCards results={mockResults} />);

    expect(screen.getByText("دانش‌آموزان کلاس")).toBeInTheDocument();
    expect(screen.getByText("تکمیل و ثبت نهایی")).toBeInTheDocument();
    expect(screen.getByText("غایبین آزمون")).toBeInTheDocument();
    expect(screen.getByText("میانگین نمرات")).toBeInTheDocument();
    expect(screen.getByText("درصد قبولی")).toBeInTheDocument();
  });

  it("renders score distribution progress bars", () => {
    render(
      <ScoreDistributionBar
        distribution={mockResults.scoreDistribution}
        totalCompleted={27}
      />
    );

    expect(screen.getByText("توزیع درصد نمرات شرکت‌کنندگان")).toBeInTheDocument();
    expect(screen.getByText("کمتر از ۵۰٪")).toBeInTheDocument();
    expect(screen.getByText("۵۰ تا ۶۹٪")).toBeInTheDocument();
    expect(screen.getByText("۷۰ تا ۸۴٪")).toBeInTheDocument();
    expect(screen.getByText("۸۵ تا ۱۰۰٪")).toBeInTheDocument();
  });
});

describe("Teacher Platform - API Client Contract Mapping", () => {
  it("calls frozen Phase 2 backend routes correctly", async () => {
    const mockClient: ApiClient = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    };

    const api = createTeacherApi(mockClient);

    // Classrooms
    await api.listClassrooms("org_1");
    expect(mockClient.get).toHaveBeenCalledWith("/v1/organizations/org_1/teacher/classrooms");

    await api.createClassroom("org_1", { title: "کلاس جدید" });
    expect(mockClient.post).toHaveBeenCalledWith(
      "/v1/organizations/org_1/teacher/classrooms",
      { title: "کلاس جدید" }
    );

    await api.regenerateInviteCode("cls_1");
    expect(mockClient.post).toHaveBeenCalledWith(
      "/v1/teacher/classrooms/cls_1/regenerate-invite-code"
    );

    // Exam Lifecycle
    await api.publishExam("exam_1");
    expect(mockClient.post).toHaveBeenCalledWith("/v1/teacher/exams/exam_1/publish");

    await api.unpublishExam("exam_1");
    expect(mockClient.post).toHaveBeenCalledWith("/v1/teacher/exams/exam_1/unpublish");

    await api.closeExam("exam_1");
    expect(mockClient.post).toHaveBeenCalledWith("/v1/teacher/exams/exam_1/close");

    await api.releaseResults("exam_1");
    expect(mockClient.post).toHaveBeenCalledWith("/v1/teacher/exams/exam_1/release-results");

    // Results
    await api.getExamResults("exam_1");
    expect(mockClient.get).toHaveBeenCalledWith("/v1/teacher/exams/exam_1/results");

    await api.getStudentResult("exam_1", "student_1");
    expect(mockClient.get).toHaveBeenCalledWith("/v1/teacher/exams/exam_1/results/student_1");
  });
});

function TestOrgConsumer() {
  const {
    selectedOrgId,
    selectedOrg,
    availableOrgs,
    needsOrgSelection,
    hasNoOrganizations,
    isPlatformAdmin,
    setSelectedOrgId,
  } = useTeacherOrganization();

  return (
    <div>
      <div data-testid="selectedOrgId">{selectedOrgId ?? "none"}</div>
      <div data-testid="selectedOrgName">{selectedOrg?.name ?? "none"}</div>
      <div data-testid="needsOrgSelection">{String(needsOrgSelection)}</div>
      <div data-testid="hasNoOrganizations">{String(hasNoOrganizations)}</div>
      <div data-testid="isPlatformAdmin">{String(isPlatformAdmin)}</div>
      <div data-testid="availableOrgsCount">{availableOrgs.length}</div>
      <button data-testid="select-org-2" onClick={() => setSelectedOrgId("org_2")}>
        Select Org 2
      </button>
      <TeacherOrgSwitcher />
    </div>
  );
}

describe("Teacher Platform - Organization Context & Switcher Specification", () => {
  beforeEach(() => {
    mockCurrentUser = null;
    mockUserMemberships = [];
    mockOrganizationsResponse = {
      request_id: "req-1",
      items: [],
      pagination: { limit: 10, next_cursor: null },
    };
    if (typeof window !== "undefined") {
      sessionStorage.clear();
    }
  });

  // 1. teacher: membership organization, no switcher, preserved behavior
  it("Scenario 1: teacher uses membership organization without switcher", async () => {
    mockCurrentUser = { id: "user_t1", email: "teacher@test.com", role: "teacher" };
    mockUserMemberships = [{ organization_id: "org_teach_1", role: "teacher" }];

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TeacherOrganizationProvider>
          <TestOrgConsumer />
        </TeacherOrganizationProvider>
      </QueryClientProvider>
    );

    expect(screen.getByTestId("selectedOrgId").textContent).toBe("org_teach_1");
    expect(screen.getByTestId("isPlatformAdmin").textContent).toBe("false");
    expect(screen.getByTestId("needsOrgSelection").textContent).toBe("false");
    expect(screen.getByTestId("hasNoOrganizations").textContent).toBe("false");
    // Switcher should not render for teacher
    expect(screen.queryByText(/انتخاب سازمان|بدون سازمان/)).not.toBeInTheDocument();
  });

  // 2. organization_admin: membership organization, no switcher, preserved behavior
  it("Scenario 2: organization_admin uses membership organization without switcher", async () => {
    mockCurrentUser = { id: "user_oa1", email: "oa@test.com", role: "organization_admin" };
    mockUserMemberships = [{ organization_id: "org_admin_membership", role: "organization_admin" }];

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TeacherOrganizationProvider>
          <TestOrgConsumer />
        </TeacherOrganizationProvider>
      </QueryClientProvider>
    );

    expect(screen.getByTestId("selectedOrgId").textContent).toBe("org_admin_membership");
    expect(screen.getByTestId("isPlatformAdmin").textContent).toBe("false");
    expect(screen.getByTestId("needsOrgSelection").textContent).toBe("false");
    expect(screen.getByTestId("hasNoOrganizations").textContent).toBe("false");
    expect(screen.queryByText(/انتخاب سازمان|بدون سازمان/)).not.toBeInTheDocument();
  });

  // 3. platform_admin + 0 org: no crash, no query, empty state, admin CTA
  it("Scenario 3: platform_admin with 0 organizations enters safe empty state without crash", async () => {
    mockCurrentUser = { id: "user_pa", email: "admin@test.com", role: "platform_admin" };
    mockUserMemberships = [];
    mockOrganizationsResponse = {
      request_id: "req-0",
      items: [],
      pagination: { limit: 1, next_cursor: null },
    };

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TeacherOrganizationProvider>
          <TestOrgConsumer />
        </TeacherOrganizationProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("hasNoOrganizations")).toHaveTextContent("true");
    });
    expect(screen.getByTestId("selectedOrgId").textContent).toBe("none");
    expect(screen.getByTestId("needsOrgSelection").textContent).toBe("false");
    expect(screen.getByText("بدون سازمان فعال")).toBeInTheDocument();
  });

  // 4. platform_admin + 1 org: deterministic auto-selection
  it("Scenario 4: platform_admin with 1 organization auto-selects deterministically", async () => {
    mockCurrentUser = { id: "user_pa", email: "admin@test.com", role: "platform_admin" };
    mockUserMemberships = [];
    mockOrganizationsResponse = {
      request_id: "req-1",
      items: [{ id: "org_single_100", name: "دانشگاه صنعتی شریف" }],
      pagination: { limit: 1, next_cursor: null },
    };

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TeacherOrganizationProvider>
          <TestOrgConsumer />
        </TeacherOrganizationProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("selectedOrgId")).toHaveTextContent("org_single_100");
    });
    expect(screen.getByTestId("selectedOrgName").textContent).toBe("دانشگاه صنعتی شریف");
    expect(screen.getByTestId("needsOrgSelection").textContent).toBe("false");
    expect(screen.getByTestId("hasNoOrganizations").textContent).toBe("false");
    // Displays single organization indicator in switcher as well as context
    expect(screen.getAllByText("دانشگاه صنعتی شریف").length).toBe(2);
    expect(sessionStorage.getItem(TEACHER_SELECTED_ORG_STORAGE_KEY)).toBe("org_single_100");
  });

  // 5. platform_admin + multiple orgs: explicit selection required, no memberships[0] fallback
  it("Scenario 5: platform_admin with multiple organizations requires explicit selection", async () => {
    mockCurrentUser = { id: "user_pa", email: "admin@test.com", role: "platform_admin" };
    // Even if legacy student memberships exist, do NOT fallback to them
    mockUserMemberships = [{ organization_id: "legacy_org_999", role: "student" }];
    mockOrganizationsResponse = {
      request_id: "req-2",
      items: [
        { id: "org_alpha", name: "سازمان آلفا" },
        { id: "org_beta", name: "سازمان بتا" },
      ],
      pagination: { limit: 2, next_cursor: null },
    };

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TeacherOrganizationProvider>
          <TestOrgConsumer />
        </TeacherOrganizationProvider>
      </QueryClientProvider>
    );

    // Initial state: explicit selection needed, selectedOrgId is null
    await waitFor(() => {
      expect(screen.getByTestId("needsOrgSelection")).toHaveTextContent("true");
    });
    expect(screen.getByTestId("selectedOrgId").textContent).toBe("none");
    expect(screen.getByText("انتخاب سازمان...")).toBeInTheDocument();

    // Open dropdown and select سازمان بتا
    const switcherButton = screen.getByText("انتخاب سازمان...");
    fireEvent.click(switcherButton);

    const betaOption = screen.getByText("سازمان بتا");
    fireEvent.click(betaOption);

    // Context is updated and persisted
    await waitFor(() => {
      expect(screen.getByTestId("selectedOrgId")).toHaveTextContent("org_beta");
    });
    expect(screen.getByTestId("needsOrgSelection").textContent).toBe("false");
    expect(sessionStorage.getItem(TEACHER_SELECTED_ORG_STORAGE_KEY)).toBe("org_beta");
  });

  // 6. invalid persisted organization in sessionStorage is cleared
  it("Scenario 6: invalid persisted organization in sessionStorage is purged safely", async () => {
    mockCurrentUser = { id: "user_pa", email: "admin@test.com", role: "platform_admin" };
    mockOrganizationsResponse = {
      request_id: "req-3",
      items: [
        { id: "org_valid_1", name: "سازمان معتبر ۱" },
        { id: "org_valid_2", name: "سازمان معتبر ۲" },
      ],
      pagination: { limit: 2, next_cursor: null },
    };

    // Stale or deleted organization ID in sessionStorage
    sessionStorage.setItem(TEACHER_SELECTED_ORG_STORAGE_KEY, "deleted_org_legacy");

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TeacherOrganizationProvider>
          <TestOrgConsumer />
        </TeacherOrganizationProvider>
      </QueryClientProvider>
    );

    // Stale key must be cleared from storage and selection required
    await waitFor(() => {
      expect(screen.getByTestId("needsOrgSelection")).toHaveTextContent("true");
    });
    expect(screen.getByTestId("selectedOrgId").textContent).toBe("none");
    expect(sessionStorage.getItem(TEACHER_SELECTED_ORG_STORAGE_KEY)).toBeNull();
  });

  // 7. organization switching updates context & persistence
  it("Scenario 7: organization switching updates context and persistence without leakage", async () => {
    mockCurrentUser = { id: "user_pa", email: "admin@test.com", role: "platform_admin" };
    mockOrganizationsResponse = {
      request_id: "req-4",
      items: [
        { id: "org_1", name: "دانشکده پزشکی" },
        { id: "org_2", name: "دانشکده داروسازی" },
      ],
      pagination: { limit: 2, next_cursor: null },
    };

    // Pre-set org_1
    sessionStorage.setItem(TEACHER_SELECTED_ORG_STORAGE_KEY, "org_1");

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TeacherOrganizationProvider>
          <TestOrgConsumer />
        </TeacherOrganizationProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("selectedOrgId")).toHaveTextContent("org_1");
    });

    // Click select org 2 button
    fireEvent.click(screen.getByTestId("select-org-2"));

    await waitFor(() => {
      expect(screen.getByTestId("selectedOrgId")).toHaveTextContent("org_2");
    });
    expect(sessionStorage.getItem(TEACHER_SELECTED_ORG_STORAGE_KEY)).toBe("org_2");
  });

  // 8. Navigation items & role checks
  it("Scenario 8: navigation link to /admin/teachers is exposed in admin navigation", () => {
    // Platform Admin Nav Items includes teacher platform management
    const teacherNavItem = PLATFORM_ADMIN_NAV_ITEMS.find((item) => item.href === "/admin/teachers");
    expect(teacherNavItem).toBeDefined();
    expect(teacherNavItem?.name).toBe("مدیریت اساتید");
    expect(teacherNavItem?.matchPrefixes).toContain("/admin/teachers");

    // isTeacherOrAdmin authorization helper
    expect(isTeacherOrAdmin("platform_admin")).toBe(true);
    expect(isTeacherOrAdmin("teacher")).toBe(true);
    expect(isTeacherOrAdmin("organization_admin")).toBe(true);
    expect(isTeacherOrAdmin("student")).toBe(false);
    expect(isTeacherOrAdmin("content_worker")).toBe(false);
    expect(isTeacherOrAdmin(null, [{ role: "student" }])).toBe(false);
    expect(isTeacherOrAdmin(null, [{ role: "teacher" }])).toBe(true);
  });

  it("TeacherDashboardPage: renders empty state with CTA to /admin when platform_admin has 0 orgs", async () => {
    mockCurrentUser = { id: "user_pa", email: "admin@test.com", role: "platform_admin" };
    mockUserMemberships = [];
    mockOrganizationsResponse = {
      request_id: "req-0",
      items: [],
      pagination: { limit: 1, next_cursor: null },
    };

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher"]}>
          <TeacherOrganizationProvider>
            <TeacherDashboardPage />
          </TeacherOrganizationProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("هیچ سازمانی در سیستم ثبت نشده است")).toBeInTheDocument();
    expect(screen.getByText("ورود به پنل مدیریت")).toBeInTheDocument();
  });

  it("TeacherDashboardPage: renders selection prompt when platform_admin has multiple orgs unselected", async () => {
    mockCurrentUser = { id: "user_pa", email: "admin@test.com", role: "platform_admin" };
    mockUserMemberships = [];
    mockOrganizationsResponse = {
      request_id: "req-m",
      items: [
        { id: "org_m1", name: "سازمان اول" },
        { id: "org_m2", name: "سازمان دوم" },
      ],
      pagination: { limit: 2, next_cursor: null },
    };

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher"]}>
          <TeacherOrganizationProvider>
            <TeacherDashboardPage />
          </TeacherOrganizationProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("انتخاب سازمان آموزشی")).toBeInTheDocument();
    expect(screen.getByText("سازمان اول")).toBeInTheDocument();
    expect(screen.getByText("سازمان دوم")).toBeInTheDocument();
  });

  it("TeacherClassroomsPage: renders empty state with CTA to /admin when platform_admin has 0 orgs", async () => {
    mockCurrentUser = { id: "user_pa", email: "admin@test.com", role: "platform_admin" };
    mockUserMemberships = [];
    mockOrganizationsResponse = {
      request_id: "req-0",
      items: [],
      pagination: { limit: 1, next_cursor: null },
    };

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher/classrooms"]}>
          <TeacherOrganizationProvider>
            <TeacherClassroomsPage />
          </TeacherOrganizationProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("هیچ سازمانی در سیستم ثبت نشده است")).toBeInTheDocument();
    expect(screen.getByText("ورود به پنل مدیریت")).toBeInTheDocument();
  });
});

describe("Teacher Platform - Dashboard Regression & Organization Scope Suite", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockCurrentUser = null;
    mockUserMemberships = [];
    mockOrganizationsResponse = {
      request_id: "req-1",
      items: [],
      pagination: { limit: 10, next_cursor: null },
    };
    if (typeof window !== "undefined") {
      sessionStorage.clear();
    }
    vi.restoreAllMocks();
  });

  function mockFetchWithPayload(handler: (url: string) => any) {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const data = handler(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "test-req-id" }),
        text: () => Promise.resolve(JSON.stringify(data)),
        json: () => Promise.resolve(data),
      } as unknown as Response);
    });
  }

  // Case 1 — platform_admin + one organization
  it("Case 1: platform_admin with one valid organization loads dashboard without 404 and computes KPIs", async () => {
    mockCurrentUser = { id: "user_pa_1", email: "pa@avana.org", role: "platform_admin" };
    mockOrganizationsResponse = {
      request_id: "req-1",
      items: [{ id: "org_alpha", name: "دانشکده داروسازی تهران" }],
      pagination: { limit: 1, next_cursor: null },
    };

    mockFetchWithPayload((url) => {
      if (url.includes("/v1/organizations/org_alpha/teacher/classrooms")) {
        return {
          classrooms: [
            {
              id: "cls_1",
              organizationId: "org_alpha",
              teacherId: "user_pa_1",
              courseId: null,
              title: "فارماکولوژی پیشرفته",
              description: "کلاس آموزشی",
              inviteCode: "PHARM101",
              status: "active",
              membersCount: 15,
              examsCount: 3,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            {
              id: "cls_2",
              organizationId: "org_alpha",
              teacherId: "user_pa_1",
              courseId: null,
              title: "شیمی دارویی عملی",
              description: null,
              inviteCode: "CHEM202",
              status: "active",
              membersCount: 10,
              examsCount: 2,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        };
      }
      return { classrooms: [] };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher"]}>
          <TeacherOrganizationProvider>
            <TeacherDashboardPage />
          </TeacherOrganizationProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Verify header and no error alert
    expect(await screen.findByText("داشبورد مدیریت آموزش")).toBeInTheDocument();
    expect(screen.queryByText("خطا در دریافت اطلاعات داشبورد")).not.toBeInTheDocument();
    expect(screen.queryByText("Not found")).not.toBeInTheDocument();

    // Verify operational KPIs computed from classrooms (active: 2, enrolled: 25, exams: 5)
    expect(screen.getByText("۲")).toBeInTheDocument();
    expect(screen.getByText("۲۵")).toBeInTheDocument();
    expect(screen.getByText("۵")).toBeInTheDocument();

    // Verify active classroom cards
    expect(screen.getByText("فارماکولوژی پیشرفته")).toBeInTheDocument();
    expect(screen.getByText("شیمی دارویی عملی")).toBeInTheDocument();

    // Verify correct API path requested
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/v1/organizations/org_alpha/teacher/classrooms"),
      expect.anything(),
    );
  });

  // Case 2 — platform_admin + multiple organizations (switching & cache isolation)
  it("Case 2: platform_admin with multiple organizations switches tenant cleanly with cache isolation", async () => {
    mockCurrentUser = { id: "user_pa_2", email: "pa2@avana.org", role: "platform_admin" };
    mockOrganizationsResponse = {
      request_id: "req-2",
      items: [
        { id: "org_med", name: "دانشکده پزشکی" },
        { id: "org_dent", name: "دانشکده دندانپزشکی" },
      ],
      pagination: { limit: 2, next_cursor: null },
    };

    // Pre-select org_med
    sessionStorage.setItem(TEACHER_SELECTED_ORG_STORAGE_KEY, "org_med");

    mockFetchWithPayload((url) => {
      if (url.includes("/v1/organizations/org_med/teacher/classrooms")) {
        return {
          classrooms: [
            {
              id: "cls_med_1",
              organizationId: "org_med",
              teacherId: "user_pa_2",
              title: "کلاس آناتومی پزشکی",
              inviteCode: "MED10001",
              status: "active",
              membersCount: 40,
              examsCount: 1,
            },
          ],
        };
      }
      if (url.includes("/v1/organizations/org_dent/teacher/classrooms")) {
        return {
          classrooms: [
            {
              id: "cls_dent_1",
              organizationId: "org_dent",
              teacherId: "user_pa_2",
              title: "کلاس پروتز دندانی",
              inviteCode: "DENT2001",
              status: "active",
              membersCount: 12,
              examsCount: 4,
            },
          ],
        };
      }
      return { classrooms: [] };
    });

    function TestDashboardWithSwitcher() {
      return (
        <div>
          <TeacherOrgSwitcher />
          <TeacherDashboardPage />
        </div>
      );
    }

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher"]}>
          <TeacherOrganizationProvider>
            <TestDashboardWithSwitcher />
          </TeacherOrganizationProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Initial view: org_med data
    expect(await screen.findByText("کلاس آناتومی پزشکی")).toBeInTheDocument();
    expect(screen.queryByText("کلاس پروتز دندانی")).not.toBeInTheDocument();

    // Switch to org_dent via switcher
    const switcherBtn = screen.getByText("دانشکده پزشکی");
    fireEvent.click(switcherBtn);
    const dentOption = screen.getByText("دانشکده دندانپزشکی");
    fireEvent.click(dentOption);

    // Switched view: org_dent data displayed, org_med data not shown
    expect(await screen.findByText("کلاس پروتز دندانی")).toBeInTheDocument();
    expect(screen.queryByText("کلاس آناتومی پزشکی")).not.toBeInTheDocument();

    // Verify sessionStorage updated
    expect(sessionStorage.getItem(TEACHER_SELECTED_ORG_STORAGE_KEY)).toBe("org_dent");
  });

  // Case 3 — stale sessionStorage
  it("Case 3: invalid sessionStorage is cleared and auto-selects valid organization without 404", async () => {
    mockCurrentUser = { id: "user_pa_3", email: "pa3@avana.org", role: "platform_admin" };
    mockOrganizationsResponse = {
      request_id: "req-3",
      items: [{ id: "org_valid", name: "سازمان معتبر تنها" }],
      pagination: { limit: 1, next_cursor: null },
    };

    // Stale non-existent ID
    sessionStorage.setItem(TEACHER_SELECTED_ORG_STORAGE_KEY, "nonexistent-deleted-org");

    mockFetchWithPayload((url) => {
      if (url.includes("/v1/organizations/org_valid/teacher/classrooms")) {
        return { classrooms: [] };
      }
      throw new Error(`Unexpected URL request: ${url}`);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher"]}>
          <TeacherOrganizationProvider>
            <TeacherDashboardPage />
          </TeacherOrganizationProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Stale key is cleared, org_valid auto-selected, query succeeds
    expect(await screen.findByText("داشبورد مدیریت آموزش")).toBeInTheDocument();
    expect(screen.queryByText("خطا در دریافت اطلاعات داشبورد")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(TEACHER_SELECTED_ORG_STORAGE_KEY)).toBe("org_valid");

    // Ensure nonexistent ID was NEVER requested
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("nonexistent-deleted-org"),
      expect.anything(),
    );
  });

  // Case 4 — zero organizations
  it("Case 4: platform_admin with zero organizations sends no classroom request and renders empty state", async () => {
    mockCurrentUser = { id: "user_pa_4", email: "pa4@avana.org", role: "platform_admin" };
    mockOrganizationsResponse = {
      request_id: "req-4",
      items: [],
      pagination: { limit: 1, next_cursor: null },
    };

    const fetchMock = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher"]}>
          <TeacherOrganizationProvider>
            <TeacherDashboardPage />
          </TeacherOrganizationProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("هیچ سازمانی در سیستم ثبت نشده است")).toBeInTheDocument();
    expect(screen.queryByText("خطا در دریافت اطلاعات داشبورد")).not.toBeInTheDocument();
    expect(screen.queryByText("Not found")).not.toBeInTheDocument();

    // Verify zero classroom requests were fired
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Case 5 — teacher
  it("Case 5: teacher role uses membership organization without switcher or regression", async () => {
    mockCurrentUser = { id: "user_teacher", email: "teacher@avana.org", role: "teacher" };
    mockUserMemberships = [{ organization_id: "org_teach_member", role: "teacher" }];

    mockFetchWithPayload((url) => {
      if (url.includes("/v1/organizations/org_teach_member/teacher/classrooms")) {
        return {
          classrooms: [
            {
              id: "cls_t_1",
              organizationId: "org_teach_member",
              teacherId: "user_teacher",
              title: "کلاس استاد نمونه",
              inviteCode: "TEACH001",
              status: "active",
              membersCount: 8,
              examsCount: 1,
            },
          ],
        };
      }
      return { classrooms: [] };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher"]}>
          <TeacherOrganizationProvider>
            <div>
              <TeacherOrgSwitcher />
              <TeacherDashboardPage />
            </div>
          </TeacherOrganizationProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("کلاس استاد نمونه")).toBeInTheDocument();
    // Org switcher is not rendered for normal teacher
    expect(screen.queryByText("انتخاب سازمان...")).not.toBeInTheDocument();
  });

  // Case 6 — organization_admin
  it("Case 6: organization_admin uses membership organization without switcher or regression", async () => {
    mockCurrentUser = { id: "user_org_admin", email: "orgadmin@avana.org", role: "organization_admin" };
    mockUserMemberships = [{ organization_id: "org_oa_member", role: "organization_admin" }];

    mockFetchWithPayload((url) => {
      if (url.includes("/v1/organizations/org_oa_member/teacher/classrooms")) {
        return {
          classrooms: [
            {
              id: "cls_oa_1",
              organizationId: "org_oa_member",
              teacherId: "user_org_admin",
              title: "کلاس مدیریت سازمانی",
              inviteCode: "ADMIN001",
              status: "active",
              membersCount: 20,
              examsCount: 5,
            },
          ],
        };
      }
      return { classrooms: [] };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher"]}>
          <TeacherOrganizationProvider>
            <div>
              <TeacherOrgSwitcher />
              <TeacherDashboardPage />
            </div>
          </TeacherOrganizationProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("کلاس مدیریت سازمانی")).toBeInTheDocument();
    // Org switcher is not rendered for org admin
    expect(screen.queryByText("انتخاب سازمان...")).not.toBeInTheDocument();
  });
});

describe("Teacher Platform - TeacherShell Header BrandLogo Sizing & Boundary Containment", () => {
  beforeEach(() => {
    mockCurrentUser = { id: "user_teacher", email: "teacher@avana.org", role: "teacher" };
    mockUserMemberships = [{ organization_id: "org_1", role: "teacher" }];
  });

  const TEACHER_VIEWPORTS = [
    { width: 375, name: "375px (Mobile S)", expectedClass: "!h-9", maxAllowedHeight: 64 },
    { width: 768, name: "768px (Tablet)", expectedClass: "sm:!h-14", maxAllowedHeight: 80 },
    { width: 1024, name: "1024px (Desktop S)", expectedClass: "md:!h-14", maxAllowedHeight: 80 },
    { width: 1440, name: "1440px (Desktop L)", expectedClass: "md:!h-14", maxAllowedHeight: 80 },
  ];

  TEACHER_VIEWPORTS.forEach(({ width, name, expectedClass }) => {
    it(`verifies TeacherShell logo fits strictly within header bounds at ${name}`, () => {
      window.innerWidth = width;
      window.dispatchEvent(new Event("resize"));

      const teacherQueryClient = createTestQueryClient();
      const { container, unmount } = render(
        <QueryClientProvider client={teacherQueryClient}>
          <MemoryRouter initialEntries={["/teacher"]}>
            <TeacherShell />
          </MemoryRouter>
        </QueryClientProvider>
      );

      const header = container.querySelector("header");
      expect(header).toBeInTheDocument();

      const logo = container.querySelector('img[alt="لوگوی آوانا"]');
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute("src", BRAND_LOGO_SRC);

      // Verify containment classes: fits within 56px (sm:!h-14 / md:!h-14) in desktop/tablet and 36px (!h-9) in mobile
      expect(logo?.className).toContain(expectedClass);
      expect(logo?.className).toContain("!w-auto");
      expect(logo?.className).toContain("shrink-0");
      expect(logo?.className).toContain("object-contain");

      // Verify no wordmark in header
      expect(header?.querySelector('img[alt="AVANA"]')).not.toBeInTheDocument();

      // Verify teacher badge is rendered adjacent to logo
      expect(container.querySelector('[aria-label="منوی اساتید"]')).toBeInTheDocument();

      unmount();
    });
  });
});

describe("Teacher Platform - TeacherShell Header Organization, Learning Space & Teacher Badge Removal", () => {
  beforeEach(() => {
    mockCurrentUser = { id: "user_pa1", email: "admin@avana.org", role: "platform_admin" };
    mockUserMemberships = [{ organization_id: "org_1", role: "platform_admin" }];
    mockOrganizationsResponse = {
      request_id: "req-orgs",
      items: [
        { id: "79bda286-08a4-4a16-9340-4106864e0732", name: "فضای یادگیری 79bda286" },
        { id: "org-2", name: "فضای یادگیری آوانا" },
      ],
      pagination: { limit: 10, next_cursor: null },
    };
  });

  it("does not render organization name, 'فضای یادگیری', or 'پنل اساتید' anywhere in the TeacherShell header or drawer", async () => {
    const teacherQueryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={teacherQueryClient}>
        <MemoryRouter initialEntries={["/teacher"]}>
          <TeacherShell />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Verify header does NOT contain any learning space, organization string, or teacher panel badge
    expect(screen.queryByText(/فضای یادگیری/)).not.toBeInTheDocument();
    expect(screen.queryByText(/79bda286/)).not.toBeInTheDocument();
    expect(screen.queryByText("انتخاب سازمان...")).not.toBeInTheDocument();
    expect(screen.queryByText("پنل اساتید")).not.toBeInTheDocument();

    // Verify essential header controls and navigation are cleanly rendered
    expect(screen.getByText("داشبورد استاد")).toBeInTheDocument();
    expect(screen.getByText("کلاس‌های من")).toBeInTheDocument();
    expect(screen.getByText("نمای دانش‌آموز")).toBeInTheDocument();
    expect(screen.getByText("پنل مدیریت")).toBeInTheDocument();
  });
});

describe("Teacher Platform - Precise Exam Scheduling & Time Management", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockCurrentUser = { id: "user_teacher", email: "teacher@avana.org", role: "teacher" };
    mockUserMemberships = [{ organization_id: "org_1", role: "teacher" }];
    vi.restoreAllMocks();
  });

  function mockFetchWithPayload(handler: (url: string, init?: RequestInit) => any) {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const data = handler(url, init);
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "test-req-id" }),
        text: () => Promise.resolve(JSON.stringify(data)),
        json: () => Promise.resolve(data),
      } as unknown as Response);
    });
  }

  it("TeacherExamCreatePage renders date, start time, end time inputs and live Persian summary", async () => {
    mockFetchWithPayload((url) => {
      if (url.includes("/v1/teacher/classrooms/cls_1")) {
        return {
          classroom: {
            id: "cls_1",
            organizationId: "org_1",
            teacherId: "user_teacher",
            title: "کلاس ریاضی پیشرفته",
            inviteCode: "MATH101",
            status: "active",
            membersCount: 10,
            examsCount: 1,
          },
        };
      }
      return {};
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher/classrooms/cls_1/exams/new"]}>
          <Routes>
            <Route path="/teacher/classrooms/:classroomId/exams/new" element={<TeacherExamCreatePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("تعریف آزمون جدید (پیش‌نویس)")).toBeInTheDocument();
    expect(screen.getByLabelText("تاریخ برگزاری آزمون *")).toBeInTheDocument();
    expect(screen.getByLabelText("شروع آزمون *")).toBeInTheDocument();
    expect(screen.getByLabelText("پایان آزمون *")).toBeInTheDocument();
    expect(screen.getByText("بازه برگزاری آزمون")).toBeInTheDocument();
    expect(screen.getByText("تعیین مدت زمان پاسخگویی")).toBeInTheDocument();
    expect(screen.getByText("تعیین حد نصاب قبولی")).toBeInTheDocument();
  });

  it("TeacherExamCreatePage validates that end time must be after start time", async () => {
    mockFetchWithPayload((url) => {
      if (url.includes("/v1/teacher/classrooms/cls_1")) {
        return {
          classroom: {
            id: "cls_1",
            organizationId: "org_1",
            teacherId: "user_teacher",
            title: "کلاس ریاضی پیشرفته",
            inviteCode: "MATH101",
            status: "active",
          },
        };
      }
      return {};
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher/classrooms/cls_1/exams/new"]}>
          <Routes>
            <Route path="/teacher/classrooms/:classroomId/exams/new" element={<TeacherExamCreatePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText("تعریف آزمون جدید (پیش‌نویس)");

    // Enter title
    const titleInput = screen.getByLabelText("عنوان آزمون *");
    fireEvent.change(titleInput, { target: { value: "آزمون میان‌ترم" } });

    // Set start time after end time: start 12:00, end 10:00
    const startInput = screen.getByLabelText("شروع آزمون *");
    const endInput = screen.getByLabelText("پایان آزمون *");
    fireEvent.change(startInput, { target: { value: "12:00" } });
    fireEvent.change(endInput, { target: { value: "10:00" } });

    // Submit form
    const submitBtn = screen.getByRole("button", { name: "ایجاد پیش‌نویس و ورود به بخش سوالات" });
    fireEvent.click(submitBtn);

    expect(await screen.findByText("ساعت پایان باید بعد از ساعت شروع باشد.")).toBeInTheDocument();
  });

  it("TeacherExamCreatePage validates equal start and end time as invalid", async () => {
    mockFetchWithPayload((url) => {
      if (url.includes("/v1/teacher/classrooms/cls_1")) {
        return {
          classroom: {
            id: "cls_1",
            organizationId: "org_1",
            teacherId: "user_teacher",
            title: "کلاس ریاضی پیشرفته",
            inviteCode: "MATH101",
            status: "active",
          },
        };
      }
      return {};
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher/classrooms/cls_1/exams/new"]}>
          <Routes>
            <Route path="/teacher/classrooms/:classroomId/exams/new" element={<TeacherExamCreatePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText("تعریف آزمون جدید (پیش‌نویس)");

    const titleInput = screen.getByLabelText("عنوان آزمون *");
    fireEvent.change(titleInput, { target: { value: "آزمون میان‌ترم" } });

    const startInput = screen.getByLabelText("شروع آزمون *");
    const endInput = screen.getByLabelText("پایان آزمون *");
    fireEvent.change(startInput, { target: { value: "10:00" } });
    fireEvent.change(endInput, { target: { value: "10:00" } });

    const submitBtn = screen.getByRole("button", { name: "ایجاد پیش‌نویس و ورود به بخش سوالات" });
    fireEvent.click(submitBtn);

    expect(await screen.findByText("ساعت پایان باید بعد از ساعت شروع باشد.")).toBeInTheDocument();
  });

  it("End-to-End Integration Flow: creates exam with date 10:00 to 11:30, preserves exact round-trip without timezone drift", async () => {
    let capturedPayload: any = null;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowLocal = extractLocalDateAndTimeString(tomorrow);

    const expectedStartsAt = combineLocalDateAndTimeToIso(tomorrowLocal.dateStr, "10:00");
    const expectedEndsAt = combineLocalDateAndTimeToIso(tomorrowLocal.dateStr, "11:30");

    mockFetchWithPayload((url, init) => {
      if (url.includes("/v1/teacher/classrooms/cls_1/exams") && init?.method === "POST") {
        capturedPayload = JSON.parse(String(init.body));
        return {
          exam: {
            id: "exam_101",
            classroomId: "cls_1",
            title: capturedPayload.title,
            description: capturedPayload.description,
            durationMinutes: capturedPayload.durationMinutes,
            startsAt: capturedPayload.startsAt,
            endsAt: capturedPayload.endsAt,
            passingScorePercentage: 60,
            shuffleQuestions: true,
            shuffleOptions: true,
            showResultsImmediately: false,
            status: "draft",
            runtimeState: "upcoming",
            questionsCount: 0,
          },
        };
      }
      if (url.includes("/v1/teacher/classrooms/cls_1")) {
        return {
          classroom: {
            id: "cls_1",
            organizationId: "org_1",
            teacherId: "user_teacher",
            title: "کلاس ریاضی پیشرفته",
            inviteCode: "MATH101",
            status: "active",
          },
        };
      }
      return {};
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher/classrooms/cls_1/exams/new"]}>
          <Routes>
            <Route path="/teacher/classrooms/:classroomId/exams/new" element={<TeacherExamCreatePage />} />
            <Route path="/teacher/exams/:examId/edit" element={<div>صفحه ویرایشگر سوالات</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText("تعریف آزمون جدید (پیش‌نویس)");

    const titleInput = screen.getByLabelText("عنوان آزمون *");
    fireEvent.change(titleInput, { target: { value: "آزمون مبحث مشتق" } });

    // Set date to 2026-10-07 (15 Mehr 1405), start 10:00, end 11:30
    const startInput = screen.getByLabelText("شروع آزمون *");
    const endInput = screen.getByLabelText("پایان آزمون *");
    fireEvent.change(startInput, { target: { value: "10:00" } });
    fireEvent.change(endInput, { target: { value: "11:30" } });

    const submitBtn = screen.getByRole("button", { name: "ایجاد پیش‌نویس و ورود به بخش سوالات" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedPayload).not.toBeNull();
    });

    expect(capturedPayload.title).toBe("آزمون مبحث مشتق");
    expect(capturedPayload.durationMinutes).toBeNull();
    expect(capturedPayload.passingScorePercentage).toBeNull();
    expect(capturedPayload.startsAt).toBe(expectedStartsAt);
    expect(capturedPayload.endsAt).toBe(expectedEndsAt);

    // Verify round-trip extraction
    const extractedStart = extractLocalDateAndTimeString(capturedPayload.startsAt);
    const extractedEnd = extractLocalDateAndTimeString(capturedPayload.endsAt);
    expect(extractedStart.timeStr).toBe("10:00");
    expect(extractedEnd.timeStr).toBe("11:30");

    // Verify Persian representations
    const rangeDisplay = formatPersianExamTimeRange(capturedPayload.startsAt, capturedPayload.endsAt);
    expect(rangeDisplay).toContain("ساعت ۱۰:۰۰ تا ۱۱:۳۰");

    const studentNotice = formatStudentExamScheduleNotice(capturedPayload.startsAt, capturedPayload.endsAt);
    expect(studentNotice).toContain("از ساعت ۱۰:۰۰ تا ۱۱:۳۰ برگزار می‌شود.");
  });

  it("Runtime Exam State boundaries: exact startsAt, between, exact endsAt, and after endsAt", () => {
    const startsAt = "2026-10-07T10:00:00.000Z";
    const endsAt = "2026-10-07T11:30:00.000Z";

    const examBase = {
      status: "published" as const,
      startsAt,
      endsAt,
      closedAt: null,
    };

    // 1. Before startsAt (09:59:59) -> upcoming
    const beforeStart = new Date("2026-10-07T09:59:59.000Z");
    expect(calculateRuntimeExamState(examBase, beforeStart)).toBe("upcoming");

    // 2. Exactly at startsAt (10:00:00) -> active
    const exactlyAtStart = new Date("2026-10-07T10:00:00.000Z");
    expect(calculateRuntimeExamState(examBase, exactlyAtStart)).toBe("active");

    // 3. In the middle (10:45:00) -> active
    const middleOfExam = new Date("2026-10-07T10:45:00.000Z");
    expect(calculateRuntimeExamState(examBase, middleOfExam)).toBe("active");

    // 4. Exactly at endsAt (11:30:00) -> closed (Case F: exactly at endAt is closed)
    const exactlyAtEnd = new Date("2026-10-07T11:30:00.000Z");
    expect(calculateRuntimeExamState(examBase, exactlyAtEnd)).toBe("closed");

    // 5. After endsAt (11:30:01) -> closed
    const afterEnd = new Date("2026-10-07T11:30:01.000Z");
    expect(calculateRuntimeExamState(examBase, afterEnd)).toBe("closed");
  });

  it("ClassroomExamsTable displays Persian date and start-to-end time range", () => {
    const mockExams = [
      {
        id: "exam_1",
        classroomId: "cls_1",
        title: "آزمون حسابان ۱",
        description: "فصل اول و دوم",
        durationMinutes: 90,
        startsAt: combineLocalDateAndTimeToIso("2026-10-07", "10:00"),
        endsAt: combineLocalDateAndTimeToIso("2026-10-07", "11:30"),
        passingScorePercentage: 60,
        shuffleQuestions: true,
        shuffleOptions: true,
        showResultsImmediately: false,
        status: "published" as const,
        runtimeState: "upcoming" as const,
        questionsCount: 15,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ];

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ClassroomExamsTable exams={mockExams} isLoading={false} classroomId="cls_1" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("آزمون حسابان ۱")).toBeInTheDocument();
    expect(screen.getByText("ساعت ۱۰:۰۰ تا ۱۱:۳۰")).toBeInTheDocument();
  });
});

describe("Teacher Platform - allowBackNavigation Toggle & Configuration Suite", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockCurrentUser = { id: "user_teacher", email: "teacher@avana.org", role: "teacher" };
    mockUserMemberships = [{ organization_id: "org_1", role: "teacher" }];
    vi.restoreAllMocks();
  });

  function mockFetchWithPayload(handler: (url: string, init?: RequestInit) => any) {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const data = handler(url, init);
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "test-req-id" }),
        text: () => Promise.resolve(JSON.stringify(data)),
        json: () => Promise.resolve(data),
      } as unknown as Response);
    });
  }

  it("TeacherExamCreatePage renders allowBackNavigation toggle defaulting to true and submits correctly when toggled off", async () => {
    let capturedPayload: any = null;

    mockFetchWithPayload((url, init) => {
      if (url.includes("/v1/teacher/classrooms/cls_1/exams") && init?.method === "POST") {
        capturedPayload = JSON.parse(String(init.body));
        return {
          exam: {
            id: "exam_102",
            classroomId: "cls_1",
            title: capturedPayload.title,
            description: capturedPayload.description,
            durationMinutes: capturedPayload.durationMinutes,
            startsAt: capturedPayload.startsAt,
            endsAt: capturedPayload.endsAt,
            passingScorePercentage: 60,
            shuffleQuestions: true,
            shuffleOptions: true,
            showResultsImmediately: false,
            allowBackNavigation: capturedPayload.allowBackNavigation,
            status: "draft",
            runtimeState: "upcoming",
            questionsCount: 0,
          },
        };
      }
      if (url.includes("/v1/teacher/classrooms/cls_1")) {
        return {
          classroom: {
            id: "cls_1",
            organizationId: "org_1",
            teacherId: "user_teacher",
            title: "کلاس بیولوژی",
            inviteCode: "BIO101",
            status: "active",
          },
        };
      }
      return {};
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher/classrooms/cls_1/exams/new"]}>
          <Routes>
            <Route path="/teacher/classrooms/:classroomId/exams/new" element={<TeacherExamCreatePage />} />
            <Route path="/teacher/exams/:examId/edit" element={<div>ویرایشگر سوالات</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("تعریف آزمون جدید (پیش‌نویس)")).toBeInTheDocument();

    // Verify toggle text and description are present
    expect(screen.getByText("بازگشت به سؤالات قبلی")).toBeInTheDocument();
    expect(
      screen.getByText("دانشجو می‌تواند در طول آزمون به سؤالات قبلی بازگردد و گزینه‌های انتخابی خود را تغییر دهد.")
    ).toBeInTheDocument();

    // Enter title
    const titleInput = screen.getByLabelText("عنوان آزمون *");
    fireEvent.change(titleInput, { target: { value: "آزمون بدون بازگشت" } });

    // Toggle off "بازگشت به سؤالات قبلی"
    const toggleContainer = screen.getByText("بازگشت به سؤالات قبلی").closest("div.flex")!;
    const switchBtn = toggleContainer.querySelector('button[role="switch"]')!;
    expect(switchBtn).toHaveAttribute("aria-checked", "true"); // default is true
    fireEvent.click(switchBtn);
    expect(switchBtn).toHaveAttribute("aria-checked", "false");

    const submitBtn = screen.getByRole("button", { name: "ایجاد پیش‌نویس و ورود به بخش سوالات" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedPayload).not.toBeNull();
    });

    expect(capturedPayload.title).toBe("آزمون بدون بازگشت");
    expect(capturedPayload.allowBackNavigation).toBe(false);
  });

  it("TeacherExamEditorPage loads existing allowBackNavigation from exam and allows saving updates", async () => {
    let capturedPatchPayload: any = null;

    mockFetchWithPayload((url, init) => {
      if (url.includes("/v1/teacher/exams/exam_103/questions")) {
        return { questions: [] };
      }
      if (url.includes("/v1/teacher/exams/exam_103") && init?.method === "PATCH") {
        capturedPatchPayload = JSON.parse(String(init.body));
        return {
          exam: {
            id: "exam_103",
            classroomId: "cls_1",
            title: "آزمون به‌روزشده",
            durationMinutes: 60,
            startsAt: "2026-10-07T10:00:00.000Z",
            endsAt: "2026-10-07T11:30:00.000Z",
            passingScorePercentage: 60,
            shuffleQuestions: true,
            shuffleOptions: true,
            showResultsImmediately: false,
            allowBackNavigation: capturedPatchPayload.allowBackNavigation,
            status: "draft",
            runtimeState: "upcoming",
            questionsCount: 0,
          },
        };
      }
      if (url.includes("/v1/teacher/exams/exam_103")) {
        return {
          exam: {
            id: "exam_103",
            classroomId: "cls_1",
            title: "آزمون آزمایشی",
            description: null,
            durationMinutes: 60,
            startsAt: "2026-10-07T10:00:00.000Z",
            endsAt: "2026-10-07T11:30:00.000Z",
            passingScorePercentage: 60,
            shuffleQuestions: true,
            shuffleOptions: true,
            showResultsImmediately: false,
            allowBackNavigation: false, // Initially false on server
            status: "draft",
            runtimeState: "upcoming",
            questionsCount: 0,
          },
        };
      }
      return {};
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher/exams/exam_103/edit"]}>
          <Routes>
            <Route path="/teacher/exams/:examId/edit" element={<TeacherExamEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("آزمون آزمایشی")).toBeInTheDocument();

    // Open settings panel
    const openSettingsBtn = screen.getByRole("button", { name: "ویرایش مشخصات آزمون" });
    fireEvent.click(openSettingsBtn);

    // Verify toggle is loaded with false
    const toggleContainer = (await screen.findByText("بازگشت به سؤالات قبلی")).closest("div.flex")!;
    const switchBtn = toggleContainer.querySelector('button[role="switch"]')!;
    expect(switchBtn).toHaveAttribute("aria-checked", "false");

    // Toggle on (to true)
    fireEvent.click(switchBtn);
    expect(switchBtn).toHaveAttribute("aria-checked", "true");

    // Click save settings
    const saveBtn = screen.getByRole("button", { name: "ذخیره تنظیمات" });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(capturedPatchPayload).not.toBeNull();
    });

    expect(capturedPatchPayload.allowBackNavigation).toBe(true);
  });

  describe("Per-Question Timing (perQuestionTimeSeconds) Authoring Suite", () => {
    it("TeacherExamCreatePage selects 30s per-question timing, disables allowBackNavigation, and submits payload", async () => {
      let capturedPayload: any = null;

      mockFetchWithPayload((url, init) => {
        if (url.includes("/v1/teacher/classrooms/cls_1/exams") && init?.method === "POST") {
          capturedPayload = JSON.parse(String(init.body));
          return {
            exam: {
              id: "exam_201",
              classroomId: "cls_1",
              title: capturedPayload.title,
              description: capturedPayload.description,
              durationMinutes: capturedPayload.durationMinutes,
              startsAt: capturedPayload.startsAt,
              endsAt: capturedPayload.endsAt,
              passingScorePercentage: 60,
              shuffleQuestions: true,
              shuffleOptions: true,
              showResultsImmediately: false,
              allowBackNavigation: capturedPayload.allowBackNavigation,
              perQuestionTimeSeconds: capturedPayload.perQuestionTimeSeconds,
              status: "draft",
              runtimeState: "upcoming",
              questionsCount: 0,
            },
          };
        }
        if (url.includes("/v1/teacher/classrooms/cls_1")) {
          return {
            classroom: {
              id: "cls_1",
              organizationId: "11111111-1111-4111-8111-111111111111",
              title: "کلاس شیمی یازدهم",
              description: "شیمی آلی",
              inviteCode: "CHEM11",
              status: "active",
              createdAt: "2026-09-01T00:00:00.000Z",
              updatedAt: "2026-09-01T00:00:00.000Z",
            },
          };
        }
        return {};
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/teacher/classrooms/cls_1/exams/new"]}>
            <Routes>
              <Route path="/teacher/classrooms/:classroomId/exams/new" element={<TeacherExamCreatePage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(await screen.findByRole("heading", { name: /تعریف آزمون جدید/ })).toBeInTheDocument();

      const titleInput = screen.getByLabelText("عنوان آزمون *");
      fireEvent.change(titleInput, { target: { value: "آزمون زمان‌دار شیمی" } });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);
      const dateInput = screen.getByLabelText("تاریخ برگزاری آزمون *");
      fireEvent.change(dateInput, { target: { value: tomorrowStr } });

      // Change timing select to 30 seconds
      const timingSelect = screen.getByDisplayValue("خاموش");
      fireEvent.change(timingSelect, { target: { value: "30" } });

      // Notice for disabled back navigation must appear
      expect(
        screen.getByText("در صورت فعال بودن زمان برای هر سؤال، امکان بازگشت به سؤالات قبلی غیرفعال است.")
      ).toBeInTheDocument();

      // Submit form
      const submitBtn = screen.getByRole("button", { name: "ایجاد پیش‌نویس و ورود به بخش سوالات" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(capturedPayload).not.toBeNull();
      });

      expect(capturedPayload.perQuestionTimeSeconds).toBe(30);
      expect(capturedPayload.allowBackNavigation).toBe(false);
    });

    it("TeacherExamEditorPage loads existing perQuestionTimeSeconds and preserves settings", async () => {
      mockFetchWithPayload((url) => {
        if (url.includes("/v1/teacher/exams/exam_202")) {
          return {
            exam: {
              id: "exam_202",
              classroomId: "cls_1",
              title: "آزمون زمان‌دار ۴۵ ثانیه‌ای",
              description: null,
              durationMinutes: 60,
              startsAt: "2026-10-07T10:00:00.000Z",
              endsAt: "2026-10-07T11:30:00.000Z",
              passingScorePercentage: 60,
              shuffleQuestions: true,
              shuffleOptions: true,
              showResultsImmediately: false,
              allowBackNavigation: false,
              perQuestionTimeSeconds: 45,
              status: "draft",
              runtimeState: "upcoming",
              questionsCount: 0,
            },
          };
        }
        return {};
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/teacher/exams/exam_202/edit"]}>
            <Routes>
              <Route path="/teacher/exams/:examId/edit" element={<TeacherExamEditorPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(await screen.findByText("آزمون زمان‌دار ۴۵ ثانیه‌ای")).toBeInTheDocument();

      // Open settings panel
      const openSettingsBtn = screen.getByRole("button", { name: "ویرایش مشخصات آزمون" });
      fireEvent.click(openSettingsBtn);

      // Verify timing select is loaded with 45 seconds
      expect(screen.getByDisplayValue("۴۵ ثانیه")).toBeInTheDocument();
      expect(
        screen.getByText("در صورت فعال بودن زمان برای هر سؤال، امکان بازگشت به سؤالات قبلی غیرفعال است.")
      ).toBeInTheDocument();
    });

    it("TeacherExamCreatePage displays contextual example with real time values", async () => {
      mockFetchWithPayload((url) => {
        if (url.includes("/v1/teacher/classrooms/cls_1")) {
          return {
            classroom: {
              id: "cls_1",
              organizationId: "org_1",
              teacherId: "user_teacher",
              title: "کلاس ریاضی پیشرفته",
              inviteCode: "MATH101",
              status: "active",
            },
          };
        }
        return {};
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/teacher/classrooms/cls_1/exams/new"]}>
            <Routes>
              <Route path="/teacher/classrooms/:classroomId/exams/new" element={<TeacherExamCreatePage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await screen.findByText("تعریف آزمون جدید (پیش‌نویس)");

      // Enable duration toggle
      const durationToggleLabel = screen.getByText("تعیین مدت زمان پاسخگویی");
      const durationToggle = durationToggleLabel.closest("div")?.querySelector('button[role="switch"]') || durationToggleLabel;
      fireEvent.click(durationToggle);

      // Set start 10:00, end 12:00, duration 60
      const startInput = screen.getByLabelText("شروع آزمون *");
      const endInput = screen.getByLabelText("پایان آزمون *");
      const durationInput = screen.getByLabelText("مدت زمان آزمون (دقیقه)");

      fireEvent.change(startInput, { target: { value: "10:00" } });
      fireEvent.change(endInput, { target: { value: "12:00" } });
      fireEvent.change(durationInput, { target: { value: "60" } });

      expect(screen.getByText("مثال نحوه محاسبه مهلت پاسخگویی:")).toBeInTheDocument();
    });

    it("TeacherExamCreatePage displays gentle informative warning when duration exceeds schedule window without blocking", async () => {
      mockFetchWithPayload((url) => {
        if (url.includes("/v1/teacher/classrooms/cls_1")) {
          return {
            classroom: {
              id: "cls_1",
              organizationId: "org_1",
              teacherId: "user_teacher",
              title: "کلاس ریاضی پیشرفته",
              inviteCode: "MATH101",
              status: "active",
            },
          };
        }
        return {};
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/teacher/classrooms/cls_1/exams/new"]}>
            <Routes>
              <Route path="/teacher/classrooms/:classroomId/exams/new" element={<TeacherExamCreatePage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await screen.findByText("تعریف آزمون جدید (پیش‌نویس)");

      // Enable duration toggle
      const durationToggleLabel = screen.getByText("تعیین مدت زمان پاسخگویی");
      const durationToggle = durationToggleLabel.closest("div")?.querySelector('button[role="switch"]') || durationToggleLabel;
      fireEvent.click(durationToggle);

      // Set start 10:00, end 11:00 (60 min window), but duration 90 min
      const startInput = screen.getByLabelText("شروع آزمون *");
      const endInput = screen.getByLabelText("پایان آزمون *");
      const durationInput = screen.getByLabelText("مدت زمان آزمون (دقیقه)");

      fireEvent.change(startInput, { target: { value: "10:00" } });
      fireEvent.change(endInput, { target: { value: "11:00" } });
      fireEvent.change(durationInput, { target: { value: "90" } });

      // Warning text should be visible explaining the situation
      expect(
        screen.getByText(/از کل بازه برگزاری .* بیشتر است/)
      ).toBeInTheDocument();
    });
  });
});

  // =========================================================================
  // 17. Classroom Members Table - Student Profile & Name Resolution Tests
  // =========================================================================
  describe("ClassroomMembersTable - Student Profile & Name Resolution", () => {
    it("renders table header with Persian label 'نام و مشخصات دانش‌آموز'", () => {
      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <ClassroomMembersTable
            classroomId="cls_1"
            members={[]}
            isLoading={false}
          />
        </QueryClientProvider>
      );

      expect(screen.getByText("نام و مشخصات دانش‌آموز")).toBeInTheDocument();
      expect(screen.getByText("ایمیل")).toBeInTheDocument();
      expect(screen.getByText("تاریخ عضویت")).toBeInTheDocument();
      expect(screen.getByText("وضعیت عضویت")).toBeInTheDocument();
    });

    it("renders actual full name when user.name is provided from canonical user profile", () => {
      const queryClient = createTestQueryClient();
      const members = [
        {
          id: "mem_1",
          classroomId: "cls_1",
          studentId: "user_student_1",
          status: "active" as const,
          firstJoinedAt: "2026-03-01T10:00:00.000Z",
          lastJoinedAt: "2026-03-01T10:00:00.000Z",
          leftAt: null,
          user: {
            id: "user_student_1",
            email: "ali.mohammadi@test.com",
            name: "علی محمدی",
          },
        },
      ];

      render(
        <QueryClientProvider client={queryClient}>
          <ClassroomMembersTable
            classroomId="cls_1"
            members={members}
            isLoading={false}
          />
        </QueryClientProvider>
      );

      expect(screen.getByText("علی محمدی")).toBeInTheDocument();
      expect(screen.queryByText("دانش‌آموز")).not.toBeInTheDocument();
      expect(screen.getAllByText("ali.mohammadi@test.com").length).toBeGreaterThan(0);
    });

    it("renders full name when firstName and lastName are provided without user.name", () => {
      const queryClient = createTestQueryClient();
      const members = [
        {
          id: "mem_2",
          classroomId: "cls_1",
          studentId: "user_student_2",
          status: "active" as const,
          firstJoinedAt: "2026-03-01T10:00:00.000Z",
          lastJoinedAt: "2026-03-01T10:00:00.000Z",
          leftAt: null,
          user: {
            id: "user_student_2",
            email: "sara.ahmadi@test.com",
            firstName: "سارا",
            lastName: "احمدی",
          },
        },
      ];

      render(
        <QueryClientProvider client={queryClient}>
          <ClassroomMembersTable
            classroomId="cls_1"
            members={members}
            isLoading={false}
          />
        </QueryClientProvider>
      );

      expect(screen.getByText("سارا احمدی")).toBeInTheDocument();
    });

    it("safely handles missing lastName without rendering 'undefined' or 'null'", () => {
      const queryClient = createTestQueryClient();
      const members = [
        {
          id: "mem_3",
          classroomId: "cls_1",
          studentId: "user_student_3",
          status: "active" as const,
          firstJoinedAt: "2026-03-01T10:00:00.000Z",
          lastJoinedAt: "2026-03-01T10:00:00.000Z",
          leftAt: null,
          user: {
            id: "user_student_3",
            email: "reza@test.com",
            firstName: "رضا",
            lastName: null,
          },
        },
      ];

      render(
        <QueryClientProvider client={queryClient}>
          <ClassroomMembersTable
            classroomId="cls_1"
            members={members}
            isLoading={false}
          />
        </QueryClientProvider>
      );

      expect(screen.getByText("رضا")).toBeInTheDocument();
      expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
    });

    it("safely handles missing firstName without rendering 'undefined' or 'null'", () => {
      const queryClient = createTestQueryClient();
      const members = [
        {
          id: "mem_4",
          classroomId: "cls_1",
          studentId: "user_student_4",
          status: "active" as const,
          firstJoinedAt: "2026-03-01T10:00:00.000Z",
          lastJoinedAt: "2026-03-01T10:00:00.000Z",
          leftAt: null,
          user: {
            id: "user_student_4",
            email: "kamali@test.com",
            firstName: null,
            lastName: "کمالی",
          },
        },
      ];

      render(
        <QueryClientProvider client={queryClient}>
          <ClassroomMembersTable
            classroomId="cls_1"
            members={members}
            isLoading={false}
          />
        </QueryClientProvider>
      );

      expect(screen.getByText("کمالی")).toBeInTheDocument();
      expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
    });

    it("gracefully falls back to email when name fields are empty or whitespace", () => {
      const queryClient = createTestQueryClient();
      const members = [
        {
          id: "mem_5",
          classroomId: "cls_1",
          studentId: "user_student_5",
          status: "active" as const,
          firstJoinedAt: "2026-03-01T10:00:00.000Z",
          lastJoinedAt: "2026-03-01T10:00:00.000Z",
          leftAt: null,
          user: {
            id: "user_student_5",
            email: "student_noname@test.com",
            name: "   ",
          },
        },
      ];

      render(
        <QueryClientProvider client={queryClient}>
          <ClassroomMembersTable
            classroomId="cls_1"
            members={members}
            isLoading={false}
          />
        </QueryClientProvider>
      );

      expect(screen.getAllByText("student_noname@test.com").length).toBeGreaterThan(0);
    });

    it("gracefully falls back to 'دانش‌آموز' when user profile is completely missing", () => {
      const queryClient = createTestQueryClient();
      const members = [
        {
          id: "mem_6",
          classroomId: "cls_1",
          studentId: "user_student_6",
          status: "active" as const,
          firstJoinedAt: "2026-03-01T10:00:00.000Z",
          lastJoinedAt: "2026-03-01T10:00:00.000Z",
          leftAt: null,
        },
      ];

      render(
        <QueryClientProvider client={queryClient}>
          <ClassroomMembersTable
            classroomId="cls_1"
            members={members}
            isLoading={false}
          />
        </QueryClientProvider>
      );

      expect(screen.getByText("دانش‌آموز")).toBeInTheDocument();
      expect(screen.getAllByText("نامشخص").length).toBeGreaterThan(0);
    });

    it("displays student real name in the remove student confirmation modal", async () => {
      const queryClient = createTestQueryClient();
      const members = [
        {
          id: "mem_7",
          classroomId: "cls_1",
          studentId: "user_student_7",
          status: "active" as const,
          firstJoinedAt: "2026-03-01T10:00:00.000Z",
          lastJoinedAt: "2026-03-01T10:00:00.000Z",
          leftAt: null,
          user: {
            id: "user_student_7",
            email: "hesam@test.com",
            name: "حسام حسینی",
          },
        },
      ];

      render(
        <QueryClientProvider client={queryClient}>
          <ClassroomMembersTable
            classroomId="cls_1"
            members={members}
            isLoading={false}
          />
        </QueryClientProvider>
      );

      const removeButton = screen.getByRole("button", { name: /حذف از کلاس/i });
      fireEvent.click(removeButton);

      expect(
        screen.getByText(/آیا از حذف "حسام حسینی" از کلاس اطمینان دارید؟/)
      ).toBeInTheDocument();
    });

    it("displays real student 'علی محمدلو' in classroom members table", () => {
      const queryClient = createTestQueryClient();
      const members = [
        {
          id: "mem_ali",
          classroomId: "cls_1",
          studentId: "user_student_ali",
          status: "active" as const,
          firstJoinedAt: "2026-03-01T10:00:00.000Z",
          lastJoinedAt: "2026-03-01T10:00:00.000Z",
          leftAt: null,
          user: {
            id: "user_student_ali",
            email: "ali.mohammadloo@test.com",
            name: "علی محمدلو",
          },
        },
      ];

      render(
        <QueryClientProvider client={queryClient}>
          <ClassroomMembersTable
            classroomId="cls_1"
            members={members}
            isLoading={false}
          />
        </QueryClientProvider>
      );

      expect(screen.getByText("علی محمدلو")).toBeInTheDocument();
      expect(screen.queryByText("دانش‌آموز")).not.toBeInTheDocument();
    });

    it("displays real student 'علی محمدلو' in exam results table (StudentResultsTable)", () => {
      const students = [
        {
          studentId: "user_student_ali",
          studentName: "علی محمدلو",
          studentEmail: "ali.mohammadloo@test.com",
          status: "submitted" as const,
          score: 85,
          maxScore: 100,
          percentage: 85,
          passed: true,
          startedAt: "2026-03-01T10:00:00.000Z",
          submittedAt: "2026-03-01T10:45:00.000Z",
          durationMinutes: 45,
        },
      ];

      render(
        <MemoryRouter>
          <StudentResultsTable
            students={students}
            examId="exam_123"
          />
        </MemoryRouter>
      );

      expect(screen.getByText("علی محمدلو")).toBeInTheDocument();
      expect(screen.getByText("ali.mohammadloo@test.com")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 18. Optional Exam Duration & Passing Score UI Suite
  // =========================================================================
  describe("Teacher Platform - Optional Duration & Passing Score UI Suite", () => {
    let fetchSpy: any;

    beforeEach(() => {
      mockCurrentUser = { id: "user_teacher", email: "teacher@avana.org", role: "teacher" };
      mockUserMemberships = [{ organization_id: "org_1", role: "teacher" }];
      vi.restoreAllMocks();
    });

    function mockFetchWithPayload(handler: (url: string, init?: RequestInit) => any) {
      fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const data = handler(url, init);
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "x-request-id": "test-req-id" }),
          text: () => Promise.resolve(JSON.stringify(data)),
          json: () => Promise.resolve(data),
        } as unknown as Response);
      });
    }

    it("TeacherExamCreatePage: duration and passing score are disabled by default and submit nulls", async () => {
      let capturedPayload: any = null;

      mockFetchWithPayload((url, init) => {
        if (url.includes("/v1/teacher/classrooms/cls_1/exams") && init?.method === "POST") {
          capturedPayload = JSON.parse(String(init.body));
          return {
            exam: {
              id: "exam_opt_1",
              classroomId: "cls_1",
              title: capturedPayload.title,
              description: capturedPayload.description,
              durationMinutes: capturedPayload.durationMinutes,
              startsAt: capturedPayload.startsAt,
              endsAt: capturedPayload.endsAt,
              passingScorePercentage: capturedPayload.passingScorePercentage,
              shuffleQuestions: true,
              shuffleOptions: true,
              showResultsImmediately: false,
              allowBackNavigation: true,
              status: "draft",
              runtimeState: "upcoming",
              questionsCount: 0,
            },
          };
        }
        if (url.includes("/v1/teacher/classrooms/cls_1")) {
          return {
            classroom: {
              id: "cls_1",
              organizationId: "org_1",
              teacherId: "user_teacher",
              title: "کلاس فیزیک",
              inviteCode: "PHYS101",
              status: "active",
            },
          };
        }
        return {};
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/teacher/classrooms/cls_1/exams/new"]}>
            <Routes>
              <Route path="/teacher/classrooms/:classroomId/exams/new" element={<TeacherExamCreatePage />} />
              <Route path="/teacher/exams/:examId/edit" element={<div>صفحه ویرایشگر</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await screen.findByText("تعریف آزمون جدید (پیش‌نویس)");

      // Verify switches are off by default
      const durationLabel = screen.getByText("تعیین مدت زمان پاسخگویی");
      const durationSwitch = durationLabel.closest("div")?.querySelector('button[role="switch"]')!;
      expect(durationSwitch).toHaveAttribute("aria-checked", "false");

      const passingLabel = screen.getByText("تعیین حد نصاب قبولی");
      const passingSwitch = passingLabel.closest("div")?.querySelector('button[role="switch"]')!;
      expect(passingSwitch).toHaveAttribute("aria-checked", "false");

      // Verify inputs are disabled
      const durationInput = screen.getByLabelText("مدت زمان آزمون (دقیقه)");
      expect(durationInput).toBeDisabled();

      const passingInput = screen.getByLabelText("حد نصاب قبولی (درصد)");
      expect(passingInput).toBeDisabled();

      // Enter title and submit
      const titleInput = screen.getByLabelText("عنوان آزمون *");
      fireEvent.change(titleInput, { target: { value: "آزمون بدون محدودیت" } });

      const submitBtn = screen.getByRole("button", { name: "ایجاد پیش‌نویس و ورود به بخش سوالات" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(capturedPayload).not.toBeNull();
      });

      expect(capturedPayload.durationMinutes).toBeNull();
      expect(capturedPayload.passingScorePercentage).toBeNull();
    });

    it("TeacherExamCreatePage: toggling switches enables inputs and submits numeric values", async () => {
      let capturedPayload: any = null;

      mockFetchWithPayload((url, init) => {
        if (url.includes("/v1/teacher/classrooms/cls_1/exams") && init?.method === "POST") {
          capturedPayload = JSON.parse(String(init.body));
          return {
            exam: {
              id: "exam_opt_2",
              classroomId: "cls_1",
              title: capturedPayload.title,
              description: capturedPayload.description,
              durationMinutes: capturedPayload.durationMinutes,
              startsAt: capturedPayload.startsAt,
              endsAt: capturedPayload.endsAt,
              passingScorePercentage: capturedPayload.passingScorePercentage,
              shuffleQuestions: true,
              shuffleOptions: true,
              showResultsImmediately: false,
              allowBackNavigation: true,
              status: "draft",
              runtimeState: "upcoming",
              questionsCount: 0,
            },
          };
        }
        if (url.includes("/v1/teacher/classrooms/cls_1")) {
          return {
            classroom: {
              id: "cls_1",
              organizationId: "org_1",
              teacherId: "user_teacher",
              title: "کلاس فیزیک",
              inviteCode: "PHYS101",
              status: "active",
            },
          };
        }
        return {};
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/teacher/classrooms/cls_1/exams/new"]}>
            <Routes>
              <Route path="/teacher/classrooms/:classroomId/exams/new" element={<TeacherExamCreatePage />} />
              <Route path="/teacher/exams/:examId/edit" element={<div>صفحه ویرایشگر</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await screen.findByText("تعریف آزمون جدید (پیش‌نویس)");

      // Toggle both on
      const durationLabel = screen.getByText("تعیین مدت زمان پاسخگویی");
      const durationSwitch = durationLabel.closest("div")?.querySelector('button[role="switch"]')!;
      fireEvent.click(durationSwitch);
      expect(durationSwitch).toHaveAttribute("aria-checked", "true");

      const passingLabel = screen.getByText("تعیین حد نصاب قبولی");
      const passingSwitch = passingLabel.closest("div")?.querySelector('button[role="switch"]')!;
      fireEvent.click(passingSwitch);
      expect(passingSwitch).toHaveAttribute("aria-checked", "true");

      // Fill in values
      const titleInput = screen.getByLabelText("عنوان آزمون *");
      fireEvent.change(titleInput, { target: { value: "آزمون استاندارد" } });

      const durationInput = screen.getByLabelText("مدت زمان آزمون (دقیقه)");
      expect(durationInput).not.toBeDisabled();
      fireEvent.change(durationInput, { target: { value: "75" } });

      const passingInput = screen.getByLabelText("حد نصاب قبولی (درصد)");
      expect(passingInput).not.toBeDisabled();
      fireEvent.change(passingInput, { target: { value: "65" } });

      const submitBtn = screen.getByRole("button", { name: "ایجاد پیش‌نویس و ورود به بخش سوالات" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(capturedPayload).not.toBeNull();
      });

      expect(capturedPayload.durationMinutes).toBe(75);
      expect(capturedPayload.passingScorePercentage).toBe(65);
    });

    it("TeacherExamEditorPage: initializes switches from exam and allows disabling them", async () => {
      let capturedPatchPayload: any = null;

      mockFetchWithPayload((url, init) => {
        if (url.includes("/v1/teacher/exams/exam_with_values") && init?.method === "PATCH") {
          capturedPatchPayload = JSON.parse(String(init.body));
          return {
            exam: {
              id: "exam_with_values",
              classroomId: "cls_1",
              title: capturedPatchPayload.title,
              durationMinutes: capturedPatchPayload.durationMinutes,
              startsAt: capturedPatchPayload.startsAt,
              endsAt: capturedPatchPayload.endsAt,
              passingScorePercentage: capturedPatchPayload.passingScorePercentage,
              status: "draft",
              runtimeState: "upcoming",
            },
          };
        }
        if (url.includes("/v1/teacher/exams/exam_with_values/questions")) {
          return { questions: [] };
        }
        if (url.includes("/v1/teacher/exams/exam_with_values")) {
          return {
            exam: {
              id: "exam_with_values",
              classroomId: "cls_1",
              title: "آزمون دارای حد نصاب و زمان",
              durationMinutes: 45,
              startsAt: "2026-10-01T10:00:00.000Z",
              endsAt: "2026-10-01T12:00:00.000Z",
              passingScorePercentage: 70,
              shuffleQuestions: true,
              shuffleOptions: true,
              showResultsImmediately: false,
              allowBackNavigation: true,
              status: "draft",
              runtimeState: "upcoming",
              questionsCount: 0,
            },
          };
        }
        return {};
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/teacher/exams/exam_with_values/edit"]}>
            <Routes>
              <Route path="/teacher/exams/:examId/edit" element={<TeacherExamEditorPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await screen.findByText("آزمون دارای حد نصاب و زمان");

      // Open settings
      const settingsToggleBtn = screen.getByRole("button", { name: "ویرایش مشخصات آزمون" });
      fireEvent.click(settingsToggleBtn);

      // Verify switches are initially ON
      const durationLabel = screen.getByText("تعیین مدت زمان پاسخگویی");
      const durationSwitch = durationLabel.closest("div")?.querySelector('button[role="switch"]')!;
      expect(durationSwitch).toHaveAttribute("aria-checked", "true");

      const passingLabel = screen.getByText("تعیین حد نصاب قبولی");
      const passingSwitch = passingLabel.closest("div")?.querySelector('button[role="switch"]')!;
      expect(passingSwitch).toHaveAttribute("aria-checked", "true");

      // Toggle both OFF
      fireEvent.click(durationSwitch);
      expect(durationSwitch).toHaveAttribute("aria-checked", "false");

      fireEvent.click(passingSwitch);
      expect(passingSwitch).toHaveAttribute("aria-checked", "false");

      // Save settings
      const saveBtn = screen.getByRole("button", { name: "ذخیره تنظیمات" });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(capturedPatchPayload).not.toBeNull();
      });

      expect(capturedPatchPayload.durationMinutes).toBeNull();
      expect(capturedPatchPayload.passingScorePercentage).toBeNull();
    });
  });

  // =========================================================================
  // Teacher Platform - True/False Question Authoring UI Suite
  // =========================================================================
  describe("Teacher Platform - True/False Question Authoring UI Suite", () => {
    beforeEach(() => {
      mockCurrentUser = { id: "teacher_1", email: "teacher@test.com", role: "teacher" };
      mockUserMemberships = [{ organization_id: "org_1", role: "teacher" }];
    });

    it("renders True/False question preview and allows inline authoring of True/False question", async () => {
      let createdQuestionPayload: any = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/teacher/exams/exam_tf_editor/questions") && init?.method === "POST") {
          createdQuestionPayload = JSON.parse(String(init.body));
          return {
            ok: true,
            status: 201,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  question: {
                    id: "q_tf_new",
                    examId: "exam_tf_editor",
                    orderIndex: 1,
                    questionType: "true_false",
                    prompt: createdQuestionPayload.prompt,
                    points: createdQuestionPayload.points,
                    correctOptionId: createdQuestionPayload.correctOptionId,
                    options: [
                      { id: "true", text: "صحیح" },
                      { id: "false", text: "غلط" },
                    ],
                  },
                }),
              ),
          } as Response;
        }

        if (urlStr.includes("/v1/teacher/exams/exam_tf_editor/questions")) {
          return {
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  questions: [
                    {
                      id: "q_tf_1",
                      examId: "exam_tf_editor",
                      orderIndex: 0,
                      questionType: "true_false",
                      prompt: "در مورد گزاره‌های زیر، صحیح یا غلط بودن هر یک را مشخص کنید.",
                      points: 10,
                      statements: [
                        {
                          id: "stmt_1",
                          text: "هالوتان هپاتوتوکسیک‌ترین گاز بیهوشی است.",
                          correctAnswer: true,
                        },
                      ],
                      explanation: "به دلیل متابولیسم اکسیداتیو در کبد.",
                    },
                  ],
                }),
              ),
          } as Response;
        }

        if (urlStr.includes("/v1/teacher/exams/exam_tf_editor")) {
          return {
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  exam: {
                    id: "exam_tf_editor",
                    classroomId: "cls_1",
                    title: "آزمون تخصصی هوشبری",
                    durationMinutes: 30,
                    startsAt: "2026-10-01T10:00:00.000Z",
                    endsAt: "2026-10-01T12:00:00.000Z",
                    status: "draft",
                    runtimeState: "upcoming",
                    questionsCount: 1,
                  },
                }),
              ),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/teacher/exams/exam_tf_editor/edit"]}>
            <Routes>
              <Route path="/teacher/exams/:examId/edit" element={<TeacherExamEditorPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify existing True/False question renders correctly with badge and statement
      await screen.findByText("هالوتان هپاتوتوکسیک‌ترین گاز بیهوشی است.");
      expect(screen.getByText(/صحیح \/ غلط/)).toBeInTheDocument();
      expect(screen.getByText(/پاسخ صحیح: صحیح/)).toBeInTheDocument();

      // Open new question inline form
      const addQuestionBtn = screen.getByRole("button", { name: /طرح سوال جدید/ });
      fireEvent.click(addQuestionBtn);

      // Select True/False question type
      const tfTypeRadio = screen.getByLabelText(/صحیح \/ غلط/);
      fireEvent.click(tfTypeRadio);

      // Verify fixed prompt banner is displayed
      expect(screen.getByText(/صورت سؤال ثابت:/)).toBeInTheDocument();

      // Fill statement 1 text
      const stmt1Input = screen.getByPlaceholderText(/متن گزاره ۱ را بنویسید/);
      fireEvent.change(stmt1Input, {
        target: { value: "کتامین ترشح بزاق را مهار می‌کند." },
      });

      // Fill statement 2 text
      const stmt2Input = screen.getByPlaceholderText(/متن گزاره ۲ را بنویسید/);
      fireEvent.change(stmt2Input, {
        target: { value: "مورفین یک آنتاگونیست اپیوئیدی است." },
      });

      // Save question
      const saveQuestionBtn = screen.getByRole("button", { name: "افزودن به آزمون" });
      fireEvent.click(saveQuestionBtn);

      await waitFor(() => {
        expect(createdQuestionPayload).not.toBeNull();
      });

      expect(createdQuestionPayload.questionType).toBe("true_false");
      expect(createdQuestionPayload.prompt).toBe("در مورد گزاره‌های زیر، صحیح یا غلط بودن هر یک را مشخص کنید.");
      expect(createdQuestionPayload.statements).toHaveLength(2);
      expect(createdQuestionPayload.statements[0].text).toBe("کتامین ترشح بزاق را مهار می‌کند.");
      expect(createdQuestionPayload.statements[0].correctAnswer).toBe(true);
      expect(createdQuestionPayload.statements[1].text).toBe("مورفین یک آنتاگونیست اپیوئیدی است.");
      expect(createdQuestionPayload.statements[1].correctAnswer).toBe(false);
    });
  });

  describe("ClassroomExamsTable — Delete Exam Feature & Modal Interaction", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockCurrentUser = { id: "user_teacher", email: "teacher@avana.org", role: "teacher" };
      mockUserMemberships = [{ organization_id: "org_1", role: "teacher" }];
      vi.restoreAllMocks();
    });

    const mockExams = [
      {
        id: "exam_del_100",
        classroomId: "cls_1",
        title: "آزمون فارماکولوژی بالینی",
        description: "مبحث داروهای قلبی عروقی",
        durationMinutes: 45,
        startsAt: "2026-10-10T10:00:00.000Z",
        endsAt: "2026-10-10T11:00:00.000Z",
        status: "draft" as const,
        runtimeState: "upcoming" as const,
        questionsCount: 10,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ];

    it("renders delete button, opens ConfirmModal, and deletes exam successfully", async () => {
      let deleteCalledWithUrl: string | null = null;

      fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        const method = init?.method || "GET";

        if (method === "DELETE" && urlStr.includes("/v1/teacher/exams/exam_del_100")) {
          deleteCalledWithUrl = urlStr;
          return Promise.resolve({
            ok: true,
            status: 204,
            headers: new Headers({ "x-request-id": "req-del-success" }),
            text: () => Promise.resolve(""),
            json: () => Promise.resolve({}),
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "x-request-id": "req-default" }),
          text: () => Promise.resolve("{}"),
          json: () => Promise.resolve({}),
        } as Response);
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ClassroomExamsTable exams={mockExams} isLoading={false} classroomId="cls_1" />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify exam is in table
      expect(screen.getByText("آزمون فارماکولوژی بالینی")).toBeInTheDocument();

      // Click delete button
      const deleteBtn = screen.getByRole("button", { name: "حذف آزمون" });
      expect(deleteBtn).toBeInTheDocument();
      fireEvent.click(deleteBtn);

      // Verify ConfirmModal opens with proper title and warning text
      expect(screen.getByText("حذف آزمون کلاسی")).toBeInTheDocument();
      expect(
        screen.getByText(/آیا از حذف آزمون «آزمون فارماکولوژی بالینی» اطمینان دارید؟/),
      ).toBeInTheDocument();

      // Click confirm button
      const confirmBtn = screen.getByRole("button", { name: "حذف قطعی" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(deleteCalledWithUrl).toContain("/v1/teacher/exams/exam_del_100");
      });

      // ConfirmModal should close on success
      await waitFor(() => {
        expect(screen.queryByText("حذف آزمون کلاسی")).not.toBeInTheDocument();
      });
    });

    it("displays 409 conflict error when exam has attempts and does not close modal", async () => {
      fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method || "GET";

        if (method === "DELETE") {
          return Promise.resolve({
            ok: false,
            status: 409,
            headers: new Headers({ "x-request-id": "req-del-conflict" }),
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  request_id: "req-del-conflict",
                  error: {
                    code: "conflict",
                    message:
                      "آزمون دارای شرکت‌کننده است و امکان حذف آن وجود ندارد. برای خارج کردن آزمون از دسترس، می‌توانید آن را بایگانی کنید.",
                  },
                }),
              ),
            json: () =>
              Promise.resolve({
                request_id: "req-del-conflict",
                error: {
                  code: "conflict",
                  message:
                    "آزمون دارای شرکت‌کننده است و امکان حذف آن وجود ندارد. برای خارج کردن آزمون از دسترس، می‌توانید آن را بایگانی کنید.",
                },
              }),
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("{}"),
          json: () => Promise.resolve({}),
        } as Response);
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ClassroomExamsTable exams={mockExams} isLoading={false} classroomId="cls_1" />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Click delete button
      const deleteBtn = screen.getByRole("button", { name: "حذف آزمون" });
      fireEvent.click(deleteBtn);

      // Confirm delete
      const confirmBtn = screen.getByRole("button", { name: "حذف قطعی" });
      fireEvent.click(confirmBtn);

      // Verify modal stays open and displays Persian error message
      expect(
        await screen.findByText(
          "آزمون دارای شرکت‌کننده است و امکان حذف آن وجود ندارد. برای خارج کردن آزمون از دسترس، می‌توانید آن را بایگانی کنید.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("حذف آزمون کلاسی")).toBeInTheDocument();
      expect(screen.getByText("آزمون فارماکولوژی بالینی")).toBeInTheDocument();
    });
  });

  describe("Teacher Platform — Descriptive Grading & Decimal Precision UI (0.01 step)", () => {
    it("renders descriptive grading input with step 0.01 and submits canonical attemptId and decimal score (0.37)", async () => {
      mockCurrentUser = {
        id: "usr_teacher_1",
        email: "teacher@avana.io",
        role: "teacher",
      };
      mockUserMemberships = [{ organization_id: "org_1", role: "teacher" }];

      const mockExam = {
        id: "exam_100",
        classroomId: "cls_1",
        title: "آزمون فارماکولوژی",
        status: "published",
        startsAt: "2026-03-30T10:00:00.000Z",
        endsAt: "2026-03-30T12:00:00.000Z",
        durationMinutes: 60,
        passingScorePercentage: 50,
      };

      const mockStudentResult = {
        attempt: {
          id: "att_999",
          attemptId: "att_999",
          studentId: "student_10",
          studentName: "سارا حسینی",
          studentEmail: "sara@example.com",
          status: "submitted",
          gradingStatus: "needs_manual_review",
          score: 0,
          maxScore: 1,
          percentage: 0,
          passed: false,
          startedAt: "2026-03-30T10:05:00.000Z",
          submittedAt: "2026-03-30T10:50:00.000Z",
          durationMinutes: 45,
        },
        questions: [
          {
            questionId: "q_desc_1",
            orderIndex: 0,
            questionType: "descriptive",
            prompt: "مکانیسم مهار رقابتی آنزیم را شرح دهید.",
            selectedOptionId: null,
            textAnswer: "مهارکننده با اتصال به جایگاه فعال مانع سوبسترا می‌شود.",
            teacherFeedback: null,
            gradingStatus: "ungraded",
            isCorrect: null,
            pointsEarned: null,
            maxPoints: 1,
          },
        ],
      };

      const putRequests: Array<{ url: string; body: unknown }> = [];

      vi.spyOn(global, "fetch").mockImplementation((url, options) => {
        const urlStr = url.toString();
        const method = options?.method || "GET";

        if (urlStr.includes("/v1/teacher/exams/exam_100/results/student_10")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ result: mockStudentResult })),
            json: () => Promise.resolve({ result: mockStudentResult }),
          } as Response);
        }

        if (urlStr.includes("/v1/teacher/exams/exam_100") && method === "GET") {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ exam: mockExam })),
            json: () => Promise.resolve({ exam: mockExam }),
          } as Response);
        }

        if (method === "PUT" && urlStr.includes("/answers/q_desc_1/grade")) {
          const body = options?.body ? JSON.parse(options.body as string) : {};
          putRequests.push({ url: urlStr, body });

          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  attempt: {
                    ...mockStudentResult.attempt,
                    score: body.pointsEarned,
                    gradingStatus: "fully_graded",
                  },
                  answer: {
                    id: "ans_1",
                    attemptId: "att_999",
                    questionId: "q_desc_1",
                    pointsEarned: body.pointsEarned,
                    gradingStatus: "graded",
                  },
                }),
              ),
            json: () =>
              Promise.resolve({
                attempt: {
                  ...mockStudentResult.attempt,
                  score: body.pointsEarned,
                  gradingStatus: "fully_graded",
                },
                answer: {
                  id: "ans_1",
                  attemptId: "att_999",
                  questionId: "q_desc_1",
                  pointsEarned: body.pointsEarned,
                  gradingStatus: "graded",
                },
              }),
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("{}"),
          json: () => Promise.resolve({}),
        } as Response);
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/teacher/exams/exam_100/results/students/student_10"]}>
            <Routes>
              <Route
                path="/teacher/exams/:examId/results/students/:studentId"
                element={<TeacherStudentResultDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Wait for student prompt to render
      expect(await screen.findByText("مکانیسم مهار رقابتی آنزیم را شرح دهید.")).toBeInTheDocument();
      expect(screen.getAllByText(/سارا حسینی/).length).toBeGreaterThan(0);

      // Find the points input and verify step="0.01" and min="0"
      const pointsInput = screen.getByPlaceholderText("0 تا 1") as HTMLInputElement;
      expect(pointsInput).toBeInTheDocument();
      expect(pointsInput.getAttribute("step")).toBe("0.01");
      expect(pointsInput.getAttribute("min")).toBe("0");
      expect(pointsInput.getAttribute("max")).toBe("1");

      // Enter decimal score (0.37)
      fireEvent.change(pointsInput, { target: { value: "0.37" } });

      // Enter feedback
      const feedbackInput = screen.getByPlaceholderText(
        "مثال: استدلال در بخش دوم کامل نبود...",
      ) as HTMLInputElement;
      fireEvent.change(feedbackInput, { target: { value: "استدلال بخش اول عالی بود." } });

      // Click submit
      const submitBtn = screen.getByRole("button", { name: "ثبت نمره" });
      fireEvent.click(submitBtn);

      // Verify success message appears
      expect(await screen.findByText("نمره با موفقیت ثبت شد.")).toBeInTheDocument();

      // Verify exact PUT request payload and URL containing canonical att_999 (NOT exam_100)
      expect(putRequests).toHaveLength(1);
      expect(putRequests[0].url).toContain(
        "/v1/teacher/exams/exam_100/attempts/att_999/answers/q_desc_1/grade",
      );
      expect(putRequests[0].body).toEqual({
        pointsEarned: 0.37,
        teacherFeedback: "استدلال بخش اول عالی بود.",
      });
    });
  });
