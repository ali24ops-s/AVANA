import { sql } from "drizzle-orm";

/**
 * Migration 0022: Decouple Accepted Content from Document Lifecycle.
 *
 * Updates foreign key constraints on `flashcards.document_id`, `quizzes.document_id`,
 * and `generated_contents.document_id` to `ON DELETE SET NULL`.
 *
 * Ensures that if a raw source document is hard-deleted or purged during re-upload,
 * all accepted educational contents (lessons, flashcards, quizzes, and review summaries)
 * remain fully intact and accessible in their respective courses.
 *
 * Idempotent (IF NOT EXISTS / safe dynamic constraint replacement) for reliable application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Ensure document_id columns are nullable
    ALTER TABLE IF EXISTS flashcards ALTER COLUMN document_id DROP NOT NULL;
    ALTER TABLE IF EXISTS quizzes ALTER COLUMN document_id DROP NOT NULL;
    ALTER TABLE IF EXISTS generated_contents ALTER COLUMN document_id DROP NOT NULL;

    -- 2. Drop existing foreign key constraints on document_id for flashcards, quizzes, and generated_contents
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN (
        SELECT tc.constraint_name, tc.table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name IN ('flashcards', 'quizzes', 'generated_contents')
          AND kcu.column_name = 'document_id'
      ) LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(r.table_name) || ' DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
      END LOOP;
    END $$;

    -- 3. Re-add foreign key constraints with ON DELETE SET NULL
    ALTER TABLE flashcards
      ADD CONSTRAINT flashcards_document_id_documents_id_fk
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;

    ALTER TABLE quizzes
      ADD CONSTRAINT quizzes_document_id_documents_id_fk
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;

    ALTER TABLE generated_contents
      ADD CONSTRAINT generated_contents_document_id_documents_id_fk
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE IF EXISTS flashcards DROP CONSTRAINT IF EXISTS flashcards_document_id_documents_id_fk;
    ALTER TABLE IF EXISTS quizzes DROP CONSTRAINT IF EXISTS quizzes_document_id_documents_id_fk;
    ALTER TABLE IF EXISTS generated_contents DROP CONSTRAINT IF EXISTS generated_contents_document_id_documents_id_fk;

    ALTER TABLE IF EXISTS flashcards
      ADD CONSTRAINT flashcards_document_id_documents_id_fk
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

    ALTER TABLE IF EXISTS quizzes
      ADD CONSTRAINT quizzes_document_id_documents_id_fk
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

    ALTER TABLE IF EXISTS generated_contents
      ADD CONSTRAINT generated_contents_document_id_documents_id_fk
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
  `);
}
