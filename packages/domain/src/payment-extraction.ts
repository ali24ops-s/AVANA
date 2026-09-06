/**
 * Payment Information Extraction & Sanitization Primitives.
 *
 * Provides:
 * 1. Rule-based parsing of Persian/English bank SMS and transaction receipts.
 * 2. Persian/Arabic digits and date/time normalization.
 * 3. Currency-aware amount parsing (Toman vs Rial).
 * 4. Strict PII sanitization / redaction (Masking full card numbers, CVV2, OTPs).
 */

export type ExtractionMethod = "rule" | "ai" | "hybrid" | "manual";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface FieldConfidence {
  amount: ConfidenceLevel;
  trackingNumber: ConfidenceLevel;
  sourceCardLast4: ConfidenceLevel;
  paymentDate: ConfidenceLevel;
  paymentTime: ConfidenceLevel;
  payerName: ConfidenceLevel;
}

export interface ExtractedPaymentData {
  amount: number | null; // Canonical amount in Tomans (integer)
  rawAmount: number | null; // Raw numeric value found in text
  currency: "toman" | "rial" | null;
  trackingNumber: string | null;
  sourceCardLast4: string | null;
  paymentDate: string | null; // e.g. "1405/06/11" or "2026-09-02"
  paymentTime: string | null; // e.g. "14:32"
  payerName: string | null;
}

export interface PaymentExtractionResult {
  data: ExtractedPaymentData;
  confidence: FieldConfidence;
  extractionMethod: ExtractionMethod;
  missingFields: Array<"amount" | "trackingNumber" | "sourceCardLast4" | "paymentDate" | "paymentTime">;
  sanitizedText: string;
}

export interface RuleExtractionOptions {
  expectedAmount?: number; // Expected plan price in Tomans
  destinationCardNumber?: string; // Destination card to avoid false positives on sourceCardLast4
}

/**
 * Converts Persian (۰-۹) and Arabic (٠-٩) digits to ASCII standard digits (0-9).
 */
export function normalizePersianDigits(text: string): string {
  if (!text) return "";
  return text
    .replace(/[۰٠]/g, "0")
    .replace(/[۱١]/g, "1")
    .replace(/[۲٢]/g, "2")
    .replace(/[۳٣]/g, "3")
    .replace(/[۴٤]/g, "4")
    .replace(/[۵٥]/g, "5")
    .replace(/[۶٦]/g, "6")
    .replace(/[۷٧]/g, "7")
    .replace(/[۸٨]/g, "8")
    .replace(/[۹٩]/g, "9");
}

/**
 * Normalizes Persian characters (e.g. Arabic Yeh/Kaf to Persian Yeh/Keheh, zero-width spaces).
 */
export function normalizePersianText(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, " ") // Zero-width spaces to space
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\r\t]+/g, " ");
}

/**
 * Sanitizes / Redacts payment text before storage.
 * - Masks 16-digit card numbers keeping only the last 4 digits (e.g. `**** **** **** 1234`).
 * - Redacts CVV2 / CVV numbers (`CVV2: ***`).
 * - Redacts OTP / dynamic passwords / passwords (`رمز: [REDACTED]`).
 */
