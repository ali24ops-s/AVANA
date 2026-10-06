-- ============================================================================
-- AVANA PRODUCTION BACKFILL: Course Pharmaceutics 1 (Missing 3 Documents & 303 Flashcards)
-- Course ID (Prod): ce621a72-1445-46e3-9605-df8f751171d6
-- Organization ID:  b4a0b464-16db-4087-92b7-163a1e6f6776
-- Owner User ID:    79bda286-08a4-4a16-9340-4106864e0732
-- Import Batch ID:  6fae1f7b-b326-46fc-a325-45957b87741a
--
-- Pure Database Metadata Backfill (NO Physical Files Required).
-- Fully transactional, fail-safe (deep metadata comparison on conflict),
-- and guarded by exact ROW_COUNT checks at every single step.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ۱. اعتبارسنجی اولیه وضعیت Production (Pre-Validation Guard)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_course_exists integer;
  v_org_exists integer;
  v_user_exists integer;
  v_unmapped_cards integer;
  v_unmapped_c1 integer;
  v_unmapped_c2 integer;
  v_unmapped_c3 integer;
  v_unmapped_modules integer;
  v_unmapped_drafts integer;
  v_unmapped_quizzes integer;
BEGIN
  -- ۱.۱. بررسی وجود دوره
  SELECT COUNT(*) INTO v_course_exists FROM courses WHERE id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND deleted_at IS NULL;
  IF v_course_exists <> 1 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Course ce621a72-1445-46e3-9605-df8f751171d6 not found.';
  END IF;

  -- ۱.۲. بررسی وجود سازمان
  SELECT COUNT(*) INTO v_org_exists FROM organizations WHERE id = 'b4a0b464-16db-4087-92b7-163a1e6f6776';
  IF v_org_exists <> 1 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Organization b4a0b464-16db-4087-92b7-163a1e6f6776 not found.';
  END IF;

  -- ۱.۳. بررسی وجود کاربر مالک
  SELECT COUNT(*) INTO v_user_exists FROM users WHERE id = '79bda286-08a4-4a16-9340-4106864e0732';
  IF v_user_exists <> 1 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Owner user 79bda286-08a4-4a16-9340-4106864e0732 not found.';
  END IF;

  -- ۱.۴. بررسی تعداد کل فلش‌کارت‌های بدون سند در این دوره (باید دقیقاً ۳۰۳ باشد)
  SELECT COUNT(*) INTO v_unmapped_cards FROM flashcards 
  WHERE course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL AND deleted_at IS NULL;
  IF v_unmapped_cards <> 303 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 303 unmapped flashcards in course, found %', v_unmapped_cards;
  END IF;

  -- ۱.۵. بررسی تفکیک شمارش هر پیش‌نویس (۱۱۲ / ۹۳ / ۹۸)
  SELECT COUNT(*) INTO v_unmapped_c1 FROM flashcards 
  WHERE course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND generated_content_id = 'e8187294-7122-4b03-a104-13923a5f7374' AND document_id IS NULL AND deleted_at IS NULL;
  IF v_unmapped_c1 <> 112 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Draft e8187294 (Ch 2) expected 112 unmapped flashcards, found %', v_unmapped_c1;
  END IF;

  SELECT COUNT(*) INTO v_unmapped_c2 FROM flashcards 
  WHERE course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND generated_content_id = '70dc7731-a1a3-4fc3-b634-ec4bbb137bfe' AND document_id IS NULL AND deleted_at IS NULL;
  IF v_unmapped_c2 <> 93 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Draft 70dc7731 (Ch 24) expected 93 unmapped flashcards, found %', v_unmapped_c2;
  END IF;

  SELECT COUNT(*) INTO v_unmapped_c3 FROM flashcards 
  WHERE course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND generated_content_id = '4b59c2bc-17c1-4fc5-a444-5a18be69dabf' AND document_id IS NULL AND deleted_at IS NULL;
  IF v_unmapped_c3 <> 98 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Draft 4b59c2bc (Ch 3) expected 98 unmapped flashcards, found %', v_unmapped_c3;
  END IF;

  -- ۱.۶. بررسی ۳ ماژول بدون سند
  SELECT COUNT(*) INTO v_unmapped_modules FROM modules 
  WHERE id IN ('a5d0a0e6-1a1a-45db-9840-271c535b72b3', 'bcf9429b-7dd5-4f83-aa50-9557953bc254', '7fead152-91be-4055-a574-54f2fd04b673')
    AND course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL AND deleted_at IS NULL;
  IF v_unmapped_modules <> 3 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 3 specific unmapped modules, found %', v_unmapped_modules;
  END IF;

  -- ۱.۷. بررسی ۳ پیش‌نویس بدون سند
  SELECT COUNT(*) INTO v_unmapped_drafts FROM generated_contents 
  WHERE id IN ('e8187294-7122-4b03-a104-13923a5f7374', '70dc7731-a1a3-4fc3-b634-ec4bbb137bfe', '4b59c2bc-17c1-4fc5-a444-5a18be69dabf')
    AND course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL AND deleted_at IS NULL;
  IF v_unmapped_drafts <> 3 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 3 specific unmapped drafts, found %', v_unmapped_drafts;
  END IF;

  -- ۱.۸. بررسی ۳ کوییز بدون سند
  SELECT COUNT(*) INTO v_unmapped_quizzes FROM quizzes 
  WHERE id IN ('929ed764-50c9-49b6-90b3-f17277213316', '315207be-33c2-4308-a95e-d9caa3238466', 'e444b5ae-9184-47d8-b603-5d4ce9d7a6f4')
    AND course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL AND deleted_at IS NULL;
  IF v_unmapped_quizzes <> 3 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 3 specific unmapped quizzes, found %', v_unmapped_quizzes;
  END IF;

  RAISE NOTICE 'PRE-CHECK PASSED: Exactly 303 unmapped cards (112, 93, 98), 3 modules, 3 drafts, and 3 quizzes verified.';
