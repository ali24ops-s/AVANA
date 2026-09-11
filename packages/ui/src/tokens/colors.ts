/**
 * AVANA Design Tokens — Colors
 * Canonical color palette and semantic tokens aligned with Figma Make Design System.
 * Source of Truth: ~/Downloads/Design System for AVANA-2/src/tokens.ts
 */

/**
 * Raw tokens directly extracted from Figma Make
 */
export const figmaColors = {
  // Brand
  teal: "#008080",
  tealDark: "#006666",
  tealLight: "#e0f2f2",
  tealMuted: "#b3d9d9",
  tealHover: "#007575",
  tealActive: "#006060",
  tealSoft: "#f0fafa",
  blue: "#A7D0E6",
  blueDark: "#5ba0c4",
  blueLight: "#e8f4fb",
  warm: "#F0E6D2",
  // Text
  text: "#1a2226",
  textSecondary: "#3d4f55",
  textMuted: "#5B6268",
  // Surfaces
  bg: "#F7F9FA",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  border: "#E2E7EA",
  divider: "#EEF1F3",
  // Semantic
  success: "#3d8f6e",
  successBg: "#e4f4ec",
  successBorder: "#9ed4bb",
  warning: "#c2853f",
  warningBg: "#fdf2e4",
  warningBorder: "#e8c18a",
  error: "#b84c4c",
  errorBg: "#fde8e8",
  errorBorder: "#e8a0a0",
  info: "#5ba0c4",
  infoBg: "#e8f4fb",
  infoBorder: "#a7d0e6",
  // Dark mode
  darkBg: "#0D1719",
  darkSurface: "#142124",
  darkSurface2: "#192A2D",
  darkText: "#F2F7F7",
  darkTextSecondary: "#c8d8da",
  darkMuted: "#9AAEB0",
  darkBorder: "#1e3235",
} as const;

export const brandColors = {
  primary: {
    50: figmaColors.tealSoft,
    100: figmaColors.tealLight,
    200: figmaColors.tealMuted,
    300: "#5eead4",
    400: "#2dd4bf",
    500: figmaColors.teal,
    600: figmaColors.teal, // Canonical AVANA Primary Teal
    700: figmaColors.tealHover,
    800: figmaColors.tealDark,
    900: figmaColors.tealActive,
    950: "#021d1c",
  },
  // Canonical Secondary is Soft Blue MedTech from Figma
  secondary: {
    50: "#f0f9ff",
    100: figmaColors.blueLight,
    200: "#bae6fd",
    300: figmaColors.blue, // Canonical AVANA Secondary Soft Blue (#A7D0E6)
    400: "#7bbfdf",
    500: figmaColors.blueDark, // (#5ba0c4)
    600: figmaColors.blueDark,
    700: "#3b82a6",
    800: "#2a5f7b",
    900: "#1e4458",
  },
  warm: {
    default: figmaColors.warm, // (#F0E6D2)
    accent: figmaColors.warm,
  },
  // Legacy / categorical purple preserved for Content Pack tags
  purple: {
    100: "#f3e8ff",
    500: "#a855f7",
    600: "#8b5cf6",
    700: "#7c3aed",
  },
  neutral: {
    50: figmaColors.bg,
    100: figmaColors.divider,
    200: figmaColors.border,
    300: "#cbd5e1",
    400: "#94a3b8",
    500: figmaColors.textMuted,
    600: figmaColors.textSecondary,
    700: "#334155",
    800: figmaColors.text,
    900: figmaColors.text,
    950: figmaColors.darkBg,
  },
} as const;

export const semanticColors = {
  light: {
    bg: {
      default: figmaColors.bg,
      subtle: figmaColors.divider,
      inverse: figmaColors.darkBg,
    },
    surface: {
      level1: figmaColors.surface,
      level2: figmaColors.bg,
      level3: figmaColors.divider,
      glass: "rgba(255, 255, 255, 0.92)",
    },
    text: {
      primary: figmaColors.text,
      secondary: figmaColors.textSecondary,
      muted: figmaColors.textMuted,
      inverse: figmaColors.darkText,
      brand: figmaColors.teal,
    },
    border: {
      default: figmaColors.border,
      subtle: figmaColors.divider,
      brand: figmaColors.teal,
      focus: figmaColors.teal,
    },
  },
  dark: {
    bg: {
      default: figmaColors.darkBg,
      subtle: "#070c0d",
      inverse: figmaColors.bg,
    },
    surface: {
      level1: figmaColors.darkSurface,
      level2: figmaColors.darkSurface2,
      level3: "#203438",
      glass: "rgba(20, 33, 36, 0.85)",
    },
    text: {
      primary: figmaColors.darkText,
      secondary: figmaColors.darkTextSecondary,
      muted: figmaColors.darkMuted,
      inverse: figmaColors.text,
      brand: figmaColors.tealLight,
    },
    border: {
      default: figmaColors.darkBorder,
      subtle: "#142528",
      brand: figmaColors.teal,
      focus: figmaColors.tealLight,
    },
  },
  feedback: {
    success: {
      main: figmaColors.success,
      light: figmaColors.successBg,
      border: figmaColors.successBorder,
      dark: "#2a624b",
      text: "#2a624b",
    },
    warning: {
      main: figmaColors.warning,
      light: figmaColors.warningBg,
      border: figmaColors.warningBorder,
      dark: "#8f5e27",
      text: "#8f5e27",
    },
    error: {
      main: figmaColors.error,
      light: figmaColors.errorBg,
      border: figmaColors.errorBorder,
      dark: "#7f3131",
      text: "#7f3131",
    },
    info: {
      main: figmaColors.info,
      light: figmaColors.infoBg,
      border: figmaColors.infoBorder,
      dark: "#3a708c",
      text: "#2b6d8f",
    },
  },
} as const;
