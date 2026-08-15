import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StudyAnalyticsView } from "../components/analytics/StudyAnalyticsView.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Study Analytics & Recommendations Flow", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId = "00000000-0000-0000-0000-000000000002";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders metrics, weak areas, and recommendations", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/study/analytics")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-an",
            analytics: {
              total_lessons: 10,
              completed_lessons: 7,
              lesson_progress_percent: 70,
              total_flashcards: 50,
              reviewed_flashcards: 40,
              flashcard_mastery_percent: 80,
              total_quizzes: 3,
              attempts_taken: 5,
              average_quiz_score: 92,
              weak_areas: ["Pharmacokinetics", "Beta Blockers"],
              recommended_next_steps: ["Review Beta Blockers flashcards"],
            },
          }),
        });
      }
      if (url.includes("/study/recommendations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-rec",
            recommendations: [
              {
                id: "rec-1",
                summary: "You struggled on Beta Blockers in Quiz 2. Consider reviewing related flashcards.",
                topics: ["Beta Blockers", "Pharmacology"],
                source: "quiz_attempt",
              },
            ],
          }),
        });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <StudyAnalyticsView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("70%")).toBeDefined();
      expect(screen.getByText("80%")).toBeDefined();
      expect(screen.getByText("92%")).toBeDefined();
      expect(screen.getByText("Pharmacokinetics")).toBeDefined();
      expect(screen.getAllByText("Beta Blockers").length).toBeGreaterThan(0);
      expect(screen.getByText("Review Beta Blockers flashcards")).toBeDefined();
      expect(
        screen.getByText(/You struggled on Beta Blockers in Quiz 2/i),
      ).toBeDefined();
    });
  });
});