END $$;

-- ----------------------------------------------------------------------------
-- ۲. درج یا تطبیق Fail-Safe متادیتای ۳ سند در جدول documents
--    (اگر وجود ندارد درج می‌کند؛ اگر وجود دارد تمام فیلدها را مقایسه می‌کند؛
--     هیچ رکوردی را کورکورانه رونویسی یا نادیده نمی‌گیرد)
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE temp_expected_documents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  course_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  original_name varchar(255) NOT NULL,
  mime_type varchar(100) NOT NULL,
  size_bytes integer NOT NULL,
  sha256 char(64) NOT NULL,
  storage_key varchar(500) NOT NULL,
  page_count integer NOT NULL,
  status varchar(30) NOT NULL,
  retry_count integer NOT NULL,
  quality_score integer NOT NULL,
  quality_level varchar(20) NOT NULL,
  quality_report jsonb NOT NULL,
  quality_analyzed_at timestamptz NOT NULL
) ON COMMIT DROP;

INSERT INTO temp_expected_documents VALUES
  (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    'b4a0b464-16db-4087-92b7-163a1e6f6776',
    'ce621a72-1445-46e3-9605-df8f751171d6',
    '79bda286-08a4-4a16-9340-4106864e0732',
    'Aulton ch 2.PDF',
    'application/pdf',
    10833879,
    '9c1f91cb2ec5377972c8804c4490f25b4f4f6f057180dbb5c6de9e8eb14942b3',
    'uploads/4b1ba125-0eb2-46c1-9695-72437a1c0c66.pdf',
    19,
    'ready',
    0,
    100,
    'excellent',
    '{"level": "excellent", "score": 100, "metrics": {"noiseHealth": 100, "textDensity": 100, "pageCoverage": 100, "characterHealth": 100, "extractionHealth": 100}, "warnings": []}'::jsonb,
    '2026-09-24 08:55:39.473+00'
  ),
  (
    '343f5a95-8a1a-4498-8470-d13fa5975964',
    'b4a0b464-16db-4087-92b7-163a1e6f6776',
    'ce621a72-1445-46e3-9605-df8f751171d6',
    '79bda286-08a4-4a16-9340-4106864e0732',
    'Aulton ch 24.PDF',
    'application/pdf',
    10626841,
    '4b98c37b5aa996d7fe342d8c84d3520ee67675d1ae3b2d846aafdb0950638dad',
    'uploads/343f5a95-8a1a-4498-8470-d13fa5975964.pdf',
    10,
    'ready',
    0,
    100,
    'excellent',
    '{"level": "excellent", "score": 100, "metrics": {"noiseHealth": 100, "textDensity": 100, "pageCoverage": 100, "characterHealth": 100, "extractionHealth": 100}, "warnings": []}'::jsonb,
    '2026-09-24 09:33:26.479+00'
  ),
  (
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    'b4a0b464-16db-4087-92b7-163a1e6f6776',
    'ce621a72-1445-46e3-9605-df8f751171d6',
    '79bda286-08a4-4a16-9340-4106864e0732',
    'Aulton ch 3.PDF',
    'application/pdf',
    10662351,
    'a5802ff14b4c14f89aa23a6ecd749c79e701f05f1288aa45bb0fab608ad687a0',
    'uploads/8913353d-dd59-4d89-b109-d7bd0eefb4a0.pdf',
    10,
    'ready',
    0,
    100,
    'excellent',
    '{"level": "excellent", "score": 100, "metrics": {"noiseHealth": 100, "textDensity": 100, "pageCoverage": 100, "characterHealth": 100, "extractionHealth": 100}, "warnings": []}'::jsonb,
    '2026-09-29 10:02:05.166+00'
  );

