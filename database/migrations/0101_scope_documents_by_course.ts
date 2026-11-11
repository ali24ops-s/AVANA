import { sql } from "drizzle-orm";

/**
 * Migration 0101: Scope Document Uniqueness per Course.
 *
 * 1. Drops the global organization-wide unique index `idx_documents_org_hash` on documents(organization_id, sha256).
 * 2. Creates `idx_documents_org_course_hash` on documents(organization_id, course_id, sha256)
 *    enforcing uniqueness within a course for active documents (WHERE course_id IS NOT NULL AND deleted_at IS NULL).
 * 3. Creates `idx_documents_org_unattached_hash` on documents(organization_id, sha256)
 *    enforcing uniqueness for active unattached documents (WHERE course_id IS NULL AND deleted_at IS NULL).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes db instance
export async function up(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_documents_org_hash;

    -- Educational-structure-aware deduplication:
    -- Preserves all educational content (modules, flashcards, quizzes, chunks, generated content).
    -- Remaps references from secondary duplicate documents to the authoritative document
    -- before soft-deleting any duplicate document.
    DO $$
    DECLARE
      dup RECORD;
      auth_doc_id UUID;
      dup_doc_id UUID;
    BEGIN
      -- 1. Deduplicate active documents within the same course
      FOR dup IN
        SELECT organization_id, course_id, sha256
        FROM documents
        WHERE course_id IS NOT NULL AND deleted_at IS NULL
        GROUP BY organization_id, course_id, sha256
        HAVING COUNT(*) > 1
      LOOP
        -- Choose authoritative document: the one with the most active educational attachments
        SELECT d.id INTO auth_doc_id
        FROM documents d
        LEFT JOIN modules m ON m.document_id = d.id AND m.deleted_at IS NULL
        LEFT JOIN flashcards f ON f.document_id = d.id AND f.deleted_at IS NULL
        LEFT JOIN quizzes q ON q.document_id = d.id AND q.deleted_at IS NULL
        LEFT JOIN document_chunks c ON c.document_id = d.id
        WHERE d.organization_id = dup.organization_id
          AND d.course_id = dup.course_id
          AND d.sha256 = dup.sha256
          AND d.deleted_at IS NULL
        GROUP BY d.id, d.updated_at, d.created_at
        ORDER BY (COUNT(DISTINCT m.id) * 10 + COUNT(DISTINCT f.id) + COUNT(DISTINCT q.id) + COUNT(DISTINCT c.id)) DESC,
                 d.updated_at DESC, d.created_at DESC
        LIMIT 1;

        -- For all other duplicates of this course + sha256, remap references
        FOR dup_doc_id IN
          SELECT id FROM documents
          WHERE organization_id = dup.organization_id
            AND course_id = dup.course_id
            AND sha256 = dup.sha256
            AND id <> auth_doc_id
            AND deleted_at IS NULL
        LOOP
          -- Remap modules pointing to the duplicate document
          UPDATE modules
          SET document_id = auth_doc_id
          WHERE document_id = dup_doc_id
            AND course_id = dup.course_id
            AND NOT EXISTS (
              SELECT 1 FROM modules m2
              WHERE m2.course_id = dup.course_id
                AND m2.document_id = auth_doc_id
                AND m2.deleted_at IS NULL
            );

          -- If auth_doc_id already had a module in this course, decouple any remaining module
          -- so it remains active with document_id = NULL without violating idx_modules_course_document_unique
          UPDATE modules
          SET document_id = NULL
          WHERE document_id = dup_doc_id
            AND course_id = dup.course_id;

          -- Remap flashcards
          UPDATE flashcards
          SET document_id = auth_doc_id
          WHERE document_id = dup_doc_id;

          -- Remap quizzes
          UPDATE quizzes
          SET document_id = auth_doc_id
          WHERE document_id = dup_doc_id;

          -- Remap generated contents
          UPDATE generated_contents
          SET document_id = auth_doc_id
          WHERE document_id = dup_doc_id;

          -- Remap document chunks if authoritative document does not already have chunks
          UPDATE document_chunks
          SET document_id = auth_doc_id
          WHERE document_id = dup_doc_id
            AND NOT EXISTS (
              SELECT 1 FROM document_chunks c2
              WHERE c2.document_id = auth_doc_id
                AND c2.sequence = document_chunks.sequence
            );

          -- Remap source pack documents
          UPDATE source_pack_documents
          SET document_id = auth_doc_id
          WHERE document_id = dup_doc_id
            AND NOT EXISTS (
              SELECT 1 FROM source_pack_documents spd2
              WHERE spd2.source_pack_id = source_pack_documents.source_pack_id
                AND spd2.document_id = auth_doc_id
            );

          -- Clean up duplicate source_pack_documents for duplicate document
          DELETE FROM source_pack_documents WHERE document_id = dup_doc_id;

          -- Soft-delete the duplicate document now that all educational structures are safely attached to auth_doc_id
          UPDATE documents
          SET deleted_at = NOW()
          WHERE id = dup_doc_id;
        END LOOP;
      END LOOP;

      -- 2. Deduplicate active unattached documents (course_id IS NULL)
      FOR dup IN
        SELECT organization_id, sha256
        FROM documents
        WHERE course_id IS NULL AND deleted_at IS NULL
        GROUP BY organization_id, sha256
        HAVING COUNT(*) > 1
      LOOP
        SELECT d.id INTO auth_doc_id
        FROM documents d
        LEFT JOIN document_chunks c ON c.document_id = d.id
        WHERE d.organization_id = dup.organization_id
          AND d.course_id IS NULL
          AND d.sha256 = dup.sha256
          AND d.deleted_at IS NULL
        GROUP BY d.id, d.updated_at, d.created_at
        ORDER BY COUNT(DISTINCT c.id) DESC, d.updated_at DESC, d.created_at DESC
        LIMIT 1;

        FOR dup_doc_id IN
          SELECT id FROM documents
          WHERE organization_id = dup.organization_id
            AND course_id IS NULL
            AND sha256 = dup.sha256
            AND id <> auth_doc_id
            AND deleted_at IS NULL
        LOOP
          UPDATE document_chunks
          SET document_id = auth_doc_id
          WHERE document_id = dup_doc_id
            AND NOT EXISTS (
              SELECT 1 FROM document_chunks c2
              WHERE c2.document_id = auth_doc_id
                AND c2.sequence = document_chunks.sequence
            );

          UPDATE documents
          SET deleted_at = NOW()
          WHERE id = dup_doc_id;
        END LOOP;
      END LOOP;
    END $$;

    -- Enforce uniqueness per course for active documents
    CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_org_course_hash
      ON documents (organization_id, course_id, sha256)
      WHERE course_id IS NOT NULL AND deleted_at IS NULL;

    -- Enforce uniqueness for active unattached documents
    CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_org_unattached_hash
      ON documents (organization_id, sha256)
      WHERE course_id IS NULL AND deleted_at IS NULL;
  `);
}
