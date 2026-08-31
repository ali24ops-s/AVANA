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

afterEach(() => {
  cleanup();
});

function renderWithQuery(ui: React.ReactElement, mockTopicsData: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  });

  queryClient.setQueryData(["exam-topics", "org-test"], mockTopicsData);

  return render(
    <AuthProvider>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("UI Defensive Content Filtering Safeguards", () => {
  it("omits modules with questionCount=0 and courses with 0 questions from ExamConfigView", async () => {
    const mockData = {
      courses: [
        {
          courseId: "c1",
          courseTitle: "فارماکولوژی 1",
          questionCount: 15,
          modules: [
            { moduleId: "mod-15", moduleTitle: "Module A (15 Questions)", questionCount: 15 },
            { moduleId: "mod-0", moduleTitle: "Module B (0 Questions)", questionCount: 0 },
          ],
        },
        {
          courseId: "c2",
          courseTitle: "دوره بدون سوال",
          questionCount: 0,
          modules: [
            { moduleId: "mod-empty", moduleTitle: "Module Empty (0 Questions)", questionCount: 0 },
          ],
        },
      ],
    };

    renderWithQuery(
      <ExamConfigView organizationId="org-test" onStartExam={vi.fn()} />,
      mockData,
    );

    await waitFor(() => {
      // Course 1 should be displayed
      expect(screen.getByText("فارماکولوژی 1")).toBeInTheDocument();
      // Course 2 (0 Questions) MUST NOT be displayed
      expect(screen.queryByText("دوره بدون سوال")).not.toBeInTheDocument();
      // Course 1 should show only 1 valid module count
      expect(screen.getByText("دوره آموزشی (1 بخش)")).toBeInTheDocument();
    });

    // Expand Course 1 accordion
    fireEvent.click(screen.getByText("فارماکولوژی 1"));

    await waitFor(() => {
      // Module A (15 Questions) should be displayed
      expect(screen.getByText("Module A (15 Questions)")).toBeInTheDocument();
      // Module B (0 Questions) MUST NOT be displayed
      expect(screen.queryByText("Module B (0 Questions)")).not.toBeInTheDocument();
    });
  });
});
