import {
  DomainError,
  buildActor,
  defaultPolicy,
  asUserId,
  asOrganizationId,
  type Actor,
  type AuthorizationPolicy,
  type Classroom,
  type ClassroomMember,
  type ClassroomMemberStatus,
  generateInviteCode,
  validateCreateClassroomInput,
  validateUpdateClassroomInput,
  validateJoinClassroomInput,
} from "@avana/domain";
import type {
  ClassroomStore,
  ClassroomMemberStore,
  TeacherExamStore,
} from "../stores.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";
import type { UserStore } from "../../identity/user-store.js";

export interface ClassroomWithDetails extends Classroom {
  membersCount: number;
  examsCount: number;
}

export interface ClassroomMemberWithUser extends ClassroomMember {
  user?: {
    id: string;
    email: string;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
}

export interface StudentClassroomDTO {
  id: string;
  organizationId: string;
  teacherId: string;
  title: string;
  description: string | null;
  status: string;
  memberStatus: ClassroomMemberStatus;
  firstJoinedAt: string;
  lastJoinedAt: string;
}

export class ClassroomService {
  constructor(
    private readonly classroomStore: ClassroomStore,
    private readonly memberStore: ClassroomMemberStore,
    private readonly examStore: TeacherExamStore,
    private readonly organizationStore: OrganizationStore,
    private readonly userStore: UserStore,
    private readonly policy: AuthorizationPolicy = defaultPolicy,
  ) {}

  /**
   * Helper: checks if actor has teacher access to a specific classroom.
   * Enforces: platform_admin bypass OR org_admin in same tenant OR teacher owner.
   */
  async assertTeacherClassroomAccess(
    actor: Actor,
    classroomId: string,
  ): Promise<Classroom> {
    const classroom = await this.classroomStore.getById(classroomId);
    if (!classroom) {
      throw new DomainError("not_found", "کلاس یافت نشد");
    }

    if (actor.globalRole === "platform_admin" || actor.role === "platform_admin") {
      return classroom;
    }

    // Check if actor is the teacher who owns this classroom
    if (classroom.teacherId === actor.userId) {
      return classroom;
    }

    // Check if actor is an organization admin in the classroom's tenant
    const membership = await this.organizationStore.findMembership(
      asOrganizationId(classroom.organizationId),
      asUserId(actor.userId),
    );

    if (membership && membership.role === "organization_admin") {
      return classroom;
    }

    // IDOR protection: return not_found instead of forbidden for security
    throw new DomainError("not_found", "کلاس یافت نشد");
  }

  /**
   * Creates a classroom within an organization.
   * Actor must be authorized to create classrooms in that organization.
   */
  async createClassroom(actor: Actor, raw: unknown): Promise<Classroom> {
    const input = validateCreateClassroomInput(raw);

    // Verify actor's organization membership and authorization
    const memberships = await this.organizationStore.listMembershipsByUserId(
      asUserId(actor.userId),
    );
    const fullActor = buildActor({
      userId: asUserId(actor.userId),
      globalRole: actor.globalRole,
      role: actor.role,
      memberships,
    });

    if (
      !this.policy.can(fullActor, "classroom:create", {
        organizationId: input.organizationId,
      })
    ) {
      throw new DomainError(
        "forbidden",
        "مجوز ایجاد کلاس در این سازمان را ندارید",
      );
    }

    // Generate unique 8-character invite code
    let inviteCode = "";
    for (let attempts = 0; attempts < 10; attempts++) {
      const candidate = generateInviteCode(8);
      const existing = await this.classroomStore.getByInviteCode(candidate);
      if (!existing) {
        inviteCode = candidate;
        break;
      }
    }
    if (!inviteCode) {
      throw new DomainError(
        "internal_error",
        "خطا در ایجاد کد دعوت یکتا، لطفاً مجدداً تلاش کنید",
      );
    }

    return this.classroomStore.create({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      teacherId: actor.userId,
      courseId: input.courseId ?? null,
      title: input.title,
      description: input.description ?? null,
      inviteCode,
      status: "active",
    });
  }

  /**
   * Retrieves classroom details for teacher/admin.
   */
  async getClassroom(
    actor: Actor,
    classroomId: string,
  ): Promise<ClassroomWithDetails> {
    const classroom = await this.assertTeacherClassroomAccess(actor, classroomId);
    const members = await this.memberStore.listMembers(classroomId, "active");
    const exams = await this.examStore.listByClassroom(classroomId);

    return {
      ...classroom,
      membersCount: members.length,
      examsCount: exams.length,
    };
  }

