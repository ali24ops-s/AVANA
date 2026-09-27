import { describe, it, expect } from "vitest";
import {
  ContentRepairEngine,
  computeContentHash,
  splitMarkdownDocument,
} from "../content-repair/index.js";

describe("Deterministic Content Repair Engine", () => {
  describe("1. JSON Leakage Rule", () => {
    it("unwraps raw JSON session object to pure educational Markdown", () => {
      const rawJsonSession = JSON.stringify({
        kind: "session",
        title: "جلسه ۲: فارماکولوژی",
        contentMarkdown: "# جلسه ۲: فارماکولوژی\n\nداروهای مهارکننده آنزیم مبدل آنژیوتانسین.",
      });

      const candidates = ContentRepairEngine.detect(rawJsonSession);
      expect(candidates.length).toBe(1);
      expect(candidates[0].ruleId).toBe("json-leakage");
      expect(candidates[0].confidenceLevel).toBe("HIGH");

      const preview = ContentRepairEngine.preview(rawJsonSession);
      expect(preview.hasRepairs).toBe(true);
      expect(preview.repairedContent).toBe(
        "# جلسه ۲: فارماکولوژی\n\nداروهای مهارکننده آنزیم مبدل آنژیوتانسین.",
      );
      expect(preview.validation.valid).toBe(true);
    });

    it("unwraps multi-session JSON arrays", () => {
      const multiSessionJson = JSON.stringify({
        sessions: [
          { index: 0, title: "بخش ۱", contentMarkdown: "متن بخش اول" },
          { index: 1, title: "بخش ۲", contentMarkdown: "متن بخش دوم" },
        ],
      });

      const preview = ContentRepairEngine.preview(multiSessionJson);
      expect(preview.hasRepairs).toBe(true);
      expect(preview.repairedContent).toContain("متن بخش اول");
      expect(preview.repairedContent).toContain("متن بخش دوم");
    });
  });

  describe("2. LaTeX Command Corruption Rule", () => {
    it("repairs textCaC_2 and multi-term formulas to canonical \\text{...}", () => {
      const brokenFormula = "واکنش اصلی: textCaC_2 + 2textH 2O \\longrightarrow \\text{HC}\\equiv\\text{CH} + \\text{Ca(OH)}_2";
      const candidates = ContentRepairEngine.detect(brokenFormula);

      expect(candidates.some((c) => c.ruleId === "latex-command-corruption")).toBe(true);
      const preview = ContentRepairEngine.preview(brokenFormula);
      expect(preview.repairedContent).toContain("\\text{CaC}_2");
      expect(preview.repairedContent).toContain("\\text{H}_2\\text{O}");
    });

    it("repairs vertical single-character corruption when context is unambiguous", () => {
      const verticalCorruption = "t\ne\nx\nt\nC\na\nC";
      const candidates = ContentRepairEngine.detect(verticalCorruption);

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].ruleId).toBe("latex-command-corruption");
      expect(candidates[0].after).toBe("\\text{CaC}");
    });

    it("does NOT wild-guess or corrupt regular Persian lines or tables", () => {
      const regularPoem = "الف\nب\nپ\nت";
      const candidates = ContentRepairEngine.detect(regularPoem);
      expect(candidates.length).toBe(0);
    });
  });

  describe("3. LaTeX Delimiter Corruption & Guards", () => {
    it("repairs unclosed math delimiter containing LaTeX units", () => {
      const brokenMath = "چگالی محاسبه شده برابر $0.77 \\text{ g/cm}^3 است.";
      const candidates = ContentRepairEngine.detect(brokenMath);

      expect(candidates.some((c) => c.ruleId === "latex-delimiter-corruption")).toBe(true);
      const preview = ContentRepairEngine.preview(brokenMath);
      expect(preview.repairedContent).toBe("چگالی محاسبه شده برابر $0.77 \\text{ g/cm}^3$ است.");
    });

    it("strictly preserves genuine currency dollar amounts without converting to math", () => {
      const currencyText = "قیمت دارو $0.77 است و هزینه ثبت نام $100 می‌باشد.";
      const candidates = ContentRepairEngine.detect(currencyText);

      // Must NOT detect currency as corrupted math
      expect(candidates.filter((c) => c.ruleId === "latex-delimiter-corruption")).toHaveLength(0);

      const preview = ContentRepairEngine.preview(currencyText);
      expect(preview.hasRepairs).toBe(false);
      expect(preview.repairedContent).toBe(currencyText);
    });

    it("preserves already valid balanced math formulas ($E = mc^2$)", () => {
      const validMath = "طبق رابطه معروف اینشتین $E = mc^2$ انرژی با جرم هم‌ارز است.";
      const candidates = ContentRepairEngine.detect(validMath);
      expect(candidates.length).toBe(0);

      const preview = ContentRepairEngine.preview(validMath);
      expect(preview.repairedContent).toBe(validMath);
    });

    it("preserves decimal numbers alongside math ($0.62 تا $0.77 \\text{ g/cm}^3$)", () => {
      const mixedText = "محدوده چگالی از 0.62 تا $0.77 \\text{ g/cm}^3$ متغیر است.";
      const preview = ContentRepairEngine.preview(mixedText);
      expect(preview.repairedContent).toBe(mixedText);
    });
  });

  describe("4. Duplicated Fragment Rule", () => {
    it("deduplicates accidental adjacent numeric/formula lines", () => {
      const duplicateLines = "ضریب واکنش:\n0.62\n0.62\nدر نظر گرفته می‌شود.";
      const candidates = ContentRepairEngine.detect(duplicateLines);

      expect(candidates.some((c) => c.ruleId === "duplicated-fragment")).toBe(true);
      const preview = ContentRepairEngine.preview(duplicateLines);
      expect(preview.repairedContent).toBe("ضریب واکنش:\n0.62\nدر نظر گرفته می‌شود.");
    });

    it("does NOT delete intentional educational sentences or paragraph emphasis", () => {
      const intentionalProse = "این مبحث از اهمیت بسیار بالایی در آزمون جامع برخوردار است.\n\nاین مبحث از اهمیت بسیار بالایی در آزمون جامع برخوردار است.";
      const candidates = ContentRepairEngine.detect(intentionalProse);
      expect(candidates.filter((c) => c.confidenceLevel === "HIGH")).toHaveLength(0);
    });
  });

  describe("5. Trailing Metadata Leakage Rule", () => {
    it("removes trailing leaked UUID citation chunk list", () => {
      const textWithTrailingUuids =
        "متن اصلی درسنامه داروشناسی و آناتومی بالینی.\n\n" +
        '"6945baa6-20b8-4ea3-89f8-8ba26f731440",\n' +
        '"5de9a319-ed47-40c0-b2e8-c1fa7238faf3"';

      const preview = ContentRepairEngine.preview(textWithTrailingUuids);
      expect(preview.hasRepairs).toBe(true);
      expect(preview.repairedContent).toBe("متن اصلی درسنامه داروشناسی و آناتومی بالینی.");
    });

    it("strictly preserves valid UUIDs inside educational body prose", () => {
      const proseWithUuid =
        "شناسه استاندارد رفرنس علمی این پروتکل عبارت است از 6945baa6-20b8-4ea3-89f8-8ba26f731440 که در پایگاه موجود است.";
      const candidates = ContentRepairEngine.detect(proseWithUuid);
      expect(candidates.length).toBe(0);

      const preview = ContentRepairEngine.preview(proseWithUuid);
      expect(preview.repairedContent).toBe(proseWithUuid);
    });
  });

  describe("6. Broken Whitespace / Line Wrapping Rule", () => {
    it("reconnects line-wrapped chemical formula fragments", () => {
      const brokenWrap = "ترکیب حاصل Ca\nC\n₂ نام دارد.";
      const preview = ContentRepairEngine.preview(brokenWrap);

      expect(preview.hasRepairs).toBe(true);
      expect(preview.repairedContent).toContain("\\text{CaC}_2");
    });
  });

  describe("7. Block-Level Isolation (Crucial Invariant)", () => {
    it("repairs ONLY block 6 in a 10-block lesson while blocks 1-5 and 7-10 remain 100% identical", () => {
      const blocks = [
        "# ۱. مقدمه درسنامه جامع", // Block 0 (heading)
        "این پاراگراف اول از درسنامه است که کاملاً سالم و معتبر می‌باشد.", // Block 1 (p)
        "> **نکته کلیدی:** توجه به دوز داروها الزامی است.", // Block 2 (quote)
        "- مورد اول لیست\n- مورد دوم لیست", // Block 3 (list)
        "```chemical\nname: Aspirin\nsmiles: CC(=O)Oc1ccccc1C(=O)O\n```", // Block 4 (code)
        "توضیحات تکمیلی پیرامون فارماکوکینتیک و متابولیسم کبدی.", // Block 5 (p)
        "واکنش تشکیل کاربید: textCaC_2 + 2textH 2O", // Block 6 (BROKEN BLOCK)
        "| دارو | دوز استاندارد |\n|---|---|\n| کاپتوپریل | 25mg |", // Block 7 (table)
        "نتیجه‌گیری بالینی از مباحث مطرح‌شده در این فصل آموزشی.", // Block 8 (p)
        "$$E = mc^2$$", // Block 9 (math)
      ];

      const fullLessonContent = blocks.join("\n\n");
      const splitBefore = splitMarkdownDocument(fullLessonContent);
      expect(splitBefore.blocks.length).toBe(10);

      const candidates = ContentRepairEngine.detect(fullLessonContent);
      expect(candidates.length).toBe(1);
      expect(candidates[0].blockIndex).toBe(6);

      const preview = ContentRepairEngine.preview(fullLessonContent);
      expect(preview.hasRepairs).toBe(true);
      expect(preview.repairedBlockCount).toBe(1);

      const splitAfter = splitMarkdownDocument(preview.repairedContent);
      expect(splitAfter.blocks.length).toBe(10);

      // Assert blocks 0..5 are 100% byte-for-byte identical
      for (let i = 0; i <= 5; i++) {
        expect(splitAfter.blocks[i].raw).toBe(splitBefore.blocks[i].raw);
      }

      // Assert block 6 was changed
      expect(splitAfter.blocks[6].raw).not.toBe(splitBefore.blocks[6].raw);
      expect(splitAfter.blocks[6].raw).toContain("\\text{CaC}_2");
      expect(splitAfter.blocks[6].raw).toContain("\\text{H}_2\\text{O}");

      // Assert blocks 7..9 are 100% byte-for-byte identical
      for (let i = 7; i <= 9; i++) {
        expect(splitAfter.blocks[i].raw).toBe(splitBefore.blocks[i].raw);
      }
    });
  });

  describe("8. Optimistic Concurrency & Safe Apply", () => {
    it("successfully applies repairs when original hash matches", () => {
      const brokenText = "واکنش: textCaC_2";
      const origHash = computeContentHash(brokenText);

      const applyResult = ContentRepairEngine.apply(brokenText, {
        content: brokenText,
        originalHash: origHash,
      });

      expect(applyResult.success).toBe(true);
      expect(applyResult.repairedContent).toContain("\\text{CaC}_2");
      expect(applyResult.validation.valid).toBe(true);
    });

    it("rejects repair when content has changed since preview (hash mismatch)", () => {
      const brokenText = "واکنش: textCaC_2";
      const staleHash = "stale_hash_123456";

      const applyResult = ContentRepairEngine.apply(brokenText, {
        content: brokenText,
        originalHash: staleHash,
      });

      expect(applyResult.success).toBe(false);
      expect(applyResult.repairedContent).toBe(brokenText); // Untouched
      expect(applyResult.validation.valid).toBe(false);
      expect(applyResult.validation.errors[0]).toContain("Repair rejected: content changed since preview");
    });
  });
});
