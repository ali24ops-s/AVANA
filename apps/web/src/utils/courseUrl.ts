import { getCourseUrl as domainGetCourseUrl } from "@avana/domain";

export function getCourseUrl(course: { id: string; slug?: string | null }): string {
  return domainGetCourseUrl(course);
}
