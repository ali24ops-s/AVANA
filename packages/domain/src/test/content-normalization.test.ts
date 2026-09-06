import { describe, it, expect } from "vitest";
import {
  normalizeEducationalContent,
  resolveCalloutType,
  CALLOUT_DEFINITIONS,
} from "../index.js";

describe("Educational Content Normalization Suite (@avana/domain)", () => {
  describe("Callout Type Resolution", () => {
    it("resolves canonical types and aliases correctly", () => {
      expect(resolveCalloutType("warning")).toBe("warning");
      expect(resolveCalloutType("هشدار")).toBe("warning");
      expect(resolveCalloutType("common-mistake")).toBe("common-mistake");
      expect(resolveCalloutType("اشتباه رایج")).toBe("common-mistake");
      expect(resolveCalloutType("نکته مهم")).toBe("important");
      expect(resolveCalloutType("نکته بالینی")).toBe("clinical-point");
      expect(resolveCalloutType("منع مصرف")).toBe("contraindication");
      expect(resolveCalloutType("نکته کلیدی")).toBe("key-point");
      expect(resolveCalloutType("برای فهم بهتر")).toBe("understanding");
      expect(resolveCalloutType("توضیح تکمیلی")).toBe("supplementary");
    });

    it("has complete definition mapping for all canonical types", () => {
      expect(CALLOUT_DEFINITIONS["warning"].variant).toBe("warning");
      expect(CALLOUT_DEFINITIONS["common-mistake"].variant).toBe("warning");
      expect(CALLOUT_DEFINITIONS["important"].variant).toBe("important");
      expect(CALLOUT_DEFINITIONS["tip"].variant).toBe("tip");
      expect(CALLOUT_DEFINITIONS["clinical-point"].variant).toBe("clinical-point");
      expect(CALLOUT_DEFINITIONS["contraindication"].variant).toBe("contraindication");
      expect(CALLOUT_DEFINITIONS["key-point"].variant).toBe("key-point");
    });
  });

  describe("Legacy Emoji Trigger Recovery to Semantic Callouts", () => {
    it("recovers '⚠️ اشتباه رایج:' to canonical semantic callout", () => {
      const input = "⚠️ اشتباه رایج: این دارو نباید در بیماران آسمی مصرف شود.";
      const normalized = normalizeEducationalContent(input);
      expect(normalized).toBe("**اشتباه رایج:** این دارو نباید در بیماران آسمی مصرف شود.");
      expect(normalized).not.toContain("⚠️");
    });

    it("recovers blockquote '> ⚠️ اشتباه رایج: ...' preserving quote structure", () => {
      const input = "> ⚠️ اشتباه رایج: اگر بتابلاکرها به دلیل برونکواسپاسم منع مصرف داشته باشند...";
      const normalized = normalizeEducationalContent(input);
      expect(normalized).toBe("> **اشتباه رایج:** اگر بتابلاکرها به دلیل برونکواسپاسم منع مصرف داشته باشند...");
      expect(normalized).not.toContain("⚠️");
    });

    it("recovers bold legacy triggers (**⚠️ اشتباه رایج:**)", () => {
      const input = "**⚠️ اشتباه رایج:** بسیاری از دانشجویان پروپرانولول را اشتباه می‌گیرند.";
      const normalized = normalizeEducationalContent(input);
      expect(normalized).toBe("**اشتباه رایج:** بسیاری از دانشجویان پروپرانولول را اشتباه می‌گیرند.");
      expect(normalized).not.toContain("⚠️");
    });

    it("recovers warning variations (🚨 هشدار:, ❗ هشدار:, ⚠️ اخطار:)", () => {
      const input1 = "🚨 هشدار: خطر وقوع آریتمی قلبی در مصرف همزمان وجود دارد.";
      const input2 = "❗ هشدار: پایش سطح سرمی پتاسیم الزامی است.";
      const input3 = "> ⚠️ اخطار: در فئوکروموسیتوم بدون آلفابلاکر تجویز نشود.";

      expect(normalizeEducationalContent(input1)).toBe(
        "**هشدار:** خطر وقوع آریتمی قلبی در مصرف همزمان وجود دارد."
      );
      expect(normalizeEducationalContent(input2)).toBe(
        "**هشدار:** پایش سطح سرمی پتاسیم الزامی است."
      );
      expect(normalizeEducationalContent(input3)).toBe(
        "> **هشدار:** در فئوکروموسیتوم بدون آلفابلاکر تجویز نشود."
      );
    });

    it("recovers contraindication (⛔ منع مصرف:, 🚫 موارد منع مصرف:)", () => {
      const input1 = "⛔ منع مصرف: در نارسایی قلبی جبران‌نشده ممنوع است.";
      const input2 = "> 🚫 موارد منع مصرف: در بارداری (دسته X) کاملاً منع مصرف دارد.";

      expect(normalizeEducationalContent(input1)).toBe(
        "**منع مصرف:** در نارسایی قلبی جبران‌نشده ممنوع است."
      );
      expect(normalizeEducationalContent(input2)).toBe(
        "> **منع مصرف:** در بارداری (دسته X) کاملاً منع مصرف دارد."
      );
    });

    it("recovers clinical points (💊 نکته بالینی:, 💉 کاربرد بالینی:)", () => {
      const input = "💊 نکته بالینی: شروع اثر داروی متوپرولول خوراکی حدود ۱ ساعت است.";
      expect(normalizeEducationalContent(input)).toBe(
        "**نکته بالینی:** شروع اثر داروی متوپرولول خوراکی حدود ۱ ساعت است."
      );
    });

    it("recovers key points (🔑 نکته کلیدی:, ✅ نکته کلیدی:)", () => {
      const input1 = "🔑 نکته کلیدی: گیرنده‌های بتا-۱ عمدتاً در بافت قلب قرار دارند.";
      const input2 = "> ✅ نکته کلیدی: لابتالول همزمان گیرنده‌های α۱ و β را مهار می‌کند.";

      expect(normalizeEducationalContent(input1)).toBe(
        "**نکته کلیدی:** گیرنده‌های بتا-۱ عمدتاً در بافت قلب قرار دارند."
      );
      expect(normalizeEducationalContent(input2)).toBe(
        "> **نکته کلیدی:** لابتالول همزمان گیرنده‌های α۱ و β را مهار می‌کند."
      );
    });

    it("recovers educational tips and understanding (💡 نکته:, 🧠 برای فهم بهتر:)", () => {
      const input1 = "💡 نکته آموزشی: مصرف دارو همراه غذا فراهمی زیستی را بهبود می‌بخشد.";
      const input2 = "🧠 برای فهم بهتر: تصور کنید گیرنده مانند یک قفل و دارو کلید آن است.";

      expect(normalizeEducationalContent(input1)).toBe(
        "**نکته آموزشی:** مصرف دارو همراه غذا فراهمی زیستی را بهبود می‌بخشد."
      );
      expect(normalizeEducationalContent(input2)).toBe(
        "**برای فهم بهتر:** تصور کنید گیرنده مانند یک قفل و دارو کلید آن است."
      );
    });
  });

  describe("Idempotency: normalize(normalize(x)) === normalize(x)", () => {
    it("is strictly idempotent on legacy emoji inputs", () => {
      const input = "⚠️ اشتباه رایج: مصرف خودسرانه آنتی‌بیوتیک‌ها خطرناک است.";
      const pass1 = normalizeEducationalContent(input);
      const pass2 = normalizeEducationalContent(pass1);
      const pass3 = normalizeEducationalContent(pass2);

      expect(pass1).toBe("**اشتباه رایج:** مصرف خودسرانه آنتی‌بیوتیک‌ها خطرناک است.");
      expect(pass2).toBe(pass1);
      expect(pass3).toBe(pass1);
    });

    it("is strictly idempotent on canonical semantic inputs (> **اشتباه رایج:** ...)", () => {
      const canonical = "> **اشتباه رایج:** اگر بتابلاکرها منع مصرف داشته باشند...";
      const pass1 = normalizeEducationalContent(canonical);
      const pass2 = normalizeEducationalContent(pass1);

      expect(pass1).toBe(canonical);
      expect(pass2).toBe(canonical);
    });

    it("is strictly idempotent on complex multi-section educational documents", () => {
      const doc = [
        "# فصل فارماکولوژی قلب",
        "",
        "## ۱. مکانیسم‌های گیرنده",
        "داروهای این دسته روی گیرنده‌های $\\beta_1$ و $\\beta_2$ اثر می‌گذارند.",
        "",
        "> **هشدار:** در آسم منع مصرف دارد.",
        "",
        "| نام دارو | دوز معمول | نیمه‌عمر |",
        "|---|---|---|",
        "| پروپرانولول | 50 mg | 4 h |",
        "| متوپرولول | 100 mg | 6 h |",
        "",
        "**نکته بالینی:** پایش مداوم ضربان قلب ضروری است.",
      ].join("\n");

      const pass1 = normalizeEducationalContent(doc);
      const pass2 = normalizeEducationalContent(pass1);

      expect(pass1).toBe(doc);
      expect(pass2).toBe(doc);
    });
  });

  describe("Medical & Scientific Content Preservation", () => {
    it("preserves Greek letters (α, β, Δ, γ, μ) and chemical symbols", () => {
      const text = "اثر روی گیرنده β-blocker و α1-adrenergic با تغییرات ΔP و غلظت μg/mL.";
      expect(normalizeEducationalContent(text)).toBe(text);
    });

    it("preserves chemical formulas and reaction arrows (T4 → T3, 1,25(OH)2D)", () => {
      const text = "تبدیل $T_4 \\to T_3$ در کبد و کلیه انجام شده و $1,25(OH)_2D$ فعال می‌شود.";
      expect(normalizeEducationalContent(text)).toBe(text);
    });

    it("preserves exact drug dosages, units, and ranges", () => {
      const dosages = [
        "دوز درمانی 50 mg هر ۱۲ ساعت است.",
        "انفوزیون با سرعت 10 mcg/kg/min تجویز می‌شود.",
        "محدوده دوز 5–10 mg/h برای بیمار توصیه می‌شود.",
        "فشارخون هدف کمتر از 120/80 mmHg می‌باشد.",
      ].join("\n");

      expect(normalizeEducationalContent(dosages)).toBe(dosages);
    });

    it("preserves code blocks and inline code completely without alterations", () => {
      const markdownWithCode = [
        "در کد زیر نمونه نحوه محاسبه دوز را می‌بینید:",
        "",
        "```typescript",
        "// ⚠️ Do not change this calculation!",
        "const calculateDose = (weightKg: number, dosePerKg: number) => {",
        "  return weightKg * dosePerKg; // 50 mg baseline",
        "};",
        "```",
        "",
        "برای اجرای آن دستور `npm run calculate --dose=50mg` را بزنید.",
      ].join("\n");

      const result = normalizeEducationalContent(markdownWithCode);
      expect(result).toBe(markdownWithCode);
    });

    it("preserves Markdown tables and column alignments", () => {
      const table = [
        "| ردیف | نام دارو | دوز مجاز | وضعیت |",
        "|:---|:---|:---|:---:|",
        "| ۱ | دیلتیازم (Diltiazem) | 30-60 mg | خط اول |",
        "| ۲ | وراپامیل (Verapamil) | 80 mg | خط دوم |",
      ].join("\n");

      expect(normalizeEducationalContent(table)).toBe(table);
    });
  });

  describe("Guarding Against False Positives", () => {
    it("does not false-positive on running prose containing words without trigger structure", () => {
      const prose = "اشتباه رایج دانشجویان در محاسبه دوز داروها ناشی از عدم توجه به وزن بیمار است.";
      const result = normalizeEducationalContent(prose);
      // Must not be wrapped into a callout prefix
      expect(result).toBe(prose);
    });

    it("does not convert normal text mentioning 'نکته مهم' without colon or bold structure", () => {
      const text = "یک نکته مهم در این مبحث توجه به عملکرد کلیوی قبل از تجویز دارو است.";
      expect(normalizeEducationalContent(text)).toBe(text);
    });
  });

  describe("Regression: Callout Subtitle Colon & Orphaned Asterisks (**)", () => {
    it("recovers 'درباره سناریوی بالینی (Case Study):**' to clean canonical callout without orphaned **", () => {
      const input = "> **نکته بالینی: درباره سناریوی بالینی (Case Study):** در بیمار با نارسایی قلبی و برونکواسپاسم، تجویز بتابلاکر غیراختصاصی منع مصرف دارد.";
      const normalized = normalizeEducationalContent(input);

      expect(normalized).toBe(
        "> **نکته بالینی:** درباره سناریوی بالینی (Case Study): در بیمار با نارسایی قلبی و برونکواسپاسم، تجویز بتابلاکر غیراختصاصی منع مصرف دارد."
      );
      expect(normalized).not.toContain("Study):**");
      expect(normalized).not.toContain("بالینی (Case Study):**");
      // Remainder must not contain orphaned asterisks
      const remainder = normalized.replace("> **نکته بالینی:**", "");
      expect(remainder).not.toContain("**");
      expect(normalizeEducationalContent(normalized)).toBe(normalized);
    });

    it("recovers 'در ارتباط با کمبود آنزیمی:**' to clean canonical callout without orphaned **", () => {
      const input = "**نکته آموزشی: در ارتباط با کمبود آنزیمی:** کمبود آنزیم G6PD باعث حساسیت به داروهای اکسیدان می‌شود.";
      const normalized = normalizeEducationalContent(input);

      expect(normalized).toBe(
        "**نکته آموزشی:** در ارتباط با کمبود آنزیمی: کمبود آنزیم G6PD باعث حساسیت به داروهای اکسیدان می‌شود."
      );
      expect(normalized).not.toContain("آنزیمی:**");
      const remainder = normalized.replace("**نکته آموزشی:**", "");
      expect(remainder).not.toContain("**");
      expect(normalizeEducationalContent(normalized)).toBe(normalized);
    });

    it("recovers '(آندروژنهای آدرنال):**' to clean canonical callout without orphaned **", () => {
      const input1 = "> **نکته کلیدی: (آندروژنهای آدرنال):** ترشح DHEA توسط ACTH کنترل می‌شود.";
      const input2 = "> **نکته کلیدی (آندروژنهای آدرنال):** ترشح DHEA توسط ACTH کنترل می‌شود.";

      const norm1 = normalizeEducationalContent(input1);
      const norm2 = normalizeEducationalContent(input2);

      expect(norm1).toBe("> **نکته کلیدی:** (آندروژنهای آدرنال): ترشح DHEA توسط ACTH کنترل می‌شود.");
      expect(norm2).toBe("> **نکته کلیدی:** (آندروژنهای آدرنال): ترشح DHEA توسط ACTH کنترل می‌شود.");
      expect(norm1).not.toContain("آدرنال):**");
      expect(norm2).not.toContain("آدرنال):**");
      const remainder1 = norm1.replace("> **نکته کلیدی:**", "");
      const remainder2 = norm2.replace("> **نکته کلیدی:**", "");
      expect(remainder1).not.toContain("**");
      expect(remainder2).not.toContain("**");
      expect(normalizeEducationalContent(norm1)).toBe(norm1);
      expect(normalizeEducationalContent(norm2)).toBe(norm2);
    });

    it("cleans existing malformed callouts that already had orphaned ** after normalization", () => {
      const input1 = "> **نکته بالینی:** درباره سناریوی بالینی (Case Study):** متن سناریو";
      const input2 = "**نکته آموزشی:** در ارتباط با کمبود آنزیمی:** متن توضیح";
      const input3 = "> **نکته کلیدی:** (آندروژنهای آدرنال):** متن توضیح";

      expect(normalizeEducationalContent(input1)).toBe(
        "> **نکته بالینی:** درباره سناریوی بالینی (Case Study): متن سناریو"
      );
      expect(normalizeEducationalContent(input2)).toBe(
        "**نکته آموزشی:** در ارتباط با کمبود آنزیمی: متن توضیح"
      );
      expect(normalizeEducationalContent(input3)).toBe(
        "> **نکته کلیدی:** (آندروژنهای آدرنال): متن توضیح"
      );
    });

    it("strictly preserves legitimate Markdown bold spans inside callout body", () => {
      const input = "> **نکته مهم:** داروی **پروپرانولول** یک **بتابلاکر غیراختصاصی** است.";
      const normalized = normalizeEducationalContent(input);

      expect(normalized).toBe(
        "> **نکته مهم:** داروی **پروپرانولول** یک **بتابلاکر غیراختصاصی** است."
      );
      expect(normalized).toContain("**پروپرانولول**");
      expect(normalized).toContain("**بتابلاکر غیراختصاصی**");
    });

    it("strictly preserves multiline callouts and legitimate bold spans across lines", () => {
      const multiline = [
        "> **نکته بالینی: درباره سناریوی بالینی (Case Study):**",
        "> خط اول سناریو درباره بیمار با **نارسایی قلبی**.",
        "> خط دوم با تجویز **متوپرولول سوکسینات** با دوز 25 mg.",
      ].join("\n");

      const normalized = normalizeEducationalContent(multiline);
      const expected = [
        "> **نکته بالینی:** درباره سناریوی بالینی (Case Study):",
        "> خط اول سناریو درباره بیمار با **نارسایی قلبی**.",
        "> خط دوم با تجویز **متوپرولول سوکسینات** با دوز 25 mg.",
      ].join("\n");

      expect(normalized).toBe(expected);
      expect(normalizeEducationalContent(normalized)).toBe(expected);
    });

    it("preserves canonical callouts (> **نکته مهم:** متن) completely unchanged", () => {
      const canonical = "> **نکته مهم:** این یک متن ساده درون کال‌اوت استاندارد است.";
      expect(normalizeEducationalContent(canonical)).toBe(canonical);
    });
  });
});
