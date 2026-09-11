/**
 * AVANA Design Tokens — Typography
 * Estedad variable font configuration with RTL / Persian line-height optimization.
 * 
 * Standard Weights:
 * - Headings primary: 700
 * - Headings secondary: 600
 * - Body: 400 (preserved for long form study content)
 * - Body emphasis / important text: 500
 */

export const typographyTokens = {
  fontFamily: {
    sans: '"Estedad", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    primary: '"Estedad", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  fontWeight: {
    thin: 100,
    extraLight: 200,
    light: 300,
    regular: 400,
    medium: 500,  // Body emphasis / important text
    semiBold: 600, // Headings secondary
    bold: 700,     // Headings primary
    extraBold: 800,
    black: 900,
  },
  variants: {
    display: {
      fontSize: "2.25rem", // 36px
      lineHeight: "2.75rem", // 44px
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    h1: {
      fontSize: "1.875rem", // 30px
      lineHeight: "2.5rem", // 40px
      fontWeight: 700, // Primary heading
      letterSpacing: "-0.015em",
    },
    h2: {
      fontSize: "1.5rem", // 24px
      lineHeight: "2rem", // 32px
      fontWeight: 700, // Primary heading
      letterSpacing: "-0.01em",
    },
    h3: {
      fontSize: "1.25rem", // 20px
      lineHeight: "1.75rem", // 28px
      fontWeight: 600, // Secondary heading
    },
    h4: {
      fontSize: "1.0625rem", // 17px
      lineHeight: "1.625rem", // 26px
      fontWeight: 600, // Secondary heading
    },
    bodyLarge: {
      fontSize: "1rem", // 16px
      lineHeight: "1.75rem", // 28px
      fontWeight: 400, // Body default
    },
    body: {
      fontSize: "0.9375rem", // 15px
      lineHeight: "1.625rem", // 26px
      fontWeight: 400, // Body default
    },
    bodyEmphasis: {
      fontSize: "0.9375rem", // 15px
      lineHeight: "1.625rem", // 26px
      fontWeight: 500, // Body emphasis
    },
    bodySmall: {
      fontSize: "0.8125rem", // 13px
      lineHeight: "1.375rem", // 22px
      fontWeight: 400,
    },
    label: {
      fontSize: "0.8125rem", // 13px
      lineHeight: "1.25rem", // 20px
      fontWeight: 500,
    },
    caption: {
      fontSize: "0.75rem", // 12px
      lineHeight: "1.125rem", // 18px
      fontWeight: 400,
    },
    overline: {
      fontSize: "0.6875rem", // 11px
      lineHeight: "1rem", // 16px
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    },
  },
} as const;
