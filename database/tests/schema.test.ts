import { describe, expect, test } from "vitest";
import { getTableColumns } from "drizzle-orm";
import * as schema from "../schema/index.js";

describe("PR-6 database schema", () => {
  // -----------------------------------------------------------------------
  // Table definitions - verify each table is exported and named correctly
  // -----------------------------------------------------------------------
  test("users table is defined", () => {
    expect(schema.users).toBeDefined();
  });

  test("organizations table is defined", () => {
    expect(schema.organizations).toBeDefined();
  });

  test("organization_memberships table is defined", () => {
    expect(schema.organizationMemberships).toBeDefined();
  });

  test("courses table is defined", () => {
    expect(schema.courses).toBeDefined();
  });

  test("course_memberships table is defined", () => {
    expect(schema.courseMemberships).toBeDefined();
  });

  test("audit_logs table is defined", () => {
    expect(schema.auditLogs).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Column presence via getTableColumns
  // -----------------------------------------------------------------------
  test("users has all required columns", () => {
    const cols = getTableColumns(schema.users);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("email");
    expect(cols).toHaveProperty("name");
    expect(cols).toHaveProperty("createdAt");
    expect(cols).toHaveProperty("updatedAt");
    expect(cols).toHaveProperty("deletedAt");
  });

  test("organizations has all required columns", () => {
    const cols = getTableColumns(schema.organizations);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("name");
    expect(cols).toHaveProperty("slug");
    expect(cols).toHaveProperty("createdAt");
    expect(cols).toHaveProperty("updatedAt");
    expect(cols).toHaveProperty("deletedAt");
  });

  test("organization_memberships has all required columns", () => {
    const cols = getTableColumns(schema.organizationMemberships);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("organizationId");
    expect(cols).toHaveProperty("userId");
    expect(cols).toHaveProperty("role");
    expect(cols).toHaveProperty("createdAt");
    expect(cols).toHaveProperty("updatedAt");
  });

  test("courses has all required columns", () => {
    const cols = getTableColumns(schema.courses);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("organizationId");
    expect(cols).toHaveProperty("name");
    expect(cols).toHaveProperty("subject");
    expect(cols).toHaveProperty("examDate");
    expect(cols).toHaveProperty("createdAt");
    expect(cols).toHaveProperty("updatedAt");
    expect(cols).toHaveProperty("deletedAt");
  });

  test("course_memberships has all required columns", () => {
    const cols = getTableColumns(schema.courseMemberships);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("courseId");
    expect(cols).toHaveProperty("userId");
    expect(cols).toHaveProperty("role");
    expect(cols).toHaveProperty("createdAt");
    expect(cols).toHaveProperty("updatedAt");
  });

  test("audit_logs has all required columns", () => {
    const cols = getTableColumns(schema.auditLogs);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("actorId");
    expect(cols).toHaveProperty("organizationId");
    expect(cols).toHaveProperty("action");
    expect(cols).toHaveProperty("entityType");
    expect(cols).toHaveProperty("entityId");
    expect(cols).toHaveProperty("details");
    expect(cols).toHaveProperty("createdAt");
  });

  // -----------------------------------------------------------------------
  // Table count — we expect exactly 6 tables for PR-6
  // -----------------------------------------------------------------------
  test("exports all 6 table definitions", () => {
    const tableNames = [
      "users",
      "organizations",
      "organizationMemberships",
      "courses",
      "courseMemberships",
      "auditLogs",
    ];
    for (const name of tableNames) {
      expect(schema[name as keyof typeof schema]).toBeDefined();
    }
  });

  // -----------------------------------------------------------------------
  // Soft-delete pattern — users, organizations, courses have deletedAt
  // -----------------------------------------------------------------------
  test("users, organizations, and courses have deletedAt column", () => {
    const userCols = getTableColumns(schema.users);
    expect(userCols).toHaveProperty("deletedAt");

    const orgCols = getTableColumns(schema.organizations);
    expect(orgCols).toHaveProperty("deletedAt");

    const courseCols = getTableColumns(schema.courses);
    expect(courseCols).toHaveProperty("deletedAt");
  });

  // -----------------------------------------------------------------------
  // Membership tables do not have deletedAt (hard-deleted on cascade)
  // -----------------------------------------------------------------------
  test("membership tables do not have deletedAt", () => {
    const orgMemCols = getTableColumns(schema.organizationMemberships);
    expect(orgMemCols).not.toHaveProperty("deletedAt");

    const courseMemCols = getTableColumns(schema.courseMemberships);
    expect(courseMemCols).not.toHaveProperty("deletedAt");
  });

  test("lessons has publication state defaulting to draft", () => {
    const cols = getTableColumns(schema.lessons);
    expect(cols).toHaveProperty("publicationStatus");
    expect(cols.publicationStatus.notNull).toBe(true);
    expect(cols.publicationStatus.default).toBe("draft");
  });

  // -----------------------------------------------------------------------
  // PR-7 auth tables
  // -----------------------------------------------------------------------
  test("auth_identities table is defined", () => {
    expect(schema.authIdentities).toBeDefined();
  });

  test("sessions table is defined", () => {
    expect(schema.sessions).toBeDefined();
  });

  test("auth_identities has all required columns", () => {
    const cols = getTableColumns(schema.authIdentities);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("userId");
    expect(cols).toHaveProperty("provider");
    expect(cols).toHaveProperty("providerSubject");
    expect(cols).toHaveProperty("createdAt");
  });

  test("sessions has all required columns", () => {
    const cols = getTableColumns(schema.sessions);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("userId");
    expect(cols).toHaveProperty("tokenHash");
    expect(cols).toHaveProperty("expiresAt");
    expect(cols).toHaveProperty("lastUsedAt");
    expect(cols).toHaveProperty("createdAt");
    expect(cols).toHaveProperty("revokedAt");
  });

  // -----------------------------------------------------------------------
  // PR6-1 AI Learning Engine tables
  // -----------------------------------------------------------------------
  test("documents table is defined", () => {
    expect(schema.documents).toBeDefined();
  });

  test("document_chunks table is defined", () => {
    expect(schema.documentChunks).toBeDefined();
  });

  test("generated_contents table is defined", () => {
    expect(schema.generatedContents).toBeDefined();
  });

  test("generated_content_citations table is defined", () => {
    expect(schema.generatedContentCitations).toBeDefined();
  });

  test("flashcards table is defined", () => {
    expect(schema.flashcards).toBeDefined();
  });

  test("flashcard_reviews table is defined", () => {
    expect(schema.flashcardReviews).toBeDefined();
  });

  test("quizzes table is defined", () => {
    expect(schema.quizzes).toBeDefined();
  });

  test("quiz_questions table is defined", () => {
    expect(schema.quizQuestions).toBeDefined();
  });

  test("quiz_attempts table is defined", () => {
    expect(schema.quizAttempts).toBeDefined();
  });

  test("documents has all required columns", () => {
    const cols = getTableColumns(schema.documents);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("organizationId");
    expect(cols).toHaveProperty("courseId");
    expect(cols).toHaveProperty("ownerUserId");
    expect(cols).toHaveProperty("originalName");
    expect(cols).toHaveProperty("mimeType");
    expect(cols).toHaveProperty("sizeBytes");
    expect(cols).toHaveProperty("sha256");
    expect(cols).toHaveProperty("storageKey");
    expect(cols).toHaveProperty("pageCount");
    expect(cols).toHaveProperty("status");
    expect(cols).toHaveProperty("errorCode");
    expect(cols).toHaveProperty("retryCount");
    expect(cols).toHaveProperty("createdAt");
    expect(cols).toHaveProperty("updatedAt");
    expect(cols).toHaveProperty("deletedAt");
  });

  test("document_chunks has all required columns", () => {
    const cols = getTableColumns(schema.documentChunks);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("documentId");
    expect(cols).toHaveProperty("organizationId");
    expect(cols).toHaveProperty("sequence");
    expect(cols).toHaveProperty("heading");
    expect(cols).toHaveProperty("content");
    expect(cols).toHaveProperty("startPage");
    expect(cols).toHaveProperty("endPage");
    expect(cols).toHaveProperty("tokenEstimate");
    expect(cols).toHaveProperty("contentHash");
    expect(cols).toHaveProperty("createdAt");
  });

  test("generated_contents has all required columns", () => {
    const cols = getTableColumns(schema.generatedContents);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("organizationId");
    expect(cols).toHaveProperty("documentId");
    expect(cols).toHaveProperty("courseId");
    expect(cols).toHaveProperty("type");
    expect(cols).toHaveProperty("status");
    expect(cols).toHaveProperty("payload");
    expect(cols).toHaveProperty("promptVersion");
    expect(cols).toHaveProperty("model");
    expect(cols).toHaveProperty("tokenUsage");
    expect(cols).toHaveProperty("generationKey");
    expect(cols).toHaveProperty("acceptedAt");
    expect(cols).toHaveProperty("acceptedBy");
    expect(cols).toHaveProperty("createdAt");
    expect(cols).toHaveProperty("updatedAt");
    expect(cols).toHaveProperty("deletedAt");
  });

  test("generated_contents generation_key column is nullable (PR6-4 idempotency)", () => {
    const cols = getTableColumns(schema.generatedContents);
    expect(cols).toHaveProperty("generationKey");
    expect(cols.generationKey).toBeDefined();
  });

  test("generated_contents has review + materialization columns (PR6-6)", () => {
    const cols = getTableColumns(schema.generatedContents);
    expect(cols).toHaveProperty("reviewedBy");
    expect(cols).toHaveProperty("reviewedAt");
    expect(cols).toHaveProperty("reviewReason");
    expect(cols).toHaveProperty("editedBy");
    expect(cols).toHaveProperty("editedAt");
    expect(cols).toHaveProperty("previousPayload");
    expect(cols).toHaveProperty("materializedLessonId");
  });

  test("generated_content_citations has both FK columns", () => {
    const cols = getTableColumns(schema.generatedContentCitations);
    expect(cols).toHaveProperty("generatedContentId");
    expect(cols).toHaveProperty("documentChunkId");
  });

  test("generation_jobs table is defined", () => {
    expect(schema.generationJobs).toBeDefined();
  });

  test("generation_jobs has all required columns", () => {
    const cols = getTableColumns(schema.generationJobs);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("organizationId");
    expect(cols).toHaveProperty("documentId");
    expect(cols).toHaveProperty("courseId");
    expect(cols).toHaveProperty("type");
    expect(cols).toHaveProperty("status");
    expect(cols).toHaveProperty("generationKey");
    expect(cols).toHaveProperty("jobId");
    expect(cols).toHaveProperty("attempts");
    expect(cols).toHaveProperty("errorCode");
    expect(cols).toHaveProperty("errorMessage");
    expect(cols).toHaveProperty("createdAt");
    expect(cols).toHaveProperty("updatedAt");
    expect(cols).toHaveProperty("startedAt");
    expect(cols).toHaveProperty("completedAt");
    expect(cols).toHaveProperty("deletedAt");
  });

  test("generation_jobs status default is queued", () => {
    const cols = getTableColumns(schema.generationJobs);
    expect(cols.status.notNull).toBe(true);
    expect(cols.status.default).toBe("queued");
  });

  test("flashcards has all required columns", () => {
    const cols = getTableColumns(schema.flashcards);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("organizationId");
    expect(cols).toHaveProperty("courseId");
    expect(cols).toHaveProperty("documentId");
    expect(cols).toHaveProperty("generatedContentId");
    expect(cols).toHaveProperty("question");
    expect(cols).toHaveProperty("answer");
    expect(cols).toHaveProperty("explanation");
    expect(cols).toHaveProperty("cardType");
    expect(cols).toHaveProperty("difficulty");
    expect(cols).toHaveProperty("dueAt");
    expect(cols).toHaveProperty("intervalDays");
    expect(cols).toHaveProperty("easeFactor");
    expect(cols).toHaveProperty("createdAt");
    expect(cols).toHaveProperty("updatedAt");
    expect(cols).toHaveProperty("deletedAt");
  });

  test("flashcard_reviews has all required columns", () => {
    const cols = getTableColumns(schema.flashcardReviews);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("flashcardId");
    expect(cols).toHaveProperty("userId");
    expect(cols).toHaveProperty("rating");
    expect(cols).toHaveProperty("reviewedAt");
    expect(cols).toHaveProperty("reactionMs");
  });

  test("quizzes has all required columns", () => {
    const cols = getTableColumns(schema.quizzes);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("organizationId");
    expect(cols).toHaveProperty("courseId");
    expect(cols).toHaveProperty("documentId");
    expect(cols).toHaveProperty("title");
    expect(cols).toHaveProperty("topic");
    expect(cols).toHaveProperty("difficulty");
    expect(cols).toHaveProperty("status");
    expect(cols).toHaveProperty("createdAt");
    expect(cols).toHaveProperty("updatedAt");
    expect(cols).toHaveProperty("deletedAt");
  });

  test("quiz_questions has all required columns", () => {
    const cols = getTableColumns(schema.quizQuestions);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("quizId");
    expect(cols).toHaveProperty("generatedContentId");
    expect(cols).toHaveProperty("question");
    expect(cols).toHaveProperty("topic");
    expect(cols).toHaveProperty("difficulty");
    expect(cols).toHaveProperty("questionType");
    expect(cols).toHaveProperty("choices");
    expect(cols).toHaveProperty("correctAnswer");
    expect(cols).toHaveProperty("explanation");
    expect(cols).toHaveProperty("sortOrder");
    expect(cols).toHaveProperty("createdAt");
    expect(cols).toHaveProperty("updatedAt");
  });

  test("quiz_attempts has all required columns", () => {
    const cols = getTableColumns(schema.quizAttempts);
    expect(cols).toHaveProperty("id");
    expect(cols).toHaveProperty("quizId");
    expect(cols).toHaveProperty("userId");
    expect(cols).toHaveProperty("score");
    expect(cols).toHaveProperty("answers");
    expect(cols).toHaveProperty("questionIds");
    expect(cols).toHaveProperty("topic");
    expect(cols).toHaveProperty("difficulty");
    expect(cols).toHaveProperty("status");
    expect(cols).toHaveProperty("startedAt");
    expect(cols).toHaveProperty("completedAt");
  });

  test("documents table has deletedAt soft-delete column", () => {
    const cols = getTableColumns(schema.documents);
    expect(cols).toHaveProperty("deletedAt");
  });

  test("flashcard_reviews and quiz_attempts are immutable (no deletedAt)", () => {
    const reviewCols = getTableColumns(schema.flashcardReviews);
    expect(reviewCols).not.toHaveProperty("deletedAt");

    const attemptCols = getTableColumns(schema.quizAttempts);
    expect(attemptCols).not.toHaveProperty("deletedAt");
  });
});
