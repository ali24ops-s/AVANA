import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { sql, eq, and, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  courses,
  modules,
  lessons,
  flashcards,
  quizzes,
  quizQuestions,
  courseDraftSessions,
  courseDraftChanges,
  courseReleases,
  users,
  organizations,
  documents,
  generatedContents,
} from "@avana/database/schema";
import {
  type Actor,
  asCourseId,
  asCourseDraftSessionId,
  asUserId,
  asOrganizationId,
  parseUUID,
} from "@avana/domain";
import { DrizzleCourseStore } from "../modules/courses/drizzle-stores.js";
import {
  DrizzleCourseDraftSessionStore,
  DrizzleCourseDraftChangeStore,
  DrizzleCourseReleaseStore,
} from "../modules/courses/drizzle-draft-store.js";
import {
  DrizzleModuleStore,
  DrizzleLessonStore,
  DrizzleDocumentStore,
} from "../modules/learning/drizzle-stores.js";
import {
  DrizzleFlashcardStore,
  DrizzleQuizStore,
  DrizzleQuizQuestionStore,
} from "../modules/study/drizzle-stores.js";
import { DrizzleAdminStore } from "../modules/admin/drizzle-stores.js";
import { DrizzleGeneratedContentStore } from "../modules/generation/drizzle-stores.js";
import { ReviewService } from "../modules/generation/review-service.js";
import { OfficialContentService } from "../modules/admin/official-content-service.js";
import { CourseDraftService } from "../modules/courses/course-draft-service.js";

