import type {
  DocumentId,
  OrganizationId,
  PresentationProjectId,
  PresentationProjectRecord,
  PresentationReferenceAccessStatus,
  PresentationReferenceId,
  PresentationReferenceRecord,
  PresentationReferenceType,
  CreatePresentationReferenceInput,
  UpdatePresentationReferenceInput,
  PresentationSlideId,
  PresentationSlideRecord,
  CreatePresentationSlideInput,
  UpdatePresentationSlideInput,
  SlideReferenceContextSnapshot,
} from "@avana/domain";

export interface PresentationReferenceCriteria {
  sourceIdentifier?: string | null;
  documentId?: DocumentId | null;
  title?: string;
  type?: PresentationReferenceType;
}

export interface PresentationReferenceStore {
  create(
    input: CreatePresentationReferenceInput,
  ): Promise<PresentationReferenceRecord>;

  findById(
    id: PresentationReferenceId,
    projectId: PresentationProjectId,
  ): Promise<PresentationReferenceRecord | null>;

  findByProjectId(
    projectId: PresentationProjectId,
  ): Promise<PresentationReferenceRecord[]>;

  findSimilarInProject(
    projectId: PresentationProjectId,
    criteria: PresentationReferenceCriteria,
  ): Promise<PresentationReferenceRecord | null>;

  update(
    id: PresentationReferenceId,
    projectId: PresentationProjectId,
    input: UpdatePresentationReferenceInput,
  ): Promise<PresentationReferenceRecord>;

  updateAccessStatus(
    id: PresentationReferenceId,
    projectId: PresentationProjectId,
    status: PresentationReferenceAccessStatus,
    errorSnippet?: string,
  ): Promise<PresentationReferenceRecord>;

  delete(
    id: PresentationReferenceId,
    projectId: PresentationProjectId,
  ): Promise<boolean>;

  countByProjectId(
    projectId: PresentationProjectId,
  ): Promise<number>;
}

export interface PresentationProjectStore {
  findById(
    id: PresentationProjectId,
  ): Promise<PresentationProjectRecord | null>;

  findByIdForOrganization(
    id: PresentationProjectId,
    organizationId: OrganizationId,
  ): Promise<PresentationProjectRecord | null>;
}

export interface PresentationSlideStore {
  createSlide(
    input: CreatePresentationSlideInput,
  ): Promise<PresentationSlideRecord>;

  findById(
    id: PresentationSlideId,
    projectId: PresentationProjectId,
  ): Promise<PresentationSlideRecord | null>;

  findBySlideIndex(
    projectId: PresentationProjectId,
    slideIndex: number,
  ): Promise<PresentationSlideRecord | null>;

  findByProjectId(
    projectId: PresentationProjectId,
  ): Promise<PresentationSlideRecord[]>;

  updateSlide(
    id: PresentationSlideId,
    projectId: PresentationProjectId,
    input: UpdatePresentationSlideInput,
  ): Promise<PresentationSlideRecord>;

  saveReferenceSnapshot(
    slideId: PresentationSlideId,
    projectId: PresentationProjectId,
    snapshot: SlideReferenceContextSnapshot,
  ): Promise<PresentationSlideRecord>;

  getReferenceSnapshot(
    slideId: PresentationSlideId,
    projectId: PresentationProjectId,
  ): Promise<SlideReferenceContextSnapshot | null>;

  deleteSlide(
    id: PresentationSlideId,
    projectId: PresentationProjectId,
  ): Promise<boolean>;

  countByProjectId(
    projectId: PresentationProjectId,
  ): Promise<number>;
}

