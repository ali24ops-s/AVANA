import { describe, it, expect } from "vitest";
import {
  splitSpeechSentences,
  splitSpeechTextIntoParagraphs,
  formatSpeechText,
} from "../presentation.js";

describe("Presentation Speech Paragraphing & Semantic Formatting", () => {
  // Scenario 1 & 2: Pre-existing paragraphs with \n\n and \r\n\r\n
  it("preserves pre-existing multi-paragraph structures with standard newlines (\\n\\n)", () => {
    const input =
      "همکاران گرامی، در این اسلاید به معرفی موضوع می‌پردازیم.\n\nدر ادامه، جزئیات مکانیسم فارماکولوژیک تشریح خواهد شد.";
    const result = splitSpeechTextIntoParagraphs(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("همکاران گرامی، در این اسلاید به معرفی موضوع می‌پردازیم.");
    expect(result[1]).toBe("در ادامه، جزئیات مکانیسم فارماکولوژیک تشریح خواهد شد.");

    const formatted = formatSpeechText(input);
    expect(formatted).toBe(input);
  });

  it("supports Windows CRLF (\\r\\n\\r\\n) and irregular blank lines without breaking structure", () => {
    const input =
      "پاراگراف اول در محیط ویندوز تدوین شده است.\r\n\r\nپاراگراف دوم پس از خط خالی می‌آید.\r\n\r\nپاراگراف سوم جهت بررسی پایداری.";
    const result = splitSpeechTextIntoParagraphs(input);
    expect(result).toHaveLength(3);
    expect(result[0]).toContain("پاراگراف اول");
    expect(result[1]).toContain("پاراگراف دوم");
    expect(result[2]).toContain("پاراگراف سوم");

    const formatted = formatSpeechText(input);
    expect(formatted).not.toContain("\r");
    expect(formatted.split("\n\n")).toHaveLength(3);
  });

  // Scenario 3: Single line breaks
  it("handles single line breaks sensibly when lines are substantial statements", () => {
    const input =
      "اساتید محترم، این بخش به بررسی تغییرات همودینامیک بطن چپ اختصاص دارد.\nهمان‌طور که در دیاگرام مشاهده می‌کنید، فشار انتهای دیاستولی افزایش می‌یابد.\nدر نهایت، استراتژی کاهش افترلود توسط مهارکننده‌های ACE توصیه می‌شود.";
    const result = splitSpeechTextIntoParagraphs(input);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toContain("تغییرات همودینامیک");
    expect(result[1]).toContain("دیاگرام");
  });

  // Scenario 4: Continuous scientific & medical speech text semantic splitting
  it("semantically segments dense continuous Persian medical speech text into cohesive multi-sentence paragraphs", () => {
    const input =
      "سلام و وقت بخیر به اساتید و همکاران گرامی. در این اسلاید قصد داریم به بررسی جامع فارماکوکینتیک داروی دیگوکسین و شاخص درمانی باریک آن بپردازیم. همان‌طور که در تصویر مشاهده می‌کنید، این دارو با مهار پمپ سدیم-پتاسیم ATPase اینوتروپی مثبت ایجاد می‌نماید. از سوی دیگر، به دلیل توزیع گسترده بافتی و دفع عمدتاً کلیوی، تغییرات فیلتراسیون گلومرولی بر سطح سرمی دارو بسیار مؤثر است. از دیدگاه کاربرد بالینی، پایش دقیق سطح سرمی و تنظیم دوز اولیه به میزان 0.125 میلی‌گرم در بیماران مسن حیاتی است. در بیماران مبتلا به هیپوکالمی، خطر آریتمی‌های کشنده به شدت افزایش می‌یابد. در نهایت، توصیه می‌شود الکترولیت‌های سرمی پیش از شروع درمان ارزیابی شوند.";

    const paragraphs = splitSpeechTextIntoParagraphs(input);

    // Must split into 2-4 coherent paragraphs
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(paragraphs.length).toBeLessThanOrEqual(4);

    // Paragraph 1 should cover the introduction and overview
    expect(paragraphs[0]).toContain("سلام و وقت بخیر");
    expect(paragraphs[0]).toContain("دیگوکسین");

    // Later paragraphs should pick up the mechanism or clinical application
    const combined = paragraphs.join("\n\n");
    expect(combined).toContain("ATPase");
    expect(combined).toContain("دیدگاه کاربرد بالینی");
    expect(combined).toContain("در نهایت");
  });

  // Scenario 5: Preserving decimal numbers and pharmaceutical units
  it("does NOT break on decimal numbers like 2.5 mg, 0.05, 3.14 or pharmacological dosages", () => {
    const textWithDecimals =
      "تجویز دوز اولیه 2.5 mg روزانه در مقایسه با 1.25 mg اثربخشی بهتری نشان داده است. در کارآزمایی‌های بالینی با سطح معناداری p < 0.05 و غلظت پلاسمایی 0.025 ng/ml این نتیجه تکرار شد. از دیدگاه کاربرد بالینی، بیماران با کلیرانس کراتینین زیر 30.5 ml/min باید دوز تعدیل‌شده دریافت نمایند.";

    const sentences = splitSpeechSentences(textWithDecimals);
    expect(sentences.some((s) => s.includes("2.5 mg"))).toBe(true);
    expect(sentences.some((s) => s.includes("p < 0.05"))).toBe(true);
    expect(sentences.some((s) => s.includes("30.5 ml/min"))).toBe(true);

    // Ensure no sentence begins or ends brokenly around 2.5
    for (const s of sentences) {
      expect(s).not.toBe("5 mg روزانه در مقایسه با 1");
      expect(s).not.toBe("2");
    }

    const paragraphs = splitSpeechTextIntoParagraphs(textWithDecimals);
    const joined = paragraphs.join(" ");
    expect(joined).toContain("2.5 mg");
    expect(joined).toContain("p < 0.05");
    expect(joined).toContain("30.5 ml/min");
  });

  // Scenario 6: Preserving medical and academic abbreviations (Dr., et al., vs., Prof.)
  it("preserves academic abbreviations like Dr., Prof., vs., and et al. without creating false sentence breaks", () => {
    const textWithAbbrevs =
      "بر اساس مطالعه اخیر دکتر رضوانی (Dr. Rezvani et al.) پیرامون اثربخشی داروی A vs. B نتایج جالب توجهی حاصل شد. این پژوهش در بیمارستان امام خمینی توسط Prof. Ahmadi مورد بررسی قرار گرفت. از نظر بالینی، این یافته‌ها پروتکل درمانی بخش مراقبت‌های ویژه را تغییر می‌دهند.";

    const sentences = splitSpeechSentences(textWithAbbrevs);

    // Dr. Rezvani et al. must be within a single sentence
    const firstSentence = sentences[0];
    expect(firstSentence).toContain("Dr. Rezvani et al.");
    expect(firstSentence).toContain("vs. B");

    const paragraphs = splitSpeechTextIntoParagraphs(textWithAbbrevs);
    expect(paragraphs.length).toBeGreaterThanOrEqual(1);
    expect(paragraphs.join(" ")).toContain("Dr. Rezvani et al.");
  });

  // Scenario 7 & 8: 100% Content fidelity and sequence preservation
  it("guarantees 100% preservation of all original words, numbers, and sequence without deletion or modification", () => {
    const originalText =
      "گلوکوکورتیکوئیدها با اتصال به گیرنده‌های اختصاصی سیتوزولی عمل می‌کنند. پس از اتصال، کمپلکس دارو-گیرنده وارد هسته شده و رونویسی ژن‌های سایتوکاین‌های التهابی مانند IL-1 و TNF-alpha را مهار می‌سازد. از منظر فارماکولوژی بالینی، اثرات ضدالتهابی این دسته دارویی در بیماری‌های خودایمنی بسیار برجسته است. با این حال، مصرف طولانی‌مدت ممکن است عوارض متابولیک نظیر هایپرگلایسمی و پوکی استخوان را به همراه داشته باشد. در نهایت، قطع تدریجی دارو جهت جلوگیری از نارسایی حاد قشر آدرنال ضروری است.";

    const paragraphs = splitSpeechTextIntoParagraphs(originalText);

    // Normalize whitespace for exact word comparison
    const normalizeWords = (s: string) =>
      s
        .replace(/\s+/g, " ")
        .replace(/[\n\r]+/g, " ")
        .trim();

    const originalWords = normalizeWords(originalText).split(" ");
    const outputWords = normalizeWords(paragraphs.join(" ")).split(" ");

    expect(outputWords).toEqual(originalWords);
    expect(paragraphs.length).toBeGreaterThan(1);
  });

  // Scenario 9: Prevents unnecessary single-sentence paragraphs
  it("avoids turning individual sentences into single-line paragraphs for conversational speech flow", () => {
    const shortTwoSentenceText =
      "در این اسلاید ساختار شیمیایی پنی‌سیلین بررسی می‌شود. حلقه بتالاکتام نقش اساسی در اتصال به ترانس‌پپتیداز دارد.";

    const result = splitSpeechTextIntoParagraphs(shortTwoSentenceText);

    // Should remain 1 coherent paragraph rather than 2 choppy one-liners
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("پنی‌سیلین");
    expect(result[0]).toContain("ترانس‌پپتیداز");
  });

  // Scenario 10: Null, undefined, empty, and whitespace handling
  it("handles empty, null, undefined, and whitespace-only inputs gracefully", () => {
    expect(splitSpeechTextIntoParagraphs(null)).toEqual([]);
    expect(splitSpeechTextIntoParagraphs(undefined)).toEqual([]);
    expect(splitSpeechTextIntoParagraphs("")).toEqual([]);
    expect(splitSpeechTextIntoParagraphs("   \n\t  ")).toEqual([]);

    expect(formatSpeechText(null)).toBe("");
    expect(formatSpeechText(undefined)).toBe("");
    expect(formatSpeechText("")).toBe("");
  });

  // Scenario 11: Sentence boundary detection with closing parentheses, brackets, and quotes
  it("detects sentence boundaries accurately when terminal punctuation is enclosed or followed by parentheses or quotes", () => {
    // 1. Persian sentence ending with closing parenthesis: .)
    const persianParen =
      "کمپلکس هورمون-گیرنده وارد هسته سلول می‌شود.) در ادامه، رونویسی ژن‌های التهابی مهار می‌گردد.";
    const sentencesParen = splitSpeechSentences(persianParen);
    expect(sentencesParen).toHaveLength(2);
    expect(sentencesParen[0]).toBe("کمپلکس هورمون-گیرنده وارد هسته سلول می‌شود.)");
    expect(sentencesParen[1]).toBe("در ادامه، رونویسی ژن‌های التهابی مهار می‌گردد.");

    // 2. Persian sentence ending with Persian quotes: .»
    const sentencesQuotes = splitSpeechSentences(
      "اساتید بر این نکته تأکید دارند که «درمان باید زودهنگام آغاز شود.» در ادامه، پروتکل پیشنهادی را مرور می‌کنیم.",
    );
    expect(sentencesQuotes).toHaveLength(2);
    expect(sentencesQuotes[0]).toBe(
      "اساتید بر این نکته تأکید دارند که «درمان باید زودهنگام آغاز شود.»",
    );
    expect(sentencesQuotes[1]).toBe("در ادامه، پروتکل پیشنهادی را مرور می‌کنیم.");

    // 3. English sentence ending with parenthesis outside: ).
    const englishParen =
      "The compound binds to the intracellular receptor (as demonstrated previously). The next trial evaluated overall survival.";
    const sentencesEngParen = splitSpeechSentences(englishParen);
    expect(sentencesEngParen).toHaveLength(2);
    expect(sentencesEngParen[0]).toBe(
      "The compound binds to the intracellular receptor (as demonstrated previously).",
    );
    expect(sentencesEngParen[1]).toBe("The next trial evaluated overall survival.");

    // 4. English sentence ending with quote inside: ."
    const englishQuote =
      'The guideline recommends "early initiation of SGLT2 inhibitors." Furthermore, renal endpoints improved significantly.';
    const sentencesEngQuote = splitSpeechSentences(englishQuote);
    expect(sentencesEngQuote).toHaveLength(2);
    expect(sentencesEngQuote[0]).toBe(
      'The guideline recommends "early initiation of SGLT2 inhibitors."',
    );
    expect(sentencesEngQuote[1]).toBe("Furthermore, renal endpoints improved significantly.");

    // 5. Multiple closing marks: .»)
    const multiClosing =
      "این شواهد از مقاله اصلی استخراج شده‌اند («کارآزمایی بالینی فاز ۳.») در ادامه، دوزبندی تشریح می‌شود.";
    const sentencesMulti = splitSpeechSentences(multiClosing);
    expect(sentencesMulti).toHaveLength(2);
    expect(sentencesMulti[0]).toBe(
      "این شواهد از مقاله اصلی استخراج شده‌اند («کارآزمایی بالینی فاز ۳.»)",
    );
    expect(sentencesMulti[1]).toBe("در ادامه، دوزبندی تشریح می‌شود.");
  });

  // Scenario 12: Low-priority discourse connectors do NOT split cohesive thoughts unnecessarily
  it("keeps sentences connected with low-priority discourse markers (بنابراین, علاوه بر این, همچنین) within the same paragraph", () => {
    const textWithLowPriorityConnectors =
      "داروی متفورمین تولید گلوکز کبدی را کاهش می‌دهد. این اثر از طریق فعال‌سازی آنزیم AMPK اعمال می‌شود. بنابراین میزان گلوکونئوژنز در هپاتوسیت‌ها مهار می‌گردد. همچنین حساسیت به انسولین در بافت‌های محیطی بهبود می‌یابد.";

    const paragraphs = splitSpeechTextIntoParagraphs(textWithLowPriorityConnectors);

    // All 4 sentences belong to the same mechanism discussion; low-priority connectors must NOT break them into choppy paragraphs
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toContain("متفورمین");
    expect(paragraphs[0]).toContain("بنابراین");
    expect(paragraphs[0]).toContain("همچنین");
  });

  // Scenario 13: High-priority macro markers cleanly trigger new paragraphs
  it("splits paragraphs cleanly when high-priority macro topic markers indicate true thematic shifts", () => {
    const textWithMacroShift =
      "داروی متفورمین تولید گلوکز کبدی را کاهش می‌دهد. این اثر از طریق فعال‌سازی آنزیم AMPK اعمال می‌شود. از دیدگاه کاربرد بالینی، دوز اولیه 500 میلی‌گرم همراه با غذا تجویز می‌شود تا عوارض گوارشی به حداقل برسد. در بیماران با نارسایی کلیوی پایش دقیق eGFR الزامی است.";

    const paragraphs = splitSpeechTextIntoParagraphs(textWithMacroShift);

    // Must split cleanly into 2 paragraphs: Mechanism (sentences 1-2) and Clinical Application (sentences 3-4)
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toContain("AMPK");
    expect(paragraphs[0]).not.toContain("دیدگاه کاربرد بالینی");
    expect(paragraphs[1]).toContain("از دیدگاه کاربرد بالینی");
    expect(paragraphs[1]).toContain("eGFR");
  });
});

