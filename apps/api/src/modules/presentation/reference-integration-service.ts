/**
 * Presentation Reference Integration Service.
 *
 * Implements Phase 2A-2.2:
 * - Bridges Presentation Reference Data Layer (Phase 2A-1) with Deterministic Semantic Chunker (Phase 2A-2.1).
 * - Implements Zero-Duplication Invariant: reads existing document_chunks without re-extracting or re-chunking.
 * - Deterministically chunks external/direct references (PubMed, DOI, text, URL) on demand.
 * - Produces authoritative source identity, provenance tracking, and verifiable citation labels.
 * - Strict Anti-Hallucination: unpaged sources retain null page ranges with confidence "unknown".
 * - Provides citation grounding verification for downstream AI modules (Presentation Assistant, Mind Maps, Quizzes, Flashcards).
 */

import {
  type Actor,
  type CitationGroundingVerificationResult,
  type IntegratedReferenceChunk,
  type PresentationProjectId,
  type PresentationProjectRecord,
  type ProjectReferenceResolutionSummary,
  type ReferenceSourceIdentity,
  type SemanticChunkerOptions,
  type SemanticReferenceChunk,
  computeIntegratedChunkId,
  DomainError,
  formatCitationLabel,
} from "@avana/domain";
import type {
  PresentationProjectStore,
  PresentationReferenceStore,
} from "./presentation-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type {
  DocumentChunkStore,
  DocumentStore,
} from "../learning/learning-store.js";
import { SemanticChunker } from "./semantic-chunker.js";

export interface PresentationReferenceIntegrationServiceDeps {
  referenceStore: PresentationReferenceStore;
  projectStore: PresentationProjectStore;
  organizationStore: OrganizationStore;
  chunkStore: DocumentChunkStore;
  documentStore?: DocumentStore;
}

export class PresentationReferenceIntegrationService {
  constructor(
    private readonly deps: PresentationReferenceIntegrationServiceDeps,
  ) {}

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
   * Resolve all integrated reference chunks for a presentation project.
   *
   * For document-backed references (documentId != null):
   * - Retrieves canonical chunks directly from DocumentChunkStore.
   * - Guarantees ZERO re-extraction or re-chunking.
   * - Sets provenance to "stored_document_chunk" and confidence to "exact".
   *
   * For direct/external references (text, pubmed, doi, url):
   * - Deterministically chunks content on-the-fly using SemanticChunker.split().
   * - Strict Anti-Hallucination: startPage/endPage are null, confidence is "unknown".
   * - Sets provenance to "derived_semantic_chunk".
   */
  async resolveProjectChunks(
    actor: Actor,
    projectId: PresentationProjectId,
    options?: SemanticChunkerOptions,
  ): Promise<IntegratedReferenceChunk[]> {
    const project = await this.assertProjectAccess(actor, projectId, "read");

    const references = await this.deps.referenceStore.findByProjectId(projectId);

    // Filter out references where fetching failed
    const activeReferences = references.filter(
      (r) => r.accessStatus !== "failed_to_fetch",
    );

    const integratedChunks: IntegratedReferenceChunk[] = [];

    for (let i = 0; i < activeReferences.length; i++) {
      const ref = activeReferences[i];
      const citationIndex = i + 1;
      const citationLabel = formatCitationLabel(ref, citationIndex);

      const sourceIdentity: ReferenceSourceIdentity = {
        referenceId: ref.id,
        documentId: ref.documentId,
        sourceType: ref.type,
        title: ref.title,
        sourceIdentifier: ref.sourceIdentifier,
        citationLabel,
        bibliographicMetadata: ref.bibliographicMetadata ?? {},
      };

      if (ref.documentId) {
        // ISS-03: Multi-tenancy & validity check on documentStore if provided
        if (this.deps.documentStore) {
          const doc = await this.deps.documentStore.findByIdForOrganization(
            ref.documentId,
            project.organizationId,
          );
          if (!doc || doc.deletedAt) {
            continue;
          }
        }

        // Path A: Document-backed reference -> Query canonical document_chunks
        const docChunks = await this.deps.chunkStore.listByDocument(ref.documentId);
        const sortedChunks = [...docChunks].sort((a, b) => a.sequence - b.sequence);

        // ISS-02: Physical PDF layout yields "exact", DOCX/Text yields "approximate"
        const locationConfidence = ref.type === "pdf" ? "exact" : "approximate";

        for (const docChunk of sortedChunks) {
          // ISS-03: Defense-in-depth: exclude any chunk belonging to another organization
          if (docChunk.organizationId !== project.organizationId) {
            continue;
          }

          const semanticChunk: SemanticReferenceChunk = {
            sequence: docChunk.sequence,
            content: docChunk.content,
            headingPath: docChunk.heading ? [docChunk.heading] : [],
            contentType: "paragraph",
            startPage: docChunk.startPage,
            endPage: docChunk.endPage,
            tokenEstimate: docChunk.tokenEstimate,
            contentHash: docChunk.contentHash,
            sourceChunkId: docChunk.id,
            sourceOffset: null,
          };

          const chunkId = computeIntegratedChunkId(
            ref.id,
            docChunk.sequence,
            docChunk.contentHash,
          );

          integratedChunks.push({
            id: chunkId,
            source: sourceIdentity,
            chunk: semanticChunk,
            location: {
              startPage: docChunk.startPage,
              endPage: docChunk.endPage,
              slideIndex: null,
              sourceOffset: null,
              confidence: locationConfidence,
            },
            provenance: "stored_document_chunk",
          });
        }
      } else {
        // Path B: External/direct reference -> Deterministic chunking on demand
        const content =
          ref.extractedContent ??
          (typeof ref.bibliographicMetadata?.abstract === "string"
            ? ref.bibliographicMetadata.abstract
            : "");

        const trimmedContent = content.trim();
        if (!trimmedContent) {
          continue;
        }

        const semanticChunks = SemanticChunker.split(trimmedContent, {
          ...options,
          startPage: null,
          endPage: null,
        });

        for (const sc of semanticChunks) {
          const chunkId = computeIntegratedChunkId(
            ref.id,
            sc.sequence,
            sc.contentHash,
          );

          integratedChunks.push({
            id: chunkId,
            source: sourceIdentity,
            chunk: sc,
            location: {
              startPage: null,
              endPage: null,
              slideIndex: null,
              sourceOffset: sc.sourceOffset ?? null,
              confidence: "unknown",
            },
            provenance: "derived_semantic_chunk",
          });
        }
      }
    }

    return integratedChunks;
  }

