/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type IntegratedReferenceChunk,
  type PresentationReferenceId,
  computeIntegratedChunkId,
} from "@avana/domain";
import {
  estimateTextTokens,
  estimateTextTokensDetailed,
  estimateChunkPayloadTokens,
  estimateSlideQueryTokens,
  isChunkOversized,
  TokenBudgetEstimator,
  REFERENCE_CHUNK_TAG_OVERHEAD_TOKENS,
} from "../token-budget-estimator.js";

function makeMockIntegratedChunk(options: {
  content: string;
  title?: string;
  citationLabel?: string;
  startPage?: number | null;
  endPage?: number | null;
  sequence?: number;
}): IntegratedReferenceChunk {
  const refId = randomUUID() as PresentationReferenceId;
  const seq = options.sequence ?? 0;
  const content = options.content;
  const hash = "a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef";
  const id = computeIntegratedChunkId(refId, seq, hash);

  return {
    id,
    source: {
      referenceId: refId,
      documentId: null,
      sourceType: "pdf",
      title: options.title ?? "Clinical Pharmacology Principles",
      sourceIdentifier: "doi:10.1016/j.clinpharm.2023.01",
      citationLabel: options.citationLabel ?? "[1] Miller et al. (2024)",
      bibliographicMetadata: { year: 2024 },
    },
    chunk: {
      sequence: seq,
      content,
      headingPath: ["Chapter 4: Anticoagulation", "Section 4.2: Warfarin Dosage"],
      contentType: "paragraph",
      startPage: options.startPage ?? 42,
      endPage: options.endPage ?? 43,
      tokenEstimate: 120,
      contentHash: hash,
      sourceOffset: null,
    },
    location: {
      startPage: options.startPage ?? 42,
      endPage: options.endPage ?? 43,
      slideIndex: null,
      sourceOffset: null,
      confidence: "exact",
    },
    provenance: "stored_document_chunk",
  };
}

describe("Token Budget Estimator (Phase 2A-2.3a)", () => {
  it("computes conservative token estimate for Persian educational text", () => {
    const persianText = "وارفارین یک داروی ضد انعقاد خوراکی است که برای پیشگیری از ترومبوز ورید عمقی تجویز می‌شود.";
    const detailed = estimateTextTokensDetailed(persianText, 1.0);

    expect(detailed.persianTokens).toBeGreaterThan(0);
    expect(detailed.latinTokens).toBe(0);
    expect(detailed.rawTotal).toBeGreaterThan(0);

    // With 1.25 safety multiplier
    const conservative = estimateTextTokens(persianText, 1.25);
    expect(conservative).toBe(Math.ceil(detailed.rawTotal * 1.25));
  });

  it("computes conservative token estimate for English medical text", () => {
    const englishText = "Warfarin acts as an antagonist of vitamin K, inhibiting the synthesis of clotting factors.";
    const detailed = estimateTextTokensDetailed(englishText, 1.0);

    expect(detailed.latinTokens).toBeGreaterThan(0);
    expect(detailed.persianTokens).toBe(0);
    expect(detailed.rawTotal).toBeGreaterThan(0);

    const withMargin = estimateTextTokens(englishText, 1.25);
    expect(withMargin).toBeGreaterThan(detailed.rawTotal);
  });

  it("supports mixed Persian and English medical text with drug names and units", () => {
    const mixedText = "دوز اولیه Warfarin معمولاً 5 mg روزانه است تا INR به محدوده 2.0 تا 3.0 برسد.";
    const detailed = estimateTextTokensDetailed(mixedText, 1.0);

    expect(detailed.persianTokens).toBeGreaterThan(0);
    expect(detailed.latinTokens).toBeGreaterThan(0); // Warfarin, mg, INR
    expect(detailed.otherTokens).toBeGreaterThan(0); // numbers, dots
    expect(detailed.finalTotal).toBeGreaterThan(0);
  });

  it("preserves medical abbreviations, numbers, and dosage units in token counts", () => {
    const unitsText = "10 mcg/kg/min IV infusion, 25 mg PO b.i.d., target BP < 130/80 mmHg";
    const detailed = estimateTextTokensDetailed(unitsText, 1.0);

    expect(detailed.latinTokens).toBeGreaterThan(0);
    expect(detailed.otherTokens).toBeGreaterThan(0);
    expect(detailed.finalTotal).toBeGreaterThan(15);
  });

  it("guarantees 100% determinism across 50 consecutive runs on identical input", () => {
    const sample = "مکانیسم اثر هپارین: اتصال به آنتی‌ترومبین III و تسریع مهار ترومبین و فاکتور Xa به میزان ۱۰۰۰ برابر.";
    const firstResult = estimateTextTokens(sample);

    for (let i = 0; i < 50; i++) {
      expect(estimateTextTokens(sample)).toBe(firstResult);
    }
  });

  it("accounts for metadata overhead, citation labels, and XML envelope tags in chunk payload tokens", () => {
    const chunk = makeMockIntegratedChunk({
      content: "Short content statement regarding anticoagulation.",
      title: "Comprehensive Cardiology",
      citationLabel: "[1] Harrison (2024)",
    });

    const contentOnlyTokens = estimateChunkPayloadTokens(chunk, { includeMetadata: false });
    const fullPayloadTokens = estimateChunkPayloadTokens(chunk, { includeMetadata: true });

    // Full payload must strictly include metadata and tag overhead
    expect(fullPayloadTokens).toBeGreaterThan(contentOnlyTokens + REFERENCE_CHUNK_TAG_OVERHEAD_TOKENS);
  });

  it("estimates slide query tokens including title, keyPoints, and learning outcomes", () => {
    const query = {
      slideIndex: 1,
      title: "فارماکولوژی داروهای ضدانعقاد",
      keyPoints: ["مکانیسم اثر وارفارین", "پایش INR", "تداخلات دارویی مهم"],
      slideType: "content",
      intendedLearningOutcome: "شناخت دوزبندی و خطرات خونریزی",
    };

    const tokens = estimateSlideQueryTokens(query);
    expect(tokens).toBeGreaterThan(25);
  });

  it("identifies oversized chunks without truncating or mutating chunk content", () => {
    const longText = "وارفارین ".repeat(600); // Very long text ~ 1200+ tokens
    const chunk = makeMockIntegratedChunk({ content: longText });

    const maxAllowed = 400;
    const check = isChunkOversized(chunk, maxAllowed);

    expect(check.isOversized).toBe(true);
    expect(check.estimatedTokens).toBeGreaterThan(maxAllowed);
    expect(check.maxAllowed).toBe(maxAllowed);

    // Verify original chunk content is completely intact and untouched
    expect(chunk.chunk.content).toBe(longText);
    expect(chunk.chunk.content.length).toBe(longText.length);
  });

  it("handles edge cases gracefully: empty string, null, and undefined", () => {
    expect(estimateTextTokens("")).toBe(0);
    expect(estimateTextTokens(null)).toBe(0);
    expect(estimateTextTokens(undefined)).toBe(0);
    expect(estimateTextTokens("    ")).toBe(0);

    const detailedEmpty = estimateTextTokensDetailed("");
    expect(detailedEmpty.rawTotal).toBe(0);
    expect(detailedEmpty.finalTotal).toBe(0);
  });

  it("TokenBudgetEstimator class wrapper conforms to consistent results", () => {
    const estimator = new TokenBudgetEstimator(1.25);
    const text = "تست کلاس تخمین بودجه توکن";

    expect(estimator.estimateText(text)).toBe(estimateTextTokens(text, 1.25));
    expect(estimator.estimateTextDetailed(text).safetyMultiplier).toBe(1.25);
  });
});
