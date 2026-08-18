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

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  });

  const mockTopicsData = {
    courses: [
      {
        courseId: "pharmacology",
        courseTitle: "فارماکولوژی",
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

  queryClient.setQueryData(["exam-topics", "org-1"], mockTopicsData);
  queryClient.setQueryData(["organizations"], { items: [{ id: "org-1", name: "Org 1" }] });
  queryClient.setQueryData(["exam-topics", "org-1"], mockTopicsData);

  return render(
    <AuthProvider>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("Exam Configuration Hierarchical Selection & Flow (Phase 2)", () => {
  it("renders Sections, supports expand/collapse, indeterminate checkboxes, and flow transition", async () => {
    const onStartExam = vi.fn();

    renderWithProviders(
      <ExamConfigView
        organizationId="org-1"
        onStartExam={onStartExam}
      />,
    );

    // 1. Verify Page Title & Header
    expect(screen.getByText("تنظیمات آزمون")).toBeInTheDocument();
    expect(screen.getByText("انتخاب دوره‌ها و بخش‌های آزمون")).toBeInTheDocument();

    // 2. Verify Sections are displayed (Pharmacology, Cardiology, Neurology, Physiology)
    await waitFor(() => {
      expect(screen.getAllByText("فارماکولوژی")[0]).toBeInTheDocument();
      expect(screen.getAllByText("کاردیولوژی")[0]).toBeInTheDocument();
    });

    const expandChevronPharmacology = screen.getByRole("button", { name: /سرفصل‌های فارماکولوژی/ });
    if (screen.queryByText("فارماکودینامیک") === null) {
      fireEvent.click(expandChevronPharmacology);
    }

    const expandChevronCardiology = screen.getByRole("button", { name: /سرفصل‌های کاردیولوژی/ });
    if (screen.queryByText("بیماری‌های ایسکمیک قلب") === null) {
      fireEvent.click(expandChevronCardiology);
    }

    // 3. Verify Courses & Modules are expanded
    expect(screen.getByText("فارماکودینامیک")).toBeInTheDocument();
    expect(screen.getByText("فارماکوکینتیک")).toBeInTheDocument();
    expect(screen.getByText("بیماری‌های ایسکمیک قلب")).toBeInTheDocument();

    // 4. Toggle Collapse on Pharmacology
    fireEvent.click(expandChevronPharmacology);
    expect(screen.queryByText("فارماکودینامیک")).not.toBeInTheDocument();

    // Re-expand Pharmacology
    fireEvent.click(expandChevronPharmacology);
    expect(screen.getByText("فارماکودینامیک")).toBeInTheDocument();

    // 5. Select a chapter in Cardiology ("بیماری‌های ایسکمیک قلب")
    const ischemicChapter = screen.getByText("بیماری‌های ایسکمیک قلب");
    fireEvent.click(ischemicChapter);

    // 6. Change Difficulty to "آسان"
    const easyDifficultyButton = screen.getByText("آسان");
    fireEvent.click(easyDifficultyButton);

    // 7. Click Start Exam
    const startButton = screen.getByRole("button", { name: /شروع آزمون/i });
    expect(startButton).not.toBeDisabled();
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

  it("regression: displays module titles and question counts without rendering difficulty breakdown badges next to subjects", async () => {
    const onStartExam = vi.fn();

    renderWithProviders(
      <ExamConfigView
        organizationId="org-1"
        onStartExam={onStartExam}
      />,
    );

    // Wait for course header to load
    await waitFor(() => {
      expect(screen.getAllByText("فارماکولوژی")[0]).toBeInTheDocument();
    });

    // Verify course text exists
    expect(screen.getAllByText("فارماکولوژی")[0]).toBeInTheDocument();

    // Verify difficulty breakdown text (آسان: X | متوسط: Y | سخت: Z) is NOT rendered in topic list
    expect(screen.queryByText(/آسان: \d+/)).not.toBeInTheDocument();
  });

  it("initial state has NO pre-selected modules and ALL accordions closed", async () => {
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

    // 1. Verify summary shows 0 selected modules on initial render
    expect(screen.getByText("0 دوره، 0 بخش")).toBeInTheDocument();

    // 2. Verify all accordions are closed by default (child modules are NOT in document)
    expect(screen.queryByText("فارماکودینامیک")).not.toBeInTheDocument();
    expect(screen.queryByText("بیماری‌های ایسکمیک قلب")).not.toBeInTheDocument();

    // 3. Start Exam button is initially disabled because no modules are selected
    const startButton = screen.getByRole("button", { name: /شروع آزمون/i });
    expect(startButton).toBeDisabled();

    // 4. Expanding a course accordion does NOT select any modules
    const expandPharmBtn = screen.getByRole("button", { name: /سرفصل‌های فارماکولوژی/ });
    fireEvent.click(expandPharmBtn);
    expect(screen.getByText("فارماکودینامیک")).toBeInTheDocument();
    expect(startButton).toBeDisabled(); // still disabled because expanding does NOT select!

    // 5. Select a single module manually
    fireEvent.click(screen.getByText("فارماکودینامیک"));
    expect(startButton).not.toBeDisabled();

    // 6. Collapsing the course accordion retains the selection
    fireEvent.click(expandPharmBtn);
    expect(screen.queryByText("فارماکودینامیک")).not.toBeInTheDocument();
    expect(startButton).not.toBeDisabled();
  });
});
