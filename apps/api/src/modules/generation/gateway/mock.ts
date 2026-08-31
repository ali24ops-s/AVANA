/**
 * MockModelGateway — config-gated fake provider (PR6-4 & Phase 2).
 *
 * No real AI provider is used. This mock returns a deterministic,
 * schema-valid JSON payload for each supported generation type, respecting
 * the `type` and budget constraints requested in the prompt. It records fake `usage`,
 * `model`, and `correlationId`. No network calls.
 *
 * The factory (gateway/index.ts) selects this provider when `AI_PROVIDER` is
 * unset or `"mock"`, and throws `unprocessable` if a real provider is
 * configured but not yet implemented — a safe cliff so we never silently
 * fall back in production.
 */

import type { ModelGateway, CompletionRequest } from "./types.js";

/**
 * Detect the requested generation type from the prompt text.
 *
 * The mock is deterministic: it looks for the requested type token within
 * the last user message (the structured-output contract embedded in the
 * prompt). Defaults to `lesson`.
 */
function detectType(req: CompletionRequest): string {
  const schemaType = (req.jsonSchema as { type?: string } | undefined)?.type;
  if (schemaType) {
    const normalized = String(schemaType).toLowerCase();
    if (
      [
        "content_plan",
        "outline",
        "sessions_batch",
        "session",
        "flashcards_batch",
        "flashcard",
        "flashcard_topic",
        "flashcard_supplemental",
        "quizzes_batch",
        "quiz",
        "quiz_topic",
        "quiz_supplemental",
        "recommendation",
        "review_summary",
        "lesson",
      ].includes(normalized)
    ) {
      return normalized;
    }
  }

  const userMessages = req.messages.filter((m) => m.role === "user");
  const lastUser = userMessages[userMessages.length - 1];
  const haystack = lastUser?.content ?? "";

  const match = haystack.match(/generating a "([^"]+)" artifact/i);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }

  if (
    haystack.includes("CONTENT PLANNING") ||
    haystack.includes("OUTLINE EXTRACTION") ||
    haystack.includes("Table of Contents") ||
    haystack.includes('"content_plan"') ||
    haystack.includes('"outline"')
  ) {
    return "content_plan";
  }
  if (
    haystack.includes("SUPPLEMENTAL FLASHCARDS") ||
    haystack.includes("supplemental flashcards")
  ) {
    return "flashcard_supplemental";
  }
  if (
    haystack.includes("SUPPLEMENTAL QUIZ") ||
    haystack.includes("supplemental quiz")
  ) {
    return "quiz_supplemental";
  }
  if (
    haystack.includes("BATCHED LESSON SESSIONS") ||
    haystack.includes("sessions_batch") ||
    haystack.includes("BATCH OF SESSIONS")
  ) {
    return "sessions_batch";
  }
  if (
    haystack.includes("DEEP TOPIC TEACHING") ||
    haystack.includes("session") ||
    haystack.includes("deep educational lesson")
  ) {
    return "session";
  }
  if (
    haystack.includes("BATCHED ATOMIC FLASHCARDS") ||
    haystack.includes("flashcards_batch") ||
    haystack.includes("BATCH OF FLASHCARDS")
  ) {
    return "flashcards_batch";
  }
  if (haystack.includes("flashcard")) {
    return "flashcard";
  }
  if (
    haystack.includes("BATCHED MULTIPLE-CHOICE QUIZZES") ||
    haystack.includes("quizzes_batch") ||
    haystack.includes("BATCH OF QUIZZES")
  ) {
    return "quizzes_batch";
  }
  if (haystack.includes("quiz")) {
    return "quiz";
  }
  if (haystack.includes("recommendation")) {
    return "recommendation";
  }
  if (
    haystack.includes("REVIEW SUMMARY") ||
    haystack.includes("review_summary") ||
    haystack.includes("خلاصه مروری")
  ) {
    return "review_summary";
  }
  return "lesson";
}

/**
 * Build a deterministic, schema-valid payload for a generation type.
 */
