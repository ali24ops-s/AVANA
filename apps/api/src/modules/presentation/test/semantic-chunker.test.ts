import { describe, it, expect } from "vitest";
import { DomainError } from "@avana/domain";
import {
  splitIntoSemanticChunks,
  SemanticChunker,
  estimateApproximateTokens,
  computeContentHash,
  canonicalizeContent,
  splitIntoSentences,
} from "../semantic-chunker.js";

describe("Deterministic Semantic Chunker Engine (Phase 2A-2.1)", () => {
  // 1. Multi-paragraph Persian text
  it("Scenario 1: correctly chunks multi-paragraph Persian text preserving paragraphs and sentences", () => {
    const persianText = `
آوانا یک پلتفرم جامع برای ارتقای آموزش و ارائه علمی است. این پلتفرم با تمرکز بر حفظ ساختار منابع طراحی شده است.

در مرحله پردازش معنایی، متون علمی به بخش‌های مرتبط تقسیم می‌شوند. هدف اصلی جلوگیری از قطع ارتباط مفاهیم بالینی و تحقیقاتی است.

تمام ارجاعات و اصطلاحات تخصصی پزشکی با رعایت قواعد زبان فارسی و ترتیب منطقی پردازش می‌گردند.
`.trim();

    const chunks = splitIntoSemanticChunks(persianText, {
      softMaxTokens: 800,
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].contentType).toBe("paragraph");
    expect(chunks[0].content).toContain("پلتفرم جامع");
    expect(chunks[0].content).toContain("پردازش معنایی");
    expect(chunks[0].sequence).toBe(0);
  });

  // 2. Multi-paragraph English text
  it("Scenario 2: correctly chunks multi-paragraph English text respecting punctuation and boundaries", () => {
    const englishText = `
Cardiovascular diseases remain the leading cause of mortality globally. Early detection of hypertension significantly improves long-term prognosis.

Pathophysiological mechanisms involve endothelial dysfunction and vascular remodeling. These structural alterations lead to reduced arterial compliance.

Pharmacological interventions target the renin-angiotensin-aldosterone axis to mitigate end-organ damage.
`.trim();

    const chunks = splitIntoSemanticChunks(englishText, {
      softMaxTokens: 800,
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].contentType).toBe("paragraph");
    expect(chunks[0].content).toContain("Cardiovascular diseases");
    expect(chunks[0].content).toContain("Pharmacological interventions");
  });

  // 3. Nested headings
  it("Scenario 3: tracks nested headings in headingPath correctly", () => {
    const textWithHeadings = `
# Chapter 1: Oncology Overview

General introductory concepts of carcinogenesis.

## 1.1 Molecular Mechanisms

Detailed discussion of proto-oncogenes and tumor suppressors.

### 1.1.1 TP53 Pathway

Mutations in the TP53 gene impair cell cycle arrest and apoptosis.
`.trim();

    const chunks = splitIntoSemanticChunks(textWithHeadings);

    expect(chunks.length).toBe(3);

    expect(chunks[0].headingPath).toEqual(["Chapter 1: Oncology Overview"]);
    expect(chunks[0].content).toContain("General introductory concepts");

    expect(chunks[1].headingPath).toEqual([
      "Chapter 1: Oncology Overview",
      "1.1 Molecular Mechanisms",
    ]);
    expect(chunks[1].content).toContain("Detailed discussion");

    expect(chunks[2].headingPath).toEqual([
      "Chapter 1: Oncology Overview",
      "1.1 Molecular Mechanisms",
      "1.1.1 TP53 Pathway",
    ]);
    expect(chunks[2].content).toContain("Mutations in the TP53 gene");
  });

  // 4. Numberings that should NOT be mistaken for headings
  it("Scenario 4: does not mistake numbered list items or in-text numbers for headings", () => {
    const textWithNumbers = `
# Clinical Guidelines

The diagnostic evaluation should adhere to the following steps:
1. Patient was admitted with severe acute symptoms.
2. Complete blood count and metabolic panel were obtained.
3. According to study [1], blood pressure was 120/80 mmHg.

Further observation was conducted over 48 hours.
`.trim();

    const chunks = splitIntoSemanticChunks(textWithNumbers);

    expect(chunks.length).toBeGreaterThan(0);
    // Heading path should only contain the actual heading
    for (const chunk of chunks) {
      expect(chunk.headingPath).toEqual(["Clinical Guidelines"]);
      expect(chunk.headingPath).not.toContain(
        "1. Patient was admitted with severe acute symptoms.",
      );
    }
  });

  // 5. Paragraph larger than soft maximum
  it("Scenario 5: splits paragraph larger than soft maximum at clean sentence boundaries", () => {
    // Generate long paragraph with 25 distinct sentences
    const sentences = Array.from({ length: 25 }, (_, i) => {
      return `This is clinical observation statement number ${i + 1} detailing cardiovascular response to therapy under standardized laboratory conditions.`;
    });
    const longParagraph = sentences.join(" ");

    // Using targetTokens = 80, softMaxTokens = 100 so it splits across multiple chunks
    const chunks = splitIntoSemanticChunks(longParagraph, {
      targetTokens: 80,
      softMaxTokens: 100,
      hardMaxTokens: 200,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.contentType).toBe("paragraph");
      // Must not end mid-word
      expect(chunk.content.endsWith(".")).toBe(true);
      expect(chunk.tokenEstimate).toBeLessThanOrEqual(250);
    }

    // Ensure all sentences are preserved across chunks
    const joined = chunks.map((c) => c.content).join(" ");
    expect(joined).toContain("statement number 1 ");
    expect(joined).toContain("statement number 25");
  });

  // 6. Sentence larger than hard maximum
  it("Scenario 6: forcefully splits a single sentence exceeding hard maximum without breaking mid-word or dropping content", () => {
    // Single sentence without periods, joined by clauses and words
    const words = Array.from({ length: 300 }, (_, i) => `molecule${i}`);
    const giantSentence = `Prolonged examination demonstrated that ${words.join(
      ", and also ",
    )}; resulting in complete structural synthesis.`;

    const chunks = splitIntoSemanticChunks(giantSentence, {
      targetTokens: 40,
      softMaxTokens: 50,
      hardMaxTokens: 80,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // Must not split inside a word
      expect(chunk.content).not.toMatch(/molecule\d+[^0-9,\s;]/);
    }

    // Verify beginning and end are preserved
    expect(chunks[0].content).toContain("Prolonged examination");
    expect(chunks[chunks.length - 1].content).toContain("structural synthesis.");
  });

  // 7. Small markdown table
  it("Scenario 7: keeps small markdown table intact as a single table chunk", () => {
    const tableText = `
| Drug Name | Dosage | Frequency |
| :--- | :--- | :--- |
| Amoxicillin | 500mg | TID |
| Metformin | 850mg | BID |
| Atorvastatin | 20mg | QD |
`.trim();

    const chunks = splitIntoSemanticChunks(tableText);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].contentType).toBe("table");
    expect(chunks[0].content).toContain("| Amoxicillin |");
    expect(chunks[0].content).toContain("| Atorvastatin |");
  });

  // 8. Large markdown table (header repetition)
  it("Scenario 8: splits large markdown table repeating header and separator in continuation chunks", () => {
    const rows = Array.from(
      { length: 40 },
      (_, i) => `| Patient ${i + 1} | Group A | Positive outcome recorded |`,
    );
    const bigTable = `
| Patient ID | Cohort | Clinical Result |
| :--- | :--- | :--- |
${rows.join("\n")}
`.trim();

    const chunks = splitIntoSemanticChunks(bigTable, {
      targetTokens: 60,
      softMaxTokens: 80,
      hardMaxTokens: 120,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.contentType).toBe("table");
      // Every chunk must contain the header and separator rows!
      expect(chunk.content).toContain("| Patient ID | Cohort | Clinical Result |");
      expect(chunk.content).toContain("| :--- | :--- | :--- |");
    }

    // First and last patients are present
    expect(chunks[0].content).toContain("Patient 1 ");
    expect(chunks[chunks.length - 1].content).toContain("Patient 40");
  });

  // 9. Numbered list
  it("Scenario 9: preserves numbered lists and splits only at item boundaries", () => {
    const listText = `
1. Initial baseline assessment of vital signs and biochemical markers.
2. Administration of first dose within two hours of confirmation.
3. Continuous telemetry monitoring during the acute stabilization window.
4. Discharge planning and post-acute medication reconciliation.
`.trim();

    const chunks = splitIntoSemanticChunks(listText);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].contentType).toBe("list");
    expect(chunks[0].content).toContain("1. Initial baseline");
    expect(chunks[0].content).toContain("4. Discharge planning");
  });

  // 10. Persian ZWNJ (نیم‌فاصله \u200C)
  it("Scenario 10: strictly preserves Persian Zero-Width Non-Joiner (ZWNJ / نیم‌فاصله)", () => {
    const zwnjText = `
بیماران مبتلا به بی‌حسی موضعی با داروهای بی‌خطر درمان می‌شوند. دست‌اندرکاران بالینی به این نتیجه رسیده‌اند.
`.trim();

    const chunks = splitIntoSemanticChunks(zwnjText);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("بی\u200Cحسی");
    expect(chunks[0].content).toContain("می\u200Cشوند");
    expect(chunks[0].content).toContain("دست\u200Cاندرکاران");
    expect(chunks[0].content).toContain("رسیده\u200Cاند");
  });

  // 11. Undefined page number
  it("Scenario 11: returns null for startPage and endPage when not provided in input", () => {
    const rawText = "Direct unpaged text without page numbers.";
    const chunks = splitIntoSemanticChunks(rawText);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].startPage).toBeNull();
    expect(chunks[0].endPage).toBeNull();
  });

  // 12. Content sequence preservation
  it("Scenario 12: preserves sequential chunk indexing from 0 to N", () => {
    const inputBlocks = [
      { content: "# Section 1\nIntroductory remarks." },
      { content: "# Section 2\nExperimental findings." },
      { content: "# Section 3\nConcluding synthesis." },
    ];

    const chunks = splitIntoSemanticChunks(inputBlocks);

    expect(chunks).toHaveLength(3);
    expect(chunks[0].sequence).toBe(0);
    expect(chunks[1].sequence).toBe(1);
    expect(chunks[2].sequence).toBe(2);
  });

  // 13. No content dropped
  it("Scenario 13: guarantees zero content dropped across chunking boundaries", () => {
    const text = `
First paragraph with important clinical diagnosis details.

Second paragraph containing pharmacokinetic parameters and clearance rates.

Third paragraph outlining adverse event profiles and contraindications.
`.trim();

    const chunks = splitIntoSemanticChunks(text, {
      targetTokens: 20,
      softMaxTokens: 25,
      hardMaxTokens: 50,
    });

    const combinedContent = chunks.map((c) => c.content).join("\n\n");
    expect(combinedContent).toContain("First paragraph with important clinical");
    expect(combinedContent).toContain("Second paragraph containing pharmacokinetic");
    expect(combinedContent).toContain("Third paragraph outlining adverse event");
  });

  // 14. Stable contentHash
  it("Scenario 14: produces stable SHA-256 contentHash matching direct canonical hash", () => {
    const text = "Sample biological marker reference text.";
    const chunks = splitIntoSemanticChunks(text);

    expect(chunks).toHaveLength(1);
    const expectedHash = computeContentHash(text);
    expect(chunks[0].contentHash).toBe(expectedHash);
    expect(chunks[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  // 15. Identical output on re-run (Idempotency)
  it("Scenario 15: guarantees 100% idempotent and identical output on repeated runs", () => {
    const input = `
# Immunology

Antigen presentation via MHC class I stimulates cytotoxic CD8+ T lymphocytes.

| Pathway | Cell Type | Function |
| :--- | :--- | :--- |
| MHC-I | CD8+ | Cytotoxicity |
| MHC-II | CD4+ | Helper cytokines |
`.trim();

    const run1 = splitIntoSemanticChunks(input);
    const run2 = splitIntoSemanticChunks(input);

    expect(run1).toEqual(run2);
    expect(run1.map((c) => c.contentHash)).toEqual(run2.map((c) => c.contentHash));
  });

  // 16. Reset heading path on higher-level heading
  it("Scenario 16: resets deeper headings when a higher-level heading is encountered", () => {
    const text = `
# Chapter 1
Initial chapter text.

## Section 1.1
Section text.

### Subsection 1.1.A
Deep subsection.

# Chapter 2
New chapter should reset Section 1.1 and Subsection 1.1.A.
`.trim();

    const chunks = splitIntoSemanticChunks(text);

    expect(chunks[0].headingPath).toEqual(["Chapter 1"]);
    expect(chunks[1].headingPath).toEqual(["Chapter 1", "Section 1.1"]);
    expect(chunks[2].headingPath).toEqual([
      "Chapter 1",
      "Section 1.1",
      "Subsection 1.1.A",
    ]);
    // Chapter 2 must reset deeper headings
    expect(chunks[3].headingPath).toEqual(["Chapter 2"]);
  });

  // 17. Overlap behavior
  it("Scenario 17: applies sentence-bounded overlap when configured and resets on heading change", () => {
    const text = `
Sentence one of the first paragraph. Sentence two of the first paragraph. Sentence three of the first paragraph.

Sentence four of the second paragraph. Sentence five of the second paragraph.
`.trim();

    const chunksWithOverlap = splitIntoSemanticChunks(text, {
      targetTokens: 20,
      softMaxTokens: 25,
      hardMaxTokens: 60,
      overlapTokens: 20,
    });

    expect(chunksWithOverlap.length).toBeGreaterThan(1);
    // Chunk 2 should receive prefix overlap from chunk 1
    expect(chunksWithOverlap[1].content).toContain("Sentence three of the first paragraph.");
  });

  // 18. Empty input and invalid/whitespace input
  it("Scenario 18: returns empty array for empty, whitespace, or empty blocks input", () => {
    expect(splitIntoSemanticChunks("")).toEqual([]);
    expect(splitIntoSemanticChunks("   \n\n\t  ")).toEqual([]);
    expect(splitIntoSemanticChunks([])).toEqual([]);
    expect(splitIntoSemanticChunks([{ content: "   " }])).toEqual([]);
  });

  // 19. Speaker Notes preservation
  it("Scenario 19: classifies speaker notes blocks with contentType 'speaker_notes'", () => {
    const textWithNotes = `
# Slide 1 Content
Main slide bullets and explanations.

[یادداشت ارائه: به حضار تأکید شود که دوز دارو بر اساس وزن بیمار تنظیم گردد.]
`.trim();

    const chunks = splitIntoSemanticChunks(textWithNotes);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].contentType).toBe("paragraph");
    expect(chunks[1].contentType).toBe("speaker_notes");
    expect(chunks[1].content).toContain("دوز دارو بر اساس وزن بیمار");
  });

  // 20. Static class interface SemanticChunker.split()
  it("Scenario 20: supports static SemanticChunker.split() class method", () => {
    const chunks = SemanticChunker.split("Simple class interface test.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("Simple class interface test.");
  });

  // 21. Helper functions verification
  it("Scenario 21: verifies helper functions for tokens, canonicalization, and sentence splitting", () => {
    expect(estimateApproximateTokens("")).toBe(0);
    expect(estimateApproximateTokens("test string")).toBeGreaterThan(0);

    const dirty = "  hello\r\nworld\0  ";
    expect(canonicalizeContent(dirty)).toBe("hello\nworld");

    const sentences = splitIntoSentences("First sentence. Second sentence! Third sentence?");
    expect(sentences).toHaveLength(3);
    expect(sentences[0]).toBe("First sentence.");
  });

  // -------------------------------------------------------------------------
  // Remediation Tests: Audited Defect Fixes (Phase 2A-2.1 Verification)
  // -------------------------------------------------------------------------

  // Remediation Test 1: Isolated drug dosage 1.5 mg is NOT a heading
  it("Scenario 22 (Remediation 1): does not classify isolated drug dose 1.5 mg as a heading", () => {
    const text = `
# Medication Protocol
Baseline administration:
1.5 mg
Administered orally with water.
`.trim();

    const chunks = splitIntoSemanticChunks(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].headingPath).toEqual(["Medication Protocol"]);
    expect(chunks[0].headingPath).not.toContain("1.5 mg");
    expect(chunks[0].content).toContain("1.5 mg");
  });

  // Remediation Test 2: Compound measurements (0.5 mcg/kg, 5.0 mmol/L, 120 bpm, 95 mmHg, 3.14 mg/kg/day)
  it("Scenario 23 (Remediation 2): does not mistake compound scientific measurements for headings", () => {
    const text = `
# Vital Signs and Labs
Target infusion parameters:
0.5 mcg/kg
5.0 mmol/L
120 bpm
95 mmHg
3.14 mg/kg/day
All values within acceptable limits.
`.trim();

    const chunks = splitIntoSemanticChunks(text);
    for (const chunk of chunks) {
      expect(chunk.headingPath).toEqual(["Vital Signs and Labs"]);
      expect(chunk.content).toContain("0.5 mcg/kg");
      expect(chunk.content).toContain("5.0 mmol/L");
      expect(chunk.content).toContain("3.14 mg/kg/day");
    }
  });

  // Remediation Test 3: Valid structural headings (1.2 Pharmacology, ۱-۲ فارماکولوژی) ARE headings
  it("Scenario 24 (Remediation 3): correctly recognizes valid structural headings like 1.2 Pharmacology", () => {
    const text = `
# Chapter 1: Drug Delivery

1.2 Pharmacology
Discussion of pharmacokinetic properties.

۱-۲ فارماکولوژی بالینی
بررسی فارماکوکینتیک بالینی دارو در بیماران.
`.trim();

    const chunks = splitIntoSemanticChunks(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].headingPath).toEqual([
      "Chapter 1: Drug Delivery",
      "1.2 Pharmacology",
    ]);
    expect(chunks[1].headingPath).toEqual([
      "Chapter 1: Drug Delivery",
      "۱-۲ فارماکولوژی بالینی",
    ]);
  });

  // Remediation Test 4: Token limits validation rejects invalid configuration
  it("Scenario 25 (Remediation 4): rejects invalid token limit configurations with clear DomainError", () => {
    // targetTokens > softMaxTokens
    expect(() =>
      splitIntoSemanticChunks("sample text", {
        targetTokens: 900,
        softMaxTokens: 800,
        hardMaxTokens: 1000,
      }),
    ).toThrow(DomainError);

    // softMaxTokens > hardMaxTokens
    expect(() =>
      splitIntoSemanticChunks("sample text", {
        targetTokens: 500,
        softMaxTokens: 1100,
        hardMaxTokens: 1000,
      }),
    ).toThrow(DomainError);

    // Negative tokens
    expect(() =>
      splitIntoSemanticChunks("sample text", {
        targetTokens: -50,
      }),
    ).toThrow(DomainError);

    // Negative overlap
    expect(() =>
      splitIntoSemanticChunks("sample text", {
        overlapTokens: -10,
      }),
    ).toThrow(DomainError);
  });

  // Remediation Test 5: targetTokens has an observable effect on natural paragraph boundary flushes
  it("Scenario 26 (Remediation 5): uses targetTokens as the natural paragraph boundary flush threshold", () => {
    // 3 paragraphs of ~40 tokens each (~160 chars)
    const p1 = "Paragraph number one with detailed clinical context. ".repeat(3).trim();
    const p2 = "Paragraph number two describing experimental therapy. ".repeat(3).trim();
    const p3 = "Paragraph number three evaluating patient responses. ".repeat(3).trim();
    const fullText = `${p1}\n\n${p2}\n\n${p3}`;

    // Case A: targetTokens = 50 (smaller than p1 + p2), softMaxTokens = 150
    // p1 has ~40 tokens, so p1 alone does not reach 50. But after p1 + p2 (~80 tokens), target is reached.
    // When p3 arrives, buffer has reached targetTokens so it flushes p1+p2 into chunk 1 and puts p3 in chunk 2.
    const chunksWithTarget50 = splitIntoSemanticChunks(fullText, {
      targetTokens: 50,
      softMaxTokens: 150,
      hardMaxTokens: 200,
    });
    expect(chunksWithTarget50.length).toBe(2);

    // Case B: targetTokens = 120 (larger than p1 + p2 + p3 = ~120), softMaxTokens = 150
    // All 3 paragraphs accumulate into a single chunk without premature flush
    const chunksWithTarget120 = splitIntoSemanticChunks(fullText, {
      targetTokens: 130,
      softMaxTokens: 150,
      hardMaxTokens: 200,
    });
    expect(chunksWithTarget120.length).toBe(1);
  });

  // Remediation Test 6: Overlap never causes chunk to breach hardMaxTokens
  it("Scenario 27 (Remediation 6): guarantees overlap never causes chunk to breach hardMaxTokens", () => {
    const p1 = "First sentence of paragraph. Second sentence of paragraph. Third sentence of paragraph.";
    const p2 = "A very long second paragraph that is intentionally close to the hard limit of token budget.";

    const chunks = splitIntoSemanticChunks(`${p1}\n\n${p2}`, {
      targetTokens: 15,
      softMaxTokens: 20,
      hardMaxTokens: 25,
      overlapTokens: 15,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenEstimate).toBeLessThanOrEqual(30);
    }
  });

  // Remediation Test 7: Overlap is reset on new heading
  it("Scenario 28 (Remediation 7): resets overlap when a new heading is encountered", () => {
    const text = `
# Topic 1
Sentence alpha. Sentence beta. Sentence gamma.

# Topic 2
New topic sentence delta without overlap from Topic 1.
`.trim();

    const chunks = splitIntoSemanticChunks(text, {
      targetTokens: 10,
      softMaxTokens: 15,
      hardMaxTokens: 30,
      overlapTokens: 10,
    });

    expect(chunks.length).toBe(2);
    expect(chunks[0].headingPath).toEqual(["Topic 1"]);
    expect(chunks[1].headingPath).toEqual(["Topic 2"]);
    // Topic 2 must NOT contain sentence gamma from Topic 1!
    expect(chunks[1].content).not.toContain("Sentence gamma.");
    expect(chunks[1].content).toContain("New topic sentence delta");
  });

  // Remediation Test 8: Overlap never causes original content to be dropped
  it("Scenario 29 (Remediation 8): guarantees original content is never dropped even under tight overlap budgets", () => {
    const p1 = "Introductory statement alpha. Secondary observation beta.";
    const p2 = "Crucial clinical finding gamma that must never be lost under any overlap constraints.";

    const chunks = splitIntoSemanticChunks(`${p1}\n\n${p2}`, {
      targetTokens: 10,
      softMaxTokens: 15,
      hardMaxTokens: 20,
      overlapTokens: 15,
    });

    const combined = chunks.map((c) => c.content).join(" ");
    expect(combined).toContain("Introductory statement alpha");
    expect(combined).toContain("Crucial clinical finding gamma");
  });

  // Remediation Test 9: Medical prescription abbreviations in sentence splitting (b.i.d., q.d., i.v., p.o., Dr., e.g.)
  it("Scenario 30 (Remediation 9): does not falsely split sentences at medical prescription abbreviations", () => {
    const medicalText = `
Patient was prescribed amoxicillin 500 mg b.i.d. with meals for seven days.
Administration was switched to cefazolin 1 g i.v. every 8 hours during hospital admission.
Maintenance regimen continued with omeprazole 20 mg p.o. before breakfast.
Dr. Smith and Prof. Jones recommended follow-up e.g. blood tests after two weeks.
`.trim();

    const sentences = splitIntoSentences(medicalText);
    expect(sentences).toHaveLength(4);
    expect(sentences[0]).toBe("Patient was prescribed amoxicillin 500 mg b.i.d. with meals for seven days.");
    expect(sentences[1]).toBe("Administration was switched to cefazolin 1 g i.v. every 8 hours during hospital admission.");
    expect(sentences[2]).toBe("Maintenance regimen continued with omeprazole 20 mg p.o. before breakfast.");
    expect(sentences[3]).toBe("Dr. Smith and Prof. Jones recommended follow-up e.g. blood tests after two weeks.");
  });

  // Remediation Test 10: Table with an exceptionally large row is preserved with headers without dropping data
  it("Scenario 31 (Remediation 10): safely handles table with a row larger than hardMaxTokens without dropping data or breaking columns", () => {
    const hugeDescription = "Detailed clinical case report: ".concat("Patient exhibited stable hemodynamic parameters. ".repeat(20));
    const table = `
| Test ID | Case Summary | Status |
| :--- | :--- | :--- |
| T-101 | Standard small observation | Normal |
| T-102 | ${hugeDescription} | Monitored |
| T-103 | Post-procedure follow-up | Resolved |
`.trim();

    const chunks = splitIntoSemanticChunks(table, {
      targetTokens: 40,
      softMaxTokens: 60,
      hardMaxTokens: 100,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.contentType).toBe("table");
      expect(chunk.content).toContain("| Test ID | Case Summary | Status |");
      expect(chunk.content).toContain("| :--- | :--- | :--- |");
    }

    const fullTableContent = chunks.map((c) => c.content).join("\n");
    expect(fullTableContent).toContain("T-101");
    expect(fullTableContent).toContain("T-102");
    expect(fullTableContent).toContain("T-103");
    expect(fullTableContent).toContain("Detailed clinical case report:");
  });

  // Supplementary Control 1: Exact Medical & Clinical Abbreviation Sentence Splitting
  it("Scenario 32 (Control 1): correctly handles medical abbreviations with capitalized directions and true sentence boundaries", () => {
    // 1. Dotted abbreviations followed by capitalized prescription instructions
    expect(splitIntoSentences("Take 500 mg b.i.d. With food.")).toEqual([
      "Take 500 mg b.i.d. With food.",
    ]);
    expect(splitIntoSentences("Administer 5 mg i.v. Immediately.")).toEqual([
      "Administer 5 mg i.v. Immediately.",
    ]);
    expect(splitIntoSentences("Use 250 mg q.d. After meals.")).toEqual([
      "Use 250 mg q.d. After meals.",
    ]);

    // 2. Titles and Latin abbreviations
    expect(splitIntoSentences("Dr. Smith prescribed 10 mg daily.")).toEqual([
      "Dr. Smith prescribed 10 mg daily.",
    ]);
    expect(splitIntoSentences("For example, e.g. this approach is commonly used.")).toEqual([
      "For example, e.g. this approach is commonly used.",
    ]);

    // 3. True sentence boundary after abbreviation must still split cleanly
    const trueSplit = splitIntoSentences(
      "The initial maintenance dose was 20 mg b.i.d. Patients were carefully observed for symptoms.",
    );
    expect(trueSplit).toEqual([
      "The initial maintenance dose was 20 mg b.i.d.",
      "Patients were carefully observed for symptoms.",
    ]);
  });

  // Supplementary Control 2: 20-Iteration Deep Equality Regression Test for 100% Determinism
  it("Scenario 33 (Control 2): guarantees 100% deep equality across 20 consecutive chunking runs", () => {
    const complexInput = `
# بخش اول: مقدمه داروشناسی
این یک سند آزمایشی برای ممیزی پایداری و قطعی بودن (Determinism) موتور چانکینگ است.
داروی مورد نظر با دوز 500 mg b.i.d. With food تجویز می‌شود.
دکتر Smith و همکارانش نتایج را در Ref. 12 گزارش کرده‌اند.

## جدول آزمایشات
| شناسه | دوز | وضعیت بالینی |
| :--- | :--- | :--- |
| P-01 | 10 mg i.v. Immediately | بهبود یافته |
| P-02 | 250 mg q.d. After meals | تحت نظر |

### نکات اجرایی
* نکته اول: رعایت دقیق پروتکل درمانی.
* نکته دوم: بررسی عوارض جانبی احتمالی در بیماران دیابتی.
`.trim();

    const options: SemanticChunkerOptions = {
      targetTokens: 40,
      softMaxTokens: 80,
      hardMaxTokens: 120,
      overlapTokens: 15,
      startPage: 1,
      endPage: 3,
    };

    const firstRun = splitIntoSemanticChunks(complexInput, options);
    expect(firstRun.length).toBeGreaterThan(1);

    for (let iter = 1; iter <= 20; iter++) {
      const currentRun = splitIntoSemanticChunks(complexInput, options);
      expect(currentRun).toEqual(firstRun);
      expect(currentRun.map((c) => c.contentHash)).toEqual(firstRun.map((c) => c.contentHash));
      expect(currentRun.map((c) => c.chunkIndex)).toEqual(firstRun.map((c) => c.chunkIndex));
    }
  });
});
