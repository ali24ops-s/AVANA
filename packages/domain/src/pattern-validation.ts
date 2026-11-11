/**
 * Semantic and Pattern Compliance Validation layer.
 *
 * Keeps semantic and pedagogical pattern checks strictly separated from
 * physical choice shuffling and generic syntactic quality gates.
 */

import type { QuestionOptionInput } from "./question-shuffling.js";
import { resolveCorrectChoiceText } from "./question-shuffling.js";

export interface PatternSemanticComplianceResult {
  valid: boolean;
  score: number; // 0 to 100
  passedChecks: string[];
  failedChecks: string[];
  warnings: string[];
  explanationKeyAlignment: boolean;
}

export function validatePatternSemanticCompliance(
  question: QuestionOptionInput,
  patternId?: string | null,
): PatternSemanticComplianceResult {
  const passedChecks: string[] = [];
  const failedChecks: string[] = [];
  const warnings: string[] = [];

  const qText = String(question.question || "").trim();
  const choices = Array.isArray(question.choices) ? question.choices.map((c) => String(c).trim()) : [];
  const explanation = String(question.explanation || "").trim();
  const correctChoiceText = resolveCorrectChoiceText(choices, question.correctAnswer);

  // 1. Explanation - Correct Key Agreement Check
  let explanationKeyAlignment = true;
  if (explanation && correctChoiceText) {
    const normExp = explanation.toLowerCase();
    const normCorrect = correctChoiceText.toLowerCase();

    // Look for key tokens (length >= 4) from correct choice in explanation
    const correctTokens = normCorrect
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((t) => t.length >= 4);

    if (correctTokens.length > 0) {
      const matchCount = correctTokens.filter((tok) => normExp.includes(tok)).length;
      const matchRatio = matchCount / correctTokens.length;
      if (matchRatio < 0.15 && !normExp.includes("گزینه") && !normExp.includes("پاسخ")) {
        warnings.push("توضیح تشریحی هم‌پوشانی لغوی اندکی با متن گزینه صحیح دارد.");
      }
    }
    passedChecks.push("بررسی انطباق مفهومی پاسخ تشریحی و کلید");
  } else if (!explanation) {
    warnings.push("سؤال فاقد پاسخ تشریحی است.");
  }

  // 2. Pattern-specific Compliance
  const pId = patternId?.trim() || "";

  // Pattern 1: نکات پرتکرار (10000000-0000-4000-a000-000000000001)
  if (pId === "10000000-0000-4000-a000-000000000001") {
    if (qText.length >= 15) {
      passedChecks.push("صراحت و شفافیت صورت سؤال امتحانی");
    } else {
      failedChecks.push("صورت سؤال بیش از حد کوتاه و فاقد اطلاعات لازم است.");
    }
  }

  // Pattern 3: تمایز و مقایسه (10000000-0000-4000-a000-000000000003)
  if (pId === "10000000-0000-4000-a000-000000000003") {
    const comparisonKeywords = [
      "مقایسه", "در مقایسه", "در مقایسه با",
      "تفاوت", "تفاوت‌های", "تفاوت بارز", "متفاوت",
      "برخلاف", "بر خلاف",
      "متمایز", "تمایز", "متمایز می‌سازد", "متمایز می‌کند",
      "نسبت به", "در برابر", "فرق", "اختصاصی",
    ];
    const hasComparisonMarkerInStem = comparisonKeywords.some((kw) => qText.includes(kw));

    // Also check if choices exhibit comparative/contrasting structure
    const choiceComparisonKeywords = ["در حالی که", "در صورتی که", "برخلاف", "اما", "ولی"];
    const hasComparisonMarkerInChoices = choices.some((c) =>
      choiceComparisonKeywords.some((kw) => c.includes(kw))
    );

    if (hasComparisonMarkerInStem || hasComparisonMarkerInChoices) {
      passedChecks.push("وجود عبارات نشان‌دهنده مقایسه و تمایز در صورت سؤال یا گزینه‌ها");
    } else {
      warnings.push("صورت سؤال یا گزینه‌ها فاقد کلمات کلیدی و ساختار صریح مقایسه (مانند «تفاوت»، «مقایسه»، «برخلاف»، «متمایز») است.");
    }
  }

  // Pattern 5: سناریومحور (10000000-0000-4000-a000-000000000005)
  if (pId === "10000000-0000-4000-a000-000000000005") {
    const scenarioKeywords = ["بیمار", "ساله", "مرد", "زن", "مراجعه", "شکایت", "سابقه", "شرح‌حال", "علائم", "تشخیص", "آزمایش"];
    const hasScenarioMarker = scenarioKeywords.some((kw) => qText.includes(kw));
    if (hasScenarioMarker) {
      passedChecks.push("وجود قالب سناریوی بالینی یا کاربردی");
    } else {
      failedChecks.push("صورت سؤال فاقد مشخصه‌های سناریو یا شرح‌حال بالینی است.");
    }
  }

  // Pattern 6: استدلال چندمرحله‌ای (10000000-0000-4000-a000-000000000006)
  if (pId === "10000000-0000-4000-a000-000000000006") {
    const hasExplicitStepsInExplanation =
      (explanation.includes("گام ۱") || explanation.includes("گام اول") || explanation.includes("مرحله اول") || explanation.includes("گام 1")) &&
      (explanation.includes("گام ۲") || explanation.includes("گام دوم") || explanation.includes("مرحله دوم") || explanation.includes("گام 2"));

    const hasSequentialExplanation =
      hasExplicitStepsInExplanation ||
      ((explanation.includes("مرحله") || explanation.includes("گام")) &&
        (explanation.includes("ابتدا") || explanation.includes("سپس") || explanation.includes("در نتیجه") || explanation.includes("بنابراین")));

    const hasScenarioPremise = ["بیمار", "ساله", "مراجعه", "شرح‌حال", "سابقه", "کراتینین", "egfr", "فشار خون", "آزمایش", "علائم"].some((kw) => qText.toLowerCase().includes(kw));

    const hasDeductivePremise = [
      "در صورت", "چنانچه", "اگر", "در صورتی که", "پس از", "به دنبال", "با فرض",
      "بر اساس داده", "کدام توالی", "اقدام بعدی", "گام بعدی", "مرحله بعدی",
      "اثر ثانویه", "اثر غیرمستقیم", "زنجیره", "مستلزم", "منجر به",
      "تصمیم درمانی", "اقدام مناسب", "رویکرد صحیح", "اولویت درمانی",
    ].some((kw) => qText.includes(kw));

    const isDirectRoteQuestion =
      /^(?:کدام هشدار|کدام تعریف|تعریف|نام دیگر|کدام یک از داروهای زیر صرفاً|مکانیزم اثر [^،]+ شامل کدام|کدام گزینه تعریف|کدام مورد بیانگر تعریف)\b/u.test(qText.trim()) ||
      (!hasScenarioPremise && !hasDeductivePremise && (qText.startsWith("مکانیزم اثر سلولی") || qText.startsWith("کدام هشدار نظارتی")));

    const hasMultiStepReasoning =
      hasSequentialExplanation &&
      (hasScenarioPremise || hasDeductivePremise) &&
      !isDirectRoteQuestion;

    if (hasMultiStepReasoning) {
      passedChecks.push("پشتیبانی از زنجیره استدلال تحلیلی چندمرحله‌ای");
    } else {
      warnings.push("سؤال و پاسخ تشریحی ممکن است تک‌مرحله‌ای یا حافظه‌محور باشند (تفکیک دو گام استنتاجی مشاهده نشد).");
    }
  }

  // Pattern 8: حل مسئله و محاسبات (10000000-0000-4000-a000-000000000008)
  if (pId === "10000000-0000-4000-a000-000000000008") {
    // Strip clinical classification numbers/acronyms (DPP-4, GLP-1, SGLT-2, MEN-2, B12, Type 1/2, etc.)
    // so classification acronyms don't falsely qualify as quantitative/computational problem solving.
    const stripAcronyms = (text: string) =>
      text.replace(
        /\b(?:dpp-?[4iv]+|glp-?[1i]+|sglt-?[2ii]+|men-?[12i]+|b-?12|t[34]|type\s*[12]|نوع\s*[۱-۲1-2])\b/gi,
        "",
      );

    const digitPattern = /[\d\u06F0-\u06F9\u0660-\u0669]/u;
    const cleanQText = stripAcronyms(qText);
    const hasNumbersInChoices = choices.some((c) => digitPattern.test(stripAcronyms(c)));
    const hasNumbersInStem = digitPattern.test(cleanQText);

    // Computational problem-solving markers:
    // Standalone "دوز" or "میزان" is NOT enough (e.g. general phrase "تعدیل دوز" without numerical problem solving).
    const hasProblemSolvingMarkers = [
      "محاسبه", "چند درصد", "چند میلی", "مقدار دوز", "تنظیم دوز", "تطبیق دوز", "کاهش دوز", "افزایش دوز", "حداکثر دوز", "حداقل دوز", "فرمول", "نسبت", "آستانه", "تخمین",
      "egfr", "hba1c", "fpg", "bmi", "واحد", "سی‌سی", "میلی‌گرم", "روزانه", "ساعت",
    ].some((kw) => qText.toLowerCase().includes(kw));

    if (hasNumbersInChoices || (hasNumbersInStem && hasProblemSolvingMarkers)) {
      passedChecks.push("انطباق با الگوی ۸ (محاسبات کمی یا حل مسئله بالینی داده‌محور)");
    } else {
      warnings.push("سؤال فاقد شاخص‌های بارز محاسباتی یا معیارهای عددی حل مسئله است.");
    }
  }

  // Pattern 10: سؤالات ترکیبی (10000000-0000-4000-a000-000000000010)
  if (pId === "10000000-0000-4000-a000-000000000010") {
    const hasCompositeMarkers = ["همزمان", "ترکیب", "تلفیق", "و نیز", "علاوه بر", "دو", "چندین"].some((kw) => qText.includes(kw)) || qText.length > 60;
    if (hasCompositeMarkers) {
      passedChecks.push("پوشش همزمان مباحث ترکیبی و تلفیقی");
    } else {
      warnings.push("سؤال ممکن است تنها به یک موضوع مجزا پرداخته باشد.");
    }
  }

  // Pattern 11: تشخیص گزینه نادرست (10000000-0000-4000-a000-000000000011)
  if (pId === "10000000-0000-4000-a000-000000000011") {
    const normQ = qText.replace(/[\u200c\u200b]/g, " ").trim();

    // Explicit multi-word negative phrases
    const multiWordNegatives = [
      "صحیح نیست",
      "درست نیست",
      "صادق نیست",
      "صدق نمیکند",
      "صدق نمی کند",
      "به جز",
      "به‌جز",
    ];
    const hasMultiWordNeg = multiWordNegatives.some((ph) => normQ.includes(ph));

    // Standalone negative words protected by Unicode word boundary guards (prevents 'آگونیست' from matching 'نیست')
    const standaloneNegativeRegex = /(?:^|[^\p{L}\p{N}])(?:نادرست|غلط|اشتباه|نباشد|نیست)(?:[^\p{L}\p{N}]|$)/u;
    const hasStandaloneNeg = standaloneNegativeRegex.test(normQ);

    const isNegativeStem = hasMultiWordNeg || hasStandaloneNeg;

    // Detect if stem ends in an explicitly positive inquiry (e.g. "کدام یک ... صحیح/درست است؟")
    const isExplicitlyPositiveStem = /(?:^|[^\p{L}\p{N}])(?:صحیح است|درست است)[؟?]?\s*$/u.test(normQ);

    if (isNegativeStem && !isExplicitlyPositiveStem) {
      passedChecks.push("صورت سؤال دارای لید-این منفی صریح است");
    } else {
      failedChecks.push("صورت سؤال فاقد عبارات منفی صریح («نادرست»، «غلط»، «به‌جز»، «صحیح نیست») است یا به صورت مثبت پرسیده شده است.");
    }
  }

  const valid = failedChecks.length === 0;
  const score = Math.max(0, 100 - failedChecks.length * 25 - warnings.length * 10);

  return {
    valid,
    score,
    passedChecks,
    failedChecks,
    warnings,
    explanationKeyAlignment,
  };
}