export function sanitizePaymentText(rawText: string): string {
  if (!rawText) return "";
  // First normalize digits so regexes catch Persian and English digits uniformly
  let sanitized = normalizePersianDigits(rawText);

  // 1. Redact CVV2 / CVV (Persian and English)
  sanitized = sanitized.replace(
    /(cvv2?|سی\s*وی\s*وی\s*[12]?|cvv)\s*[:：\-]?\s*([0-9]{3,4})/gi,
    "$1: ***",
  );

  // 2. Redact OTP / Dynamic Passwords (رمز پویا / رمز دوم / یکبار مصرف / OTP / PIN)
  sanitized = sanitized.replace(
    /(رمز\s*(?:پویا|دوم|یکبار\s*مصرف|اینترنتی)?|otp|password|pin)\s*[:：\-]?\s*([0-9]{4,10})/gi,
    "$1: [REDACTED]",
  );

  // 3. Mask 16-digit Card Numbers (with optional spaces, dashes)
  // Formats: 1234-5678-9012-3456 or 1234 5678 9012 3456 or 1234567890123456
  sanitized = sanitized.replace(
    /(?:^|[^\d])([0-9]{4})[- ]?([0-9]{4})[- ]?([0-9]{4})[- ]?([0-9]{4})(?:[^\d]|$)/g,
    (_match, _p1, _p2, _p3, p4) => {
      return ` **** **** **** ${p4} `;
    },
  );

  // Formats with partial masking already in text: 603799******1234 or 6037-99**-****-1234
  sanitized = sanitized.replace(
    /(?:^|[^\d])([0-9]{4,6})[- ]?[*xX.-]{4,8}[- ]?([0-9]{4})(?:[^\d]|$)/g,
    (_match, _p1, p2) => {
      return ` **** **** **** ${p2} `;
    },
  );

  return sanitized.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Extracts structured payment information from raw SMS / receipt text using rules & regexes.
 */
export function extractPaymentInfoFromRules(
  rawText: string,
  options: RuleExtractionOptions = {},
): PaymentExtractionResult {
  const sanitizedText = sanitizePaymentText(rawText);
  const normalizedText = normalizePersianText(rawText);
  const asciiText = normalizePersianDigits(normalizedText);

  let amount: number | null = null;
  let rawAmount: number | null = null;
  let currency: "toman" | "rial" | null = null;
  let trackingNumber: string | null = null;
  let sourceCardLast4: string | null = null;
  let paymentDate: string | null = null;
  let paymentTime: string | null = null;
  let payerName: string | null = null;

  const confidence: FieldConfidence = {
    amount: "low",
    trackingNumber: "low",
    sourceCardLast4: "low",
    paymentDate: "low",
    paymentTime: "low",
    payerName: "low",
  };

  const destinationLast4 = options.destinationCardNumber
    ? normalizePersianDigits(options.destinationCardNumber).slice(-4)
    : undefined;

  // ---------------------------------------------------------------------------
  // 1. Amount Extraction (Currency-aware)
  // ---------------------------------------------------------------------------
  // Look for currency indicators: "تومان", "ت", "ریال", "Rials", "Tomans", "IRT", "IRR"
  const amountPatterns = [
    // Label + Amount + Currency: مبلغ: 299,000 تومان or مبلغ 2990000 ریال
    /(?:مبلغ|واریز|پرداخت|کسر|برداشت|واریز\s*شد|کسر\s*شد|بهای|انتقال|موفق|fee|amount)\s*[:：\-]?\s*([0-9,٬،.\s]+)\s*(تومان|ت|ریال|tomans?|rials?|irt|irr)?/gi,
    // Amount + Currency directly: 299,000 تومان or 2,990,000 ریال
    /([0-9,٬،.]{4,})\s*(تومان|ت|ریال|tomans?|rials?|irt|irr)/gi,
  ];

  for (const regex of amountPatterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(asciiText)) !== null) {
      const rawNumStr = match[1].replace(/[,٬،\s]/g, "").trim();
      const unit = (match[2] || "").trim().toLowerCase();
      const parsedNum = parseInt(rawNumStr, 10);

      if (!isNaN(parsedNum) && parsedNum > 0) {
        rawAmount = parsedNum;
        if (unit === "ریال" || unit === "rial" || unit === "rials" || unit === "irr") {
          currency = "rial";
          amount = Math.round(parsedNum / 10); // Convert Rial to Toman
          confidence.amount = "high";
        } else if (unit === "تومان" || unit === "ت" || unit === "toman" || unit === "tomans" || unit === "irt") {
          currency = "toman";
          amount = parsedNum;
          confidence.amount = "high";
        } else {
          // No explicit unit: compare with expected amount if given
          if (options.expectedAmount) {
            if (parsedNum === options.expectedAmount) {
              amount = parsedNum;
              currency = "toman";
              confidence.amount = "high";
            } else if (parsedNum === options.expectedAmount * 10) {
              amount = options.expectedAmount;
              currency = "rial";
              confidence.amount = "high";
            } else {
              amount = parsedNum;
              confidence.amount = "medium";
            }
          } else {
            amount = parsedNum;
            confidence.amount = "medium";
          }
        }
        break;
      }
    }
    if (amount !== null) break;
  }

  // ---------------------------------------------------------------------------
  // 2. Tracking / Reference Number Extraction
  // ---------------------------------------------------------------------------
  // Common Persian bank tracking labels:
  // شماره پیگیری, کد پیگیری, ش پیگیری, شماره ارجاع, کد ارجاع, شناسه ارجاع, شماره تراکنش, شناسه تراکنش, پیگیری, ارجاع, تراکنش, Ref, Tracking, Trx, RRN, Trace
  const trackingPatterns = [
    /(?:شماره\s*پیگیری|کد\s*پیگیری|ش\s*پیگیری|شناسه\s*پیگیری|شماره\s*ارجاع|کد\s*ارجاع|شناسه\s*ارجاع|شماره\s*تراکنش|شناسه\s*تراکنش|کد\s*تراکنش|شماره\s*سند|کد\s*سند|شماره\s*مرجع|ref(?:erence)?\s*(?:no|num|code)?|tracking\s*(?:no|code|id)?|trx\s*(?:id|no)?|rrn|trace\s*(?:no|code)?|seq\s*(?:no)?)\s*[:：=\-#]?\s*([A-Za-z0-9]{4,30})/gi,
    // Shorter fallback for "پیگیری: 123456" or "ارجاع: 123456"
    /(?:پیگیری|ارجاع|تراکنش)\s*[:：=\-#]\s*([0-9]{4,30})/gi,
  ];

  for (const regex of trackingPatterns) {
    const match = regex.exec(asciiText);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Ensure it's not a common date or time
      if (!/^\d{4}[/.-]\d{2}[/.-]\d{2}$/.test(candidate) && candidate.length >= 4) {
        trackingNumber = candidate;
        confidence.trackingNumber = "high";
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Source Card Last 4 Digits Extraction
  // ---------------------------------------------------------------------------
  // Patterns for source / origin card:
  // برداشت از: 6037...4321, از کارت: 6037...1234, کارت مبدا: ...1234
  // کارت: ****1234, کارت: 1234
  const sourceCardPatterns = [
    // Explicit source/withdrawal patterns: برداشت از: ...4321 or از کارت: ...4321 or کارت مبدا: ...4321
    /(?:برداشت\s*از|از\s*کارت|کارت\s*مبد[اأ]|کارت\s*واریز\s*کننده|از\s*حساب|حساب\s*مبد[اأ]|from\s*card)\s*[:：\-]?\s*(?:[0-9]{4,6})?[- ]?[*xX.-]*\s*([0-9]{4})\b/gi,
    // Masked card with stars: 603799******1234 or ****1234 or کارت: ****1234
    /(?:کارت|card)?\s*[:：\-]?\s*(?:[0-9]{4,6})?[- ]?[*xX.-]{2,10}\s*([0-9]{4})\b/gi,
    // Full 16-digit card: 6037-9912-3456-7890 -> last 4
    /(?:^|[^\d])(?:[0-9]{4})[- ]?(?:[0-9]{4})[- ]?(?:[0-9]{4})[- ]?([0-9]{4})(?:[^\d]|$)/gi,
  ];

  for (const regex of sourceCardPatterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(asciiText)) !== null) {
      const candidateLast4 = match[1]?.trim();
      if (!candidateLast4 || !/^\d{4}$/.test(candidateLast4)) continue;
      // If matches destination card, skip unless it was an explicit "از" or "مبدا"
      if (destinationLast4 && candidateLast4 === destinationLast4 && !match[0].includes("از") && !match[0].includes("مبد")) {
        continue;
      }
      sourceCardLast4 = candidateLast4;
      confidence.sourceCardLast4 = match[0].includes("مبد") || match[0].includes("از") || match[0].includes("برداشت") ? "high" : "medium";
      break;
    }
    if (sourceCardLast4) break;
  }

  // ---------------------------------------------------------------------------
  // 4. Payment Date Extraction
  // ---------------------------------------------------------------------------
  // Order 2-digit branches first (1[0-2]|0?[1-9]) and ([12][0-9]|3[01]|0?[1-9])
  const datePatterns = [
    /(?:تاریخ|date)\s*[:：\-]?\s*(140[0-9][/.-](?:1[0-2]|0?[1-9])[/.-](?:[12][0-9]|3[01]|0?[1-9]))/gi,
    /(?:تاریخ|date)\s*[:：\-]?\s*(202[4-9][/.-](?:1[0-2]|0?[1-9])[/.-](?:[12][0-9]|3[01]|0?[1-9]))/gi,
    // Standalone Solar Hijri date
    /\b(140[0-9][/.-](?:1[0-2]|0?[1-9])[/.-](?:[12][0-9]|3[01]|0?[1-9]))\b/g,
    // Standalone Gregorian date
    /\b(202[4-9][/.-](?:1[0-2]|0?[1-9])[/.-](?:[12][0-9]|3[01]|0?[1-9]))\b/g,
  ];

  for (const regex of datePatterns) {
    const match = regex.exec(asciiText);
    if (match && match[1]) {
      paymentDate = match[1].replace(/[.-]/g, "/").trim();
      confidence.paymentDate = match[0].includes("تاریخ") ? "high" : "medium";
      break;
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Payment Time Extraction
  // ---------------------------------------------------------------------------
  // Time formats: 14:32 or 14:32:15 or ساعت 14:32
  const timePatterns = [
    /(?:ساعت|زمان|time)\s*[:：\-]?\s*([0-2]?[0-9]:[0-5][0-9](?::[0-5][0-9])?)/gi,
    /\b([0-2][0-9]:[0-5][0-9](?::[0-5][0-9])?)\b/g,
  ];

  for (const regex of timePatterns) {
    const match = regex.exec(asciiText);
    if (match && match[1]) {
      const rawTime = match[1].trim();
      // Ensure hour is 0-23
      const parts = rawTime.split(":");
      const hour = parseInt(parts[0], 10);
      if (hour >= 0 && hour <= 23) {
        // Format to HH:MM
        paymentTime = `${String(hour).padStart(2, "0")}:${parts[1]}`;
        confidence.paymentTime = match[0].includes("ساعت") || match[0].includes("زمان") ? "high" : "medium";
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Payer Name Extraction
  // ---------------------------------------------------------------------------
  // Patterns: به نام: علی رضایی, بنام علی رضایی, واریز کننده: ..., صاحب حساب: ...
  const namePatterns = [
    /(?:به\s*نام|بنام|صاحب\s*حساب|واریز\s*کننده|پرداخت\s*کننده|نام\s*واریز\s*کننده)\s*[:：\-]?\s*([آ-ی\s]{3,35})(?:\s*[-–,\n]|$)/gi,
  ];

  for (const regex of namePatterns) {
    const match = regex.exec(normalizedText);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Filter out non-names like "بانک", "کارت", etc.
      if (
        candidate.length >= 3 &&
        !candidate.includes("بانک") &&
        !candidate.includes("کارت") &&
        !candidate.includes("حساب") &&
        !candidate.includes("تومان")
      ) {
        payerName = candidate;
        confidence.payerName = "medium";
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Missing Essential Fields Check
  // ---------------------------------------------------------------------------
  const missingFields: Array<"amount" | "trackingNumber" | "sourceCardLast4" | "paymentDate" | "paymentTime"> = [];
  if (amount === null) missingFields.push("amount");
  if (!trackingNumber) missingFields.push("trackingNumber");
  if (!sourceCardLast4) missingFields.push("sourceCardLast4");
  if (!paymentDate) missingFields.push("paymentDate");
  if (!paymentTime) missingFields.push("paymentTime");

  return {
    data: {
      amount,
      rawAmount,
      currency,
      trackingNumber,
      sourceCardLast4,
      paymentDate,
      paymentTime,
      payerName,
    },
    confidence,
    extractionMethod: "rule",
    missingFields,
    sanitizedText,
  };
}
