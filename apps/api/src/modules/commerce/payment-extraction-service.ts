/**
 * PaymentInfoExtractionService — Rule-Based with AI Fallback Extraction.
 *
 * Implements:
 * 1. Primary Rule-Based Extraction with comprehensive Persian/English bank patterns.
 * 2. Secondary AI Fallback Extraction via configured ModelGateway when essential fields are missing.
 * 3. Strict schema validation and merging.
 * 4. Read-only execution with zero payment or state mutation side effects.
 */

import {
  type PaymentExtractionResult,
  type ExtractedPaymentData,
  type FieldConfidence,
  type RuleExtractionOptions,
  extractPaymentInfoFromRules,
  normalizePersianDigits,
  sanitizePaymentText,
} from "@avana/domain";
import type { ModelGateway } from "../generation/gateway/types.js";

export interface ExtractPaymentOptions extends RuleExtractionOptions {
  useAiFallback?: boolean;
  correlationId?: string;
}

const AI_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    amount: { type: ["number", "null"], description: "Amount in Tomans or Rials as integer" },
    currency: { type: ["string", "null"], enum: ["toman", "rial", null] },
    trackingNumber: { type: ["string", "null"], description: "Bank tracking or reference code" },
    sourceCardLast4: { type: ["string", "null"], description: "Last 4 digits of sender source card" },
    paymentDate: { type: ["string", "null"], description: "Date in YYYY/MM/DD or YYYY-MM-DD" },
    paymentTime: { type: ["string", "null"], description: "Time in HH:MM" },
    payerName: { type: ["string", "null"], description: "Name of cardholder/sender if present" },
  },
  required: ["trackingNumber", "sourceCardLast4"],
  additionalProperties: false,
};

export class PaymentInfoExtractionService {
  constructor(
    private readonly modelGateway?: ModelGateway,
    private readonly destinationCardNumber?: string,
  ) {}

  /**
   * Extract structured payment data from raw user text.
   * Purely read-only; does not mutate database or financial state.
   */
  async extract(
    rawText: string,
    options: ExtractPaymentOptions = {},
  ): Promise<PaymentExtractionResult> {
    if (!rawText || rawText.trim().length === 0) {
      return {
        data: {
          amount: null,
          rawAmount: null,
          currency: null,
          trackingNumber: null,
          sourceCardLast4: null,
          paymentDate: null,
          paymentTime: null,
          payerName: null,
        },
        confidence: {
          amount: "low",
          trackingNumber: "low",
          sourceCardLast4: "low",
          paymentDate: "low",
          paymentTime: "low",
          payerName: "low",
        },
        extractionMethod: "rule",
        missingFields: [
          "amount",
          "trackingNumber",
          "sourceCardLast4",
          "paymentDate",
          "paymentTime",
        ],
        sanitizedText: "",
      };
    }

    const destinationCard = options.destinationCardNumber || this.destinationCardNumber;

    // Step 1: Execute Rule-Based Extraction
    const ruleResult = extractPaymentInfoFromRules(rawText, {
      expectedAmount: options.expectedAmount,
      destinationCardNumber: destinationCard,
    });

    // Check if essential fields (trackingNumber or sourceCardLast4 or amount) are missing
    const hasMissingEssentialFields =
      !ruleResult.data.trackingNumber ||
      !ruleResult.data.sourceCardLast4 ||
      ruleResult.data.amount === null;

    const canUseAi =
      options.useAiFallback !== false &&
      Boolean(this.modelGateway) &&
      hasMissingEssentialFields;

    if (!canUseAi) {
      return ruleResult;
    }

    // Step 2: AI Fallback Extraction
    try {
      const aiExtracted = await this.extractWithAiFallback(rawText, {
        expectedAmount: options.expectedAmount,
        destinationCardNumber: destinationCard,
        correlationId: options.correlationId,
      });

      if (!aiExtracted) {
        return ruleResult;
      }

      // Merge Rule and AI results (Rule-based high confidence takes precedence)
      const mergedData: ExtractedPaymentData = { ...ruleResult.data };
      const mergedConfidence: FieldConfidence = { ...ruleResult.confidence };
      let hasAiContribution = false;

      // 1. Amount
      if (mergedData.amount === null && typeof aiExtracted.amount === "number") {
        let normalizedAmount: number = aiExtracted.amount;
        if (aiExtracted.currency === "rial" || (options.expectedAmount && normalizedAmount === options.expectedAmount * 10)) {
          normalizedAmount = Math.round(normalizedAmount / 10);
        }
        mergedData.amount = normalizedAmount;
        mergedData.rawAmount = aiExtracted.amount;
        mergedData.currency = aiExtracted.currency || "toman";
        mergedConfidence.amount = "medium";
        hasAiContribution = true;
      }

      // 2. Tracking Number
      if (!mergedData.trackingNumber && aiExtracted.trackingNumber) {
        const cleanTrack = normalizePersianDigits(aiExtracted.trackingNumber).trim();
        if (cleanTrack.length >= 4) {
          mergedData.trackingNumber = cleanTrack;
          mergedConfidence.trackingNumber = "medium";
          hasAiContribution = true;
        }
      }

      // 3. Source Card Last 4
      if (!mergedData.sourceCardLast4 && aiExtracted.sourceCardLast4) {
        const cleanLast4 = normalizePersianDigits(aiExtracted.sourceCardLast4).replace(/\D/g, "").slice(-4);
        if (cleanLast4.length === 4) {
          const destLast4 = destinationCard ? normalizePersianDigits(destinationCard).slice(-4) : undefined;
          if (!destLast4 || cleanLast4 !== destLast4) {
            mergedData.sourceCardLast4 = cleanLast4;
            mergedConfidence.sourceCardLast4 = "medium";
            hasAiContribution = true;
          }
        }
      }

      // 4. Payment Date
      if (!mergedData.paymentDate && aiExtracted.paymentDate) {
        mergedData.paymentDate = normalizePersianDigits(aiExtracted.paymentDate).replace(/[.-]/g, "/").trim();
        mergedConfidence.paymentDate = "medium";
        hasAiContribution = true;
      }

      // 5. Payment Time
      if (!mergedData.paymentTime && aiExtracted.paymentTime) {
        mergedData.paymentTime = normalizePersianDigits(aiExtracted.paymentTime).trim();
        mergedConfidence.paymentTime = "medium";
        hasAiContribution = true;
      }

      // 6. Payer Name
      if (!mergedData.payerName && aiExtracted.payerName) {
        mergedData.payerName = aiExtracted.payerName.trim();
        mergedConfidence.payerName = "medium";
        hasAiContribution = true;
      }

      // Re-evaluate missing fields
      const missingFields: Array<"amount" | "trackingNumber" | "sourceCardLast4" | "paymentDate" | "paymentTime"> = [];
      if (mergedData.amount === null) missingFields.push("amount");
      if (!mergedData.trackingNumber) missingFields.push("trackingNumber");
      if (!mergedData.sourceCardLast4) missingFields.push("sourceCardLast4");
      if (!mergedData.paymentDate) missingFields.push("paymentDate");
      if (!mergedData.paymentTime) missingFields.push("paymentTime");

      return {
        data: mergedData,
        confidence: mergedConfidence,
        extractionMethod: hasAiContribution
          ? ruleResult.data.trackingNumber || ruleResult.data.amount
            ? "hybrid"
            : "ai"
          : "rule",
        missingFields,
        sanitizedText: ruleResult.sanitizedText,
      };
    } catch {
      // If AI fallback fails for any network or schema reason, gracefully return rule-based result
      return ruleResult;
    }
  }

