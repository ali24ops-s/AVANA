/**
 * AVANA Presentation Assistant — Frontend API Client
 *
 * Strictly maps to backend contracts in @avana/contracts and @avana/domain:
 * - Projects: list, get, create, update
 * - Slides: create, update, generate
 * - References: list, get, add, update, delete
 */

import { createApiClient, getApiBaseUrl, downloadBlob, type ApiClient } from "./client.js";
import type {
  ImportPptxResponse,
  PresentationProjectResponse,
  PresentationProjectListResponse,
  CreatePresentationProjectRequest,
  UpdatePresentationProjectRequest,
  PresentationSlideResponse,
  CreatePresentationSlideRequest,
  UpdatePresentationSlideRequest,
  GenerateSlideRequest,
  GenerateSlideResponse,
  GenerateAllSlidesRequest,
  GenerateAllSlidesResponse,
  PresentationGenerationStatusResponse,
  PresentationBatchCostPreviewResponse,
  PresentationReferenceResponse,
  PresentationReferenceListResponse,
  CreatePresentationReferenceRequest,
  UpdatePresentationReferenceRequest,
  PresentationPdfStatusResponse,
  ExportPresentationPdfRequest,
  PresentationPdfExportOptions,
} from "@avana/contracts";

export interface ImportPptxOptions {
  title?: string;
  organizationId?: string;
  targetDurationMinutes?: number;
  academicLevel?: "introductory" | "intermediate" | "advanced";
  tone?: "formal_scientific" | "fluent_student";
  elaborationDepth?: "concise" | "balanced" | "comprehensive";
}

export interface PresentationApiClient {
  // Project APIs
  listProjects(organizationId?: string): Promise<PresentationProjectListResponse>;
  getProject(projectId: string): Promise<PresentationProjectResponse>;
  createProject(data: CreatePresentationProjectRequest): Promise<PresentationProjectResponse>;
  updateProject(projectId: string, data: UpdatePresentationProjectRequest): Promise<PresentationProjectResponse>;
  importPptx(file: File, options?: ImportPptxOptions): Promise<ImportPptxResponse>;
  generateAllSlides(
    projectId: string,
    data?: GenerateAllSlidesRequest,
  ): Promise<GenerateAllSlidesResponse>;
  getGenerationStatus(projectId: string): Promise<PresentationGenerationStatusResponse>;
  getBatchCostPreview(
    projectId: string,
    onlyUnprocessed?: boolean,
  ): Promise<PresentationBatchCostPreviewResponse>;
  getPdfStatus(projectId: string): Promise<PresentationPdfStatusResponse>;
  getPdfUrl(projectId: string): string;
  exportPdf(
    projectId: string,
    data: ExportPresentationPdfRequest,
  ): Promise<void>;

  // Slide APIs
  createSlide(projectId: string, data: CreatePresentationSlideRequest): Promise<PresentationSlideResponse>;
  updateSlide(
    projectId: string,
    slideId: string,
    data: UpdatePresentationSlideRequest,
  ): Promise<PresentationSlideResponse>;
  generateSlide(
    projectId: string,
    slideId: string,
    data?: GenerateSlideRequest,
  ): Promise<GenerateSlideResponse>;


  // Reference APIs
  listReferences(projectId: string): Promise<PresentationReferenceListResponse>;
  getReference(projectId: string, referenceId: string): Promise<PresentationReferenceResponse>;
  createReference(
    projectId: string,
    data: CreatePresentationReferenceRequest,
  ): Promise<PresentationReferenceResponse>;
  updateReference(
    projectId: string,
    referenceId: string,
    data: UpdatePresentationReferenceRequest,
  ): Promise<PresentationReferenceResponse>;
  deleteReference(projectId: string, referenceId: string): Promise<void>;
  uploadReference(
    projectId: string,
    file: File,
    metadata?: { title?: string; type?: "pdf" | "docx" | "text" | "doi" | "pubmed" | "url" },
  ): Promise<PresentationReferenceResponse>;
}

