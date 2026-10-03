import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StudentClassroomExamsWidget } from "../components/dashboard/StudentClassroomExamsWidget.js";
import { calculateRuntimeExamState, type StudentExamListDTO } from "@avana/domain";

// Mock AuthProvider
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "student-1", email: "student@example.com", name: "دانشجو" },
    memberships: [{ organization_id: "org-1", role: "student" }],
    isLoading: false,
    error: null,
    signOut: vi.fn(),
  }),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("StudentClassroomExamsWidget — Active Classroom Exams Lifecycle & Widget Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const setupWidgetWithExams = (exams: Partial<StudentExamListDTO>[]) => {
    const fullExams: StudentExamListDTO[] = exams.map((e, idx) => ({
      id: e.id || `exam-${idx}`,
      classroomId: e.classroomId || "cls-1",
      title: e.title || `آزمون شماره ${idx + 1}`,
      description: e.description ?? null,
      durationMinutes: e.durationMinutes ?? 30,
      startsAt: e.startsAt || new Date(Date.now() - 3600000).toISOString(),
      endsAt: e.endsAt || new Date(Date.now() + 3600000).toISOString(),
      passingScorePercentage: e.passingScorePercentage ?? 60,
      showResultsImmediately: e.showResultsImmediately ?? true,
      allowBackNavigation: e.allowBackNavigation ?? true,
      runtimeState: e.runtimeState || "active",
      hasAttempt: e.hasAttempt ?? false,
      attemptStatus: e.attemptStatus ?? null,
      score: e.score ?? null,
      maxScore: e.maxScore ?? null,
      percentage: e.percentage ?? null,
      passed: e.passed ?? null,
    }));

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/v1/student/exams")) {
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ exams: fullExams })),
        } as Response;
      }
      return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
    });

    const qc = createTestQueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <StudentClassroomExamsWidget />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it("Case A: Active exam + student has in_progress attempt renders Resume (ادامه) CTA", async () => {
    setupWidgetWithExams([
      {
        id: "exam-a",
        title: "آزمون فعال در حال انجام",
        runtimeState: "active",
        hasAttempt: true,
        attemptStatus: "in_progress",
      },
    ]);

    expect(await screen.findByText("آزمون فعال در حال انجام")).toBeInTheDocument();
    expect(screen.getByText("در حال انجام")).toBeInTheDocument();
    const resumeBtn = screen.getByRole("button", { name: /ادامه/i });
    expect(resumeBtn).toBeInTheDocument();
    const link = resumeBtn.closest("a");
    expect(link).toHaveAttribute("href", "/classrooms/cls-1/exams/exam-a/take");
  });

  it("Case B: Active exam + student has no attempt renders Start/Take (شرکت) CTA", async () => {
    setupWidgetWithExams([
      {
        id: "exam-b",
        title: "آزمون فعال بدون شرکت",
        runtimeState: "active",
        hasAttempt: false,
        attemptStatus: null,
      },
    ]);

    expect(await screen.findByText("آزمون فعال بدون شرکت")).toBeInTheDocument();
    const takeBtn = screen.getByRole("button", { name: /شرکت/i });
    expect(takeBtn).toBeInTheDocument();
    const link = takeBtn.closest("a");
    expect(link).toHaveAttribute("href", "/classrooms/cls-1/exams/exam-b");
  });

  it("Case C: Expired exam within 24h + student participated renders Results (مشاهده نتیجه) CTA", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    setupWidgetWithExams([
      {
        id: "exam-c",
        title: "آزمون پایان‌یافته با شرکت",
        endsAt: twoHoursAgo,
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "submitted",
        score: 85,
        maxScore: 100,
      },
    ]);

    expect(await screen.findByText("آزمون پایان‌یافته با شرکت")).toBeInTheDocument();
    expect(screen.getByText("پایان یافته")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ادامه/i })).not.toBeInTheDocument();
    const resultBtn = screen.getByRole("button", { name: /مشاهده نتیجه/i });
    expect(resultBtn).toBeInTheDocument();
    const link = resultBtn.closest("a");
    expect(link).toHaveAttribute("href", "/classrooms/cls-1/exams/exam-c/results");
  });

  it("Case D: Expired exam within 24h + student never participated shows Not Participated (شرکت نکرده) badge and View CTA", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    setupWidgetWithExams([
      {
        id: "exam-d",
        title: "آزمون پایان‌یافته بدون شرکت",
        endsAt: twoHoursAgo,
        runtimeState: "closed",
        hasAttempt: false,
        attemptStatus: null,
        score: null,
      },
    ]);

    expect(await screen.findByText("آزمون پایان‌یافته بدون شرکت")).toBeInTheDocument();
    expect(screen.getByText("شرکت نکرده")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ادامه/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^شرکت$/i })).not.toBeInTheDocument();
    const viewBtn = screen.getByRole("button", { name: /مشاهده/i });
    expect(viewBtn).toBeInTheDocument();
    const link = viewBtn.closest("a");
    expect(link).toHaveAttribute("href", "/classrooms/cls-1/exams/exam-d/results");
  });

  it("Case E: Expired exam older than 24 hours is omitted from dashboard widget", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    setupWidgetWithExams([
      {
        id: "exam-e",
        title: "آزمون قدیمی منقضی شده",
        endsAt: twentyFiveHoursAgo,
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "submitted",
      },
    ]);

    // Since there are no other exams and this one is older than 24h, the widget should return null
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("آزمون‌های کلاسی فعال")).not.toBeInTheDocument();
    expect(screen.queryByText("آزمون قدیمی منقضی شده")).not.toBeInTheDocument();
  });

  it("Case F: Exactly at endsAt boundary is strictly evaluated as closed", () => {
    const now = new Date("2026-10-02T12:00:00.000Z");
    const exam = {
      status: "published" as const,
      startsAt: "2026-10-02T10:00:00.000Z",
      endsAt: "2026-10-02T12:00:00.000Z",
      closedAt: null,
    };

    // Exactly at endsAt
    expect(calculateRuntimeExamState(exam, now)).toBe("closed");

    // 1 millisecond before endsAt
    const justBefore = new Date("2026-10-02T11:59:59.999Z");
    expect(calculateRuntimeExamState(exam, justBefore)).toBe("active");

    // 1 millisecond after endsAt
    const justAfter = new Date("2026-10-02T12:00:00.001Z");
    expect(calculateRuntimeExamState(exam, justAfter)).toBe("closed");
  });

  it("Case G: Student started before endsAt but returns after endsAt -> Displays Results CTA, never Resume", async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    setupWidgetWithExams([
      {
        id: "exam-g",
        title: "آزمون منقضی با تلاش قبلی",
        endsAt: fiveMinutesAgo,
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "in_progress", // Server or DB might still have in_progress before auto-finalize
      },
    ]);

    expect(await screen.findByText("آزمون منقضی با تلاش قبلی")).toBeInTheDocument();
    // Must NOT show Resume CTA
    expect(screen.queryByRole("button", { name: /ادامه/i })).not.toBeInTheDocument();
    // Must show Results CTA
    const resultsBtn = screen.getByRole("button", { name: /مشاهده نتیجه/i });
    expect(resultsBtn).toBeInTheDocument();
    expect(resultsBtn.closest("a")).toHaveAttribute(
      "href",
      "/classrooms/cls-1/exams/exam-g/results",
    );
  });

  it("Case H: Non-participated student retains score as null, distinctly separate from score = 0", async () => {
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    setupWidgetWithExams([
      {
        id: "exam-h1",
        title: "دانشجوی غایب",
        endsAt: oneHourAgo,
        runtimeState: "closed",
        hasAttempt: false,
        attemptStatus: null,
        score: null,
      },
      {
        id: "exam-h2",
        title: "دانشجوی نمره صفر",
        endsAt: oneHourAgo,
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "submitted",
        score: 0,
        maxScore: 100,
      },
    ]);

    expect(await screen.findByText("دانشجوی غایب")).toBeInTheDocument();
    expect(screen.getByText("دانشجوی نمره صفر")).toBeInTheDocument();

    // "دانشجوی غایب" has "شرکت نکرده" badge
    expect(screen.getByText("شرکت نکرده")).toBeInTheDocument();

    // "دانشجوی نمره صفر" has "پایان یافته" badge
    expect(screen.getByText("پایان یافته")).toBeInTheDocument();
  });
});

