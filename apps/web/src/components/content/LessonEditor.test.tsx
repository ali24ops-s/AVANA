/**
 * LessonEditor unit tests.
 *
 * Verifies the editor initializes form state safely, especially that
 * `contentMarkdown` is always a string even when the API omits/nullifies
 * `content_markdown` (regression guard for the CourseContentPage crash).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContentLessonResource } from "@avana/contracts";
import { LessonEditor } from "./LessonEditor.js";

function makeLesson(
  overrides: Partial<ContentLessonResource> = {},
): ContentLessonResource {
  return {
    id: "lesson-1",
    module_id: "module-1",
    title: "Test Lesson",
    content_type: "markdown",
    content_markdown: "# Hello",
    sort_order: 1,
    estimated_minutes: 5,
    publication_status: "draft",
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderEditor(lesson: ContentLessonResource) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LessonEditor
        lesson={lesson}
        organizationId="org-1"
        courseId="course-1"
        moduleId="module-1"
        moduleTitle="Test Module"
      />
    </QueryClientProvider>,
  );
}

describe("LessonEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("initializes contentMarkdown from content_markdown", () => {
    renderEditor(makeLesson({ content_markdown: "# Hello world" }));
    const textarea = screen.getByPlaceholderText(
      "Write your lesson content in markdown...",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("# Hello world");
  });

  it("does not crash when content_markdown is missing (undefined)", () => {
    // Simulate an API contract deviation where content_markdown is absent.
    const lesson = makeLesson();
    delete (lesson as Partial<ContentLessonResource>).content_markdown;

    expect(() => renderEditor(lesson)).not.toThrow();
    const textarea = screen.getByPlaceholderText(
      "Write your lesson content in markdown...",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("does not crash when content_markdown is null", () => {
    const lesson = {
      ...makeLesson(),
      content_markdown: null as unknown as string,
    };
    expect(() => renderEditor(lesson)).not.toThrow();
    const textarea = screen.getByPlaceholderText(
      "Write your lesson content in markdown...",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });
});
