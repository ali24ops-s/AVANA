/**
 * AVANA Transactional Email Templates
 * Presentation layer for all outbound emails adhering to AVANA's Light-first Design System.
 */

import { emailTokens } from "./email-tokens.js";
import {
  escapeHtml,
  sanitizeUrl,
  renderEmailLayout,
  renderEmailButton,
  renderEmailCodeBox,
  renderEmailDivider,
} from "./email-layout.js";

/**
 * Renders the HTML body for the Email Verification OTP email.
 */
export function renderVerificationEmailHtml(
  code: string,
  appUrl?: string,
): string {
  const content = `<h2 style="margin: 0 0 14px 0; font-family: ${emailTokens.typography.fontFamily}; font-size: ${emailTokens.typography.fontSizeHeading}; font-weight: 700; color: ${emailTokens.colors.text}; line-height: ${emailTokens.typography.lineHeightHeading};">تأیید نشانی ایمیل</h2>
<p style="margin: 0 0 16px 0; font-family: ${emailTokens.typography.fontFamily}; font-size: ${emailTokens.typography.fontSizeBody}; color: ${emailTokens.colors.textSecondary}; line-height: ${emailTokens.typography.lineHeightBody};">
  سلام،<br>
  برای تأیید حساب کاربری خود در آوانا، کد ۶ رقمی زیر را وارد کنید:
</p>
${renderEmailCodeBox({ code, expiryMinutes: "۱۰" })}
${renderEmailDivider()}
<p style="margin: 0; font-family: ${emailTokens.typography.fontFamily}; font-size: ${emailTokens.typography.fontSizeSmall}; color: ${emailTokens.colors.textMuted}; line-height: 22px; text-align: center;">
  اگر این درخواست توسط شما انجام نشده است، می‌توانید این ایمیل را نادیده بگیرید.
</p>`;

  return renderEmailLayout({
    title: "کد تأیید ایمیل آوانا",
    previewText: "کد تأیید نشانی ایمیل شما در سامانه هوشمند آوانا",
    content,
    appUrl,
  });
}

/**
 * Renders the plain text alternative for the Email Verification OTP email.
 */
export function renderVerificationEmailText(code: string): string {
  return `سلام،

برای تأیید ایمیل خود در آوانا، کد زیر را وارد کنید:

${code.trim()}

این کد ۱۰ دقیقه اعتبار دارد.

اگر این درخواست توسط شما انجام نشده است، می‌توانید این ایمیل را نادیده بگیرید.

آوانا - سامانه هوشمند آموزش و یادگیری`;
}

/**
 * Renders the HTML body for the Password Reset link email.
 */
export function renderPasswordResetHtml(
  resetUrl: string,
  appUrl?: string,
): string {
  const safeResetUrl = sanitizeUrl(resetUrl.trim());
  const escapedResetUrl = escapeHtml(resetUrl.trim());

  const content = `<h2 style="margin: 0 0 14px 0; font-family: ${emailTokens.typography.fontFamily}; font-size: ${emailTokens.typography.fontSizeHeading}; font-weight: 700; color: ${emailTokens.colors.text}; line-height: ${emailTokens.typography.lineHeightHeading};">بازیابی رمز عبور</h2>
<p style="margin: 0 0 16px 0; font-family: ${emailTokens.typography.fontFamily}; font-size: ${emailTokens.typography.fontSizeBody}; color: ${emailTokens.colors.textSecondary}; line-height: ${emailTokens.typography.lineHeightBody};">
  سلام،<br>
  درخواستی برای تغییر و ایجاد رمز عبور جدید برای حساب کاربری شما در آوانا ثبت شده است. برای تنظیم رمز عبور جدید، روی دکمه زیر کلیک کنید:
</p>
${renderEmailButton({ text: "ایجاد رمز عبور جدید", href: safeResetUrl })}
<p style="margin: 0 0 20px 0; font-family: ${emailTokens.typography.fontFamily}; font-size: 13px; color: ${emailTokens.colors.textMuted}; text-align: center; line-height: 22px;">
  ⏱️ این لینک به مدت <strong>۱۵ دقیقه</strong> معتبر است.
</p>
<p style="margin: 0 0 8px 0; font-family: ${emailTokens.typography.fontFamily}; font-size: 12px; color: ${emailTokens.colors.textMuted}; line-height: 20px; text-align: center;">
  در صورت عدم عملکرد دکمه، پیوند زیر را باز کنید:
</p>
<div style="background-color: ${emailTokens.colors.background}; border: 1px solid ${emailTokens.colors.border}; border-radius: 8px; padding: 10px 14px; text-align: left; direction: ltr; word-break: break-all; margin-bottom: 20px;">
  <a href="${safeResetUrl}" target="_blank" rel="noopener noreferrer" style="font-family: ${emailTokens.typography.fontFamilyMono}; font-size: 11px; color: ${emailTokens.colors.primary}; text-decoration: underline;">
    ${escapedResetUrl}
  </a>
</div>
${renderEmailDivider()}
<p style="margin: 0; font-family: ${emailTokens.typography.fontFamily}; font-size: ${emailTokens.typography.fontSizeSmall}; color: ${emailTokens.colors.textMuted}; line-height: 22px; text-align: center;">
  اگر این درخواست توسط شما ارسال نشده است، لطفاً این ایمیل را نادیده بگیرید. رمز عبور فعلی شما بدون تغییر باقی خواهد ماند.
</p>`;

  return renderEmailLayout({
    title: "بازیابی رمز عبور آوانا",
    previewText: "درخواست بازیابی رمز عبور حساب کاربری آوانا",
    content,
    appUrl,
  });
}

/**
 * Renders the plain text alternative for the Password Reset email.
 */
export function renderPasswordResetText(resetUrl: string): string {
  return `سلام،

درخواستی برای تغییر رمز عبور حساب کاربری شما در آوانا دریافت شده است.

برای ایجاد رمز عبور جدید، از پیوند زیر استفاده کنید:
${resetUrl.trim()}

این پیوند به مدت ۱۵ دقیقه اعتبار دارد.

اگر این درخواست توسط شما انجام نشده است، لطفاً این پیام را نادیده بگیرید؛ رمز عبور فعلی شما تغییری نخواهد کرد.

آوانا - سامانه هوشمند آموزش و یادگیری`;
}