  /**
   * Internal helper to invoke ModelGateway with strict schema.
   */
  private async extractWithAiFallback(
    rawText: string,
    options: {
      expectedAmount?: number;
      destinationCardNumber?: string;
      correlationId?: string;
    },
  ): Promise<Partial<ExtractedPaymentData> | null> {
    if (!this.modelGateway) return null;

    const prompt = `You are a Persian banking receipt parser. Extract payment transaction details from the provided SMS or receipt text.
Rules:
- amount: Numeric integer value (convert Persian digits to English digits).
- currency: "toman" or "rial" if explicitly mentioned.
- trackingNumber: Bank tracking / reference code (e.g. شماره پیگیری, شماره ارجاع, کد پیگیری, RefNo, Trx).
- sourceCardLast4: Exactly 4 digits of the payer's source card. DO NOT return destination card (${options.destinationCardNumber || "none"}).
- paymentDate: Persian Solar Hijri (e.g. 1404/12/15) or Gregorian date.
- paymentTime: Time in HH:MM format.
- payerName: Cardholder / sender name if present.
Return strictly a valid JSON object matching the requested schema. If a field is missing, set it to null.

Transaction Text:
"""
${sanitizePaymentText(rawText)}
"""`;

    const response = await this.modelGateway.complete({
      promptVersion: "payment_extraction_v1",
      messages: [
        {
          role: "system",
          content: "You are a specialized Iranian banking transaction data extraction service. Output valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      maxTokens: 500,
      jsonSchema: AI_EXTRACTION_JSON_SCHEMA,
      correlationId: options.correlationId || "c2c_extraction",
      organizationId: "org_system" as any,
      documentId: "doc_system" as any,
    });

    if (!response.text) return null;

    try {
      // Clean potential markdown markdown formatting like ```json ... ```
      let cleaned = response.text.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      const parsed = JSON.parse(cleaned);
      return {
        amount: typeof parsed.amount === "number" ? parsed.amount : null,
        currency: parsed.currency === "rial" || parsed.currency === "toman" ? parsed.currency : null,
        trackingNumber: typeof parsed.trackingNumber === "string" ? parsed.trackingNumber : null,
        sourceCardLast4: typeof parsed.sourceCardLast4 === "string" ? parsed.sourceCardLast4 : null,
        paymentDate: typeof parsed.paymentDate === "string" ? parsed.paymentDate : null,
        paymentTime: typeof parsed.paymentTime === "string" ? parsed.paymentTime : null,
        payerName: typeof parsed.payerName === "string" ? parsed.payerName : null,
      };
    } catch {
      return null;
    }
  }
}
