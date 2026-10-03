import { describe, test, expect, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { v1Routes } from "../routes/v1.js";
import {
  Roles,
  type Role,
  type UserId,
  type OrganizationId,
} from "@avana/domain";
import {
  InMemoryClassroomStore,
  InMemoryClassroomMemberStore,
  InMemoryTeacherExamStore,
  InMemoryTeacherExamQuestionStore,
  InMemoryTeacherExamAttemptStore,
  InMemoryTeacherExamAttemptAnswerStore,
  InMemoryAssignmentStore,
  InMemoryAssignmentSubmissionStore,
  InMemoryClassroomContentStore,
  ClassroomContentService,
} from "../modules/teacher-platform/index.js";
import type { StorageProvider, StoredFile, UploadIntent } from "../modules/storage/storage-provider.js";
import { randomUUID } from "node:crypto";

class InMemoryStorageProvider implements StorageProvider {
  public files = new Map<string, Buffer>();

  async createUpload(options: { storageKey: string; mimeType: string }): Promise<UploadIntent> {
    return {
      storageKey: options.storageKey,
      uploadUrl: null,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
  }

  async save(options: StoredFile): Promise<void> {
    this.files.set(options.storageKey, options.data);
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const data = this.files.get(storageKey);
    if (!data) throw new Error(`File not found: ${storageKey}`);
    return data;
  }
}

describe("Classroom Educational Content (محتوای آموزشی استاد) — Backend Lifecycle Test Suite", () => {
  let app: ReturnType<typeof createApp>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let adminStore: InMemoryAdminStore;
  let sessionService: SessionService;
  let storageProvider: InMemoryStorageProvider;

  let classroomStore: InMemoryClassroomStore;
  let memberStore: InMemoryClassroomMemberStore;
  let teacherExamStore: InMemoryTeacherExamStore;
  let teacherExamQuestionStore: InMemoryTeacherExamQuestionStore;
  let teacherExamAttemptStore: InMemoryTeacherExamAttemptStore;
  let teacherExamAttemptAnswerStore: InMemoryTeacherExamAttemptAnswerStore;
  let assignmentStore: InMemoryAssignmentStore;
  let assignmentSubmissionStore: InMemoryAssignmentSubmissionStore;
  let contentStore: InMemoryClassroomContentStore;
  let contentService: ClassroomContentService;

  const orgId = "11111111-1111-4111-8111-111111111111" as OrganizationId;

  async function createUserWithRole(
    email: string,
    role: Role,
    organizationId: OrganizationId = orgId,
    name: string = "Test User",
  ) {
    const user = await userStore.createUserWithPassword({
      email,
      passwordHash: "hashed-pass",
      name,
    });

    if (role === Roles.platform_admin || role === Roles.content_worker) {
      user.globalRole = role;
      user.role = role;
      userStore.insert({ ...user });
    }

    orgStore.addMembership({
      id: randomUUID(),
      organizationId,
      userId: user.id as UserId,
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const session = await sessionService.createSession(user.id);
    return { user, sessionToken: session.sessionToken, orgId: organizationId };
  }

  beforeEach(async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";
    config.systemOrganizationId = orgId;

    sessionStore = new InMemorySessionStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    adminStore = new InMemoryAdminStore(userStore, orgStore);
    sessionService = new SessionService(sessionStore, config.session);
    storageProvider = new InMemoryStorageProvider();

    classroomStore = new InMemoryClassroomStore();
    memberStore = new InMemoryClassroomMemberStore();
    teacherExamStore = new InMemoryTeacherExamStore();
    teacherExamQuestionStore = new InMemoryTeacherExamQuestionStore();
    teacherExamAttemptStore = new InMemoryTeacherExamAttemptStore();
    teacherExamAttemptAnswerStore = new InMemoryTeacherExamAttemptAnswerStore();
    assignmentStore = new InMemoryAssignmentStore();
    assignmentSubmissionStore = new InMemoryAssignmentSubmissionStore();
    contentStore = new InMemoryClassroomContentStore();

    contentService = new ClassroomContentService(
      contentStore,
      classroomStore,
      memberStore,
      orgStore,
      userStore,
      undefined,
      storageProvider,
    );

    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
      classroomStore,
      classroomMemberStore: memberStore,
      teacherExamStore,
      teacherExamQuestionStore,
      teacherExamAttemptStore,
      teacherExamAttemptAnswerStore,
      assignmentStore,
      assignmentSubmissionStore,
      contentStore,
      contentService,
      storageProvider,
    });
  });

  test("Scenario 1 & 2: Teacher creates text content (draft and published)", async () => {
    const teacher = await createUserWithRole("teacher1@test.com", Roles.teacher);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "کلاس ریاضی پیشرفته",
      description: "کلاس ترم پاییز",
      inviteCode: "MATH101",
      status: "active",
      archivedAt: null,
    });

    // 1. Create text draft
    const draftRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        contentType: "text",
        title: "جزوه جلسه اول - مبانی حسابان",
        description: "یادداشت‌های مقدماتی",
        textContent: "تابع و حد دو مفهوم پایه‌ای هستند.",
        status: "draft",
      },
    });

    expect(draftRes.statusCode).toBe(201);
    const draftBody = draftRes.json();
    expect(draftBody.content.title).toBe("جزوه جلسه اول - مبانی حسابان");
    expect(draftBody.content.contentType).toBe("text");
    expect(draftBody.content.status).toBe("draft");
    expect(draftBody.content.textContent).toBe("تابع و حد دو مفهوم پایه‌ای هستند.");

    // 2. Create text published
    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        contentType: "text",
        title: "نکات کنکوری جلسه اول",
        textContent: "فرمول‌های طلایی مثلثات",
        status: "published",
      },
    });

    expect(pubRes.statusCode).toBe(201);
    const pubBody = pubRes.json();
    expect(pubBody.content.status).toBe("published");
    expect(pubBody.content.publishedAt).toBeDefined();
  });

  test("Scenario 3, 4, 5, 6: Teacher creates image, pdf, word, and powerpoint contents", async () => {
    const teacher = await createUserWithRole("teacher2@test.com", Roles.teacher);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "کلاس فیزیک کنکور",
      inviteCode: "PHYS202",
      status: "active",
      archivedAt: null,
    });

    // 3. Image
    const imgRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        contentType: "image",
        title: "نمودار مدار RL",
        fileUrl: "/v1/teacher/contents/files/rl-circuit.png",
        fileName: "rl-circuit.png",
        fileSizeBytes: 102400,
        mimeType: "image/png",
        status: "published",
      },
    });
    expect(imgRes.statusCode).toBe(201);
    expect(imgRes.json().content.contentType).toBe("image");

    // 4. PDF
    const pdfRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        contentType: "pdf",
        title: "جزوه کامل فصل الکتریسیته",
        fileUrl: "/v1/teacher/contents/files/electro.pdf",
        fileName: "electro.pdf",
        fileSizeBytes: 2048000,
        mimeType: "application/pdf",
        status: "published",
      },
    });
    expect(pdfRes.statusCode).toBe(201);
    expect(pdfRes.json().content.contentType).toBe("pdf");

    // 5. Word
    const wordRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        contentType: "word",
        title: "تمرین‌های فصل مغناطیس",
        fileUrl: "/v1/teacher/contents/files/exercises.docx",
        fileName: "exercises.docx",
        fileSizeBytes: 512000,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        status: "published",
      },
    });
    expect(wordRes.statusCode).toBe(201);
    expect(wordRes.json().content.contentType).toBe("word");

    // 6. PowerPoint
    const pptRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        contentType: "powerpoint",
        title: "اسلایدهای فصل امواج الکترومغناطیسی",
        fileUrl: "/v1/teacher/contents/files/waves.pptx",
        fileName: "waves.pptx",
        fileSizeBytes: 4096000,
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        status: "published",
      },
    });
    expect(pptRes.statusCode).toBe(201);
    expect(pptRes.json().content.contentType).toBe("powerpoint");
  });

  test("Scenario 7 & 8: Teacher creates external video link (Google Drive with embed & generic fallback)", async () => {
    const teacher = await createUserWithRole("teacher3@test.com", Roles.teacher);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "کلاس زیست‌شناسی",
      inviteCode: "BIO303",
      status: "active",
      archivedAt: null,
    });

    // 7. Google Drive Video Link
    const gDriveRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        contentType: "video_external",
        title: "فیلم تدریس فتوسنتز در گیاهان",
        externalUrl: "https://drive.google.com/file/d/1XYZabc987654321/view?usp=sharing",
        status: "published",
      },
    });

    expect(gDriveRes.statusCode).toBe(201);
    const gDriveBody = gDriveRes.json();
    expect(gDriveBody.content.contentType).toBe("video_external");
    expect(gDriveBody.content.videoProvider).toBe("google_drive");
    expect(gDriveBody.content.videoEmbedUrl).toBe("https://drive.google.com/file/d/1XYZabc987654321/preview");

    // 8. Generic Video Link
    const genericRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        contentType: "video_external",
        title: "انیمیشن تقسیم میتوز",
        externalUrl: "https://example.com/videos/mitosis.mp4",
        status: "published",
      },
    });

    expect(genericRes.statusCode).toBe(201);
    const genericBody = genericRes.json();
    expect(genericBody.content.contentType).toBe("video_external");
    expect(genericBody.content.videoProvider).toBe("generic");
    expect(genericBody.content.videoEmbedUrl).toBeNull();
  });

  test("Scenario 9: Teacher rejects invalid/malicious video URLs", async () => {
    const teacher = await createUserWithRole("teacher4@test.com", Roles.teacher);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "کلاس شیمی",
      inviteCode: "CHEM404",
      status: "active",
      archivedAt: null,
    });

    // Malicious javascript URL
    const jsRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        contentType: "video_external",
        title: "لینک خطرناک",
        externalUrl: "javascript:alert(document.cookie)",
      },
    });
    expect(jsRes.statusCode).toBe(400);

    // Malicious data URL
    const dataRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        contentType: "video_external",
        title: "لینک دیتا",
        externalUrl: "data:text/html,<script>alert(1)</script>",
      },
    });
    expect(dataRes.statusCode).toBe(400);
  });

  test("Scenario 10, 11, 12, 13, 14: Teacher updates, publishes, unpublishes, archives and deletes content", async () => {
    const teacher = await createUserWithRole("teacher5@test.com", Roles.teacher);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "کلاس دین و زندگی",
      inviteCode: "REL505",
      status: "active",
      archivedAt: null,
    });

    // Create initial draft
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        contentType: "text",
        title: "درس اول",
        textContent: "متن اولیه",
        status: "draft",
      },
    });
    const contentId = createRes.json().content.id;

    // 10. Update
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/teacher/contents/${contentId}`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        title: "درس اول (ویرایش جدید)",
        textContent: "متن ویرایش شده و کامل",
      },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().content.title).toBe("درس اول (ویرایش جدید)");

    // 11. Publish
    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/contents/${contentId}/publish`,
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(pubRes.statusCode).toBe(200);
    expect(pubRes.json().content.status).toBe("published");

    // 12. Unpublish
    const unpubRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/contents/${contentId}/unpublish`,
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(unpubRes.statusCode).toBe(200);
    expect(unpubRes.json().content.status).toBe("draft");

    // 13. Archive
    const archRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/contents/${contentId}/archive`,
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(archRes.statusCode).toBe(200);
    expect(archRes.json().content.status).toBe("archived");

    // 14. Delete
    const delRes = await app.inject({
      method: "DELETE",
      url: `/v1/teacher/contents/${contentId}`,
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(delRes.statusCode).toBe(204);

    const checkRes = await app.inject({
      method: "GET",
      url: `/v1/teacher/contents/${contentId}`,
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(checkRes.statusCode).toBe(404);
  });

  test("Scenario 15 & 16: File upload and MIME / size restrictions", async () => {
    const teacher = await createUserWithRole("teacher6@test.com", Roles.teacher);

    // 15. Valid upload
    const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
    const fileContent = Buffer.from("PDF Mock Content %PDF-1.4");
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      fileContent,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/v1/teacher/contents/files",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      cookies: { avana_session: teacher.sessionToken },
      payload,
    });

    expect([200, 201]).toContain(uploadRes.statusCode);
    const uploadBody = uploadRes.json();
    expect(uploadBody.fileName).toBe("sample.pdf");
    expect(uploadBody.fileMimeType).toBe("application/pdf");
    expect(uploadBody.fileUrl).toContain("/v1/teacher/contents/files/");

    // 16. Disallowed file type (.exe)
    const badPayload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="virus.exe"\r\nContent-Type: application/x-msdownload\r\n\r\n`,
      ),
      Buffer.from("malicious binary"),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const badUploadRes = await app.inject({
      method: "POST",
      url: "/v1/teacher/contents/files",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      cookies: { avana_session: teacher.sessionToken },
      payload: badPayload,
    });
    expect(badUploadRes.statusCode).toBe(400);
  });

  test("Scenario 17, 18, 19: Enrolled student lists published contents, cannot see draft, non-enrolled student is blocked", async () => {
    const teacher = await createUserWithRole("teacher7@test.com", Roles.teacher);
    const enrolledStudent = await createUserWithRole("student1@test.com", Roles.student);
    const outsiderStudent = await createUserWithRole("outsider@test.com", Roles.student);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "کلاس ادبیات فارسی",
      inviteCode: "LIT707",
      status: "active",
      archivedAt: null,
    });

    // Enroll student
    await memberStore.addMember({
      classroomId: classroom.id,
      studentId: enrolledStudent.user.id,
      status: "active",
      firstJoinedAt: new Date().toISOString(),
      lastJoinedAt: new Date().toISOString(),
      leftAt: null,
    });

    // Teacher creates 1 draft and 1 published
    const publishedContent = await contentStore.create({
      id: randomUUID(),
      classroomId: classroom.id,
      teacherId: teacher.user.id,
      title: "آرایه‌های ادبی - تشبیه و استعاره",
      contentType: "text",
      textContent: "تعاریف آرایه‌ها",
      status: "published",
    });

    await contentStore.create({
      id: randomUUID(),
      classroomId: classroom.id,
      teacherId: teacher.user.id,
      title: "درس دوم (پیش‌نویس)",
      contentType: "text",
      textContent: "هنوز آماده نیست",
      status: "draft",
    });

    // 17 & 18. Enrolled student lists contents -> only sees published
    const studentListRes = await app.inject({
      method: "GET",
      url: `/v1/student/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: enrolledStudent.sessionToken },
    });

    expect(studentListRes.statusCode).toBe(200);
    const studentList = studentListRes.json().contents;
    expect(studentList.length).toBe(1);
    expect(studentList[0].id).toBe(publishedContent.id);
    expect(studentList[0].title).toBe("آرایه‌های ادبی - تشبیه و استعاره");

    // 19. Outsider student attempts to list -> 403 Forbidden
    const outsiderListRes = await app.inject({
      method: "GET",
      url: `/v1/student/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: outsiderStudent.sessionToken },
    });
    expect(outsiderListRes.statusCode).toBe(403);
  });

  test("Scenario 20: Another teacher cannot access or modify classroom content (IDOR Protection)", async () => {
    const teacherA = await createUserWithRole("teacherA@test.com", Roles.teacher);
    const teacherB = await createUserWithRole("teacherB@test.com", Roles.teacher);

    const classroomA = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacherA.user.id,
      title: "کلاس استاد الف",
      inviteCode: "TEA808",
      status: "active",
      archivedAt: null,
    });

    const contentA = await contentStore.create({
      id: randomUUID(),
      classroomId: classroomA.id,
      teacherId: teacherA.user.id,
      title: "محتوای اختصاصی استاد الف",
      contentType: "text",
      textContent: "مطالب محرمانه",
      status: "draft",
    });

    // Teacher B tries to modify Content A
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/teacher/contents/${contentA.id}`,
      cookies: { avana_session: teacherB.sessionToken },
      payload: { title: "دستکاری توسط استاد دیگر" },
    });
    expect([403, 404]).toContain(patchRes.statusCode);

    // Teacher B tries to delete Content A
    const delRes = await app.inject({
      method: "DELETE",
      url: `/v1/teacher/contents/${contentA.id}`,
      cookies: { avana_session: teacherB.sessionToken },
    });
    expect([403, 404]).toContain(delRes.statusCode);
  });

  test("Scenario 21 & 22: File streaming authorization & path traversal rejection", async () => {
    const teacher = await createUserWithRole("teacher9@test.com", Roles.teacher);
    const enrolledStudent = await createUserWithRole("student9@test.com", Roles.student);
    const outsiderStudent = await createUserWithRole("outsider9@test.com", Roles.student);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "کلاس هندسه تحلیلی",
      inviteCode: "GEO909",
      status: "active",
      archivedAt: null,
    });

    await memberStore.addMember({
      classroomId: classroom.id,
      studentId: enrolledStudent.user.id,
      status: "active",
      firstJoinedAt: new Date().toISOString(),
      lastJoinedAt: new Date().toISOString(),
      leftAt: null,
    });

    const fileKey = "classroom-contents/geom-notes.pdf";
    await storageProvider.save({
      storageKey: fileKey,
      mimeType: "application/pdf",
      data: Buffer.from("%PDF-1.4 Geometry Lecture Notes"),
    });

    await contentStore.create({
      id: randomUUID(),
      classroomId: classroom.id,
      teacherId: teacher.user.id,
      title: "جزوه هندسه",
      contentType: "pdf",
      fileUrl: `/v1/teacher/contents/files/${fileKey}`,
      fileName: "geom-notes.pdf",
      status: "published",
    });

    // 21. Teacher downloads file
    const teacherStreamRes = await app.inject({
      method: "GET",
      url: `/v1/teacher/contents/files/${fileKey}`,
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(teacherStreamRes.statusCode).toBe(200);

    // Enrolled student downloads file
    const studentStreamRes = await app.inject({
      method: "GET",
      url: `/v1/student/contents/files/${fileKey}`,
      cookies: { avana_session: enrolledStudent.sessionToken },
    });
    expect(studentStreamRes.statusCode).toBe(200);

    // Outsider student downloads file -> 403
    const outsiderStreamRes = await app.inject({
      method: "GET",
      url: `/v1/student/contents/files/${fileKey}`,
      cookies: { avana_session: outsiderStudent.sessionToken },
    });
    expect(outsiderStreamRes.statusCode).toBe(403);

    // 22. Path traversal attack rejection
    const traversalRes = await app.inject({
      method: "GET",
      url: `/v1/teacher/contents/files/..%2f..%2fetc%2fpasswd`,
      cookies: { avana_session: teacher.sessionToken },
    });
    expect([400, 403, 404]).toContain(traversalRes.statusCode);
  });

  test("10. Enforces 25,000 maximum character limit on text content creation and update", async () => {
    const teacher = await createUserWithRole("teacher-limit@avana.ir", Roles.teacher);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "کلاس تست محدودیت طول متن",
      inviteCode: "LIM25K",
      status: "active",
      archivedAt: null,
    });

    // 1. Text content with exactly 25,000 characters -> 201 Created
    const text25k = "م".repeat(25000);
    const validRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        contentType: "text",
        title: "متن مجاز ۲۵ هزار کاراکتری",
        textContent: text25k,
        status: "published",
      },
    });
    expect(validRes.statusCode).toBe(201);
    const createdContent = validRes.json().content;
    expect(createdContent.textContent.length).toBe(25000);

    // 2. Text content with 25,001 characters -> 400 Bad Request
    const text25001 = "م".repeat(25001);
    const invalidRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/contents`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        contentType: "text",
        title: "متن بیش از حد مجاز",
        textContent: text25001,
        status: "published",
      },
    });
    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.json().error.message).toContain("۲۵٬۰۰۰ کاراکتر");

    // 3. Update text content with 25,000 characters -> 200 OK
    const updateValidRes = await app.inject({
      method: "PATCH",
      url: `/v1/teacher/contents/${createdContent.id}`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        textContent: "ب".repeat(25000),
      },
    });
    expect(updateValidRes.statusCode).toBe(200);
    expect(updateValidRes.json().content.textContent.length).toBe(25000);

    // 4. Update text content with 25,001 characters -> 400 Bad Request
    const updateInvalidRes = await app.inject({
      method: "PATCH",
      url: `/v1/teacher/contents/${createdContent.id}`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        textContent: "ب".repeat(25001),
      },
    });
    expect(updateInvalidRes.statusCode).toBe(400);
    expect(updateInvalidRes.json().error.message).toContain("۲۵٬۰۰۰ کاراکتر");
  });
});
