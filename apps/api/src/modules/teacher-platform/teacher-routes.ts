import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { DomainError, asUserId, type Actor } from "@avana/domain";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { ClassroomService } from "./services/classroom-service.js";
import type { TeacherExamService } from "./services/exam-service.js";
import type { TeacherExamResultService } from "./services/result-service.js";
import type { AssignmentService } from "./services/assignment-service.js";
import type { ClassroomContentService } from "./services/content-service.js";
import type { TeacherMessageService } from "./services/message-service.js";
import type { StorageProvider } from "../storage/index.js";

export interface TeacherRouteOptions extends AuthMiddlewareDeps {
  classroomService: ClassroomService;
  examService: TeacherExamService;
  resultService: TeacherExamResultService;
  assignmentService?: AssignmentService;
  contentService?: ClassroomContentService;
  messageService?: TeacherMessageService;
  storageProvider?: StorageProvider;
}

export const teacherRoutes: FastifyPluginAsync<TeacherRouteOptions> = async (
  app,
  opts,
) => {
  const { requireAuth } = makeAuthMiddleware(opts);
  const {
    classroomService,
    examService,
    resultService,
    assignmentService,
    contentService,
    messageService,
    storageProvider,
  } = opts;


  function getActor(request: unknown): Actor {
    const reqAny = request as {
      user?: {
        userId: string;
        email: string;
        role: string;
        globalRole?: string | null;
      };
    };
    if (!reqAny.user) {
      throw new DomainError("unauthorized", "Not signed in");
    }
    return {
      userId: asUserId(reqAny.user.userId),
      role: reqAny.user.role as Actor["role"],
      globalRole: (reqAny.user.globalRole as Actor["globalRole"]) ?? undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Classroom Endpoints (Teacher)
  // -------------------------------------------------------------------------

  app.post(
    "/v1/organizations/:organizationId/teacher/classrooms",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { organizationId } = request.params as { organizationId: string };
      const body = (request.body as Record<string, unknown>) ?? {};

      const classroom = await classroomService.createClassroom(actor, {
        ...body,
        organizationId,
      });

      reply.code(201);
      return { classroom };
    },
  );

  app.get(
    "/v1/organizations/:organizationId/teacher/classrooms",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { organizationId } = request.params as { organizationId: string };
      const classrooms = await classroomService.listOrganizationClassrooms(
        actor,
        organizationId,
      );
      return { classrooms };
    },
  );

  app.get(
    "/v1/teacher/classrooms/:classroomId",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      const classroom = await classroomService.getClassroom(actor, classroomId);
      return { classroom };
    },
  );

  app.patch(
    "/v1/teacher/classrooms/:classroomId",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      const classroom = await classroomService.updateClassroom(
        actor,
        classroomId,
        request.body,
      );
      return { classroom };
    },
  );

  app.post(
    "/v1/teacher/classrooms/:classroomId/archive",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      const classroom = await classroomService.archiveClassroom(actor, classroomId);
      return { classroom };
    },
  );

  app.delete(
    "/v1/teacher/classrooms/:classroomId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      await classroomService.deleteClassroom(actor, classroomId);
      reply.code(204);
      return;
    },
  );

  const handleRegenerateInvite = async (
    request: FastifyRequest<{ Params: { classroomId: string } }>,
  ) => {
    const actor = getActor(request);
    const { classroomId } = request.params;
    const classroom = await classroomService.regenerateInviteCode(
      actor,
      classroomId,
    );
    return { classroom };
  };

  app.post<{ Params: { classroomId: string } }>(
    "/v1/teacher/classrooms/:classroomId/regenerate-invite",
    { preHandler: [requireAuth] },
    handleRegenerateInvite,
  );

  app.post<{ Params: { classroomId: string } }>(
    "/v1/teacher/classrooms/:classroomId/regenerate-invite-code",
    { preHandler: [requireAuth] },
    handleRegenerateInvite,
  );

  app.get(
    "/v1/teacher/classrooms/:classroomId/members",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      const members = await classroomService.listMembers(actor, classroomId);
      return { members };
    },
  );

  app.delete(
    "/v1/teacher/classrooms/:classroomId/members/:studentId",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { classroomId, studentId } = request.params as {
        classroomId: string;
        studentId: string;
      };
      const member = await classroomService.removeMember(
        actor,
        classroomId,
        studentId,
      );
      return { member };
    },
  );

  // -------------------------------------------------------------------------
  // Exam Endpoints (Teacher)
  // -------------------------------------------------------------------------

  app.post(
    "/v1/teacher/classrooms/:classroomId/exams",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      const exam = await examService.createExam(actor, classroomId, request.body);
      reply.code(201);
      return { exam };
    },
  );

  app.get(
    "/v1/teacher/classrooms/:classroomId/exams",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      const exams = await examService.listExamsByClassroom(actor, classroomId);
      return { exams };
    },
  );

  app.get(
    "/v1/teacher/exams/:examId",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      const exam = await examService.getExam(actor, examId);
      return { exam };
    },
  );

  app.patch(
    "/v1/teacher/exams/:examId",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      const exam = await examService.updateExam(actor, examId, request.body);
      return { exam };
    },
  );

  app.post(
    "/v1/teacher/exams/:examId/publish",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      const exam = await examService.publishExam(actor, examId);
      return { exam };
    },
  );

  app.post(
    "/v1/teacher/exams/:examId/unpublish",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      const exam = await examService.unpublishExam(actor, examId);
      return { exam };
    },
  );

  app.post(
    "/v1/teacher/exams/:examId/archive",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      const exam = await examService.archiveExam(actor, examId);
      return { exam };
    },
  );

  app.delete(
    "/v1/teacher/exams/:examId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      await examService.deleteExam(actor, examId);
      reply.code(204);
      return;
    },
  );

  app.post(
    "/v1/teacher/exams/:examId/close",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      const exam = await examService.closeExamManually(actor, examId);
      return { exam };
    },
  );

  const handleReleaseResults = async (
    request: FastifyRequest<{ Params: { examId: string } }>,
  ) => {
    const actor = getActor(request);
    const { examId } = request.params;
    const exam = await examService.releaseResults(actor, examId);
    return { exam };
  };

  app.post<{ Params: { examId: string } }>(
    "/v1/teacher/exams/:examId/results/release",
    { preHandler: [requireAuth] },
    handleReleaseResults,
  );

  app.post<{ Params: { examId: string } }>(
    "/v1/teacher/exams/:examId/release-results",
    { preHandler: [requireAuth] },
    handleReleaseResults,
  );

  // -------------------------------------------------------------------------
  // Question Endpoints (Teacher)
  // -------------------------------------------------------------------------

  app.post(
    "/v1/teacher/exams/:examId/questions",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      const question = await examService.createQuestion(
        actor,
        examId,
        request.body,
      );
      reply.code(201);
      return { question };
    },
  );

  app.get(
    "/v1/teacher/exams/:examId/questions",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      const questions = await examService.listQuestions(actor, examId);
      return { questions };
    },
  );

  const handleUpdateQuestion = async (
    request: FastifyRequest<{
      Params: { examId: string; questionId: string };
      Body: unknown;
    }>,
  ) => {
    const actor = getActor(request);
    const { examId, questionId } = request.params;
    const question = await examService.updateQuestion(
      actor,
      examId,
      questionId,
      request.body,
    );
    return { question };
  };

  app.patch<{
    Params: { examId: string; questionId: string };
    Body: unknown;
  }>(
    "/v1/teacher/exams/:examId/questions/:questionId",
    { preHandler: [requireAuth] },
    handleUpdateQuestion,
  );

  app.put<{
    Params: { examId: string; questionId: string };
    Body: unknown;
  }>(
    "/v1/teacher/exams/:examId/questions/:questionId",
    { preHandler: [requireAuth] },
    handleUpdateQuestion,
  );

  app.delete(
    "/v1/teacher/exams/:examId/questions/:questionId",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { examId, questionId } = request.params as {
        examId: string;
        questionId: string;
      };
      await examService.deleteQuestion(actor, examId, questionId);
      return { success: true };
    },
  );

  app.post(
    "/v1/teacher/exams/:examId/questions/reorder",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      await examService.reorderQuestions(actor, examId, request.body);
      return { success: true };
    },
  );

  // -------------------------------------------------------------------------
  // Results Endpoints (Teacher)
  // -------------------------------------------------------------------------

  app.get(
    "/v1/teacher/exams/:examId/results",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      const results = await resultService.getExamResultsAggregate(actor, examId);
      return { results };
    },
  );

  const handleGetStudentResult = async (
    request: FastifyRequest<{ Params: { examId: string; studentId: string } }>,
  ) => {
    const actor = getActor(request);
    const { examId, studentId } = request.params;
    const result = await resultService.getStudentExamResultForTeacher(
      actor,
      examId,
      studentId,
    );
    return { result, detail: result };
  };

  app.get<{ Params: { examId: string; studentId: string } }>(
    "/v1/teacher/exams/:examId/results/:studentId",
    { preHandler: [requireAuth] },
    handleGetStudentResult,
  );

  app.get<{ Params: { examId: string; studentId: string } }>(
    "/v1/teacher/exams/:examId/results/students/:studentId",
    { preHandler: [requireAuth] },
    handleGetStudentResult,
  );

  const handleGradeDescriptiveAnswer = async (
    request: FastifyRequest<{
      Params: { examId: string; attemptId: string; questionId: string };
      Body: unknown;
    }>,
  ) => {
    const actor = getActor(request);
    const { examId, attemptId, questionId } = request.params;
    const result = await resultService.gradeDescriptiveAnswer(
      actor,
      examId,
      attemptId,
      questionId,
      request.body,
    );
    return result;
  };

  app.put<{
    Params: { examId: string; attemptId: string; questionId: string };
    Body: unknown;
  }>(
    "/v1/teacher/exams/:examId/attempts/:attemptId/answers/:questionId/grade",
    { preHandler: [requireAuth] },
    handleGradeDescriptiveAnswer,
  );

  app.patch<{
    Params: { examId: string; attemptId: string; questionId: string };
    Body: unknown;
  }>(
    "/v1/teacher/exams/:examId/attempts/:attemptId/answers/:questionId/grade",
    { preHandler: [requireAuth] },
    handleGradeDescriptiveAnswer,
  );

  // -------------------------------------------------------------------------
  // Assignment Endpoints (Teacher)
  // -------------------------------------------------------------------------

  app.post(
    "/v1/teacher/classrooms/:classroomId/assignments",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!assignmentService) {
        throw new DomainError("bad_request", "Assignment service not available");
      }
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      const assignment = await assignmentService.createAssignment(
        actor,
        classroomId,
        request.body,
      );
      reply.code(201);
      return { assignment };
    },
  );

  app.get(
    "/v1/teacher/classrooms/:classroomId/assignments",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!assignmentService) {
        throw new DomainError("bad_request", "Assignment service not available");
      }
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      const assignments = await assignmentService.listTeacherClassroomAssignments(
        actor,
        classroomId,
      );
      return { assignments };
    },
  );

  app.get(
    "/v1/teacher/assignments/:assignmentId",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!assignmentService) {
        throw new DomainError("bad_request", "Assignment service not available");
      }
      const actor = getActor(request);
      const { assignmentId } = request.params as { assignmentId: string };
      const details = await assignmentService.getTeacherAssignmentDetails(
        actor,
        assignmentId,
      );
      return details;
    },
  );

  const handleUpdateAssignment = async (request: FastifyRequest) => {
    if (!assignmentService) {
      throw new DomainError("bad_request", "Assignment service not available");
    }
    const actor = getActor(request);
    const { assignmentId } = request.params as { assignmentId: string };
    const assignment = await assignmentService.updateAssignment(
      actor,
      assignmentId,
      request.body,
    );
    return { assignment };
  };

  app.patch(
    "/v1/teacher/assignments/:assignmentId",
    { preHandler: [requireAuth] },
    handleUpdateAssignment,
  );

  app.put(
    "/v1/teacher/assignments/:assignmentId",
    { preHandler: [requireAuth] },
    handleUpdateAssignment,
  );

  app.post(
    "/v1/teacher/assignments/:assignmentId/publish",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!assignmentService) {
        throw new DomainError("bad_request", "Assignment service not available");
      }
      const actor = getActor(request);
      const { assignmentId } = request.params as { assignmentId: string };
      const assignment = await assignmentService.publishAssignment(
        actor,
        assignmentId,
      );
      return { assignment };
    },
  );

  app.post(
    "/v1/teacher/assignments/:assignmentId/unpublish",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!assignmentService) {
        throw new DomainError("bad_request", "Assignment service not available");
      }
      const actor = getActor(request);
      const { assignmentId } = request.params as { assignmentId: string };
      const assignment = await assignmentService.unpublishAssignment(
        actor,
        assignmentId,
      );
      return { assignment };
    },
  );

  app.post(
    "/v1/teacher/assignments/:assignmentId/archive",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!assignmentService) {
        throw new DomainError("bad_request", "Assignment service not available");
      }
      const actor = getActor(request);
      const { assignmentId } = request.params as { assignmentId: string };
      const assignment = await assignmentService.archiveAssignment(
        actor,
        assignmentId,
      );
      return { assignment };
    },
  );

  app.delete(
    "/v1/teacher/assignments/:assignmentId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!assignmentService) {
        throw new DomainError("bad_request", "Assignment service not available");
      }
      const actor = getActor(request);
      const { assignmentId } = request.params as { assignmentId: string };
      await assignmentService.deleteAssignment(actor, assignmentId);
      reply.code(204);
      return;
    },
  );

  app.get(
    "/v1/teacher/assignments/:assignmentId/submissions",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!assignmentService) {
        throw new DomainError("bad_request", "Assignment service not available");
      }
      const actor = getActor(request);
      const { assignmentId } = request.params as { assignmentId: string };
      const result = await assignmentService.listAssignmentSubmissions(
        actor,
        assignmentId,
      );
      return result;
    },
  );

  // -------------------------------------------------------------------------
  // Educational Content Endpoints (Teacher)
  // -------------------------------------------------------------------------

  app.post(
    "/v1/teacher/classrooms/:classroomId/contents",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!contentService) {
        throw new DomainError("bad_request", "Content service not available");
      }
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      const content = await contentService.createContent(
        actor,
        classroomId,
        request.body,
      );
      reply.code(201);
      return { content };
    },
  );

  app.get(
    "/v1/teacher/classrooms/:classroomId/contents",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!contentService) {
        throw new DomainError("bad_request", "Content service not available");
      }
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      const contents = await contentService.listTeacherClassroomContents(
        actor,
        classroomId,
      );
      return { contents };
    },
  );

  app.get(
    "/v1/teacher/contents/:contentId",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!contentService) {
        throw new DomainError("bad_request", "Content service not available");
      }
      const actor = getActor(request);
      const { contentId } = request.params as { contentId: string };
      const content = await contentService.getTeacherContentDetails(
        actor,
        contentId,
      );
      return { content };
    },
  );

  const handleUpdateContent = async (request: FastifyRequest) => {
    if (!contentService) {
      throw new DomainError("bad_request", "Content service not available");
    }
    const actor = getActor(request);
    const { contentId } = request.params as { contentId: string };
    const content = await contentService.updateContent(
      actor,
      contentId,
      request.body,
    );
    return { content };
  };

  app.patch(
    "/v1/teacher/contents/:contentId",
    { preHandler: [requireAuth] },
    handleUpdateContent,
  );

  app.put(
    "/v1/teacher/contents/:contentId",
    { preHandler: [requireAuth] },
    handleUpdateContent,
  );

  app.post(
    "/v1/teacher/contents/:contentId/publish",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!contentService) {
        throw new DomainError("bad_request", "Content service not available");
      }
      const actor = getActor(request);
      const { contentId } = request.params as { contentId: string };
      const content = await contentService.publishContent(actor, contentId);
      return { content };
    },
  );

  app.post(
    "/v1/teacher/contents/:contentId/unpublish",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!contentService) {
        throw new DomainError("bad_request", "Content service not available");
      }
      const actor = getActor(request);
      const { contentId } = request.params as { contentId: string };
      const content = await contentService.unpublishContent(actor, contentId);
      return { content };
    },
  );

  app.post(
    "/v1/teacher/contents/:contentId/archive",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!contentService) {
        throw new DomainError("bad_request", "Content service not available");
      }
      const actor = getActor(request);
      const { contentId } = request.params as { contentId: string };
      const content = await contentService.archiveContent(actor, contentId);
      return { content };
    },
  );

  app.delete(
    "/v1/teacher/contents/:contentId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!contentService) {
        throw new DomainError("bad_request", "Content service not available");
      }
      const actor = getActor(request);
      const { contentId } = request.params as { contentId: string };
      await contentService.deleteContent(actor, contentId);
      reply.code(204);
      return;
    },
  );

  // -------------------------------------------------------------------------
  // Educational Content Files (Upload & Stream)
  // -------------------------------------------------------------------------

  app.post(
    "/v1/teacher/contents/files",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      getActor(request);

      if (!storageProvider) {
        throw new DomainError(
          "service_unavailable",
          "سرویس ذخیره‌سازی فایل در دسترس نیست.",
        );
      }

      const file = await request.file({
        limits: {
          fileSize: 30 * 1024 * 1024, // 30MB limit
          files: 1,
        },
      });

      if (!file) {
        throw new DomainError("bad_request", "هیچ فایلی ارسال نشده است.");
      }

      const rawFilename = file.filename || "file";
      const fileExtFromFilename =
        rawFilename.split(".").pop()?.toLowerCase() || "";
      const rawMime = (file.mimetype || "").toLowerCase();

      const ALLOWED_MIME_MAP: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "application/pdf": "pdf",
        "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
          "docx",
        "application/vnd.ms-powerpoint": "ppt",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation":
          "pptx",
      };

      const ALLOWED_EXTS = new Set([
        "jpg",
        "jpeg",
        "png",
        "webp",
        "pdf",
        "doc",
        "docx",
        "ppt",
        "pptx",
      ]);

      let ext = ALLOWED_MIME_MAP[rawMime];
      if (!ext && ALLOWED_EXTS.has(fileExtFromFilename)) {
        ext = fileExtFromFilename === "jpeg" ? "jpg" : fileExtFromFilename;
      }

      if (!ext) {
        throw new DomainError(
          "bad_request",
          "فرمت فایل نامعتبر است. فرمت‌های مجاز: تصویر (JPG، PNG، WebP)، PDF، Word (DOC، DOCX) و PowerPoint (PPT، PPTX).",
        );
      }

      const data = await file.toBuffer();
      if (data.length > 30 * 1024 * 1024) {
        throw new DomainError(
          "bad_request",
          "حجم فایل بیش از حد مجاز است (حداکثر ۳۰ مگابایت).",
        );
      }
      if (data.length === 0) {
        throw new DomainError("bad_request", "فایل ارسالی خالی است.");
      }

      const storageKey = `classroom-contents/${crypto.randomUUID()}.${ext}`;

      let mimeToSave = rawMime;
      if (!mimeToSave || mimeToSave === "application/octet-stream") {
        if (ext === "pdf") mimeToSave = "application/pdf";
        else if (ext === "png") mimeToSave = "image/png";
        else if (ext === "jpg" || ext === "jpeg") mimeToSave = "image/jpeg";
        else if (ext === "webp") mimeToSave = "image/webp";
        else if (ext === "docx")
          mimeToSave =
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        else if (ext === "doc") mimeToSave = "application/msword";
        else if (ext === "pptx")
          mimeToSave =
            "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        else if (ext === "ppt") mimeToSave = "application/vnd.ms-powerpoint";
        else mimeToSave = "application/octet-stream";
      }

      await storageProvider.save({
        storageKey,
        data,
        mimeType: mimeToSave,
      });

      const fileUrl = `/v1/teacher/contents/files/${encodeURIComponent(storageKey)}`;

      reply.code(201);
      return {
        file_url: fileUrl,
        fileUrl,
        file_name: rawFilename,
        fileName: rawFilename,
        file_size_bytes: data.length,
        fileSizeBytes: data.length,
        mime_type: mimeToSave,
        mimeType: mimeToSave,
        file_mime_type: mimeToSave,
        fileMimeType: mimeToSave,
        storage_key: storageKey,
        storageKey,
      };
    },
  );

  app.get(
    "/v1/teacher/contents/files/*",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);

      if (!storageProvider) {
        throw new DomainError(
          "service_unavailable",
          "سرویس ذخیره‌سازی فایل در دسترس نیست.",
        );
      }

      const rawKey = (request.params as { "*": string })["*"];
      if (!rawKey) {
        throw new DomainError("bad_request", "مسیر فایل الزامی است.");
      }

      const storageKey = decodeURIComponent(rawKey);

      // Path traversal security check
      if (
        !storageKey.startsWith("classroom-contents/") ||
        storageKey.includes("..")
      ) {
        throw new DomainError("bad_request", "مسیر فایل نامعتبر است.");
      }

      // Explicit IDOR Authorization check
      if (contentService) {
        await contentService.verifyContentFileAccess(actor, storageKey);
      }

      const exists = await storageProvider.exists(storageKey);
      if (!exists) {
        throw new DomainError("not_found", "فایل آموزشی یافت نشد.");
      }

      const ext = storageKey.split(".").pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        png: "image/png",
        webp: "image/webp",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ppt: "application/vnd.ms-powerpoint",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      };
      const mimeType = (ext && mimeMap[ext]) || "application/octet-stream";

      const data = await storageProvider.read(storageKey);

      reply
        .header("Content-Type", mimeType)
        .header(
          "Content-Disposition",
          `inline; filename="content-file.${ext}"`,
        )
        .header("Content-Length", data.length)
        .header("Cache-Control", "private, max-age=3600");

      return reply.send(data);
    },
  );

  // -------------------------------------------------------------------------
  // Student Messages / Conversations Endpoints (Teacher)
  // -------------------------------------------------------------------------

  app.get(
    "/v1/teacher/conversations",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      if (!messageService) {
        throw new DomainError("not_found", "سرویس پیام‌ها در دسترس نیست.");
      }
      return messageService.listTeacherConversations(actor, request.query);
    },
  );

  app.get(
    "/v1/teacher/conversations/:conversationId",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { conversationId } = request.params as { conversationId: string };
      if (!messageService) {
        throw new DomainError("not_found", "سرویس پیام‌ها در دسترس نیست.");
      }
      return messageService.getTeacherConversation(actor, conversationId);
    },
  );

  app.post(
    "/v1/teacher/conversations/:conversationId/reply",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { conversationId } = request.params as { conversationId: string };
      if (!messageService) {
        throw new DomainError("not_found", "سرویس پیام‌ها در دسترس نیست.");
      }
      const result = await messageService.replyAsTeacher(
        actor,
        conversationId,
        request.body,
      );
      reply.code(201);
      return result;
    },
  );

  app.patch(
    "/v1/teacher/conversations/:conversationId/status",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { conversationId } = request.params as { conversationId: string };
      if (!messageService) {
        throw new DomainError("not_found", "سرویس پیام‌ها در دسترس نیست.");
      }
      return messageService.updateStatusAsTeacher(
        actor,
        conversationId,
        request.body,
      );
    },
  );
};