DO $$
DECLARE
  rec RECORD;
  cur RECORD;
BEGIN
  FOR rec IN SELECT * FROM temp_expected_documents LOOP
    SELECT * INTO cur FROM documents WHERE id = rec.id;
    IF NOT FOUND THEN
      -- رکورد هنوز وجود ندارد: درج رکورد جدید
      INSERT INTO documents (
        id, organization_id, course_id, owner_user_id, original_name, mime_type,
        size_bytes, sha256, storage_key, page_count, status, retry_count,
        quality_score, quality_level, quality_report, quality_analyzed_at, created_at, updated_at
      ) VALUES (
        rec.id, rec.organization_id, rec.course_id, rec.owner_user_id, rec.original_name, rec.mime_type,
        rec.size_bytes, rec.sha256, rec.storage_key, rec.page_count, rec.status, rec.retry_count,
        rec.quality_score, rec.quality_level, rec.quality_report, rec.quality_analyzed_at, NOW(), NOW()
      );
      RAISE NOTICE 'Document % (%) successfully inserted.', rec.id, rec.original_name;
    ELSE
      -- رکورد از قبل وجود دارد: مقایسه دقیق تک‌تک فیلدهای کلیدی جهت جلوگیری از هرگونه تناقض داده‌ای
      IF cur.original_name <> rec.original_name THEN
        RAISE EXCEPTION 'DOCUMENT CONFLICT on %: original_name mismatch. Existing: "%", Expected: "%"',
          rec.id, cur.original_name, rec.original_name;
      END IF;
      IF cur.sha256 <> rec.sha256 THEN
        RAISE EXCEPTION 'DOCUMENT CONFLICT on %: sha256 mismatch. Existing: "%", Expected: "%"',
          rec.id, cur.sha256, rec.sha256;
      END IF;
      IF cur.size_bytes <> rec.size_bytes THEN
        RAISE EXCEPTION 'DOCUMENT CONFLICT on %: size_bytes mismatch. Existing: %, Expected: %',
          rec.id, cur.size_bytes, rec.size_bytes;
      END IF;
      IF cur.page_count <> rec.page_count THEN
        RAISE EXCEPTION 'DOCUMENT CONFLICT on %: page_count mismatch. Existing: %, Expected: %',
          rec.id, cur.page_count, rec.page_count;
      END IF;
      IF cur.storage_key <> rec.storage_key THEN
        RAISE EXCEPTION 'DOCUMENT CONFLICT on %: storage_key mismatch. Existing: "%", Expected: "%"',
          rec.id, cur.storage_key, rec.storage_key;
      END IF;
      IF cur.organization_id <> rec.organization_id THEN
        RAISE EXCEPTION 'DOCUMENT CONFLICT on %: organization_id mismatch. Existing: %, Expected: %',
          rec.id, cur.organization_id, rec.organization_id;
      END IF;
      IF cur.course_id IS NOT NULL AND cur.course_id <> rec.course_id THEN
        RAISE EXCEPTION 'DOCUMENT CONFLICT on %: course_id mismatch. Existing: %, Expected: %',
          rec.id, cur.course_id, rec.course_id;
      END IF;
      IF cur.owner_user_id <> rec.owner_user_id THEN
        RAISE EXCEPTION 'DOCUMENT CONFLICT on %: owner_user_id mismatch. Existing: %, Expected: %',
          rec.id, cur.owner_user_id, rec.owner_user_id;
      END IF;
      IF cur.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'DOCUMENT CONFLICT on %: Document exists but has been soft-deleted.', rec.id;
      END IF;
      RAISE NOTICE 'Document % (%) already exists with identical validated metadata. Kept intact.', rec.id, rec.original_name;
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- ۳. ثبت سوابق واردات در imported_entities (همگام با معماری Import)
-- ----------------------------------------------------------------------------
INSERT INTO imported_entities (id, organization_id, batch_id, entity_type, export_id, target_entity_id, content_hash, natural_key)
VALUES
  (
    gen_random_uuid(), 'b4a0b464-16db-4087-92b7-163a1e6f6776', '6fae1f7b-b326-46fc-a325-45957b87741a',
    'document', 'doc_4b1ba125-0eb2-46c1-9695-72437a1c0c66', '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '9c1f91cb2ec5377972c8804c4490f25b4f4f6f057180dbb5c6de9e8eb14942b3', '9c1f91cb2ec5377972c8804c4490f25b4f4f6f057180dbb5c6de9e8eb14942b3'
  ),
  (
    gen_random_uuid(), 'b4a0b464-16db-4087-92b7-163a1e6f6776', '6fae1f7b-b326-46fc-a325-45957b87741a',
    'document', 'doc_343f5a95-8a1a-4498-8470-d13fa5975964', '343f5a95-8a1a-4498-8470-d13fa5975964',
    '4b98c37b5aa996d7fe342d8c84d3520ee67675d1ae3b2d846aafdb0950638dad', '4b98c37b5aa996d7fe342d8c84d3520ee67675d1ae3b2d846aafdb0950638dad'
  ),
  (
    gen_random_uuid(), 'b4a0b464-16db-4087-92b7-163a1e6f6776', '6fae1f7b-b326-46fc-a325-45957b87741a',
    'document', 'doc_8913353d-dd59-4d89-b109-d7bd0eefb4a0', '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    'a5802ff14b4c14f89aa23a6ecd749c79e701f05f1288aa45bb0fab608ad687a0', 'a5802ff14b4c14f89aa23a6ecd749c79e701f05f1288aa45bb0fab608ad687a0'
  )
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- ۴. به‌روزرسانی ماژول‌ها، پیش‌نویس‌ها و کوییزها با اعتبارسنجی دقیق ROW_COUNT
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rows integer;
BEGIN
  -- ۴.۱. ماژول‌ها (هر آپدیت دقیقاً ۱ ردیف را تغییر می‌دهد)
  UPDATE modules SET document_id = '4b1ba125-0eb2-46c1-9695-72437a1c0c66', updated_at = NOW()
  WHERE id = 'a5d0a0e6-1a1a-45db-9840-271c535b72b3' AND course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'MODULE 1 UPDATE FAILED: expected 1 row, affected %', v_rows; END IF;

  UPDATE modules SET document_id = '343f5a95-8a1a-4498-8470-d13fa5975964', updated_at = NOW()
  WHERE id = 'bcf9429b-7dd5-4f83-aa50-9557953bc254' AND course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'MODULE 2 UPDATE FAILED: expected 1 row, affected %', v_rows; END IF;

  UPDATE modules SET document_id = '8913353d-dd59-4d89-b109-d7bd0eefb4a0', updated_at = NOW()
  WHERE id = '7fead152-91be-4055-a574-54f2fd04b673' AND course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'MODULE 3 UPDATE FAILED: expected 1 row, affected %', v_rows; END IF;

  -- ۴.۲. پیش‌نویس‌های تولید محتوا
  UPDATE generated_contents SET document_id = '4b1ba125-0eb2-46c1-9695-72437a1c0c66', updated_at = NOW()
  WHERE id = 'e8187294-7122-4b03-a104-13923a5f7374' AND course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'DRAFT 1 UPDATE FAILED: expected 1 row, affected %', v_rows; END IF;

  UPDATE generated_contents SET document_id = '343f5a95-8a1a-4498-8470-d13fa5975964', updated_at = NOW()
  WHERE id = '70dc7731-a1a3-4fc3-b634-ec4bbb137bfe' AND course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'DRAFT 2 UPDATE FAILED: expected 1 row, affected %', v_rows; END IF;

  UPDATE generated_contents SET document_id = '8913353d-dd59-4d89-b109-d7bd0eefb4a0', updated_at = NOW()
  WHERE id = '4b59c2bc-17c1-4fc5-a444-5a18be69dabf' AND course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'DRAFT 3 UPDATE FAILED: expected 1 row, affected %', v_rows; END IF;

  -- ۴.۳. کوییزها
  UPDATE quizzes SET document_id = '4b1ba125-0eb2-46c1-9695-72437a1c0c66', updated_at = NOW()
  WHERE id = '929ed764-50c9-49b6-90b3-f17277213316' AND course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'QUIZ 1 UPDATE FAILED: expected 1 row, affected %', v_rows; END IF;

  UPDATE quizzes SET document_id = '343f5a95-8a1a-4498-8470-d13fa5975964', updated_at = NOW()
  WHERE id = '315207be-33c2-4308-a95e-d9caa3238466' AND course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'QUIZ 2 UPDATE FAILED: expected 1 row, affected %', v_rows; END IF;

  UPDATE quizzes SET document_id = '8913353d-dd59-4d89-b109-d7bd0eefb4a0', updated_at = NOW()
  WHERE id = 'e444b5ae-9184-47d8-b603-5d4ce9d7a6f4' AND course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'QUIZ 3 UPDATE FAILED: expected 1 row, affected %', v_rows; END IF;
