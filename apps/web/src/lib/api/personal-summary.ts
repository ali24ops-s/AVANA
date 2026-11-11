/**
 * Personal Summary Typed Client API.
 */

import type { ApiClient } from "./client.js";
import type {
  GetPersonalSummaryResponse,
  GeneratePersonalSummaryResponse,
} from "@avana/contracts";

export interface PersonalSummaryApi {
  getPersonalSummary(
    moduleId: string,
    courseId?: string | null,
  ): Promise<GetPersonalSummaryResponse>;

  generatePersonalSummary(
    moduleId: string,
    courseId?: string | null,
  ): Promise<GeneratePersonalSummaryResponse>;
}

export function createPersonalSummaryApi(client: ApiClient): PersonalSummaryApi {
  return {
    async getPersonalSummary(
      moduleId: string,
      courseId?: string | null,
    ): Promise<GetPersonalSummaryResponse> {
      const url = courseId
        ? `/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/personal-summary`
        : `/v1/study/modules/${encodeURIComponent(moduleId)}/personal-summary`;
      return client.get<GetPersonalSummaryResponse>(url);
    },

    async generatePersonalSummary(
      moduleId: string,
      courseId?: string | null,
    ): Promise<GeneratePersonalSummaryResponse> {
      const url = courseId
        ? `/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/personal-summary/generate`
        : `/v1/study/modules/${encodeURIComponent(moduleId)}/personal-summary/generate`;
      return client.post<GeneratePersonalSummaryResponse>(url, {});
    },
  };
}
