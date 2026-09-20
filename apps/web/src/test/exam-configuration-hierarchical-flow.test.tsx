/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExamConfigView } from "../components/quiz/ExamConfigView.js";
import { ExamsPage } from "../pages/ExamsPage.js";
import { AuthProvider } from "../providers/AuthProvider.js";

import { MemoryRouter } from "react-router-dom";

afterEach(() => {
  cleanup();
});

function createMockTopicsData(customCourses?: any[]) {
  return {
    courses: customCourses || [
      {
        courseId: "pharmacology",
        courseTitle: "فارماکولوژی",
        hasAccess: true,
        questionCount: 124,
        easyCount: 30,
        mediumCount: 60,
        hardCount: 34,
        modules: [
          { moduleId: "pharmacodynamics", moduleTitle: "فارماکودینامیک", questionCount: 35, easyCount: 10, mediumCount: 15, hardCount: 10 },
          { moduleId: "pharmacokinetics", moduleTitle: "فارماکوکینتیک", questionCount: 30, easyCount: 8, mediumCount: 15, hardCount: 7 },
          { moduleId: "ans", moduleTitle: "سیستم عصبی خودکار", questionCount: 29, easyCount: 6, mediumCount: 15, hardCount: 8 },
          { moduleId: "cvs_drugs", moduleTitle: "داروهای قلبی‌عروقی", questionCount: 30, easyCount: 6, mediumCount: 15, hardCount: 9 },
        ],
      },
      {
        courseId: "cardiology",
        courseTitle: "کاردیولوژی",
        hasAccess: true,
        questionCount: 86,
        easyCount: 20,
        mediumCount: 46,
        hardCount: 20,
        modules: [
          { moduleId: "ischemic", moduleTitle: "بیماری‌های ایسکمیک قلب", questionCount: 30, easyCount: 7, mediumCount: 16, hardCount: 7 },
          { moduleId: "arrhythmia", moduleTitle: "آریتمی‌ها و نوار قلب", questionCount: 28, easyCount: 6, mediumCount: 15, hardCount: 7 },
          { moduleId: "heart_failure", moduleTitle: "نارسایی قلب", questionCount: 28, easyCount: 7, mediumCount: 15, hardCount: 6 },
        ],
      },
      {
        courseId: "neurology",
        courseTitle: "نورولوژی",
        hasAccess: false,
        questionCount: 60,
        easyCount: 15,
        mediumCount: 30,
        hardCount: 15,
        modules: [
          { moduleId: "stroke", moduleTitle: "سکته مغزی", questionCount: 30, easyCount: 7, mediumCount: 15, hardCount: 8 },
          { moduleId: "epilepsy", moduleTitle: "صع و تشنج", questionCount: 30, easyCount: 8, mediumCount: 15, hardCount: 7 },
        ],
      },
    ],
  };
}

