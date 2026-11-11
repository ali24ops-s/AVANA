/**
 * Highlight Colors specification and localStorage persistence helper for AVANA Lesson Reader.
 *
 * Provides exactly 5 distinct colors matching AVANA design system:
 * 1. yellow - زرد (Classic primary highlighter, default)
 * 2. teal   - فیروزه‌ای (#14B8A6)
 * 3. purple - بنفش کمرنگ (#A78BFA)
 * 4. blue   - آبی (#0EA5E9)
 * 5. rose   - رز (#F43F5E)
 */

export type HighlightColorId = "yellow" | "teal" | "purple" | "blue" | "rose";

export interface HighlightColorDef {
  id: HighlightColorId;
  label: string;
  dotColor: string;
  dotClass: string;
}

export const HIGHLIGHT_COLORS: readonly HighlightColorDef[] = [
  { id: "yellow", label: "زرد", dotColor: "#EAB308", dotClass: "bg-amber-400 border-amber-500" },
  { id: "teal", label: "فیروزه‌ای", dotColor: "#14B8A6", dotClass: "bg-teal-500 border-teal-600" },
  { id: "purple", label: "بنفش کمرنگ", dotColor: "#A78BFA", dotClass: "bg-purple-400 border-purple-500" },
  { id: "blue", label: "آبی", dotColor: "#0EA5E9", dotClass: "bg-sky-500 border-sky-600" },
  { id: "rose", label: "رز", dotColor: "#F43F5E", dotClass: "bg-rose-500 border-rose-600" },
] as const;

export const DEFAULT_HIGHLIGHT_COLOR: HighlightColorId = "yellow";
export const HIGHLIGHT_COLOR_STORAGE_KEY = "avana_preferred_highlight_color";

const VALID_COLOR_SET = new Set<string>(HIGHLIGHT_COLORS.map((c) => c.id));

export function isValidHighlightColor(color: unknown): color is HighlightColorId {
  return typeof color === "string" && VALID_COLOR_SET.has(color);
}

/**
 * Normalizes highlight color in the display layer.
 * Maps legacy "green" to "purple" without requiring database migration.
 */
export function normalizeHighlightColor(color: unknown): string {
  if (color === "green") {
    return "purple";
  }
  if (isValidHighlightColor(color)) {
    return color;
  }
  return typeof color === "string" && color ? color : "default";
}

export function getStoredHighlightColor(): HighlightColorId {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_HIGHLIGHT_COLOR;
  }
  try {
    const stored = window.localStorage.getItem(HIGHLIGHT_COLOR_STORAGE_KEY);
    // Legacy migration: convert stored "green" to "purple" seamlessly
    if (stored === "green") {
      setStoredHighlightColor("purple");
      return "purple";
    }
    if (stored && isValidHighlightColor(stored)) {
      return stored;
    }
  } catch {
    // Gracefully handle privacy restrictions / exceptions
  }
  return DEFAULT_HIGHLIGHT_COLOR;
}

export function setStoredHighlightColor(color: HighlightColorId): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  if (!isValidHighlightColor(color)) {
    return;
  }
  try {
    window.localStorage.setItem(HIGHLIGHT_COLOR_STORAGE_KEY, color);
  } catch {
    // Gracefully handle quota / storage exceptions
  }
}
