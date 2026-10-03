import {
  DomainError,
  asUserId,
  asOrganizationId,
  type Actor,
  type UserId,
  type AuthorizationPolicy,
  type Classroom,
  type ClassroomAssignment,
  type AssignmentSubmission,
  type AssignmentPersistedStatus,
  type RuntimeAssignmentState,
  defaultPolicy,
  calculateRuntimeAssignmentState,
  validateCreateAssignmentInput,
  validateUpdateAssignmentInput,
  validateSubmitAssignmentInput,
} from "@avana/domain";
import type {
  AssignmentStore,
  AssignmentSubmissionStore,
  ClassroomStore,
  ClassroomMemberStore,
} from "../stores.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";
import type { UserStore } from "../../identity/user-store.js";
import type { NotificationService } from "../../notifications/notification-service.js";
import type { StorageProvider } from "../../storage/storage-provider.js";

export interface TeacherAssignmentListItemDTO {
  id: string;
  classroomId: string;
  teacherId: string;
  title: string;
  description: string | null;
  startsAt: string;
  dueAt: string;
  status: AssignmentPersistedStatus;
  submissionsCount: number;
  totalMembersCount: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface StudentAssignmentListItemDTO {
  id: string;
  classroomId: string;
  title: string;
  description: string | null;
  startsAt: string;
  dueAt: string;
  status: AssignmentPersistedStatus;
  runtimeState: RuntimeAssignmentState;
  studentStatus: "submitted" | "can_submit" | "not_started" | "expired";
  hasSubmitted: boolean;
  submittedAt: string | null;
  createdAt: string;
}

export interface StudentSubmissionDetailItem {
  studentId: string;
  studentName: string;
  studentEmail: string;
  submitted: boolean;
  submission: {
    id: string;
    answerText: string;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    attachmentSizeBytes?: number | null;
    submittedAt: string;
  } | null;
}

export interface TeacherAssignmentSubmissionsListDTO {
  assignment: ClassroomAssignment;
  submissions: StudentSubmissionDetailItem[];
  stats: {
    submittedCount: number;
    totalStudentsCount: number;
  };
}

export class AssignmentService {
  constructor(
    private readonly assignmentStore: AssignmentStore,
    private readonly submissionStore: AssignmentSubmissionStore,
    private readonly classroomStore: ClassroomStore,
    private readonly memberStore: ClassroomMemberStore,
    private readonly organizationStore: OrganizationStore,
    private readonly userStore: UserStore,
    public readonly policy: AuthorizationPolicy = defaultPolicy,
    private readonly notificationService?: NotificationService,
    private readonly storageProvider?: StorageProvider,
  ) {}

