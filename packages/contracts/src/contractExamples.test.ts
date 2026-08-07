import { describe, expect, it } from "vitest";
import type {
  CourseLearnResponse,
  CourseLearnProgress,
  ErrorEnvelope,
  LessonResource,
  ModuleResource,
  Pagination,
} from "./generated/index.js";

describe("contracts (Sprint 1 PR 4) - type examples", () => {
  it("models error envelope shape", () => {
    const envelope: ErrorEnvelope = {
      request_id: "550e8400-e29b-41d4-a716-446655440000",
      error: {
        code: "unauthorized",
        message: "Not signed in",
      },
    };

    expect(envelope.error.code).toBe("unauthorized");
  });

  it("models pagination shape", () => {
    const pagination: Pagination = { limit: 25, next_cursor: null };
    expect(pagination.limit).toBe(25);
    expect(pagination.next_cursor).toBeNull();
  });

  it("models course learning response shape (PR5-C5)", () => {
    const lesson: LessonResource = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      module_id: "550e8400-e29b-41d4-a716-446655440001",
      title: "Intro",
      content_type: "markdown",
      content_markdown: "# Intro",
      sort_order: 1,
      estimated_minutes: 10,
      completed: false,
      completed_at: null,
    };

    const moduleResource: ModuleResource = {
      id: "550e8400-e29b-41d4-a716-446655440002",
      title: "Module 1",
      description: "A module",
      sort_order: 1,
      lessons: [lesson],
    };

    const progress: CourseLearnProgress = {
      total_lessons: 1,
      completed_lessons: 0,
      progress_percent: 0,
    };

    const response: CourseLearnResponse = {
      request_id: "550e8400-e29b-41d4-a716-446655440003",
      course: {
        id: "550e8400-e29b-41d4-a716-446655440004",
        title: "Pharmacology Basics",
        subject: "Pharmacy",
        exam_at: null,
      },
      modules: [moduleResource],
      progress,
    };

    expect(response.course.title).toBe("Pharmacology Basics");
    expect(response.modules[0].lessons[0].content_markdown).toBe("# Intro");
    expect(response.modules[0].lessons[0].completed).toBe(false);
    expect(response.modules[0].lessons[0].completed_at).toBeNull();
    expect(response.progress.progress_percent).toBe(0);
    // Contract uses snake_case field names matching the API serialization.
    expect("module_id" in response.modules[0].lessons[0]).toBe(true);
    expect("sort_order" in response.modules[0]).toBe(true);
  });
});
