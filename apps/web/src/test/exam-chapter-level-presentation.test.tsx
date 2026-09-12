/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExamConfigView } from "../components/quiz/ExamConfigView.js";
import { AuthProvider } from "../providers/AuthProvider.js";
import { MemoryRouter } from "react-router-dom";
import * as studyApiModule from "../lib/api/study.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Pre-Exam Configuration Chapter-Level Presentation & Lesson Ownership Invariant", () => {
  it("displays questions grouped at Chapter level without splitting under Lessons or showing sessions list", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
      },
    });

    // Mock scenario 1: Chapter A has 3 lessons with split questions
    // Mock scenario 2: Chapter B has all questions under lesson 1
    const mockTopicsData = {
      courses: [
        {
          courseId: "course-pharm",
          courseTitle: "فارماکولوژی جامع",
          questionCount: 75,
          modules: [
            {
              moduleId: "mod-autonomic",
              moduleTitle: "سیستم عصبی خودکار",
              questionCount: 45,
              lessons: [
                { lessonId: "les-cholinergic", lessonTitle: "جلسه اول: داروهای کولینرژیک", questionCount: 15 },
                { lessonId: "les-adrenergic", lessonTitle: "جلسه دوم: داروهای آدرنرژیک", questionCount: 15 },
                { lessonId: "les-antagonist", lessonTitle: "جلسه سوم: آنتاگونیست‌ها", questionCount: 15 },
              ],
            },
            {
              moduleId: "mod-cardio",
              moduleTitle: "داروهای قلبی‌عروقی",
              questionCount: 30,
              lessons: [
                { lessonId: "les-session-1", lessonTitle: "جلسه اول: کلیات دارویی", questionCount: 30 },
              ],
            },
          ],
        },
      ],
    };

    queryClient.setQueryData(["exam-topics", "org-test"], mockTopicsData);

    const onStartExam = vi.fn();

    render(
      <AuthProvider>
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>
            <ExamConfigView organizationId="org-test" onStartExam={onStartExam} />
          </QueryClientProvider>
        </MemoryRouter>
      </AuthProvider>,
    );

    // 1. Wait for Course header to render
    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی جامع")).toBeInTheDocument();
    });

    // Expand Course accordion
    const expandCourseBtn = screen.getByRole("button", { name: /سرفصل‌های فارماکولوژی جامع/ });
    fireEvent.click(expandCourseBtn);

    // 2. Invariant 1: Chapters (Modules) are displayed directly under Course with their aggregated question counts
    expect(screen.getByText("سیستم عصبی خودکار")).toBeInTheDocument();
    expect(screen.getByText("45 سؤال")).toBeInTheDocument();

    expect(screen.getByText("داروهای قلبی‌عروقی")).toBeInTheDocument();
    expect(screen.getByText("30 سؤال")).toBeInTheDocument();

    // 3. Invariant 2: Child Lessons are NOT rendered in the UI (neither split lessons nor single lesson 1)
    expect(screen.queryByText("جلسه اول: داروهای کولینرژیک")).not.toBeInTheDocument();
    expect(screen.queryByText("جلسه دوم: داروهای آدرنرژیک")).not.toBeInTheDocument();
    expect(screen.queryByText("جلسه سوم: آنتاگونیست‌ها")).not.toBeInTheDocument();
    expect(screen.queryByText("جلسه اول: کلیات دارویی")).not.toBeInTheDocument();

    // 4. Invariant 3: No expand/collapse chevrons for lessons exist inside modules
    expect(screen.queryByRole("button", { name: /نمایش جلسات/ })).not.toBeInTheDocument();
  });

  it("selects Chapter directly and preserves domain question-to-lesson ownership in startExamAttempt payload", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
      },
    });

    const mockTopicsData = {
      courses: [
        {
          courseId: "course-pharm",
          courseTitle: "فارماکولوژی جامع",
          questionCount: 65,
          modules: [
            {
              moduleId: "mod-autonomic",
              moduleTitle: "سیستم عصبی خودکار",
              questionCount: 45,
              lessons: [
                { lessonId: "les-cholinergic-1", lessonTitle: "درس ۱", questionCount: 15 },
                { lessonId: "les-adrenergic-2", lessonTitle: "درس ۲", questionCount: 15 },
                { lessonId: "les-antagonist-3", lessonTitle: "درس ۳", questionCount: 15 },
              ],
            },
            {
              moduleId: "mod-other",
              moduleTitle: "فصل دوم",
              questionCount: 20,
              lessons: [
                { lessonId: "les-other-1", lessonTitle: "درس ۴", questionCount: 20 },
              ],
            },
          ],
        },
      ],
    };

    queryClient.setQueryData(["exam-topics", "org-test"], mockTopicsData);

    const mockStartExamResult = {
      attemptId: "att-123",
      questions: [
        { id: "q1", question: "سوال ۱", lessonId: "les-cholinergic-1", topic: "درس ۱" },
        { id: "q2", question: "سوال ۲", lessonId: "les-adrenergic-2", topic: "درس ۲" },
        { id: "q3", question: "سوال ۳", lessonId: "les-antagonist-3", topic: "درس ۳" },
      ],
      topics: ["سیستم عصبی خودکار"],
      difficulty: "medium",
      requestedCount: 20,
    };

    let capturedPayload: any = null;
    vi.spyOn(studyApiModule, "createStudyApi").mockReturnValue({
      getExamTopics: vi.fn().mockResolvedValue(mockTopicsData),
      getExamHistory: vi.fn().mockResolvedValue({ items: [] }),
      startExamAttempt: vi.fn().mockImplementation(async (_orgId, payload) => {
        capturedPayload = payload;
        return mockStartExamResult;
      }),
    } as any);

    const onStartExam = vi.fn();

    render(
      <AuthProvider>
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>
            <ExamConfigView organizationId="org-test" onStartExam={onStartExam} />
          </QueryClientProvider>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی جامع")).toBeInTheDocument();
    });

    // Expand course
    fireEvent.click(screen.getByRole("button", { name: /سرفصل‌های فارماکولوژی جامع/ }));

    // Select the chapter "سیستم عصبی خودکار"
    const chapterElement = screen.getByText("سیستم عصبی خودکار");
    fireEvent.click(chapterElement);

    // Summary should show 0 دوره، 1 بخش (selected by chapter)
    expect(screen.getByText("0 دوره، 1 بخش")).toBeInTheDocument();

    // Eligible questions should be 45
    expect(screen.getByText(/۴۵ سوال/)).toBeInTheDocument();

    // Click Start Exam
    const startButton = screen.getByRole("button", { name: /شروع آزمون/i });
    expect(startButton).not.toBeDisabled();
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(onStartExam).toHaveBeenCalledTimes(1);
    });

    // Verify Invariant:
    // 1. sections contains chapter/module ID
    expect(capturedPayload.sections).toContain("mod-autonomic");

    // 2. chapters contains all underlying lesson IDs for that chapter
    expect(capturedPayload.chapters).toContain("les-cholinergic-1");
    expect(capturedPayload.chapters).toContain("les-adrenergic-2");
    expect(capturedPayload.chapters).toContain("les-antagonist-3");

    // 3. onStartExam received questions which still have their authentic lessonId preserved
    const receivedQuestions = onStartExam.mock.calls[0][0].questions;
    expect(receivedQuestions[0].lessonId).toBe("les-cholinergic-1");
    expect(receivedQuestions[1].lessonId).toBe("les-adrenergic-2");
    expect(receivedQuestions[2].lessonId).toBe("les-antagonist-3");
  });
});
