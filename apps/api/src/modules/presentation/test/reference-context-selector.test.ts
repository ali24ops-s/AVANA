/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type IntegratedReferenceChunk,
  type PresentationReferenceId,
  type SlideContextQuery,
  computeIntegratedChunkId,
} from "@avana/domain";
import {
  HeuristicLexicalContextSelector,
  extractLexicalKeywords,
  normalizeForLexicalMatching,
} from "../reference-context-selector.js";

function createMockChunk(data: {
  referenceId?: string;
  sequence?: number;
  title?: string;
  citationLabel?: string;
  headingPath?: string[];
  content: string;
  startPage?: number | null;
  endPage?: number | null;
  tokenEstimate?: number;
}): IntegratedReferenceChunk {
  const refId = (data.referenceId || randomUUID()) as PresentationReferenceId;
  const seq = data.sequence ?? 0;
  const hash = "b1c2d3e4f5a678901234567890abcdef1234567890abcdef1234567890abcdef";
  const id = computeIntegratedChunkId(refId, seq, hash);

  return {
    id,
    source: {
      referenceId: refId,
      documentId: null,
      sourceType: "pdf",
      title: data.title ?? "Pharmacotherapy Principles",
      sourceIdentifier: "doi:10.1001/jama.2024.1234",
      citationLabel: data.citationLabel ?? "[1] Goodman & Gilman (2023)",
      bibliographicMetadata: { year: 2023 },
    },
    chunk: {
      sequence: seq,
      content: data.content,
      headingPath: data.headingPath ?? ["Section 1: General Principles"],
      contentType: "paragraph",
      startPage: data.startPage !== undefined ? data.startPage : 10,
      endPage: data.endPage !== undefined ? data.endPage : 11,
      tokenEstimate: data.tokenEstimate ?? 150,
      contentHash: hash,
      sourceOffset: null,
    },
    location: {
      startPage: data.startPage !== undefined ? data.startPage : 10,
      endPage: data.endPage !== undefined ? data.endPage : 11,
      slideIndex: null,
      sourceOffset: null,
      confidence: data.startPage !== null ? "exact" : "unknown",
    },
    provenance: "stored_document_chunk",
  };
}

