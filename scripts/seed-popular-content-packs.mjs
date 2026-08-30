/**
 * Seed script for testing "محبوب‌ترین بسته‌های محتوای آموزشی" (Popular Content Packs) in development.
 *
 * Requirements:
 * 1. Safe: Never runs in production; preserves all existing real/demo data.
 * 2. Idempotent: Can run multiple times without duplicating or corrupting data.
 * 3. Domain Contract Compliant: Populates all 4 content_pack_items (lesson, flashcard, quiz, review_summary)
 *    with exact `kind` discriminators and required fields for `@avana/domain` preview and course materialization.
 * 4. Invariant Compliant: Inserts real content_pack_usages records per user, then calculates
 *    usage_count using the canonical DB query `COUNT(DISTINCT user_id)`.
 *
 * Usage:
 *   node scripts/seed-popular-content-packs.mjs
 */

import pg from "pg";
import { randomUUID } from "node:crypto";

const DEFAULT_DEV_DATABASE_URL =
  "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("⛔ ERROR: This seed script must NOT be run in production!");
    process.exit(1);
  }

  const connectionString =
    process.env.DATABASE_URL || DEFAULT_DEV_DATABASE_URL;

  console.log("🌱 Starting Popular Content Packs Development Seed...");
  console.log(`📡 Connecting to: ${connectionString.replace(/:[^:@]+@/, ":****@")}`);

  const pool = new pg.Pool({ connectionString });

  try {
    // -------------------------------------------------------------------------
    // 1. Resolve Target Organizations
    // -------------------------------------------------------------------------
    let mainOrgRes = await pool.query(
      "SELECT id, name, slug FROM organizations WHERE slug = 'avana-demo-organization' LIMIT 1",
    );
    if (mainOrgRes.rows.length === 0) {
      mainOrgRes = await pool.query(
        "SELECT id, name, slug FROM organizations ORDER BY created_at ASC LIMIT 1",
      );
    }
    if (mainOrgRes.rows.length === 0) {
      const newOrgId = randomUUID();
      mainOrgRes = await pool.query(
        "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id, name, slug",
        [newOrgId, "AVANA Demo Organization", "avana-demo-organization"],
      );
    }
    const mainOrg = mainOrgRes.rows[0];
    console.log(`🏢 Target Organization: "${mainOrg.name}" (${mainOrg.id})`);

    // -------------------------------------------------------------------------
    // 2. Create / Resolve Creator and Adopting Test Users
    // -------------------------------------------------------------------------
    // Creator user
    const creatorRes = await pool.query(
      `INSERT INTO users (id, email, name, created_at, updated_at)
       VALUES ($1, 'content_creator@avana.dev', 'استاد دکتر رضایی', NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
       RETURNING id, email, name`,
      [randomUUID()],
    );
    const creatorUser = creatorRes.rows[0];

    // 10 adopting test users
    const testUsers = [];
    for (let i = 1; i <= 10; i++) {
      const numStr = String(i).padStart(2, "0");
      const uRes = await pool.query(
        `INSERT INTO users (id, email, name, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
         RETURNING id, email, name`,
        [randomUUID(), `pack_user_${numStr}@avana.dev`, `کاربر آزمایشی ${numStr}`],
      );
      testUsers.push(uRes.rows[0]);
    }
    console.log(`👥 Creator: "${creatorUser.name}", Adopting Users: ${testUsers.length}`);

    // Resolve or create a dummy target course for usages
    let courseRes = await pool.query(
      "SELECT id FROM courses WHERE organization_id = $1 LIMIT 1",
      [mainOrg.id],
    );
    let targetCourseId;
    if (courseRes.rows.length > 0) {
      targetCourseId = courseRes.rows[0].id;
    } else {
      targetCourseId = randomUUID();
      await pool.query(
        `INSERT INTO courses (id, organization_id, name, subject, created_at, updated_at)
         VALUES ($1, $2, 'دوره پیش‌فرض یادگیری', 'داروسازی', NOW(), NOW())`,
        [targetCourseId, mainOrg.id],
      );
    }

    // -------------------------------------------------------------------------
    // 2.5 Clean up legacy test seed records with non-compliant UUIDs (if present)
    // -------------------------------------------------------------------------
    const legacySeedIds = [
      "c0000001-0000-0000-0000-000000000001",
      "c0000001-0000-0000-0000-000000000002",
      "c0000001-0000-0000-0000-000000000003",
      "c0000001-0000-0000-0000-000000000004",
      "c0000001-0000-0000-0000-000000000005",
      "c0000001-0000-0000-0000-000000000006",
      "c0000001-0000-0000-0000-000000000007",
      "c0000001-0000-0000-0000-000000000008",
    ];
    await pool.query(
      "DELETE FROM content_packs WHERE id = ANY($1::uuid[])",
      [legacySeedIds],
    );

    // -------------------------------------------------------------------------
    // 3. Define 8 Popular Content Packs with Rich, Real-world Medical Content
    // -------------------------------------------------------------------------
    const packSpecs = [
      {
        id: "c0000001-0000-4000-8000-000000000001",
        title: "فارماکوکینتیک بالینی و دوزینگ داروها",
        subject: "داروسازی",
        description: "مجموعه جامع مفاهیم جذب، توزیع، متابولیسم، دفع و تنظیم دوز داروهای با پنجره درمانی باریک.",
        sessions: 6,
        sessionTitles: [
          "اصول جذب و فراهمی زیستی داروها (Bioavailability)",
          "حجم توزیع (Vd) و اتصال به پروتئین‌های پلاسما",
          "کلیرانس کلیوی، فیلتراسیون گلومرولی و ترشح توبولی",
          "متابولیسم کبدی و مسیرهای آنزیمی سیتوکروم P450",
          "فارماکوکینتیک غیرخطی و اشباع‌پذیر (Michaelis-Menten)",
          "مانیتورینگ درمانی دارو (TDM) و تنظیم دوز در نارسایی ارگان‌ها",
        ],
        flashcards: 42,
        quizzes: 15,
        minutes: 25,
        adoptUserCount: 10, // Rank 1
      },
      {
        id: "c0000001-0000-4000-8000-000000000002",
        title: "فیزیولوژی قلب و عروق و مکانیسم‌های همودینامیک",
        subject: "فیزیولوژی",
        description: "بررسی پتانسیل عمل قلبی، چرخه قلبی، تنظیم فشار خون و الکتروفیزیولوژی تخصصی میوکارد.",
        sessions: 5,
        sessionTitles: [
          "الکتروفیزیولوژی سلول‌های قلبی و پتانسیل عمل",
          "چرخه قلبی، حجم ضربه‌ای و برون‌ده قلب",
          "تنظیم هورمونی و عصبی فشار خون شریانی",
          "مکانیسم‌های همودینامیک و مقاومت عروق محیطی",
          "خون‌رسانی کرونری و پاسخ‌های انطباقی میوکارد",
        ],
        flashcards: 36,
        quizzes: 12,
        minutes: 20,
        adoptUserCount: 8, // Rank 2
      },
      {
        id: "c0000001-0000-4000-8000-000000000003",
        title: "آنتی‌بیوتیک‌ها و پروتکل‌های مقاومت میکروبی",
        subject: "فارماکولوژی",
        description: "طبقه‌بندی بتالاکتام‌ها، ماکرولیدها، فلوروکینولون‌ها و مکانیسم‌های ژنتیکی مقاومت دارویی.",
        sessions: 4,
        sessionTitles: [
          "طبقه‌بندی آنتی‌بیوتیک‌های بتالاکتام و مهارکننده‌های دیواره سلولی",
          "مهارکننده‌های سنتز پروتئین (ماکرولیدها، آمینوگلیکوزیدها و تتراسایکلین‌ها)",
          "فلوروکینولون‌ها و داروهای مهارکننده سنتز اسید نوکلئیک",
          "مکانیسم‌های ژنتیکی مقاومت میکروبی و استراتژی‌های آنتی‌بیوتیک استیواردشیپ",
        ],
        flashcards: 30,
        quizzes: 10,
        minutes: 18,
        adoptUserCount: 7, // Rank 3
      },
      {
        id: "c0000001-0000-4000-8000-000000000004",
        title: "شیمی دارویی داروهای سیستم اعصاب مرکزی (CNS)",
        subject: "شیمی دارویی",
        description: "روابط ساختار-فعالیت (SAR)، عبور از سد خونی-مغزی و طراحی لیگاندهای گیرنده‌های GABA و دوپامین.",
        sessions: 4,
        sessionTitles: [
          "روابط ساختار-فعالیت (SAR) در داروهای آرام‌بخش و خواب‌آور",
          "آگونیست‌ها و آنتاگونیست‌های گیرنده‌های دوپامینی و سروتونینی",
          "شیمی دارویی داروهای ضد صرع و تثبیت‌کننده‌های خلق",
          "اصول عبور از سد خونی-مغزی (BBB) و طراحی پروداروها",
        ],
        flashcards: 28,
        quizzes: 10,
        minutes: 16,
        adoptUserCount: 6, // Rank 4
      },
      {
        id: "c0000001-0000-4000-8000-000000000005",
        title: "میکروبیولوژی پزشکی و عوامل بیماری‌زای شایع",
        subject: "میکروبیولوژی",
        description: "مبانی تشخیص باکتری‌های گرم مثبت و منفی، فاکتورهای ویرولانس و توکسین‌های باکتریایی.",
        sessions: 3,
        sessionTitles: [
          "باکتری‌های گرم مثبت بیماری‌زا (استافیلوکوک‌ها و استرپتوکوک‌ها)",
          "انتروباکتریاسه‌ها و باسیل‌های گرم منفی بیمارستانی",
          "باکتری‌های بی‌هوازی و روش‌های کشت و تشخیص اختصاصی",
        ],
        flashcards: 24,
        quizzes: 8,
        minutes: 15,
        adoptUserCount: 5, // Rank 5
      },
      {
        id: "c0000001-0000-4000-8000-000000000006",
        title: "فارماکوگنوزی و متابولیت‌های فعال گیاهی",
        subject: "گیاهان دارویی",
        description: "بررسی آلکالوئیدها، ترپنوئیدها، گلیکوزیدهای قلبی و اثرات درمانی عصاره‌های استاندارد.",
        sessions: 3,
        sessionTitles: [
          "آلکالوئیدهای مهم دارویی و روش‌های استخراج و شناسایی",
          "گلیکوزیدهای قلبی، فلاونوئیدها و آنتوسیانین‌ها",
          "روغن‌های فرار، ترپنوئیدها و استانداردهای فارماکوپه‌ای",
        ],
        flashcards: 20,
        quizzes: 8,
        minutes: 14,
        adoptUserCount: 4, // Rank 6
      },
      {
        id: "c0000001-0000-4000-8000-000000000007",
        title: "انگل‌شناسی بالینی و تک‌یاخته‌های بیماری‌زا",
        subject: "انگل‌شناسی",
        description: "چرخه زندگی، علائم بالینی و روش‌های آزمایشگاهی تشخیص لیشمانیا، مالاریا و توکسوپلاسما.",
        sessions: 3,
        sessionTitles: [
          "پروتوزوآهای روده‌ای (ژیاردیا لامبلیا و آمیبیازیس)",
          "انگل‌های خون و بافت (لیشمانیا و پلاسمودیوم مالاریا)",
          "توکسوپلاسما گوندی و روش‌های تشخیص سرولوژیک و مولکولی",
        ],
        flashcards: 18,
        quizzes: 6,
        minutes: 12,
        adoptUserCount: 3, // Rank 7
      },
      {
        id: "c0000001-0000-4000-8000-000000000008",
        title: "بیوشیمی بالینی و مسیرهای متابولیسم کربوهیدرات",
        subject: "بیوشیمی",
        description: "گلیکولیز، گلوکونئوژنز، چرخه کربس، کنترل هورمونی قند خون و اختلالات متابولیک مرتبط.",
        sessions: 2,
        sessionTitles: [
          "گلیکولیز، گلوکونئوژنز و تنظیم هورمونی توسط انسولین و گلوکاگون",
          "چرخه کربس، زنجیره انتقال الکترون و بیماری‌های ذخیره گلیکوژن",
        ],
        flashcards: 16,
        quizzes: 6,
        minutes: 10,
        adoptUserCount: 2, // Rank 8
      },
    ];

    for (const spec of packSpecs) {
      const metadata = {
        sessionCount: spec.sessions,
        flashcardCount: spec.flashcards,
        quizQuestionCount: spec.quizzes,
        estimatedReadingMinutes: spec.minutes,
      };

      // 1. Insert/Update Content Pack
      await pool.query(
        `INSERT INTO content_packs (id, creator_user_id, organization_id, title, description, subject, status, published_at, usage_count, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'published', NOW(), 0, $7, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           subject = EXCLUDED.subject,
           status = 'published',
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          spec.id,
          creatorUser.id,
          mainOrg.id,
          spec.title,
          spec.description,
          spec.subject,
          JSON.stringify(metadata),
        ],
      );

      // 2. Insert 4 Content Pack Items conforming 100% to @avana/domain types

      // A. LessonPayload (kind: "lesson")
      const sampleLessonPayload = {
        kind: "lesson",
        title: spec.title,
        moduleTitle: spec.title,
        contentMarkdown: `# ${spec.title}\n\n${spec.description}`,
        outline: Array.from({ length: spec.sessions }, (_, i) => ({
          title: `فصل ${i + 1}: ${spec.sessionTitles[i] || `مفاهیم تخصصی بخش ${i + 1}`}`,
          description: `اهداف یادگیری و ارزیابی بخش ${i + 1}`,
        })),
        sessions: Array.from({ length: spec.sessions }, (_, i) => ({
          title: `جلسه ${i + 1}: ${spec.sessionTitles[i] || `مفاهیم کلیدی بخش ${i + 1}`}`,
          contentMarkdown: `### جلسه ${i + 1}: ${spec.sessionTitles[i] || `مفاهیم کلیدی بخش ${i + 1}`}\n\nدر این جلسه به تحلیل و بررسی جامع مباحث ${spec.title} پرداخته می‌شود.\n\n#### نکات کلیدی:\n- آشنایی با اصول و مبانی پایه در ${spec.subject}\n- بررسی کاربردهای بالینی و سناریوهای واقعی\n- تحلیل شواهد و راهنماهای درمانی به‌روز`,
          estimatedMinutes: Math.round(spec.minutes / spec.sessions) || 5,
          citationChunkIds: [],
        })),
        citationChunkIds: [],
      };

      // B. FlashcardPayload (kind: "flashcard")
      const sampleFlashcardPayload = {
        kind: "flashcard",
        cards: Array.from({ length: spec.flashcards }, (_, i) => ({
          question: `نکته کلیدی شماره ${i + 1}: در «${spec.title}» اصل بنیادین چیست؟`,
          answer: `پاسخ تشریحی شماره ${i + 1}: ارزیابی پارامترهای اختصاصی و بهینه‌سازی فرآیند یادگیری در ${spec.title}.`,
          explanation: `توضیحات تکمیلی و مرور فعال برای فلش‌کارت شماره ${i + 1} از بسته ${spec.title}`,
          difficulty: i % 3 === 0 ? "hard" : i % 2 === 0 ? "medium" : "easy",
          cardType: i % 2 === 0 ? "definition" : "clinical_case",
        })),
        citationChunkIds: [],
      };

      // C. QuizPayload (kind: "quiz")
      const sampleQuizPayload = {
        kind: "quiz",
        title: `آزمون جامع ${spec.title}`,
        questions: Array.from({ length: spec.quizzes }, (_, i) => ({
          sessionIndex: i % spec.sessions,
          question: `سوال آزمون ${i + 1}: کدام گزینه در رابطه با مبحث «${spec.title}» صحیح است؟`,
          questionType: "multiple_choice",
          category: spec.subject,
          difficulty: i % 3 === 0 ? "hard" : i % 2 === 0 ? "medium" : "easy",
          choices: [
            `گزینه اول: تعریف استاندارد و اصل صحیح در ${spec.subject}`,
            "گزینه دوم: خطای رایج در تفسیر بالینی",
            "گزینه سوم: گزینه انحرافی مربوط به دوز نامناسب",
            "گزینه چهارم: مکانیسم غیرمرتبط با گیرنده هدف",
          ],
          correctAnswer: `گزینه اول: تعریف استاندارد و اصل صحیح در ${spec.subject}`,
          explanation: `توضیح پاسخ تشریحی: گزینه اول به علت انطباق کامل با شواهد علمی مبحث ${spec.title} صحیح است.`,
        })),
        citationChunkIds: [],
      };

      // D. ReviewSummaryPayload (kind: "review_summary")
      const sampleSummaryPayload = {
        kind: "review_summary",
        title: `خلاصه مروری ${spec.title}`,
        overview: `این بسته آموزشی جامع شامل ${spec.sessions} جلسه درسنامه ساختاریافته، ${spec.flashcards} فلش‌کارت مرور فعال، ${spec.quizzes} سوال آزمون ارزیابی و خلاصه جمع‌بندی نکات کلیدی برای مبحث «${spec.title}» در حوزه ${spec.subject} می‌باشد.`,
        estimatedReadingMinutes: spec.minutes,
        sections: [
          {
            title: "مفاهیم و تعاریف کلیدی",
            keyPoints: [
              `آشنایی با متغیرها و شاخص‌های اساسی در ${spec.title}`,
              "تحلیل روابط فارماکودینامیک و فارماکوکینتیک مرتبط",
              "بررسی ارتباط متقابل ساختار شیمیایی و اثر بیولوژیک",
            ],
          },
          {
            title: "ملاحظات بالینی و مدیریت درمان",
            keyPoints: [
              "پروتکل‌های درمانی خط اول و جایگزین در شرایط ویژه",
              "مدیریت عوارض جانبی و تداخلات دارویی مهم",
              "تنظیم دوز در بیماران با نارسایی کلیوی و کبدی",
            ],
          },
          {
            title: "نکات پرتکرار آزمون‌های جامع",
            keyPoints: [
              "تفاوت‌های ظریف در مکانیسم اثر دسته‌های دارویی",
              "موارد منع مصرف مطلق و نسبی در بالین",
              "جدول مقایسه‌ای ویژگی‌های فارماکوکینتیک داروها",
            ],
          },
        ],
        citationChunkIds: [],
      };

      const itemsToInsert = [
        { type: "lesson", payload: sampleLessonPayload, sortOrder: 0 },
        { type: "flashcard", payload: sampleFlashcardPayload, sortOrder: 1 },
        { type: "quiz", payload: sampleQuizPayload, sortOrder: 2 },
        { type: "review_summary", payload: sampleSummaryPayload, sortOrder: 3 },
      ];

      for (const it of itemsToInsert) {
        await pool.query(
          `INSERT INTO content_pack_items (id, content_pack_id, content_type, payload_snapshot, sort_order, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (content_pack_id, content_type) DO UPDATE SET
             payload_snapshot = EXCLUDED.payload_snapshot,
             sort_order = EXCLUDED.sort_order`,
          [randomUUID(), spec.id, it.type, JSON.stringify(it.payload), it.sortOrder],
        );
      }

      // 3. Insert real content_pack_usages for the top N adopting users
      for (let u = 0; u < spec.adoptUserCount; u++) {
        const user = testUsers[u];
        await pool.query(
          `INSERT INTO content_pack_usages (id, content_pack_id, user_id, target_course_id, added_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (content_pack_id, user_id, target_course_id) DO NOTHING`,
          [randomUUID(), spec.id, user.id, targetCourseId],
        );
      }

      // 4. Re-synchronize usage_count using the canonical system invariant
      await pool.query(
        `UPDATE content_packs
         SET usage_count = (SELECT count(DISTINCT user_id)::int FROM content_pack_usages WHERE content_pack_id = $1),
             updated_at = NOW()
         WHERE id = $1`,
        [spec.id],
      );
    }

    console.log(`✅ Successfully seeded 8 Popular Content Packs with strict domain & invariant adherence.`);

    // -------------------------------------------------------------------------
    // 4. Verification Check
    // -------------------------------------------------------------------------
    const checkRes = await pool.query(
      `SELECT id, title, subject, status, usage_count
       FROM content_packs
       WHERE status = 'published' AND deleted_at IS NULL
       ORDER BY usage_count DESC, published_at DESC
       LIMIT 8`,
    );
    console.log("📊 Current Top 8 Popular Content Packs:");
    console.table(checkRes.rows);

  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
