/**
 * Presentation Assistant UI Utilities & Formatters
 */

export function toPersianDigits(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return "";
  const farsiDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(n).replace(/[0-9]/g, (w) => farsiDigits[+w]);
}

export function formatPersianDate(dateString: string | null | undefined): string {
  if (!dateString) return "نامشخص";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "نامشخص";
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return dateString;
  }
}

export const ACADEMIC_LEVEL_LABELS: Record<string, string> = {
  introductory: "مقدماتی",
  intermediate: "متوسط",
  advanced: "پیشرفته و بالینی",
};

export const TONE_LABELS: Record<string, string> = {
  formal_scientific: "علمی و دانشگاهی",
  fluent_student: "روان و دانشجویی",
};

export const ELABORATION_DEPTH_LABELS: Record<string, string> = {
  concise: "خلاصه و کلیدی",
  balanced: "متعادل",
  comprehensive: "جامع و تفصیلی",
};

export const PROJECT_STATUS_LABELS: Record<string, { label: string; variant: "neutral" | "primary" | "success" | "warning" | "error" }> = {
  created: { label: "ایجاد شده", variant: "neutral" },
  extracting: { label: "در حال پردازش", variant: "warning" },
  analyzing: { label: "در حال تحلیل", variant: "warning" },
  generating: { label: "در حال تولید", variant: "primary" },
  completed: { label: "آماده", variant: "success" },
  failed: { label: "خطا در تولید", variant: "error" },
};

export const SLIDE_GENERATION_STATUS_LABELS: Record<string, { label: string; variant: "neutral" | "primary" | "success" | "warning" | "error" }> = {
  accepted: { label: "تولید موفق و مستند", variant: "success" },
  needs_review: { label: "نیازمند بازبینی", variant: "warning" },
  draft: { label: "پیش‌نویس", variant: "neutral" },
  generating: { label: "در حال پردازش هوش مصنوعی", variant: "primary" },
  failed: { label: "تولید ناموفق", variant: "error" },
};

export const REFERENCE_TYPE_LABELS: Record<string, string> = {
  text: "متن یا یادداشت علمی",
  pdf: "سند PDF",
  docx: "سند Word",
  url: "صفحه وب / وب‌سایت",
  doi: "شناسه بین‌المللی DOI",
  pubmed: "مقاله پایگاه PubMed",
};

export const VALID_DURATIONS = [5, 10, 15, 20, 30] as const;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${toPersianDigits(bytes)} بایت`;
  }
  if (bytes < 1024 * 1024) {
    return `${toPersianDigits(Math.round(bytes / 1024))} کیلوبایت`;
  }
  return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
}

export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  if (seconds < 60) {
    return `${toPersianDigits(seconds)} ثانیه`;
  }
  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;
  if (remSecs === 0) {
    return `${toPersianDigits(mins)} دقیقه`;
  }
  return `${toPersianDigits(mins)} دقیقه و ${toPersianDigits(remSecs)} ثانیه`;
}

export { splitSpeechTextIntoParagraphs, formatSpeechText } from "@avana/domain";
