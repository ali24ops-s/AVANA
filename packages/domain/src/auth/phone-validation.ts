/**
 * Iranian Mobile Phone Validation and Canonical Normalization Utility.
 *
 * Rules:
 * 1. Allowed input formats:
 *    - 09xxxxxxxxx (11 digits starting with 09)
 *    - +989xxxxxxxxx (13 characters starting with +989)
 *    - 00989xxxxxxxxx (14 characters starting with 00989)
 * 2. Formats like 9xxxxxxxxx (missing leading 0 or country code) are rejected.
 * 3. Spaces, dashes, and parentheses are stripped before validation.
 * 4. Persian and Arabic numerals (۰-۹ and ٠-٩) are converted to standard ASCII digits.
 * 5. All valid numbers normalize to canonical E.164-style format: +989xxxxxxxxx.
 */

export interface PhoneValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Convert Persian (۰-۹) and Arabic (٠-٩) digits to ASCII standard digits (0-9).
 */
export function convertEasternToAsciiDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

/**
 * Validates and normalizes an Iranian mobile phone number.
 */
export function validateAndNormalizeIranPhone(
  rawInput: string | null | undefined,
): PhoneValidationResult {
  if (!rawInput || typeof rawInput !== "string") {
    return {
      valid: false,
      error: "شماره موبایل الزامی است.",
    };
  }

  // 1. Convert eastern digits to ASCII and clean whitespace/formatting characters
  const converted = convertEasternToAsciiDigits(rawInput.trim());
  const sanitized = converted.replace(/[\s\-_()]/g, "");

  if (!sanitized) {
    return {
      valid: false,
      error: "شماره موبایل نمی‌تواند خالی باشد.",
    };
  }

  // 2. Reject if non-digit characters exist (except optional single leading '+')
  const hasLeadingPlus = sanitized.startsWith("+");
  const digitsOnly = hasLeadingPlus ? sanitized.slice(1) : sanitized;

  if (!/^\d+$/.test(digitsOnly)) {
    return {
      valid: false,
      error: "شماره موبایل فقط باید شامل ارقام باشد.",
    };
  }

  // 3. Strict format matching:
  // Format A: 09xxxxxxxxx (11 digits)
  if (!hasLeadingPlus && sanitized.length === 11 && sanitized.startsWith("09")) {
    const canonical = `+98${sanitized.slice(1)}`;
    return {
      valid: true,
      normalized: canonical,
    };
  }

  // Format B: +989xxxxxxxxx (13 chars: '+' followed by '989' and 8 more digits -> total 12 digits after '+')
  if (hasLeadingPlus && digitsOnly.length === 12 && digitsOnly.startsWith("989")) {
    const canonical = `+${digitsOnly}`;
    return {
      valid: true,
      normalized: canonical,
    };
  }

  // Format C: 00989xxxxxxxxx (14 digits)
  if (!hasLeadingPlus && sanitized.length === 14 && sanitized.startsWith("00989")) {
    const canonical = `+${sanitized.slice(2)}`;
    return {
      valid: true,
      normalized: canonical,
    };
  }

  // Reject invalid lengths or formats
  return {
    valid: false,
    error: "شماره موبایل معتبر نیست. لطفاً شماره‌ای با فرمت 09123456789 وارد نمایید.",
  };
}

/**
 * Convenience helper returning normalized phone or null.
 */
export function normalizeIranPhone(
  rawInput: string | null | undefined,
): string | null {
  const result = validateAndNormalizeIranPhone(rawInput);
  return result.valid && result.normalized ? result.normalized : null;
}

/**
 * Convenience helper returning boolean validity.
 */
export function isValidIranPhone(
  rawInput: string | null | undefined,
): boolean {
  return validateAndNormalizeIranPhone(rawInput).valid;
}

/**
 * Generate all common storage/input variants of a valid Iranian mobile number
 * to ensure resilient, format-agnostic database lookups.
 *
 * Supported formats generated:
 * 1. Canonical E.164: +989xxxxxxxxx
 * 2. National format: 09xxxxxxxxx
 * 3. International with 00: 00989xxxxxxxxx
 * 4. Raw 10-digit without leading 0: 9xxxxxxxxx
 */
export function getPhoneLookupVariants(rawInput: string | null | undefined): string[] {
  if (!rawInput || typeof rawInput !== "string") {
    return [];
  }

  const converted = convertEasternToAsciiDigits(rawInput.trim());
  const sanitized = converted.replace(/[\s\-_()]/g, "");
  if (!sanitized) return [];

  // If valid according to validateAndNormalizeIranPhone
  const validation = validateAndNormalizeIranPhone(sanitized);
  if (!validation.valid || !validation.normalized) {
    // If not standardly valid, return just the cleaned input if non-empty
    return sanitized ? [sanitized] : [];
  }

  const canonical = validation.normalized; // +989xxxxxxxxx (13 chars)
  const core10 = canonical.slice(3); // 9xxxxxxxxx (10 chars starting with 9)

  const variants = new Set<string>([
    canonical, // +989xxxxxxxxx
    `0${core10}`, // 09xxxxxxxxx
    `0098${core10}`, // 00989xxxxxxxxx
    core10, // 9xxxxxxxxx
  ]);

  if (sanitized && !variants.has(sanitized)) {
    variants.add(sanitized);
  }

  return Array.from(variants);
}

/**
 * Mask a phone number for privacy-compliant logging (e.g. +98912***3456 or 0912***3456).
 * Never leaks the full phone number or OTP.
 */
export function maskPhoneNumberForLogs(rawInput: string | null | undefined): string {
  if (!rawInput || typeof rawInput !== "string") {
    return "[empty]";
  }
  const str = rawInput.trim();
  if (str.length <= 6) {
    return "***";
  }
  const prefix = str.slice(0, Math.min(5, Math.floor(str.length / 2)));
  const suffix = str.slice(-3);
  return `${prefix}***${suffix}`;
}
