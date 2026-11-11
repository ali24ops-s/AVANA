/**
 * Presentation Slide Layout Service.
 *
 * Implements Phase 2A-2.3d:
 * - Coordinates slide retrieval, total-slide / terminal-slide resolution, component assembly, and persistence.
 * - Idempotence guarantee: identical effective assembly preserves previous `assembledAt` timestamp.
 * - Optimistic concurrency control via `expectedUpdatedAt`.
 * - Controlled metadata merge: preserves `generatedSlide`, `referenceContextSnapshot`, and other metadata keys.
 */

import {
  type Actor,
  type GeneratedPresentationSlide,
  type PresentationProjectId,
  type PresentationProjectRecord,
  type PresentationSlideId,
  type PresentationSlideRecord,
  type SlideLayoutAssembly,
  DomainError,
  PRESENTATION_LAYOUT_METADATA_KEY,
} from "@avana/domain";
import type {
  PresentationProjectStore,
  PresentationSlideStore,
} from "./presentation-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import { PresentationComponentAssembler } from "./presentation-component-assembler.js";

export interface PresentationLayoutServiceDeps {
  projectStore: PresentationProjectStore;
  slideStore: PresentationSlideStore;
  organizationStore: OrganizationStore;
}

export interface AssembleLayoutResult {
  assembly: SlideLayoutAssembly;
  persisted: boolean;
  slide: PresentationSlideRecord;
}

export class PresentationLayoutService {
  constructor(private readonly deps: PresentationLayoutServiceDeps) {}

  /**
   * Authorize actor against presentation project.
   */
  private async assertProjectAccess(
    actor: Actor,
    projectId: PresentationProjectId,
    mode: "read" | "write" = "write",
  ): Promise<PresentationProjectRecord> {
    const project = await this.deps.projectStore.findById(projectId);
    if (!project || project.deletedAt) {
      throw new DomainError("not_found", "Presentation project not found");
    }

    if (
      actor.globalRole === "platform_admin" ||
      actor.role === "platform_admin"
    ) {
      return project;
    }

    const memberships =
      await this.deps.organizationStore.listMembershipsByUserId(actor.userId);
    const orgMembership = memberships?.find(
      (m) => m.organizationId === project.organizationId,
    );

    if (!orgMembership) {
      throw new DomainError("not_found", "Presentation project not found");
    }

    if (
      orgMembership.role === "organization_admin" ||
      actor.role === "organization_admin"
    ) {
      return project;
    }

    if (project.ownerUserId === actor.userId) {
      return project;
    }

    if (mode === "read" && orgMembership.role === "course_editor") {
      return project;
    }

    throw new DomainError(
      "forbidden",
      "Role does not permit modifying this presentation project",
    );
  }

  /**
   * Synthesizes and persists the presentation layout for an accepted slide.
   */
  async assembleAndPersistLayout(params: {
    actor: Actor;
    projectId: PresentationProjectId;
    slideId: PresentationSlideId;
  }): Promise<AssembleLayoutResult> {
    const { actor, projectId, slideId } = params;

    // 1. Authorize actor
    const project = await this.assertProjectAccess(actor, projectId, "write");

    // 2. Fetch slide and check concurrency baseline
    const slide = await this.deps.slideStore.findById(slideId, projectId);
    if (!slide) {
      throw new DomainError("not_found", "Presentation slide not found");
    }

    // 3. Ensure slide has accepted generated content
    const metadata = slide.extractionMetadata ?? {};
    const generatedSlide = metadata.generatedSlide as
      | GeneratedPresentationSlide
      | undefined;

    if (!generatedSlide) {
      throw new DomainError(
        "bad_request",
        "Cannot assemble presentation layout: slide does not contain accepted generated content.",
      );
    }

    // 4. Retrieve reference context snapshot
    const snapshot = await this.deps.slideStore.getReferenceSnapshot(
      slideId,
      projectId,
    );
    if (!snapshot) {
      throw new DomainError(
        "bad_request",
        "Cannot assemble presentation layout: reference context snapshot is missing.",
      );
    }

    // 5. Authoritatively resolve total slides and terminal slide bounds
    const projectSlides = await this.deps.slideStore.findByProjectId(projectId);
    const maxSlideIndex =
      projectSlides.length > 0
        ? Math.max(...projectSlides.map((s) => s.slideIndex))
        : slide.slideIndex;

    const totalSlides =
      project.totalSlides > 0 ? project.totalSlides : projectSlides.length;
    const isTerminalSlide =
      projectSlides.length > 1 && slide.slideIndex === maxSlideIndex;

    // 6. Check existing assembly for precise idempotence
    const existingAssembly = metadata[
      PRESENTATION_LAYOUT_METADATA_KEY
    ] as SlideLayoutAssembly | undefined;

    // Assemble candidate using previous timestamp for identical payload comparison
    const candidateWithPrevTimestamp = PresentationComponentAssembler.assemble({
      slideId,
      projectId,
      slideIndex: slide.slideIndex,
      totalSlides,
      slide: generatedSlide,
      snapshot,
      isTerminalSlide,
      overrideAssembledAt: existingAssembly?.metadata?.assembledAt,
    });

    if (
      existingAssembly &&
      existingAssembly.metadata.assemblerVersion ===
        candidateWithPrevTimestamp.metadata.assemblerVersion &&
      JSON.stringify(existingAssembly) ===
        JSON.stringify(candidateWithPrevTimestamp)
    ) {
      // Content and layout are identical: preserve existing assembly and skip unnecessary DB write
      return {
        assembly: existingAssembly,
        persisted: false,
        slide,
      };
    }

    // 7. Assemble fresh layout with current timestamp
    const freshAssembly = PresentationComponentAssembler.assemble({
      slideId,
      projectId,
      slideIndex: slide.slideIndex,
      totalSlides,
      slide: generatedSlide,
      snapshot,
      isTerminalSlide,
      overrideAssembledAt: new Date().toISOString(),
    });

    // 8. Persist layoutAssembly via controlled extractionMetadata merge and OCC
    const updatedSlide = await this.deps.slideStore.updateSlide(
      slideId,
      projectId,
      {
        extractionMetadata: {
          [PRESENTATION_LAYOUT_METADATA_KEY]: freshAssembly,
        },
        expectedUpdatedAt: slide.updatedAt,
      },
    );

    return {
      assembly: freshAssembly,
      persisted: true,
      slide: updatedSlide,
    };
  }
}
