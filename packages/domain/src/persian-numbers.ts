/**
 * Canonical Persian Number & Counter Formatters for AVANA Presentation Layer.
 *
 * Guaranteed behavior:
 * - Converts ASCII digits (0-9) and Arabic-Indic digits (٠-٩) to Persian digits (۰-۹).
 * - Handles pure numbers, numeric strings, and mixed strings (e.g. "2 از ۴" -> "۲ از ۴").
 * - Formats composite "X از Y" counters with optional prefixes (مرحله، جلسه، سؤال، صفحه).
 * - Leaves actual mathematical, logical, sorting, and API payload values unaffected.
 */

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"] as const;

// Mapping regex covering:
// 1. ASCII digits: \u0030-\u0039 (0-9)
// 2. Arabic-Indic digits: \u0660-\u0669 (٠-٩)
// Note: Persian digits (\u06F0-\u06F9) are already Persian and kept as-is.
const DIGIT_REPLACE_REGEX = /[\u0030-\u0039\u0660-\u0669]/g;

function convertCharToPersianDigit(char: string): string {
  const code = char.charCodeAt(0);
  // ASCII digits 0-9: code 48..57
  if (code >= 48 && code <= 57) {
    return PERSIAN_DIGITS[code - 48]!;
  }
  // Arabic-Indic digits ٠-٩: code 1632..1641 (\u0660..\u0669)
  if (code >= 1632 && code <= 1641) {
    return PERSIAN_DIGITS[code - 1632]!;
  }
  return char;
}

/**
 * Converts any number, string, or mixed string to canonical Persian digits.
 *
 * Examples:
 *   toPersianDigits(42)          -> "۴۲"
 *   toPersianDigits("2 از 4")    -> "۲ از ۴"
 *   toPersianDigits("2 از ۴")    -> "۲ از ۴"
 *   toPersianDigits("۲ از 4")    -> "۲ از ۴"
 *   toPersianDigits("12 از 20")  -> "۱۲ از ۲۰"
 *   toPersianDigits(null)        -> ""
 */
export function toPersianDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(DIGIT_REPLACE_REGEX, convertCharToPersianDigit);
}

export interface FormatPersianOfOptions {
  /** Optional prefix before "X از Y", e.g. "مرحله", "جلسه", "سوال", "صفحه", "دوره" */
  prefix?: string;
  /** Optional suffix after "X از Y", e.g. "درس", "کارت", "صحیح" */
  suffix?: string;
}

/**
 * Formats a ratio / progress indicator into a canonical Persian "X از Y" string.
 *
 * Guarantees that both sides (current and total) are rendered in Persian digits,
 * eliminating the "2 از ۴" or "مرحله 2 از ۶" bug globally.
 *
 * Examples:
 *   formatPersianOf(2, 4)                                 -> "۲ از ۴"
 *   formatPersianOf(2, 6, { prefix: "مرحله" })            -> "مرحله ۲ از ۶"
 *   formatPersianOf(1, 10, { prefix: "جلسه" })            -> "جلسه ۱ از ۱۰"
 *   formatPersianOf(3, 20, { prefix: "سوال" })            -> "سوال ۳ از ۲۰"
 *   formatPersianOf(1, 5, { prefix: "صفحه" })             -> "صفحه ۱ از ۵"
 *   formatPersianOf(5, 20, { suffix: "درس تکمیل شده" })   -> "۵ از ۲۰ درس تکمیل شده"
 */
export function formatPersianOf(
  current: string | number | null | undefined,
  total: string | number | null | undefined,
  options?: FormatPersianOfOptions,
): string {
  const currentStr = toPersianDigits(current ?? 0);
  const totalStr = toPersianDigits(total ?? 0);
  const base = `${currentStr} از ${totalStr}`;

  const prefixPart = options?.prefix ? `${options.prefix.trim()} ` : "";
  const suffixPart = options?.suffix ? ` ${options.suffix.trim()}` : "";

  return `${prefixPart}${base}${suffixPart}`;
}
