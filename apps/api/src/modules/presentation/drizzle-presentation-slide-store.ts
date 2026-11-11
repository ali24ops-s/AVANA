import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  type PresentationProjectId,
  type PresentationSlideId,
  type PresentationSlideRecord,
  type CreatePresentationSlideInput,
  type UpdatePresentationSlideInput,
  type SlideReferenceContextSnapshot,
  type UUID,
  asPresentationProjectId,
  asPresentationSlideId,
  DomainError,
  REFERENCE_CONTEXT_SNAPSHOT_KEY,
  validatePresentationSlideInput,
} from "@avana/domain";
import {
  presentationSlides,
  type PresentationSlide,
} from "@avana/database/schema";
import type { PresentationSlideStore } from "./presentation-store.js";

function safeDateToIsoString(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new DomainError(
        "bad_request",
        "Invalid date value encountered in slide store",
      );
    }
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new DomainError(
        "bad_request",
        "Invalid date string encountered in slide store",
      );
    }
    return parsed.toISOString();
  }
  throw new DomainError(
    "bad_request",
    "Expected valid Date or ISO string in slide store",
  );
}

function mapSlideRowToRecord(row: PresentationSlide): PresentationSlideRecord {
  return {
    id: asPresentationSlideId(row.id as UUID),
    projectId: asPresentationProjectId(row.projectId as UUID),
    slideIndex: row.slideIndex,
    title: row.title ?? null,
    rawText: row.rawText,
    extractedTables: (row.extractedTables ?? []) as Array<{
      headers?: string[];
      rows: string[][];
    }>,
    speakerNotes: row.speakerNotes ?? null,
    hasVisuals: row.hasVisuals,
    visualSummary: row.visualSummary ?? null,
    mediaStorageKeys: (row.mediaStorageKeys ?? []) as string[],
    extractionMetadata: (row.extractionMetadata ?? {}) as Record<string, unknown>,
    createdAt: safeDateToIsoString(row.createdAt),
    updatedAt: safeDateToIsoString(row.updatedAt),
  };
}

export class DrizzlePresentationSlideStore implements PresentationSlideStore {
  constructor(private readonly db: NodePgDatabase) {}

