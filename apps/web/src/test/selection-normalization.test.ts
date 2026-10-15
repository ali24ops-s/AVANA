import { describe, it, expect } from "vitest";
import {
  isWordCharacter,
  getWordSegments,
  expandOffsetsToWordBoundaries,
  getTextNodeEntries,
  getCharacterOffsetInContainer,
  getNodeAndOffsetAtCharacterIndex,
  createRangeFromOffsets,
} from "../utils/selectionNormalization.js";

describe("Selection Normalization Suite — Word Boundary Expansion", () => {
  describe("Word Character Classifier", () => {
    it("recognizes Persian letters, Arabic letters, English letters, and digits as word characters", () => {
      expect(isWordCharacter("م")).toBe(true);
      expect(isWordCharacter("س")).toBe(true);
      expect(isWordCharacter("ژ")).toBe(true);
      expect(isWordCharacter("آ")).toBe(true);
      expect(isWordCharacter("P")).toBe(true);
      expect(isWordCharacter("e")).toBe(true);
      expect(isWordCharacter("5")).toBe(true);
      expect(isWordCharacter("۲")).toBe(true);
      expect(isWordCharacter("۵")).toBe(true);
      expect(isWordCharacter("\u200C")).toBe(true); // ZWNJ
      expect(isWordCharacter("_")).toBe(true);
    });

    it("recognizes spaces, punctuation, quotes, and symbols as non-word delimiters", () => {
      expect(isWordCharacter(" ")).toBe(false);
      expect(isWordCharacter("\t")).toBe(false);
      expect(isWordCharacter("\n")).toBe(false);
      expect(isWordCharacter("،")).toBe(false);
      expect(isWordCharacter(".")).toBe(false);
      expect(isWordCharacter(";")).toBe(false);
      expect(isWordCharacter("؛")).toBe(false);
      expect(isWordCharacter(":")).toBe(false);
      expect(isWordCharacter("«")).toBe(false);
      expect(isWordCharacter("»")).toBe(false);
      expect(isWordCharacter("?")).toBe(false);
      expect(isWordCharacter("؟")).toBe(false);
      expect(isWordCharacter("!")).toBe(false);
      expect(isWordCharacter("(")).toBe(false);
      expect(isWordCharacter(")")).toBe(false);
    });
  });

  describe("14 Required Normalization Scenarios", () => {
    // 1. انتخاب یک حرف از ابتدای کلمه
    it("Scenario 1: expands selection of the first single character of a word to the full word", () => {
      const text = "مکانیسم اثر دارو";
      // Selecting 'م' (index 0..1)
      const res = expandOffsetsToWordBoundaries(text, 0, 1);
      expect(res.selectedText).toBe("مکانیسم");
      expect(res.startOffset).toBe(0);
      expect(res.endOffset).toBe(7);
    });

    // 2. انتخاب یک حرف از وسط کلمه
    it("Scenario 2: expands selection of a single character from the middle of a word to the full word", () => {
      const text = "مکانیسم اثر دارو";
      // In "مکانیسم" (0..7): index 3 is 'ن' (index 3..4)
      const res = expandOffsetsToWordBoundaries(text, 3, 4);
      expect(res.selectedText).toBe("مکانیسم");
      expect(res.startOffset).toBe(0);
      expect(res.endOffset).toBe(7);
    });

    // 3. انتخاب یک حرف از انتهای کلمه
    it("Scenario 3: expands selection of the last character of a word to the full word", () => {
      const text = "مکانیسم اثر دارو";
      // In "مکانیسم" (0..7): index 6 is 'م' (index 6..7)
      const res = expandOffsetsToWordBoundaries(text, 6, 7);
      expect(res.selectedText).toBe("مکانیسم");
      expect(res.startOffset).toBe(0);
      expect(res.endOffset).toBe(7);
    });

    // 4. انتخاب ناقص از ابتدا یا انتهای کلمه
    it("Scenario 4: expands partial word selection from start or end to the full word", () => {
      const text = "بررسی فارماکولوژی بالینی";
      // "فارماکولوژی" is at index 6..17
      // 4a. Selecting from start: "فارما" (6..11)
      const resFromStart = expandOffsetsToWordBoundaries(text, 6, 11);
      expect(resFromStart.selectedText).toBe("فارماکولوژی");
      expect(resFromStart.startOffset).toBe(6);
      expect(resFromStart.endOffset).toBe(17);

      // 4b. Selecting from end: "ولوژی" (12..17)
      const resFromEnd = expandOffsetsToWordBoundaries(text, 12, 17);
      expect(resFromEnd.selectedText).toBe("فارماکولوژی");
      expect(resFromEnd.startOffset).toBe(6);
      expect(resFromEnd.endOffset).toBe(17);

      // 4c. Selecting inside: "ماکو" (9..13)
      const resInside = expandOffsetsToWordBoundaries(text, 9, 13);
      expect(resInside.selectedText).toBe("فارماکولوژی");
      expect(resInside.startOffset).toBe(6);
      expect(resInside.endOffset).toBe(17);
    });

    // 5. انتخاب چند کلمه با مرزهای ناقص
    it("Scenario 5: expands multi-word selection with partial boundaries to fully selected outer words", () => {
      const text = "مهار ساخت دیواره سلولی باکتری";
      // "ساخت" is 5..9, "دیواره" is 10..16, "سلولی" is 17..22
      // User selects "خت دیواره سلو" (indices 7 to 20)
      const res = expandOffsetsToWordBoundaries(text, 7, 20);
      expect(res.selectedText).toBe("ساخت دیواره سلولی");
      expect(res.startOffset).toBe(5);
      expect(res.endOffset).toBe(22);
      // Ensure "مهار" before and "باکتری" after are NOT included
      expect(res.selectedText.includes("مهار")).toBe(false);
      expect(res.selectedText.includes("باکتری")).toBe(false);
    });

    // 6. انتخاب هر بخش از واژه دارای نیم‌فاصله
    it("Scenario 6: handles Persian compound words with ZWNJ (نیم‌فاصله) correctly without expanding to adjacent words", () => {
      const text = "نیمه‌عمر دارو کوتاه است";
      // "نیمه‌عمر" is 0..8: "نیمه" (0..4) + ZWNJ (4..5) + "عمر" (5..8)
      // "دارو" is 9..13

      // 6a. Selecting first part "نیمه" (0..4)
      const res1 = expandOffsetsToWordBoundaries(text, 0, 4);
      expect(res1.selectedText).toBe("نیمه‌عمر");
      expect(res1.startOffset).toBe(0);
      expect(res1.endOffset).toBe(8);

      // 6b. Selecting second part "عمر" (5..8)
      const res2 = expandOffsetsToWordBoundaries(text, 5, 8);
      expect(res2.selectedText).toBe("نیمه‌عمر");
      expect(res2.startOffset).toBe(0);
      expect(res2.endOffset).toBe(8);

      // 6c. Selecting only one char inside ZWNJ word: "ه" (3..4)
      const res3 = expandOffsetsToWordBoundaries(text, 3, 4);
      expect(res3.selectedText).toBe("نیمه‌عمر");
      expect(res3.startOffset).toBe(0);
      expect(res3.endOffset).toBe(8);

      // 6d. Verifying another common Persian ZWNJ word: "می‌شود"
      const text2 = "تجویز دارو موجب درمان می‌شود و بیمار بهبود می‌یابد.";
      const mIdx = text2.indexOf("می‌شود");
      const resVerb = expandOffsetsToWordBoundaries(text2, mIdx, mIdx + 2); // "می"
      expect(resVerb.selectedText).toBe("می‌شود");
    });

    // 7. انتخاب بخشی از کلمه انگلیسی در متن فارسی
    it("Scenario 7: expands partial English words in Persian text cleanly", () => {
      const text = "داروی Penicillin مؤثر است";
      // "Penicillin" starts at index 6, ends at index 16
      // Selecting partial English word "Penic" (6..11)
      const res = expandOffsetsToWordBoundaries(text, 6, 11);
      expect(res.selectedText).toBe("Penicillin");
      expect(res.startOffset).toBe(6);
      expect(res.endOffset).toBe(16);
      expect(res.selectedText.includes("داروی")).toBe(false);
      expect(res.selectedText.includes("مؤثر")).toBe(false);
    });

    // 8. انتخاب عدد و ترکیب حرف و عدد مانند B12
    it("Scenario 8: handles numbers, Persian numerals, and alphanumeric combinations like B12", () => {
      const text = "ویتامین B12 و 500 میلی‌گرم و ۲۵۰ عدد";
      // "B12" starts at 8, ends at 11
      const resB12 = expandOffsetsToWordBoundaries(text, 8, 9); // selecting just 'B'
      expect(resB12.selectedText).toBe("B12");

      const resB12Digit = expandOffsetsToWordBoundaries(text, 9, 10); // selecting '1' in B12
      expect(resB12Digit.selectedText).toBe("B12");

      // Number "500" starts at 14, ends at 17
      const res500 = expandOffsetsToWordBoundaries(text, 14, 16); // selecting '50'
      expect(res500.selectedText).toBe("500");

      // Persian numerals "۲۵۰"
      const pIdx = text.indexOf("۲۵۰");
      const resPersianNum = expandOffsetsToWordBoundaries(text, pIdx, pIdx + 1); // selecting '۲'
      expect(resPersianNum.selectedText).toBe("۲۵۰");
    });

    // 9. انتخاب کامل یک کلمه
    it("Scenario 9: leaves an already fully selected word unchanged without unnecessary modification", () => {
      const text = "مکانیسم اثر دارو";
      // "مکانیسم" (0..7)
      const res = expandOffsetsToWordBoundaries(text, 0, 7);
      expect(res.selectedText).toBe("مکانیسم");
      expect(res.startOffset).toBe(0);
      expect(res.endOffset).toBe(7);
    });

    // 10. انتخاب چند کلمه کامل
    it("Scenario 10: leaves already fully selected multiple words unchanged with intact spaces", () => {
      const text = "مهار ساخت دیواره سلولی باکتری";
      // "ساخت دیواره" (5..16)
      const res = expandOffsetsToWordBoundaries(text, 5, 16);
      expect(res.selectedText).toBe("ساخت دیواره");
      expect(res.startOffset).toBe(5);
      expect(res.endOffset).toBe(16);
    });

    // 11. عدم گسترش به کلمات مجاور لمس‌نشده
    it("Scenario 11: strictly avoids expanding into untouched adjacent words", () => {
      const text = "مهار ساخت دیواره سلولی";
      // Selecting part of "ساخت" (5..8)
      const res = expandOffsetsToWordBoundaries(text, 5, 8);
      expect(res.selectedText).toBe("ساخت");
      expect(res.startOffset).toBe(5);
      expect(res.endOffset).toBe(9);
      // Untouched "مهار" before (0..4) and "دیواره" after (10..16) must NOT be added
      expect(res.startOffset).toBeGreaterThanOrEqual(5);
      expect(res.endOffset).toBeLessThanOrEqual(9);

      // Selecting "دیواره" (10..16) touching only character 'د' (10..11)
      const resDiware = expandOffsetsToWordBoundaries(text, 10, 11);
      expect(resDiware.selectedText).toBe("دیواره");
      expect(resDiware.startOffset).toBe(10);
      expect(resDiware.endOffset).toBe(16);
    });

    // 12. رفتار انتخاب صرفاً شامل فاصله یا علائم نگارشی
    it("Scenario 12: does not expand selections consisting solely of spaces, tabs, or punctuation", () => {
      const text = "مهار ساخت ، دیواره سلولی .";
      // Selecting the space between "مهار" and "ساخت" (4..5)
      const resSpace = expandOffsetsToWordBoundaries(text, 4, 5);
      expect(resSpace.selectedText).toBe(" ");
      expect(resSpace.startOffset).toBe(4);
      expect(resSpace.endOffset).toBe(5);

      // Selecting punctuation "،"
      const pIdx = text.indexOf("،");
      const resPunct = expandOffsetsToWordBoundaries(text, pIdx, pIdx + 1);
      expect(resPunct.selectedText).toBe("،");
      expect(resPunct.startOffset).toBe(pIdx);
      expect(resPunct.endOffset).toBe(pIdx + 1);
    });

    // 13. حفظ صحیح فاصله‌ها و علائم نگارشی بین کلمات انتخاب‌شده
    it("Scenario 13: strictly preserves all punctuation, quotes, and whitespace between touched words", () => {
      const text = "داروی پنی‌سیلین (تولید ۱۹۲۸)، بسیار مؤثر است.";
      // User selects from middle of "پنی‌سیلین" to middle of "مؤثر"
      const startPeni = text.indexOf("سیلین");
      const endMoaser = text.indexOf("مؤث");
      const res = expandOffsetsToWordBoundaries(text, startPeni, endMoaser + 3);

      expect(res.selectedText).toBe("پنی‌سیلین (تولید ۱۹۲۸)، بسیار مؤثر");
      // All interior formatting (parentheses, year number, comma, spaces) is intact
      expect(res.selectedText).toContain("(تولید ۱۹۲۸)، بسیار");
    });

    // 14. مدیریت آفست‌های نامعتبر و محدوده خالی
    it("Scenario 14: handles empty string, inverted offsets, and out-of-bounds offsets safely", () => {
      // Empty string
      const emptyRes = expandOffsetsToWordBoundaries("", 0, 5);
      expect(emptyRes.selectedText).toBe("");
      expect(emptyRes.startOffset).toBe(0);
      expect(emptyRes.endOffset).toBe(0);

      // Inverted offsets (start > end)
      const invertedRes = expandOffsetsToWordBoundaries("مکانیسم اثر", 7, 2);
      expect(invertedRes.selectedText).toBe("مکانیسم");
      expect(invertedRes.startOffset).toBe(0);
      expect(invertedRes.endOffset).toBe(7);

      // Out-of-bounds offsets
      const oobRes = expandOffsetsToWordBoundaries("مکانیسم", -10, 100);
      expect(oobRes.selectedText).toBe("مکانیسم");
      expect(oobRes.startOffset).toBe(0);
      expect(oobRes.endOffset).toBe(7);

      // Collapsed offset (start === end)
      const collapsedRes = expandOffsetsToWordBoundaries("مکانیسم", 3, 3);
      expect(collapsedRes.selectedText).toBe("");
      expect(collapsedRes.startOffset).toBe(3);
      expect(collapsedRes.endOffset).toBe(3);
    });
  });

  describe("DOM Text Node Traversal and Mapping", () => {
    it("extracts text node entries while strictly ignoring PRE, CODE, SCRIPT, and STYLE elements", () => {
      const container = document.createElement("div");
      container.innerHTML = `
        <p>مقدمه داروشناسی</p>
        <pre><code>const secretCode = 123;</code></pre>
        <p>فصل <strong>اول</strong> کتاب</p>
        <script>console.log("ignore me");</script>
        <style>.test { color: red; }</style>
      `;

      const { entries, fullText } = getTextNodeEntries(container);
      expect(fullText).toContain("مقدمه داروشناسی");
      expect(fullText).toContain("فصل اول کتاب");
      expect(fullText).not.toContain("secretCode");
      expect(fullText).not.toContain("ignore me");
      expect(fullText).not.toContain(".test");
      expect(entries.length).toBeGreaterThanOrEqual(3);
    });

    it("maps character offsets to accurate DOM text nodes and creates valid Range", () => {
      const container = document.createElement("div");
      container.innerHTML = "<p>این دارو با <strong>مهار ساخت</strong> دیواره سلولی عمل می‌کند.</p>";

      const { entries, fullText } = getTextNodeEntries(container);
      const mIdx = fullText.indexOf("مهار ساخت");
      expect(mIdx).toBeGreaterThan(0);

      const range = createRangeFromOffsets(container, mIdx, mIdx + "مهار ساخت".length, entries);
      expect(range).not.toBeNull();
      expect(range?.startContainer.textContent).toBe("مهار ساخت");
      expect(range?.startOffset).toBe(0);
      expect(range?.endOffset).toBe("مهار ساخت".length);

      // Verify getNodeAndOffsetAtCharacterIndex directly
      const startPoint = getNodeAndOffsetAtCharacterIndex(entries, mIdx, false);
      expect(startPoint).not.toBeNull();
      expect(startPoint?.node.textContent).toBe("مهار ساخت");
      expect(startPoint?.offset).toBe(0);

      // Verify getCharacterOffsetInContainer directly
      if (startPoint) {
        const computedOffset = getCharacterOffsetInContainer(
          container,
          startPoint.node,
          startPoint.offset,
          entries,
        );
        expect(computedOffset).toBe(mIdx);
      }
    });

    it("segments text into structured word units using getWordSegments", () => {
      const segments = getWordSegments("نیمه‌عمر دارو B12");
      const words = segments.filter((s) => s.isWord).map((s) => s.text);
      expect(words).toEqual(["نیمه‌عمر", "دارو", "B12"]);
    });
  });
});