export function createPresentationApiClient(
  client: ApiClient = createApiClient({ baseUrl: getApiBaseUrl() }),
): PresentationApiClient {
  return {
    // Projects
    listProjects(organizationId?: string): Promise<PresentationProjectListResponse> {
      return client.get<PresentationProjectListResponse>("/v1/presentation/projects", {
        params: organizationId ? { organization_id: organizationId } : undefined,
      });
    },

    getProject(projectId: string): Promise<PresentationProjectResponse> {
      return client.get<PresentationProjectResponse>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}`,
      );
    },

    createProject(data: CreatePresentationProjectRequest): Promise<PresentationProjectResponse> {
      return client.post<PresentationProjectResponse>("/v1/presentation/projects", data);
    },

    updateProject(
      projectId: string,
      data: UpdatePresentationProjectRequest,
    ): Promise<PresentationProjectResponse> {
      return client.patch<PresentationProjectResponse>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}`,
        data,
      );
    },

    importPptx(file: File, options?: ImportPptxOptions): Promise<ImportPptxResponse> {
      const formData = new FormData();
      formData.append("file", file, file.name);
      if (options?.title) formData.append("title", options.title);
      if (options?.organizationId) formData.append("organization_id", options.organizationId);
      if (options?.targetDurationMinutes) {
        formData.append("target_duration_minutes", String(options.targetDurationMinutes));
      }
      if (options?.academicLevel) formData.append("academic_level", options.academicLevel);
      if (options?.tone) formData.append("tone", options.tone);
      if (options?.elaborationDepth) formData.append("elaboration_depth", options.elaborationDepth);

      return client.post<ImportPptxResponse>("/v1/presentation/projects/import-pptx", formData);
    },

    generateAllSlides(
      projectId: string,
      data?: GenerateAllSlidesRequest,
    ): Promise<GenerateAllSlidesResponse> {
      return client.post<GenerateAllSlidesResponse>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}/generate-all`,
        data ?? {},
      );
    },

    getGenerationStatus(projectId: string): Promise<PresentationGenerationStatusResponse> {
      return client.get<PresentationGenerationStatusResponse>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}/generation-status`,
      );
    },

    getBatchCostPreview(
      projectId: string,
      onlyUnprocessed?: boolean,
    ): Promise<PresentationBatchCostPreviewResponse> {
      const query = onlyUnprocessed ? "?only_unprocessed=true" : "";
      return client.get<PresentationBatchCostPreviewResponse>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}/batch-cost-preview${query}`,
      );
    },

    // Slides
    createSlide(
      projectId: string,
      data: CreatePresentationSlideRequest,
    ): Promise<PresentationSlideResponse> {
      return client.post<PresentationSlideResponse>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}/slides`,
        data,
      );
    },

    updateSlide(
      projectId: string,
      slideId: string,
      data: UpdatePresentationSlideRequest,
    ): Promise<PresentationSlideResponse> {
      return client.patch<PresentationSlideResponse>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}/slides/${encodeURIComponent(slideId)}`,
        data,
      );
    },

    generateSlide(
      projectId: string,
      slideId: string,
      data?: GenerateSlideRequest,
    ): Promise<GenerateSlideResponse> {
      return client.post<GenerateSlideResponse>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}/slides/${encodeURIComponent(slideId)}/generate`,
        data ?? {},
      );
    },

    // References
    listReferences(projectId: string): Promise<PresentationReferenceListResponse> {
      return client.get<PresentationReferenceListResponse>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}/references`,
      );
    },

    getReference(projectId: string, referenceId: string): Promise<PresentationReferenceResponse> {
      return client.get<PresentationReferenceResponse>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}/references/${encodeURIComponent(referenceId)}`,
      );
    },

    createReference(
      projectId: string,
      data: CreatePresentationReferenceRequest,
    ): Promise<PresentationReferenceResponse> {
      return client.post<PresentationReferenceResponse>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}/references`,
        data,
      );
    },

    updateReference(
      projectId: string,
      referenceId: string,
      data: UpdatePresentationReferenceRequest,
    ): Promise<PresentationReferenceResponse> {
      return client.patch<PresentationReferenceResponse>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}/references/${encodeURIComponent(referenceId)}`,
        data,
      );
    },

    deleteReference(projectId: string, referenceId: string): Promise<void> {
      return client.delete<void>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}/references/${encodeURIComponent(referenceId)}`,
      );
    },

    uploadReference(
      projectId: string,
      file: File,
      metadata?: { title?: string; type?: "pdf" | "docx" | "text" | "doi" | "pubmed" | "url" },
    ): Promise<PresentationReferenceResponse> {
      const formData = new FormData();
      formData.append("file", file, file.name);
      if (metadata?.title) formData.append("title", metadata.title);
      if (metadata?.type) formData.append("type", metadata.type);

      return client.post<PresentationReferenceResponse>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}/references/upload`,
        formData,
      );
    },

    getPdfStatus(projectId: string): Promise<PresentationPdfStatusResponse> {
      return client.get<PresentationPdfStatusResponse>(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}/pdf-status`,
      );
    },

    getPdfUrl(projectId: string): string {
      const base = getApiBaseUrl().replace(/\/$/, "");
      return `${base}/v1/presentation/projects/${encodeURIComponent(projectId)}/slides-pdf`;
    },

    async exportPdf(
      projectId: string,
      data: ExportPresentationPdfRequest,
    ): Promise<void> {
      const res = await client.postBlob(
        `/v1/presentation/projects/${encodeURIComponent(projectId)}/export-pdf`,
        data,
      );

      const filename = res.filename || `presentation-${projectId}.pdf`;
      downloadBlob(res.blob, filename);
    },
  };
}

export const presentationApi = createPresentationApiClient();