  /**
   * Lists classrooms for a teacher, optionally filtered by organization.
   */
  async listTeacherClassrooms(
    actor: Actor,
    organizationId?: string,
  ): Promise<ClassroomWithDetails[]> {
    let classrooms: Classroom[] = [];

    if (actor.globalRole === "platform_admin" || actor.role === "platform_admin") {
      if (organizationId) {
        classrooms = await this.classroomStore.listByOrganization(organizationId);
      } else {
        classrooms = await this.classroomStore.listByTeacher(actor.userId);
      }
    } else if (organizationId) {
      const membership = await this.organizationStore.findMembership(
        asOrganizationId(organizationId),
        asUserId(actor.userId),
      );
      if (membership?.role === "organization_admin") {
        classrooms = await this.classroomStore.listByOrganization(organizationId);
      } else {
        classrooms = (await this.classroomStore.listByTeacher(actor.userId)).filter(
          (c) => c.organizationId === organizationId,
        );
      }
    } else {
      classrooms = await this.classroomStore.listByTeacher(actor.userId);
    }

    const results: ClassroomWithDetails[] = [];
    for (const c of classrooms) {
      const members = await this.memberStore.listMembers(c.id, "active");
      const exams = await this.examStore.listByClassroom(c.id);
      results.push({
        ...c,
        membersCount: members.length,
        examsCount: exams.length,
      });
    }

    return results;
  }

  /**
   * Lists classrooms within a specific organization for an authorized admin or teacher.
   */
  async listOrganizationClassrooms(
    actor: Actor,
    organizationId: string,
  ): Promise<ClassroomWithDetails[]> {
    return this.listTeacherClassrooms(actor, organizationId);
  }

  /**
   * Updates classroom metadata.
   */
  async updateClassroom(
    actor: Actor,
    classroomId: string,
    raw: unknown,
  ): Promise<Classroom> {
    const classroom = await this.assertTeacherClassroomAccess(actor, classroomId);
    if (classroom.status === "archived") {
      throw new DomainError(
        "bad_request",
        "امکان ویرایش کلاس بایگانی‌شده وجود ندارد",
      );
    }

    const patch = validateUpdateClassroomInput(raw);
    const updated = await this.classroomStore.update(classroomId, patch);
    if (!updated) {
      throw new DomainError("not_found", "کلاس یافت نشد");
    }
    return updated;
  }

  /**
   * Archives a classroom.
   */
  async archiveClassroom(actor: Actor, classroomId: string): Promise<Classroom> {
    await this.assertTeacherClassroomAccess(actor, classroomId);
    const archived = await this.classroomStore.archive(classroomId);
    if (!archived) {
      throw new DomainError("not_found", "کلاس یافت نشد");
    }
    return archived;
  }

  /**
   * Hard-deletes a classroom if no exams or attempts exist.
   * Enforced transactionally.
   */
  async deleteClassroom(actor: Actor, classroomId: string): Promise<void> {
    await this.assertTeacherClassroomAccess(actor, classroomId);

    const hasRecords = await this.classroomStore.hasExamsOrAttempts(classroomId);
    if (hasRecords) {
      throw new DomainError(
        "conflict",
        "کلاس دارای آزمون یا تلاش ثبت‌شده است و قابل حذف قطعی نیست. لطفاً از امکان بایگانی استفاده کنید.",
      );
    }

    const deleted = await this.classroomStore.delete(classroomId);
    if (!deleted) {
      throw new DomainError(
        "conflict",
        "امکان حذف کلاس وجود ندارد (وابستگی‌های فعال یافت شد)",
      );
    }
  }

  /**
   * Regenerates a new unique invite code for the classroom, invalidating the previous one.
   */
  async regenerateInviteCode(
    actor: Actor,
    classroomId: string,
  ): Promise<Classroom> {
    const classroom = await this.assertTeacherClassroomAccess(actor, classroomId);
    if (classroom.status === "archived") {
      throw new DomainError(
        "bad_request",
        "امکان تولید مجدد کد دعوت برای کلاس بایگانی‌شده وجود ندارد",
      );
    }

    let newCode = "";
    for (let attempts = 0; attempts < 10; attempts++) {
      const candidate = generateInviteCode(8);
      const existing = await this.classroomStore.getByInviteCode(candidate);
      if (!existing) {
        newCode = candidate;
        break;
      }
    }
    if (!newCode) {
      throw new DomainError("internal_error", "خطا در تولید کد دعوت جدید");
    }

    const updated = await this.classroomStore.update(classroomId, {
      inviteCode: newCode,
    });
    if (!updated) {
      throw new DomainError("not_found", "کلاس یافت نشد");
    }
    return updated;
  }