describe("Heuristic Lexical Reference Context Selector (Phase 2A-2.3a)", () => {
  const selector = new HeuristicLexicalContextSelector();

  // 1. Text Normalization
  describe("Text Normalization and Keyword Extraction", () => {
    it("normalizes Arabic Yeh, Arabic Kaf, diacritics, and ZWNJ", () => {
      const rawPersian = "دارويِ كاهنده‌يِ فشارِ خون";
      const normalized = normalizeForLexicalMatching(rawPersian);

      // ي -> ی, ك -> ک, diacritics stripped, ZWNJ converted to space
      expect(normalized).toBe("داروی کاهنده ی فشار خون");
    });

    it("extracts non-stopword keywords from Persian and English text", () => {
      const text = "وارفارین در درمان بیماران مبتلا به فیبریلاسیون دهلیزی و ترومبوز ورید عمقی تجویز می‌شود.";
      const keywords = extractLexicalKeywords(text);

      expect(keywords).toContain("وارفارین");
      expect(keywords).toContain("درمان");
      expect(keywords).toContain("بیماران");
      expect(keywords).toContain("فیبریلاسیون");
      expect(keywords).toContain("دهلیزی");
      expect(keywords).toContain("ترومبوز");
      expect(keywords).toContain("ورید");
      expect(keywords).toContain("عمقی");

      // Stopwords must be excluded
      expect(keywords).not.toContain("در");
      expect(keywords).not.toContain("به");
      expect(keywords).not.toContain("و");
      expect(keywords).not.toContain("می");
      expect(keywords).not.toContain("شود");
    });

    it("preserves single-letter medical symbols in valid clinical context (Vitamin K, Factor V, Hepatitis B, ویتامین D)", () => {
      const textEn = "Vitamin K is essential for clotting and Factor V Leiden increases thrombosis risk. Hepatitis B screening is needed.";
      const keywordsEn = extractLexicalKeywords(textEn);

      expect(keywordsEn).toContain("vitamin");
      expect(keywordsEn).toContain("k");
      expect(keywordsEn).toContain("factor");
      expect(keywordsEn).toContain("v");
      expect(keywordsEn).toContain("hepatitis");
      expect(keywordsEn).toContain("b");

      const textFa = "نقش ویتامین K و فاکتور V در هموستاز و اهمیت ویتامین D در سلامت استخوان.";
      const keywordsFa = extractLexicalKeywords(textFa);

      expect(keywordsFa).toContain("ویتامین");
      expect(keywordsFa).toContain("k");
      expect(keywordsFa).toContain("فاکتور");
      expect(keywordsFa).toContain("v");
      expect(keywordsFa).toContain("ویتامین");
      expect(keywordsFa).toContain("d");
    });

    it("discards random isolated single letters without medical trigger context", () => {
      const text = "This is a random x test string with isolated y characters and single letters.";
      const keywords = extractLexicalKeywords(text);

      expect(keywords).not.toContain("a");
      expect(keywords).not.toContain("x");
      expect(keywords).not.toContain("y");

      const textFa = "بیمار الف با علامت ب به درمان پاسخ داد.";
      const keywordsFa = extractLexicalKeywords(textFa);

      // Isolated Persian letters without medical triggers are skipped
      expect(keywordsFa).not.toContain("ب");
    });
  });

  // 2. Deterministic Ranking
  describe("Deterministic Ranking and Scoring", () => {
    it("ranks the most relevant chunk highest based on title and keypoints match", () => {
      const chunk1 = createMockChunk({
        content: "آسپرین یک داروی ضدپلاکت است که از تجمع پلاکت‌ها جلوگیری می‌کند.",
        headingPath: ["داروهای ضدپلاکت", "آسپرین"],
      });

      const chunk2 = createMockChunk({
        content: "وارفارین با مهار ساخت فاکتورهای وابسته به ویتامین K (فاکتورهای II, VII, IX, X) اثر ضد انعقادی دارد و نیازمند پایش منظم INR است.",
        headingPath: ["داروهای ضدانعقاد", "وارفارین"],
      });

      const chunk3 = createMockChunk({
        content: "پنی‌سیلین یک آنتی‌بیوتیک بتالاکتام است که دیواره سلولی باکتری را تخریب می‌کند.",
        headingPath: ["آنتی‌بیوتیک‌ها", "پنی‌سیلین"],
      });

      const query: SlideContextQuery = {
        slideIndex: 1,
        title: "مکانیسم اثر وارفارین و کنترل INR",
        keyPoints: ["مهار ویتامین K", "پایش شاخص INR"],
      };

      const result = selector.selectChunksForSlide([chunk1, chunk2, chunk3], query);

      expect(result.selectedChunks.length).toBeGreaterThan(0);
      expect(result.selectedChunks[0].chunk.id).toBe(chunk2.id);
      expect(result.selectedChunks[0].rank).toBe(1);
      expect(result.selectedChunks[0].score).toBeGreaterThan(0.3);
      expect(result.selectedChunks[0].reasons.length).toBeGreaterThan(0);
    });

    it("applies length normalization so long chunks do not outscore concise relevant chunks", () => {
      // Chunk A: Compact 80-token chunk directly answering the slide query
      const compactRelevantChunk = createMockChunk({
        content: "متفورمین خط اول درمان دیابت نوع ۲ است که با کاهش گلوکونئوژنز کبدی و افزایش حساسیت به انسولین عمل می‌کند.",
        tokenEstimate: 80,
      });

      // Chunk B: Long 800-token chunk that merely mentions the word 'متفورمین' once among hundreds of other words
      const longDilutedChunk = createMockChunk({
        content: "در این فصل به بررسی جامع غدد درون‌ریز، فیزیولوژی پانکراس، هورمون‌های تیروئید، آدرنال، کاتکول‌آمین‌ها و در بخشی کوتاه به متفورمین و متابولیسم چربی‌ها پرداخته می‌شود. " + "متن جانبی فیزیولوژی بدن انسان و بافت‌شناسی سلول‌های ترشحی. ".repeat(25),
        tokenEstimate: 800,
      });

      const query: SlideContextQuery = {
        slideIndex: 2,
        title: "داروی متفورمین در درمان دیابت نوع ۲",
        keyPoints: ["کاهش گلوکونئوژنز کبدی", "حساسیت به انسولین"],
      };

      const result = selector.selectChunksForSlide(
        [longDilutedChunk, compactRelevantChunk],
        query,
      );

      expect(result.selectedChunks.length).toBeGreaterThan(0);
      expect(result.selectedChunks[0].chunk.id).toBe(compactRelevantChunk.id);
      expect(result.selectedChunks[0].score).toBeGreaterThan(
        result.selectedChunks.find((c) => c.chunk.id === longDilutedChunk.id)?.score ?? 0,
      );
    });
  });

  // 3. Verbatim Phrase Bonus & Generic Title Guard
  describe("Verbatim Phrase Bonus & Generic Title Guard", () => {
    it("does NOT grant phrase bonus for generic outline titles (مقدمه, کلیات, etc.)", () => {
      const chunk = createMockChunk({
        content: "مقدمه بر مبانی فارماکولوژی و مفاهیم پایه‌ای داروشناسی بالینی در بیماران.",
      });

      const queryIntro: SlideContextQuery = {
        slideIndex: 1,
        title: "مقدمه",
      };

      const result = selector.selectChunksForSlide([chunk], queryIntro);
      const selected = result.selectedChunks.find((c) => c.chunk.id === chunk.id);
      if (selected) {
        expect(selected.reasons.some((r) => r.includes("phrase"))).toBe(false);
      }
    });

    it("does NOT grant phrase bonus for generic title 'کلیات'", () => {
      const chunk = createMockChunk({
        content: "کلیات پیرامون بیماری‌های متابولیک و ریسک‌فاکتورها.",
      });

      const query: SlideContextQuery = {
        slideIndex: 1,
        title: "کلیات",
      };

      const result = selector.selectChunksForSlide([chunk], query);
      const selected = result.selectedChunks.find((c) => c.chunk.id === chunk.id);
      if (selected) {
        expect(selected.reasons.some((r) => r.includes("phrase"))).toBe(false);
      }
    });

    it("grants +0.15 phrase bonus for specialized multi-word title with exact word boundaries", () => {
      const chunk = createMockChunk({
        content: "در این پژوهش مکانیسم اثر وارفارین از طریق مهار رقابتی ویتامین K اپوکسید ردوکتاز تشریح گردید.",
      });

      const query: SlideContextQuery = {
        slideIndex: 1,
        title: "مکانیسم اثر وارفارین",
      };

      const result = selector.selectChunksForSlide([chunk], query);
      expect(result.selectedChunks).toHaveLength(1);
      expect(
        result.selectedChunks[0].reasons.some((r) =>
          r.includes("Verbatim slide title phrase found in chunk content (+0.15 bonus)"),
        ),
      ).toBe(true);
    });

    it("does NOT grant phrase bonus when title is only a partial substring inside another word", () => {
      const chunk = createMockChunk({
        // "ضدوارفارینیک" contains "وارفارین" as a substring without word boundaries
        content: "بررسی ترکیبات ضدوارفارینیک در شرایط آزمایشگاهی و کشت سلولی.",
      });

      const query: SlideContextQuery = {
        slideIndex: 1,
        title: "وارفارین",
      };

      const result = selector.selectChunksForSlide([chunk], query);
      const selected = result.selectedChunks.find((c) => c.chunk.id === chunk.id);
      if (selected) {
        expect(selected.reasons.some((r) => r.includes("phrase"))).toBe(false);
      }
    });

    it("grants phrase bonus for short specialized medical acronyms (>= 3 chars)", () => {
      const chunk = createMockChunk({
        content: "پایش منظم inr در کلیه بیمارانی که داروی ضدانعقاد دریافت می‌کنند الزامی است.",
      });

      const query: SlideContextQuery = {
        slideIndex: 1,
        title: "INR",
      };

      const result = selector.selectChunksForSlide([chunk], query);
      expect(result.selectedChunks).toHaveLength(1);
      expect(
        result.selectedChunks[0].reasons.some((r) => r.includes("phrase")),
      ).toBe(true);
    });
  });

  // 4. Relevance Threshold & No Filler Chunks
  describe("Relevance Threshold Enforcement", () => {
    it("never selects irrelevant chunks merely to fill available token budget", () => {
      const irrelevantChunk1 = createMockChunk({
        content: "سنگ‌های کیسه صفرا معمولاً از کلسترول یا بیلی‌روبین تشکیل می‌شوند و با سونوگرافی تشخیص داده می‌شوند.",
        headingPath: ["بیماری‌های گوارش", "کیسه صفرا"],
      });

      const irrelevantChunk2 = createMockChunk({
        content: "درمان شکستگی استخوان فمور نیازمند فیکساسیون داخلی و جراحی ارتوپدی است.",
        headingPath: ["ارتوپدی", "شکستگی‌ها"],
      });

      const query: SlideContextQuery = {
        slideIndex: 3,
        title: "فارماکوکینتیک داروهای ضدصرع",
        keyPoints: ["فنی‌توئین", "کاربامازپین"],
      };

      const result = selector.selectChunksForSlide(
        [irrelevantChunk1, irrelevantChunk2],
        query,
        { minRelevanceScore: 0.15, maxTokens: 5000 },
      );

      // Despite 5000 tokens of free budget, zero chunks should be selected!
      expect(result.selectedChunks).toHaveLength(0);
      expect(result.rejectedChunks).toHaveLength(2);
      expect(result.rejectedChunks.every((r) => r.reason === "below_relevance_threshold")).toBe(true);
      expect(result.totalSelectedTokens).toBe(0);
    });
  });

  // 4. Deterministic Tie-Breaking
  describe("Deterministic Multi-Level Tie-Breaking", () => {
    it("breaks ties deterministically in order: heading score, physical page, refId, sequence, chunkId", () => {
      // Two chunks from different references with equal scores, but one has physical page
      const chunkWithPage = createMockChunk({
        referenceId: "ref-cardio-page" as PresentationReferenceId,
        sequence: 1,
        content: "مهارکننده‌های ACE باعث اتساع عروق و کاهش بار انتهایی قلب می‌شوند.",
        startPage: 15,
        endPage: 16,
      });

      const chunkWithoutPage = createMockChunk({
        referenceId: "ref-cardio-nopage" as PresentationReferenceId,
        sequence: 2,
        content: "مهارکننده‌های ACE باعث اتساع عروق و کاهش بار انتهایی قلب می‌شوند.",
        startPage: null,
        endPage: null,
      });

      const query: SlideContextQuery = {
        slideIndex: 4,
        title: "مهارکننده‌های ACE در نارسایی قلبی",
      };

      const result = selector.selectChunksForSlide(
        [chunkWithoutPage, chunkWithPage],
        query,
      );

      expect(result.selectedChunks).toHaveLength(2);
      // Chunk with verified physical page must rank higher
      expect(result.selectedChunks[0].chunk.id).toBe(chunkWithPage.id);
      expect(result.selectedChunks[1].chunk.id).toBe(chunkWithoutPage.id);
    });

    it("guarantees 100% deep equality across 25 consecutive runs with identical inputs", () => {
      const chunks = [
        createMockChunk({ sequence: 1, content: "آتنولول یک بتابلاکر انتخابی بتا-۱ است." }),
        createMockChunk({ sequence: 2, content: "پروپرانولول یک بتابلاکر غیراختصاصی است." }),
        createMockChunk({ sequence: 3, content: "متوپرولول در درمان آنژین و فشار خون موثر است." }),
      ];

      const query: SlideContextQuery = {
        slideIndex: 5,
        title: "بتابلاکرهای انتخابی و غیراختصاصی",
      };

      const firstRun = selector.selectChunksForSlide(chunks, query);

      for (let i = 0; i < 25; i++) {
        const nextRun = selector.selectChunksForSlide(chunks, query);
        expect(nextRun.selectedChunks.map((c) => c.chunk.id)).toEqual(
          firstRun.selectedChunks.map((c) => c.chunk.id),
        );
        expect(nextRun.selectedChunks.map((c) => c.score)).toEqual(
          firstRun.selectedChunks.map((c) => c.score),
        );
      }
    });

    it("guarantees 100% array reversal invariance (input order does not alter selection or ranking)", () => {
      const chunkA = createMockChunk({
        referenceId: "ref-alpha",
        sequence: 1,
        content: "دیابت نوع ۲ و اختلال در ترشح انسولین و مقاومت به انسولین.",
        tokenEstimate: 120,
      });
      const chunkB = createMockChunk({
        referenceId: "ref-beta",
        sequence: 2,
        content: "درمان دارویی دیابت نوع ۲ با متفورمین و سولفونیل‌اوره‌ها و تنظیم قند خون.",
        tokenEstimate: 130,
      });
      const chunkC = createMockChunk({
        referenceId: "ref-gamma",
        sequence: 3,
        content: "رژیم غذایی و ورزش در کنترل دیابت نوع ۲ و اصلاح سبک زندگی.",
        tokenEstimate: 110,
      });

      const query: SlideContextQuery = {
        slideIndex: 3,
        title: "درمان دارویی دیابت نوع ۲ با متفورمین",
        keyPoints: ["تنظیم قند خون", "سولفونیل‌اوره‌ها"],
      };

      const forwardOrder = [chunkA, chunkB, chunkC];
      const reversedOrder = [chunkC, chunkB, chunkA];

      const resForward = selector.selectChunksForSlide(forwardOrder, query);
      const resReversed = selector.selectChunksForSlide(reversedOrder, query);

      expect(resForward.selectedChunks.map((s) => s.chunk.id)).toEqual(
        resReversed.selectedChunks.map((s) => s.chunk.id),
      );
      expect(resForward.selectedChunks.map((s) => s.rank)).toEqual(
        resReversed.selectedChunks.map((s) => s.rank),
      );
      expect(resForward.selectedChunks.map((s) => s.score)).toEqual(
        resReversed.selectedChunks.map((s) => s.score),
      );
      expect(resForward.totalSelectedTokens).toBe(resReversed.totalSelectedTokens);
    });

    it("maintains deterministic tie-breaking for chunks with virtually identical scores", () => {
      // 3 chunks with identical content and scores, but different locations / references
      const chunkPage1 = createMockChunk({
        referenceId: "ref-alpha-page",
        sequence: 1,
        content: "آسپرین جهت پیشگیری ثانویه از حوادث قلبی عروقی تجویز می‌شود.",
        startPage: 15,
      });
      const chunkNoPage = createMockChunk({
        referenceId: "ref-alpha-nopage",
        sequence: 1,
        content: "آسپرین جهت پیشگیری ثانویه از حوادث قلبی عروقی تجویز می‌شود.",
        startPage: null,
      });
      const chunkPage2LaterSeq = createMockChunk({
        referenceId: "ref-beta-page",
        sequence: 2,
        content: "آسپرین جهت پیشگیری ثانویه از حوادث قلبی عروقی تجویز می‌شود.",
        startPage: 20,
      });

      const query: SlideContextQuery = {
        slideIndex: 6,
        title: "پیشگیری ثانویه حوادث قلبی عروقی با آسپرین",
      };

      const res1 = selector.selectChunksForSlide(
        [chunkNoPage, chunkPage1, chunkPage2LaterSeq],
        query,
      );
      const res2 = selector.selectChunksForSlide(
        [chunkPage2LaterSeq, chunkPage1, chunkNoPage],
        query,
      );

      // Physical page presence beats no-page; ref-alpha beats ref-beta
      expect(res1.selectedChunks[0].chunk.id).toBe(chunkPage1.id);
      expect(res1.selectedChunks.map((s) => s.chunk.id)).toEqual(
        res2.selectedChunks.map((s) => s.chunk.id),
      );
    });
  });

  // 5. Redundancy Handling
  describe("Redundancy and Near-Duplicate Mitigation", () => {
    it("detects and rejects near-duplicate chunks from the same source", () => {
      const refId = "ref-guideline-2024" as PresentationReferenceId;

      const primaryChunk = createMockChunk({
        referenceId: refId,
        sequence: 0,
        content: "دستورالعمل کنترل فشار خون: شروع درمان با مهارکننده ACE یا ARB همراه با دیورتیک تیازیدی در اکثر بیماران توصیه می‌شود.",
      });

      // Near duplicate with slight wording variation from same reference
      const nearDuplicateChunk = createMockChunk({
        referenceId: refId,
        sequence: 1,
        content: "دستورالعمل کنترل فشار خون: شروع درمان با داروی مهارکننده ACE یا ARB همراه دیورتیک تیازیدی در اکثر بیماران توصیه می‌گردد.",
      });

      const diverseChunk = createMockChunk({
        referenceId: "ref-guideline-secondary" as PresentationReferenceId,
        sequence: 0,
        content: "تغییر سبک زندگی شامل کاهش مصرف سدیم و فعالیت بدنی منظم پایه تمام پروتکل‌های درمانی است.",
      });

      const query: SlideContextQuery = {
        slideIndex: 6,
        title: "پروتکل‌های درمانی کنترل فشار خون",
        keyPoints: ["شروع درمان دارویی", "تغییر سبک زندگی"],
      };

      const result = selector.selectChunksForSlide(
        [primaryChunk, nearDuplicateChunk, diverseChunk],
        query,
      );

      const selectedIds = result.selectedChunks.map((c) => c.chunk.id);
      expect(selectedIds).toContain(primaryChunk.id);
      expect(selectedIds).toContain(diverseChunk.id);
      // Near duplicate should be rejected as redundant
      expect(selectedIds).not.toContain(nearDuplicateChunk.id);
      expect(
        result.rejectedChunks.some((r) => r.reason === "redundant_near_duplicate"),
      ).toBe(true);
    });

    it("deduplicates identical chunks passed multiple times in input array", () => {
      const chunk = createMockChunk({
        referenceId: "ref-unique",
        sequence: 1,
        content: "دیگوکسین در نارسایی قلبی و کنترل ریتم در فیبریلاسیون دهلیزی کاربرد دارد.",
      });

      const query: SlideContextQuery = {
        slideIndex: 7,
        title: "کاربرد دیگوکسین در نارسایی قلبی",
      };

      // Pass the exact same chunk object twice
      const result = selector.selectChunksForSlide([chunk, chunk], query);

      expect(result.selectedChunks).toHaveLength(1);
      expect(result.selectedChunks[0].chunk.id).toBe(chunk.id);
      expect(
        result.rejectedChunks.some((r) => r.reason === "redundant_near_duplicate"),
      ).toBe(true);
    });
  });

  // 6. Token Budget and Oversized Chunk Handling
  describe("Token Budget Enforcement & Oversized Chunk Policy", () => {
    it("strictly respects maxTokens budget limit without exceeding it", () => {
      const chunks = [
        createMockChunk({ referenceId: "ref-ins-1", sequence: 1, content: "چانک اول درباره انسولین رگولار و NPH. " + "توضیحات تکمیلی پیرامون دوز و تزریق. ".repeat(15) }),
        createMockChunk({ referenceId: "ref-ins-2", sequence: 2, content: "چانک دوم درباره انسولین گلارژین و دتمیر. " + "توضیحات تکمیلی پیرامون اثر طولانی. ".repeat(15) }),
        createMockChunk({ referenceId: "ref-ins-3", sequence: 3, content: "چانک سوم درباره انسولین لیسپرو و آسپارت. " + "توضیحات تکمیلی پیرامون شروع اثر سریع. ".repeat(15) }),
      ];

      const query: SlideContextQuery = {
        slideIndex: 7,
        title: "انواع انسولین‌های انسانی و آنالوگ",
        keyPoints: ["انسولین رگولار", "انسولین گلارژین", "انسولین لیسپرو"],
      };

      // Set very tight budget allowing only 1-2 chunks
      const maxTokens = 350;
      const result = selector.selectChunksForSlide(chunks, query, { maxTokens });

      expect(result.totalSelectedTokens).toBeLessThanOrEqual(maxTokens);
      expect(result.rejectedChunks.some((r) => r.reason === "exceeds_token_budget")).toBe(true);
    });

    it("rejects oversized chunk with explicit reason without silent truncation or content mutation", () => {
      const originalLongContent = "متن علمی بسیار طولانی با جزئیات کامل دوزبندی و منع مصرف. ".repeat(200);
      const oversizedChunk = createMockChunk({ content: originalLongContent });

      const normalChunk = createMockChunk({
        content: "متن مناسب و استاندارد درباره دارو با طول معقول.",
      });

      const query: SlideContextQuery = {
        slideIndex: 8,
        title: "بررسی جامع دارو",
      };

      const result = selector.selectChunksForSlide(
        [oversizedChunk, normalChunk],
        query,
        { maxTokensPerChunk: 300 },
      );

      // Oversized chunk must be in rejectedChunks with 'oversized_chunk'
      const oversizedRejection = result.rejectedChunks.find(
        (r) => r.chunk.id === oversizedChunk.id,
      );
      expect(oversizedRejection).toBeDefined();
      expect(oversizedRejection?.reason).toBe("oversized_chunk");

      // Verify original content of oversized chunk is NOT mutated or truncated
      expect(oversizedChunk.chunk.content).toBe(originalLongContent);
      expect(oversizedChunk.chunk.content.length).toBe(originalLongContent.length);
    });

    it("correctly evaluates and selects valid chunk following multiple consecutive oversized chunks", () => {
      const oversizedChunk1 = createMockChunk({
        referenceId: "ref-huge-1",
        sequence: 1,
        content: "توضیحات بسیار حجیم بالینی و فارماکوکینتیک داروها. ".repeat(150),
      });
      const oversizedChunk2 = createMockChunk({
        referenceId: "ref-huge-2",
        sequence: 2,
        content: "جزئیات بی‌شمار عوارض جانبی و گزارش‌های سم‌شناسی دارویی. ".repeat(150),
      });
      const oversizedChunk3 = createMockChunk({
        referenceId: "ref-huge-3",
        sequence: 3,
        content: "متن کامل فارماکوپه و راهنماهای ملی و بین‌المللی درمان. ".repeat(150),
      });
      const validTargetChunk = createMockChunk({
        referenceId: "ref-valid",
        sequence: 4,
        content: "آتورواستاتین یک داروی کاهنده کلسترول از دسته استاتین‌ها است که آنزیم HMG-CoA ردوکتاز را مهار می‌کند.",
        tokenEstimate: 90,
      });

      const query: SlideContextQuery = {
        slideIndex: 5,
        title: "مهار آنزیم HMG-CoA ردوکتاز با آتورواستاتین",
        keyPoints: ["کاهش کلسترول", "دسته استاتین‌ها"],
      };

      const result = selector.selectChunksForSlide(
        [oversizedChunk1, oversizedChunk2, oversizedChunk3, validTargetChunk],
        query,
        { maxTokensPerChunk: 300, maxTokens: 1000 },
      );

      // Oversized chunks rejected with explicit reason
      const oversizedRejections = result.rejectedChunks.filter(
        (r) => r.reason === "oversized_chunk",
      );
      expect(oversizedRejections).toHaveLength(3);

      // Valid chunk selected successfully
      expect(result.selectedChunks).toHaveLength(1);
      expect(result.selectedChunks[0].chunk.id).toBe(validTargetChunk.id);
      expect(result.totalSelectedTokens).toBeGreaterThan(0);
      expect(result.remainingTokens).toBe(1000 - result.totalSelectedTokens);
    });
  });

  // 7. Edge Cases & Fallbacks
  describe("Edge Cases and Fallback Behavior", () => {
    it("handles slide without title by falling back to keyPoints and learning outcomes", () => {
      const chunk = createMockChunk({
        content: "کتوکونازول مهارکننده قوی آنزیم CYP3A4 است و باعث افزایش سطح سرمی داروهای همزمان می‌شود.",
      });

      const query: SlideContextQuery = {
        slideIndex: 9,
        title: null,
        keyPoints: ["تداخلات دارویی کتوکونازول", "آنزیم CYP3A4"],
      };

      const result = selector.selectChunksForSlide([chunk], query);
      expect(result.selectedChunks).toHaveLength(1);
      expect(result.selectedChunks[0].reasons.some((r) => r.includes("keypoint"))).toBe(true);
    });

    it("handles slide without keyPoints by relying purely on title", () => {
      const chunk = createMockChunk({
        content: "لووتیروکسین داروی انتخابی در درمان کم‌کاری تیروئید (هیپوتیروئیدی) است.",
      });

      const query: SlideContextQuery = {
        slideIndex: 10,
        title: "درمان کم‌کاری تیروئید با لووتیروکسین",
        keyPoints: [],
      };

      const result = selector.selectChunksForSlide([chunk], query);
      expect(result.selectedChunks).toHaveLength(1);
      expect(result.selectedChunks[0].reasons.some((r) => r.includes("title"))).toBe(true);
    });

    it("handles empty chunk input array cleanly", () => {
      const result = selector.selectChunksForSlide([], { slideIndex: 11, title: "تیتر اسلاید" });
      expect(result.selectedChunks).toHaveLength(0);
      expect(result.rejectedChunks).toHaveLength(0);
      expect(result.evaluatedCount).toBe(0);
      expect(result.totalSelectedTokens).toBe(0);
    });

    it("handles mixed language medical terms (English abbreviations in Persian slide)", () => {
      const chunk = createMockChunk({
        content: "در بیماران با eGFR کمتر از 30 mL/min تجویز Metformin به دلیل خطر اسیدوز لاکتیک ممنوع است.",
      });

      const query: SlideContextQuery = {
        slideIndex: 12,
        title: "منع مصرف Metformin در نارسایی کلیه",
        keyPoints: ["کاهش eGFR", "اسیدوز لاکتیک"],
      };

      const result = selector.selectChunksForSlide([chunk], query);
      expect(result.selectedChunks).toHaveLength(1);
      expect(result.selectedChunks[0].chunk.id).toBe(chunk.id);
    });
  });
});
