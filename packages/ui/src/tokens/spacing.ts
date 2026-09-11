/**
 * AVANA Design Tokens — Spacing, Radius, Shadows, Motion & Z-Index
 */

export const spacingTokens = {
  0: "0px",
  1: "0.25rem",  // 4px
  2: "0.5rem",   // 8px
  3: "0.75rem",  // 12px
  4: "1rem",      // 16px
  5: "1.25rem",  // 20px
  6: "1.5rem",   // 24px
  8: "2rem",      // 32px
  10: "2.5rem",  // 40px
  12: "3rem",     // 48px
  16: "4rem",     // 64px
  20: "5rem",     // 80px
  24: "6rem",     // 96px
} as const;

export const radiusTokens = {
  none: "0px",
  xs: "0.25rem",  // 4px
  sm: "6px",      // Figma radSm: 6px
  btn: "10px",    // Figma radBtn: 10px
  input: "10px",  // Figma radInput: 10px
  card: "16px",   // Figma radCard: 16px
  dialog: "20px", // Figma radDialog: 20px
  md: "10px",     // 10px
  lg: "16px",     // Aligned with card (16px)
  xl: "20px",     // Aligned with dialog (20px)
  "2xl": "24px",  // Figma radLg: 24px
  "3xl": "32px",
  full: "9999px", // Figma radFull: 9999px
} as const;

export const shadowTokens = {
  none: "none",
  subtle: "0 1px 3px rgba(0,0,0,.06)",   // Figma shadowSubtle
  card: "0 1px 6px rgba(0,0,0,.08)",     // Figma shadowCard
  elevated: "0 4px 16px rgba(0,0,0,.1)", // Figma shadowElevated
  modal: "0 8px 40px rgba(0,0,0,.16)",   // Figma shadowModal
  // Aliases for compatibility
  sm: "0 1px 3px rgba(0, 0, 0, 0.06)",
  md: "0 1px 6px rgba(0, 0, 0, 0.08)",
  lg: "0 4px 16px rgba(0, 0, 0, 0.1)",
  xl: "0 8px 40px rgba(0, 0, 0, 0.16)",
  glass: "0 4px 20px rgba(0, 0, 0, 0.08)",
  glowPrimary: "0 0 20px rgba(0, 128, 128, 0.25)",
  glowSecondary: "0 0 20px rgba(167, 208, 230, 0.35)",
} as const;

export const motionTokens = {
  duration: {
    fast: "150ms",
    normal: "250ms",
    slow: "350ms",
  },
  easing: {
    easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
    easeOut: "cubic-bezier(0, 0, 0.2, 1)",
    easeIn: "cubic-bezier(0.4, 0, 1, 1)",
    bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
} as const;

export const zIndexTokens = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  overlay: 1200,
  modal: 1300,
  popover: 1400,
  toast: 1500,
} as const;