  /**
   * Lists all members of a classroom for teacher view.
   */
  async listMembers(
    actor: Actor,
    classroomId: string,
  ): Promise<ClassroomMemberWithUser[]> {
    await this.assertTeacherClassroomAccess(actor, classroomId);
    const members = await this.memberStore.listMembers(classroomId);

    const results: ClassroomMemberWithUser[] = [];
    for (const m of members) {
      const u = await this.userStore.findById(asUserId(m.studentId));
      let firstName: string | null = null;
      let lastName: string | null = null;
      if (u?.name) {
        const parts = u.name.trim().split(/\s+/);
        firstName = parts[0] || null;
        lastName = parts.slice(1).join(" ") || null;
      }
      results.push({
        ...m,
        user: u
          ? {
              id: u.id,
              email: u.email,
              name: u.name ?? null,
              firstName: (u as { firstName?: string | null }).firstName ?? firstName,
              lastName: (u as { lastName?: string | null }).lastName ?? lastName,
            }
          : undefined,
      });
    }

    return results;
  }

  /**
   * Teacher removes a student from a classroom.
   * Strictly preserves previous attempts and firstJoinedAt.
   */
  async removeMember(
    actor: Actor,
    classroomId: string,
    studentId: string,
  ): Promise<ClassroomMember> {
    await this.assertTeacherClassroomAccess(actor, classroomId);

    const membership = await this.memberStore.getMembership(classroomId, studentId);
    if (!membership || membership.status !== "active") {
      throw new DomainError("not_found", "عضو فعال در کلاس یافت نشد");
    }

    const updated = await this.memberStore.updateStatus(
      classroomId,
      studentId,
      "removed",
      new Date().toISOString(),
    );
    if (!updated) {
      throw new DomainError("not_found", "عضو در کلاس یافت نشد");
    }
    return updated;
  }

  // -------------------------------------------------------------------------
  // Student Actions
  // -------------------------------------------------------------------------

  /**
   * Student joins a classroom using an invite code.
   * Supports initial join and rejoin semantics.
   */
  async joinClassroom(
    actor: Actor,
    raw: unknown,
  ): Promise<{
    classroom: Classroom;
    member: ClassroomMember;
    membership: ClassroomMember;
    status: "joined" | "rejoined";
  }> {
    const input = validateJoinClassroomInput(raw);
    const classroom = await this.classroomStore.getByInviteCode(input.inviteCode);
    if (!classroom) {
      throw new DomainError("not_found", "کلاس با این کد دعوت یافت نشد");
    }

    if (classroom.status === "archived") {
      throw new DomainError(
        "bad_request",
        "این کلاس بایگانی شده و عضو جدید نمی‌پذیرد",
      );
    }

    const existing = await this.memberStore.getMembership(
      classroom.id,
      actor.userId,
    );

    if (existing && existing.status === "active") {
      throw new DomainError("conflict", "شما هم‌اکنون عضو فعال این کلاس هستید");
    }

    if (existing) {
      // Rejoin existing membership: preserves firstJoinedAt, clears leftAt
      const member = await this.memberStore.rejoinMember(
        classroom.id,
        actor.userId,
      );
      if (!member) {
        throw new DomainError("internal_error", "خطا در بازپیوستن به کلاس");
      }
      return { classroom, member, membership: member, status: "rejoined" };
    }

    // New membership
    const now = new Date().toISOString();
    const member = await this.memberStore.addMember({
      id: crypto.randomUUID(),
      classroomId: classroom.id,
      studentId: actor.userId,
      status: "active",
      firstJoinedAt: now,
      lastJoinedAt: now,
      leftAt: null,
    });

    return { classroom, member, membership: member, status: "joined" };
  }

  /**
   * Student voluntarily leaves a classroom.
   */
  async leaveClassroom(actor: Actor, classroomId: string): Promise<ClassroomMember> {
    const membership = await this.memberStore.getMembership(
      classroomId,
      actor.userId,
    );
    if (!membership || membership.status !== "active") {
      throw new DomainError("bad_request", "شما عضو فعال این کلاس نیستید");
    }

    const updated = await this.memberStore.updateStatus(
      classroomId,
      actor.userId,
      "left",
      new Date().toISOString(),
    );
    if (!updated) {
      throw new DomainError("not_found", "عضویت در کلاس یافت نشد");
    }
    return updated;
  }

  /**
   * Lists classrooms where the student is currently an active member.
   */
  async listStudentClassrooms(actor: Actor): Promise<StudentClassroomDTO[]> {
    const memberships = await this.memberStore.listClassroomsForStudent(
      actor.userId,
      "active",
    );
    const results: StudentClassroomDTO[] = [];

    for (const m of memberships) {
      const c = await this.classroomStore.getById(m.classroomId);
      if (c && c.status === "active") {
        results.push({
          id: c.id,
          organizationId: c.organizationId,
          teacherId: c.teacherId,
          title: c.title,
          description: c.description ?? null,
          status: c.status,
          memberStatus: m.status,
          firstJoinedAt: m.firstJoinedAt,
          lastJoinedAt: m.lastJoinedAt,
        });
      }
    }

    return results;
  }
}
