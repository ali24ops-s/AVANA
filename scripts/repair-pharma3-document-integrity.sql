-- ============================================================================
-- AVANA TRANSACTIONAL SAFE REPAIR: Course Pharmaceutics 3 Document Integrity
--
-- Target Problem:
--   Content import of Course Pharmaceutics 3 erroneously hijacked 3 Aulton PDF
--   documents belonging to Course Pharmaceutics 1 (Aulton ch 2, ch 3, ch 24).
--   This created 12 unmaterialized draft rows in generated_contents in Course 3
--   (holding 314 flashcards and 245 quiz questions) while detaching the 3 docs
--   from Course 1's live structure (3 modules, 25 lessons, 303 cards, 234 questions).
--
-- Targets:
--   Course 3 ID: '33b44249-ec03-46c6-b414-d880964ec9f2'
--   Course 1 ID: 'bca23767-2faa-4973-9f5a-c0324d7f1afc'
--   Doc 1: '4b1ba125-0eb2-46c1-9695-72437a1c0c66' (Aulton ch 2.PDF)
--   Doc 2: '8913353d-dd59-4d89-b109-d7bd0eefb4a0' (Aulton ch 3.PDF)
--   Doc 3: '343f5a95-8a1a-4498-8470-d13fa5975964' (Aulton ch 24.PDF)
--
-- Principles:
--   - 100% fail-safe and transactional (BEGIN ... COMMIT).
--   - Pre-check guard verifies expected state before any write.
--   - Exact row count assertions on every mutation.
--   - Comprehensive Post-check guard verifies referential integrity.
--   - Zero deletion of live content, zero guesswork, zero remapping.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- مرحله ۱: اعتبارسنجی پیش از اجرا (Pre-Check Guard)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_c1_exists integer;
  v_c3_exists integer;
  v_doc_count integer;
  v_doc_in_c3_count integer;
  v_draft_count integer;
  v_c1_modules integer;
  v_c1_lessons integer;
  v_c1_flashcards integer;
  v_c1_quizzes integer;
