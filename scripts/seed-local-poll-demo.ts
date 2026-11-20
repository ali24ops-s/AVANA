/**
 * Script to create and verify a realistic, persistent demo survey
 * «بررسی تجربه کاربران از AVANA» in the local development database.
 */

import { loadMonorepoEnv } from "@avana/config";
import { asUserId, asOrganizationId, type Actor } from "@avana/domain";
import { createDbClient } from "@avana/database/client";
import { DrizzlePollStore, DrizzlePollResponseStore } from "../apps/api/src/modules/studio/poll-stores.js";
import { PollService } from "../apps/api/src/modules/studio/poll-service.js";

loadMonorepoEnv();

const LOCAL_DB_URL = process.env.DATABASE_URL || "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

async function run() {
  console.log("-------------------------------------------------------------------");
  console.log("  AVANA Local Poll Seeder: بررسی تجربه کاربران از AVANA");
  console.log("-------------------------------------------------------------------");

  // 1. Safety check
  const urlObj = new URL(LOCAL_DB_URL);
  const dbName = urlObj.pathname.replace(/^\//, "");
  console.log(`[Safety Check] Host: ${urlObj.host}, Database: ${dbName}`);

  if (dbName === "avana_poll_e2e_test_pg") {
    throw new Error("Safety violation: target database cannot be the temporary E2E test database.");
  }
  if (!urlObj.hostname.includes("127.0.0.1") && !urlObj.hostname.includes("localhost")) {
    throw new Error(`Safety violation: target database must be local host, got: ${urlObj.hostname}`);
  }

  const { db, close } = createDbClient(LOCAL_DB_URL);

  try {
    const pollStore = new DrizzlePollStore(db);
    const responseStore = new DrizzlePollResponseStore(db);
    const pollService = new PollService({
      pollStore,
      responseStore,
      hmacSecret: process.env.POLL_SALT_SECRET || "avana_default_poll_salt_secret_key_2026",
    });

    const adminActor: Actor = {
      userId: asUserId("79bda286-08a4-4a16-9340-4106864e0732"),
      role: "platform_admin",
      globalRole: "platform_admin",
      memberships: [
        {
          organizationId: asOrganizationId("389575c5-7563-4242-854a-9af1a988eb3a"),
          role: "organization_admin",
        },
      ],
    };

    const targetSlug = "avana-user-experience";

    // 2. Check if poll already exists to prevent duplicates
    let existingPoll = await pollStore.getBySlug(targetSlug);
    if (!existingPoll) {
      // Also check by title
      const allPolls = await pollStore.list();
      existingPoll = allPolls.find((p) => p.title === "بررسی تجربه کاربران از AVANA") || null;
    }

    let pollId: string;
    let pollSlug: string;

    if (existingPoll) {
      console.log(`[Existing Poll Found] ID: ${existingPoll.id}, Slug: ${existingPoll.slug}, Status: ${existingPoll.status}`);
      pollId = existingPoll.id;
      pollSlug = existingPoll.slug;
    } else {
      console.log("[Create Poll] Creating new survey «بررسی تجربه کاربران از AVANA»...");
      const createdPoll = await pollService.createPoll(adminActor, {
        organizationId: "389575c5-7563-4242-854a-9af1a988eb3a",
        slug: targetSlug,
        title: "بررسی تجربه کاربران از AVANA",
        description:
          "با پاسخ به این نظرسنجی کوتاه به ما کمک کنید تجربه یادگیری در AVANA را بهتر کنیم و امکانات آینده را متناسب با نیازهای شما توسعه دهیم.",
        settings: {
          allowAnonymous: true,
          showResultsAfterVote: true,
          requireAllQuestions: true,
        },
      });

      pollId = createdPoll.id;
      pollSlug = createdPoll.slug;
      console.log(`[Create Poll] Created poll with ID: ${pollId}, Slug: ${pollSlug}`);

      // Add Question 1: Single choice
      console.log("[Create Question 1] بیشتر از کدام بخش AVANA استفاده میکنی؟");
      await pollService.createQuestion(adminActor, pollId, {
        questionText: "بیشتر از کدام بخش AVANA استفاده میکنی؟",
        questionType: "single_choice",
        isRequired: true,
        sortOrder: 1,
        options: [
          { optionText: "درسنامه‌ها", sortOrder: 1 },
          { optionText: "فلش‌کارت‌ها", sortOrder: 2 },
          { optionText: "آزمون‌ها", sortOrder: 3 },
          { optionText: "خلاصه‌های مرور", sortOrder: 4 },
          { optionText: "نقشه ذهنی", sortOrder: 5 },
        ],
      });

      // Add Question 2: Multiple choice
      console.log("[Create Question 2] کدام امکانات AVANA برایت کاربردیتر هستند؟ (امکان انتخاب چند گزینه)");
      await pollService.createQuestion(adminActor, pollId, {
        questionText: "کدام امکانات AVANA برایت کاربردیتر هستند؟ (امکان انتخاب چند گزینه)",
        questionType: "multiple_choice",
        isRequired: true,
        sortOrder: 2,
        options: [
          { optionText: "تولید محتوای آموزشی با هوش مصنوعی", sortOrder: 1 },
          { optionText: "فلش‌کارت و مرور هوشمند", sortOrder: 2 },
          { optionText: "آزمون و ارزیابی", sortOrder: 3 },
          { optionText: "خلاصه‌سازی مطالب", sortOrder: 4 },
          { optionText: "نقشه ذهنی", sortOrder: 5 },
          { optionText: "دستیار هوشمند آموزشی", sortOrder: 6 },
        ],
      });

      // Add Question 3: Short text
      console.log("[Create Question 3] چه ویژگی یا امکانی را دوست داری در نسخههای آینده AVANA اضافه کنیم؟");
      await pollService.createQuestion(adminActor, pollId, {
        questionText: "چه ویژگی یا امکانی را دوست داری در نسخههای آینده AVANA اضافه کنیم؟",
        questionType: "short_text",
        isRequired: true,
        sortOrder: 3,
      });

      // Add Question 4: Rating scale 1 to 5
      console.log("[Create Question 4] در مجموع چقدر از تجربه استفاده از AVANA رضایت داری؟");
      await pollService.createQuestion(adminActor, pollId, {
        questionText: "در مجموع چقدر از تجربه استفاده از AVANA رضایت داری؟",
        questionType: "single_choice",
        isRequired: true,
        sortOrder: 4,
        options: [
          { optionText: "۱ - خیلی ضعیف", sortOrder: 1 },
          { optionText: "۲ - ضعیف", sortOrder: 2 },
          { optionText: "۳ - متوسط", sortOrder: 3 },
          { optionText: "۴ - خوب", sortOrder: 4 },
          { optionText: "۵ - عالی", sortOrder: 5 },
        ],
      });

      // Publish Poll
      console.log("[Publish Poll] Publishing poll...");
      await pollService.publishPoll(adminActor, pollId);
      console.log("[Publish Poll] Poll published successfully.");
    }

    // Load poll questions and options mapping
    const questions = await pollStore.getQuestions(pollId);
    console.log(`[Poll Structure] Total questions: ${questions.length}`);

    const q1 = questions.find((q) => q.questionText.includes("بخش"))!;
    const q2 = questions.find((q) => q.questionText.includes("امکانات"))!;
    const q3 = questions.find((q) => q.questionText.includes("آینده"))!;
    const q4 = questions.find((q) => q.questionText.includes("رضایت"))!;

    const q1Options = Object.fromEntries(q1.options!.map((o) => [o.optionText, o.id]));
    const q2Options = Object.fromEntries(q2.options!.map((o) => [o.optionText, o.id]));
    const q4Options = Object.fromEntries(q4.options!.map((o) => [o.optionText, o.id]));

    // Check existing responses
    const currentResponseCount = await responseStore.countByPoll(pollId);
    console.log(`[Current Responses] Existing responses: ${currentResponseCount}`);

    if (currentResponseCount === 0) {
      console.log("[Seeding Responses] Submitting 10 realistic, diverse responses...");

      const participants = [
        {
          name: "کاربر ۰۱",
          pid: "local_demo_participant_01_token",
          q1: "درسنامه‌ها",
          q2: ["تولید محتوای آموزشی با هوش مصنوعی", "خلاصه‌سازی مطالب"],
          q3: "افزودن کوئیزهای تعاملی و تمرین‌های مرحله‌ای در حین مطالعه درسنامه‌ها",
          q4: "۵ - عالی",
        },
        {
          name: "کاربر ۰۲",
          pid: "local_demo_participant_02_token",
          q1: "فلش‌کارت‌ها",
          q2: ["فلش‌کارت و مرور هوشمند", "دستیار هوشمند آموزشی"],
          q3: "امکان تنظیم فواصل مرور هوشمند (الگوریتم تکرار فاصله‌دار) بر اساس درجه سختی لغات",
          q4: "۴ - خوب",
        },
        {
          name: "کاربر ۰۳",
          pid: "local_demo_participant_03_token",
          q1: "آزمون‌ها",
          q2: ["آزمون و ارزیابی", "نقشه ذهنی"],
          q3: "شبیه‌سازی آزمون‌های جامع زمان‌دار با تحلیل دقیق نقاط ضعف و قوت پس از آزمون",
          q4: "۳ - متوسط",
        },
        {
          name: "کاربر ۰۴",
          pid: "local_demo_participant_04_token",
          q1: "خلاصه‌های مرور",
          q2: ["خلاصه‌سازی مطالب", "تولید محتوای آموزشی با هوش مصنوعی"],
          q3: "امکان هایلایت کردن نکات مهم در خلاصه‌ها و تبدیل مستقیم آن‌ها به فلش‌کارت",
          q4: "۵ - عالی",
        },
        {
          name: "کاربر ۰۵",
          pid: "local_demo_participant_05_token",
          q1: "نقشه ذهنی",
          q2: ["نقشه ذهنی", "دستیار هوشمند آموزشی"],
          q3: "امکان خروجی گرفتن گرافیکی از نقشه‌های ذهنی با فرمت SVG باکیفیت و PDF",
          q4: "۴ - خوب",
        },
        {
          name: "کاربر ۰۶",
          pid: "local_demo_participant_06_token",
          q1: "درسنامه‌ها",
          q2: ["تولید محتوای آموزشی با هوش مصنوعی", "آزمون و ارزیابی"],
          q3: "بهبود نمایش فرمول‌های ریاضی و نمودارهای علمی در نسخه موبایل درسنامه‌ها",
          q4: "۲ - ضعیف",
        },
        {
          name: "کاربر ۰۷",
          pid: "local_demo_participant_07_token",
          q1: "فلش‌کارت‌ها",
          q2: ["فلش‌کارت و مرور هوشمند", "نقشه ذهنی"],
          q3: "تولید خودکار صوت و تلفظ هوشمند برای فلش‌کارت‌های زبان انگلیسی و تخصصی",
          q4: "۴ - خوب",
        },
        {
          name: "کاربر ۰۸",
          pid: "local_demo_participant_08_token",
          q1: "آزمون‌ها",
          q2: ["آزمون و ارزیابی", "خلاصه‌سازی مطالب"],
          q3: "امکان دسته‌بندی موضوعی سوالات غلط در قالب یک آزمون جبرانی اختصاصی",
          q4: "۵ - عالی",
        },
        {
          name: "کاربر ۰۹",
          pid: "local_demo_participant_09_token",
          q1: "نقشه ذهنی",
          q2: ["نقشه ذهنی", "فلش‌کارت و مرور هوشمند"],
          q3: "امکان رسم آزاد و اضافه کردن یادداشت‌های صوتی به گره‌های نقشه ذهنی",
          q4: "۳ - متوسط",
        },
        {
          name: "کاربر ۱۰",
          pid: "local_demo_participant_10_token",
          q1: "درسنامه‌ها",
          q2: ["دستیار هوشمند آموزشی", "تولید محتوای آموزشی با هوش مصنوعی"],
          q3: "امکان گفتگوی مستقیم صوتی با دستیار هوشمند برای رفع اشکال سریع مباحث درسی",
          q4: "۱ - خیلی ضعیف",
        },
      ];

      for (let i = 0; i < participants.length; i++) {
        const p = participants[i];
        const answersPayload: Record<string, any> = {
          [q1.id]: q1Options[p.q1],
          [q2.id]: p.q2.map((optLabel) => q2Options[optLabel]),
          [q3.id]: p.q3,
          [q4.id]: q4Options[p.q4],
        };

        const result = await pollService.submitResponse(
          pollSlug,
          { answers: answersPayload },
          p.pid,
        );

        console.log(`  [Response ${i + 1}/10] Submitted for ${p.name} -> ResponseID: ${result.responseId}`);
      }
    } else {
      console.log(`[Responses Already Present] Poll already has ${currentResponseCount} responses.`);
    }

    // 3. Verification & Metrics Audit
    console.log("\n===================================================================");
    console.log("  VERIFICATION & STATISTICAL AUDIT");
    console.log("===================================================================");

    const results = await pollService.getPollResultsById(pollId, adminActor);
    console.log(`Total Responses in DB: ${results.totalResponses}`);

    for (const qr of results.questions) {
      console.log(`\n[Question] ${qr.questionText} (${qr.questionType})`);
      if (qr.options) {
        for (const opt of qr.options) {
          console.log(`  - ${opt.optionText}: ${opt.voteCount} رأی (${opt.percentage.toFixed(1)}%)`);
        }
      }
      if (qr.textAnswers) {
        console.log(`  - Text responses count: ${qr.textAnswers.length}`);
        qr.textAnswers.forEach((ans, i) => {
          console.log(`    ${i + 1}. "${ans}"`);
        });
      }
    }

    // 4. Verify CSV Export
    const csvExport = await pollService.exportPollResultsCsv(adminActor, pollId);
    console.log(`\n[CSV Export Test] File: ${csvExport.filename}, Length: ${csvExport.csvContent.length} chars, Starts with UTF-8 BOM: ${csvExport.csvContent.startsWith("\uFEFF")}`);

    console.log("\n===================================================================");
    console.log("  PERSISTENT DEMO READY FOR UI TESTING");
    console.log("===================================================================");
    console.log(`Database:               ${dbName}`);
    console.log(`Poll ID:                ${pollId}`);
    console.log(`Poll Slug:              ${pollSlug}`);
    console.log(`Public Survey URL:      http://localhost:5173/polls/${pollSlug}`);
    console.log(`Studio Polls List URL:  http://localhost:5173/studio/polls`);
    console.log(`Studio Edit URL:        http://localhost:5173/studio/polls/${pollId}/edit`);
    console.log(`Studio Results URL:     http://localhost:5173/studio/polls/${pollId}/results`);
    console.log("===================================================================\n");
  } finally {
    await close();
  }
}

run().catch((err) => {
  console.error("FATAL ERROR during seeding:", err);
  process.exit(1);
});
