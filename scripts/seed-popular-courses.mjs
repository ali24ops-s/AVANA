/**
 * Seed script for testing "محبوب‌ترین دوره‌های آوانا" (Popular Avana Courses) in development.
 *
 * Requirements:
 * 1. Safe: Never runs in production; preserves all existing real/demo data.
 * 2. Idempotent: Can run multiple times without duplicating or corrupting data.
 * 3. Scoped: Operates in the development organization and verifies tenant isolation with a separate org.
 * 4. Realistic: Creates real courses, modules, lessons, memberships, and progress records.
 *
 * Usage:
 *   node scripts/seed-popular-courses.mjs
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

  console.log("🌱 Starting Popular Courses Development Seed...");
  console.log(`📡 Connecting to: ${connectionString.replace(/:[^:@]+@/, ":****@")}`);

  const pool = new pg.Pool({ connectionString });

  try {
    // -------------------------------------------------------------------------
    // 1. Resolve Target Organizations
    // -------------------------------------------------------------------------
    // Main Dev Org (AVANA Demo Organization or default first org)
    let mainOrgRes = await pool.query(
      "SELECT id, name, slug FROM organizations WHERE slug = 'avana-demo-organization' LIMIT 1",
    );
    if (mainOrgRes.rows.length === 0) {
      mainOrgRes = await pool.query(
        "SELECT id, name, slug FROM organizations ORDER BY created_at ASC LIMIT 1",
      );
    }
    if (mainOrgRes.rows.length === 0) {
      // Create dev org if database is totally empty
      const newOrgId = randomUUID();
      mainOrgRes = await pool.query(
        "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id, name, slug",
        [newOrgId, "AVANA Demo Organization", "avana-demo-organization"],
      );
    }
    const mainOrg = mainOrgRes.rows[0];
    console.log(`🏢 Main Dev Organization: "${mainOrg.name}" (${mainOrg.id})`);

    // Secondary Org (for Tenant Isolation Test)
    let otherOrgRes = await pool.query(
      "SELECT id, name, slug FROM organizations WHERE slug = 'avana-demo' OR slug = 'other-test-org' LIMIT 1",
    );
    if (otherOrgRes.rows.length === 0 || otherOrgRes.rows[0].id === mainOrg.id) {
      const otherOrgId = randomUUID();
      otherOrgRes = await pool.query(
        "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id, name, slug",
        [otherOrgId, "سازمان آزمایشی دیگر", "other-test-org"],
      );
    }
    const otherOrg = otherOrgRes.rows[0];
    console.log(`🏢 Secondary Organization (Isolation Test): "${otherOrg.name}" (${otherOrg.id})`);

    // -------------------------------------------------------------------------
    // 2. Create / Reuse Test Users (10 users for main org, 2 users for other org)
    // -------------------------------------------------------------------------
    const testUserSpecs = [
      { name: "Popular Test User 01", email: "popular_user_01@avana.dev" },
      { name: "Popular Test User 02", email: "popular_user_02@avana.dev" },
      { name: "Popular Test User 03", email: "popular_user_03@avana.dev" },
      { name: "Popular Test User 04", email: "popular_user_04@avana.dev" },
      { name: "Popular Test User 05", email: "popular_user_05@avana.dev" },
      { name: "Popular Test User 06", email: "popular_user_06@avana.dev" },
      { name: "Popular Test User 07", email: "popular_user_07@avana.dev" },
      { name: "Popular Test User 08", email: "popular_user_08@avana.dev" },
      { name: "Popular Test User 09", email: "popular_user_09@avana.dev" },
      { name: "Popular Test User 10", email: "popular_user_10@avana.dev" },
      { name: "Other Org Test User 01", email: "other_org_user_01@avana.dev" },
      { name: "Other Org Test User 02", email: "other_org_user_02@avana.dev" },
    ];

    const users = [];
    for (const spec of testUserSpecs) {
      const res = await pool.query(
        `INSERT INTO users (id, email, name, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
         RETURNING id, email, name`,
        [randomUUID(), spec.email, spec.name],
      );
      const user = res.rows[0];
      users.push(user);

      // Add to organization membership (main org for 01-10, other org for 11-12)
      const targetOrgId = spec.email.startsWith("other_org") ? otherOrg.id : mainOrg.id;
      await pool.query(
        `INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at)
         VALUES ($1, $2, $3, 'student', NOW(), NOW())
         ON CONFLICT (organization_id, user_id) DO NOTHING`,
        [randomUUID(), targetOrgId, user.id],
      );
    }
    console.log(`👥 Created/Reused ${users.length} test users.`);

    // -------------------------------------------------------------------------
    // 3. Define the 8 Main Test Courses + 1 Other-Org Course
    // -------------------------------------------------------------------------
    const mainCoursesSpec = [
      {
        name: "تست محبوبیت 01 — فارماکولوژی",
        subject: "داروسازی",
        modules: [
          {
            title: "فصل ۱: اصول و مفاهیم پایه فارماکولوژی",
            lessons: [
              { title: "درس ۱: فارماکوکینتیک و جذب دارو", minutes: 15 },
              { title: "درس ۲: متابولیسم کبدی و کلیرانس کلیوی", minutes: 20 },
            ],
          },
        ],
        // Target engagement: 10 additions, 8 active, 6 completed
        addCount: 10,
        activeCount: 8,
        completedCount: 6,
      },
      {
        name: "تست محبوبیت 02 — فیزیولوژی",
        subject: "فیزیولوژی",
        modules: [
          {
            title: "فصل ۱: فیزیولوژی سلول و انتقال غشایی",
            lessons: [
              { title: "درس ۱: پتانسیل عمل و کانال‌های یونی", minutes: 12 },
              { title: "درس ۲: انتقال پیام عصبی-عضلانی", minutes: 18 },
            ],
          },
        ],
        // Target engagement: 8 additions, 6 active, 4 completed
        addCount: 8,
        activeCount: 6,
        completedCount: 4,
      },
      {
        name: "تست محبوبیت 03 — میکروب‌شناسی",
        subject: "میکروبیولوژی",
        modules: [
          {
            title: "فصل ۱: باکتری‌شناسی عمومی",
            lessons: [
              { title: "درس ۱: ساختار دیواره سلولی باکتری‌ها", minutes: 10 },
              { title: "درس ۲: مکانیسم مقاومت آنتی‌بیوتیکی", minutes: 15 },
            ],
          },
        ],
        // Target engagement: 7 additions, 5 active, 3 completed
        addCount: 7,
        activeCount: 5,
        completedCount: 3,
      },
      {
        name: "تست محبوبیت 04 — شیمی دارویی",
        subject: "شیمی دارویی",
        modules: [
          {
            title: "فصل ۱: ساختار و فعالیت بیولوژیکی (SAR)",
            lessons: [
              { title: "درس ۱: پیوندهای دارویی با گیرنده", minutes: 14 },
              { title: "درس ۲: ایزواستریسم در طراحی دارو", minutes: 16 },
            ],
          },
        ],
        // Target engagement: 6 additions, 5 active, 3 completed
        addCount: 6,
        activeCount: 5,
        completedCount: 3,
      },
      {
        name: "تست محبوبیت 05 — فارماکوگنوزی",
        subject: "گیاهان دارویی",
        modules: [
          {
            title: "فصل ۱: متابولیت‌های ثانویه گیاهی",
            lessons: [
              { title: "درس ۱: آلکالوئیدها و فلاونوئیدها", minutes: 12 },
              { title: "درس ۲: گلیکوزیدهای قلبی گیاهی", minutes: 14 },
            ],
          },
        ],
        // Target engagement: 5 additions, 4 active, 2 completed
        addCount: 5,
        activeCount: 4,
        completedCount: 2,
      },
      {
        name: "تست محبوبیت 06 — انگل‌شناسی",
        subject: "انگل‌شناسی",
        modules: [
          {
            title: "فصل ۱: تک‌یاخته‌های پزشکی",
            lessons: [
              { title: "درس ۱: آمیب‌ها و فلاژله‌های روده‌ای", minutes: 10 },
              { title: "درس ۲: لیشمانیا و مالاریا", minutes: 20 },
            ],
          },
        ],
        // Target engagement: 4 additions, 3 active, 2 completed
        addCount: 4,
        activeCount: 3,
        completedCount: 2,
      },
      {
        name: "تست محبوبیت 07 — آناتومی",
        subject: "آناتومی",
        modules: [
          {
            title: "فصل ۱: آناتومی سیستم عصبی مرکزی",
            lessons: [
              { title: "درس ۱: ساختار مغز و ساقه مغز", minutes: 15 },
              { title: "درس ۲: نخاع و اعصاب محیطی", minutes: 15 },
            ],
          },
        ],
        // Target engagement: 3 additions, 2 active, 1 completed
        addCount: 3,
        activeCount: 2,
        completedCount: 1,
      },
      {
        name: "تست محبوبیت 08 — بیوشیمی",
        subject: "بیوشیمی",
        modules: [
          {
            title: "فصل ۱: مسیرهای متابولیک انرژی",
            lessons: [
              { title: "درس ۱: گلیکولیز و چرخه کربس", minutes: 18 },
              { title: "درس ۲: فسفوریلاسیون اکسیداتیو", minutes: 16 },
            ],
          },
        ],
        // Target engagement: 2 additions, 2 active, 1 completed
        addCount: 2,
        activeCount: 2,
        completedCount: 1,
      },
    ];

    const otherOrgCourseSpec = {
      name: "تست محبوبیت — سازمان دیگر",
      subject: "سازمان مجزا",
      modules: [
        {
          title: "فصل آزمایشی سازمان دیگر",
          lessons: [
            { title: "درس آزمایشی ایزولاسیون", minutes: 10 },
          ],
        },
      ],
      // Very high engagement (11 additions, 10 active, 8 completed)
      addCount: 11,
      activeCount: 10,
      completedCount: 8,
    };

    // -------------------------------------------------------------------------
    // 4. Upsert Courses, Modules, Lessons, Memberships & Progress
    // -------------------------------------------------------------------------
    async function seedSingleCourse(courseSpec, organizationId, userPool) {
      // 4.1 Course
      let courseRes = await pool.query(
        "SELECT id, name, organization_id FROM courses WHERE organization_id = $1 AND name = $2 LIMIT 1",
        [organizationId, courseSpec.name],
      );

      let courseId;
      if (courseRes.rows.length === 0) {
        courseId = randomUUID();
        await pool.query(
          `INSERT INTO courses (id, organization_id, name, subject, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW(), NULL)`,
          [courseId, organizationId, courseSpec.name, courseSpec.subject],
        );
      } else {
        courseId = courseRes.rows[0].id;
        await pool.query(
          `UPDATE courses
           SET subject = $1, deleted_at = NULL, updated_at = NOW()
           WHERE id = $2`,
          [courseSpec.subject, courseId],
        );
      }

      // 4.2 Modules & Lessons
      const lessonIds = [];
      for (let mIdx = 0; mIdx < courseSpec.modules.length; mIdx++) {
        const modSpec = courseSpec.modules[mIdx];
        let modRes = await pool.query(
          "SELECT id FROM modules WHERE course_id = $1 AND title = $2 LIMIT 1",
          [courseId, modSpec.title],
        );
        let moduleId;
        if (modRes.rows.length === 0) {
          moduleId = randomUUID();
          await pool.query(
            `INSERT INTO modules (id, course_id, title, description, sort_order, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
            [moduleId, courseId, modSpec.title, modSpec.title, mIdx + 1],
          );
        } else {
          moduleId = modRes.rows[0].id;
        }

        for (let lIdx = 0; lIdx < modSpec.lessons.length; lIdx++) {
          const lesSpec = modSpec.lessons[lIdx];
          let lesRes = await pool.query(
            "SELECT id FROM lessons WHERE module_id = $1 AND title = $2 LIMIT 1",
            [moduleId, lesSpec.title],
          );
          let lessonId;
          if (lesRes.rows.length === 0) {
            lessonId = randomUUID();
            await pool.query(
              `INSERT INTO lessons (id, module_id, title, content_type, content_markdown, sort_order, estimated_minutes, publication_status, created_at, updated_at)
               VALUES ($1, $2, $3, 'markdown', $4, $5, $6, 'published', NOW(), NOW())`,
              [
                lessonId,
                moduleId,
                lesSpec.title,
                `# ${lesSpec.title}\n\nمحتوای آموزشی آزمایشی برای درس ${lesSpec.title}.`,
                lIdx + 1,
                lesSpec.minutes,
              ],
            );
          } else {
            lessonId = lesRes.rows[0].id;
          }
          lessonIds.push(lessonId);
        }
      }

      // 4.3 Course Memberships (Additions)
      // Reset previous memberships for this course to ensure deterministic score
      await pool.query("DELETE FROM course_memberships WHERE course_id = $1", [courseId]);
      for (let i = 0; i < courseSpec.addCount && i < userPool.length; i++) {
        const u = userPool[i];
        await pool.query(
          `INSERT INTO course_memberships (id, course_id, user_id, role, created_at, updated_at)
           VALUES ($1, $2, $3, 'student', NOW(), NOW())
           ON CONFLICT (course_id, user_id) DO NOTHING`,
          [randomUUID(), courseId, u.id],
        );
      }

      // 4.4 Lesson Progress (Active & Completed users)
      // Reset previous progress for these lessons
      if (lessonIds.length > 0) {
        await pool.query(
          "DELETE FROM lesson_progress WHERE lesson_id = ANY($1::uuid[])",
          [lessonIds],
        );

        const primaryLessonId = lessonIds[0];
        for (let i = 0; i < courseSpec.activeCount && i < userPool.length; i++) {
          const u = userPool[i];
          const isCompleted = i < courseSpec.completedCount;
          await pool.query(
            `INSERT INTO lesson_progress (id, user_id, lesson_id, completed, completed_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
             ON CONFLICT (user_id, lesson_id) DO UPDATE
             SET completed = EXCLUDED.completed, completed_at = EXCLUDED.completed_at, updated_at = NOW()`,
            [
              randomUUID(),
              u.id,
              primaryLessonId,
              isCompleted,
              isCompleted ? new Date().toISOString() : null,
            ],
          );
        }
      }

      return courseId;
    }

    // Seed Main Org 8 Courses
    console.log("📚 Seeding 8 Popular Courses for Main Organization...");
    for (const cSpec of mainCoursesSpec) {
      await seedSingleCourse(cSpec, mainOrg.id, users.slice(0, 10));
    }

    // Seed Other Org Course
    console.log("🔒 Seeding High-Popularity Isolation Course for Secondary Organization...");
    await seedSingleCourse(otherOrgCourseSpec, otherOrg.id, users);

    // -------------------------------------------------------------------------
    // 5. Inspect and Print Real Database Popularity Query Results
    // -------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log(`📊 POPULAR COURSES QUERY RESULTS FOR: "${mainOrg.name}" (${mainOrg.id})`);
    console.log("================================================================================");

    const popularQuery = `
      SELECT 
        c.id,
        c.name,
        c.subject,
        COALESCE(m_stat.added_users, 0) AS added_users,
        COALESCE(p_stat.active_users, 0) AS active_users,
        COALESCE(p_stat.completed_users, 0) AS completed_users,
        (
          COALESCE(m_stat.added_users, 0) * 5 +
          COALESCE(p_stat.active_users, 0) * 3 +
          COALESCE(p_stat.completed_users, 0) * 2
        ) AS score,
        c.created_at AS "createdAt"
      FROM courses c
      LEFT JOIN (
        SELECT course_id, COUNT(DISTINCT user_id) AS added_users
        FROM course_memberships
        GROUP BY course_id
      ) m_stat ON m_stat.course_id = c.id
      LEFT JOIN (
        SELECT 
          m.course_id,
          COUNT(DISTINCT lp.user_id) AS active_users,
          COUNT(DISTINCT CASE WHEN lp.completed = true THEN lp.user_id END) AS completed_users
        FROM lesson_progress lp
        JOIN lessons l ON l.id = lp.lesson_id AND l.deleted_at IS NULL
        JOIN modules m ON m.id = l.module_id AND m.deleted_at IS NULL
        GROUP BY m.course_id
      ) p_stat ON p_stat.course_id = c.id
      WHERE c.organization_id = $1
        AND c.deleted_at IS NULL
      ORDER BY 
        (
          COALESCE(m_stat.added_users, 0) * 5 +
          COALESCE(p_stat.active_users, 0) * 3 +
          COALESCE(p_stat.completed_users, 0) * 2
        ) DESC,
        c.created_at DESC,
        c.name ASC,
        c.id ASC
      LIMIT 8;
    `;

    const rankingRes = await pool.query(popularQuery, [mainOrg.id]);
    console.table(
      rankingRes.rows.map((row, idx) => ({
        Rank: idx + 1,
        Course: row.name,
        Subject: row.subject,
        Score: Number(row.score),
        "Added Users (x5)": Number(row.added_users),
        "Active Users (x3)": Number(row.active_users),
        "Completed (x2)": Number(row.completed_users),
      })),
    );

    // Verify Tenant Isolation
    const leakCheck = rankingRes.rows.some((r) => r.name.includes("سازمان دیگر"));
    console.log("\n--------------------------------------------------------------------------------");
    console.log(`🔐 Tenant Isolation Verification:`);
    if (!leakCheck) {
      console.log(`✅ SUCCESS: Secondary org course was properly excluded from Main Org ranking!`);
    } else {
      console.error(`❌ FAILURE: Secondary org course leaked into Main Org ranking!`);
    }
    console.log("================================================================================\n");

    console.log("🎉 Seed completed successfully and idempotently.");
  } catch (error) {
    console.error("❌ Seed failed with error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
