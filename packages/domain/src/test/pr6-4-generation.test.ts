/**
 * PR6-4: AI generation domain primitives.
 *
 * Tests the generation-related:
 * - Content type/status/payload shapes and the extensible union
 * - Runtime generation scope (only "lesson" enabled)
 * - Policy actions (content:generate/review/accept/reject/regenerate)
 * - Audit helpers (content.generated, content.accepted/rejected/regenerated,
 *   generation.failed)
 */

import { describe, expect, it } from "vitest";
import {
  type GeneratedContentType,
  type GeneratedContentStatus,
  type LessonPayload,
  ENABLED_GENERATION_TYPES,
  isGenerationTypeEnabled,
} from "../generation.js";
import {
  auditContentGenerated,
  auditContentAccepted,
  auditContentRejected,
  auditContentRegenerated,
  auditGenerationFailed,
  type AuditEvent,
} from "../authorization/audit.js";
import { RoleBasedPolicy } from "../authorization/policy.js";
import type { Actor, AuthContext } from "../authorization/policy.js";
import type {
  DocumentId,
  GeneratedContentId,
  UserId,
  OrganizationId,
} from "../ids.js";

const mockUserId = "00000000-0000-0000-0000-000000000001" as UserId;
const mockOrgId = "00000000-0000-0000-0000-000000000010" as OrganizationId;
const mockDocId = "00000000-0000-0000-0000-000000000020" as DocumentId;
const mockContentId =
  "00000000-0000-0000-0000-000000000030" as GeneratedContentId;

function makeActor(role: string): Actor {
  return {
    userId: mockUserId,
    role: role as Actor["role"],
  };
}

const defaultContext: AuthContext = {
  organizationId: mockOrgId,
};

describe("PR6-4 generation content types", () => {
  it("defines the extensible GeneratedContentType union", () => {
    const types: readonly GeneratedContentType[] = [
      "lesson",
      "flashcard",
      "quiz",
      "recommendation",
    ];
    expect(types).toContain("lesson");
    expect(types).toContain("flashcard");
  });

  it("defines the generated content status lifecycle", () => {
    const statuses: readonly GeneratedContentStatus[] = [
      "draft",
      "accepted",
      "rejected",
      "edited",
      "regenerating",
    ];
    expect(statuses).toContain("draft");
    expect(statuses).toContain("regenerating");
  });

  it("shapes a LessonPayload with citationChunkIds", () => {
    const payload: LessonPayload = {
      kind: "lesson",
      title: "Generated Lesson",
      contentMarkdown: "# Lesson",
      citationChunkIds: [
        "00000000-0000-0000-0000-000000000040",
        "00000000-0000-0000-0000-000000000041",
      ],
    };
    expect(payload.kind).toBe("lesson");
    expect(payload.citationChunkIds).toHaveLength(2);
  });

  it("enables lesson, flashcard, quiz, and review_summary for runtime generation", () => {
    expect(ENABLED_GENERATION_TYPES).toEqual([
      "lesson",
      "flashcard",
      "quiz",
      "review_summary",
    ]);
    expect(isGenerationTypeEnabled("lesson")).toBe(true);
    expect(isGenerationTypeEnabled("flashcard")).toBe(true);
    expect(isGenerationTypeEnabled("quiz")).toBe(true);
    expect(isGenerationTypeEnabled("review_summary")).toBe(true);
    expect(isGenerationTypeEnabled("recommendation")).toBe(false);
  });
});

