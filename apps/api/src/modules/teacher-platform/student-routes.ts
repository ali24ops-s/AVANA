import type { FastifyPluginAsync } from "fastify";
import { DomainError, asUserId, type Actor } from "@avana/domain";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { ClassroomService } from "./services/classroom-service.js";
import type { TeacherExamAttemptService } from "./services/attempt-service.js";
import type { TeacherExamResultService } from "./services/result-service.js";
import type { AssignmentService } from "./services/assignment-service.js";

export interface StudentRouteOptions extends AuthMiddlewareDeps {
  classroomService: ClassroomService;
  attemptService: TeacherExamAttemptService;
  resultService: TeacherExamResultService;
  assignmentService?: AssignmentService;
}

export const studentTeacherPlatformRoutes: FastifyPluginAsync<
  StudentRouteOptions
> = async (app, opts) => {
  const { requireAuth } = makeAuthMiddleware(opts);
  const { classroomService, attemptService, resultService, assignmentService } =
    opts;


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
};
