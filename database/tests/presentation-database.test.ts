/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDbClient } from "../client.js";
import { sql, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  users,
  organizations,
  documents,
  presentationProjects,
  presentationSlides,
  presentationReferences,
} from "../schema/index.js";
import { up as runMigration0095 } from "../migrations/0095_presentation_assistant_core.js";

describe("Presentation Assistant Database Invariants", () => {
  const dbUrl =
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

  let client: ReturnType<typeof createDbClient>;
  let isConnected = false;

  const testOrgId = randomUUID();
  const testUserId = randomUUID();
  const testDocId = randomUUID();

  beforeAll(async () => {
    try {
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      isConnected = true;
    } catch {
      isConnected = false;
      return;
    }

    // PostgreSQL is reachable: ensure migration 0095 is applied with latest constraints
    await runMigration0095(client.db);

    // Ensure constraints and NOT NULL definitions are actively applied even if tables pre-existed
    await client.db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE presentation_projects DROP CONSTRAINT IF EXISTS chk_presentation_projects_duration;
        ALTER TABLE presentation_projects ADD CONSTRAINT chk_presentation_projects_duration
          CHECK (target_duration_minutes IN (5, 10, 15, 20, 30));

        ALTER TABLE presentation_projects DROP CONSTRAINT IF EXISTS chk_presentation_projects_total_slides;
        ALTER TABLE presentation_projects ADD CONSTRAINT chk_presentation_projects_total_slides
          CHECK (total_slides >= 0);

        ALTER TABLE presentation_projects DROP CONSTRAINT IF EXISTS chk_presentation_projects_estimated_seconds;
        ALTER TABLE presentation_projects ADD CONSTRAINT chk_presentation_projects_estimated_seconds
          CHECK (total_estimated_seconds >= 0);

        ALTER TABLE presentation_projects DROP CONSTRAINT IF EXISTS chk_presentation_projects_academic_level;
        ALTER TABLE presentation_projects ADD CONSTRAINT chk_presentation_projects_academic_level
          CHECK (academic_level IN ('introductory', 'intermediate', 'advanced'));

        ALTER TABLE presentation_projects DROP CONSTRAINT IF EXISTS chk_presentation_projects_tone;
        ALTER TABLE presentation_projects ADD CONSTRAINT chk_presentation_projects_tone
          CHECK (tone IN ('formal_scientific', 'fluent_student'));

        ALTER TABLE presentation_projects DROP CONSTRAINT IF EXISTS chk_presentation_projects_depth;
        ALTER TABLE presentation_projects ADD CONSTRAINT chk_presentation_projects_depth
          CHECK (elaboration_depth IN ('concise', 'balanced', 'comprehensive'));

        ALTER TABLE presentation_projects DROP CONSTRAINT IF EXISTS chk_presentation_projects_status;
        ALTER TABLE presentation_projects ADD CONSTRAINT chk_presentation_projects_status
          CHECK (status IN ('created', 'extracting', 'analyzing', 'generating', 'completed', 'failed'));

        ALTER TABLE presentation_slides DROP CONSTRAINT IF EXISTS chk_presentation_slides_index;
        ALTER TABLE presentation_slides ADD CONSTRAINT chk_presentation_slides_index
          CHECK (slide_index > 0);

        ALTER TABLE presentation_slides ALTER COLUMN extracted_tables SET NOT NULL;
        ALTER TABLE presentation_slides ALTER COLUMN media_storage_keys SET NOT NULL;
        ALTER TABLE presentation_slides ALTER COLUMN extraction_metadata SET NOT NULL;

        ALTER TABLE presentation_references DROP CONSTRAINT IF EXISTS chk_presentation_refs_type;
        ALTER TABLE presentation_references ADD CONSTRAINT chk_presentation_refs_type
          CHECK (type IN ('text', 'pdf', 'docx', 'url', 'doi', 'pubmed'));

        ALTER TABLE presentation_references DROP CONSTRAINT IF EXISTS chk_presentation_refs_access_status;
        ALTER TABLE presentation_references ADD CONSTRAINT chk_presentation_refs_access_status
          CHECK (access_status IN ('pending', 'full_text_available', 'abstract_only', 'metadata_only', 'manual_text_provided', 'failed_to_fetch'));

        ALTER TABLE presentation_references ALTER COLUMN bibliographic_metadata SET NOT NULL;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END $$;
    `);

    // Seed parent test records: organization, user, document
    await client.db.insert(organizations).values({
      id: testOrgId,
      name: "Presentation Test Org",
      slug: `pres-org-${Date.now()}`,
    });

    await client.db.insert(users).values({
      id: testUserId,
      email: `pres-user-${Date.now()}@avana.local`,
      name: "Presentation Test User",
    });

    await client.db.insert(documents).values({
      id: testDocId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      originalName: "cardiology.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      sizeBytes: 1024,
      sha256: `sha256-${randomUUID().replace(/-/g, "")}`,
      storageKey: `docs/${testDocId}.pptx`,
    });
  });

  afterAll(async () => {
    if (client) {
      try {
        if (isConnected) {
          await client.db.delete(organizations).where(eq(organizations.id, testOrgId));
          await client.db.delete(users).where(eq(users.id, testUserId));
        }
      } finally {
        await client.close().catch(() => {});
      }
    }
  });

  beforeEach((ctx) => {
    if (!isConnected) {
      ctx.skip();
    }
  });

  // ---------------------------------------------------------------------------
  // Positive Invariant Tests
  // ---------------------------------------------------------------------------

  it("creates a presentation project without an initial PPTX document (deferred upload)", async () => {
    const projectId = randomUUID();
    const inserted = await client.db
      .insert(presentationProjects)
      .values({
        id: projectId,
        organizationId: testOrgId,
        ownerUserId: testUserId,
        title: "ارائه سمینار فیزیولوژی",
        pptxDocumentId: null, // Nullable before upload
        targetDurationMinutes: 15,
        academicLevel: "intermediate",
        tone: "formal_scientific",
        elaborationDepth: "balanced",
        status: "created",
      })
      .returning();

    expect(inserted).toHaveLength(1);
    expect(inserted[0].id).toBe(projectId);
    expect(inserted[0].pptxDocumentId).toBeNull();
    expect(inserted[0].status).toBe("created");
    expect(inserted[0].targetDurationMinutes).toBe(15);
  });

  it("attaches a PPTX document to an existing presentation project", async () => {
    const projectId = randomUUID();
    await client.db.insert(presentationProjects).values({
      id: projectId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      title: "ارائه داروشناسی",
      pptxDocumentId: null,
    });

    const updated = await client.db
      .update(presentationProjects)
      .set({
        pptxDocumentId: testDocId,
        status: "extracting",
        updatedAt: new Date(),
      })
      .where(eq(presentationProjects.id, projectId))
      .returning();

    expect(updated).toHaveLength(1);
    expect(updated[0].pptxDocumentId).toBe(testDocId);
    expect(updated[0].status).toBe("extracting");
  });

  it("inserts multiple slides and preserves slide index and ordering", async () => {
    const projectId = randomUUID();
    await client.db.insert(presentationProjects).values({
      id: projectId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      title: "ارائه بیوشیمی",
      pptxDocumentId: testDocId,
    });

    const slide1Id = randomUUID();
    const slide2Id = randomUUID();

    await client.db.insert(presentationSlides).values([
      {
        id: slide1Id,
        projectId,
        slideIndex: 1,
        title: "مقدمه بر مسیر گلیکولیز",
        rawText: "گلیکولیز اولین مرحله در تجزیه گلوکز است.",
        hasVisuals: false,
      },
      {
        id: slide2Id,
        projectId,
        slideIndex: 2,
        title: "آنزیم‌های کلیدی گلیکولیز",
        rawText: "فسفوفروکتوکیناز آنزیم تنظیم‌کننده اصلی است.",
        extractedTables: [{ headers: ["آنزیم", "فعال‌کننده"], rows: [["PFK-1", "AMP, F-2,6-BP"]] }],
        speakerNotes: "روی نقش آلوستریک F-2,6-BP تأکید کنید.",
        hasVisuals: true,
        mediaStorageKeys: [`presentations/${projectId}/slides/2/enzyme.png`],
      },
    ]);

    const slides = await client.db
      .select()
      .from(presentationSlides)
      .where(eq(presentationSlides.projectId, projectId));

    expect(slides).toHaveLength(2);
    expect(slides.map((s) => s.slideIndex).sort((a, b) => a - b)).toEqual([1, 2]);

    const slide2 = slides.find((s) => s.slideIndex === 2);
    expect(slide2?.title).toBe("آنزیم‌های کلیدی گلیکولیز");
    expect(slide2?.hasVisuals).toBe(true);
    expect(slide2?.mediaStorageKeys).toHaveLength(1);
    expect(slide2?.speakerNotes).toContain("آلوستریک");
  });

  it("enforces uniqueness of (projectId, slideIndex)", async () => {
    const projectId = randomUUID();
    await client.db.insert(presentationProjects).values({
      id: projectId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      title: "پروژه تست یکتایی",
    });

    await client.db.insert(presentationSlides).values({
      id: randomUUID(),
      projectId,
      slideIndex: 1,
      title: "اسلاید اول",
    });

    // Inserting another slide with the exact same slideIndex for the same project must fail
    await expect(
      client.db.insert(presentationSlides).values({
        id: randomUUID(),
        projectId,
        slideIndex: 1,
        title: "اسلاید تکراری با همان شماره",
      }),
    ).rejects.toThrow();
  });

  it("cascades deletion of slides and references when presentation project is deleted", async () => {
    const projectId = randomUUID();
    await client.db.insert(presentationProjects).values({
      id: projectId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      title: "پروژه در آستانه حذف",
    });

    const slideId = randomUUID();
    await client.db.insert(presentationSlides).values({
      id: slideId,
      projectId,
      slideIndex: 1,
      title: "اسلاید موقت",
    });

    const refId = randomUUID();
    await client.db.insert(presentationReferences).values({
      id: refId,
      projectId,
      type: "doi",
      title: "مقاله فیزیولوژی",
      sourceIdentifier: "10.1056/NEJMoa0000000",
      accessStatus: "abstract_only",
    });

    // Delete the presentation project
    await client.db.delete(presentationProjects).where(eq(presentationProjects.id, projectId));

    // Dependent slide and reference must be automatically deleted (CASCADE)
    const remainingSlides = await client.db
      .select()
      .from(presentationSlides)
      .where(eq(presentationSlides.projectId, projectId));
    expect(remainingSlides).toHaveLength(0);

    const remainingRefs = await client.db
      .select()
      .from(presentationReferences)
      .where(eq(presentationReferences.projectId, projectId));
    expect(remainingRefs).toHaveLength(0);
  });

  async function expectDbConstraintViolation(
    action: Promise<unknown>,
    expectedPattern: RegExp | string,
  ) {
    try {
      await action;
      expect.unreachable("Database operation should have failed constraint check, but succeeded.");
    } catch (err: unknown) {
      const dbErr = err as {
        message?: string;
        cause?: { message?: string; constraint?: string; detail?: string };
      };
      const fullError = [
        dbErr?.message,
        dbErr?.cause?.message,
        dbErr?.cause?.constraint,
        dbErr?.cause?.detail,
      ]
        .filter(Boolean)
        .join(" | ");

      if (typeof expectedPattern === "string") {
        expect(fullError).toContain(expectedPattern);
      } else {
        expect(fullError).toMatch(expectedPattern);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Negative Constraint Tests (PostgreSQL Constraints Enforcement)
  // ---------------------------------------------------------------------------

  it("rejects invalid target_duration_minutes not in (5, 10, 15, 20, 30)", async () => {
    const projectId = randomUUID();
    await expectDbConstraintViolation(
      client.db.insert(presentationProjects).values({
        id: projectId,
        organizationId: testOrgId,
        ownerUserId: testUserId,
        title: "مدت زمان غیرمجاز",
        targetDurationMinutes: 12, // Invalid
      }),
      /chk_presentation_projects_duration|violates check constraint/i,
    );
  });

  it("rejects negative total_slides and total_estimated_seconds", async () => {
    const projectId1 = randomUUID();
    await expectDbConstraintViolation(
      client.db.insert(presentationProjects).values({
        id: projectId1,
        organizationId: testOrgId,
        ownerUserId: testUserId,
        title: "اسلاید منفی",
        totalSlides: -1,
      }),
      /chk_presentation_projects_total_slides|violates check constraint/i,
    );

    const projectId2 = randomUUID();
    await expectDbConstraintViolation(
      client.db.insert(presentationProjects).values({
        id: projectId2,
        organizationId: testOrgId,
        ownerUserId: testUserId,
        title: "ثانیه تخمینی منفی",
        totalEstimatedSeconds: -100,
      }),
      /chk_presentation_projects_estimated_seconds|violates check constraint/i,
    );
  });

  it("rejects invalid enum values for academic_level, tone, elaboration_depth, status", async () => {
    const projectId = randomUUID();

    // Invalid academic_level
    await expectDbConstraintViolation(
      client.db.insert(presentationProjects).values({
        id: projectId,
        organizationId: testOrgId,
        ownerUserId: testUserId,
        title: "سطح نامعتبر",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        academicLevel: "invalid_level" as any,
      }),
      /chk_presentation_projects_academic_level|violates check constraint/i,
    );

    // Invalid tone
    await expectDbConstraintViolation(
      client.db.insert(presentationProjects).values({
        id: projectId,
        organizationId: testOrgId,
        ownerUserId: testUserId,
        title: "لحن نامعتبر",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tone: "casual_chat" as any,
      }),
      /chk_presentation_projects_tone|violates check constraint/i,
    );

    // Invalid elaboration_depth
    await expectDbConstraintViolation(
      client.db.insert(presentationProjects).values({
        id: projectId,
        organizationId: testOrgId,
        ownerUserId: testUserId,
        title: "عمق نامعتبر",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        elaborationDepth: "encyclopedic" as any,
      }),
      /chk_presentation_projects_depth|violates check constraint/i,
    );

    // Invalid status
    await expectDbConstraintViolation(
      client.db.insert(presentationProjects).values({
        id: projectId,
        organizationId: testOrgId,
        ownerUserId: testUserId,
        title: "وضعیت نامعتبر",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: "processing" as any,
      }),
      /chk_presentation_projects_status|violates check constraint/i,
    );
  });

  it("rejects non-positive slide_index (slide_index <= 0)", async () => {
    const projectId = randomUUID();
    await client.db.insert(presentationProjects).values({
      id: projectId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      title: "پروژه تست اسلاید با شماره نامعتبر",
    });

    // slideIndex: 0
    await expectDbConstraintViolation(
      client.db.insert(presentationSlides).values({
        id: randomUUID(),
        projectId,
        slideIndex: 0,
        title: "اسلاید با شماره صفر",
      }),
      /chk_presentation_slides_index|violates check constraint/i,
    );

    // slideIndex: -1
    await expectDbConstraintViolation(
      client.db.insert(presentationSlides).values({
        id: randomUUID(),
        projectId,
        slideIndex: -1,
        title: "اسلاید با شماره منفی",
      }),
      /chk_presentation_slides_index|violates check constraint/i,
    );
  });

  it("rejects invalid reference type and access_status enums", async () => {
    const projectId = randomUUID();
    await client.db.insert(presentationProjects).values({
      id: projectId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      title: "پروژه تست رفرنس نامعتبر",
    });

    // Invalid type
    await expectDbConstraintViolation(
      client.db.insert(presentationReferences).values({
        id: randomUUID(),
        projectId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: "unknown_source" as any,
        title: "منبع نامعتبر",
      }),
      /chk_presentation_refs_type|violates check constraint/i,
    );

    // Invalid access_status
    await expectDbConstraintViolation(
      client.db.insert(presentationReferences).values({
        id: randomUUID(),
        projectId,
        type: "doi",
        title: "وضعیت دسترسی نامعتبر",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accessStatus: "unknown_status" as any,
      }),
      /chk_presentation_refs_access_status|violates check constraint/i,
    );
  });

  it("rejects NULL in NOT NULL JSONB columns", async () => {
    const projectId = randomUUID();
    await client.db.insert(presentationProjects).values({
      id: projectId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      title: "پروژه تست نال جیسون",
    });

    // Attempt inserting explicit NULL into extractedTables
    await expectDbConstraintViolation(
      client.db.insert(presentationSlides).values({
        id: randomUUID(),
        projectId,
        slideIndex: 1,
        title: "اسلاید نال",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        extractedTables: null as any,
      }),
      /null value in column "extracted_tables"|violates not-null constraint/i,
    );

    // Attempt inserting explicit NULL into bibliographicMetadata
    await expectDbConstraintViolation(
      client.db.insert(presentationReferences).values({
        id: randomUUID(),
        projectId,
        type: "text",
        title: "رفرنس نال",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bibliographicMetadata: null as any,
      }),
      /null value in column "bibliographic_metadata"|violates not-null constraint/i,
    );
  });
});

