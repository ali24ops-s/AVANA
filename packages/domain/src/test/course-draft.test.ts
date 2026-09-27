import { describe, it, expect } from "vitest";
import {
  mergeDraftChange,
  type CourseDraftChangeRecord,
  type IncomingDraftChange,
} from "../course-draft.js";
import {
  asCourseId,
  asCourseDraftSessionId,
  asCourseDraftChangeId,
  parseUUID,
} from "../ids.js";

describe("Course Draft Merge Semantics", () => {
  const courseId = asCourseId(parseUUID("11111111-1111-4111-8111-111111111111"));
  const sessionId = asCourseDraftSessionId(parseUUID("22222222-2222-4222-8222-222222222222"));
  const changeId = asCourseDraftChangeId(parseUUID("33333333-3333-4333-8333-333333333333"));
  const lessonId = "44444444-4444-4444-8444-444444444444";

  it("1. initial create: returns upsert with action create and before null", () => {
    const incoming: IncomingDraftChange = {
      entityType: "lesson",
      entityId: lessonId,
      action: "create",
      parentId: "module-1",
      sortOrder: 0,
      payload: {
        before: null,
        after: { title: "New Lesson", contentMarkdown: "# Content" },
      },
    };

    const decision = mergeDraftChange(null, incoming, null);
    expect(decision.type).toBe("upsert");
    if (decision.type === "upsert") {
      expect(decision.action).toBe("create");
      expect(decision.payload.before).toBeNull();
      expect(decision.payload.after).toEqual({ title: "New Lesson", contentMarkdown: "# Content" });
    }
  });

  it("2. create -> update: stays create and merges after payload", () => {
    const existing: CourseDraftChangeRecord = {
      id: changeId,
      draftSessionId: sessionId,
      courseId,
      entityType: "lesson",
      entityId: lessonId,
      action: "create",
      parentId: "module-1",
      sortOrder: 0,
      payload: {
        before: null,
        after: { title: "New Lesson", contentMarkdown: "# Content" },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const incoming: IncomingDraftChange = {
      entityType: "lesson",
      entityId: lessonId,
      action: "update",
      payload: {
        before: null,
        after: { title: "Updated Lesson Title", contentMarkdown: "# Content v2" },
      },
    };

    const decision = mergeDraftChange(existing, incoming, null);
    expect(decision.type).toBe("upsert");
    if (decision.type === "upsert") {
      expect(decision.action).toBe("create");
      expect(decision.payload.before).toBeNull();
      expect(decision.payload.after).toEqual({
        title: "Updated Lesson Title",
        contentMarkdown: "# Content v2",
      });
    }
  });

  it("3. create -> delete: deletes the draft change row entirely", () => {
    const existing: CourseDraftChangeRecord = {
      id: changeId,
      draftSessionId: sessionId,
      courseId,
      entityType: "lesson",
      entityId: lessonId,
      action: "create",
      parentId: "module-1",
      sortOrder: 0,
      payload: {
        before: null,
        after: { title: "New Lesson" },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const incoming: IncomingDraftChange = {
      entityType: "lesson",
      entityId: lessonId,
      action: "delete",
      payload: { before: null, after: null },
    };

    const decision = mergeDraftChange(existing, incoming, null);
    expect(decision.type).toBe("delete");
  });

  it("4. update -> update: preserves original before and updates after", () => {
    const liveState = { title: "Live Original Title", contentMarkdown: "# Live" };
    const existing: CourseDraftChangeRecord = {
      id: changeId,
      draftSessionId: sessionId,
      courseId,
      entityType: "lesson",
      entityId: lessonId,
      action: "update",
      parentId: "module-1",
      sortOrder: 1,
      payload: {
        before: liveState,
        after: { title: "First Edit", contentMarkdown: "# Live" },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const incoming: IncomingDraftChange = {
      entityType: "lesson",
      entityId: lessonId,
      action: "update",
      payload: {
        before: null,
        after: { title: "Second Edit", contentMarkdown: "# Live Updated" },
      },
    };

    const decision = mergeDraftChange(existing, incoming, liveState);
    expect(decision.type).toBe("upsert");
    if (decision.type === "upsert") {
      expect(decision.action).toBe("update");
      expect(decision.payload.before).toEqual(liveState);
      expect(decision.payload.after).toEqual({
        title: "Second Edit",
        contentMarkdown: "# Live Updated",
      });
    }
  });

  it("5. update -> revert: if after matches original liveState, removes change", () => {
    const liveState = { title: "Live Title", contentMarkdown: "# Live Content" };
    const existing: CourseDraftChangeRecord = {
      id: changeId,
      draftSessionId: sessionId,
      courseId,
      entityType: "lesson",
      entityId: lessonId,
      action: "update",
      parentId: "module-1",
      sortOrder: 1,
      payload: {
        before: liveState,
        after: { title: "Modified Title", contentMarkdown: "# Live Content" },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const incoming: IncomingDraftChange = {
      entityType: "lesson",
      entityId: lessonId,
      action: "update",
      sortOrder: 1,
      payload: {
        before: liveState,
        after: liveState, // user reverted back to exact live state
      },
    };

    const decision = mergeDraftChange(existing, incoming, liveState);
    expect(decision.type).toBe("delete");
  });

  it("6. update -> delete: changes action to delete and preserves before", () => {
    const liveState = { title: "Live Title", contentMarkdown: "# Live Content" };
    const existing: CourseDraftChangeRecord = {
      id: changeId,
      draftSessionId: sessionId,
      courseId,
      entityType: "lesson",
      entityId: lessonId,
      action: "update",
      parentId: "module-1",
      sortOrder: 1,
      payload: {
        before: liveState,
        after: { title: "Modified Title", contentMarkdown: "# Live Content" },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const incoming: IncomingDraftChange = {
      entityType: "lesson",
      entityId: lessonId,
      action: "delete",
      payload: { before: null, after: null },
    };

    const decision = mergeDraftChange(existing, incoming, liveState);
    expect(decision.type).toBe("upsert");
    if (decision.type === "upsert") {
      expect(decision.action).toBe("delete");
      expect(decision.payload.before).toEqual(liveState);
      expect(decision.payload.after).toBeNull();
    }
  });

  it("7. delete -> restore: removes draft delete and restores live state", () => {
    const liveState = { title: "Live Title", contentMarkdown: "# Live Content" };
    const existing: CourseDraftChangeRecord = {
      id: changeId,
      draftSessionId: sessionId,
      courseId,
      entityType: "lesson",
      entityId: lessonId,
      action: "delete",
      parentId: "module-1",
      sortOrder: 1,
      payload: {
        before: liveState,
        after: null,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const incoming: IncomingDraftChange = {
      entityType: "lesson",
      entityId: lessonId,
      action: "update",
      payload: {
        before: liveState,
        after: liveState, // user restored original live state
      },
    };

    const decision = mergeDraftChange(existing, incoming, liveState);
    expect(decision.type).toBe("delete");
  });

  it("8. reorder + update: merged into a single intended state update", () => {
    const liveState = { title: "Live Title", sortOrder: 0 };
    const existing: CourseDraftChangeRecord = {
      id: changeId,
      draftSessionId: sessionId,
      courseId,
      entityType: "lesson",
      entityId: lessonId,
      action: "update",
      parentId: "module-1",
      sortOrder: 0,
      payload: {
        before: liveState,
        after: { title: "Renamed Title", sortOrder: 0 },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const incoming: IncomingDraftChange = {
      entityType: "lesson",
      entityId: lessonId,
      action: "reorder",
      sortOrder: 5,
      payload: {
        before: null,
        after: { title: "Renamed Title", sortOrder: 5 },
      },
    };

    const decision = mergeDraftChange(existing, incoming, liveState);
    expect(decision.type).toBe("upsert");
    if (decision.type === "upsert") {
      expect(decision.action).toBe("update");
      expect(decision.sortOrder).toBe(5);
      expect(decision.payload.after).toEqual({ title: "Renamed Title", sortOrder: 5 });
    }
  });
});
