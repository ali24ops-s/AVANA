import {
  DomainError,
  asOrganizationId,
  asUserId,
  type Actor,
  type Classroom,
} from "@avana/domain";
import type { ClassroomStore } from "../stores.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";

/**
 * Asserts that the actor is authorized to perform teacher operations on a classroom.
 *
 * Enforces:
 * 1. Platform Admin bypass (superuser).
 * 2. Organization Admin of the classroom's owning organization (management oversight).
 * 3. Teacher owner (classroom.teacherId === actor.userId) ONLY IF:
 *    - teacherStatus is not 'rejected' and not 'pending'.
 *    - The actor actually holds a teacher role (globalRole === 'teacher' OR role === 'teacher' OR org membership with role === 'teacher').
 * 4. All unauthorized attempts throw DomainError("not_found", "کلاس یافت نشد") to prevent IDOR enumeration.
 */
export async function assertTeacherClassroomAccess(
  classroomStore: ClassroomStore,
  organizationStore: OrganizationStore,
  actor: Actor,
  classroomId: string,
): Promise<Classroom> {
  const classroom = await classroomStore.getById(classroomId);
  if (!classroom) {
    throw new DomainError("not_found", "کلاس یافت نشد");
  }

  // 1. Platform Admin bypass
  if (actor.globalRole === "platform_admin" || actor.role === "platform_admin") {
    return classroom;
  }

  // 2. Organization Admin in the classroom's tenant organization
  const membership = await organizationStore.findMembership(
    asOrganizationId(classroom.organizationId),
    asUserId(actor.userId),
  );

  if (membership && membership.role === "organization_admin") {
    return classroom;
  }

  // 3. Teacher Owner check
  if (classroom.teacherId === actor.userId) {
    // If teacher status is explicitly rejected or pending, no teacher operations allowed
    if (actor.teacherStatus === "rejected" || actor.teacherStatus === "pending") {
      throw new DomainError("not_found", "کلاس یافت نشد");
    }

    // Must hold teacher role globally, effectively, or in this tenant organization
    const hasTeacherRole =
      actor.globalRole === "teacher" ||
      actor.role === "teacher" ||
      membership?.role === "teacher";

    if (hasTeacherRole) {
      return classroom;
    }
  }

  // IDOR protection: return not_found instead of forbidden for security
  throw new DomainError("not_found", "کلاس یافت نشد");
}