  /**
   * Extracts storage key from an attachment URL.
   */
  private extractStorageKey(url?: string | null): string | null {
    if (!url) return null;
    if (url.startsWith("assignments/")) return url;
    const match = url.match(/\/attachments\/(.+)$/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
    return null;
  }

  /**
   * Verifies if an actor is authorized to access a given assignment attachment.
   * Access is allowed if:
   * 1. Actor is a platform admin.
   * 2. Actor is the student owner who uploaded the attachment namespace (assignments/<studentId>/...).
   * 3. Actor is the student owner of the submission referencing this attachment.
   * 4. Actor is the classroom teacher (or organization admin) for the assignment.
   */
  async verifyAttachmentAccess(
    actor: Actor,
    storageKey: string,
  ): Promise<void> {
    if (
      actor.globalRole === "platform_admin" ||
      actor.role === "platform_admin"
    ) {
      return;
    }

    // Direct namespace check if student ID is in storageKey (assignments/<studentId>/...)
    if (storageKey.startsWith(`assignments/${actor.userId}/`)) {
      return;
    }

    // Check submission ownership and classroom teacher access
    const submission = await this.submissionStore.findByAttachmentUrl(storageKey);
    if (!submission) {
      throw new DomainError(
        "forbidden",
        "شما اجازه دسترسی به این فایل پیوست را ندارید.",
      );
    }

    // Student owner
    if (submission.studentId === actor.userId) {
      return;
    }

    // Classroom teacher or org admin
    const assignment = await this.assignmentStore.getById(submission.assignmentId);
    if (assignment) {
      try {
        await this.assertTeacherClassroomAccess(actor, assignment.classroomId);
        return;
      } catch {
        // Fall through to forbidden error
      }
    }

    throw new DomainError(
      "forbidden",
      "شما اجازه دسترسی به این فایل پیوست را ندارید.",
    );
  }


  /**
   * Helper: checks if actor has teacher access to a specific classroom.
   */
  async assertTeacherClassroomAccess(
    actor: Actor,
    classroomId: string,
  ): Promise<Classroom> {
    const classroom = await this.classroomStore.getById(classroomId);
    if (!classroom) {
      throw new DomainError("not_found", "کلاس یافت نشد");
    }

    if (
      actor.globalRole === "platform_admin" ||
      actor.role === "platform_admin"
    ) {
      return classroom;
    }

    if (classroom.teacherId === actor.userId) {
      return classroom;
    }

    const membership = await this.organizationStore.findMembership(
      asOrganizationId(classroom.organizationId),
      asUserId(actor.userId),
    );

    if (membership && membership.role === "organization_admin") {
      return classroom;
    }

    throw new DomainError("not_found", "کلاس یافت نشد");
  }

  // -------------------------------------------------------------------------
  // Teacher Operations
  // -------------------------------------------------------------------------

  /**
   * Creates an assignment under a teacher's classroom.
   */
  async createAssignment(
    actor: Actor,
    classroomId: string,
    raw: unknown,
  ): Promise<ClassroomAssignment> {
    const classroom = await this.assertTeacherClassroomAccess(actor, classroomId);
    if (classroom.status === "archived") {
      throw new DomainError("bad_request", "امکان ایجاد تکلیف برای کلاس بایگانی‌شده وجود ندارد");
    }

    const input = validateCreateAssignmentInput({
      ...(raw && typeof raw === "object" ? raw : {}),
      classroomId,
    });

    const assignment = await this.assignmentStore.create({
      id: crypto.randomUUID(),
      classroomId: classroom.id,
      teacherId: actor.userId,
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      dueAt: input.dueAt,
      status: input.status ?? "draft",
      archivedAt: null,
    });

    if (assignment.status === "published") {
      await this.dispatchToActiveMembers(assignment.classroomId, async (studentIds, cl) => {
        await this.notificationService!.notifyClassroomAssignmentPublished(studentIds, {
          assignmentId: assignment.id,
          classroomId: assignment.classroomId,
          assignmentTitle: assignment.title,
          classTitle: cl.title,
        });
      });
    }

    return assignment;
  }

  /**
   * Updates an existing assignment.
   */
  async updateAssignment(
    actor: Actor,
    assignmentId: string,
    raw: unknown,
  ): Promise<ClassroomAssignment> {
    const assignment = await this.assignmentStore.getById(assignmentId);
    if (!assignment) {
      throw new DomainError("not_found", "تکلیف یافت نشد");
    }

    await this.assertTeacherClassroomAccess(actor, assignment.classroomId);

    if (assignment.status === "archived") {
      throw new DomainError("bad_request", "تکلیف بایگانی‌شده قابل ویرایش نیست");
    }

    const input = validateUpdateAssignmentInput(raw);
    const wasPublished = assignment.status === "published";
    const willBePublished = (input.status ?? assignment.status) === "published";
    const dueAtChanged = input.dueAt !== undefined && input.dueAt !== assignment.dueAt;
    const becamePublished = !wasPublished && willBePublished;

    const patch: Partial<
      Omit<
        ClassroomAssignment,
        "id" | "classroomId" | "teacherId" | "createdAt" | "updatedAt"
      >
    > = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.startsAt !== undefined) patch.startsAt = input.startsAt;
    if (input.dueAt !== undefined) patch.dueAt = input.dueAt;
    if (input.status !== undefined) patch.status = input.status;

    const updated = await this.assignmentStore.update(assignmentId, patch);

    if (!updated) {
      throw new DomainError("not_found", "تکلیف یافت نشد");
    }

    if (becamePublished) {
      await this.dispatchToActiveMembers(updated.classroomId, async (studentIds, cl) => {
        await this.notificationService!.notifyClassroomAssignmentPublished(studentIds, {
          assignmentId: updated.id,
          classroomId: updated.classroomId,
          assignmentTitle: updated.title,
          classTitle: cl.title,
        });
      });
    } else if (willBePublished && dueAtChanged) {
      await this.dispatchToActiveMembers(updated.classroomId, async (studentIds, cl) => {
        await this.notificationService!.notifyClassroomAssignmentDueChanged(studentIds, {
          assignmentId: updated.id,
          classroomId: updated.classroomId,
          assignmentTitle: updated.title,
          classTitle: cl.title,
          dueAt: updated.dueAt,
        });
      });
    }

    return updated;
  }

