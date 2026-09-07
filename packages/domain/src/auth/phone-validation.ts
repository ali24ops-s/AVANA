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
