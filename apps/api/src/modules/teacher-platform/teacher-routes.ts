import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { DomainError, asUserId, type Actor } from "@avana/domain";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { ClassroomService } from "./services/classroom-service.js";
import type { TeacherExamService } from "./services/exam-service.js";
import type { TeacherExamResultService } from "./services/result-service.js";
import type { AssignmentService } from "./services/assignment-service.js";

export interface TeacherRouteOptions extends AuthMiddlewareDeps {
  classroomService: ClassroomService;
  examService: TeacherExamService;
  resultService: TeacherExamResultService;
  assignmentService?: AssignmentService;
}

export const teacherRoutes: FastifyPluginAsync<TeacherRouteOptions> = async (
  app,
  opts,
) => {
  const { requireAuth } = makeAuthMiddleware(opts);
  const { classroomService, examService, resultService, assignmentService } = opts;


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
};