  /**
   * Publishes an assignment so students in the classroom can view and submit it.
   */
  async publishAssignment(
    actor: Actor,
    assignmentId: string,
  ): Promise<ClassroomAssignment> {
    const assignment = await this.assignmentStore.getById(assignmentId);
    if (!assignment) {
      throw new DomainError("not_found", "تکلیف یافت نشد");
    }

    await this.assertTeacherClassroomAccess(actor, assignment.classroomId);

    if (assignment.status === "published") {
      return assignment;
    }

    const updated = await this.assignmentStore.update(assignmentId, {
      status: "published",
    });

    await this.dispatchToActiveMembers(updated!.classroomId, async (studentIds, cl) => {
      await this.notificationService!.notifyClassroomAssignmentPublished(studentIds, {
        assignmentId: updated!.id,
        classroomId: updated!.classroomId,
        assignmentTitle: updated!.title,
        classTitle: cl.title,
      });
    });

    return updated!;
  }

  /**
   * Unpublishes an assignment back to draft.
   */
  async unpublishAssignment(
    actor: Actor,
    assignmentId: string,
  ): Promise<ClassroomAssignment> {
    const assignment = await this.assignmentStore.getById(assignmentId);
    if (!assignment) {
      throw new DomainError("not_found", "تکلیف یافت نشد");
    }

    await this.assertTeacherClassroomAccess(actor, assignment.classroomId);

    const updated = await this.assignmentStore.update(assignmentId, {
      status: "draft",
    });

    return updated!;
  }

  /**
   * Archives an assignment.
   */
  async archiveAssignment(
    actor: Actor,
    assignmentId: string,
  ): Promise<ClassroomAssignment> {
    const assignment = await this.assignmentStore.getById(assignmentId);
    if (!assignment) {
      throw new DomainError("not_found", "تکلیف یافت نشد");
    }

    await this.assertTeacherClassroomAccess(actor, assignment.classroomId);

    const updated = await this.assignmentStore.update(assignmentId, {
      status: "archived",
      archivedAt: new Date().toISOString(),
    });

    if (assignment.status === "published") {
      await this.dispatchToActiveMembers(updated!.classroomId, async (studentIds, cl) => {
        await this.notificationService!.notifyClassroomAssignmentArchived(studentIds, {
          assignmentId: updated!.id,
          classroomId: updated!.classroomId,
          assignmentTitle: updated!.title,
          classTitle: cl.title,
        });
      });
    }

    return updated!;
  }

  private async dispatchToActiveMembers(
    classroomId: string,
    callback: (studentIds: UserId[], classroom: Classroom) => Promise<unknown>,
  ): Promise<void> {
    if (!this.memberStore || !this.notificationService) return;
    try {
      const classroom = await this.classroomStore.getById(classroomId);
      if (!classroom) return;
      const members = await this.memberStore.listMembers(classroomId, "active");
      const studentIds = members.map((m) => asUserId(m.studentId));
      if (studentIds.length === 0) return;
      await callback(studentIds, classroom);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[AssignmentService] Graceful notification dispatch error:", err);
    }
  }

  /**
   * Deletes an assignment.
   */
  async deleteAssignment(actor: Actor, assignmentId: string): Promise<void> {
    const assignment = await this.assignmentStore.getById(assignmentId);
    if (!assignment) {
      throw new DomainError("not_found", "تکلیف یافت نشد");
    }

    await this.assertTeacherClassroomAccess(actor, assignment.classroomId);

    await this.assignmentStore.delete(assignmentId);
  }

