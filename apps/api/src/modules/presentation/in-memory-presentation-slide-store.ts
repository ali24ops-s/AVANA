import { randomUUID } from "node:crypto";
import {
  type PresentationProjectId,
  type PresentationSlideId,
  type PresentationSlideRecord,
  type CreatePresentationSlideInput,
  type UpdatePresentationSlideInput,
  type SlideReferenceContextSnapshot,
  DomainError,
  REFERENCE_CONTEXT_SNAPSHOT_KEY,
  validatePresentationSlideInput,
} from "@avana/domain";
import type { PresentationSlideStore } from "./presentation-store.js";

function cloneRecord<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class InMemoryPresentationSlideStore implements PresentationSlideStore {
  private readonly slides = new Map<string, PresentationSlideRecord>();
  private readonly projectLocks = new Map<string, Promise<void>>();

  private async acquireProjectLock(projectId: string): Promise<() => void> {
    const previousLock = this.projectLocks.get(projectId) ?? Promise.resolve();
    let releaseLock: () => void = () => {};
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.projectLocks.set(projectId, currentLock);
    await previousLock;
    return releaseLock;
  }

  async createSlide(
    input: CreatePresentationSlideInput,
  ): Promise<PresentationSlideRecord> {
    validatePresentationSlideInput(input);

    const release = await this.acquireProjectLock(input.projectId);
    try {
      // Check unique constraint on (projectId, slideIndex)
      for (const slide of this.slides.values()) {
        if (
          slide.projectId === input.projectId &&
          slide.slideIndex === input.slideIndex
        ) {
          throw new DomainError(
            "conflict",
            `Slide index ${input.slideIndex} already exists in this presentation project`,
          );
        }
      }

      const now = new Date().toISOString();
      const id = randomUUID() as PresentationSlideId;

      const record: PresentationSlideRecord = {
        id,
        projectId: input.projectId,
        slideIndex: input.slideIndex,
        title: input.title ? input.title.trim() : null,
        rawText: input.rawText ?? "",
        extractedTables: input.extractedTables ? cloneRecord(input.extractedTables) : [],
        speakerNotes: input.speakerNotes ?? null,
        hasVisuals: input.hasVisuals ?? false,
        visualSummary: input.visualSummary ?? null,
        mediaStorageKeys: input.mediaStorageKeys ? [...input.mediaStorageKeys] : [],
        extractionMetadata: input.extractionMetadata
          ? cloneRecord(input.extractionMetadata)
          : {},
        createdAt: now,
        updatedAt: now,
      };

      this.slides.set(id, record);
      return cloneRecord(record);
    } finally {
      release();
    }
  }

  async findById(
    id: PresentationSlideId,
    projectId: PresentationProjectId,
  ): Promise<PresentationSlideRecord | null> {
    const slide = this.slides.get(id);
    if (!slide || slide.projectId !== projectId) {
      return null;
    }
    return cloneRecord(slide);
  }

  async findBySlideIndex(
    projectId: PresentationProjectId,
    slideIndex: number,
  ): Promise<PresentationSlideRecord | null> {
    for (const slide of this.slides.values()) {
      if (slide.projectId === projectId && slide.slideIndex === slideIndex) {
        return cloneRecord(slide);
      }
    }
    return null;
  }

  async findByProjectId(
    projectId: PresentationProjectId,
  ): Promise<PresentationSlideRecord[]> {
    const result: PresentationSlideRecord[] = [];
    for (const slide of this.slides.values()) {
      if (slide.projectId === projectId) {
        result.push(cloneRecord(slide));
      }
    }
    return result.sort((a, b) => a.slideIndex - b.slideIndex);
  }

  async updateSlide(
    id: PresentationSlideId,
    projectId: PresentationProjectId,
    input: UpdatePresentationSlideInput,
  ): Promise<PresentationSlideRecord> {
    const release = await this.acquireProjectLock(projectId);
    try {
      const existing = this.slides.get(id);
      if (!existing || existing.projectId !== projectId) {
        throw new DomainError("not_found", "Presentation slide not found");
      }

      if (
        input.expectedUpdatedAt !== undefined &&
        existing.updatedAt !== input.expectedUpdatedAt
      ) {
        throw new DomainError(
          "conflict",
          "Presentation slide was modified concurrently",
        );
      }

      let now = new Date().toISOString();
      if (now === existing.updatedAt) {
        now = new Date(Date.parse(existing.updatedAt) + 1).toISOString();
      }

      if (input.title !== undefined) existing.title = input.title ? input.title.trim() : null;
      if (input.rawText !== undefined) existing.rawText = input.rawText;
      if (input.extractedTables !== undefined)
        existing.extractedTables = cloneRecord(input.extractedTables);
      if (input.speakerNotes !== undefined) existing.speakerNotes = input.speakerNotes;
      if (input.hasVisuals !== undefined) existing.hasVisuals = input.hasVisuals;
      if (input.visualSummary !== undefined) existing.visualSummary = input.visualSummary;
      if (input.mediaStorageKeys !== undefined)
        existing.mediaStorageKeys = [...input.mediaStorageKeys];
      if (input.extractionMetadata !== undefined) {
        // Controlled merge so existing metadata (e.g. reference snapshot) is preserved
        existing.extractionMetadata = {
          ...(existing.extractionMetadata ?? {}),
          ...cloneRecord(input.extractionMetadata),
        };
      }
      existing.updatedAt = now;

      return cloneRecord(existing);
    } finally {
      release();
    }
  }

  async saveReferenceSnapshot(
    slideId: PresentationSlideId,
    projectId: PresentationProjectId,
    snapshot: SlideReferenceContextSnapshot,
  ): Promise<PresentationSlideRecord> {
    const release = await this.acquireProjectLock(projectId);
    try {
      const existing = this.slides.get(slideId);
      if (!existing || existing.projectId !== projectId) {
        throw new DomainError("not_found", "Presentation slide not found");
      }

      if (snapshot.projectId !== projectId) {
        throw new DomainError(
          "bad_request",
          "Snapshot project ID does not match slide project ID",
        );
      }
      if (snapshot.slideIndex !== existing.slideIndex) {
        throw new DomainError(
          "bad_request",
          "Snapshot slide index does not match target slide index",
        );
      }

      const now = new Date().toISOString();

      // Controlled merge of extractionMetadata: preserves all existing keys while saving snapshot
      existing.extractionMetadata = {
        ...(existing.extractionMetadata ?? {}),
        [REFERENCE_CONTEXT_SNAPSHOT_KEY]: cloneRecord(snapshot),
      };
      existing.updatedAt = now;

      return cloneRecord(existing);
    } finally {
      release();
    }
  }

  async getReferenceSnapshot(
    slideId: PresentationSlideId,
    projectId: PresentationProjectId,
  ): Promise<SlideReferenceContextSnapshot | null> {
    const slide = this.slides.get(slideId);
    if (!slide || slide.projectId !== projectId) {
      return null;
    }

    const metadata = slide.extractionMetadata;
    if (!metadata || typeof metadata !== "object") {
      return null;
    }

    const snapshot = metadata[
      REFERENCE_CONTEXT_SNAPSHOT_KEY
    ] as SlideReferenceContextSnapshot | undefined;

    if (!snapshot || typeof snapshot !== "object") {
      return null;
    }

    return cloneRecord(snapshot);
  }

  async deleteSlide(
    id: PresentationSlideId,
    projectId: PresentationProjectId,
  ): Promise<boolean> {
    const release = await this.acquireProjectLock(projectId);
    try {
      const existing = this.slides.get(id);
      if (!existing || existing.projectId !== projectId) {
        return false;
      }
      return this.slides.delete(id);
    } finally {
      release();
    }
  }

  async countByProjectId(projectId: PresentationProjectId): Promise<number> {
    let count = 0;
    for (const slide of this.slides.values()) {
      if (slide.projectId === projectId) {
        count++;
      }
    }
    return count;
  }
}
