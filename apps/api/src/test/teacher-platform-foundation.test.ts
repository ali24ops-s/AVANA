import { describe, it, expect, beforeEach } from "vitest";
import {
  buildActor,
  defaultPolicy,
  asUserId,
  asOrganizationId,
  gradeAttempt,
  calculateRuntimeExamState,
  assertQuestionMutationAllowed,
  validateCreateClassroomInput,
  validateCreateExamInput,
  validateTeacherQuestionInput,
  type ExamSnapshotQuestion,
  type ResourceContext,
} from "@avana/domain";
import {
  InMemoryClassroomStore,
  InMemoryClassroomMemberStore,
  InMemoryTeacherExamStore,
  InMemoryTeacherExamQuestionStore,
  InMemoryTeacherExamAttemptStore,
  InMemoryTeacherExamAttemptAnswerStore,
  DrizzleTeacherExamAttemptStore,
} from "../modules/teacher-platform/index.js";

describe("Teacher Platform — Foundation & Invariants Test Suite", () => {
  let classroomStore: InMemoryClassroomStore;
  let memberStore: InMemoryClassroomMemberStore;
  let examStore: InMemoryTeacherExamStore;
  let questionStore: InMemoryTeacherExamQuestionStore;
  let attemptStore: InMemoryTeacherExamAttemptStore;
  let answerStore: InMemoryTeacherExamAttemptAnswerStore;

  const orgId1 = "11111111-1111-4111-8111-111111111111";
  const orgId2 = "22222222-2222-4222-8222-222222222222";
  const teacherId1 = "33333333-3333-4333-8333-333333333333";
  const teacherId2 = "44444444-4444-4444-8444-444444444444";
  const studentId1 = "55555555-5555-4555-8555-555555555555";
  const studentId2 = "66666666-6666-4666-8666-666666666666";

  beforeEach(() => {
    classroomStore = new InMemoryClassroomStore();
    memberStore = new InMemoryClassroomMemberStore();
    examStore = new InMemoryTeacherExamStore();
    questionStore = new InMemoryTeacherExamQuestionStore();
    attemptStore = new InMemoryTeacherExamAttemptStore();
    answerStore = new InMemoryTeacherExamAttemptAnswerStore();

    // Wire references
    classroomStore.examStore = examStore;
    classroomStore.attemptStore = attemptStore;
    examStore.attemptStore = attemptStore;
    questionStore.examStore = examStore;
  });

  // =========================================================================
  // 1. Membership Semantics Suite
  // =========================================================================
  describe("Membership Lifecycle & Rejoin Semantics", () => {
    it("preserves firstJoinedAt and clears leftAt upon rejoin", async () => {
      const classroom = await classroomStore.create({
        id: "c-1",
        organizationId: orgId1,
        teacherId: teacherId1,
        title: "کلاس بیهوشی ۱",
        inviteCode: "AVANA-101",
        status: "active",
      });

      // 1. Initial Join
      const initialMember = await memberStore.addMember({
        id: "m-1",
        classroomId: classroom.id,
        studentId: studentId1,
        status: "active",
        firstJoinedAt: "2026-01-01T10:00:00.000Z",
        lastJoinedAt: "2026-01-01T10:00:00.000Z",
      });
      expect(initialMember.status).toBe("active");
      expect(initialMember.firstJoinedAt).toBe("2026-01-01T10:00:00.000Z");
      expect(initialMember.leftAt).toBeNull();

      // 2. Student Leaves
      const leftMember = await memberStore.updateStatus(classroom.id, studentId1, "left");
      expect(leftMember?.status).toBe("left");
      expect(leftMember?.leftAt).not.toBeNull();
      const leftTimestamp = leftMember?.leftAt;

      // 3. Student Rejoins
      const rejoinedMember = await memberStore.rejoinMember(classroom.id, studentId1);
      expect(rejoinedMember?.status).toBe("active");
      expect(rejoinedMember?.firstJoinedAt).toBe("2026-01-01T10:00:00.000Z"); // strictly preserved!
      expect(rejoinedMember?.leftAt).toBeNull(); // cleared!
      expect(new Date(rejoinedMember!.lastJoinedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(leftTimestamp!).getTime(),
      );
    });

    it("handles teacher removing student and subsequent rejoin", async () => {
      const classroom = await classroomStore.create({
        id: "c-2",
        organizationId: orgId1,
        teacherId: teacherId1,
        title: "کلاس داروشناسی",
        inviteCode: "AVANA-102",
        status: "active",
      });

      await memberStore.addMember({
        id: "m-2",
        classroomId: classroom.id,
        studentId: studentId2,
        status: "active",
        firstJoinedAt: "2026-02-01T10:00:00.000Z",
        lastJoinedAt: "2026-02-01T10:00:00.000Z",
      });

      // Teacher removes student
      const removed = await memberStore.updateStatus(classroom.id, studentId2, "removed");
      expect(removed?.status).toBe("removed");
      expect(removed?.leftAt).not.toBeNull();

      // Rejoin via addMember with existing studentId restores record
      const rejoined = await memberStore.addMember({
        id: "m-new",
        classroomId: classroom.id,
        studentId: studentId2,
        status: "active",
        firstJoinedAt: new Date().toISOString(),
        lastJoinedAt: new Date().toISOString(),
      });

      expect(rejoined.status).toBe("active");
      expect(rejoined.firstJoinedAt).toBe("2026-02-01T10:00:00.000Z");
      expect(rejoined.leftAt).toBeNull();
    });

    it("prevents duplicate active memberships in the same classroom", async () => {
      await classroomStore.create({
        id: "c-3",
        organizationId: orgId1,
        teacherId: teacherId1,
        title: "کلاس تست تکرار",
        inviteCode: "AVANA-103",
        status: "active",
      });

      await memberStore.addMember({
        id: "m-3",
        classroomId: "c-3",
        studentId: studentId1,
        status: "active",
        firstJoinedAt: new Date().toISOString(),
        lastJoinedAt: new Date().toISOString(),
      });

      // Duplicate active join should throw conflict
      await expect(
        memberStore.addMember({
          id: "m-3-dup",
          classroomId: "c-3",
          studentId: studentId1,
          status: "active",
          firstJoinedAt: new Date().toISOString(),
          lastJoinedAt: new Date().toISOString(),
        }),
      ).rejects.toThrowError(/عضو فعال این کلاس است/);
    });

    it("preserves student attempts even after student leaves or is removed", async () => {
      const exam = await examStore.create({
        id: "e-1",
        classroomId: "c-hist",
        title: "آزمون فارماکولوژی",
        durationMinutes: 30,
        startsAt: "2026-03-01T10:00:00.000Z",
        endsAt: "2026-03-01T12:00:00.000Z",
        passingScorePercentage: 60,
        shuffleQuestions: true,
        shuffleOptions: true,
        showResultsImmediately: false,
        status: "published",
      });

      // Student starts attempt
      const attempt = await attemptStore.create({
        id: "att-1",
        examId: exam.id,
        studentId: studentId1,
        status: "submitted",
        startedAt: "2026-03-01T10:05:00.000Z",
        deadlineAt: "2026-03-01T10:35:00.000Z",
        submittedAt: "2026-03-01T10:25:00.000Z",
        score: 85,
        maxScore: 100,
        percentage: 85,
        passed: true,
        questionSnapshot: [],
      });

      // Student is removed from classroom
      await memberStore.updateStatus("c-hist", studentId1, "removed");

      // Verify attempt remains intact and queryable by teacher/admin
      const retrieved = await attemptStore.getById(attempt.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.score).toBe(85);
      expect(retrieved?.status).toBe("submitted");
    });
  });

  // =========================================================================
  // 2. DB / Store Invariants Suite
  // =========================================================================
  describe("Store Invariants & Academic Integrity", () => {
    it("enforces single attempt per student on an exam", async () => {
      const exam = await examStore.create({
        id: "e-single",
        classroomId: "c-1",
        title: "آزمون جامع تک تلاشی",
        durationMinutes: 45,
        startsAt: "2026-03-01T10:00:00.000Z",
        endsAt: "2026-03-01T12:00:00.000Z",
        passingScorePercentage: 60,
        shuffleQuestions: true,
        shuffleOptions: true,
        showResultsImmediately: false,
        status: "published",
      });

      await attemptStore.create({
        id: "att-first",
        examId: exam.id,
        studentId: studentId1,
        status: "in_progress",
        startedAt: new Date().toISOString(),
        deadlineAt: new Date().toISOString(),
        questionSnapshot: [],
      });

      // Second attempt by same student on same exam must fail
      await expect(
        attemptStore.create({
          id: "att-second",
          examId: exam.id,
          studentId: studentId1,
          status: "in_progress",
          startedAt: new Date().toISOString(),
          deadlineAt: new Date().toISOString(),
          questionSnapshot: [],
        }),
      ).rejects.toThrowError(/قبلاً در این آزمون شرکت کرده است/);
    });

    it("enforces invite code uniqueness across classrooms", async () => {
      await classroomStore.create({
        id: "c-u1",
        organizationId: orgId1,
        teacherId: teacherId1,
        title: "کلاس الف",
        inviteCode: "UNIQUE-01",
        status: "active",
      });

      await expect(
        classroomStore.create({
          id: "c-u2",
          organizationId: orgId1,
          teacherId: teacherId2,
          title: "کلاس ب",
          inviteCode: "UNIQUE-01", // duplicate!
          status: "active",
        }),
      ).rejects.toThrowError(/کد دعوت UNIQUE-01 قبلاً استفاده شده است/);
    });

    it("maintains question orderIndex sorting", async () => {
      const exam = await examStore.create({
        id: "e-order",
        classroomId: "c-1",
        title: "آزمون ترتیب سوالات",
        durationMinutes: 30,
        startsAt: "2026-03-01T10:00:00.000Z",
        endsAt: "2026-03-01T12:00:00.000Z",
        passingScorePercentage: 60,
        shuffleQuestions: false,
        shuffleOptions: false,
        showResultsImmediately: false,
        status: "draft",
      });

      await questionStore.create({
        id: "q-2",
        examId: exam.id,
        orderIndex: 2,
        prompt: "سوال دوم",
        options: [{ id: "opt-1", text: "گزینه" }],
        correctOptionId: "opt-1",
        points: 1,
      });

      await questionStore.create({
        id: "q-0",
        examId: exam.id,
        orderIndex: 0,
        prompt: "سوال صفرم",
        options: [{ id: "opt-1", text: "گزینه" }],
        correctOptionId: "opt-1",
        points: 1,
      });

      await questionStore.create({
        id: "q-1",
        examId: exam.id,
        orderIndex: 1,
        prompt: "سوال یکم",
        options: [{ id: "opt-1", text: "گزینه" }],
        correctOptionId: "opt-1",
        points: 1,
      });

      const list = await questionStore.listByExam(exam.id);
      expect(list.map((q) => q.id)).toEqual(["q-0", "q-1", "q-2"]);
    });

    it("prohibits question creation, update, or deletion once exam is published", async () => {
      const exam = await examStore.create({
        id: "e-locked",
        classroomId: "c-1",
        title: "آزمون نهایی قفل‌شده",
        durationMinutes: 30,
        startsAt: "2026-03-01T10:00:00.000Z",
        endsAt: "2026-03-01T12:00:00.000Z",
        passingScorePercentage: 60,
        shuffleQuestions: true,
        shuffleOptions: true,
        showResultsImmediately: false,
        status: "draft",
      });

      const q = await questionStore.create({
        id: "q-orig",
        examId: exam.id,
        orderIndex: 0,
        prompt: "صورت سوال اولیه",
        options: [{ id: "opt-1", text: "گزینه" }],
        correctOptionId: "opt-1",
        points: 1,
      });

      // Publish the exam
      await examStore.publish(exam.id);

      // Now question mutations must fail
      await expect(
        questionStore.create({
          id: "q-new",
          examId: exam.id,
          orderIndex: 1,
          prompt: "صورت سوال جدید غیرمجاز",
          options: [{ id: "opt-1", text: "گزینه" }],
          correctOptionId: "opt-1",
          points: 1,
        }),
      ).rejects.toThrowError(/Questions are immutable once published/);

      await expect(
        questionStore.update(q.id, { prompt: "ویرایش غیرمجاز" }),
      ).rejects.toThrowError(/Questions are immutable once published/);

      await expect(questionStore.delete(q.id)).rejects.toThrowError(
        /Questions are immutable once published/,
      );
    });

    it("prevents hard delete of classroom if exams or attempts exist", async () => {
      const classroom = await classroomStore.create({
        id: "c-protected",
        organizationId: orgId1,
        teacherId: teacherId1,
        title: "کلاس محافظت شده",
        inviteCode: "PROT-101",
        status: "active",
      });

      await examStore.create({
        id: "e-on-class",
        classroomId: classroom.id,
        title: "آزمون کلاسی",
        durationMinutes: 30,
        startsAt: "2026-03-01T10:00:00.000Z",
        endsAt: "2026-03-01T12:00:00.000Z",
        passingScorePercentage: 60,
        shuffleQuestions: true,
        shuffleOptions: true,
        showResultsImmediately: false,
        status: "draft",
      });

      const canDelete = await classroomStore.delete(classroom.id);
      expect(canDelete).toBe(false); // Hard delete refused!

      // Classroom should still exist
      const stillThere = await classroomStore.getById(classroom.id);
      expect(stillThere).not.toBeNull();
    });
  });

  // =========================================================================
  // 3. Authorization & Policy Invariants Suite
  // =========================================================================
  describe("Authorization & Tenancy Policy", () => {
    it("allows teacher to manage classrooms and exams in their organization", () => {
      const teacherActor = buildActor({
        userId: asUserId(teacherId1),
        memberships: [
          {
            organizationId: asOrganizationId(orgId1),
            role: "teacher",
          },
        ],
      });

      // Within orgId1 -> allowed
      expect(
        defaultPolicy.can(teacherActor, "classroom:create", { organizationId: orgId1 }),
      ).toBe(true);
      expect(
        defaultPolicy.can(teacherActor, "teacher_exam:create", { organizationId: orgId1 }),
      ).toBe(true);
      expect(
        defaultPolicy.can(teacherActor, "teacher_exam:publish", { organizationId: orgId1 }),
      ).toBe(true);
      expect(
        defaultPolicy.can(teacherActor, "teacher_exam:view_results", { organizationId: orgId1 }),
      ).toBe(true);

      // In orgId2 where teacher has NO membership -> forbidden
      expect(
        defaultPolicy.can(teacherActor, "classroom:create", { organizationId: orgId2 }),
      ).toBe(false);
      expect(
        defaultPolicy.can(teacherActor, "teacher_exam:create", { organizationId: orgId2 }),
      ).toBe(false);
    });

    it("allows organization_admin oversight within their organization", () => {
      const orgAdminActor = buildActor({
        userId: asUserId(teacherId2),
        memberships: [
          {
            organizationId: asOrganizationId(orgId1),
            role: "organization_admin",
          },
        ],
      });

      expect(
        defaultPolicy.can(orgAdminActor, "classroom:read", { organizationId: orgId1 }),
      ).toBe(true);
      expect(
        defaultPolicy.can(orgAdminActor, "classroom:archive", { organizationId: orgId1 }),
      ).toBe(true);
      expect(
        defaultPolicy.can(orgAdminActor, "teacher_exam:view_results", { organizationId: orgId1 }),
      ).toBe(true);

      // In foreign org -> forbidden
      expect(
        defaultPolicy.can(orgAdminActor, "classroom:archive", { organizationId: orgId2 }),
      ).toBe(false);
    });

    it("restricts student to student-facing actions only", () => {
      const studentActor = buildActor({
        userId: asUserId(studentId1),
        memberships: [
          {
            organizationId: asOrganizationId(orgId1),
            role: "student",
          },
        ],
      });

      expect(
        defaultPolicy.can(studentActor, "classroom:read", { organizationId: orgId1 }),
      ).toBe(true);
      expect(
        defaultPolicy.can(studentActor, "classroom:join", { organizationId: orgId1 }),
      ).toBe(true);
      expect(
        defaultPolicy.can(studentActor, "teacher_exam:attempt", { organizationId: orgId1 }),
      ).toBe(true);

      // Student must NOT have teacher authoring rights
      expect(
        defaultPolicy.can(studentActor, "classroom:create", { organizationId: orgId1 }),
      ).toBe(false);
      expect(
        defaultPolicy.can(studentActor, "teacher_exam:create", { organizationId: orgId1 }),
      ).toBe(false);
      expect(
        defaultPolicy.can(studentActor, "teacher_exam:publish", { organizationId: orgId1 }),
      ).toBe(false);
      expect(
        defaultPolicy.can(studentActor, "teacher_exam:view_results", { organizationId: orgId1 }),
      ).toBe(false);
    });

    it("strictly isolates course_editor and content_worker from teacher platform", () => {
      const editorActor = buildActor({
        userId: asUserId("editor-1"),
        memberships: [
          {
            organizationId: asOrganizationId(orgId1),
            role: "course_editor",
          },
        ],
      });

      const workerActor = buildActor({
        userId: asUserId("worker-1"),
        globalRole: "content_worker",
      });

      // Zero access to classroom or teacher exams
      expect(
        defaultPolicy.can(editorActor, "classroom:create", { organizationId: orgId1 }),
      ).toBe(false);
      expect(
        defaultPolicy.can(editorActor, "teacher_exam:create", { organizationId: orgId1 }),
      ).toBe(false);
      expect(
        defaultPolicy.can(editorActor, "teacher_exam:attempt", { organizationId: orgId1 }),
      ).toBe(false);

      expect(defaultPolicy.can(workerActor, "classroom:create")).toBe(false);
      expect(defaultPolicy.can(workerActor, "teacher_exam:create")).toBe(false);
      expect(defaultPolicy.can(workerActor, "teacher_exam:attempt")).toBe(false);
    });

    it("allows support_agent read-only view for troubleshooting", () => {
      const supportActor = buildActor({
        userId: asUserId("support-1"),
        role: "support_agent",
      });

      expect(defaultPolicy.can(supportActor, "classroom:read")).toBe(true);
      expect(defaultPolicy.can(supportActor, "teacher_exam:read")).toBe(true);
      expect(defaultPolicy.can(supportActor, "teacher_exam:view_results")).toBe(true);

      // Cannot mutate
      expect(defaultPolicy.can(supportActor, "classroom:create")).toBe(false);
      expect(defaultPolicy.can(supportActor, "teacher_exam:publish")).toBe(false);
    });

    it("gives platform_admin superuser bypass across all actions and contexts", () => {
      const adminActor = buildActor({
        userId: asUserId("admin-1"),
        globalRole: "platform_admin",
      });

      expect(
        defaultPolicy.can(adminActor, "classroom:create", { organizationId: orgId1 }),
      ).toBe(true);
      expect(
        defaultPolicy.can(adminActor, "classroom:delete", { organizationId: orgId2 }),
      ).toBe(true);
      expect(
        defaultPolicy.can(adminActor, "teacher_exam:grade", { organizationId: orgId1 }),
      ).toBe(true);
    });
  });

  describe("Drizzle Attempt Store Concurrency & Violation Handling", () => {
    it("catches 23505 unique violation for idx_exam_attempts_single_student and throws DomainError conflict", async () => {
      const mockDb = {
        insert: () => ({
          values: () => ({
            returning: async () => {
              const err = Object.assign(
                new Error(
                  'duplicate key value violates unique constraint "idx_exam_attempts_single_student"',
                ),
                {
                  code: "23505",
                  constraint: "idx_exam_attempts_single_student",
                },
              );
              throw err;
            },
          }),
        }),
      } as unknown as Parameters<typeof DrizzleTeacherExamAttemptStore.prototype.constructor>[0];

      const drizzleStore = new DrizzleTeacherExamAttemptStore(mockDb);
      await expect(
        drizzleStore.create({
          id: "att-1",
          examId: "exam-1",
          studentId: "student-1",
          startedAt: new Date().toISOString(),
          deadlineAt: new Date().toISOString(),
          questionSnapshot: [],
        }),
      ).rejects.toMatchObject({
        code: "conflict",
        message: "دانش‌آموز قبلاً در این آزمون شرکت کرده است",
      });
    });

    it("rethrows unrelated 23505 unique violation (e.g. teacher_exam_attempts_pkey) without converting to domain conflict", async () => {
      const pkeyError = Object.assign(
        new Error(
          'duplicate key value violates unique constraint "teacher_exam_attempts_pkey"',
        ),
        {
          code: "23505",
          constraint: "teacher_exam_attempts_pkey",
        },
      );

      const mockDb = {
        insert: () => ({
          values: () => ({
            returning: async () => {
              throw pkeyError;
            },
          }),
        }),
      } as unknown as Parameters<typeof DrizzleTeacherExamAttemptStore.prototype.constructor>[0];

      const drizzleStore = new DrizzleTeacherExamAttemptStore(mockDb);
      await expect(
        drizzleStore.create({
          id: "att-1",
          examId: "exam-1",
          studentId: "student-1",
          startedAt: new Date().toISOString(),
          deadlineAt: new Date().toISOString(),
          questionSnapshot: [],
        }),
      ).rejects.toThrow('duplicate key value violates unique constraint "teacher_exam_attempts_pkey"');
    });

    it("rethrows non-23505 database errors unchanged", async () => {
      const foreignKeyError = Object.assign(
        new Error(
          'insert or update on table "teacher_exam_attempts" violates foreign key constraint "teacher_exam_attempts_student_id_users_id_fk"',
        ),
        {
          code: "23503",
          constraint: "teacher_exam_attempts_student_id_users_id_fk",
        },
      );

      const mockDb = {
        insert: () => ({
          values: () => ({
            returning: async () => {
              throw foreignKeyError;
            },
          }),
        }),
      } as unknown as Parameters<typeof DrizzleTeacherExamAttemptStore.prototype.constructor>[0];

      const drizzleStore = new DrizzleTeacherExamAttemptStore(mockDb);
      await expect(
        drizzleStore.create({
          id: "att-1",
          examId: "exam-1",
          studentId: "student-1",
          startedAt: new Date().toISOString(),
          deadlineAt: new Date().toISOString(),
          questionSnapshot: [],
        }),
      ).rejects.toThrow('violates foreign key constraint');
    });

    it("finalizeAttempt rejects with conflict if attempt is not in_progress", async () => {
      const mockTx = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: async () => [
                {
                  id: "att-1",
                  examId: "exam-1",
                  studentId: "student-1",
                  status: "submitted",
                  startedAt: new Date(),
                  deadlineAt: new Date(),
                  submittedAt: new Date(),
                  completedAt: new Date(),
                  score: "20.00",
                  maxScore: "20.00",
                  percentage: "100.00",
                  passed: true,
                  questionSnapshot: [],
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ],
            }),
          }),
        }),
      };

      const mockDb = {
        transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      } as unknown as Parameters<typeof DrizzleTeacherExamAttemptStore.prototype.constructor>[0];

      const drizzleStore = new DrizzleTeacherExamAttemptStore(mockDb);
      await expect(
        drizzleStore.finalizeAttempt("att-1", "submitted", 50),
      ).rejects.toMatchObject({
        code: "conflict",
        message: "این آزمون قبلاً پایان یافته و ثبت شده است",
      });
    });
  });

  // =========================================================================
  // 9. Optional Duration & Passing Score Semantics Suite
  // =========================================================================
  describe("Optional Exam Duration & Passing Score Semantics", () => {
    it("validates create input with null duration and null passingScorePercentage", () => {
      const valid = validateCreateExamInput({
        title: "آزمون بدون محدودیت زمانی و حد نصاب",
        startsAt: "2026-10-01T10:00:00.000Z",
        endsAt: "2026-10-01T12:00:00.000Z",
        durationMinutes: null,
        passingScorePercentage: null,
      });

      expect(valid.durationMinutes).toBeNull();
      expect(valid.passingScorePercentage).toBeNull();
    });

    it("gradeAttempt correctly sets passed=null when passingScorePercentage is null or undefined", () => {
      const questions: ExamSnapshotQuestion[] = [
        {
          id: "q-1",
          orderIndex: 0,
          questionType: "single_choice",
          prompt: "پایتخت ایران؟",
          options: [{ id: "opt-1", text: "تهران" }, { id: "opt-2", text: "شیراز" }],
          correctOptionId: "opt-1",
          points: 10,
        },
      ];

      const answers = [{ questionId: "q-1", selectedOptionId: "opt-1" }];

      // When passingScorePercentage is null -> passed is null
      const resultNull = gradeAttempt(questions, answers, null);
      expect(resultNull.totalScore).toBe(10);
      expect(resultNull.percentage).toBe(100);
      expect(resultNull.passed).toBeNull();

      // When passingScorePercentage is undefined -> passed is null
      const resultUndef = gradeAttempt(questions, answers, undefined);
      expect(resultUndef.passed).toBeNull();

      // When passingScorePercentage is 0% -> passed is true
      const resultZero = gradeAttempt(questions, answers, 0);
      expect(resultZero.passed).toBe(true);

      // When passingScorePercentage is 60% and student gets 100% -> passed is true
      const resultSixty = gradeAttempt(questions, answers, 60);
      expect(resultSixty.passed).toBe(true);
    });

    it("InMemoryTeacherExamStore creates and updates exams with null duration and passing score", async () => {
      const exam = await examStore.create({
        id: "exam-null-test",
        classroomId: "c-1",
        title: "آزمون منعطف",
        startsAt: "2026-10-01T10:00:00.000Z",
        endsAt: "2026-10-01T12:00:00.000Z",
        durationMinutes: null,
        passingScorePercentage: null,
        shuffleQuestions: true,
        shuffleOptions: true,
        showResultsImmediately: false,
      });

      expect(exam.durationMinutes).toBeNull();
      expect(exam.passingScorePercentage).toBeNull();

      // Update to enable duration and passing score
      const updatedEnabled = await examStore.update(exam.id, {
        durationMinutes: 45,
        passingScorePercentage: 70,
      });
      expect(updatedEnabled?.durationMinutes).toBe(45);
      expect(updatedEnabled?.passingScorePercentage).toBe(70);

      // Update back to null
      const updatedDisabled = await examStore.update(exam.id, {
        durationMinutes: null,
        passingScorePercentage: null,
      });
      expect(updatedDisabled?.durationMinutes).toBeNull();
      expect(updatedDisabled?.passingScorePercentage).toBeNull();
    });
  });
});