  /**
   * Lists assignments in a classroom for the teacher with submission statistics.
   */
  async listTeacherClassroomAssignments(
    actor: Actor,
    classroomId: string,
  ): Promise<TeacherAssignmentListItemDTO[]> {
    await this.assertTeacherClassroomAccess(actor, classroomId);

    const assignments = await this.assignmentStore.listByClassroom(classroomId);
    const members = await this.memberStore.listMembers(classroomId, "active");
    const totalMembersCount = members.length;

    const result: TeacherAssignmentListItemDTO[] = [];
    for (const a of assignments) {
      const submissionsCount = await this.submissionStore.countByAssignment(a.id);
      result.push({
        id: a.id,
        classroomId: a.classroomId,
        teacherId: a.teacherId,
        title: a.title,
        description: a.description ?? null,
        startsAt: a.startsAt,
        dueAt: a.dueAt,
        status: a.status,
        submissionsCount,
        totalMembersCount,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        archivedAt: a.archivedAt ?? null,
      });
    }

    return result;
  }

  /**
   * Gets details of a single assignment for the teacher.
   */
  async getTeacherAssignmentDetails(
    actor: Actor,
    assignmentId: string,
  ): Promise<{
    assignment: ClassroomAssignment;
    submissionsCount: number;
    totalMembersCount: number;
  }> {
    const assignment = await this.assignmentStore.getById(assignmentId);
    if (!assignment) {
      throw new DomainError("not_found", "تکلیف یافت نشد");
    }

    await this.assertTeacherClassroomAccess(actor, assignment.classroomId);

    const members = await this.memberStore.listMembers(
      assignment.classroomId,
      "active",
    );
    const submissionsCount = await this.submissionStore.countByAssignment(
      assignmentId,
    );

    return {
      assignment,
      submissionsCount,
      totalMembersCount: members.length,
    };
  }

