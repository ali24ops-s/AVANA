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
        "flashcards",
        "flashcard",
        "flashcard_topic",
        "flashcard_supplemental",
        "quizzes",
        "quizzes_batch",
        "quiz",
        "quiz_topic",
        "quiz_supplemental",
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
    haystack.includes("quizzes") ||
    haystack.includes("quizzes_batch") ||
    haystack.includes("BATCHED MULTIPLE-CHOICE QUIZZES") ||
    haystack.includes("MULTIPLE-CHOICE QUESTIONS") ||
    haystack.includes("BATCH OF QUIZZES") ||
    haystack.includes("quiz")
  ) {
    return "quizzes";
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
        promptText.match(/Flashcards:\s*at least\s*(\d+)/i);
      const targetQuizMatch =
        promptText.match(/target:\s*(\d+)\s*questions/i) ||
        promptText.match(/Questions:\s*at least\s*(\d+)/i);

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
      const titleMatch =
        promptText.match(/"title"\s*:\s*"([^"]+)"/i) ||
        promptText.match(/DEEP TOPIC TEACHING.*?:\s*"([^"]+)"/i);
      const sessionTitle = titleMatch ? titleMatch[1] : "جلسه آموزشی استخراج‌شده";
      const chunkIdsMatch = promptText.match(
        /AVAILABLE CHUNK IDs.*?:\s*(\[[^\]]*\])/is,
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
    case "flashcards":
    case "flashcard_topic":
    case "flashcard": {
      const targetCardsMatch =
        promptText.match(/SESSION TARGET FLASHCARD COUNT:\s*(\d+)/i) ||
        promptText.match(/TARGET FLASHCARD COUNT:\s*(\d+)/i) ||
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
        citationChunkIds: availableChunkIds.length > 0 ? [availableChunkIds[i % availableChunkIds.length]] : [],
      }));

      return {
        kind: "flashcards",
        question: cards[0].question,
        answer: cards[0].answer,
        explanation: cards[0].explanation,
        cardType: "mechanism",
        difficulty: "medium",
        cards,
        citationChunkIds: availableChunkIds,
      };
    }
    case "quizzes":
    case "quizzes_batch":
    case "quiz_topic":
    case "quiz": {
      const targetQuizMatch =
        promptText.match(/SESSION TARGET COUNT:\s*Generate at least\s*(\d+)/i) ||
        promptText.match(/Generate at least\s*(\d+)\s*high-discrimination/i) ||
        promptText.match(/Target Quiz Questions:\s*AT LEAST\s*(\d+)/i) ||
        promptText.match(/Target questions for this topic:\s*(\d+)/i) ||
        promptText.match(/AT LEAST\s*(\d+)\s*multiple-choice/i) ||
        promptText.match(/target:\s*(\d+)/i);
      const count = targetQuizMatch
        ? Math.max(1, parseInt(targetQuizMatch[1], 10))
        : 10;

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

      const sessionIdxMatch =
        promptText.match(/"index":\s*(\d+)/) ||
        promptText.match(/\[SESSION INDEX\s+(\d+)\]/i) ||
        promptText.match(/"sessionIndex"\s*:\s*(\d+)/i);
      const sessionIndex = sessionIdxMatch ? parseInt(sessionIdxMatch[1], 10) : 0;

      const questionBank = [
        {
          q: (i: number) => `در بیمار مبتلا به پرفشاری خون همراه با برونکواسپاسم (سوال ${i + 1})، کدام داروی خط اول اولویت دارد؟`,
          choices: [
            "بیزوپرولول (Bisoprolol)",
            "پروپرانولول (Propranolol)",
            "کارودیلول (Carvedilol)",
            "تیمولول (Timolol)",
          ],
          correctAnswer: "بیزوپرولول (Bisoprolol)",
          explanation: "بیزوپرولول بتابلاکر اختصاصی گیرنده بتا ۱ است و کمترین تحریک برونکواسپاسم را ایجاد می‌کند.",
          category: "clinical_reasoning",
          difficulty: "hard" as const,
        },
        {
          q: (i: number) => `مکانیسم اصلی اثر درمانی مهارکننده‌های آنزیم مبدل آنژیوتانسین در کنترل نارسایی قلبی (سوال ${i + 1}) چیست؟`,
          choices: [
            "مهار تبدیل آنژیوتانسین یک به دو و کاهش ترشح آلدوسترون",
            "بلوک انتخابی کانال‌های کلسیمی نوع L در بافت میوکارد",
            "تحریک مستقیم گیرنده‌های آلفا دو پیش‌سیناپسی عروق",
            "افزایش بازجذب سدیم و کلر در لوله پیچیده پروگزیمال",
          ],
          correctAnswer: "مهار تبدیل آنژیوتانسین یک به دو و کاهش ترشح آلدوسترون",
          explanation: "داروهای رده ACEI با مهار آنزیم مبدل سبب کاهش مقاومت عروقی و پیشگیری از ریمودلینگ قلبی می‌شوند.",
          category: "mechanism_discrimination",
          difficulty: "medium" as const,
        },
        {
          q: (i: number) => `شایع‌ترین دلیل بروز سرفه خشک به عنوان عارضه ناخواسته در مصرف کاپتوپریل (سوال ${i + 1}) کدام است؟`,
          choices: [
            "تجمع برادی‌کینین ناشی از مهار آنزیم کینیناز دو در ریه",
            "برونکواسپاسم شدید ناشی از تحریک گیرنده‌های موسکارینی",
            "افزایش ترشح اسید اوریک در مجاری تنفسی فوقانی بیمار",
            "کاهش جریان خون مویرگی در مخاط مجاری تنفسی محیطی",
          ],
          correctAnswer: "تجمع برادی‌کینین ناشی از مهار آنزیم کینیناز دو در ریه",
          explanation: "آنزیم ACE همان کینیناز II است و مهار آن باعث تجمع برادی‌کینین و ماده P در ریه‌ها می‌شود.",
          category: "adverse_effect_differential",
          difficulty: "easy" as const,
        },
        {
          q: (i: number) => `کدام مورد نشان‌دهنده مهم‌ترین منع مصرف مطلق دیورتیک‌های تیازیدی مانند هیدروکلروتیازید (سوال ${i + 1}) است؟`,
          choices: [
            "آنوری شدید و نارسایی حاد عملکرد تصفیه کلیوی",
            "پرفشاری خون خفیف اولیه بدون اختلال ارگان هدف",
            "هیپروولمی خفیف در بیماران با نارسایی مزمن قلبی",
            "افزایش ایزوله فشار خون سیستولیک در افراد مسن",
          ],
          correctAnswer: "آنوری شدید و نارسایی حاد عملکرد تصفیه کلیوی",
          explanation: "تیازیدها در بیماران با نارسایی شدید کلیوی (GFR کمتر از ۳۰) بی‌اثر بوده و منع مصرف دارند.",
          category: "contraindication_nuance",
          difficulty: "hard" as const,
        },
        {
          q: (i: number) => `تفاوت فارماکوکینتیکی بارز میان انالاپریل و کاپتوپریل (سوال ${i + 1}) در کدام ویژگی خلاصه می‌شود؟`,
          choices: [
            "انالاپریل پیش‌داروی استری بوده و نیازمند هیدرولیز فعال‌کننده کبدی است",
            "کاپتوپریل نیمه‌عمر پلاسمایی بسیار طولانی‌تری نسبت به انالاپریل دارد",
            "انالاپریل منحصراً از راه ترشح صفراوی بدون دفع کلیوی حذف می‌شود",
            "کاپتوپریل برای اثر نیازمند فعال‌سازی توسط آنزیم‌های گوارشی است",
          ],
          correctAnswer: "انالاپریل پیش‌داروی استری بوده و نیازمند هیدرولیز فعال‌کننده کبدی است",
          explanation: "انالاپریل یک پیش‌دارو است که در کبد توسط استرازها به شکل فعال یعنی انالاپریلات تبدیل می‌گردد.",
          category: "pharmacokinetic_comparison",
          difficulty: "medium" as const,
        },
        {
          q: (i: number) => `مکانیسم اختصاصی داروی آملودیپین در کنترل پرفشاری خون عروقی (سوال ${i + 1}) چیست؟`,
          choices: [
            "مهار اختصاصی کانال‌های کلسیمی نوع ال در عضلات صاف جدار عروق",
            "مسدودسازی کانال‌های سدیمی وابسته به ولتاژ در بافت گرهی قلب",
            "باز کردن کانال‌های پتاسیمی وابسته به ATP در جدار مویرگ‌ها",
            "تحریک مستقیم ترشح نیتریک اکساید از سلول‌های اندوتلیال",
          ],
          correctAnswer: "مهار اختصاصی کانال‌های کلسیمی نوع ال در عضلات صاف جدار عروق",
          explanation: "آملودیپین یک مسدودکننده دی‌هیدروپیریدینی کانال کلسیم با تمایل بالا به عضلات صاف عروقی است.",
          category: "mechanism_discrimination",
          difficulty: "easy" as const,
        },
        {
          q: (i: number) => `مهم‌ترین خطر الکترولیتی ناشی از تجویز اسپیرونولاکتون (سوال ${i + 1}) در کدام گزینه بیان شده است؟`,
          choices: [
            "هایپرکالمی شدید به دلیل مهار بازجذب سدیم و دفع پتاسیم در مجاری جمع‌کننده",
            "هایپوناترمی شدید ناشی از دفع آب خالص در قوس نزولی هنله",
            "هایپومنیزیمی حاد ناشی از مهار پمپ‌های وابسته به انرژی",
            "افزایش شدید ترشح بی‌کربنات و آلکالوز متابولیک کلیوی",
          ],
          correctAnswer: "هایپرکالمی شدید به دلیل مهار بازجذب سدیم و دفع پتاسیم در مجاری جمع‌کننده",
          explanation: "اسپیرونولاکتون با آنتاگونیسم آلدوسترون از ترشح پتاسیم ممانعت کرده و خطر هایپرکالمی ایجاد می‌کند.",
          category: "adverse_effect_differential",
          difficulty: "medium" as const,
        },
        {
          q: (i: number) => `علت وقوع بحران پرفشاری خون واکنشی (Rebound) پس از قطع ناگهانی کلونیدین (سوال ${i + 1}) چیست؟`,
          choices: [
            "افزایش ناگهانی و جبرانی آزادسازی کاتکول‌آمین‌های سمپاتیک",
            "تخریب گیرنده‌های دوپامینی در هسته مجرای منفرد بصل‌النخاع",
            "فعال‌سازی شدید سیستم رنین آنژیوتانسین در گردش خون عمومی",
            "مهار حاد ترشح برادی‌کینین در بستر عروق کلیوی",
          ],
          correctAnswer: "افزایش ناگهانی و جبرانی آزادسازی کاتکول‌آمین‌های سمپاتیک",
          explanation: "قطع ناگهانی آگونیست آلفا دو مرکزی سبب تخلیه شدید و کنترل‌نشده نوراپی‌نفرین از پایانه‌های عصبی می‌شود.",
          category: "clinical_reasoning",
          difficulty: "hard" as const,
        },
        {
          q: (i: number) => `کدام بخش از نفرون هدف اصلی اثر فارماکولوژیک داروی فوروزماید (سوال ${i + 1}) است؟`,
          choices: [
            "هم‌انتقال‌دهنده سدیم-پتاسیم-دو کلر در بخش بالارونده ضخیم لوله هنله",
            "هم‌انتقال‌دهنده سدیم-کلر در لوله پیچیده دور کلیه",
            "کانال‌های اپیتلیومی سدیم در لوله‌های جمع‌کننده قشری",
            "کوترانسپورتر سدیم-گلوکز در ابتدای لوله پیچیده نزدیک",
          ],
          correctAnswer: "هم‌انتقال‌دهنده سدیم-پتاسیم-دو کلر در بخش بالارونده ضخیم لوله هنله",
          explanation: "دیورتیک‌های لوپ مانند فوروزماید پمپ Na+/K+/2Cl- را در بخش ضخیم صاعد هنله مسدود می‌کنند.",
          category: "mechanism_discrimination",
          difficulty: "easy" as const,
        },
        {
          q: (i: number) => `مزیت داروی لوزارتان نسبت به مهارکننده‌های آنزیم ACE (سوال ${i + 1}) در چه مزیتی است؟`,
          choices: [
            "عدم افزایش غلظت برادی‌کینین و کاهش چشمگیر شیوع سرفه خشک",
            "کاهش کامل ترشح آلدوسترون بدون هیچ‌گونه خطر هایپرکالمی",
            "افزایش سرعت فیلتراسیون گلومرولی در بیماران تنگی دوطرفه شریان کلیه",
            "عدم نیاز به متابولیسم کبدی برای تبدیل به متابولیت فعال",
          ],
          correctAnswer: "عدم افزایش غلظت برادی‌کینین و کاهش چشمگیر شیوع سرفه خشک",
          explanation: "مسدودکننده‌های AT1 اثری بر متابولیسم برادی‌کینین نداشته و سرفه پایدار ایجاد نمی‌کنند.",
          category: "clinical_reasoning",
          difficulty: "medium" as const,
        },
        {
          q: (i: number) => `کدام عارضه نامطلوب نادر ولی مشخص با مصرف هیدرالازین در دوزهای بالا (سوال ${i + 1}) ارتباط دارد؟`,
          choices: [
            "سندرم شبه لوپوس اریتماتوز ناشی از استیلاسیون آهسته دارویی",
            "فیبروز بینابینی ریوی ناشی از سمیت مستقیم سلولی",
            "نوروپاتی محیطی غیرقابل برگشت به علت تخریب میلین",
            "استئوپروز شدید ناشی از افزایش بازجذب کلسیم استخوانی",
          ],
          correctAnswer: "سندرم شبه لوپوس اریتماتوز ناشی از استیلاسیون آهسته دارویی",
          explanation: "هیدرالازین به ویژه در افراد با استیلاسیون کبدی آهسته می‌تواند لوپوس دارویی برگشت‌پذیر ایجاد کند.",
          category: "adverse_effect_differential",
          difficulty: "hard" as const,
        },
        {
          q: (i: number) => `تداخل دارویی همزمان وراپامیل با کدام دسته دارویی به دلیل خطر بلوک قلبی منع شده است (سوال ${i + 1})؟`,
          choices: [
            "بتابلاکرهای آدرنرژیک به دلیل تشدید اثر اینوتروپ و دروموتروپ منفی",
            "دیورتیک‌های تیازیدی به دلیل افزایش خطر آلکالوز متابولیک",
            "مهارکننده‌های رنین به علت مهار ترشح اسید اوریک کلیوی",
            "آنتاگونیست‌های آلفا یک به دلیل کاهش ترشح کاتکول‌آمین‌ها",
          ],
          correctAnswer: "بتابلاکرهای آدرنرژیک به دلیل تشدید اثر اینوتروپ و دروموتروپ منفی",
          explanation: "ترکیب وراپامیل و بتابلاکر ریسک برادی‌کاردی شدید و بلوک کامل گره دهلیزی بطنی را به شدت می‌افزاید.",
          category: "contraindication_nuance",
          difficulty: "hard" as const,
        },
        {
          q: (i: number) => `راهکار استاندارد دارویی برای جلوگیری از ایجاد تحمل (تولرانس) به نیترات‌ها (سوال ${i + 1}) چیست؟`,
          choices: [
            "ایجاد فاصله زمانی ۱۰ تا ۱۲ ساعته عاری از نیترات در شبانه‌روز",
            "افزایش پیوسته دوز مصرفی در فواصل منظم سه روزه",
            "تجویز همزمان با دیورتیک‌های قوس هنله جهت شستشوی کلیوی",
            "استفاده انحصاری از فرمولاسیون‌های وریدی با انفوزیون مدام",
          ],
          correctAnswer: "ایجاد فاصله زمانی ۱۰ تا ۱۲ ساعته عاری از نیترات در شبانه‌روز",
          explanation: "تخلیه گروه‌های سولفیدریل بافتی سبب بروز تحمل نیتراتی می‌شود که نیازمند یک دوره عاری از دارو است.",
          category: "clinical_reasoning",
          difficulty: "medium" as const,
        },
        {
          q: (i: number) => `هدف اولیه و بیوشیمیایی استاتین‌ها در مهار سنتز درون‌زای کلسترول (سوال ${i + 1}) کدام آنزیم است؟`,
          choices: [
            "آنزیم هیدروکسی متیل گلوتاریل کوآنزیم آ ردوکتاز (HMG-CoA Reductase)",
            "آنزیم استیل کوآنزیم آ کربوکسیلاز در بافت آدیپوز",
            "آنزیم لستین کلسترول آسیل ترانسفراز پلاسما",
            "آنزیم لیپوپروتئین لیپاز در سلول‌های اندوتلیال عروق",
          ],
          correctAnswer: "آنزیم هیدروکسی متیل گلوتاریل کوآنزیم آ ردوکتاز (HMG-CoA Reductase)",
          explanation: "استاتین‌ها با مهار رقابتی آنزیم محدودکننده سرعت سنتز کلسترول، گیرنده‌های LDL را در کبد افزایش می‌دهند.",
          category: "mechanism_discrimination",
          difficulty: "easy" as const,
        },
      ];

      const questions = Array.from({ length: count }, (_, i) => {
        const tmpl = questionBank[i % questionBank.length];
        const citation =
          availableChunkIds.length > 0
            ? [availableChunkIds[i % availableChunkIds.length]]
            : [];

        return {
          sessionIndex,
          question: tmpl.q(i),
          questionType: "multiple_choice" as const,
          difficulty: tmpl.difficulty,
          category: tmpl.category,
          choices: [...tmpl.choices],
          correctAnswer: tmpl.correctAnswer,
          explanation: tmpl.explanation,
          citationChunkIds: citation,
        };
      });

      return {
        kind: "quizzes",
        title: "آزمون ارزیابی آموخته‌ها",
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
        question: `سناریوی بالینی تکمیلی شماره ${i + 1}: انتخاب داروی ارجح بر اساس گایدلاین کدام است؟`,
        questionType: "multiple_choice" as const,
        difficulty: "hard" as const,
        category: "clinical_reasoning",
        choices: [
          "بیزوپرولول به دلیل کاردیوسلکتیویتی بر گیرنده بتا یک",
          "پروپرانولول با مهار غیراختصاصی بتا یک و بتا دو",
          "آتنولول با دفع غالب کبدی و نیمه‌عمر کوتاه",
          "لبتالول با اثر آنتاگونیستی خالص بر گیرنده آلفا",
        ],
        correctAnswer: "بیزوپرولول به دلیل کاردیوسلکتیویتی بر گیرنده بتا یک",
        explanation: "توضیح تفصیلی مستند به داده‌های بالینی منبع آموزشی.",
        citationChunkIds: availableChunkIds.slice(0, 1),
      }));

      return {
        kind: "quiz",
        questions,
        citationChunkIds: availableChunkIds,
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