  /**
   * Verify that candidate citation chunk IDs are strictly grounded in this project's references.
   *
   * NOTE (Structural Identity Validation Only):
   * This method performs structural citation validation to verify chunk existence, valid hash,
   * and project ownership. It does NOT perform semantic entailment or Natural Language Inference (NLI)
   * of slide content claims against source text.
   *
   * Hardened Security Guarantees (ISS-01):
   * 1. Project access authorization is enforced unconditionally in ALL paths (even when preloadedChunks is supplied).
   * 2. Preloaded chunks are strictly validated against this project's active references to prevent foreign injection.
   */
  async verifyCitationGrounding(
    actor: Actor,
    projectId: PresentationProjectId,
    candidateChunkIds: string[],
    preloadedChunks?: IntegratedReferenceChunk[],
  ): Promise<CitationGroundingVerificationResult> {
    // 1. Mandatory access control in all execution paths
    await this.assertProjectAccess(actor, projectId, "read");

    let chunks: IntegratedReferenceChunk[];
    if (preloadedChunks) {
      // 2. Validate preloaded chunks against this project's active references to prevent foreign injection
      const references = await this.deps.referenceStore.findByProjectId(projectId);
      const projectRefIds = new Set(
        references
          .filter((r) => r.accessStatus !== "failed_to_fetch")
          .map((r) => r.id),
      );
      chunks = preloadedChunks.filter((c) =>
        projectRefIds.has(c.source.referenceId),
      );
    } else {
      chunks = await this.resolveProjectChunks(actor, projectId);
    }

    const chunksById = new Map<string, IntegratedReferenceChunk>();
    for (const chunk of chunks) {
      chunksById.set(chunk.id, chunk);
    }

    const validChunkIds: string[] = [];
    const invalidChunkIds: string[] = [];
    const groundedReferencesMap = new Map<string, ReferenceSourceIdentity>();

    for (const candidateId of candidateChunkIds) {
      const match = chunksById.get(candidateId);
      if (match) {
        validChunkIds.push(candidateId);
        groundedReferencesMap.set(match.source.referenceId, match.source);
      } else {
        invalidChunkIds.push(candidateId);
      }
    }

    return {
      valid: invalidChunkIds.length === 0,
      validChunkIds,
      invalidChunkIds,
      groundedReferences: Array.from(groundedReferencesMap.values()),
    };
  }

  /**
   * Compute high-level statistics and summaries of resolved references for prompt budgeting.
   */
  async getProjectReferenceSummary(
    actor: Actor,
    projectId: PresentationProjectId,
  ): Promise<ProjectReferenceResolutionSummary> {
    const chunks = await this.resolveProjectChunks(actor, projectId);

    const refIds = new Set<string>();
    let storedDocumentChunks = 0;
    let derivedSemanticChunks = 0;
    let totalTokenEstimate = 0;

    for (const c of chunks) {
      refIds.add(c.source.referenceId);
      if (c.provenance === "stored_document_chunk") {
        storedDocumentChunks++;
      } else {
        derivedSemanticChunks++;
      }
      totalTokenEstimate += c.chunk.tokenEstimate;
    }

    return {
      projectId,
      totalReferences: refIds.size,
      totalChunks: chunks.length,
      storedDocumentChunks,
      derivedSemanticChunks,
      totalTokenEstimate,
    };
  }
}
