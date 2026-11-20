/**
 * TanStack Query hooks for Presentation Assistant.
 *
 * Implements robust caching, background revalidation, optimistic invalidation,
 * and typed error handling.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { presentationApi, type ImportPptxOptions } from "../lib/api/presentation.js";
import type {
  CreatePresentationProjectRequest,
  UpdatePresentationProjectRequest,
  CreatePresentationSlideRequest,
  UpdatePresentationSlideRequest,
  GenerateSlideRequest,
  CreatePresentationReferenceRequest,
  UpdatePresentationReferenceRequest,
  PresentationProjectResponse,
  PresentationProjectListResponse,
  GenerateSlideResponse,
  GenerateAllSlidesRequest,
  PresentationGenerationStatusResponse,
  PresentationBatchCostPreviewResponse,
  PresentationReferenceListResponse,
  ImportPptxResponse,
} from "@avana/contracts";

export const PRESENTATION_QUERY_KEYS = {
  allProjects: ["presentation-projects"] as const,
  projectList: (orgId?: string) => ["presentation-projects", { orgId }] as const,
  projectDetail: (projectId: string) => ["presentation-project", projectId] as const,
  references: (projectId: string) => ["presentation-references", projectId] as const,
  generationStatus: (projectId: string) => ["presentation-generation-status", projectId] as const,
  pdfStatus: (projectId: string) => ["presentation-pdf-status", projectId] as const,
};

/**
 * Hook to fetch all presentation projects for current user.
 */
export function usePresentationProjects(organizationId?: string) {
  return useQuery<PresentationProjectListResponse, Error>({
    queryKey: PRESENTATION_QUERY_KEYS.projectList(organizationId),
    queryFn: () => presentationApi.listProjects(organizationId),
    staleTime: 30_000,
  });
}

/**
 * Hook to fetch detailed presentation project (including nested slides & references).
 */
export function usePresentationProject(projectId: string | undefined) {
  return useQuery<PresentationProjectResponse, Error>({
    queryKey: projectId ? PRESENTATION_QUERY_KEYS.projectDetail(projectId) : ["presentation-project", "none"],
    queryFn: () => {
      if (!projectId) throw new Error("projectId is required");
      return presentationApi.getProject(projectId);
    },
    enabled: Boolean(projectId),
    staleTime: 10_000,
  });
}

/**
 * Hook to create a new presentation project manually.
 */
export function useCreatePresentationProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePresentationProjectRequest) =>
      presentationApi.createProject(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.allProjects,
      });
      if (data.project?.id) {
        queryClient.setQueryData(
          PRESENTATION_QUERY_KEYS.projectDetail(data.project.id),
          data,
        );
      }
    },
  });
}

/**
 * Hook to import a presentation project from a PPTX file.
 */
export function useImportPresentationPptx() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, options }: { file: File; options?: ImportPptxOptions }) =>
      presentationApi.importPptx(file, options),
    onSuccess: (data: ImportPptxResponse) => {
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.allProjects,
      });
      if (data.project?.id) {
        queryClient.setQueryData(
          PRESENTATION_QUERY_KEYS.projectDetail(data.project.id),
          {
            project: data.project,
            slides: data.slides,
            references: [],
          },
        );
      }
    },
  });
}

/**
 * Hook to update presentation project metadata.
 */
export function useUpdatePresentationProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdatePresentationProjectRequest) =>
      presentationApi.updateProject(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.allProjects,
      });
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.projectDetail(projectId),
      });
    },
  });
}

/**
 * Hook to create a new slide under project.
 */
export function useCreatePresentationSlide(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePresentationSlideRequest) =>
      presentationApi.createSlide(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.projectDetail(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.allProjects,
      });
    },
  });
}

/**
 * Hook to update an existing slide.
 */
export function useUpdatePresentationSlide(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      slideId,
      data,
    }: {
      slideId: string;
      data: UpdatePresentationSlideRequest;
    }) => presentationApi.updateSlide(projectId, slideId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.projectDetail(projectId),
      });
    },
  });
}

/**
 * Hook to trigger AI generation for a slide.
 */
export function useGeneratePresentationSlide(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      slideId,
      instructions,
    }: {
      slideId: string;
      instructions?: GenerateSlideRequest["instructions"];
    }) => presentationApi.generateSlide(projectId, slideId, { instructions }),
    onSuccess: (data: GenerateSlideResponse) => {
      queryClient.setQueryData<PresentationProjectResponse | undefined>(
        PRESENTATION_QUERY_KEYS.projectDetail(projectId),
        (prev) => {
          if (!prev) return prev;
          const updatedSlides = (prev.slides || []).map((s) =>
            s.id === data.slide.id ? data.slide : s,
          );
          return {
            ...prev,
            slides: updatedSlides,
          };
        },
      );
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.projectDetail(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.allProjects,
      });
    },
  });
}