END $$;

-- ----------------------------------------------------------------------------
-- ۵. به‌روزرسانی ۳۰۳ فلش‌کارت مستقیماً با شرط generated_content_id و کنترل ROW_COUNT
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rows integer;
BEGIN
  -- ۵.۱. ۱۱۲ فلش‌کارت مربوط به فصل ۲ (انحلال و انحلال‌پذیری)
  UPDATE flashcards
  SET document_id = '4b1ba125-0eb2-46c1-9695-72437a1c0c66', updated_at = NOW()
  WHERE course_id = 'ce621a72-1445-46e3-9605-df8f751171d6'
    AND generated_content_id = 'e8187294-7122-4b03-a104-13923a5f7374'
    AND document_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 112 THEN
    RAISE EXCEPTION 'FLASHCARDS CH 2 UPDATE FAILED: expected 112 rows, affected %', v_rows;
  END IF;

  -- ۵.۲. ۹۳ فلش‌کارت مربوط به فصل ۲۴ (محلول‌های دارویی)
  UPDATE flashcards
  SET document_id = '343f5a95-8a1a-4498-8470-d13fa5975964', updated_at = NOW()
  WHERE course_id = 'ce621a72-1445-46e3-9605-df8f751171d6'
    AND generated_content_id = '70dc7731-a1a3-4fc3-b634-ec4bbb137bfe'
    AND document_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 93 THEN
    RAISE EXCEPTION 'FLASHCARDS CH 24 UPDATE FAILED: expected 93 rows, affected %', v_rows;
  END IF;

  -- ۵.۳. ۹۸ فلش‌کارت مربوط به فصل ۳ (خواص محلول‌ها)
  UPDATE flashcards
  SET document_id = '8913353d-dd59-4d89-b109-d7bd0eefb4a0', updated_at = NOW()
  WHERE course_id = 'ce621a72-1445-46e3-9605-df8f751171d6'
    AND generated_content_id = '4b59c2bc-17c1-4fc5-a444-5a18be69dabf'
    AND document_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 98 THEN
    RAISE EXCEPTION 'FLASHCARDS CH 3 UPDATE FAILED: expected 98 rows, affected %', v_rows;
  END IF;

  RAISE NOTICE 'FLASHCARDS UPDATED: 112 + 93 + 98 = 303 flashcards successfully updated.';