BEGIN
  -- ۱.۱. بررسی وجود دوره فارماسیوتیکس ۱
  SELECT COUNT(*) INTO v_c1_exists
  FROM courses
  WHERE id = 'bca23767-2faa-4973-9f5a-c0324d7f1afc' AND deleted_at IS NULL;
  IF v_c1_exists <> 1 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Course Pharmaceutics 1 (bca23767-2faa-4973-9f5a-c0324d7f1afc) not found.';
  END IF;

  -- ۱.۲. بررسی وجود دوره فارماسیوتیکس ۳
  SELECT COUNT(*) INTO v_c3_exists
  FROM courses
  WHERE id = '33b44249-ec03-46c6-b414-d880964ec9f2' AND deleted_at IS NULL;
  IF v_c3_exists <> 1 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Course Pharmaceutics 3 (33b44249-ec03-46c6-b414-d880964ec9f2) not found.';
  END IF;

  -- ۱.۳. بررسی وجود هر ۳ سند
  SELECT COUNT(*) INTO v_doc_count
  FROM documents
  WHERE id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  ) AND deleted_at IS NULL;
  IF v_doc_count <> 3 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected exactly 3 target documents, found %', v_doc_count;
  END IF;

  -- ۱.۴. بررسی مالکیت فعلی اسناد (هر ۳ سند باید در حال حاضر به اشتباه متعلق به فارماسیوتیکس ۳ باشند)
  SELECT COUNT(*) INTO v_doc_in_c3_count
  FROM documents
  WHERE id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  ) AND course_id = '33b44249-ec03-46c6-b414-d880964ec9f2';
  IF v_doc_in_c3_count <> 3 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 3 documents currently owned by Course 3, found %', v_doc_in_c3_count;
  END IF;

  -- ۱.۵. بررسی تعداد رکوردهای پیش‌نویس موقت در generated_contents فارماسیوتیکس ۳ (باید دقیقاً ۱۲ رکورد draft باشد)
  SELECT COUNT(*) INTO v_draft_count
  FROM generated_contents
  WHERE course_id = '33b44249-ec03-46c6-b414-d880964ec9f2'
    AND document_id IN (
      '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
      '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
      '343f5a95-8a1a-4498-8470-d13fa5975964'
    )
    AND status = 'draft';
  IF v_draft_count <> 12 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected exactly 12 draft records in generated_contents for Course 3, found %', v_draft_count;
  END IF;

  -- ۱.۶. بررسی ساختار لایو فارماسیوتیکس ۱ برای این سه سند
  SELECT COUNT(DISTINCT l.module_id), COUNT(DISTINCT l.id)
  INTO v_c1_modules, v_c1_lessons
  FROM flashcards f
  JOIN lessons l ON f.lesson_id = l.id
  JOIN modules m ON l.module_id = m.id
  WHERE f.document_id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  )
  AND f.course_id = 'bca23767-2faa-4973-9f5a-c0324d7f1afc'
  AND f.deleted_at IS NULL;

  IF v_c1_modules <> 3 OR v_c1_lessons <> 25 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Course 1 expected 3 modules and 25 lessons for target docs, found % modules, % lessons', v_c1_modules, v_c1_lessons;
  END IF;

  -- ۱.۷. بررسی فلش‌کارت‌های لایو این سه سند در فارماسیوتیکس ۱ (باید ۳۰۳ باشد)
  SELECT COUNT(*) INTO v_c1_flashcards
  FROM flashcards
  WHERE document_id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  )
  AND course_id = 'bca23767-2faa-4973-9f5a-c0324d7f1afc'
  AND deleted_at IS NULL;

  IF v_c1_flashcards <> 303 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Course 1 expected 303 live flashcards for target docs, found %', v_c1_flashcards;
  END IF;

  -- ۱.۸. بررسی سؤالات آزمون لایو این سه سند در فارماسیوتیکس ۱ (باید ۲۳۴ باشد)
  SELECT COUNT(*) INTO v_c1_quizzes
  FROM quiz_questions qq
  JOIN quizzes q ON qq.quiz_id = q.id
  WHERE q.document_id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  )
  AND q.course_id = 'bca23767-2faa-4973-9f5a-c0324d7f1afc'
  AND qq.deleted_at IS NULL;

  IF v_c1_quizzes <> 234 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Course 1 expected 234 live quiz questions for target docs, found %', v_c1_quizzes;
  END IF;

  RAISE NOTICE 'PRE-CHECK PASSED: All pre-conditions verified successfully.';
END $$;

-- ----------------------------------------------------------------------------
-- مرحله ۲: بازگرداندن مالکیت ۳ سند به فارماسیوتیکس ۱ (Restore Document Ownership)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE documents
  SET
    course_id = 'bca23767-2faa-4973-9f5a-c0324d7f1afc',
    updated_at = NOW()
  WHERE id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  )
  AND course_id = '33b44249-ec03-46c6-b414-d880964ec9f2';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 3 THEN
    RAISE EXCEPTION 'DOCUMENT RESTORE FAILED: Expected 3 documents updated, affected %', v_updated;
  END IF;

  RAISE NOTICE 'DOCUMENT RESTORE SUCCESS: Exactly 3 documents returned to Course Pharmaceutics 1.';
END $$;

-- ----------------------------------------------------------------------------
-- مرحله ۳: حذف پیش‌نویس‌های اشتباه ایمپورت از فارماسیوتیکس ۳ (Delete Invalid Drafts)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM generated_contents
  WHERE course_id = '33b44249-ec03-46c6-b414-d880964ec9f2'
    AND document_id IN (
      '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
      '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
      '343f5a95-8a1a-4498-8470-d13fa5975964'
    )
    AND status = 'draft';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 12 THEN
    RAISE EXCEPTION 'DRAFT CLEANUP FAILED: Expected 12 draft records deleted, affected %', v_deleted;
  END IF;

  RAISE NOTICE 'DRAFT CLEANUP SUCCESS: Exactly 12 invalid draft records removed from Course 3.';
