import type { FastifyPluginAsync } from "fastify";
import { DomainError, asUserId, type Actor } from "@avana/domain";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { StorageProvider } from "../storage/index.js";
import type { ClassroomService } from "./services/classroom-service.js";
import type { TeacherExamAttemptService } from "./services/attempt-service.js";
import type { TeacherExamResultService } from "./services/result-service.js";
import type { AssignmentService } from "./services/assignment-service.js";
import type { ClassroomContentService } from "./services/content-service.js";
import type { TeacherMessageService } from "./services/message-service.js";

export interface StudentRouteOptions extends AuthMiddlewareDeps {
  classroomService: ClassroomService;
  attemptService: TeacherExamAttemptService;
  resultService: TeacherExamResultService;
  assignmentService?: AssignmentService;
  contentService?: ClassroomContentService;
  messageService?: TeacherMessageService;
  storageProvider?: StorageProvider;
}

export const studentTeacherPlatformRoutes: FastifyPluginAsync<
  StudentRouteOptions
> = async (app, opts) => {
  const { requireAuth } = makeAuthMiddleware(opts);
  const {
    classroomService,
    attemptService,
    resultService,
    assignmentService,
    contentService,
    messageService,
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
  // Classroom Endpoints (Student)
  // -------------------------------------------------------------------------

  app.post(
    "/v1/student/classrooms/join",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const result = await classroomService.joinClassroom(actor, request.body);
      return result;
    },
  );

  app.get(
    "/v1/student/classrooms",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const classrooms = await classroomService.listStudentClassrooms(actor);
      return { classrooms };
    },
  );

  app.post(
    "/v1/student/classrooms/:classroomId/leave",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      const member = await classroomService.leaveClassroom(actor, classroomId);
      return { member };
    },
  );

  // -------------------------------------------------------------------------
  // Exam Listing Endpoints (Student)
  // -------------------------------------------------------------------------

  app.get(
    "/v1/student/classrooms/:classroomId/exams",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      const exams = await attemptService.listStudentExams(actor, classroomId);
      return { exams };
    },
  );

  app.get(
    "/v1/student/exams",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const exams = await attemptService.listStudentExams(actor);
      return { exams };
    },
  );

  // -------------------------------------------------------------------------
  // Attempt Endpoints (Student)
  // -------------------------------------------------------------------------

  app.post(
    "/v1/student/exams/:examId/start",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      const attempt = await attemptService.startAttempt(actor, examId);
      reply.code(201);
      return { attempt };
    },
  );

  app.get(
    "/v1/student/exams/:examId/current",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      const attempt = await attemptService.getCurrentAttempt(actor, examId);
      return { attempt };
    },
  );

  app.put(
    "/v1/student/exams/:examId/answers/:questionId",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { examId, questionId } = request.params as {
        examId: string;
        questionId: string;
      };
      await attemptService.saveAnswer(
        actor,
        examId,
        questionId,
        request.body,
      );
      return { success: true };
    },
  );

  app.post(
    "/v1/student/exams/:examId/submit",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      const result = await attemptService.submitAttempt(actor, examId);
      return { result };
    },
  );

  app.get(
    "/v1/student/exams/:examId/review",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { examId } = request.params as { examId: string };
      const review = await resultService.getStudentReview(actor, examId);
      return { review };
    },
  );

  // -------------------------------------------------------------------------
  // Assignment Endpoints (Student)
  // -------------------------------------------------------------------------

  app.get(
    "/v1/student/classrooms/:classroomId/assignments",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!assignmentService) {
        throw new DomainError("bad_request", "Assignment service not available");
      }
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      const assignments =
        await assignmentService.listStudentClassroomAssignments(
          actor,
          classroomId,
        );
      return { assignments };
    },
  );

  app.get(
    "/v1/student/assignments/:assignmentId",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!assignmentService) {
        throw new DomainError("bad_request", "Assignment service not available");
      }
      const actor = getActor(request);
      const { assignmentId } = request.params as { assignmentId: string };
      const details = await assignmentService.getStudentAssignmentDetails(
        actor,
        assignmentId,
      );
      return details;
    },
  );

  app.post(
    "/v1/student/assignments/:assignmentId/submit",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!assignmentService) {
        throw new DomainError("bad_request", "Assignment service not available");
      }
      const actor = getActor(request);
      const { assignmentId } = request.params as { assignmentId: string };
      const submission = await assignmentService.submitAssignment(
        actor,
        assignmentId,
        request.body,
      );
      reply.code(201);
      return { submission };
    },
  );

  // -------------------------------------------------------------------------
  // Assignment Submission Attachments (Upload & Stream)
  // -------------------------------------------------------------------------

  app.post(
    "/v1/student/assignments/attachments",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);

      if (!opts.storageProvider) {
        throw new DomainError(
          "service_unavailable",
          "سرویس ذخیره‌سازی فایل در دسترس نیست.",
        );
      }

      const file = await request.file({
        limits: {
          fileSize: 20 * 1024 * 1024, // 20MB limit
          files: 1,
        },
      });

      if (!file) {
        throw new DomainError("bad_request", "هیچ فایلی ارسال نشده است.");
      }

      const rawFilename = file.filename || "attachment";
      const fileExtFromFilename = rawFilename.split(".").pop()?.toLowerCase() || "";
      const rawMime = (file.mimetype || "").toLowerCase();

      const ALLOWED_MIME_MAP: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "application/pdf": "pdf",
        "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.ms-excel": "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "application/vnd.ms-powerpoint": "ppt",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
        "text/plain": "txt",
        "text/markdown": "md",
        "application/zip": "zip",
        "application/x-zip-compressed": "zip",
        "application/x-rar-compressed": "rar",
        "application/vnd.rar": "rar",
        "application/x-7z-compressed": "7z",
      };

      const ALLOWED_EXTS = new Set([
        "jpg", "jpeg", "png", "webp", "pdf", "doc", "docx",
        "xls", "xlsx", "ppt", "pptx", "txt", "md", "zip", "rar", "7z",
      ]);

      let ext = ALLOWED_MIME_MAP[rawMime];
      if (!ext && ALLOWED_EXTS.has(fileExtFromFilename)) {
        ext = fileExtFromFilename === "jpeg" ? "jpg" : fileExtFromFilename;
      }

      if (!ext) {
        throw new DomainError(
          "bad_request",
          "فرمت فایل نامعتبر است. فرمت‌های مجاز: PDF، تصاویر (JPG، PNG، WebP)، اسناد آفیس (Word، Excel، PowerPoint)، متن و فایل‌های فشرده (ZIP، RAR).",
        );
      }

      const data = await file.toBuffer();
      if (data.length > 20 * 1024 * 1024) {
        throw new DomainError(
          "bad_request",
          "حجم فایل بیش از حد مجاز است (حداکثر ۲۰ مگابایت).",
        );
      }
      if (data.length === 0) {
        throw new DomainError("bad_request", "فایل ارسالی خالی است.");
      }

      const storageKey = `assignments/${actor.userId}/${crypto.randomUUID()}.${ext}`;

      let mimeToSave = rawMime;
      if (!mimeToSave || mimeToSave === "application/octet-stream") {
        if (ext === "pdf") mimeToSave = "application/pdf";
        else if (ext === "png") mimeToSave = "image/png";
        else if (ext === "jpg" || ext === "jpeg") mimeToSave = "image/jpeg";
        else if (ext === "webp") mimeToSave = "image/webp";
        else if (ext === "docx") mimeToSave = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        else if (ext === "doc") mimeToSave = "application/msword";
        else if (ext === "zip") mimeToSave = "application/zip";
        else mimeToSave = "application/octet-stream";
      }

      await opts.storageProvider.save({
        storageKey,
        data,
        mimeType: mimeToSave,
      });

      const attachmentUrl = `/v1/student/assignments/attachments/${encodeURIComponent(storageKey)}`;

      reply.code(201);
      return {
        attachment_url: attachmentUrl,
        attachmentUrl,
        attachment_name: rawFilename,
        attachmentName: rawFilename,
        attachment_size_bytes: data.length,
        attachmentSizeBytes: data.length,
        storage_key: storageKey,
      };
    },
  );

  app.get(
    "/v1/student/assignments/attachments/*",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);

      if (!opts.storageProvider) {
        throw new DomainError(
          "service_unavailable",
          "سرویس ذخیره‌سازی فایل در دسترس نیست.",
        );
      }

      const rawKey = (request.params as { "*": string })["*"];
      if (!rawKey) {
        throw new DomainError("bad_request", "مسیر فایل پیوست الزامی است.");
      }

      const storageKey = decodeURIComponent(rawKey);

      // Path traversal security check
      if (!storageKey.startsWith("assignments/") || storageKey.includes("..")) {
        throw new DomainError("bad_request", "مسیر فایل نامعتبر است.");
      }

      // Explicit IDOR Authorization check
      if (assignmentService) {
        await assignmentService.verifyAttachmentAccess(actor, storageKey);
      }

      const exists = await opts.storageProvider.exists(storageKey);
      if (!exists) {
        throw new DomainError("not_found", "فایل پیوست یافت نشد.");
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
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ppt: "application/vnd.ms-powerpoint",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        txt: "text/plain; charset=utf-8",
        md: "text/markdown; charset=utf-8",
        zip: "application/zip",
        rar: "application/x-rar-compressed",
        "7z": "application/x-7z-compressed",
      };
      const mimeType = (ext && mimeMap[ext]) || "application/octet-stream";

      const data = await opts.storageProvider.read(storageKey);

      reply
        .header("Content-Type", mimeType)
        .header("Content-Disposition", `inline; filename="assignment-attachment.${ext}"`)
        .header("Content-Length", data.length)
        .header("Cache-Control", "private, max-age=3600");

      return reply.send(data);
    },
  );

  // -------------------------------------------------------------------------
  // Educational Content Endpoints (Student)
  // -------------------------------------------------------------------------

  app.get(
    "/v1/student/classrooms/:classroomId/contents",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!contentService) {
        throw new DomainError("bad_request", "Content service not available");
      }
      const actor = getActor(request);
      const { classroomId } = request.params as { classroomId: string };
      const contents = await contentService.listStudentClassroomContents(
        actor,
        classroomId,
      );
      return { contents };
    },
  );

  app.get(
    "/v1/student/contents/:contentId",
    { preHandler: [requireAuth] },
    async (request) => {
      if (!contentService) {
        throw new DomainError("bad_request", "Content service not available");
      }
      const actor = getActor(request);
      const { contentId } = request.params as { contentId: string };
      const content = await contentService.getStudentContentDetails(
        actor,
        contentId,
      );
      return { content };
    },
  );

  app.get(
    "/v1/student/contents/files/*",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);

      if (!opts.storageProvider) {
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

      const exists = await opts.storageProvider.exists(storageKey);
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

      const data = await opts.storageProvider.read(storageKey);

      reply
        .header("Content-Type", mimeType)
        .header("Content-Disposition", `inline; filename="content-file.${ext}"`)
        .header("Content-Length", data.length)
        .header("Cache-Control", "private, max-age=3600");

      return reply.send(data);
    },
  );

  // -------------------------------------------------------------------------
  // Student Messages / Conversations Endpoints (Student)
  // -------------------------------------------------------------------------

  app.get(
    "/v1/student/conversations",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      if (!messageService) {
        throw new DomainError("not_found", "سرویس پیام‌ها در دسترس نیست.");
      }
      return messageService.listStudentConversations(actor, request.query);
    },
  );

  app.get(
    "/v1/student/conversations/:conversationId",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { conversationId } = request.params as { conversationId: string };
      if (!messageService) {
        throw new DomainError("not_found", "سرویس پیام‌ها در دسترس نیست.");
      }
      return messageService.getStudentConversation(actor, conversationId);
    },
  );

  app.post(
    "/v1/student/conversations",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      if (!messageService) {
        throw new DomainError("not_found", "سرویس پیام‌ها در دسترس نیست.");
      }
      const result = await messageService.createConversation(
        actor,
        request.body,
      );
      reply.code(201);
      return result;
    },
  );

  app.post(
    "/v1/student/conversations/:conversationId/reply",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { conversationId } = request.params as { conversationId: string };
      if (!messageService) {
        throw new DomainError("not_found", "سرویس پیام‌ها در دسترس نیست.");
      }
      const result = await messageService.replyAsStudent(
        actor,
        conversationId,
        request.body,
      );
      reply.code(201);
      return result;
    },
  );
};