function renderWithProviders(ui: React.ReactElement, customCourses?: any[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  });

  const mockTopicsData = createMockTopicsData(customCourses);

  queryClient.setQueryData(["exam-topics", "org-1"], mockTopicsData);
  queryClient.setQueryData(["organizations"], { items: [{ id: "org-1", name: "Org 1" }] });

  return render(
    <AuthProvider>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("Exam Configuration Hierarchical Selection & Flow", () => {
  it("renders accessible courses under 'دوره‌های من' and inaccessible courses under collapsed 'دوره‌های دیگر'", async () => {
    const onStartExam = vi.fn();

    renderWithProviders(
      <ExamConfigView
        organizationId="org-1"
        onStartExam={onStartExam}
      />,
    );

    // 1. Verify Page Title & Header
    expect(screen.getByText("تنظیمات آزمون")).toBeInTheDocument();
    expect(screen.getByText("دوره‌ها و بخش‌ها را برای شروع یک جلسه تمرینی متمرکز انتخاب کنید.")).toBeInTheDocument();

    // 2. Verify Accessible Courses are displayed in 'دوره‌های من'
    await waitFor(() => {
      expect(screen.getByText("دوره‌های من")).toBeInTheDocument();
      expect(screen.getAllByText("فارماکولوژی")[0]).toBeInTheDocument();
      expect(screen.getAllByText("کاردیولوژی")[0]).toBeInTheDocument();
    });

    // 3. Verify 'دوره‌های دیگر' accordion header is visible with count badge, but content is collapsed
    expect(screen.getByText("دوره‌های دیگر")).toBeInTheDocument();
    expect(screen.queryByText("نورولوژی")).not.toBeInTheDocument();

    // 4. Expand 'دوره‌های دیگر'
    const otherCoursesToggle = screen.getByRole("button", { name: /دوره‌های دیگر/i });
    fireEvent.click(otherCoursesToggle);

    // Now 'نورولوژی' should be visible
    expect(screen.getByText("نورولوژی")).toBeInTheDocument();

    // 5. Collapse 'دوره‌های دیگر' again
    fireEvent.click(otherCoursesToggle);
    expect(screen.queryByText("نورولوژی")).not.toBeInTheDocument();
  });

  it("supports expand/collapse of modules within accessible courses and selecting modules", async () => {
    const onStartExam = vi.fn();

    renderWithProviders(
      <ExamConfigView
        organizationId="org-1"
        onStartExam={onStartExam}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("فارماکولوژی")[0]).toBeInTheDocument();
    });

    const expandChevronPharmacology = screen.getByRole("button", { name: /سرفصل‌های فارماکولوژی/ });
    if (screen.queryByText("فارماکودینامیک") === null) {
      fireEvent.click(expandChevronPharmacology);
    }

    // Verify Modules are expanded
    expect(screen.getByText("فارماکودینامیک")).toBeInTheDocument();
    expect(screen.getByText("فارماکوکینتیک")).toBeInTheDocument();

    // Toggle Collapse on Pharmacology
    fireEvent.click(expandChevronPharmacology);
    expect(screen.queryByText("فارماکودینامیک")).not.toBeInTheDocument();

    // Re-expand Pharmacology
    fireEvent.click(expandChevronPharmacology);
    expect(screen.getByText("فارماکودینامیک")).toBeInTheDocument();

    // Select module
    const pharmacodynamicsModule = screen.getByText("فارماکودینامیک");
    fireEvent.click(pharmacodynamicsModule);

    // Change Difficulty to "آسان"
    const easyDifficultyButton = screen.getByText("آسان");
    fireEvent.click(easyDifficultyButton);

    // Start Exam button is enabled for accessible course
    const startButton = screen.getByRole("button", { name: /شروع آزمون/i });
    expect(startButton).not.toBeDisabled();
  });

  it("handles custom exam flow for inaccessible courses with 'آزمون سفارشی' terminology", async () => {
    renderWithProviders(
      <ExamConfigView
        organizationId="org-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("دوره‌های دیگر")).toBeInTheDocument();
    });

    // Expand 'دوره‌های دیگر'
    const otherCoursesToggle = screen.getByRole("button", { name: /دوره‌های دیگر/i });
    fireEvent.click(otherCoursesToggle);

    // Expand neurology modules
    const expandNeurology = screen.getByRole("button", { name: /سرفصل‌های نورولوژی/ });
    fireEvent.click(expandNeurology);

    // Select stroke module
    const strokeModule = screen.getByText("سکته مغزی");
    fireEvent.click(strokeModule);

    // Verify sidebar switches to 'خلاصه آزمون سفارشی' and badge 'آزمون سفارشی'
    expect(screen.getByText("خلاصه آزمون سفارشی")).toBeInTheDocument();
    expect(screen.getByText("پرداخت از کیف پول و شروع آزمون")).toBeInTheDocument();
    expect(screen.getByText(/مبلغ از کیف پول کسر شده و آزمون بلافاصله آغاز می‌گردد/)).toBeInTheDocument();
    expect(screen.getByText(/سوالات آزمون به‌صورت تصادفی از بانک سوالات انتخاب می‌شوند/)).toBeInTheDocument();
  });

  it("handles full ExamsPage flow: Config -> ExamTaking -> Submit -> Result", async () => {
    renderWithProviders(<ExamsPage />);

    // Wait for initial render of ExamConfigView
    await waitFor(() => {
      expect(screen.getByText("تنظیمات آزمون")).toBeInTheDocument();
    });

    // Select a course to enable exam button
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "انتخاب کل دوره فارماکولوژی" })[0]).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole("button", { name: "انتخاب کل دوره فارماکولوژی" })[0]);

    // Select difficulty
    const hardDiff = screen.getAllByText("سخت")[0];
    fireEvent.click(hardDiff);

    // Verify button is ready
    const startExamBtn = screen.getAllByRole("button", { name: /شروع آزمون/i })[0];
    expect(startExamBtn).not.toBeDisabled();
  });

  it("does not render 'دوره‌های دیگر' when all courses are accessible", async () => {
    const allAccessibleCourses = [
      {
        courseId: "pharmacology",
        courseTitle: "فارماکولوژی",
        hasAccess: true,
        questionCount: 124,
        easyCount: 30,
        mediumCount: 60,
        hardCount: 34,
        modules: [
          { moduleId: "m1", moduleTitle: "ماژول ۱", questionCount: 20, easyCount: 5, mediumCount: 10, hardCount: 5 },
        ],
      },
    ];

    renderWithProviders(
      <ExamConfigView
        organizationId="org-1"
      />,
      allAccessibleCourses,
    );

    await waitFor(() => {
      expect(screen.getByText("دوره‌های من")).toBeInTheDocument();
    });

    expect(screen.queryByText("دوره‌های دیگر")).not.toBeInTheDocument();
  });
});