  async createSlide(
    input: CreatePresentationSlideInput,
  ): Promise<PresentationSlideRecord> {
    validatePresentationSlideInput(input);

    try {
      const [createdRow] = await this.db
        .insert(presentationSlides)
        .values({
          projectId: input.projectId,
          slideIndex: input.slideIndex,
          title: input.title ?? null,
          rawText: input.rawText ?? "",
          extractedTables: input.extractedTables ?? [],
          speakerNotes: input.speakerNotes ?? null,
          hasVisuals: input.hasVisuals ?? false,
          visualSummary: input.visualSummary ?? null,
          mediaStorageKeys: input.mediaStorageKeys ?? [],
          extractionMetadata: input.extractionMetadata ?? {},
        })
        .returning();

      return mapSlideRowToRecord(createdRow);
    } catch (err: unknown) {
      if (err instanceof DomainError) throw err;
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "23505"
      ) {
        throw new DomainError(
          "conflict",
          `Slide index ${input.slideIndex} already exists in this presentation project`,
        );
      }
      throw err;
    }
  }

  async findById(
    id: PresentationSlideId,
    projectId: PresentationProjectId,
  ): Promise<PresentationSlideRecord | null> {
    const [row] = await this.db
      .select()
      .from(presentationSlides)
      .where(
        and(
          eq(presentationSlides.id, id),
          eq(presentationSlides.projectId, projectId),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return mapSlideRowToRecord(row);
  }

  async findBySlideIndex(
    projectId: PresentationProjectId,
    slideIndex: number,
  ): Promise<PresentationSlideRecord | null> {
    const [row] = await this.db
      .select()
      .from(presentationSlides)
      .where(
        and(
          eq(presentationSlides.projectId, projectId),
          eq(presentationSlides.slideIndex, slideIndex),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return mapSlideRowToRecord(row);
  }

  async findByProjectId(
    projectId: PresentationProjectId,
  ): Promise<PresentationSlideRecord[]> {
    const rows = await this.db
      .select()
      .from(presentationSlides)
      .where(eq(presentationSlides.projectId, projectId))
      .orderBy(asc(presentationSlides.slideIndex));

    return rows.map(mapSlideRowToRecord);
  }

  async updateSlide(
    id: PresentationSlideId,
    projectId: PresentationProjectId,
    input: UpdatePresentationSlideInput,
  ): Promise<PresentationSlideRecord> {
    const existing = await this.findById(id, projectId);
    if (!existing) {
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

    const setPayload: Partial<typeof presentationSlides.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) setPayload.title = input.title;
    if (input.rawText !== undefined) setPayload.rawText = input.rawText;
    if (input.extractedTables !== undefined)
      setPayload.extractedTables = input.extractedTables;
    if (input.speakerNotes !== undefined)
      setPayload.speakerNotes = input.speakerNotes;
    if (input.hasVisuals !== undefined) setPayload.hasVisuals = input.hasVisuals;
    if (input.visualSummary !== undefined)
      setPayload.visualSummary = input.visualSummary;
    if (input.mediaStorageKeys !== undefined)
      setPayload.mediaStorageKeys = input.mediaStorageKeys;
    if (input.extractionMetadata !== undefined) {
      // Controlled merge so existing metadata (e.g. reference snapshot) is preserved
      setPayload.extractionMetadata = {
        ...(existing.extractionMetadata ?? {}),
        ...input.extractionMetadata,
      };
    }

    const whereConditions = [
      eq(presentationSlides.id, id),
      eq(presentationSlides.projectId, projectId),
    ];

    if (input.expectedUpdatedAt) {
      whereConditions.push(
        eq(presentationSlides.updatedAt, new Date(input.expectedUpdatedAt)),
      );
    }

    const [updatedRow] = await this.db
      .update(presentationSlides)
      .set(setPayload)
      .where(and(...whereConditions))
      .returning();

    if (!updatedRow) {
      if (input.expectedUpdatedAt) {
        throw new DomainError(
          "conflict",
          "Presentation slide was modified concurrently",
        );
      }
      throw new DomainError("not_found", "Presentation slide not found");
    }

    return mapSlideRowToRecord(updatedRow);
  }

  async saveReferenceSnapshot(
    slideId: PresentationSlideId,
    projectId: PresentationProjectId,
    snapshot: SlideReferenceContextSnapshot,
  ): Promise<PresentationSlideRecord> {
    const existing = await this.findById(slideId, projectId);
    if (!existing) {
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

    // Controlled merge of extractionMetadata: preserves all existing keys while setting snapshot
    const mergedMetadata: Record<string, unknown> = {
      ...(existing.extractionMetadata ?? {}),
      [REFERENCE_CONTEXT_SNAPSHOT_KEY]: snapshot,
    };

    const [updatedRow] = await this.db
      .update(presentationSlides)
      .set({
        extractionMetadata: mergedMetadata,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(presentationSlides.id, slideId),
          eq(presentationSlides.projectId, projectId),
        ),
      )
      .returning();

    if (!updatedRow) {
      throw new DomainError("not_found", "Failed to update slide snapshot");
    }

    return mapSlideRowToRecord(updatedRow);
  }

  async getReferenceSnapshot(
    slideId: PresentationSlideId,
    projectId: PresentationProjectId,
  ): Promise<SlideReferenceContextSnapshot | null> {
    const slide = await this.findById(slideId, projectId);
    if (!slide) {
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

    return snapshot;
  }

  async deleteSlide(
    id: PresentationSlideId,
    projectId: PresentationProjectId,
  ): Promise<boolean> {
    const [deletedRow] = await this.db
      .delete(presentationSlides)
      .where(
        and(
          eq(presentationSlides.id, id),
          eq(presentationSlides.projectId, projectId),
        ),
      )
      .returning({ id: presentationSlides.id });

    return Boolean(deletedRow);
  }

  async countByProjectId(projectId: PresentationProjectId): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(presentationSlides)
      .where(eq(presentationSlides.projectId, projectId));

    return result?.count ?? 0;
  }
}
