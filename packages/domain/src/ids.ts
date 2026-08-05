/**
 * Framework-independent ID primitives for AVANA.
 *
 * - Runtime validation helpers are exported (no framework dependencies).
 * - Type branding prevents mixing unrelated IDs at compile time.
 */

type Brand<K, T> = K & { readonly __brand: T };

export type UUID = Brand<string, "uuid">;

export function isUUID(value: string): value is UUID {
  // RFC 4122 version-agnostic UUID format
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function parseUUID(value: string, fieldName = "id"): UUID {
  if (!isUUID(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as UUID;
}

export type UserId = Brand<UUID, "userId">;
export type OrganizationId = Brand<UUID, "organizationId">;
export type CourseId = Brand<UUID, "courseId">;
export type ModuleId = Brand<UUID, "moduleId">;
export type LessonId = Brand<UUID, "lessonId">;

export function asUserId(id: UUID): UserId {
  return id as UserId;
}

export function asOrganizationId(id: UUID): OrganizationId {
  return id as OrganizationId;
}

export function asCourseId(id: UUID): CourseId {
  return id as CourseId;
}

export function asModuleId(id: UUID): ModuleId {
  return id as ModuleId;
}

export function asLessonId(id: UUID): LessonId {
  return id as LessonId;
}

export function isModuleId(value: string): value is ModuleId {
  return isUUID(value);
}

export function isLessonId(value: string): value is LessonId {
  return isUUID(value);
}

export function parseModuleId(value: string, fieldName = "moduleId"): ModuleId {
  if (!isModuleId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as ModuleId;
}

export function parseLessonId(value: string, fieldName = "lessonId"): LessonId {
  if (!isLessonId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as LessonId;
}
