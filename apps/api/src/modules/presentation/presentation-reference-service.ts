import {
  type Actor,
  type DocumentId,
  type OrganizationId,
  type PresentationProjectId,
  type PresentationProjectRecord,
  type PresentationReferenceAccessStatus,
  type PresentationReferenceId,
  type PresentationReferenceRecord,
  type PresentationReferenceType,
  type CreatePresentationReferenceInput,
  type UpdatePresentationReferenceInput,
  asDocumentId,
  DomainError,
  validatePresentationReferenceInput,
} from "@avana/domain";
import type {
  PresentationProjectStore,
  PresentationReferenceStore,
} from "./presentation-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { DocumentStore } from "../learning/learning-store.js";

export interface PresentationReferenceServiceDeps {
  referenceStore: PresentationReferenceStore;
  projectStore: PresentationProjectStore;
  organizationStore: OrganizationStore;
  documentStore?: DocumentStore;
  systemOrganizationId?: OrganizationId;
}

export interface ClientUpdateReferenceInput {
  title?: string;
  sourceIdentifier?: string | null;
  bibliographicMetadata?: Record<string, unknown>;
  extractedContent?: string | null;
}

export class PresentationReferenceService {
  constructor(private readonly deps: PresentationReferenceServiceDeps) {}

  /**
   * Authorize actor against presentation project.
   *
   * Enforces:
   * 1. Project must exist and not be soft-deleted.
   * 2. Platform admins have global access.
   * 3. Actor must belong to the project's organization (non-disclosing 404 if not).
   * 4. Organization admins have read & write access within their org.
   * 5. Project owner (ownerUserId === actor.userId) has read & write access.
   * 6. Other org members (e.g. course_editor) only have read access.
   */
  private async assertProjectAccess(
    actor: Actor,
    projectId: PresentationProjectId,
    mode: "read" | "write" = "read",
  ): Promise<PresentationProjectRecord> {
    const project = await this.deps.projectStore.findById(projectId);
    if (!project || project.deletedAt) {
      throw new DomainError("not_found", "Presentation project not found");
    }

    // Platform admin check
    if (
      actor.globalRole === "platform_admin" ||
      actor.role === "platform_admin"
    ) {
      return project;
    }

    // Resolve tenant membership
    const memberships =
      await this.deps.organizationStore.listMembershipsByUserId(actor.userId);
    const orgMembership = memberships?.find(
      (m) => m.organizationId === project.organizationId,
    );

    if (!orgMembership) {
      // Non-disclosing 404: user is not even a member of this tenant
      throw new DomainError("not_found", "Presentation project not found");
    }

    // Organization admin check
    if (
      orgMembership.role === "organization_admin" ||
      actor.role === "organization_admin"
    ) {
      return project;
    }

    // Project owner check
    if (project.ownerUserId === actor.userId) {
      return project;
    }

    // Read access for course_editor in the same organization
    if (mode === "read" && orgMembership.role === "course_editor") {
      return project;
    }

    // Forbidden for non-owners trying to write, or students attempting to view others' private projects
    throw new DomainError(
      "forbidden",
      "Role does not permit accessing this presentation project",
    );
  }

  /**
   * Add a new reference to a presentation project.
   */
  async addReference(
    actor: Actor,
    projectId: PresentationProjectId,
    input: {
      type: PresentationReferenceType;
      title: string;
      sourceIdentifier?: string | null;
      documentId?: DocumentId | null;
      bibliographicMetadata?: Record<string, unknown>;
      extractedContent?: string | null;
    },
  ): Promise<PresentationReferenceRecord> {
    const project = await this.assertProjectAccess(actor, projectId, "write");

    validatePresentationReferenceInput(input);

    // If referencing an existing physical document, verify it belongs to the same organization
    if (input.documentId && this.deps.documentStore) {
      const doc = await this.deps.documentStore.findByIdForOrganization(
        input.documentId,
        project.organizationId,
      );
      if (!doc) {
        throw new DomainError(
          "bad_request",
          "Referenced document not found in project organization",
        );
      }
    }

    const initialStatus: PresentationReferenceAccessStatus =
      input.type === "text" || input.extractedContent
        ? "manual_text_provided"
        : "pending";

    const createInput: CreatePresentationReferenceInput = {
      projectId,
      type: input.type,
      title: input.title,
      sourceIdentifier: input.sourceIdentifier,
      documentId: input.documentId ? asDocumentId(input.documentId) : null,
      accessStatus: initialStatus,
      bibliographicMetadata: input.bibliographicMetadata ?? {},
      extractedContent: input.extractedContent ?? null,
    };

    return await this.deps.referenceStore.create(createInput);
  }

