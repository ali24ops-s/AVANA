import type { ApiClient } from "./client.js";
import type {
  SourcePackResource,
  SourcePackResponse,
  SourcePackListResponse,
  CreateSourcePackRequest,
  UpdateSourcePackRequest,
  SourcePackGenerateRequest,
} from "@avana/contracts";

export function createSourcePacksApi(client: ApiClient) {
  return {
    async listSourcePacks(
      organizationId: string,
      courseId: string,
    ): Promise<SourcePackResource[]> {
      const res = await client.get<SourcePackListResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/source-packs`,
      );
      return res.source_packs ?? [];
    },

    async getSourcePack(
      organizationId: string,
      courseId: string,
      packId: string,
    ): Promise<SourcePackResource> {
      const res = await client.get<SourcePackResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/source-packs/${packId}`,
      );
      return res.source_pack;
    },

    async createSourcePack(
      organizationId: string,
      courseId: string,
      data: CreateSourcePackRequest,
    ): Promise<SourcePackResource> {
      const res = await client.post<SourcePackResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/source-packs`,
        data,
      );
      return res.source_pack;
    },

    async updateSourcePack(
      organizationId: string,
      courseId: string,
      packId: string,
      data: UpdateSourcePackRequest,
    ): Promise<SourcePackResource> {
      const res = await client.patch<SourcePackResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/source-packs/${packId}`,
        data,
      );
      return res.source_pack;
    },

    async deleteSourcePack(
      organizationId: string,
      courseId: string,
      packId: string,
    ): Promise<void> {
      await client.delete(
        `/v1/organizations/${organizationId}/courses/${courseId}/source-packs/${packId}`,
      );
    },

    async generateSourcePack(
      organizationId: string,
      courseId: string,
      packId: string,
      options?: SourcePackGenerateRequest,
    ): Promise<{ job_id: string; status: string }> {
      return await client.post<{ request_id: string; job_id: string; status: string }>(
        `/v1/organizations/${organizationId}/courses/${courseId}/source-packs/${packId}/generate`,
        options ?? {},
      );
    },

    async estimateSourcePackCost(
      organizationId: string,
      courseId: string,
      packId: string,
      types?: string[],
    ) {
      const params = types && types.length > 0 ? `?types=${types.join(",")}` : "";
      return await client.get<{ request_id: string; estimate: unknown }>(
        `/v1/organizations/${organizationId}/courses/${courseId}/source-packs/${packId}/estimate-cost${params}`,
      );
    },
  };
}

export type SourcePacksApi = ReturnType<typeof createSourcePacksApi>;
