import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { AdminLayout } from "../components/shell/AdminLayout.js";
import { AdminTeachersPage } from "../pages/admin/AdminTeachersPage.js";
import type { AdminTeacherOverview, AdminTeachersList } from "../lib/api/admin.js";

const mockTeachersList: AdminTeachersList = {
  teachers: [
    {
      id: "teacher-1",
      name: "دکتر سهراب سپهری",
      email: "sohrab@avana.test",
      role: "teacher",
      teacherStatus: "approved",
      emailVerified: true,
      createdAt: "2026-01-15T10:00:00.000Z",
      lastActiveAt: "2026-02-05T10:00:00.000Z",
      classroomsCount: 3,
      examsCount: 5,
      studentsCount: 42,
    },
    {
      id: "teacher-2",
      name: "استاد مریم میرزاخانی",
      email: "maryam@avana.test",
      role: "teacher",
      teacherStatus: "pending",
      emailVerified: false,
      createdAt: "2026-02-01T12:00:00.000Z",
      lastActiveAt: "2026-02-05T10:00:00.000Z",
      classroomsCount: 1,
      examsCount: 2,
      studentsCount: 15,
    },
  ],
  totalCount: 2,
  stats: {
    totalTeachers: 2,
    totalClassrooms: 4,
    totalExams: 7,
    totalStudents: 57,
  },
};

const mockTeacherOverview: AdminTeacherOverview = {
  teacher: {
    id: "teacher-1",
    name: "دکتر سهراب سپهری",
    email: "sohrab@avana.test",
    role: "teacher",
    teacherStatus: "approved",
    emailVerified: true,
    createdAt: "2026-01-15T10:00:00.000Z",
    lastActiveAt: "2026-02-05T10:00:00.000Z",
  },
  stats: {
    classroomsCount: 2,
    examsCount: 1,
    studentsCount: 42,
    attemptsCount: 20,
  },
  classrooms: [
    {
      id: "cls-1",
      title: "شعر معاصر و صنایع ادبی",
      description: "بررسی سبک‌های ادبیات معاصر",
      inviteCode: "LIT101",
      status: "active",
      createdAt: "2026-01-16T10:00:00.000Z",
      courseId: null,
      courseTitle: null,
      membersCount: 20,
      examsCount: 1,
    },
    {
      id: "cls-2",
      title: "کارگاه نگارش خلاق",
      description: null,
      inviteCode: "WRIT202",
      status: "active",
      createdAt: "2026-01-20T10:00:00.000Z",
      courseId: null,
      courseTitle: null,
      membersCount: 22,
      examsCount: 0,
    },
  ],
  exams: [
    {
      id: "exam-1",
      classroomId: "cls-1",
      classroomTitle: "شعر معاصر و صنایع ادبی",
      title: "آزمون میان‌ترم ادبیات",
      status: "published",
      durationMinutes: 60,
      startsAt: "2026-02-05T09:00:00.000Z",
      endsAt: "2026-02-05T10:00:00.000Z",
      questionsCount: 40,
      attemptsCount: 20,
      averageScore: 82.5,
    },
  ],
  recentActivity: [
    {
      attemptId: "att-1",
      studentId: "stu-1",
      studentName: "علی رضایی",
      studentEmail: "ali@avana.test",
      examId: "exam-1",
      examTitle: "آزمون میان‌ترم ادبیات",
      classroomTitle: "شعر معاصر و صنایع ادبی",
      status: "submitted",
      score: 85,
      maxScore: 100,
      percentage: 85,
      passed: true,
      startedAt: "2026-02-05T09:00:00.000Z",
      submittedAt: "2026-02-05T09:45:00.000Z",
    },
  ],
};