describe("Real PostgreSQL: Course Drafts, Atomic Publish & Rollback Lifecycle", () => {
  const dbUrl =
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

  let client: ReturnType<typeof createDbClient>;
  let isConnected = false;

  let courseStore: DrizzleCourseStore;
  let draftSessionStore: DrizzleCourseDraftSessionStore;
  let draftChangeStore: DrizzleCourseDraftChangeStore;
  let releaseStore: DrizzleCourseReleaseStore;
  let moduleStore: DrizzleModuleStore;
  let lessonStore: DrizzleLessonStore;
  let flashcardStore: DrizzleFlashcardStore;
  let quizStore: DrizzleQuizStore;
  let quizQuestionStore: DrizzleQuizQuestionStore;
  let adminStore: DrizzleAdminStore;
  let generatedContentStore: DrizzleGeneratedContentStore;
  let documentStore: DrizzleDocumentStore;
  let reviewService: ReviewService;
  let officialContentService: OfficialContentService;
  let draftService: CourseDraftService;

  let testOrgId: string;
  let testUserId: string;
  let actor: Actor;

  beforeAll(async () => {
    try {
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      isConnected = true;

      // Seed a test user & organization
      testOrgId = randomUUID();
      testUserId = randomUUID();
      actor = {
        userId: asUserId(parseUUID(testUserId)),
        role: "platform_admin",
      };

      await client.db.insert(organizations).values({
        id: testOrgId,
        name: "Test Academy Real Postgres",
        slug: `test-org-${Date.now()}`,
      });

      await client.db.insert(users).values({
        id: testUserId,
        email: `admin-draft-${Date.now()}@avana.test`,
        name: "Draft Admin",
        globalRole: "platform_admin",
      });

      courseStore = new DrizzleCourseStore(client.db);
      draftSessionStore = new DrizzleCourseDraftSessionStore(client.db);
      draftChangeStore = new DrizzleCourseDraftChangeStore(client.db);
      releaseStore = new DrizzleCourseReleaseStore(client.db);
      moduleStore = new DrizzleModuleStore(client.db);
      lessonStore = new DrizzleLessonStore(client.db);
      flashcardStore = new DrizzleFlashcardStore(client.db);
      quizStore = new DrizzleQuizStore(client.db);
      quizQuestionStore = new DrizzleQuizQuestionStore(client.db);
      adminStore = new DrizzleAdminStore(client.db);
      generatedContentStore = new DrizzleGeneratedContentStore(client.db);
      documentStore = new DrizzleDocumentStore(client.db);

      draftService = new CourseDraftService({
        courseStore,
        draftSessionStore,
        draftChangeStore,
        releaseStore,
        moduleStore,
        lessonStore,
        flashcardStore,
        quizStore,
        quizQuestionStore,
        adminStore,
        db: client.db,
      });

      reviewService = new ReviewService(
        generatedContentStore,
        undefined as any,
        documentStore,
        undefined as any,
        moduleStore,
        lessonStore,
        undefined as any,
        undefined as any,
        undefined as any,
        flashcardStore,
        quizStore,
        quizQuestionStore,
        undefined as any,
        undefined as any,
        client.db,
      );

      officialContentService = new OfficialContentService(
        client.db as any,
        courseStore,
        moduleStore,
        lessonStore,
        flashcardStore,
        quizStore,
        quizQuestionStore,
        documentStore,
        generatedContentStore,
        undefined as any,
        reviewService,
        adminStore,
        testOrgId as any,
        undefined,
        undefined,
        draftService,
      );
    } catch (err) {
      console.warn("PostgreSQL not accessible, skipping real PG integration tests:", err);
      isConnected = false;
    }
  });

  afterAll(async () => {
    if (isConnected && client) {
      try {
        await client.db.delete(organizations).where(eq(organizations.id, testOrgId));
        await client.db.delete(users).where(eq(users.id, testUserId));
      } catch {
        // Ignore cleanup error
      }
    }
  });

  it("1. PostgreSQL Schema: Enforces partial unique index for active draft sessions and unique release versions", async () => {
    if (!isConnected) return;

    const courseId = randomUUID();
    await client.db.insert(courses).values({
      id: courseId,
      organizationId: testOrgId,
      name: "Index Test Course",
      version: 1,
      status: "published",
    });

    const sessionId1 = randomUUID();
    const sessionId2 = randomUUID();

    // Insert first active draft session
    await client.db.insert(courseDraftSessions).values({
      id: sessionId1,
      courseId,
      baseCourseVersion: 1,
      source: "manual",
      status: "draft",
    });

    // Attempt to insert second active draft session with status 'draft' for same course -> MUST THROW 23505
    let caughtConstraintError = false;
    try {
      await client.db.insert(courseDraftSessions).values({
        id: sessionId2,
        courseId,
        baseCourseVersion: 1,
        source: "manual",
        status: "draft",
      });
    } catch (err: any) {
      caughtConstraintError =
        err?.code === "23505" ||
        err?.cause?.code === "23505" ||
        String(err).includes("idx_single_active_draft_per_course");
    }
    expect(caughtConstraintError).toBe(true);

    // Insert release version 1
    const releaseId1 = randomUUID();
    await client.db.insert(courseReleases).values({
      id: releaseId1,
      courseId,
      versionNumber: 1,
      baseVersion: 1,
      changesSummary: {},
      manifest: [],
      publishedBy: testUserId,
    });

    // Attempt duplicate version release -> MUST THROW 23505
    let caughtDuplicateRelease = false;
    try {
      await client.db.insert(courseReleases).values({
        id: randomUUID(),
        courseId,
        versionNumber: 1,
        baseVersion: 1,
        changesSummary: {},
        manifest: [],
        publishedBy: testUserId,
      });
    } catch (err: any) {
      caughtDuplicateRelease =
        err?.code === "23505" ||
        err?.cause?.code === "23505" ||
        String(err).includes("idx_course_releases_course_version");
    }
    expect(caughtDuplicateRelease).toBe(true);
  });

  it("2. Atomic Publish Failure: Transaction abort rolls back all live mutations, increments no version, and writes no release", async () => {
    if (!isConnected) return;

    const cId = asCourseId(parseUUID(randomUUID()));
    await client.db.insert(courses).values({
      id: cId,
      organizationId: testOrgId,
      name: "Failure Rollback Test Course",
      version: 1,
      status: "published",
    });

    const modId = randomUUID();
    await client.db.insert(modules).values({
      id: modId,
      courseId: cId,
      title: "Module 1",
      sortOrder: 0,
    });

    const les1Id = randomUUID();
    const les2Id = randomUUID();
    await client.db.insert(lessons).values([
      {
        id: les1Id,
        moduleId: modId,
        title: "Lesson 1 Original",
        contentMarkdown: "# Original 1",
        sortOrder: 0,
        publicationStatus: "published",
      },
      {
        id: les2Id,
        moduleId: modId,
        title: "Lesson 2 To Delete",
        contentMarkdown: "# Original 2",
        sortOrder: 1,
        publicationStatus: "published",
      },
    ]);

    const session = await draftService.getOrCreateActiveSession(actor, cId);
    const newLessonId = randomUUID();

    // Stage changes:
    // 1. Update Lesson 1
    await draftService.recordChange(actor, session.id, {
      entityType: "lesson",
      entityId: les1Id,
      parentId: modId,
      action: "update",
      payload: {
        before: { title: "Lesson 1 Original", contentMarkdown: "# Original 1" },
        after: { title: "Lesson 1 Updated", contentMarkdown: "# Mutated Markdown" },
      },
    });

    // 2. Create Lesson 3
    await draftService.recordChange(actor, session.id, {
      entityType: "lesson",
      entityId: newLessonId,
      parentId: modId,
      action: "create",
      payload: {
        before: null,
        after: { title: "Lesson 3 New", contentMarkdown: "# New Content" },
      },
    });

    // 3. Delete Lesson 2
    await draftService.recordChange(actor, session.id, {
      entityType: "lesson",
      entityId: les2Id,
      parentId: modId,
      action: "delete",
      payload: {
        before: { title: "Lesson 2 To Delete" },
        after: null,
      },
    });

    // Simulate an aborted publish transaction: run exact publish operations inside a transaction that deliberately throws
    let errorThrown = false;
    try {
      await client.db.transaction(async (tx) => {
        // Run topological changes
        const changes = await draftChangeStore.listBySession(session.id);
        const course = (await courseStore.findById(cId))!;
        await (draftService as any).applyTopologicalChangesDb(tx, changes, course);

        // Update version
        await tx.update(courses).set({ version: 2 }).where(eq(courses.id, cId));

        // Intentionally throw exception right before commit!
        throw new Error("Simulated critical failure during publish before commit!");
      });
    } catch (e: any) {
      if (e.message.includes("Simulated critical failure")) {
        errorThrown = true;
      }
    }
    expect(errorThrown).toBe(true);

    // Verify PostgreSQL state rolled back completely:
    // 1. Course version is still 1
    const [dbCourse] = await client.db.select().from(courses).where(eq(courses.id, cId));
    expect(dbCourse.version).toBe(1);

    // 2. Lesson 1 content is unchanged
    const [dbLes1] = await client.db.select().from(lessons).where(eq(lessons.id, les1Id));
    expect(dbLes1.title).toBe("Lesson 1 Original");
    expect(dbLes1.contentMarkdown).toBe("# Original 1");

    // 3. Lesson 3 was never created
    const dbLes3 = await client.db.select().from(lessons).where(eq(lessons.id, newLessonId));
    expect(dbLes3.length).toBe(0);

    // 4. Lesson 2 is still active (not deleted)
    const [dbLes2] = await client.db.select().from(lessons).where(eq(lessons.id, les2Id));
    expect(dbLes2.deletedAt).toBeNull();

    // 5. No release was published in course_releases
    const releases = await client.db.select().from(courseReleases).where(eq(courseReleases.courseId, cId));
    expect(releases.length).toBe(0);

    // 6. Draft session is still active
    const [dbSession] = await client.db.select().from(courseDraftSessions).where(eq(courseDraftSessions.id, session.id));
    expect(dbSession.status).toBe("draft");
  });

  it("3. Concurrency Safety: Conflicting publish with stale baseVersion throws 409 and does not mutate live data", async () => {
    if (!isConnected) return;

    const cId = asCourseId(parseUUID(randomUUID()));
    await client.db.insert(courses).values({
      id: cId,
      organizationId: testOrgId,
      name: "Concurrency Test Course",
      version: 1,
      status: "published",
    });

    const modId = randomUUID();
    await client.db.insert(modules).values({
      id: modId,
      courseId: cId,
      title: "Module Concurrency",
      sortOrder: 0,
    });

    const lesId = randomUUID();
    await client.db.insert(lessons).values({
      id: lesId,
      moduleId: modId,
      title: "Lesson v1",
      contentMarkdown: "# v1",
      sortOrder: 0,
      publicationStatus: "published",
    });

    // Session A
    const sessionA = await draftService.getOrCreateActiveSession(actor, cId);
    await draftService.recordChange(actor, sessionA.id, {
      entityType: "lesson",
      entityId: lesId,
      parentId: modId,
      action: "update",
      payload: {
        before: { title: "Lesson v1", contentMarkdown: "# v1" },
        after: { title: "Lesson v2 from A", contentMarkdown: "# v2 by A" },
      },
    });

    // Publish Session A -> succeeds and bumps course to version 2
    const resA = await draftService.publishDraftSession(actor, sessionA.id);
    expect(resA.course.version).toBe(2);

    // Simulate Session B prepared at baseVersion 1 trying to publish after course moved to v2
    const sessionBId = asCourseDraftSessionId(parseUUID(randomUUID()));
    await client.db.insert(courseDraftSessions).values({
      id: sessionBId,
      courseId: cId,
      baseCourseVersion: 1,
      source: "manual",
      status: "ready",
    });
    await draftChangeStore.upsert({
      draftSessionId: sessionBId,
      courseId: cId,
      entityType: "lesson",
      entityId: lesId,
      action: "update",
      parentId: modId,
      sortOrder: 0,
      payload: {
        before: { title: "Lesson v1", contentMarkdown: "# v1" },
        after: { title: "Lesson from B CONFLICT", contentMarkdown: "# conflict" },
      },
    });

    // Now attempt to publish Session B (which was based on v1)
    let bConflictCaught = false;
    try {
      await draftService.publishDraftSession(actor, sessionBId);
    } catch (err: any) {
      bConflictCaught = err.code === "conflict" || err.message?.includes("تضاد نسخه");
    }
    expect(bConflictCaught).toBe(true);

    // Assert live lesson content has changes from A, NOT B!
    const [liveLes] = await client.db.select().from(lessons).where(eq(lessons.id, lesId));
    expect(liveLes.title).toBe("Lesson v2 from A");
    expect(liveLes.contentMarkdown).toBe("# v2 by A");

    // Course version remains 2
    const [liveCourse] = await client.db.select().from(courses).where(eq(courses.id, cId));
    expect(liveCourse.version).toBe(2);

    // Releases count is 1
    const releases = await client.db.select().from(courseReleases).where(eq(courseReleases.courseId, cId));
    expect(releases.length).toBe(1);
  });

  it("4. Deterministic Monotonic Rollback: Restores past snapshot, soft-deletes subsequent entities, and monotonically increments version", async () => {
    if (!isConnected) return;

    const cId = asCourseId(parseUUID(randomUUID()));
    await client.db.insert(courses).values({
      id: cId,
      organizationId: testOrgId,
      name: "Rollback Test Course",
      version: 1,
      status: "published",
    });

    const modId = randomUUID();
    await client.db.insert(modules).values({
      id: modId,
      courseId: cId,
      title: "Module 1",
      sortOrder: 0,
    });

    const les1Id = randomUUID();
    await client.db.insert(lessons).values({
      id: les1Id,
      moduleId: modId,
      title: "Lesson 1 at v1",
      contentMarkdown: "# Lesson 1 v1",
      sortOrder: 0,
      publicationStatus: "published",
    });

    // Create Release 1 snapshot
    await client.db.insert(courseReleases).values({
      id: randomUUID(),
      courseId: cId,
      versionNumber: 1,
      baseVersion: 1,
      changesSummary: { initial: true },
      manifest: [
        {
          entityType: "module",
          entityId: modId,
          action: "create",
          identityOperation: "created",
          parentId: null,
          sortOrderBefore: null,
          sortOrderAfter: 0,
          before: null,
          after: { title: "Module 1", sortOrder: 0 },
        },
        {
          entityType: "lesson",
          entityId: les1Id,
          action: "create",
          identityOperation: "created",
          parentId: modId,
          sortOrderBefore: null,
          sortOrderAfter: 0,
          before: null,
          after: { title: "Lesson 1 at v1", contentMarkdown: "# Lesson 1 v1", sortOrder: 0, publicationStatus: "published" },
        },
      ],
      publishedBy: testUserId,
    });

    // Draft for v2: Update Lesson 1, and CREATE Lesson 2
    const session2 = await draftService.getOrCreateActiveSession(actor, cId);
    const les2Id = randomUUID();

    await draftService.recordChange(actor, session2.id, {
      entityType: "lesson",
      entityId: les1Id,
      parentId: modId,
      action: "update",
      payload: {
        before: { title: "Lesson 1 at v1", contentMarkdown: "# Lesson 1 v1" },
        after: { title: "Lesson 1 at v2 UPDATED", contentMarkdown: "# Lesson 1 v2" },
      },
    });

    await draftService.recordChange(actor, session2.id, {
      entityType: "lesson",
      entityId: les2Id,
      parentId: modId,
      action: "create",
      payload: {
        before: null,
        after: { title: "Lesson 2 at v2 CREATED", contentMarkdown: "# Lesson 2 Content", sortOrder: 1 },
      },
    });

    // Publish v2
    const res2 = await draftService.publishDraftSession(actor, session2.id);
    expect(res2.course.version).toBe(2);

    // Verify both lessons active at v2
    const [l1v2] = await client.db.select().from(lessons).where(eq(lessons.id, les1Id));
    expect(l1v2.title).toBe("Lesson 1 at v2 UPDATED");
    const [l2v2] = await client.db.select().from(lessons).where(eq(lessons.id, les2Id));
    expect(l2v2.deletedAt).toBeNull();

    // NOW ROLLBACK TO V1!
    const rollbackRes = await draftService.rollbackRelease(actor, cId, 1, "Rollback to initial release");

    // 1. Version must monotonically increment to 3 (NEVER decremented to 1!)
    expect(rollbackRes.course.version).toBe(3);
    const [liveCourseAfterRollback] = await client.db.select().from(courses).where(eq(courses.id, cId));
    expect(liveCourseAfterRollback.version).toBe(3);

    // 2. Lesson 1 restored to v1 content
    const [l1Restored] = await client.db.select().from(lessons).where(eq(lessons.id, les1Id));
    expect(l1Restored.title).toBe("Lesson 1 at v1");
    expect(l1Restored.contentMarkdown).toBe("# Lesson 1 v1");

    // 3. Lesson 2 (created in v2) MUST BE SOFT-DELETED!
    const [l2AfterRollback] = await client.db.select().from(lessons).where(eq(lessons.id, les2Id));
    expect(l2AfterRollback.deletedAt).not.toBeNull();

    // 4. Monotonic Rollback to v2: Should produce v4 and restore Lesson 2
    const rollbackToV2 = await draftService.rollbackRelease(actor, cId, 2, "Rollback forward to v2");
    expect(rollbackToV2.course.version).toBe(4);

    const [l2Restored] = await client.db.select().from(lessons).where(eq(lessons.id, les2Id));
    expect(l2Restored.deletedAt).toBeNull();
    expect(l2Restored.title).toBe("Lesson 2 at v2 CREATED");
  });

  it("5. Quiz Question Soft-Delete Invariant: Soft-deleted questions are excluded from all read paths", async () => {
    if (!isConnected) return;

    const courseId = randomUUID();
    await client.db.insert(courses).values({
      id: courseId,
      organizationId: testOrgId,
      name: "Quiz Test Course",
      version: 1,
      status: "published",
    });

    const quizId = randomUUID();
    await client.db.insert(quizzes).values({
      id: quizId,
      organizationId: testOrgId,
      courseId,
      title: "Soft Delete Quiz Test",
      status: "published",
    });

    const q1Id = randomUUID();
    const q2Id = randomUUID();

    await client.db.insert(quizQuestions).values([
      {
        id: q1Id,
        quizId,
        question: "Active Question 1",
        choices: ["A", "B"],
        correctAnswer: "A",
        sortOrder: 0,
      },
      {
        id: q2Id,
        quizId,
        question: "Question To Soft Delete",
        choices: ["A", "B"],
        correctAnswer: "B",
        sortOrder: 1,
      },
    ]);

    // 1. Soft-delete Question 2
    await quizQuestionStore.delete(q1Id as any); // delete one

    // 2. listByQuiz must return only the non-deleted question
    const activeQuestions = await quizQuestionStore.listByQuiz(quizId as any);
    expect(activeQuestions.length).toBe(1);
    expect(activeQuestions[0].id).toBe(q2Id);

    // 3. listByIds must return only the non-deleted question
    const byIds = await quizQuestionStore.listByIds([q1Id as any, q2Id as any]);
    expect(byIds.length).toBe(1);
    expect(byIds[0].id).toBe(q2Id);

    // 4. listExams from AdminStore counts only active questions
    const examResult = await adminStore.listExams({ organizationId: testOrgId as any });
    const testExam = examResult.exams.find((e) => e.id === quizId);
    expect(testExam?.questionCount).toBe(1);

    // 5. Restore Question 1
    await quizQuestionStore.restore(q1Id as any);
    const restoredQuestions = await quizQuestionStore.listByQuiz(quizId as any);
    expect(restoredQuestions.length).toBe(2);
  });

  it("6. Real PostgreSQL: Middle Insertion (A, B, C -> A, X, B, C) preserves B and C IDs with zero ID shifting", async () => {
    if (!isConnected) return;

    const courseId = randomUUID();
    await client.db.insert(courses).values({
      id: courseId,
      organizationId: testOrgId,
      name: "Middle Insertion Test Course",
      version: 1,
      status: "published",
    });

    const docId = randomUUID();
    await client.db.insert(documents).values({
      id: docId,
      organizationId: testOrgId,
      courseId,
      ownerUserId: testUserId,
      originalName: "doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      sha256: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      storageKey: `doc-${docId}`,
    });

    const moduleId = randomUUID();
    await client.db.insert(modules).values({
      id: moduleId,
      courseId,
      title: "Module 1",
      sortOrder: 0,
    });

    const lesAId = randomUUID();
    const lesBId = randomUUID();
    const lesCId = randomUUID();

    await client.db.insert(lessons).values([
      {
        id: lesAId,
        moduleId,
        title: "Lesson A",
        contentType: "markdown",
        contentMarkdown: "Content A",
        sortOrder: 0,
        publicationStatus: "published",
      },
      {
        id: lesBId,
        moduleId,
        title: "Lesson B",
        contentType: "markdown",
        contentMarkdown: "Content B",
        sortOrder: 1,
        publicationStatus: "published",
      },
      {
        id: lesCId,
        moduleId,
        title: "Lesson C",
        contentType: "markdown",
        contentMarkdown: "Content C",
        sortOrder: 2,
        publicationStatus: "published",
      },
    ]);

    // Now AI generates 4 sessions inserting Lesson X between A and B: [A, X, B, C]
    const genContentId = randomUUID();
    await client.db.insert(generatedContents).values({
      id: genContentId,
      organizationId: testOrgId,
      courseId,
      documentId: docId,
      type: "lesson",
      status: "draft",
      payload: {
        moduleTitle: "Module 1",
        title: "Module 1",
        sessions: [
          { title: "Lesson A", contentMarkdown: "Content A updated" },
          { title: "Lesson X", contentMarkdown: "Content X newly inserted" },
          { title: "Lesson B", contentMarkdown: "Content B updated" },
          { title: "Lesson C", contentMarkdown: "Content C updated" },
        ],
      },
    });

    // Accept and materialize
    await reviewService.acceptContent(actor, testOrgId as any, genContentId as any);

    // Verify in real PostgreSQL:
    const liveLessons = await client.db
      .select()
      .from(lessons)
      .where(and(eq(lessons.moduleId, moduleId), isNull(lessons.deletedAt)))
      .orderBy(lessons.sortOrder);

    expect(liveLessons.length).toBe(4);

    // Index 0: Lesson A (ID preserved!)
    expect(liveLessons[0].id).toBe(lesAId);
    expect(liveLessons[0].title).toBe("Lesson A");
    expect(liveLessons[0].sortOrder).toBe(0);

    // Index 1: Lesson X (Genuinely new UUID! NOT hijacking B's ID!)
    expect(liveLessons[1].id).not.toBe(lesBId);
    expect(liveLessons[1].id).not.toBe(lesCId);
    expect(liveLessons[1].title).toBe("Lesson X");
    expect(liveLessons[1].sortOrder).toBe(1);

    // Index 2: Lesson B (ID PRESERVED! NOT HIJACKED!)
    expect(liveLessons[2].id).toBe(lesBId);
    expect(liveLessons[2].title).toBe("Lesson B");
    expect(liveLessons[2].sortOrder).toBe(2);

    // Index 3: Lesson C (ID PRESERVED! NOT HIJACKED!)
    expect(liveLessons[3].id).toBe(lesCId);
    expect(liveLessons[3].title).toBe("Lesson C");
    expect(liveLessons[3].sortOrder).toBe(3);
  });

  it("7. Real PostgreSQL: Reorder (A, B, C -> C, A, B) preserves all existing IDs with updated sortOrder", async () => {
    if (!isConnected) return;

    const courseId = randomUUID();
    await client.db.insert(courses).values({
      id: courseId,
      organizationId: testOrgId,
      name: "Reorder Test Course",
      version: 1,
      status: "published",
    });

    const docId = randomUUID();
    await client.db.insert(documents).values({
      id: docId,
      organizationId: testOrgId,
      courseId,
      ownerUserId: testUserId,
      originalName: "doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      sha256: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      storageKey: `doc-${docId}`,
    });

    const moduleId = randomUUID();
    await client.db.insert(modules).values({
      id: moduleId,
      courseId,
      title: "Reorder Module",
      sortOrder: 0,
    });

    const lesAId = randomUUID();
    const lesBId = randomUUID();
    const lesCId = randomUUID();

    await client.db.insert(lessons).values([
      {
        id: lesAId,
        moduleId,
        title: "Lesson Alpha",
        contentType: "markdown",
        contentMarkdown: "Alpha content",
        sortOrder: 0,
        publicationStatus: "published",
      },
      {
        id: lesBId,
        moduleId,
        title: "Lesson Beta",
        contentType: "markdown",
        contentMarkdown: "Beta content",
        sortOrder: 1,
        publicationStatus: "published",
      },
      {
        id: lesCId,
        moduleId,
        title: "Lesson Gamma",
        contentType: "markdown",
        contentMarkdown: "Gamma content",
        sortOrder: 2,
        publicationStatus: "published",
      },
    ]);

    // Reorder to [Gamma, Alpha, Beta]
    const genContentId = randomUUID();
    await client.db.insert(generatedContents).values({
      id: genContentId,
      organizationId: testOrgId,
      courseId,
      documentId: docId,
      type: "lesson",
      status: "draft",
      payload: {
        moduleTitle: "Reorder Module",
        title: "Reorder Module",
        sessions: [
          { title: "Lesson Gamma", contentMarkdown: "Gamma reordered" },
          { title: "Lesson Alpha", contentMarkdown: "Alpha reordered" },
          { title: "Lesson Beta", contentMarkdown: "Beta reordered" },
        ],
      },
    });

    await reviewService.acceptContent(actor, testOrgId as any, genContentId as any);

    const reorderedLessons = await client.db
      .select()
      .from(lessons)
      .where(and(eq(lessons.moduleId, moduleId), isNull(lessons.deletedAt)))
      .orderBy(lessons.sortOrder);

    expect(reorderedLessons.length).toBe(3);

    // Index 0: Lesson Gamma with lesCId
    expect(reorderedLessons[0].id).toBe(lesCId);
    expect(reorderedLessons[0].title).toBe("Lesson Gamma");
    expect(reorderedLessons[0].sortOrder).toBe(0);

    // Index 1: Lesson Alpha with lesAId
    expect(reorderedLessons[1].id).toBe(lesAId);
    expect(reorderedLessons[1].title).toBe("Lesson Alpha");
    expect(reorderedLessons[1].sortOrder).toBe(1);

    // Index 2: Lesson Beta with lesBId
    expect(reorderedLessons[2].id).toBe(lesBId);
    expect(reorderedLessons[2].title).toBe("Lesson Beta");
    expect(reorderedLessons[2].sortOrder).toBe(2);
  });

  it("8. Real PostgreSQL: Rename preserving explicit stable ID", async () => {
    if (!isConnected) return;

    const courseId = randomUUID();
    await client.db.insert(courses).values({
      id: courseId,
      organizationId: testOrgId,
      name: "Rename Test Course",
      version: 1,
      status: "published",
    });

    const docId = randomUUID();
    await client.db.insert(documents).values({
      id: docId,
      organizationId: testOrgId,
      courseId,
      ownerUserId: testUserId,
      originalName: "doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      sha256: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      storageKey: `doc-${docId}`,
    });

    const moduleId = randomUUID();
    await client.db.insert(modules).values({
      id: moduleId,
      courseId,
      title: "Rename Module",
      sortOrder: 0,
    });

    const targetLessonId = randomUUID();
    await client.db.insert(lessons).values({
      id: targetLessonId,
      moduleId,
      title: "Original Lesson Name",
      contentType: "markdown",
      contentMarkdown: "Original markdown",
      sortOrder: 0,
      publicationStatus: "published",
    });

    // Rename with explicit lesson ID
    const genContentId = randomUUID();
    await client.db.insert(generatedContents).values({
      id: genContentId,
      organizationId: testOrgId,
      courseId,
      documentId: docId,
      type: "lesson",
      status: "draft",
      payload: {
        moduleTitle: "Rename Module",
        title: "Rename Module",
        sessions: [
          {
            id: targetLessonId,
            title: "Renamed Lesson Name",
            contentMarkdown: "Renamed markdown",
          },
        ],
      },
    });

    await reviewService.acceptContent(actor, testOrgId as any, genContentId as any);

    const [renamedLesson] = await client.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, targetLessonId));

    expect(renamedLesson).toBeDefined();
    expect(renamedLesson.id).toBe(targetLessonId);
    expect(renamedLesson.title).toBe("Renamed Lesson Name");
  });

  let sharedStagedSessionId: string | undefined;

  it("9. Real PostgreSQL: Official Approval Isolation on Published Course produces ZERO live mutations", async () => {
    if (!isConnected) return;

    // 1. Create a published course (live for students)
    const pubCourseId = randomUUID();
    await client.db.insert(courses).values({
      id: pubCourseId,
      organizationId: testOrgId,
      name: "Published Isolation Course",
      version: 1,
      status: "published",
    });

    const docId = randomUUID();
    await client.db.insert(documents).values({
      id: docId,
      organizationId: testOrgId,
      courseId: pubCourseId,
      ownerUserId: testUserId,
      originalName: "doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      sha256: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      storageKey: `doc-${docId}`,
    });

    const pubModId = randomUUID();
    await client.db.insert(modules).values({
      id: pubModId,
      courseId: pubCourseId,
      title: "Live Chapter 1",
      sortOrder: 0,
    });

    const liveLesId = randomUUID();
    await client.db.insert(lessons).values({
      id: liveLesId,
      moduleId: pubModId,
      title: "Live Lesson 1",
      contentType: "markdown",
      contentMarkdown: "Live Markdown 1",
      sortOrder: 0,
      publicationStatus: "published",
    });

    const liveCardId = randomUUID();
    await client.db.insert(flashcards).values({
      id: liveCardId,
      organizationId: testOrgId,
      courseId: pubCourseId,
      documentId: docId,
      lessonId: liveLesId,
      question: "Live Question 1",
      answer: "Live Answer 1",
      cardType: "definition",
      difficulty: "medium",
    });

    const liveQuizId = randomUUID();
    await client.db.insert(quizzes).values({
      id: liveQuizId,
      organizationId: testOrgId,
      courseId: pubCourseId,
      documentId: docId,
      title: "Live Quiz 1",
      status: "published",
    });

    const liveQId = randomUUID();
    await client.db.insert(quizQuestions).values({
      id: liveQId,
      quizId: liveQuizId,
      lessonId: liveLesId,
      question: "Live Quiz Question 1",
      choices: ["Choice 1", "Choice 2"],
      correctAnswer: "Choice 1",
      sortOrder: 0,
    });

    // Record exact baseline snapshots before approval
    const [cBefore] = await client.db.select().from(courses).where(eq(courses.id, pubCourseId));
    const lessonsBefore = await client.db.select().from(lessons).where(eq(lessons.moduleId, pubModId));
    const cardsBefore = await client.db.select().from(flashcards).where(eq(flashcards.courseId, pubCourseId));
    const quizzesBefore = await client.db.select().from(quizzes).where(eq(quizzes.courseId, pubCourseId));
    const questionsBefore = await client.db.select().from(quizQuestions).where(eq(quizQuestions.quizId, liveQuizId));

    // Seed generated drafts (lesson update, new flashcard, quiz question update)
    const genLesId = randomUUID();
    await client.db.insert(generatedContents).values({
      id: genLesId,
      organizationId: testOrgId,
      courseId: pubCourseId,
      documentId: docId,
      type: "lesson",
      status: "draft",
      payload: {
        moduleTitle: "Live Chapter 1",
        title: "Live Chapter 1",
        sessions: [
          {
            id: liveLesId,
            title: "Live Lesson 1 UPDATED VIA AI",
            contentMarkdown: "AI updated content",
          },
        ],
      },
    });

    const genCardId = randomUUID();
    await client.db.insert(generatedContents).values({
      id: genCardId,
      organizationId: testOrgId,
      courseId: pubCourseId,
      documentId: docId,
      type: "flashcard",
      status: "draft",
      payload: {
        flashcards: [
          {
            front: "Newly Generated Flashcard",
            back: "Newly Generated Answer",
            sessionIndex: 0,
          },
        ],
      },
    });

    const genQuizId = randomUUID();
    await client.db.insert(generatedContents).values({
      id: genQuizId,
      organizationId: testOrgId,
      courseId: pubCourseId,
      documentId: docId,
      type: "quiz",
      status: "draft",
      payload: {
        title: "Live Quiz 1",
        questions: [
          {
            id: liveQId,
            question: "Live Quiz Question 1 UPDATED VIA AI",
            choices: ["C1", "C2"],
            correctAnswer: "C1",
            sessionIndex: 0,
          },
        ],
      },
    });

    // 2. Approve Official Course on Published Course
    const approvalRes = await officialContentService.approveOfficialCourse(
      actor,
      asCourseId(pubCourseId as any),
    );

    expect(approvalRes.approved).toBe(true);
    expect(approvalRes.stagedInDraftSessionId).toBeDefined();
    sharedStagedSessionId = approvalRes.stagedInDraftSessionId;

    // 3. ASSERT ZERO LIVE DATABASE MUTATIONS IN REAL POSTGRESQL!
    const [cAfter] = await client.db.select().from(courses).where(eq(courses.id, pubCourseId));
    expect(cAfter.version).toBe(1); // STILL VERSION 1!
    expect(cAfter.status).toBe("published"); // STILL PUBLISHED!

    const lessonsAfter = await client.db.select().from(lessons).where(eq(lessons.moduleId, pubModId));
    expect(lessonsAfter.length).toBe(lessonsBefore.length); // 1 lesson!
    expect(lessonsAfter[0].title).toBe("Live Lesson 1"); // Content untouched in live table!

    const cardsAfter = await client.db.select().from(flashcards).where(eq(flashcards.courseId, pubCourseId));
    expect(cardsAfter.length).toBe(cardsBefore.length); // 1 flashcard!

    const quizzesAfter = await client.db.select().from(quizzes).where(eq(quizzes.courseId, pubCourseId));
    expect(quizzesAfter.length).toBe(quizzesBefore.length); // 1 quiz!

    const questionsAfter = await client.db.select().from(quizQuestions).where(eq(quizQuestions.quizId, liveQuizId));
    expect(questionsAfter.length).toBe(questionsBefore.length); // 1 question!
    expect(questionsAfter[0].question).toBe("Live Quiz Question 1"); // Live prompt untouched!

    // 4. ASSERT CHANGES ARE STAGED IN DRAFT TABLES
    const [stagedSession] = await client.db
      .select()
      .from(courseDraftSessions)
      .where(eq(courseDraftSessions.id, approvalRes.stagedInDraftSessionId!));

    expect(stagedSession).toBeDefined();
    expect(stagedSession.status).toBe("draft");
    expect(stagedSession.baseCourseVersion).toBe(1);

    const stagedChanges = await client.db
      .select()
      .from(courseDraftChanges)
      .where(eq(courseDraftChanges.draftSessionId, approvalRes.stagedInDraftSessionId!));

    expect(stagedChanges.length).toBeGreaterThanOrEqual(3);
  });

  it("10. Real PostgreSQL: Explicit Publish commits staged changes and atomically increments course version", async () => {
    if (!isConnected || !sharedStagedSessionId) return;

    // Publish the draft session staged in Test 9
    const publishResult = await draftService.publishDraftSession(
      actor,
      asCourseDraftSessionId(sharedStagedSessionId as any),
    );

    // Course version bumped to 2
    expect(publishResult.course.version).toBe(2);
    expect(publishResult.course.status).toBe("published");
    expect(publishResult.release.versionNumber).toBe(2);

    // Live table now reflects the newly published changes!
    const [cLive] = await client.db
      .select()
      .from(courses)
      .where(eq(courses.id, publishResult.course.id));
    expect(cLive.version).toBe(2);

    // Check release recorded in courseReleases
    const [rel] = await client.db
      .select()
      .from(courseReleases)
      .where(eq(courseReleases.id, publishResult.release.id));
    expect(rel).toBeDefined();
    expect(rel.versionNumber).toBe(2);

    // Check draft session is published
    const [sess] = await client.db
      .select()
      .from(courseDraftSessions)
      .where(eq(courseDraftSessions.id, sharedStagedSessionId));
    expect(sess.status).toBe("published");
  });

  it("11. Real PostgreSQL: Rename WITHOUT Stable ID ([A, B, C] -> [A, B-renamed, C]) prevents ID hijacking and preserves original entity identity", async () => {
    if (!isConnected) return;

    const courseId = randomUUID();
    await client.db.insert(courses).values({
      id: courseId,
      organizationId: testOrgId,
      name: "Rename Without ID Course",
      version: 1,
      status: "published",
    });

    const docId = randomUUID();
    await client.db.insert(documents).values({
      id: docId,
      organizationId: testOrgId,
      courseId,
      ownerUserId: testUserId,
      originalName: "doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      sha256: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      storageKey: `doc-${docId}`,
    });

    const moduleId = randomUUID();
    await client.db.insert(modules).values({
      id: moduleId,
      courseId,
      title: "Rename Without ID Module",
      sortOrder: 0,
    });

    const lesAId = randomUUID();
    const lesBId = randomUUID();
    const lesCId = randomUUID();

    await client.db.insert(lessons).values([
      {
        id: lesAId,
        moduleId,
        title: "Lesson Alpha",
        contentType: "markdown",
        contentMarkdown: "Alpha content",
        sortOrder: 0,
        publicationStatus: "published",
      },
      {
        id: lesBId,
        moduleId,
        title: "Lesson Beta",
        contentType: "markdown",
        contentMarkdown: "Beta content",
        sortOrder: 1,
        publicationStatus: "published",
      },
      {
        id: lesCId,
        moduleId,
        title: "Lesson Gamma",
        contentType: "markdown",
        contentMarkdown: "Gamma content",
        sortOrder: 2,
        publicationStatus: "published",
      },
    ]);

    // Scenario: AI generates [Alpha, Beta Renamed Completely, Gamma]
    // Crucially: NO entity ID is passed for any of the sessions!
    const genContentId = randomUUID();
    await client.db.insert(generatedContents).values({
      id: genContentId,
      organizationId: testOrgId,
      courseId,
      documentId: docId,
      type: "lesson",
      status: "draft",
      payload: {
        moduleTitle: "Rename Without ID Module",
        title: "Rename Without ID Module",
        sessions: [
          { title: "Lesson Alpha", contentMarkdown: "Alpha content updated" },
          { title: "Lesson Beta Renamed Completely", contentMarkdown: "Beta renamed content" },
          { title: "Lesson Gamma", contentMarkdown: "Gamma content updated" },
        ],
      },
    });

    await reviewService.acceptContent(actor, testOrgId as any, genContentId as any);

    // Fetch active live lessons
    const activeLessons = await client.db
      .select()
      .from(lessons)
      .where(and(eq(lessons.moduleId, moduleId), isNull(lessons.deletedAt)))
      .orderBy(lessons.sortOrder);

    // Verify 3 active lessons
    expect(activeLessons.length).toBe(3);

    // 1. Lesson Alpha retained lesAId
    expect(activeLessons[0].id).toBe(lesAId);
    expect(activeLessons[0].title).toBe("Lesson Alpha");

    // 2. "Lesson Beta Renamed Completely" MUST have a brand new UUID!
    // It must NOT have hijacked lesBId by sortOrder fallback!
    expect(activeLessons[1].title).toBe("Lesson Beta Renamed Completely");
    expect(activeLessons[1].id).not.toBe(lesBId);
    expect(activeLessons[1].id).not.toBe(lesAId);
    expect(activeLessons[1].id).not.toBe(lesCId);

    // 3. Lesson Gamma retained lesCId
    expect(activeLessons[2].id).toBe(lesCId);
    expect(activeLessons[2].title).toBe("Lesson Gamma");

    // 4. lesBId was NOT overwritten with new content; it was safely soft-deleted
    const [originalLessonB] = await client.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, lesBId));

    expect(originalLessonB).toBeDefined();
    expect(originalLessonB.title).toBe("Lesson Beta"); // Content never overwritten by renamed entity!
    expect(originalLessonB.contentMarkdown).toBe("Beta content"); // Historical content intact!
    expect(originalLessonB.deletedAt).not.toBeNull(); // Safely soft-deleted, not hijacked!
  });

  it("12. Real PostgreSQL: Before Snapshot Immutability across multiple updates and failed publish abort", async () => {
    if (!isConnected) return;

    // 1. Create a published course with live lesson
    const courseId = randomUUID();
    await client.db.insert(courses).values({
      id: courseId,
      organizationId: testOrgId,
      name: "Before Snapshot Course",
      version: 1,
      status: "published",
    });

    const moduleId = randomUUID();
    await client.db.insert(modules).values({
      id: moduleId,
      courseId,
      title: "Snapshot Module",
      sortOrder: 0,
    });

    const lessonId = randomUUID();
    await client.db.insert(lessons).values({
      id: lessonId,
      moduleId,
      title: "Immutable Before Title",
      contentType: "markdown",
      contentMarkdown: "Immutable Before Markdown Content",
      sortOrder: 0,
      publicationStatus: "published",
    });

    // 2. Open active draft session
    const session = await draftService.getOrCreateActiveSession(
      actor,
      asCourseId(courseId as any),
      { title: "Test Snapshot Immutability Session" },
    );

    // 3. First Update: record change for lessonId
    const firstChange = await draftService.recordChange(actor, session.id, {
      entityType: "lesson",
      entityId: lessonId,
      action: "update",
      parentId: moduleId,
      sortOrder: 0,
      payload: {
        after: {
          id: lessonId,
          moduleId,
          title: "First Draft Update",
          contentMarkdown: "First Draft Content",
          sortOrder: 0,
        },
      },
    });

    expect(firstChange).not.toBeNull();
    const firstBefore = firstChange!.payload.before as any;
    expect(firstBefore).toBeDefined();
    expect(firstBefore.title).toBe("Immutable Before Title");
    expect(firstBefore.contentMarkdown).toBe("Immutable Before Markdown Content");

    // 4. Second Update: record another change on the same lesson in the same session
    // Try to inject a fraudulent before payload or different changes
    const secondChange = await draftService.recordChange(actor, session.id, {
      entityType: "lesson",
      entityId: lessonId,
      action: "update",
      parentId: moduleId,
      sortOrder: 0,
      payload: {
        before: {
          title: "FRAUDULENT OVERWRITE OF BEFORE",
          contentMarkdown: "FRAUDULENT CONTENT",
        },
        after: {
          id: lessonId,
          moduleId,
          title: "Second Draft Update",
          contentMarkdown: "Second Draft Content",
          sortOrder: 0,
        },
      },
    });

    expect(secondChange).not.toBeNull();
    const secondBefore = secondChange!.payload.before as any;
    // CRITICAL: Before MUST still match the original live snapshot from Postgres!
    expect(secondBefore.title).toBe("Immutable Before Title");
    expect(secondBefore.contentMarkdown).toBe("Immutable Before Markdown Content");
    expect((secondChange!.payload.after as any).title).toBe("Second Draft Update");

    // Query Postgres directly to verify persistence of the immutable before snapshot
    const [storedChange] = await client.db
      .select()
      .from(courseDraftChanges)
      .where(
        and(
          eq(courseDraftChanges.draftSessionId, session.id),
          eq(courseDraftChanges.entityId, lessonId),
        ),
      );

    expect(storedChange).toBeDefined();
    expect((storedChange.payload as any).before.title).toBe("Immutable Before Title");
    expect((storedChange.payload as any).before.contentMarkdown).toBe("Immutable Before Markdown Content");

    // 5. Test Abort / Concurrency conflict: course baseVersion mismatch aborts publish
    // Simulate concurrent modification bump on course version in Postgres
    await client.db
      .update(courses)
      .set({ version: 99 })
      .where(eq(courses.id, courseId));

    await expect(
      draftService.publishDraftSession(actor, session.id),
    ).rejects.toThrow();

    // Verify after aborted publish:
    // - Draft change payload.before remains intact
    const [changeAfterAbort] = await client.db
      .select()
      .from(courseDraftChanges)
      .where(
        and(
          eq(courseDraftChanges.draftSessionId, session.id),
          eq(courseDraftChanges.entityId, lessonId),
        ),
      );
    expect((changeAfterAbort.payload as any).before.title).toBe("Immutable Before Title");

    // - Live lesson table was NOT mutated by the aborted publish
    const [liveLessonAfterAbort] = await client.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId));
    expect(liveLessonAfterAbort.title).toBe("Immutable Before Title");
    expect(liveLessonAfterAbort.contentMarkdown).toBe("Immutable Before Markdown Content");
  });
});