import { Routes, Route } from "react-router-dom";
import { StudentExamResultsPage } from "../pages/student/StudentExamResultsPage.js";
import type { StudentReviewDTO } from "../lib/api/student-platform.js";

describe("StudentExamResultsPage — Not Participated & Result Lifecycle Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const setupResultsPage = ({
    exam,
    review,
    reviewError,
    customError,
  }: {
    exam?: Partial<StudentExamListDTO>;
    review?: Partial<StudentReviewDTO>;
    reviewError?: boolean;
    customError?: {
      status: number;
      body: unknown;
    };
  }) => {
    const defaultExam: StudentExamListDTO = {
      id: "exam-100",
      classroomId: "cls-100",
      title: "آزمون فارماکولوژی بالینی",
      description: null,
      durationMinutes: 30,
      startsAt: new Date(Date.now() - 7200000).toISOString(),
      endsAt: new Date(Date.now() - 3600000).toISOString(),
      passingScorePercentage: 60,
      showResultsImmediately: true,
      allowBackNavigation: true,
      runtimeState: "closed",
      hasAttempt: false,
      attemptStatus: null,
      score: null,
      maxScore: null,
      percentage: null,
      passed: null,
      ...exam,
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/student/classrooms/cls-100/exams")) {
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ exams: [defaultExam] })),
        } as Response;
      }
      if (urlStr.includes("/v1/student/exams/exam-100/review")) {
        if (customError) {
          return {
            ok: false,
            status: customError.status,
            text: () => Promise.resolve(JSON.stringify(customError.body)),
          } as Response;
        }
        if (reviewError) {
          return {
            ok: false,
            status: 500,
            text: () =>
              Promise.resolve(
                JSON.stringify({ error: { code: "internal_error", message: "Server error" } }),
              ),
          } as Response;
        }
        if (review) {
          const fullReview: StudentReviewDTO = {
            id: "att-100",
            examId: "exam-100",
            status: "submitted",
            gradingStatus: "fully_graded",
            submittedAt: new Date().toISOString(),
            resultsReleased: true,
            score: 75,
            maxScore: 100,
            percentage: 75,
            passed: true,
            questions: [],
            ...review,
          };
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ review: fullReview })),
          } as Response;
        }
        return {
          ok: false,
          status: 404,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                error: {
                  code: "not_found",
                  message: "شما هنوز در این آزمون شرکت نکرده‌اید.",
                  details: { reason: "EXAM_NOT_ATTEMPTED" },
                },
              }),
            ),
        } as Response;
      }
      return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
    });

    const qc = createTestQueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/classrooms/cls-100/exams/exam-100/results"]}>
          <Routes>
            <Route
              path="/classrooms/:classroomId/exams/:examId/results"
              element={<StudentExamResultsPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it("1. ended + no attempt -> renders 'شما در این آزمون شرکت نکرده‌اید' empty state with description", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "closed",
        hasAttempt: false,
        attemptStatus: null,
      },
    });

    expect(await screen.findByText("شما در این آزمون شرکت نکرده‌اید")).toBeInTheDocument();
    expect(
      screen.getByText("زمان شرکت در این آزمون به پایان رسیده است و برای شما پاسخی ثبت نشده است."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /بازگشت به کلاس/i })).toBeInTheDocument();
  });

  it("2. ended + no attempt -> score is NOT displayed", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "closed",
        hasAttempt: false,
        attemptStatus: null,
        score: null,
      },
    });

    expect(await screen.findByText("شما در این آزمون شرکت نکرده‌اید")).toBeInTheDocument();
    expect(screen.queryByText(/نمره نهایی/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/درصد کسب‌شده/i)).not.toBeInTheDocument();
  });

  it("3. ended + no attempt -> generic 'اطلاعات کارنامه این آزمون در دسترس نیست...' message is NOT displayed", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "closed",
        hasAttempt: false,
        attemptStatus: null,
      },
    });

    expect(await screen.findByText("شما در این آزمون شرکت نکرده‌اید")).toBeInTheDocument();
    expect(
      screen.queryByText(/اطلاعات کارنامه این آزمون در دسترس نیست/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("کارنامه آزمون یافت نشد")).not.toBeInTheDocument();
  });

  it("4. ended + submitted attempt -> renders real review and score", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "submitted",
        score: 90,
      },
      review: {
        score: 90,
        maxScore: 100,
        percentage: 90,
        passed: true,
        status: "submitted",
        resultsReleased: true,
      },
    });

    expect(await screen.findByText(/کارنامه آزمون «آزمون فارماکولوژی بالینی»/i)).toBeInTheDocument();
    expect(screen.getByText("۹۰")).toBeInTheDocument();
    expect(screen.getByText("۹۰٪")).toBeInTheDocument();
    expect(screen.queryByText("شما در این آزمون شرکت نکرده‌اید")).not.toBeInTheDocument();
  });

  it("5. ended + timed_out attempt -> renders real review with timed_out badge", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "timed_out",
        score: 55,
      },
      review: {
        score: 55,
        maxScore: 100,
        percentage: 55,
        passed: false,
        status: "timed_out",
        resultsReleased: true,
      },
    });

    expect(await screen.findByText(/کارنامه آزمون «آزمون فارماکولوژی بالینی»/i)).toBeInTheDocument();
    expect(screen.getByText("پایان زمان")).toBeInTheDocument();
    expect(screen.getByText("۵۵")).toBeInTheDocument();
    expect(screen.queryByText("شما در این آزمون شرکت نکرده‌اید")).not.toBeInTheDocument();
  });

  it("6. genuine result unavailable (review server error when student participated) -> error state with retry button", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "submitted",
      },
      reviewError: true,
    });

    expect(await screen.findByText("خطا در دریافت نتیجه")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /تلاش مجدد/i })).toBeInTheDocument();
    expect(screen.queryByText("شما در این آزمون شرکت نکرده‌اید")).not.toBeInTheDocument();
  });

  it("7. score = 0 + hasAttempt = true -> renders score 0, does NOT display 'شما در این آزمون شرکت نکرده‌اید'", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "submitted",
        score: 0,
      },
      review: {
        score: 0,
        maxScore: 100,
        percentage: 0,
        passed: false,
        status: "submitted",
        resultsReleased: true,
      },
    });

    expect(await screen.findByText(/کارنامه آزمون «آزمون فارماکولوژی بالینی»/i)).toBeInTheDocument();
    expect(screen.getAllByText("۰").length).toBeGreaterThan(0);
    expect(screen.queryByText("شما در این آزمون شرکت نکرده‌اید")).not.toBeInTheDocument();
  });

  it("8. active exam + no attempt -> renders active exam notice with button to enter exam", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "active",
        hasAttempt: false,
        attemptStatus: null,
      },
    });

    expect(await screen.findByText("آزمون در حال برگزاری است")).toBeInTheDocument();
    expect(
      screen.getByText("شما هنوز در این آزمون شرکت نکرده‌اید. برای شروع آزمون وارد صفحه آزمون شوید."),
    ).toBeInTheDocument();
    const enterBtn = screen.getByRole("button", { name: /ورود به آزمون/i });
    expect(enterBtn).toBeInTheDocument();
    expect(enterBtn.closest("a")).toHaveAttribute("href", "/classrooms/cls-100/exams/exam-100");
  });

  it("9. results unreleased: results_pending_teacher state renders friendly pending notice", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "active",
        hasAttempt: true,
        attemptStatus: "submitted",
      },
      review: {
        resultsReleased: false,
        state: "results_pending_teacher",
        message: "نتیجه آزمون هنوز توسط استاد اعلام نشده است.",
      },
    });

    expect(await screen.findByText("نتیجه آزمون «آزمون فارماکولوژی بالینی»")).toBeInTheDocument();
    expect(screen.getByText("نتیجه آزمون هنوز توسط استاد اعلام نشده است.")).toBeInTheDocument();
    expect(screen.getByText("پاسخ‌ها با موفقیت ثبت شد")).toBeInTheDocument();
  });

  it("10. results unreleased: grading_in_progress state renders grading badge and notice", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "active",
        hasAttempt: true,
        attemptStatus: "submitted",
      },
      review: {
        resultsReleased: false,
        state: "grading_in_progress",
        message: "نتیجه آزمون در حال آماده‌سازی است. لطفاً بعداً دوباره تلاش کنید.",
      },
    });

    expect(await screen.findByText("در حال آماده‌سازی و تصحیح")).toBeInTheDocument();
    expect(screen.getByText("نتیجه آزمون در حال آماده‌سازی است")).toBeInTheDocument();
    expect(
      screen.getByText("نتیجه آزمون در حال آماده‌سازی است. لطفاً بعداً دوباره تلاش کنید."),
    ).toBeInTheDocument();
  });

  it("11. results unreleased: results_unpublished_closed state renders closed unpublished notice", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "submitted",
      },
      review: {
        resultsReleased: false,
        state: "results_unpublished_closed",
        message: "آزمون به پایان رسیده است، اما نتیجه آن هنوز منتشر نشده است.",
      },
    });

    expect(await screen.findByText("نتیجه آزمون هنوز منتشر نشده است")).toBeInTheDocument();
    expect(
      screen.getByText("آزمون به پایان رسیده است، اما نتیجه آن هنوز منتشر نشده است."),
    ).toBeInTheDocument();
    expect(screen.getByText("پایان مهلت آزمون")).toBeInTheDocument();
  });

  it("12. unknown error reason -> renders generic ErrorState + retry, NEVER collapses to known domain state", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "submitted",
      },
      customError: {
        status: 400,
        body: {
          error: {
            code: "bad_request",
            message: "Some weird database failure",
            details: { reason: "UNRECOGNIZED_WEIRD_REASON" },
          },
        },
      },
    });

    expect(await screen.findByText("خطا در دریافت نتیجه")).toBeInTheDocument();
    expect(screen.getByText("دریافت نتیجه آزمون با مشکل مواجه شد. لطفاً دوباره تلاش کنید.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /تلاش مجدد/i })).toBeInTheDocument();
    expect(screen.queryByText("شما در این آزمون شرکت نکرده‌اید")).not.toBeInTheDocument();
    expect(screen.queryByText("آزمون در حال برگزاری است")).not.toBeInTheDocument();
    expect(screen.queryByText("این آزمون دیگر در دسترس نیست")).not.toBeInTheDocument();
  });

  it("13. error with no reason in details -> renders generic ErrorState + retry", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "submitted",
      },
      customError: {
        status: 404,
        body: {
          error: {
            code: "not_found",
            message: "Not found without details",
          },
        },
      },
    });

    expect(await screen.findByText("خطا در دریافت نتیجه")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /تلاش مجدد/i })).toBeInTheDocument();
    expect(screen.queryByText("شما در این آزمون شرکت نکرده‌اید")).not.toBeInTheDocument();
  });

  it("14. ACCESS_DENIED error (403) -> renders dedicated access denied empty state", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "submitted",
      },
      customError: {
        status: 403,
        body: {
          error: {
            code: "forbidden",
            message: "Forbidden",
            details: { reason: "ACCESS_DENIED" },
          },
        },
      },
    });

    expect(await screen.findByText("عدم دسترسی به نتیجه آزمون")).toBeInTheDocument();
    expect(screen.getByText("دسترسی شما به نتیجه این آزمون در حال حاضر امکان‌پذیر نیست.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /بازگشت به کلاس/i })).toBeInTheDocument();
  });

  it("15. EXAM_UNAVAILABLE error (404) -> renders dedicated exam unavailable empty state", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "submitted",
      },
      customError: {
        status: 404,
        body: {
          error: {
            code: "not_found",
            message: "Not found",
            details: { reason: "EXAM_UNAVAILABLE" },
          },
        },
      },
    });

    expect(await screen.findByText("این آزمون دیگر در دسترس نیست")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /بازگشت به کلاس/i })).toBeInTheDocument();
  });

  it("16. RESULT_MISSING error (404) -> renders data missing notice, distinct from unattempted", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "submitted",
      },
      customError: {
        status: 404,
        body: {
          error: {
            code: "not_found",
            message: "Missing snapshot",
            details: { reason: "RESULT_MISSING" },
          },
        },
      },
    });

    expect(await screen.findByText("اطلاعات نتیجه در دسترس نیست")).toBeInTheDocument();
    expect(screen.getByText("اطلاعات نتیجه این آزمون در حال حاضر در دسترس نیست.")).toBeInTheDocument();
    expect(screen.queryByText("شما در این آزمون شرکت نکرده‌اید")).not.toBeInTheDocument();
  });

  it("17. ATTEMPT_IN_PROGRESS error (400) -> renders in progress notice with resume CTA", async () => {
    setupResultsPage({
      exam: {
        runtimeState: "active",
        hasAttempt: true,
        attemptStatus: "in_progress",
      },
      customError: {
        status: 400,
        body: {
          error: {
            code: "bad_request",
            message: "In progress",
            details: { reason: "ATTEMPT_IN_PROGRESS" },
          },
        },
      },
    });

    expect(await screen.findByText("آزمون شما هنوز پایان نیافته است")).toBeInTheDocument();
    expect(screen.getByText("شما یک تلاش ناتمام در این آزمون دارید. برای تکمیل آزمون وارد صفحه پاسخ‌دهی شوید.")).toBeInTheDocument();
    const resumeBtn = screen.getByRole("button", { name: /ادامه آزمون/i });
    expect(resumeBtn).toBeInTheDocument();
    expect(resumeBtn.closest("a")).toHaveAttribute("href", "/classrooms/cls-100/exams/exam-100/take");
  });
});