  /**
   * Lists all submissions of an assignment for the teacher, including not submitted students.
   */
  async listAssignmentSubmissions(
    actor: Actor,
    assignmentId: string,
  ): Promise<TeacherAssignmentSubmissionsListDTO> {
    const assignment = await this.assignmentStore.getById(assignmentId);
    if (!assignment) {
      throw new DomainError("not_found", "تکلیف یافت نشد");
    }

    await this.assertTeacherClassroomAccess(actor, assignment.classroomId);

    const activeMembers = await this.memberStore.listMembers(
      assignment.classroomId,
      "active",
    );
    const submissions = await this.submissionStore.listByAssignment(assignmentId);

    const submissionMap = new Map<string, AssignmentSubmission>();
    for (const sub of submissions) {
      submissionMap.set(sub.studentId, sub);
    }

    const items: StudentSubmissionDetailItem[] = [];
    let submittedCount = 0;

    for (const member of activeMembers) {
      const user = await this.userStore.findById(asUserId(member.studentId));
      const sub = submissionMap.get(member.studentId);
      const isSubmitted = Boolean(sub);

      if (isSubmitted) {
        submittedCount++;
      }

      const userName = user
        ? (user.name?.trim() || user.email)
        : "دانشجو";


      items.push({
        studentId: member.studentId,
        studentName: userName,
        studentEmail: user?.email ?? "",
        submitted: isSubmitted,
        submission: sub
          ? {
              id: sub.id,
              answerText: sub.answerText,
              attachmentUrl: sub.attachmentUrl ?? null,
              attachmentName: sub.attachmentName ?? null,
              attachmentSizeBytes: sub.attachmentSizeBytes ?? null,
              submittedAt: sub.submittedAt,
            }
          : null,
      });
    }

    return {
      assignment,
      submissions: items,
      stats: {
        submittedCount,
        totalStudentsCount: activeMembers.length,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Student Operations
  // -------------------------------------------------------------------------

  /**
   * Lists published assignments accessible to a student in a classroom.
   */
  async listStudentClassroomAssignments(
    actor: Actor,
    classroomId: string,
  ): Promise<StudentAssignmentListItemDTO[]> {
    const membership = await this.memberStore.getMembership(
      classroomId,
      actor.userId,
    );
    if (!membership || membership.status !== "active") {
      throw new DomainError("forbidden", "شما عضو فعال این کلاس نیستید");
    }

    const classroom = await this.classroomStore.getById(classroomId);
    if (!classroom || classroom.status === "archived") {
      throw new DomainError("not_found", "کلاس یافت نشد یا بایگانی شده است");
    }

    const assignments = await this.assignmentStore.listByClassroom(
      classroomId,
      "published",
    );
    const now = new Date();

    const result: StudentAssignmentListItemDTO[] = [];
    for (const a of assignments) {
      const submission = await this.submissionStore.get(a.id, actor.userId);
      const runtimeState = calculateRuntimeAssignmentState(a, now);
      const hasSubmitted = Boolean(submission);

      let studentStatus: "submitted" | "can_submit" | "not_started" | "expired";
      if (hasSubmitted) {
        studentStatus = "submitted";
      } else if (runtimeState === "active") {
        studentStatus = "can_submit";
      } else if (runtimeState === "upcoming") {
        studentStatus = "not_started";
      } else {
        studentStatus = "expired";
      }

      result.push({
        id: a.id,
        classroomId: a.classroomId,
        title: a.title,
        description: a.description ?? null,
        startsAt: a.startsAt,
        dueAt: a.dueAt,
        status: a.status,
        runtimeState,
        studentStatus,
        hasSubmitted,
        submittedAt: submission ? submission.submittedAt : null,
        createdAt: a.createdAt,
      });
    }

    return result;
  }

  /**
   * Gets details of a published assignment for a student.
   */
  async getStudentAssignmentDetails(
    actor: Actor,
    assignmentId: string,
  ): Promise<{
    assignment: ClassroomAssignment;
    submission: AssignmentSubmission | null;
    runtimeState: RuntimeAssignmentState;
    canSubmit: boolean;
  }> {
    const assignment = await this.assignmentStore.getById(assignmentId);
    if (!assignment || assignment.status !== "published") {
      throw new DomainError("not_found", "تکلیف یافت نشد");
    }

    const membership = await this.memberStore.getMembership(
      assignment.classroomId,
      actor.userId,
    );
    if (!membership || membership.status !== "active") {
      throw new DomainError("forbidden", "شما عضو فعال این کلاس نیستید");
    }

    const submission = await this.submissionStore.get(assignmentId, actor.userId);
    const runtimeState = calculateRuntimeAssignmentState(assignment, new Date());
    const canSubmit = runtimeState === "active";

    return {
      assignment,
      submission,
      runtimeState,
      canSubmit,
    };
  }

  /**
   * Submits or resubmits an answer for an assignment.
   * Enforces server-side timing (startsAt <= now <= dueAt).
   */
  async submitAssignment(
    actor: Actor,
    assignmentId: string,
    raw: unknown,
  ): Promise<AssignmentSubmission> {
    const assignment = await this.assignmentStore.getById(assignmentId);
    if (!assignment || assignment.status !== "published") {
      throw new DomainError("not_found", "تکلیف یافت نشد");
    }

    const membership = await this.memberStore.getMembership(
      assignment.classroomId,
      actor.userId,
    );
    if (!membership || membership.status !== "active") {
      throw new DomainError("forbidden", "شما عضو فعال این کلاس نیستید");
    }

    const now = new Date();
    const startTime = new Date(assignment.startsAt).getTime();
    const dueTime = new Date(assignment.dueAt).getTime();
    const currentTime = now.getTime();

    if (currentTime < startTime) {
      throw new DomainError(
        "bad_request",
        "زمان ارسال پاسخ به این تکلیف هنوز فرا نرسیده است",
      );
    }

    if (currentTime > dueTime) {
      throw new DomainError(
        "bad_request",
        "مهلت ارسال پاسخ به این تکلیف به پایان رسیده است",
      );
    }

    const input = validateSubmitAssignmentInput(raw);

    // Lifecycle cleanup: delete old attachment file if it was replaced or removed
    const existingSubmission = await this.submissionStore.get(assignmentId, actor.userId);
    if (
      existingSubmission?.attachmentUrl &&
      existingSubmission.attachmentUrl !== input.attachmentUrl &&
      this.storageProvider
    ) {
      const oldStorageKey = this.extractStorageKey(existingSubmission.attachmentUrl);
      if (oldStorageKey) {
        try {
          await this.storageProvider.delete(oldStorageKey);
        } catch {
          // Gracefully continue even if storage delete fails
        }
      }
    }

    const submission = await this.submissionStore.upsert({
      id: crypto.randomUUID(),
      assignmentId,
      studentId: actor.userId,
      answerText: input.answerText ?? "",
      attachmentUrl: input.attachmentUrl ?? null,
      attachmentName: input.attachmentName ?? null,
      attachmentSizeBytes: input.attachmentSizeBytes ?? null,
      status: "submitted",
    });

    return submission;
  }
}
