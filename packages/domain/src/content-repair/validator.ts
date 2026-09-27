/**
 * Validator for Content Repair Engine.
 *
 * Enforces strict safety guarantees after any repair operation:
 * - Fenced code blocks are balanced
 * - LaTeX math blocks are balanced and well-formed
 * - No raw JSON leakages remain
 * - No trailing metadata residue remains
 * - No accidental empty content
 * - No catastrophic content truncation
 */

import type { RepairValidationResult } from "./types.js";

export function validateRepairedContent(
  originalContent: string,
  repairedContent: string,
): RepairValidationResult {
  const errors: string[] = [];

  const origTrimmed = (originalContent || "").trim();
  const repTrimmed = (repairedContent || "").trim();

  // 1. Guard against empty content
  if (origTrimmed.length > 0 && repTrimmed.length === 0) {
    errors.push("محتوای اصلاح‌شده نمی‌تواند خالی باشد در حالی که محتوای اصلی دارای متن بوده است.");
  }

  // 2. Check code fence balance (```)
  const codeFences = (repairedContent.match(/```/g) || []).length;
  if (codeFences % 2 !== 0) {
    errors.push("بلوک‌های کد (Code blocks) در خروجی متوازن نیستند (تعداد علامت‌های ``` فرد است).");
  }

  // 3. Check display math $$ balance
  const displayMathTokens = (repairedContent.match(/\$\$/g) || []).length;
  if (displayMathTokens % 2 !== 0) {
    errors.push("بلوک‌های ریاضی دوطرفه ($$) متوازن نیستند.");
  }

  // 4. Check LaTeX braces inside \text{...}
  const textOpens = (repairedContent.match(/\\text\{/g) || []).length;
  const totalCloseBraces = (repairedContent.match(/\}/g) || []).length;
  if (textOpens > 0 && totalCloseBraces < textOpens) {
    errors.push("کروشه‌ها/آکولادهای دستورات LaTeX در متن بسته نشده‌اند.");
  }

  // 5. Guard against residual raw JSON session envelopes
  if (
    repTrimmed.startsWith("{") &&
    (repTrimmed.includes('"contentMarkdown"') || repTrimmed.includes('"kind"')) &&
    repTrimmed.endsWith("}")
  ) {
    errors.push("متن خروجی همچنان حاوی ساختار خام JSON است.");
  }

  // 6. Guard against trailing quoted UUID list leakage
  if (
    /(?:\n|^)\s*(?:"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"\s*,?\s*){2,}$/s.test(
      repTrimmed,
    )
  ) {
    errors.push("انتهای متن خروجی همچنان حاوی لیست شناسه متادیتای ناخواسته است.");
  }

  // 7. Accidental catastrophic truncation check
  // If original had more than 200 chars and repaired has less than 20% of original, verify it was JSON unwrapping
  if (origTrimmed.length > 200 && repTrimmed.length < origTrimmed.length * 0.2) {
    const wasJsonWrapper = origTrimmed.startsWith("{") && origTrimmed.includes('"contentMarkdown"');
    if (!wasJsonWrapper) {
      errors.push("طول محتوای اصلاح‌شده به طور غیرعادی کمتر از محتوای اصلی است (ریزش ناخواسته محتوا).");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