describe("PR6-4 generation policy actions", () => {
  const policy = new RoleBasedPolicy();

  const editorActions = [
    "content:generate",
    "content:review",
    "content:accept",
    "content:reject",
    "content:regenerate",
  ] as const;

  it("allows students to generate and review content but denies accept, reject, edit, and regenerate", () => {
    const actor = makeActor("student");
    expect(policy.check("content:generate", actor, defaultContext)).toBe(true);
    expect(policy.check("content:review", actor, defaultContext)).toBe(true);
    expect(policy.check("content:accept", actor, defaultContext)).toBe(false);
    expect(policy.check("content:reject", actor, defaultContext)).toBe(false);
    expect(policy.check("content:regenerate", actor, defaultContext)).toBe(false);
    expect(policy.check("content:edit", actor, defaultContext)).toBe(false);
  });

  it("strictly denies administrative actions for students", () => {
    const actor = makeActor("student");
    expect(policy.check("org:delete", actor, defaultContext)).toBe(false);
    expect(policy.check("org:manage_memberships", actor, defaultContext)).toBe(false);
    expect(policy.check("course:delete", actor, defaultContext)).toBe(false);
    expect(policy.check("course:archive", actor, defaultContext)).toBe(false);
  });

  it("allows course editors all content actions", () => {
    const actor = makeActor("course_editor");
    for (const action of editorActions) {
      expect(policy.check(action, actor, defaultContext)).toBe(true);
    }
  });

  it("allows organization admins all content actions", () => {
    const actor = makeActor("organization_admin");
    for (const action of editorActions) {
      expect(policy.check(action, actor, defaultContext)).toBe(true);
    }
  });

  it("allows platform admins all content actions", () => {
    const actor = makeActor("platform_admin");
    for (const action of editorActions) {
      expect(policy.check(action, actor, defaultContext)).toBe(true);
    }
  });

  it("denies reserved support role content actions", () => {
    for (const role of ["support_agent"]) {
      const actor = makeActor(role);
      for (const action of editorActions) {
        expect(policy.check(action, actor, defaultContext)).toBe(false);
      }
    }
  });

  it("require() throws for a denied generation action", () => {
    const actor = makeActor("support_agent");
    expect(() =>
      policy.require("content:generate", actor, defaultContext),
    ).toThrow(/not permitted/i);
  });
});

describe("PR6-4 generation audit helpers", () => {
  it("creates a content.generated audit event", () => {
    const event = auditContentGenerated(mockUserId, mockOrgId, mockContentId, {
      documentId: mockDocId,
      type: "lesson",
      model: "mock-1",
      promptVersion: "v1",
      sourceChunkCount: 4,
    });

    expect(event).toMatchObject({
      actorId: mockUserId,
      organizationId: mockOrgId,
      action: "content.generated",
      entityType: "generated_content",
      entityId: mockContentId,
    });
    expect(event.details).toMatchObject({
      document_id: mockDocId,
      type: "lesson",
      model: "mock-1",
      prompt_version: "v1",
      source_chunk_count: 4,
    });
  });

  it("creates a content.accepted audit event", () => {
    const event = auditContentAccepted(mockUserId, mockOrgId, mockContentId, {
      documentId: mockDocId,
      type: "lesson",
    });

    expect(event.action).toBe("content.accepted");
    expect(event.entityType).toBe("generated_content");
    expect(event.details).toMatchObject({ type: "lesson" });
  });

  it("creates a content.rejected audit event", () => {
    const event = auditContentRejected(mockUserId, mockOrgId, mockContentId, {
      documentId: mockDocId,
      type: "lesson",
    });

    expect(event.action).toBe("content.rejected");
    expect(event.details).toMatchObject({ type: "lesson" });
  });

  it("creates a content.regenerated audit event", () => {
    const event = auditContentRegenerated(
      mockUserId,
      mockOrgId,
      mockContentId,
      {
        documentId: mockDocId,
        type: "lesson",
        generationKey: "doc:lesson:v2",
      },
    );

    expect(event.action).toBe("content.regenerated");
    expect(event.details).toMatchObject({
      generation_key: "doc:lesson:v2",
    });
  });

  it("creates a generation.failed audit event", () => {
    const event = auditGenerationFailed(mockUserId, mockOrgId, mockDocId, {
      type: "lesson",
      errorCode: "provider_unavailable",
      retryCount: 2,
    });

    expect(event.action).toBe("generation.failed");
    expect(event.details).toMatchObject({
      type: "lesson",
      error_code: "provider_unavailable",
      retry_count: 2,
    });
  });

  it("produces serializable audit events", () => {
    const event: AuditEvent = auditContentGenerated(
      mockUserId,
      mockOrgId,
      mockContentId,
      {
        documentId: mockDocId,
        type: "lesson",
        model: "mock-1",
        promptVersion: "v1",
        sourceChunkCount: 3,
      },
    );
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });
});
