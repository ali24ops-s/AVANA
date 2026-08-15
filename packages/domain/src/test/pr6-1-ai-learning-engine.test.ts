/**
 * PR6-1: AI Learning Engine domain primitives.
 *
 * Tests the new document-related:
 * - Branded IDs (converter, is*, parse)
 * - Audit helpers (document.uploaded/processed/failed/deleted)
 * - Policy actions (document:upload, document:read)
 */

import { describe, expect, it } from "vitest";
import {
  asDocumentId,
  isDocumentId,
  isDocumentChunkId,
  parseDocumentId,
  parseDocumentChunkId,
  type DocumentId,
} from "../ids.js";
import {
  auditDocumentUploaded,
  auditDocumentProcessed,
  auditDocumentFailed,
  auditDocumentDeleted,
  type AuditEvent,
} from "../authorization/audit.js";
import { RoleBasedPolicy } from "../authorization/policy.js";
import type { Actor, AuthContext } from "../authorization/policy.js";
import type { UserId, OrganizationId } from "../ids.js";

const mockUserId = "00000000-0000-0000-0000-000000000001" as UserId;
const mockOrgId = "00000000-0000-0000-0000-000000000010" as OrganizationId;
const mockDocId = "00000000-0000-0000-0000-000000000020" as DocumentId;

function makeActor(role: string): Actor {
  return {
    userId: mockUserId,
    role: role as Actor["role"],
  };
}

const defaultContext: AuthContext = {
  organizationId: mockOrgId,
};

describe("PR6-1 branded document IDs", () => {
  it("validates document IDs", () => {
    expect(isDocumentId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isDocumentId("not-a-uuid")).toBe(false);
  });

  it("converts and parses document IDs", () => {
    const id = parseDocumentId("550e8400-e29b-41d4-a716-446655440000");
    expect(id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(asDocumentId(id)).toBe(id);
  });

  it("throws on invalid document chunk ID parse", () => {
    expect(() => parseDocumentChunkId("bad")).toThrow(/Invalid UUID/);
    expect(isDocumentChunkId("550e8400-e29b-41d4-a716-446655440000")).toBe(
      true,
    );
  });
});

describe("PR6-1 document audit helpers", () => {
  it("creates a document.uploaded audit event", () => {
    const event = auditDocumentUploaded(mockUserId, mockOrgId, mockDocId, {
      courseId: "00000000-0000-0000-0000-000000000011",
      ownerUserId: mockUserId,
      originalName: "notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: "a".repeat(64),
    });

    expect(event).toMatchObject({
      actorId: mockUserId,
      organizationId: mockOrgId,
      action: "document.uploaded",
      entityType: "document",
      entityId: mockDocId,
    });
    expect(event.details?.original_name).toBe("notes.pdf");
    expect(event.details?.sha256).toBe("a".repeat(64));
  });

  it("creates a document.processed audit event", () => {
    const event = auditDocumentProcessed(mockUserId, mockOrgId, mockDocId, {
      previousStatus: "extracting",
      newStatus: "ready",
      pageCount: 5,
      chunkCount: 12,
    });

    expect(event.action).toBe("document.processed");
    expect(event.entityType).toBe("document");
    expect(event.details).toMatchObject({
      previous_status: "extracting",
      new_status: "ready",
      page_count: 5,
      chunk_count: 12,
    });
  });

  it("creates a document.failed audit event", () => {
    const event = auditDocumentFailed(mockUserId, mockOrgId, mockDocId, {
      errorCode: "unsafe_file",
      retryCount: 2,
    });

    expect(event.action).toBe("document.failed");
    expect(event.details).toMatchObject({
      error_code: "unsafe_file",
      retry_count: 2,
    });
  });

  it("creates a document.deleted audit event", () => {
    const event = auditDocumentDeleted(
      mockUserId,
      mockOrgId,
      mockDocId,
      "00000000-0000-0000-0000-000000000012",
    );

    expect(event.action).toBe("document.deleted");
    expect(event.details).toMatchObject({
      course_id: "00000000-0000-0000-0000-000000000012",
    });
  });

  it("produces serializable audit events", () => {
    const event: AuditEvent = auditDocumentUploaded(
      mockUserId,
      mockOrgId,
      mockDocId,
      {
        courseId: "00000000-0000-0000-0000-000000000011",
        ownerUserId: mockUserId,
        originalName: "notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        sha256: "b".repeat(64),
      },
    );
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });
});

describe("PR6-1 document policy actions", () => {
  const policy = new RoleBasedPolicy();

  it("allows students to upload and read documents", () => {
    const actor = makeActor("student");
    expect(policy.check("document:upload", actor, defaultContext)).toBe(true);
    expect(policy.check("document:read", actor, defaultContext)).toBe(true);
  });

  it("allows course editors to upload and read documents", () => {
    const actor = makeActor("course_editor");
    expect(policy.check("document:upload", actor, defaultContext)).toBe(true);
    expect(policy.check("document:read", actor, defaultContext)).toBe(true);
  });

  it("allows organization admins to upload and read documents", () => {
    const actor = makeActor("organization_admin");
    expect(policy.check("document:upload", actor, defaultContext)).toBe(true);
    expect(policy.check("document:read", actor, defaultContext)).toBe(true);
  });

  it("denies reserved roles document actions", () => {
    for (const role of ["support_agent", "platform_admin"]) {
      const actor = makeActor(role);
      expect(policy.check("document:upload", actor, defaultContext)).toBe(
        false,
      );
      expect(policy.check("document:read", actor, defaultContext)).toBe(false);
    }
  });

  it("require() throws for denied document action", () => {
    const actor = makeActor("support_agent");
    expect(() =>
      policy.require("document:upload", actor, defaultContext),
    ).toThrow(/not permitted/i);
  });
});
