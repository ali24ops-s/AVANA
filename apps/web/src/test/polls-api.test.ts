import { describe, it, expect, vi } from "vitest";
import { createPollsApi } from "../lib/api/polls-api.js";
import { studioPollsKeys } from "../hooks/useStudioPolls.js";
import { publicPollKeys } from "../hooks/usePublicPoll.js";

describe("Polls API Client & Query Keys (Step 1)", () => {
  const mockClient = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    postFormData: vi.fn(),
  };

  const api = createPollsApi(mockClient as any);

  it("calls listPolls with params", async () => {
    mockClient.get.mockResolvedValueOnce({ polls: [] });
    await api.listPolls({ status: "published", limit: 20 });
    expect(mockClient.get).toHaveBeenCalledWith("/v1/studio/polls", {
      params: { status: "published", limit: 20 },
    });
  });

  it("calls getPollById with poll id", async () => {
    mockClient.get.mockResolvedValueOnce({ poll: { id: "p1", title: "Poll 1" } });
    await api.getPollById("p1");
    expect(mockClient.get).toHaveBeenCalledWith("/v1/studio/polls/p1");
  });

  it("calls createPoll with payload", async () => {
    const input = { title: "نظرسنجی جدید", description: "توضیحات" };
    mockClient.post.mockResolvedValueOnce({ poll: { id: "p2", ...input } });
    await api.createPoll(input);
    expect(mockClient.post).toHaveBeenCalledWith("/v1/studio/polls", input);
  });

  it("calls updatePoll, publishPoll, closePoll, and deletePoll", async () => {
    mockClient.patch.mockResolvedValueOnce({ poll: { id: "p1" } });
    await api.updatePoll("p1", { title: "عنوان ویرایش‌شده" });
    expect(mockClient.patch).toHaveBeenCalledWith("/v1/studio/polls/p1", {
      title: "عنوان ویرایش‌شده",
    });

    mockClient.post.mockResolvedValueOnce({ poll: { id: "p1", status: "published" } });
    await api.publishPoll("p1");
    expect(mockClient.post).toHaveBeenCalledWith("/v1/studio/polls/p1/publish");

    mockClient.post.mockResolvedValueOnce({ poll: { id: "p1", status: "closed" } });
    await api.closePoll("p1");
    expect(mockClient.post).toHaveBeenCalledWith("/v1/studio/polls/p1/close");

    mockClient.delete.mockResolvedValueOnce({ success: true });
    await api.deletePoll("p1");
    expect(mockClient.delete).toHaveBeenCalledWith("/v1/studio/polls/p1");
  });

  it("calls questions endpoints: create, update, delete, reorder", async () => {
    mockClient.post.mockResolvedValueOnce({ question: { id: "q1" } });
    await api.createQuestion("p1", {
      questionText: "سؤال ۱",
      questionType: "single_choice",
      isRequired: true,
      options: [{ optionText: "الف" }, { optionText: "ب" }],
    });
    expect(mockClient.post).toHaveBeenCalledWith(
      "/v1/studio/polls/p1/questions",
      expect.objectContaining({ questionText: "سؤال ۱" }),
    );

    mockClient.patch.mockResolvedValueOnce({ question: { id: "q1" } });
    await api.updateQuestion("p1", "q1", { questionText: "سؤال ویرایش‌شده" });
    expect(mockClient.patch).toHaveBeenCalledWith(
      "/v1/studio/polls/p1/questions/q1",
      { questionText: "سؤال ویرایش‌شده" },
    );

    mockClient.delete.mockResolvedValueOnce({ success: true });
    await api.deleteQuestion("p1", "q1");
    expect(mockClient.delete).toHaveBeenCalledWith("/v1/studio/polls/p1/questions/q1");

    mockClient.put.mockResolvedValueOnce({ success: true });
    await api.reorderQuestions("p1", ["q2", "q1"]);
    expect(mockClient.put).toHaveBeenCalledWith(
      "/v1/studio/polls/p1/questions/reorder",
      { questionIds: ["q2", "q1"] },
    );
  });

  it("calls public endpoints: getPublicPoll, submitVote, getPublicResults", async () => {
    mockClient.get.mockResolvedValueOnce({ poll: { slug: "sample" } });
    await api.getPublicPoll("sample");
    expect(mockClient.get).toHaveBeenCalledWith("/v1/public/polls/sample");

    mockClient.post.mockResolvedValueOnce({ success: true, responseId: "r1" });
    await api.submitVote("sample", {
      answers: {
        q1: { questionId: "q1", selectedOptionId: "opt-1" },
      },
    });
    expect(mockClient.post).toHaveBeenCalledWith(
      "/v1/public/polls/sample/vote",
      expect.objectContaining({ answers: expect.any(Object) }),
    );

    mockClient.get.mockResolvedValueOnce({ results: { pollId: "p1" } });
    await api.getPublicResults("sample");
    expect(mockClient.get).toHaveBeenCalledWith("/v1/public/polls/sample/results");
  });

  it("generates correct query keys for React Query cache", () => {
    expect(studioPollsKeys.lists()).toEqual(["studio", "polls", "list"]);
    expect(studioPollsKeys.detail("p1")).toEqual(["studio", "polls", "detail", "p1"]);
    expect(studioPollsKeys.result("p1")).toEqual(["studio", "polls", "results", "p1"]);

    expect(publicPollKeys.poll("test-slug")).toEqual(["public", "polls", "detail", "test-slug"]);
    expect(publicPollKeys.results("test-slug")).toEqual(["public", "polls", "results", "test-slug"]);
  });
});