END $$;

-- ----------------------------------------------------------------------------
-- ۶. اعتبارسنجی نهایی پس از اعمال تغییرات (Post-Validation Guard)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_remaining_unmapped integer;
  v_total_mapped_cards integer;
  v_unmapped_modules_left integer;
  v_unmapped_drafts_left integer;
  v_unmapped_quizzes_left integer;
BEGIN
  -- ۱. تعداد فلش‌کارت‌های بدون سند در این دوره باید دقیقاً ۰ باشد
  SELECT COUNT(*) INTO v_remaining_unmapped
  FROM flashcards
  WHERE course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL AND deleted_at IS NULL;
  IF v_remaining_unmapped <> 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Expected 0 unmapped flashcards, still found %', v_remaining_unmapped;
  END IF;

  -- ۲. تعداد کل فلش‌کارت‌های دارای سند در دوره باید دقیقاً ۱۹۶۶ باشد
  SELECT COUNT(*) INTO v_total_mapped_cards
  FROM flashcards
  WHERE course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NOT NULL AND deleted_at IS NULL;
  IF v_total_mapped_cards <> 1966 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Expected 1966 mapped flashcards, found %', v_total_mapped_cards;
  END IF;

  -- ۳. هیچ ماژولی در این دوره نباید بدون document_id باشد
  SELECT COUNT(*) INTO v_unmapped_modules_left
  FROM modules
  WHERE course_id = 'ce621a72-1445-46e3-9605-df8f751171d6' AND document_id IS NULL AND deleted_at IS NULL;
  IF v_unmapped_modules_left <> 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Found % modules without document_id', v_unmapped_modules_left;
  END IF;

  -- ۴. هیچ پیش‌نویسی از ۳ پیش‌نویس نباید بدون document_id باشد
  SELECT COUNT(*) INTO v_unmapped_drafts_left
  FROM generated_contents
  WHERE id IN ('e8187294-7122-4b03-a104-13923a5f7374', '70dc7731-a1a3-4fc3-b634-ec4bbb137bfe', '4b59c2bc-17c1-4fc5-a444-5a18be69dabf')
    AND document_id IS NULL;
  IF v_unmapped_drafts_left <> 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Found % drafts without document_id', v_unmapped_drafts_left;
  END IF;

  -- ۵. هیچ کوییزی از ۳ کوییز نباید بدون document_id باشد
  SELECT COUNT(*) INTO v_unmapped_quizzes_left
  FROM quizzes
  WHERE id IN ('929ed764-50c9-49b6-90b3-f17277213316', '315207be-33c2-4308-a95e-d9caa3238466', 'e444b5ae-9184-47d8-b603-5d4ce9d7a6f4')
    AND document_id IS NULL;
  IF v_unmapped_quizzes_left <> 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Found % quizzes without document_id', v_unmapped_quizzes_left;
  END IF;

  RAISE NOTICE 'SUCCESS: Course Pharmaceutics 1 is fully mapped and healthy! Committing transaction.';
END $$;

COMMIT;
