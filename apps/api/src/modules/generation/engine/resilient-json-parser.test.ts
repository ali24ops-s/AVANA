import { describe, it, expect } from "vitest";
import { cleanAndParseJson } from "./resilient-json-parser.js";
import { DomainError } from "@avana/domain";

describe("ResilientJsonParser (cleanAndParseJson)", () => {
  it("parses valid raw JSON directly", () => {
    const input = JSON.stringify({ key: "value", num: 42 });
    const result = cleanAndParseJson<{ key: string; num: number }>(input, "generic");
    expect(result).toEqual({ key: "value", num: 42 });
  });

  it("strips markdown json fences", () => {
    const input = "```json\n{\"title\": \"Lesson 1\", \"content\": \"text\"}\n```";
    const result = cleanAndParseJson<{ title: string; content: string }>(input, "generic");
    expect(result).toEqual({ title: "Lesson 1", content: "text" });
  });

  it("extracts JSON object when surrounded by conversational chatter", () => {
    const input = "Here is the requested output:\n{\"status\": \"ok\"}\nHope this helps!";
    const result = cleanAndParseJson<{ status: string }>(input, "generic");
    expect(result).toEqual({ status: "ok" });
  });

  it("safely preserves LaTeX backslashes without turning them into control characters", () => {
    const input = "{\"formula\": \"The value of \\\\frac{a}{b} and \\\\beta with \\\\text{label} is \\\\neq 0\"}";
    const result = cleanAndParseJson<{ formula: string }>(input, "generic");
    expect(result.formula).toContain("frac");
    expect(result.formula).toContain("beta");
  });

  it("removes trailing commas before closing braces/brackets", () => {
    const input = "{\n  \"items\": [1, 2, 3,],\n  \"name\": \"test\",\n}";
    const result = cleanAndParseJson<{ items: number[]; name: string }>(input, "generic");
    expect(result).toEqual({ items: [1, 2, 3], name: "test" });
  });

  it("normalizes raw arrays into typed batch structures", () => {
    const fcInput = "[{\"question\": \"Q1\", \"answer\": \"A1\"}]";
    const fcResult = cleanAndParseJson<{ kind: string; cards: unknown[] }>(fcInput, "flashcard");
    expect(fcResult.kind).toBe("flashcards_batch");
    expect(fcResult.cards).toHaveLength(1);

    const qzInput = "[{\"question\": \"Q1\", \"choices\": [\"A\", \"B\", \"C\", \"D\"], \"correctAnswer\": \"A\"}]";
    const qzResult = cleanAndParseJson<{ kind: string; questions: unknown[] }>(qzInput, "quiz");
    expect(qzResult.kind).toBe("quizzes_batch");
    expect(qzResult.questions).toHaveLength(1);
  });

  it("recovers sessions_batch via regex fallback when JSON is malformed", () => {
    const malformed = "{\n  \"sessions\": [\n    { \"index\": 0, \"title\": \"مقدمه\", \"contentMarkdown\": \"متن درس اول\" },\n    { \"index\": 1, \"title\": \"فارماکولوژی\", \"contentMarkdown\": \"متن درس دوم\"";
    const result = cleanAndParseJson<{ kind: string; sessions: Array<{ index: number; title: string; contentMarkdown: string }> }>(
      malformed,
      "sessions_batch"
    );
    expect(result.kind).toBe("sessions_batch");
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].title).toBe("مقدمه");
  });

  it("throws specialized STAGE5 error for empty review_summary response", () => {
    expect(() => cleanAndParseJson("", "review_summary")).toThrowError(
      /STAGE5_INVALID_MODEL_JSON: Model returned an empty response/
    );
  });

  it("throws specialized STAGE5 error for malformed review_summary response", () => {
    expect(() => cleanAndParseJson("not a json at all", "review_summary")).toThrowError(
      /STAGE5_INVALID_MODEL_JSON: Model returned malformed or unparseable JSON/
    );
  });

  it("throws standard DomainError for empty response on other types", () => {
    expect(() => cleanAndParseJson("", "lesson")).toThrowError(DomainError);
    expect(() => cleanAndParseJson("   ", "flashcard")).toThrowError(/Model returned an empty response/);
  });
});
