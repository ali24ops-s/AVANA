/**
 * Personal Mind Map Typed Client API.
 */

import type { ApiClient } from "./client.js";
import type {
  GetMindMapResponse,
  GenerateMindMapResponse,
  UpdateMindMapRequest,
  ExpandMindMapNodeResponse,
  MindMapDto,
} from "@avana/contracts";

export interface MindMapApi {
  getMindMap(
    moduleId: string,
    courseId?: string | null,
  ): Promise<GetMindMapResponse>;

  generateMindMap(
    moduleId: string,
    courseId?: string | null,
  ): Promise<GenerateMindMapResponse>;

  updateMindMap(
    moduleId: string,
    request: UpdateMindMapRequest,
    courseId?: string | null,
  ): Promise<{ request_id: string; mind_map: MindMapDto }>;

  expandNode(
    moduleId: string,
    nodeId: string,
    courseId?: string | null,
  ): Promise<ExpandMindMapNodeResponse>;

  resetMindMap(
    moduleId: string,
    courseId?: string | null,
  ): Promise<{ request_id: string; mind_map: MindMapDto }>;

  listVersions(
    moduleId: string,
    courseId?: string | null,
  ): Promise<import("@avana/contracts").ListMindMapVersionsResponse>;

  restoreVersion(
    moduleId: string,
    version: number,
    courseId?: string | null,
  ): Promise<import("@avana/contracts").RestoreMindMapVersionResponse>;

  exportMindMap(
    moduleId: string,
    format: "svg" | "html",
    courseId?: string | null,
  ): Promise<{ request_id: string; success: boolean; authorized: boolean; format: string }>;

  enrichMindMapChemicals(
    moduleId: string,
    courseId?: string | null,
    clientUpdatedAt?: string,
  ): Promise<import("@avana/contracts").EnrichMindMapChemicalsResponse>;
}

export function createMindMapApi(client: ApiClient): MindMapApi {
  return {
    async getMindMap(
      moduleId: string,
      courseId?: string | null,
    ): Promise<GetMindMapResponse> {
      const url = courseId
        ? `/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map`
        : `/v1/study/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map`;
      return client.get<GetMindMapResponse>(url);
    },

    async generateMindMap(
      moduleId: string,
      courseId?: string | null,
    ): Promise<GenerateMindMapResponse> {
      const url = courseId
        ? `/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map/generate`
        : `/v1/study/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map/generate`;
      return client.post<GenerateMindMapResponse>(url, {});
    },

    async updateMindMap(
      moduleId: string,
      request: UpdateMindMapRequest,
      courseId?: string | null,
    ): Promise<{ request_id: string; mind_map: MindMapDto }> {
      const url = courseId
        ? `/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map`
        : `/v1/study/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map`;
      return client.put<{ request_id: string; mind_map: MindMapDto }>(url, request);
    },

    async expandNode(
      moduleId: string,
      nodeId: string,
      courseId?: string | null,
    ): Promise<ExpandMindMapNodeResponse> {
      const url = courseId
        ? `/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map/nodes/${encodeURIComponent(nodeId)}/expand`
        : `/v1/study/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map/nodes/${encodeURIComponent(nodeId)}/expand`;
      return client.post<ExpandMindMapNodeResponse>(url, {});
    },

    async resetMindMap(
      moduleId: string,
      courseId?: string | null,
    ): Promise<{ request_id: string; mind_map: MindMapDto }> {
      const url = courseId
        ? `/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map/reset`
        : `/v1/study/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map/reset`;
      return client.post<{ request_id: string; mind_map: MindMapDto }>(url, {});
    },

    async listVersions(
      moduleId: string,
      courseId?: string | null,
    ): Promise<import("@avana/contracts").ListMindMapVersionsResponse> {
      const url = courseId
        ? `/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map/versions`
        : `/v1/study/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map/versions`;
      return client.get<import("@avana/contracts").ListMindMapVersionsResponse>(url);
    },

    async restoreVersion(
      moduleId: string,
      version: number,
      courseId?: string | null,
    ): Promise<import("@avana/contracts").RestoreMindMapVersionResponse> {
      const url = courseId
        ? `/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map/versions/${encodeURIComponent(version)}/restore`
        : `/v1/study/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map/versions/${encodeURIComponent(version)}/restore`;
      return client.post<import("@avana/contracts").RestoreMindMapVersionResponse>(url, {});
    },

    async exportMindMap(
      moduleId: string,
      format: "svg" | "html",
      courseId?: string | null,
    ): Promise<{ request_id: string; success: boolean; authorized: boolean; format: string }> {
      const url = courseId
        ? `/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map/export?format=${encodeURIComponent(format)}`
        : `/v1/study/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map/export?format=${encodeURIComponent(format)}`;
      return client.get<{ request_id: string; success: boolean; authorized: boolean; format: string }>(url);
    },

    async enrichMindMapChemicals(
      moduleId: string,
      courseId?: string | null,
      clientUpdatedAt?: string,
    ): Promise<import("@avana/contracts").EnrichMindMapChemicalsResponse> {
      const url = courseId
        ? `/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map/enrich-chemicals`
        : `/v1/study/modules/${encodeURIComponent(moduleId)}/personal-summary/mind-map/enrich-chemicals`;
      return client.post<import("@avana/contracts").EnrichMindMapChemicalsResponse>(url, {
        clientUpdatedAt,
      });
    },
  };
}