function createMockFetch(customHandler?: (url: string) => Response | null) {
  return vi.fn().mockImplementation((url: string) => {
    const urlStr = url.toString();

    if (customHandler) {
      const customRes = customHandler(urlStr);
      if (customRes) return Promise.resolve(customRes);
    }

    // Auth mock (/v1/me)
    if (urlStr.includes("/v1/me")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            request_id: "req-auth",
            user: {
              id: "admin-1",
              email: "admin@avana.test",
              name: "مدیر ارشد پلتفرم",
              role: "platform_admin",
              emailVerified: true,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    // Teacher Overview mock (GET /v1/admin/teachers/:id)
    if (urlStr.includes("/v1/admin/teachers/teacher-1")) {
      return Promise.resolve(
        new Response(JSON.stringify(mockTeacherOverview), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    // Teacher Approve / Reject endpoints
    if (urlStr.includes("/approve")) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, status: "approved" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    if (urlStr.includes("/reject")) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, status: "rejected" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    // Teachers List mock (GET /v1/admin/teachers)
    if (urlStr.includes("/v1/admin/teachers")) {
      return Promise.resolve(
        new Response(JSON.stringify(mockTeachersList), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    return Promise.resolve(
      new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
}

function renderAdminTeachersPage(initialEntries = ["/admin/teachers"]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route path="teachers" element={<AdminTeachersPage />} />
            </Route>
            <Route
              path="/teacher"
              element={<div data-testid="teacher-panel">پنل استاد</div>}
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Admin Teachers Management Workspace", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Admin Teachers workspace within AdminLayout with active sidebar nav and breadcrumbs", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(createMockFetch());

    renderAdminTeachersPage();

    // Verify page header
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "مدیریت اساتید" })).toBeInTheDocument();
    });

    // Verify breadcrumbs
    const breadcrumbs = screen.getByLabelText("مسیر راهنما");
    expect(breadcrumbs).toBeInTheDocument();
    expect(breadcrumbs).toHaveTextContent("پنل مدیریت");
    expect(breadcrumbs).toHaveTextContent("مدیریت اساتید");

    // Verify header action linking to teacher experience
    const teacherPanelLink = screen.getByRole("link", { name: /ورود به پنل استاد/i });
    expect(teacherPanelLink).toHaveAttribute("href", "/teacher");

    // Verify KPI summary cards
    expect(screen.getByText("کل اساتید")).toBeInTheDocument();
    expect(screen.getByText("کلاس‌ها")).toBeInTheDocument();
    expect(screen.getByText("آزمون‌ها")).toBeInTheDocument();
    expect(screen.getByText("دانشجویان")).toBeInTheDocument();
  });

  it("renders teachers table with real aggregated data", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(createMockFetch());

    renderAdminTeachersPage();

    // Wait for table to load
    await waitFor(() => {
      expect(screen.getByText("دکتر سهراب سپهری")).toBeInTheDocument();
      expect(screen.getByText("sohrab@avana.test")).toBeInTheDocument();
      expect(screen.getByText("استاد مریم میرزاخانی")).toBeInTheDocument();
      expect(screen.getByText("maryam@avana.test")).toBeInTheDocument();
    });

    // Check status badges
    expect(screen.getAllByText("تأیید شده").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("در انتظار تأیید").length).toBeGreaterThanOrEqual(1);
  });

  it("handles search input filtering", async () => {
    const fetchMock = createMockFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    renderAdminTeachersPage();

    await waitFor(() => {
      expect(screen.getByText("دکتر سهراب سپهری")).toBeInTheDocument();
    });

    // Enter search query
    const searchInput = screen.getByPlaceholderText(/جستجو با نام یا ایمیل استاد/i);
    fireEvent.change(searchInput, { target: { value: "سهراب" } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("search="),
        expect.any(Object),
      );
    });
  });

  it("handles status filter changes", async () => {
    const fetchMock = createMockFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    renderAdminTeachersPage();

    // Wait for initial render to complete
    await waitFor(() => {
      expect(screen.getByText("دکتر سهراب سپهری")).toBeInTheDocument();
    });

    // Change status filter select
    const statusSelect = screen.getByLabelText("فیلتر وضعیت حساب");
    fireEvent.change(statusSelect, { target: { value: "approved" } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("status=approved"),
        expect.any(Object),
      );
    });
  });

  it("opens TeacherDetailsDrawer on row click and navigates between all 4 tabs", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(createMockFetch());

    renderAdminTeachersPage();

    // Wait for table and click on teacher row
    await waitFor(() => {
      expect(screen.getByText("دکتر سهراب سپهری")).toBeInTheDocument();
    });

    const teacherRow = screen.getByText("دکتر سهراب سپهری").closest("tr");
    expect(teacherRow).not.toBeNull();
    if (teacherRow) {
      fireEvent.click(teacherRow);
    }

    // Drawer opens and loads overview data
    await waitFor(() => {
      const drawer = screen.getByRole("dialog", { name: "جزئیات و پرونده مدیریتی استاد" });
      expect(drawer).toBeInTheDocument();
      expect(within(drawer).getByText("مشخصات حساب کاربری")).toBeInTheDocument();
    });

    const getDrawer = () => screen.getByRole("dialog", { name: "جزئیات و پرونده مدیریتی استاد" });

    // Tab 1: Profile information
    expect(within(getDrawer()).getAllByText("sohrab@avana.test").length).toBeGreaterThanOrEqual(1);

    // Switch to Tab 2: Classrooms
    const classroomsTab = within(getDrawer()).getByTestId("tab-classrooms");
    fireEvent.click(classroomsTab);

    await waitFor(() => {
      expect(within(getDrawer()).getByText("شعر معاصر و صنایع ادبی")).toBeInTheDocument();
      expect(within(getDrawer()).getByText("LIT101")).toBeInTheDocument();
      expect(within(getDrawer()).getByText("کارگاه نگارش خلاق")).toBeInTheDocument();
    });

    // Switch to Tab 3: Exams
    const examsTab = within(getDrawer()).getByTestId("tab-exams");
    fireEvent.click(examsTab);

    await waitFor(() => {
      expect(within(getDrawer()).getByText("آزمون میان‌ترم ادبیات")).toBeInTheDocument();
      expect(within(getDrawer()).getByText(/۶۰ دقیقه/)).toBeInTheDocument();
    });

    // Switch to Tab 4: Activities and results
    const activitiesTab = within(getDrawer()).getByTestId("tab-activity");
    fireEvent.click(activitiesTab);

    await waitFor(() => {
      expect(within(getDrawer()).getByText("علی رضایی")).toBeInTheDocument();
      expect(within(getDrawer()).getByText("۸۵٪")).toBeInTheDocument();
    });

    // Close drawer
    const closeBtn = within(getDrawer()).getByLabelText("بستن پنجره");
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "جزئیات و پرونده مدیریتی استاد" })).not.toBeInTheDocument();
    });
  });

  it("renders empty state when no teachers match the search criteria", async () => {
    const fetchMock = createMockFetch((url) => {
      if (url.includes("/v1/admin/teachers")) {
        return new Response(
          JSON.stringify({
            teachers: [],
            totalCount: 0,
            stats: {
              totalTeachers: 0,
              totalClassrooms: 0,
              totalExams: 0,
              totalStudents: 0,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return null;
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    renderAdminTeachersPage();

    await waitFor(() => {
      expect(screen.getByText("هنوز استادی در سیستم ثبت نشده است.")).toBeInTheDocument();
    });
  });

  it("renders error state when API request fails", async () => {
    const fetchMock = createMockFetch((url) => {
      if (url.includes("/v1/admin/teachers")) {
        return new Response(
          JSON.stringify({
            error: { code: "internal_error", message: "Database connection failed" },
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
      return null;
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    renderAdminTeachersPage();

    await waitFor(() => {
      expect(screen.getByText("خطا در برقراری ارتباط با سرور")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "تلاش مجدد" })).toBeInTheDocument();
    });
  });

  it("handles approving a pending teacher directly from table action", async () => {
    const fetchMock = createMockFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    renderAdminTeachersPage();

    await waitFor(() => {
      expect(screen.getByText("استاد مریم میرزاخانی")).toBeInTheDocument();
    });

    // Find the approve button on the teacher-2 row
    const approveBtn = screen.getByTestId("approve-teacher-teacher-2");
    expect(approveBtn).toBeInTheDocument();
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/admin/teachers/teacher-2/approve"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("handles rejecting a teacher via rejection confirmation modal", async () => {
    const fetchMock = createMockFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    renderAdminTeachersPage();

    await waitFor(() => {
      expect(screen.getByText("دکتر سهراب سپهری")).toBeInTheDocument();
    });

    // Click reject button on teacher-1
    const rejectBtn = screen.getByTestId("reject-teacher-teacher-1");
    expect(rejectBtn).toBeInTheDocument();
    fireEvent.click(rejectBtn);

    // Modal should open
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "تأیید رد استاد" })).toBeInTheDocument();
    });

    // Enter rejection reason
    const reasonInput = screen.getByLabelText(/دلیل رد/i);
    fireEvent.change(reasonInput, { target: { value: "عدم تطابق مدارک" } });

    // Submit confirmation
    const confirmBtn = screen.getByTestId("confirm-reject-btn");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/admin/teachers/teacher-1/reject"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ reason: "عدم تطابق مدارک" }),
        }),
      );
    });
  });

  it("handles approving/rejecting from inside the TeacherDetailsDrawer", async () => {
    const fetchMock = createMockFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    renderAdminTeachersPage();

    // Open drawer by clicking on teacher row
    await waitFor(() => {
      expect(screen.getByText("دکتر سهراب سپهری")).toBeInTheDocument();
    });

    const teacherRow = screen.getByText("دکتر سهراب سپهری").closest("tr");
    if (teacherRow) fireEvent.click(teacherRow);

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "جزئیات و پرونده مدیریتی استاد" })).toBeInTheDocument();
    });

    const drawer = screen.getByRole("dialog", { name: "جزئیات و پرونده مدیریتی استاد" });

    // Click reject button in drawer
    const drawerRejectBtn = within(drawer).getByTestId("drawer-reject-btn");
    fireEvent.click(drawerRejectBtn);

    // Rejection confirm modal in drawer opens
    await waitFor(() => {
      expect(screen.getByTestId("confirm-reject-drawer-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("confirm-reject-drawer-btn"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/admin/teachers/teacher-1/reject"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