  /**
   * List all references for a presentation project.
   */
  async listReferences(
    actor: Actor,
    projectId: PresentationProjectId,
  ): Promise<PresentationReferenceRecord[]> {
    await this.assertProjectAccess(actor, projectId, "read");
    return await this.deps.referenceStore.findByProjectId(projectId);
  }

  /**
   * Get single reference detail by ID, strictly scoped to projectId.
   */
  async getReference(
    actor: Actor,
    projectId: PresentationProjectId,
    referenceId: PresentationReferenceId,
  ): Promise<PresentationReferenceRecord> {
    await this.assertProjectAccess(actor, projectId, "read");
    const ref = await this.deps.referenceStore.findById(referenceId, projectId);
    if (!ref) {
      throw new DomainError("not_found", "Presentation reference not found");
    }
    return ref;
  }

  /**
   * Update reference metadata/content.
   * Note: regular user edits cannot modify accessStatus.
   */
  async updateReference(
    actor: Actor,
    projectId: PresentationProjectId,
    referenceId: PresentationReferenceId,
    input: ClientUpdateReferenceInput,
  ): Promise<PresentationReferenceRecord> {
    await this.assertProjectAccess(actor, projectId, "write");

    const existing = await this.deps.referenceStore.findById(
      referenceId,
      projectId,
    );
    if (!existing) {
      throw new DomainError("not_found", "Presentation reference not found");
    }

    const updateInput: UpdatePresentationReferenceInput = {
      title: input.title,
      sourceIdentifier: input.sourceIdentifier,
      bibliographicMetadata: input.bibliographicMetadata,
      extractedContent: input.extractedContent,
      // accessStatus is strictly NOT updated by regular client update
    };

    validatePresentationReferenceInput(updateInput);

    return await this.deps.referenceStore.update(
      referenceId,
      projectId,
      updateInput,
    );
  }

  /**
   * Update processing status (intended for background workers or internal processors).
   */
  async updateProcessingStatus(
    actor: Actor,
    projectId: PresentationProjectId,
    referenceId: PresentationReferenceId,
    status: PresentationReferenceAccessStatus,
    errorSnippet?: string,
  ): Promise<PresentationReferenceRecord> {
    await this.assertProjectAccess(actor, projectId, "write");

    const existing = await this.deps.referenceStore.findById(
      referenceId,
      projectId,
    );
    if (!existing) {
      throw new DomainError("not_found", "Presentation reference not found");
    }

    return await this.deps.referenceStore.updateAccessStatus(
      referenceId,
      projectId,
      status,
      errorSnippet,
    );
  }

  /**
   * Delete reference from project.
   * Guarantees that only the presentation_references row is deleted.
   * Documents and document chunks are NEVER touched or deleted.
   */
  async deleteReference(
    actor: Actor,
    projectId: PresentationProjectId,
    referenceId: PresentationReferenceId,
  ): Promise<void> {
    await this.assertProjectAccess(actor, projectId, "write");

    const existing = await this.deps.referenceStore.findById(
      referenceId,
      projectId,
    );
    if (!existing) {
      throw new DomainError("not_found", "Presentation reference not found");
    }

    await this.deps.referenceStore.delete(referenceId, projectId);
  }
}
