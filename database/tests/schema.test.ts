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
});
