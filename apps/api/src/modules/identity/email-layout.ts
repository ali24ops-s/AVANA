/**
 * AVANA Shared Email Layout & Components
 * Generates robust, bulletproof HTML email structures adhering to AVANA's Light-first Design System.
 * Compatibility target: Gmail Web/Mobile, Apple Mail, Outlook.
 */

import { emailTokens } from "./email-tokens.js";

/**
 * Escapes unsafe HTML characters to prevent injection / XSS.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Validates and sanitizes URLs used in HTML href attributes.
 * Allows https protocols and, in local dev, http.
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return escapeHtml(url);
    }
  } catch {
    // Relative or invalid URL
  }
  return "#";
}

/**
 * Resolves the canonical public application URL from provided value, environment, or default.
 */
export function resolvePublicAppUrl(appUrl?: string): string {
  const envUrl =
    appUrl ||
    process.env.AVANA_APP_URL ||
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    "https://aavana.ir";

  return envUrl.replace(/\/+$/, "");
}

export interface EmailLayoutProps {
  title: string;
  previewText?: string;
  content: string;
  appUrl?: string;
}

/**
 * Master Light-First Email Layout for all AVANA transactional emails.
 */
export function renderEmailLayout({
  title,
  previewText,
  content,
  appUrl,
}: EmailLayoutProps): string {
  const resolvedAppUrl = resolvePublicAppUrl(appUrl);
  const logoUrl = `${resolvedAppUrl}/brand/avana-logo.png`;
  const escapedTitle = escapeHtml(title);
  const escapedPreview = previewText ? escapeHtml(previewText) : "";

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapedTitle}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Responsive & Client-Specific Tweaks */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .email-card { padding: 24px 18px !important; border-radius: 12px !important; }
      .email-outer-td { padding: 20px 10px !important; }
      .code-display { font-size: 26px !important; letter-spacing: 6px !important; }
    }
  </style>
</head>
<body dir="rtl" style="margin: 0; padding: 0; width: 100% !important; background-color: ${emailTokens.colors.background}; font-family: ${emailTokens.typography.fontFamily}; color: ${emailTokens.colors.text}; direction: rtl; text-align: right; -webkit-font-smoothing: antialiased;">
  ${
    escapedPreview
      ? `<!-- Preheader text for email clients -->
  <div style="display: none; max-height: 0px; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #ffffff; opacity: 0;">
    ${escapedPreview}
  </div>`
      : ""
  }
  <!-- Outer Wrapper Table -->
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" dir="rtl" style="background-color: ${emailTokens.colors.background}; width: 100%; margin: 0; padding: 0;">
    <tr>
      <td class="email-outer-td" align="center" dir="rtl" style="padding: 36px 16px;">
        <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellspacing="0" cellpadding="0" width="580" dir="rtl">
        <tr>
        <td align="center" valign="top" dir="rtl">
        <![endif]-->
        <table class="email-container" role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" dir="rtl" style="max-width: ${emailTokens.dimensions.maxContainerWidth}; width: 100%; margin: 0 auto;">
          <!-- Header: Brand Logo & Subtitle -->
          <tr>
            <td align="center" dir="rtl" style="padding: 0 0 24px 0; text-align: center;">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                <tr>
                  <td align="center">
                    <img src="${logoUrl}" alt="آوانا | AVANA" width="120" height="81" style="display: block; margin: 0 auto; width: 120px; max-width: 120px; height: auto; border: 0; outline: none; text-decoration: none;" />
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 10px;">
                    <span style="font-family: ${emailTokens.typography.fontFamily}; font-size: 13px; font-weight: 500; color: ${emailTokens.colors.textMuted}; display: block; letter-spacing: -0.2px;">
                      سامانه هوشمند آموزش و یادگیری
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Card -->
          <tr>
            <td dir="rtl" align="center">
              <table class="email-card" role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" dir="rtl" style="background-color: ${emailTokens.colors.surface}; border-radius: ${emailTokens.dimensions.cardRadius}; border: 1px solid ${emailTokens.colors.border}; overflow: hidden; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td dir="rtl" align="right" style="padding: 32px 32px; font-family: ${emailTokens.typography.fontFamily}; color: ${emailTokens.colors.text}; font-size: ${emailTokens.typography.fontSizeBody}; line-height: ${emailTokens.typography.lineHeightBody}; text-align: right;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" dir="rtl" style="padding: 24px 16px 8px 16px; text-align: center;">
              <p style="margin: 0; font-family: ${emailTokens.typography.fontFamily}; font-size: ${emailTokens.typography.fontSizeSmall}; color: ${emailTokens.colors.textMuted}; line-height: 22px; text-align: center;">
                تمامی حقوق برای سامانه آموزش هوشمند آوانا محفوظ است
              </p>
              <p style="margin: 4px 0 0 0; font-family: ${emailTokens.typography.fontFamily}; font-size: ${emailTokens.typography.fontSizeMeta}; color: ${emailTokens.colors.textMuted}; line-height: 18px; text-align: center; direction: ltr;">
                AVANA Platform — All rights reserved
              </p>
            </td>
          </tr>
        </table>
        <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Bulletproof CTA button matching AVANA Primary brand token (#008080).
 */
export function renderEmailButton({
  text,
  href,
}: {
  text: string;
  href: string;
}): string {
  const safeHref = sanitizeUrl(href);
  const escapedText = escapeHtml(text);

  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 28px auto; text-align: center;">
  <tr>
    <td align="center" style="border-radius: ${emailTokens.dimensions.buttonRadius}; background-color: ${emailTokens.colors.primary};">
      <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: ${emailTokens.colors.primary}; color: ${emailTokens.colors.textOnPrimary}; font-family: ${emailTokens.typography.fontFamily}; font-size: 14px; font-weight: 700; line-height: 20px; text-decoration: none; padding: 13px 30px; border-radius: ${emailTokens.dimensions.buttonRadius}; text-align: center; border: 1px solid ${emailTokens.colors.primary}; -webkit-text-size-adjust: none; mso-padding-alt: 0;">
        ${escapedText}
      </a>
    </td>
  </tr>
</table>`;
}

/**
 * OTP / Verification Code Box with strict LTR isolation and clear visibility.
 */
export function renderEmailCodeBox({
  code,
  expiryMinutes = "۱۰",
}: {
  code: string;
  expiryMinutes?: string | number;
}): string {
  const escapedCode = escapeHtml(code.trim());

  return `<div style="background-color: ${emailTokens.colors.codeBg}; border: 1px solid ${emailTokens.colors.codeBorder}; border-radius: ${emailTokens.dimensions.codeBoxRadius}; padding: 18px 20px; text-align: center; margin: 24px 0;">
  <span class="code-display" style="font-family: ${emailTokens.typography.fontFamilyMono}; font-size: ${emailTokens.typography.fontSizeCode}; font-weight: 800; letter-spacing: 8px; color: ${emailTokens.colors.codeText}; display: inline-block; direction: ltr; unicode-bidi: embed;">
    ${escapedCode}
  </span>
</div>
<p style="margin: 0 0 20px 0; font-size: 13px; color: ${emailTokens.colors.textMuted}; text-align: center; line-height: 22px;">
  ⏱️ این کد به مدت <strong>${expiryMinutes} دقیقه</strong> اعتبار دارد.
</p>`;
}

/**
 * Clean subtle divider matching borderLight token (#EEF1F3).
 */
export function renderEmailDivider(): string {
  return `<hr style="border: none; border-top: 1px solid ${emailTokens.colors.borderLight}; margin: 24px 0;">`;
}
