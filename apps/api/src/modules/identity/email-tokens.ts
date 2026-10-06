/**
 * AVANA Design Tokens — Email Subsystem
 * Canonical email tokens aligned with AVANA's Light-first Design System.
 * Source of truth: packages/ui/src/tokens/
 */

export const emailTokens = {
  colors: {
    // Surfaces & Backgrounds
    background: "#F7F9FA",
    surface: "#FFFFFF",
    surfaceMuted: "#F0FAFA",

    // Borders & Dividers
    border: "#E2E7EA",
    borderLight: "#EEF1F3",
    borderBrand: "#B3D9D9",

    // Brand Primary (Canonical Teal)
    primary: "#008080",
    primaryHover: "#007575",
    primaryActive: "#006060",
    primarySoft: "#F0FAFA",

    // Brand Secondary & Warm
    secondary: "#A7D0E6",
    warm: "#F0E6D2",

    // Text & Content
    text: "#1a2226",
    textSecondary: "#3d4f55",
    textMuted: "#5B6268",
    textOnPrimary: "#FFFFFF",

    // Monospace OTP Code Box
    codeBg: "#F0FAFA",
    codeBorder: "#B3D9D9",
    codeText: "#006060",
  },
  typography: {
    // Robust Persian fallback chain for email clients (Gmail web/mobile, Outlook, Apple Mail)
    fontFamily:
      "'Estedad', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Vazirmatn', Tahoma, Arial, sans-serif",
    fontFamilyMono:
      "SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
    lineHeightBody: "26px",
    lineHeightHeading: "30px",
    fontSizeHeading: "20px",
    fontSizeBody: "15px",
    fontSizeSmall: "12px",
    fontSizeMeta: "11px",
    fontSizeCode: "32px",
  },
  dimensions: {
    maxContainerWidth: "580px",
    cardRadius: "16px",
    buttonRadius: "10px",
    codeBoxRadius: "12px",
    logoWidth: "120px",
    logoHeight: "81px",
  },
} as const;

export type EmailTokens = typeof emailTokens;