function buildPayload(type: string, promptText = ""): unknown {
  switch (type) {
    case "content_plan":
    case "outline": {
      const targetMatch =
        promptText.match(/Target session count:\s*(\d+)/i) ||
        promptText.match(/Extract at least\s*(\d+)\s*sessions/i) ||
        promptText.match(/containing\s+(\d+)\s+to\s+(\d+)/i);
      const chunkIdsMatch = promptText.match(
        /AVAILABLE CHUNK IDs:\s*(\[[^\]]*\])/i,
      );
      let availableChunkIds: string[] = [];
      if (chunkIdsMatch && chunkIdsMatch[1]) {
        try {
          availableChunkIds = JSON.parse(chunkIdsMatch[1]);
        } catch {
          // ignore
        }
      }

      const targetCount = targetMatch ? parseInt(targetMatch[1], 10) : 2;
      const count = Math.max(1, Math.min(18, targetCount));

      const targetCardsMatch =
        promptText.match(/target:\s*(\d+)\s*cards/i) ||
        promptText.match(/targetFlashcardCount.*?:\s*(\d+)/i);
      const targetQuizMatch =
        promptText.match(/target:\s*(\d+)\s*questions/i) ||
        promptText.match(/targetQuizCount.*?:\s*(\d+)/i);

      const targetFlashcards = targetCardsMatch
        ? parseInt(targetCardsMatch[1], 10)
        : count === 1
          ? 3
          : count >= 8
            ? 12
            : 8;

      const targetQuiz = targetQuizMatch
        ? parseInt(targetQuizMatch[1], 10)
        : count === 1
          ? 3
          : count >= 8
            ? 10
            : 6;

      const sessions = Array.from({ length: count }, (_, i) => {
        const chunksForThisTopic =
          availableChunkIds.length > 0
            ? availableChunkIds.filter((_, idx) => idx % count === i)
            : [];
        return {
          index: i,
          title: `جلسه ${i + 1}: مبحث شماره ${i + 1} - تحلیل و آموزش مفاهیم`,
          description: `بررسی جامع و آموزشی سرفصل شماره ${i + 1} بر اساس داده‌های منبع`,
          coreConcepts: [
            {
              id: `concept-${i + 1}-1`,
              name: `مفهوم و مکانیسم اصلی جلسه ${i + 1}`,
              category: "mechanism" as const,
              description: `توضیح مکانیسم فیزیولوژیک و دارویی جلسه ${i + 1}`,
              sourceChunkIds: chunksForThisTopic,
            },
            {
              id: `concept-${i + 1}-2`,
              name: `اندیکاسیون و کاربرد بالینی جلسه ${i + 1}`,
              category: "indication" as const,
              description: `بررسی موارد مصرف و دوز درمانی جلسه ${i + 1}`,
              sourceChunkIds: chunksForThisTopic,
            },
          ],
          relevantChunkIds:
            chunksForThisTopic.length > 0
              ? chunksForThisTopic
              : availableChunkIds,
          targetFlashcardCount: targetFlashcards,
          targetQuizCount: targetQuiz,
        };
      });

      const sourceTopics = Array.from({ length: count }, (_, i) => ({
        id: `source-topic-${i + 1}`,
        title: `بخش موضوعی ${i + 1}: مفاهیم رفرنس`,
        description: `شرح سرفصل‌های اصلی مبحث ${i + 1}`,
        relevantChunkIds: sessions[i].relevantChunkIds,
      }));

      const highYieldFacts = Array.from({ length: count * 2 }, (_, i) => ({
        id: `fact-${i + 1}`,
        fact: `نکته کلیدی و پرنکته شماره ${i + 1} مستند به منبع آموزشی`,
        category: "high_yield" as const,
        sessionIndex: Math.floor(i / 2),
      }));

      return {
        kind: "content_plan",
        moduleTitle: "سرفصل آموزشی استخراج‌شده از منبع",
        sourceTopics,
        sessions,
        highYieldFacts,
        outline: sessions.map((s) => ({
          title: s.title,
          description: s.description,
          relevantChunkIds: s.relevantChunkIds,
        })),
        citationChunkIds: availableChunkIds,
      };
    }
    case "sessions_batch": {
      const chunkIdsMatch = promptText.match(
        /AVAILABLE CHUNK IDs:\s*(\[[^\]]*\])/i,
      );
      let availableChunkIds: string[] = [];
      if (chunkIdsMatch && chunkIdsMatch[1]) {
        try {
          availableChunkIds = JSON.parse(chunkIdsMatch[1]);
        } catch {
          // ignore
        }
      }

      // Detect requested sessions from the prompt
      const sessionIndicesMatch = [...promptText.matchAll(/"index"\s*:\s*(\d+)/g)].map((m) =>
        parseInt(m[1], 10),
      );
      const sessionTitlesMatch = [...promptText.matchAll(/"title"\s*:\s*"([^"]+)"/g)].map(
        (m) => m[1],
      );

      const indices =
        sessionIndicesMatch.length > 0 ? sessionIndicesMatch : [0];

      const sessions = indices.map((idx, i) => {
        const title =
          sessionTitlesMatch[i] || `جلسه ${idx + 1}: مبحث شماره ${idx + 1} - تحلیل و آموزش مفاهیم`;
        return {
          index: idx,
          title,
          contentMarkdown: `# ${title}\n\n## ۱. تعاریف و مبانی\nاین مبحث به بررسی مکانیسم‌های سلولی، فیزیولوژیک و طبقه‌بندی‌های اصلی می‌پردازد.\n\n## ۲. جدول مقایسه‌ای داروها و اثرات فارماکودینامیک\n| نام دارو | مکانیسم اثر | کاربرد بالینی | عوارض جانبی |\n|---|---|---|---|\n| داروی خط اول | مهار اختصاصی آنزیم | درمان قطعی | سردرد، افت فشار |\n| داروی خط دوم | مسدودکننده گیرنده | درمان کمکی | تهوع، خواب‌آلودگی |\n\n## ۳. پاتوفیزیولوژی و درمان\nمکانیسم‌های فیزیوپاتولوژیک و پروتکل‌های درمانی بر اساس داده‌های منبع به طور دقیق سازمان‌دهی شده‌اند.`,
          citationChunkIds: availableChunkIds,
        };
      });

      return {
        kind: "sessions_batch",
        sessions,
        citationChunkIds: availableChunkIds,
      };
    }
    case "session": {
      const titleMatch = promptText.match(/DEEP TOPIC TEACHING.*?:\s*"([^"]+)"/i);
      const sessionTitle = titleMatch ? titleMatch[1] : "جلسه آموزشی استخراج‌شده";
      const chunkIdsMatch = promptText.match(
        /AVAILABLE CHUNK IDs:\s*(\[[^\]]*\])/i,
      );
      let availableChunkIds: string[] = [];
      if (chunkIdsMatch && chunkIdsMatch[1]) {
        try {
          availableChunkIds = JSON.parse(chunkIdsMatch[1]);
        } catch {
          // ignore
        }
      }

      return {
        kind: "session",
        title: sessionTitle,
        contentMarkdown: `# ${sessionTitle}\n\n## ۱. تعاریف و مبانی\nاین مبحث به بررسی مکانیسم‌های سلولی، فیزیولوژیک و طبقه‌بندی‌های اصلی می‌پردازد.\n\n## ۲. جدول مقایسه‌ای داروها و اثرات فارماکودینامیک\n| نام دارو | مکانیسم اثر | کاربرد بالینی | عوارض جانبی |\n|---|---|---|---|\n| داروی خط اول | مهار اختصاصی آنزیم | درمان قطعی | سردرد، افت فشار |\n| داروی خط دوم | مسدودکننده گیرنده | درمان کمکی | تهوع، خواب‌آلودگی |\n\n## ۳. پاتوفیزیولوژی و درمان\nمکانیسم‌های فیزیوپاتولوژیک و پروتکل‌های درمانی بر اساس داده‌های منبع به طور دقیق سازمان‌دهی شده‌اند.`,
        citationChunkIds: availableChunkIds,
      };
    }
    case "flashcards_batch": {
      const chunkIdsMatch = promptText.match(
        /AVAILABLE CHUNK IDs:\s*(\[[^\]]*\])/i,
      );
      let availableChunkIds: string[] = [];
      if (chunkIdsMatch && chunkIdsMatch[1]) {
        try {
          availableChunkIds = JSON.parse(chunkIdsMatch[1]);
        } catch {
          // ignore
        }
      }

      const sessionIndicesMatch = [
        ...new Set([
          ...[...promptText.matchAll(/\[SESSION INDEX\s+(\d+)\]/g)].map((m) =>
            parseInt(m[1], 10),
          ),
          ...[...promptText.matchAll(/"sessionIndex"\s*:\s*(\d+)/g)].map((m) =>
            parseInt(m[1], 10),
          ),
        ]),
      ];
      const indices = sessionIndicesMatch.length > 0 ? sessionIndicesMatch : [0];

      const countMatch =
        promptText.match(/Target Flashcards:\s*at least\s*(\d+)/i) ||
        promptText.match(/at least\s*(\d+)\s*high-yield/i) ||
        promptText.match(/target:\s*(\d+)/i);
      const cardsPerTopic = countMatch ? Math.max(2, parseInt(countMatch[1], 10)) : 10;

      const cards: Array<{
        sessionIndex: number;
        question: string;
        answer: string;
        explanation?: string;
        cardType?: string;
        difficulty?: string;
      }> = [];

      indices.forEach((sIdx) => {
        for (let i = 0; i < cardsPerTopic; i++) {
          cards.push({
            sessionIndex: sIdx,
            question:
              i === 0
                ? `مکانیسم اثر اصلی داروی رفرنس در جلسه ${sIdx + 1} چیست؟`
                : `نکته کلیدی شماره ${i + 1} در جلسه ${sIdx + 1} چیست؟`,
            answer:
              i === 0
                ? "مهار اختصاصی گیرنده و کاهش مقاومت عروقی."
                : `پاسخ تحلیلی و مستند به داده‌های علمی منبع آموزشی (جلسه ${sIdx + 1}، نکته ${i + 1}).`,
            explanation: "مستند به بخش‌های تشخیصی و درمانی منبع آموزشی.",
            cardType: i % 2 === 0 ? "mechanism" : "key_fact",
            difficulty: "medium",
          });
        }
      });

      return {
        kind: "flashcards_batch",
        cards,
        citationChunkIds: availableChunkIds,
      };
    }
    case "flashcard_supplemental": {
      const suppCardsMatch = promptText.match(/Generate\s+(\d+)\s+additional/i);
      const count = suppCardsMatch ? parseInt(suppCardsMatch[1], 10) : 3;
      const chunkIdsMatch = promptText.match(
        /AVAILABLE CHUNK IDs:\s*(\[[^\]]*\])/i,
      );
      let availableChunkIds: string[] = [];
      if (chunkIdsMatch && chunkIdsMatch[1]) {
        try {
          availableChunkIds = JSON.parse(chunkIdsMatch[1]);
        } catch {
          // ignore
        }
      }

      const cards = Array.from({ length: count }, (_, i) => ({
        question: `نکته تکمیلی شماره ${i + 1} در مورد اندیکاسیون و فارماکوکینتیک چیست؟`,
        answer: `پاسخ تفصیلی تکمیلی مستند به سرفصل‌های منبع (مورد ${i + 1}).`,
        explanation: "تکمیل پوشش آموزشی بر اساس بازبینی منبع.",
        cardType: "clinical_reasoning" as const,
        difficulty: "hard" as const,
      }));

      return {
        kind: "flashcard",
        cards,
        citationChunkIds: availableChunkIds,
      };
    }
    case "flashcard_topic":
    case "flashcard": {
      const targetCardsMatch =
        promptText.match(/Target cards for this topic:\s*(\d+)/i) ||
        promptText.match(/at least\s*(\d+)\s*atomic flashcards/i);
      const targetCount = targetCardsMatch
        ? Math.max(2, parseInt(targetCardsMatch[1], 10))
        : 2;
      const chunkIdsMatch = promptText.match(
        /AVAILABLE CHUNK IDs:\s*(\[[^\]]*\])/i,
      );
      let availableChunkIds: string[] = [];
      if (chunkIdsMatch && chunkIdsMatch[1]) {
        try {
          availableChunkIds = JSON.parse(chunkIdsMatch[1]);
        } catch {
          // ignore
        }
      }

      const cards = Array.from({ length: targetCount }, (_, i) => ({
        question:
          i === 0
            ? "مکانیسم اثر اصلی داروی رفرنس در منبع چیست؟"
            : `نکته کلیدی شماره ${i + 1} در ارتباط با این مبحث چیست؟`,
        answer:
          i === 0
            ? "مهار رقابتی گیرنده‌های هدف و کاهش مقاومت عروقی."
            : `پاسخ تحلیلی و مستند به داده‌های علمی منبع آموزشی (شماره ${i + 1}).`,
        explanation: "مستند به بخش‌های تشخیصی و درمانی منبع آموزشی.",
        cardType: "mechanism" as const,
        difficulty: "medium" as const,
      }));

      return {
        kind: "flashcard",
        question: cards[0].question,
        answer: cards[0].answer,
        explanation: cards[0].explanation,
        cardType: "mechanism",
        difficulty: "medium",
        cards,
        citationChunkIds: availableChunkIds,
      };
    }
    case "quizzes_batch": {
      const chunkIdsMatch = promptText.match(
        /AVAILABLE CHUNK IDs:\s*(\[[^\]]*\])/i,
      );
      let availableChunkIds: string[] = [];
      if (chunkIdsMatch && chunkIdsMatch[1]) {
        try {
          availableChunkIds = JSON.parse(chunkIdsMatch[1]);
        } catch {
          // ignore
        }
      }

      const sessionIndicesMatch = [
        ...new Set([
          ...[...promptText.matchAll(/\[SESSION INDEX\s+(\d+)\]/g)].map((m) =>
            parseInt(m[1], 10),
          ),
          ...[...promptText.matchAll(/"sessionIndex"\s*:\s*(\d+)/g)].map((m) =>
            parseInt(m[1], 10),
          ),
        ]),
      ];
      const indices = sessionIndicesMatch.length > 0 ? sessionIndicesMatch : [0];

      const countMatch =
        promptText.match(/Target Quiz Questions:\s*AT LEAST\s*(\d+)/i) ||
        promptText.match(/AT LEAST\s*(\d+)\s*multiple-choice/i) ||
        promptText.match(/target:\s*(\d+)/i);
      const questionsPerTopic = countMatch ? Math.max(1, parseInt(countMatch[1], 10)) : 10;

      const questions: Array<{
        sessionIndex: number;
        question: string;
        questionType: "multiple_choice";
        choices: string[];
        correctAnswer: string;
        explanation: string;
      }> = [];

      indices.forEach((sIdx) => {
        for (let i = 0; i < questionsPerTopic; i++) {
          questions.push({
            sessionIndex: sIdx,
            question:
              i === 0
                ? `کدام گزینه بیانگر یافته کلیدی در پاتوفیزیولوژی مبحث جلسه ${sIdx + 1} است؟`
                : `کدام گزینه رویکرد درمانی صحیح برای سوال شماره ${i + 1} در جلسه ${sIdx + 1} است؟`,
            questionType: "multiple_choice",
            choices: [
              `گزینه صحیح بر اساس شواهد منبع (جلسه ${sIdx + 1})`,
              "گزینه انحرافی ۱",
              "گزینه انحرافی ۲",
              "گزینه انحرافی ۳",
            ],
            correctAnswer: `گزینه صحیح بر اساس شواهد منبع (جلسه ${sIdx + 1})`,
            explanation: `توضیح کامل چرایی درستی گزینه بر اساس مستندات جلسه ${sIdx + 1}.`,
          });
        }
      });

      return {
        kind: "quizzes_batch",
        questions,
        citationChunkIds: availableChunkIds,
      };
    }
    case "quiz_supplemental": {
      const suppQuizMatch = promptText.match(/Generate\s+(\d+)\s+additional/i);
      const count = suppQuizMatch ? parseInt(suppQuizMatch[1], 10) : 3;
      const chunkIdsMatch = promptText.match(
        /AVAILABLE CHUNK IDs:\s*(\[[^\]]*\])/i,
      );
      let availableChunkIds: string[] = [];
      if (chunkIdsMatch && chunkIdsMatch[1]) {
        try {
          availableChunkIds = JSON.parse(chunkIdsMatch[1]);
        } catch {
          // ignore
        }
      }

      const questions = Array.from({ length: count }, (_, i) => ({
        question: `سناریوی بالینی تکمیلی شماره ${i + 1}: انتخاب داروی ارجح کدام است؟`,
        questionType: "multiple_choice" as const,
        choices: [
          "گزینه صحیح بالینی بر اساس گایدلاین",
          "گزینه انحرافی تکمیلی الف",
          "گزینه انحرافی تکمیلی ب",
          "گزینه انحرافی تکمیلی ج",
        ],
        correctAnswer: "گزینه صحیح بالینی بر اساس گایدلاین",
        explanation: "توضیح تفصیلی برای سناریوی بالینی تکمیلی.",
      }));

      return {
        kind: "quiz",
        questions,
        citationChunkIds: availableChunkIds,
      };
    }
    case "quiz_topic":
    case "quiz": {
      const targetQuizMatch =
        promptText.match(/Target questions for this topic:\s*(\d+)/i) ||
        promptText.match(/AT LEAST\s*(\d+)\s*MULTIPLE-CHOICE QUESTIONS/i);
      const targetCount = targetQuizMatch
        ? Math.max(1, parseInt(targetQuizMatch[1], 10))
        : 1;
      const chunkIdsMatch = promptText.match(
        /AVAILABLE CHUNK IDs:\s*(\[[^\]]*\])/i,
      );
      let availableChunkIds: string[] = [];
      if (chunkIdsMatch && chunkIdsMatch[1]) {
        try {
          availableChunkIds = JSON.parse(chunkIdsMatch[1]);
        } catch {
          // ignore
        }
      }

      const questions = Array.from({ length: targetCount }, (_, i) => ({
        question:
          i === 0
            ? "کدام گزینه بیانگر یافته کلیدی در پاتوفیزیولوژی بیماری است؟"
            : `کدام گزینه بیانگر یافته کلیدی در مبحث شماره ${i + 1} است؟`,
        questionType: "multiple_choice" as const,
        choices: [
          "افزایش فعالیت سیستم تنظیمی و انقباض عروق محیطی",
          "کاهش ترشح هورمون‌های تنظیم‌کننده کلیوی",
          "اتساع خودبه‌خودی بدون تغییر در مقاومت عروق",
          "عدم دخالت فاکتورهای ژنتیکی و محیطی",
        ],
        correctAnswer: "افزایش فعالیت سیستم تنظیمی و انقباض عروق محیطی",
        explanation:
          "بر اساس فصول اولیه منبع، افزایش مقاومت عروق فاکتور اصلی است.",
      }));

      return {
        kind: "quiz",
        title: "آزمون ارزیابی آموخته‌ها",
        questions,
        citationChunkIds: availableChunkIds,
      };
    }
    case "recommendation": {
      return {
        kind: "recommendation",
        summary: "Prioritized study guidance synthesized from the source.",
        topics: ["Topic 1", "Topic 2"],
        citationChunkIds: [],
      };
    }
    case "review_summary": {
      const chunkIdsMatch = promptText.match(
        /AVAILABLE CHUNK IDs:\s*(\[[^\]]*\])/i,
      );
      let availableChunkIds: string[] = [];
      if (chunkIdsMatch && chunkIdsMatch[1]) {
        try {
          availableChunkIds = JSON.parse(chunkIdsMatch[1]);
        } catch {
          // ignore
        }
      }
      const firstChunkId = availableChunkIds[0] || "chunk-1";

      return {
        kind: "review_summary",
        title: "خلاصه مروری جامع",
        estimatedReadingMinutes: 12,
        overview:
          "خلاصه فوق‌العاده متمرکز و فشرده از هسته اصلی مبحث و مفاهیم پایه‌ای.",
        sections: [
          {
            title: "بخش ۱: اصول پایه و مکانیسم‌های کلیدی",
            keyPoints: [
              "نکته کلیدی اول در مورد مکانیسم عمل و پاتوفیزیولوژی",
              "نکته کلیدی دوم در مورد فارماکوکینتیک و متابولیسم",
            ],
            mechanisms: ["مکانیسم دقیق مهار و فعال‌سازی گیرنده‌ها"],
            classifications: ["طبقه‌بندی ساختاری و دارویی"],
            comparisons: [
              {
                conceptA: "داروی گروه اول",
                conceptB: "داروی گروه دوم",
                keyDifferences: "تفاوت در نیمه‌عمر و شدت اثر مهاری",
              },
            ],
            memorizationPoints: ["دوز معمول و نسبت‌های طلایی"],
            examPoints: ["نکته پرتکرار آزمون‌های جامع"],
            citationChunkIds: [firstChunkId],
          },
        ],
        finalTakeaways: [
          "جمع‌بندی نهایی و نکات طلایی جهت مرور سریع قبل از آزمون",
        ],
        citationChunkIds: availableChunkIds,
      };
    }
    case "lesson":
    default: {
      return {
        kind: "lesson",
        moduleTitle: "سرفصل آموزشی استخراج‌شده از جزوه",
        title: "آموزش جامع و تفصیلی بر اساس جزوه",
        outline: [
          {
            title: "جلسه ۱: تعاریف، اصول پایه و پاتوفیزیولوژی",
            description: "بررسی مفاهیم بنیادی و مکانیسم‌های بیماری‌زایی",
          },
          {
            title: "جلسه ۲: راهبردهای درمانی و نکات کلیدی آزمون",
            description: "بررسی رویکردهای تشخیصی-درمانی و نکات پرتکرار",
          },
        ],
        sessions: [
          {
            title: "جلسه ۱: تعاریف، اصول پایه و پاتوفیزیولوژی",
            contentMarkdown:
              "# جلسه ۱: تعاریف، اصول پایه و پاتوفیزیولوژی\n\n## ۱. تعاریف و مبانی\nاین مبحث به بررسی مکانیسم‌های سلولی، فیزیولوژیک و طبقه‌بندی‌های اصلی می‌پردازد.\n\n## ۲. پاتوفیزیولوژی\nمکانیسم‌های فیزیوپاتولوژیک بر اساس داده‌های منبع به طور دقیق سازمان‌دهی شده‌اند.",
            citationChunkIds: [],
          },
          {
            title: "جلسه ۲: راهبردهای درمانی و نکات کلیدی آزمون",
            contentMarkdown:
              "# جلسه ۲: راهبردهای درمانی و نکات کلیدی آزمون\n\n## ۱. رویکردهای درمانی\nپروتکل‌های درمانی و دسته‌های دارویی با جدول مقایسه‌ای شرح داده شده‌اند.\n\n## ۲. نکات آزمونی\nنکات پرنکته و جمع‌بندی نهایی جهت مرور سریع.",
            citationChunkIds: [],
          },
        ],
        contentMarkdown:
          "# سرفصل آموزشی: مباحث جامع جزوه\n\n## فهرست جلسات\n- جلسه ۱: تعاریف، اصول پایه و پاتوفیزیولوژی\n- جلسه ۲: راهبردهای درمانی و نکات کلیدی آزمون\n\n---\n\n# جلسه ۱: تعاریف، اصول پایه و پاتوفیزیولوژی\nاین مبحث به بررسی مکانیسم‌های سلولی، فیزیولوژیک و طبقه‌بندی‌های اصلی می‌پردازد.\n\n---\n\n# جلسه ۲: راهبردهای درمانی و نکات کلیدی آزمون\nپروتکل‌های درمانی و دسته‌های دارویی با جدول مقایسه‌ای شرح داده شده‌اند.",
        citationChunkIds: [],
      };
    }
  }
}

/**
 * Config-gated fake provider. Returns deterministic, schema-valid JSON for
 * each supported type. No network.
 */
export class MockModelGateway implements ModelGateway {
  readonly provider = "mock" as const;
  readonly model = "mock-1";

  async complete(req: CompletionRequest): Promise<{
    text: string;
    model: string;
    usage: { inputTokens: number; outputTokens: number };
    finishReason: string;
  }> {
    const type = detectType(req);
    const userMsg =
      req.messages.filter((m) => m.role === "user").pop()?.content ?? "";
    const payload = buildPayload(type, userMsg);

    // Estimate input tokens from the concatenated messages.
    const inputTokens = req.messages.reduce(
      (acc, m) => acc + Math.max(1, Math.ceil(m.content.length / 4)),
      0,
    );
    const outputTokens = 120;

    return {
      text: JSON.stringify(payload),
      model: "mock-1",
      usage: { inputTokens, outputTokens },
      finishReason: "stop",
    };
  }

  async checkHealth(): Promise<{
    status: "healthy" | "unhealthy" | "degraded";
    provider: "mock";
    latencyMs: number;
    reason?: string;
  }> {
    return {
      status: "healthy",
      provider: "mock",
      latencyMs: 0,
    };
  }
}
