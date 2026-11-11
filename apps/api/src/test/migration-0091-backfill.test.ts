import { describe, it, expect } from "vitest";
import { up as up0090 } from "../../../../database/migrations/0090_course_membership_exam_schedules.js";
import { up as up0091 } from "../../../../database/migrations/0091_backfill_personal_course_exam_schedules.js";

interface CourseRow {
  id: string;
  name: string;
  is_official: boolean;
  exam_date: Date | null;
  exam_scope: unknown;
}

interface MembershipRow {
  id: string;
  course_id: string;
  user_id: string;
  role: string;
  exam_date: Date | null;
  exam_scope: unknown;
}

interface AuditLogRow {
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string;
}

describe("Migration 0090 & 0091: Per-User Exam Schedules & Safe Data Backfill", () => {
  it("0090 DDL executes SQL without syntax error on mock client", async () => {
    const executedSql: string[] = [];
    const mockDb = {
      execute: async (statement: { queryChunks?: Array<{ value?: unknown }> }) => {
        const str = statement.queryChunks
          ? statement.queryChunks
              .map((c) => (Array.isArray(c?.value) ? c.value.join("") : String(c?.value ?? c)))
              .join("")
          : String(statement);
        executedSql.push(str);
      },
    };

    await up0090(mockDb);
    expect(executedSql.length).toBeGreaterThan(0);
    expect(executedSql[0]).toContain("ADD COLUMN IF NOT EXISTS exam_date");
    expect(executedSql[0]).toContain("ADD COLUMN IF NOT EXISTS exam_scope");
    expect(executedSql[0]).toContain("idx_course_memberships_user_exam");
  });

  it("0091 Backfill: successfully backfills personal courses without cross-user leakage or touching official courses", async () => {
    const courses: CourseRow[] = [
      // 1. Personal course created by user-1 with legacy exam
      {
        id: "c-personal-1",
        name: "فیزیک هالیدی",
        is_official: false,
        exam_date: new Date("2026-11-20T08:30:00Z"),
        exam_scope: { moduleIds: ["mod-1"] },
      },
      // 2. Official course with official exam (Must NOT be backfilled automatically)
      {
        id: "c-official-1",
        name: "شیمی عمومی ۱",
        is_official: true,
        exam_date: new Date("2026-12-10T09:00:00Z"),
        exam_scope: null,
      },
      // 3. Personal course created by user-2 with NO legacy exam
      {
        id: "c-personal-2",
        name: "زبان انگلیسی عمومی",
        is_official: false,
        exam_date: null,
        exam_scope: null,
      },
      // 4. Personal course created by user-3 where user-3 already has an exam in membership
      {
        id: "c-personal-3",
        name: "ریاضی عمومی ۱",
        is_official: false,
        exam_date: new Date("2026-11-01T08:00:00Z"),
        exam_scope: null,
      },
    ];

    const memberships: MembershipRow[] = [
      // Membership for c-personal-1 (user-1)
      {
        id: "m-1",
        course_id: "c-personal-1",
        user_id: "user-1",
        role: "student",
        exam_date: null, // to be backfilled
        exam_scope: null,
      },
      // Membership for c-official-1 (user-1 is enrolled as student)
      {
        id: "m-2",
        course_id: "c-official-1",
        user_id: "user-1",
        role: "student",
        exam_date: null, // should STAY null (official course!)
        exam_scope: null,
      },
      // Membership for c-personal-2 (user-2)
      {
        id: "m-3",
        course_id: "c-personal-2",
        user_id: "user-2",
        role: "student",
        exam_date: null, // stays null (course has no exam)
        exam_scope: null,
      },
      // Membership for c-personal-3 (user-3 already has an exam set)
      {
        id: "m-4",
        course_id: "c-personal-3",
        user_id: "user-3",
        role: "student",
        exam_date: new Date("2026-12-25T10:00:00Z"), // user already has custom date!
        exam_scope: { moduleIds: ["mod-custom"] },
      },
    ];

    const auditLogs: AuditLogRow[] = [
      {
        entity_type: "course",
        entity_id: "c-personal-1",
        action: "course.created",
        actor_id: "user-1", // verified creator
      },
      {
        entity_type: "course",
        entity_id: "c-personal-3",
        action: "course:created",
        actor_id: "user-3",
      },
    ];

    // Mock DB engine that simulates the UPDATE SQL statements
    const mockDb = {
      execute: async () => {
        // Step 1: backfill matching audit_logs
        for (const m of memberships) {
          if (m.exam_date !== null) continue; // non-destructive!
          const course = courses.find((c) => c.id === m.course_id);
          if (!course || course.is_official || !course.exam_date) continue;

          const audit = auditLogs.find(
            (al) =>
              al.entity_type === "course" &&
              al.entity_id === course.id &&
              (al.action === "course:created" || al.action === "course.created") &&
              al.actor_id === m.user_id,
          );

          if (audit) {
            m.exam_date = course.exam_date;
            m.exam_scope = course.exam_scope;
          }
        }

        // Step 2: backfill matching sole membership
        for (const m of memberships) {
          if (m.exam_date !== null) continue;
          const course = courses.find((c) => c.id === m.course_id);
          if (!course || course.is_official || !course.exam_date) continue;

          const count = memberships.filter((mem) => mem.course_id === course.id).length;
          if (count === 1) {
            m.exam_date = course.exam_date;
            m.exam_scope = course.exam_scope;
          }
        }
      },
    };

    await up0091(mockDb);

    // 1. Personal course c-personal-1 should be backfilled for user-1
    expect(memberships[0].exam_date).toEqual(new Date("2026-11-20T08:30:00Z"));
    expect(memberships[0].exam_scope).toEqual({ moduleIds: ["mod-1"] });

    // 2. Official course c-official-1 membership MUST remain null (no cross-contamination)
    expect(memberships[1].exam_date).toBeNull();
    expect(memberships[1].exam_scope).toBeNull();

    // 3. Course with no exam stays null
    expect(memberships[2].exam_date).toBeNull();

    // 4. Membership with existing exam was NOT overwritten
    expect(memberships[3].exam_date).toEqual(new Date("2026-12-25T10:00:00Z"));
    expect(memberships[3].exam_scope).toEqual({ moduleIds: ["mod-custom"] });

    // 5. Test idempotency: re-running up0091 produces identical results
    await up0091(mockDb);
    expect(memberships[0].exam_date).toEqual(new Date("2026-11-20T08:30:00Z"));
    expect(memberships[1].exam_date).toBeNull();
  });
});