/**
 * Hook to trigger batch generation for all slides.
 */
export function useGenerateAllPresentationSlides(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data?: GenerateAllSlidesRequest) =>
      presentationApi.generateAllSlides(projectId, data),
    onSuccess: (res) => {
      queryClient.setQueryData(
        PRESENTATION_QUERY_KEYS.generationStatus(projectId),
        res.status,
      );
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.projectDetail(projectId),
      });
    },
  });
}

/**
 * Hook to preview batch presentation cost, paid slide breakdown, and wallet sufficiency.
 */
export function usePresentationBatchCostPreview(
  projectId: string | undefined,
  onlyUnprocessed?: boolean,
  options?: { enabled?: boolean },
) {
  return useQuery<PresentationBatchCostPreviewResponse, Error>({
    queryKey: ["presentation-batch-cost-preview", projectId, onlyUnprocessed],
    queryFn: async () => {
      if (!projectId) throw new Error("projectId is required");
      return presentationApi.getBatchCostPreview(projectId, onlyUnprocessed);
    },
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    staleTime: 5_000,
  });
}

/**
 * Hook to fetch batch presentation generation status with live polling.
 */
export function usePresentationGenerationStatus(
  projectId: string | undefined,
  options?: { isPolling?: boolean },
) {
  const queryClient = useQueryClient();
  const isPolling = options?.isPolling ?? false;

  return useQuery<PresentationGenerationStatusResponse, Error>({
    queryKey: projectId
      ? PRESENTATION_QUERY_KEYS.generationStatus(projectId)
      : ["presentation-generation-status", "none"],
    queryFn: async () => {
      if (!projectId) throw new Error("projectId is required");
      const status = await presentationApi.getGenerationStatus(projectId);
      if (status.is_generating || status.status === "completed") {
        queryClient.invalidateQueries({
          queryKey: PRESENTATION_QUERY_KEYS.projectDetail(projectId),
        });
      }
      return status;
    },
    enabled: Boolean(projectId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (isPolling || data?.is_generating) {
        return 1500;
      }
      return false;
    },
  });
}

/**
 * Hook to fetch references for a project.
 */
export function usePresentationReferences(projectId: string | undefined) {
  return useQuery<PresentationReferenceListResponse, Error>({
    queryKey: projectId ? PRESENTATION_QUERY_KEYS.references(projectId) : ["presentation-references", "none"],
    queryFn: () => {
      if (!projectId) throw new Error("projectId is required");
      return presentationApi.listReferences(projectId);
    },
    enabled: Boolean(projectId),
    staleTime: 20_000,
  });
}

/**
 * Hook to create a new reference under project.
 */
export function useCreatePresentationReference(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePresentationReferenceRequest) =>
      presentationApi.createReference(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.references(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.projectDetail(projectId),
      });
    },
  });
}

/**
 * Hook to update reference metadata.
 */
export function useUpdatePresentationReference(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      referenceId,
      data,
    }: {
      referenceId: string;
      data: UpdatePresentationReferenceRequest;
    }) => presentationApi.updateReference(projectId, referenceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.references(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.projectDetail(projectId),
      });
    },
  });
}

/**
 * Hook to delete a reference.
 */
export function useDeletePresentationReference(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (referenceId: string) =>
      presentationApi.deleteReference(projectId, referenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.references(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.projectDetail(projectId),
      });
    },
  });
}

/**
 * Hook to upload a scientific reference file (PDF/Word/Text) and extract its content automatically.
 */
export function useUploadPresentationReference(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      metadata,
    }: {
      file: File;
      metadata?: { title?: string; type?: "pdf" | "docx" | "text" | "doi" | "pubmed" | "url" };
    }) => presentationApi.uploadReference(projectId, file, metadata),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.references(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: PRESENTATION_QUERY_KEYS.projectDetail(projectId),
      });
    },
  });
}

/**
 * Hook to poll PDF readiness status for slide viewer.
 * Automatically polls while "processing", stops when "ready", "failed", or "unavailable".
 */
export function usePresentationPdfStatus(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? PRESENTATION_QUERY_KEYS.pdfStatus(projectId) : ["presentation-pdf-status", "none"],
    queryFn: () => {
      if (!projectId) throw new Error("projectId is required");
      return presentationApi.getPdfStatus(projectId);
    },
    enabled: Boolean(projectId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "processing") {
        return 2500;
      }
      return false;
    },
    retry: 2,
    staleTime: 5_000,
  });
}