END $$;

-- ----------------------------------------------------------------------------
-- مرحله ۴: اعتبارسنجی جامع پس از تغییرات (Post-Check & Integrity Guard)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_pharma3_docs integer;
  v_pharma3_drafts integer;
  v_pharma3_modules integer;
  v_pharma3_lessons integer;
  v_pharma1_docs integer;
  v_pharma1_modules integer;
  v_pharma1_lessons integer;
  v_pharma1_flashcards integer;
  v_pharma1_quizzes integer;
  v_orphan_cards integer;
  v_orphan_questions integer;
  v_cross_course_cards integer;
  v_cross_course_questions integer;
BEGIN
  -- ۴.۱. فارماسیوتیکس ۳: نباید هیچ‌کدام از این ۳ سند را داشته باشد
  SELECT COUNT(*) INTO v_pharma3_docs
  FROM documents
  WHERE id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  )
  AND course_id = '33b44249-ec03-46c6-b414-d880964ec9f2';

  IF v_pharma3_docs <> 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Course 3 still holds % target documents.', v_pharma3_docs;
  END IF;

  -- ۴.۲. فارماسیوتیکس ۳: نباید هیچ پیش‌نویسی از این ۳ سند داشته باشد
  SELECT COUNT(*) INTO v_pharma3_drafts
  FROM generated_contents
  WHERE course_id = '33b44249-ec03-46c6-b414-d880964ec9f2'
    AND document_id IN (
      '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
      '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
      '343f5a95-8a1a-4498-8470-d13fa5975964'
    );

  IF v_pharma3_drafts <> 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Course 3 still holds % draft records for target docs.', v_pharma3_drafts;
  END IF;

  -- ۴.۳. فارماسیوتیکس ۳: اطمینان از عدم وجود ماژول یا درس ناخواسته
  SELECT COUNT(*) INTO v_pharma3_modules FROM modules WHERE course_id = '33b44249-ec03-46c6-b414-d880964ec9f2' AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_pharma3_lessons FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = '33b44249-ec03-46c6-b414-d880964ec9f2' AND l.deleted_at IS NULL;

  IF v_pharma3_modules <> 0 OR v_pharma3_lessons <> 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Course 3 has % modules, % lessons (expected 0).', v_pharma3_modules, v_pharma3_lessons;
  END IF;

  -- ۴.۴. فارماسیوتیکس ۱: هر ۳ سند باید به فارماسیوتیکس ۱ متصل باشند
  SELECT COUNT(*) INTO v_pharma1_docs
  FROM documents
  WHERE id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  )
  AND course_id = 'bca23767-2faa-4973-9f5a-c0324d7f1afc';

  IF v_pharma1_docs <> 3 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Expected 3 documents in Course 1, found %', v_pharma1_docs;
  END IF;

  -- ۴.۵. فارماسیوتیکس ۱: ساختار لایو این ۳ سند نباید هیچ کاهشی داشته باشد (دقیقاً ۳ ماژول، ۲۵ درس، ۳۰۳ کارت، ۲۳۴ سؤال)
  SELECT COUNT(DISTINCT l.module_id), COUNT(DISTINCT l.id)
  INTO v_pharma1_modules, v_pharma1_lessons
  FROM flashcards f
  JOIN lessons l ON f.lesson_id = l.id
  JOIN modules m ON l.module_id = m.id
  WHERE f.document_id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  )
  AND f.course_id = 'bca23767-2faa-4973-9f5a-c0324d7f1afc'
  AND f.deleted_at IS NULL;

  IF v_pharma1_modules <> 3 OR v_pharma1_lessons <> 25 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Target docs in Course 1 have % modules, % lessons (expected 3 and 25).', v_pharma1_modules, v_pharma1_lessons;
  END IF;

  SELECT COUNT(*) INTO v_pharma1_flashcards
  FROM flashcards
  WHERE document_id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  )
  AND course_id = 'bca23767-2faa-4973-9f5a-c0324d7f1afc'
  AND deleted_at IS NULL;

  IF v_pharma1_flashcards <> 303 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Target docs in Course 1 have % flashcards (expected 303).', v_pharma1_flashcards;
  END IF;

  SELECT COUNT(*) INTO v_pharma1_quizzes
  FROM quiz_questions qq
  JOIN quizzes q ON qq.quiz_id = q.id
  WHERE q.document_id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  )
  AND q.course_id = 'bca23767-2faa-4973-9f5a-c0324d7f1afc'
  AND qq.deleted_at IS NULL;

  IF v_pharma1_quizzes <> 234 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Target docs in Course 1 have % quiz questions (expected 234).', v_pharma1_quizzes;
  END IF;

  -- ۴.۶. Referential Integrity: اعتبارسنجی عدم وجود orphan یا cross-course
  -- ۴.۶.۱. کارت‌های بدون درس یا با درس نامعتبر برای این ۳ سند
  SELECT COUNT(*) INTO v_orphan_cards
  FROM flashcards f
  WHERE f.document_id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  )
  AND f.deleted_at IS NULL
  AND (
    f.lesson_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = f.lesson_id AND l.deleted_at IS NULL)
  );

  IF v_orphan_cards <> 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Found % target flashcards with missing or invalid lesson_id.', v_orphan_cards;
  END IF;

  -- ۴.۶.۲. سؤالات بدون درس یا با درس نامعتبر برای این ۳ سند
  SELECT COUNT(*) INTO v_orphan_questions
  FROM quiz_questions qq
  JOIN quizzes q ON qq.quiz_id = q.id
  WHERE q.document_id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  )
  AND qq.deleted_at IS NULL
  AND (
    qq.lesson_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = qq.lesson_id AND l.deleted_at IS NULL)
  );

  IF v_orphan_questions <> 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Found % target quiz questions with missing or invalid lesson_id.', v_orphan_questions;
  END IF;

  -- ۴.۶.۳. عدم تطابق دوره درس با دوره کارت (Cross-Course Lesson Mismatch)
  SELECT COUNT(*) INTO v_cross_course_cards
  FROM flashcards f
  JOIN lessons l ON f.lesson_id = l.id
  JOIN modules m ON l.module_id = m.id
  WHERE f.document_id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  )
  AND f.deleted_at IS NULL
  AND m.course_id <> f.course_id;

  IF v_cross_course_cards <> 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Found % target flashcards with lesson in different course.', v_cross_course_cards;
  END IF;

  -- ۴.۶.۴. عدم تطابق دوره درس با دوره کوییز
  SELECT COUNT(*) INTO v_cross_course_questions
  FROM quiz_questions qq
  JOIN quizzes q ON qq.quiz_id = q.id
  JOIN lessons l ON qq.lesson_id = l.id
  JOIN modules m ON l.module_id = m.id
  WHERE q.document_id IN (
    '4b1ba125-0eb2-46c1-9695-72437a1c0c66',
    '8913353d-dd59-4d89-b109-d7bd0eefb4a0',
    '343f5a95-8a1a-4498-8470-d13fa5975964'
  )
  AND qq.deleted_at IS NULL
  AND m.course_id <> q.course_id;

  IF v_cross_course_questions <> 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: Found % target quiz questions with lesson in different course.', v_cross_course_questions;
  END IF;

  RAISE NOTICE 'POST-CHECK PASSED: All referential integrity assertions succeeded perfectly!';
END $$;

-- ----------------------------------------------------------------------------
-- مرحله ۵: ثبت قطعی تغییرات (Commit)
-- ----------------------------------------------------------------------------
COMMIT;
