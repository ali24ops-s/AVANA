import { Link } from "react-router-dom";
import {
  Check,
  BookOpen,
  Layers,
  FileText,
  AlertCircle,
  Loader2,
  ArrowLeft,
  GraduationCap,
} from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import type {
  StudyTaskResource,
  StudyTaskType,
  StudyTaskStatus,
} from "@avana/contracts";

// Helper for task type UI details
export function getTaskTypeConfig(type: StudyTaskType) {
  switch (type) {
    case "read_lesson":
      return {
        label: "مطالعه درس",
        actionLabel: "شروع مطالعه",
        completedActionLabel: "مشاهده درس",
        icon: BookOpen,
        colorClass: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/50",
      };
    case "review_flashcards":
      return {
        label: "مرور فلش‌کارت",
        actionLabel: "شروع مرور",
        completedActionLabel: "مشاهده فلش‌کارت‌ها",
        icon: Layers,
        colorClass: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50",
      };
    case "take_quiz":
      return {
        label: "آزمون",
        actionLabel: "شروع آزمون",
        completedActionLabel: "مشاهده آزمون",
        icon: FileText,
        colorClass: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/50",
      };
    case "review_wrong_answers":
      return {
        label: "مرور اشتباهات",
        actionLabel: "مرور اشتباهات",
        completedActionLabel: "مشاهده نتایج",
        icon: AlertCircle,
        colorClass: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50",
      };
    default:
      return {
        label: "فعالیت مطالعه",
        actionLabel: "شروع",
        completedActionLabel: "مشاهده",
        icon: BookOpen,
        colorClass: "text-primary bg-[var(--avana-accent-soft)] border-primary/20",
      };
  }
}

// Category configuration for minimal color indicator and legend
export type StudyTaskCategory = "mandatory" | "optional" | "extra_practice";

export interface TaskCategoryConfig {
  label: string;
  dotClass: string;
}

export const CATEGORY_CONFIG: Record<StudyTaskCategory, TaskCategoryConfig> = {
  mandatory: {
    label: "اجباری",
    dotClass: "bg-rose-500",
  },
  optional: {
    label: "اختیاری",
    dotClass: "bg-sky-500",
  },
  extra_practice: {
    label: "تمرین بیشتر",
    dotClass: "bg-purple-500",
  },
};

// Helper for task status UI details
export function getTaskStatusConfig(status: StudyTaskStatus) {
  switch (status) {
    case "completed":
      return {
        label: "انجام‌شده",
        badgeClass: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",
      };
    case "in_progress":
      return {
        label: "در حال انجام",
        badgeClass: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60",
      };
    case "skipped":
      return {
        label: "رد شده",
        badgeClass: "bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
      };
    case "pending":
    default:
      return {
        label: "انجام‌نشده",
        badgeClass: "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border-[var(--color-border)]",
      };
  }
}

// Helper for task course name
export function getTaskCourseName(task: StudyTaskResource): string | null {
  if (
    task.metadata?.courseName &&
    typeof task.metadata.courseName === "string" &&
    task.metadata.courseName.trim().length > 0
  ) {
    return task.metadata.courseName.trim();
  }
  if (
    task.metadata?.examCourseName &&
    typeof task.metadata.examCourseName === "string" &&
    task.metadata.examCourseName.trim().length > 0
  ) {
    return task.metadata.examCourseName.trim();
  }
  if (
    task.description &&
    typeof task.description === "string" &&
    task.description.trim().length > 0
  ) {
    const desc = task.description.trim();
    const courseMatch = desc.match(/دوره\s*(?:[«"']([^»"']+)["»']|(.+))/);
    if (courseMatch) {
      const extracted = (courseMatch[1] || courseMatch[2] || "").replace(/[.،,].*$/, "").trim();
      if (extracted.length > 0) {
        return extracted;
      }
    }
  }
  return null;
}

const PERSIAN_CHAR_REGEX = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

const ORDINAL_NUMBERS =
  "اول|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم|یازدهم|دوازدهم|سیزدهم|چهاردهم|پانزدهم|شانزدهم|هفدهم|هجدهم|نوزدهم|بیستم|بیست\\s+و\\s+[\\u0600-\\u06FF]+|سی‌ام|چهلم|پنجاهم|شصتم|هفتادم|هشتادم|نودم|صدم";

const PREFIX_KEYWORDS =
  "جلسه|فصل|درس|بخش|قسمت|پارت|گفتار|پودمان|مبحث|واحد|اپیزود|session|chapter|lesson|part|section|unit|episode";

const DESCRIPTIVE_ACTIVITY_PREFIXES =
  "ادامه\\s+مطالعه|مطالعه\\s+درس|مرور\\s+و\\s+آزمون\\s+مجدد|آزمون\\s+ارزیابی\\s+آموخته(?:[‌\\u200c\\s]?ها)?|آزمون\\s+ارزیابی|حل\\s+آزمون|مرور\\s+اشتباهات|مرور\\s+آزمون|مطالعه|ادامه";

const ACTIVITY_PREFIX_REGEX = new RegExp(
  `^(?:${DESCRIPTIVE_ACTIVITY_PREFIXES})\\s*[:\\-–—_.،|/]+\\s*`,
  "i",
);

const KEYWORD_PREFIX_REGEX = new RegExp(
  `^(?:${PREFIX_KEYWORDS})\\s*(?:(?:[0-9۰-۹٠-٩]+|[a-zA-Z]+|${ORDINAL_NUMBERS})\\s*[:\\-–—_.،|/]?|[:\\-–—_.،|/])\\s*`,
  "i",
);

const NUMBER_PREFIX_REGEX = /^[0-9۰-۹٠-٩]{1,3}\s*[:\-–—.)]\s*/;

function cleanEnglishSuffix(title: string): string {
  const parenMatch = title.match(/\s*[([\]]\s*([^()[\]]+)\s*[)\]]\s*$/);
  if (parenMatch && parenMatch.index !== undefined) {
    const inside = parenMatch[1].trim();
    const before = title.slice(0, parenMatch.index).trim();

    const isEnglishOnly = /[a-zA-Z]/.test(inside) && !PERSIAN_CHAR_REGEX.test(inside);
    const hasPersianBefore = PERSIAN_CHAR_REGEX.test(before);

    if (isEnglishOnly && hasPersianBefore && before.length > 0) {
      return before;
    }
  }

  const sepMatch = title.match(/(?:\s+[—–|:]\s+|\s+-\s+|[—–])([A-Za-z0-9\s,.'’"&/+–—:_-]+)$/);
  if (sepMatch && sepMatch.index !== undefined) {
    const suffix = sepMatch[1].trim();
    const before = title.slice(0, sepMatch.index).trim();

    const isEnglishOnly = /[a-zA-Z]/.test(suffix) && !PERSIAN_CHAR_REGEX.test(suffix);
    const hasPersianBefore = PERSIAN_CHAR_REGEX.test(before);
    const beforeEndsInNonLatin = !/[a-zA-Z]/.test(before.slice(-1));

    if (isEnglishOnly && hasPersianBefore && beforeEndsInNonLatin && before.length > 0) {
      return before;
    }
  }

  return title;
}

function cleanPrefixMetadata(title: string): string {
  let cleaned = title.trim();

  for (let i = 0; i < 4; i++) {
    const beforePass = cleaned;

    const activityMatch = cleaned.match(ACTIVITY_PREFIX_REGEX);
    if (activityMatch && activityMatch[0].length > 0) {
      const rest = cleaned.slice(activityMatch[0].length).trim();
      if (rest.length > 0) {
        cleaned = rest;
        continue;
      }
    }

    const keywordMatch = cleaned.match(KEYWORD_PREFIX_REGEX);
    if (keywordMatch && keywordMatch[0].length > 0) {
      const rest = cleaned.slice(keywordMatch[0].length).trim();
      if (rest.length > 0) {
        cleaned = rest;
        continue;
      }
    }

    const numMatch = cleaned.match(NUMBER_PREFIX_REGEX);
    if (numMatch && numMatch[0].length > 0) {
      const rest = cleaned.slice(numMatch[0].length).trim();
      if (rest.length > 0) {
        cleaned = rest;
        continue;
      }
    }

    if (cleaned === beforePass) {
      break;
    }
  }

  return cleaned.trim() || title;
}

export function formatStudyPlannerTaskTitle(
  rawTitle: string | null | undefined,
  task?: Partial<StudyTaskResource>,
): string {
  if (task && task.taskType === "review_flashcards") {
    if (
      Array.isArray(task.metadata?.chapterNumbers) &&
      task.metadata.chapterNumbers.length > 0
    ) {
      const rawList = task.metadata.chapterNumbers as unknown[];
      const nums = Array.from(
        new Set(
          rawList
            .map((n) => (typeof n === "number" ? n : parseInt(String(n), 10)))
            .filter((n): n is number => typeof n === "number" && !isNaN(n) && n > 0),
        ),
      ).sort((a, b) => a - b);

      if (nums.length === 1) {
        return `مرور فلش‌کارت‌های فصل ${toPersianDigits(nums[0])}`;
      }
      if (nums.length > 1) {
        return `مرور فلش‌کارت‌های فصل ${nums.map(toPersianDigits).join("، ")}`;
      }
    }
  }

  if (!rawTitle || typeof rawTitle !== "string") {
    return "";
  }

  const trimmed = rawTitle.trim();
  if (!trimmed) {
    return "";
  }

  if (task?.taskType === "review_flashcards" || /^مرور فلش‌کارت‌های/i.test(trimmed)) {
    const chapterMatch = trimmed.match(/^مرور فلش‌کارت‌های فصل\s*(.+)$/i);
    if (chapterMatch) {
      const chapsPart = chapterMatch[1].trim();
      const digits = Array.from(
        new Set(
          (chapsPart.match(/[0-9۰-۹٠-٩]+/g) || [])
            .map((d) => {
              const latin = d
                .replace(/[۰٠]/g, "0")
                .replace(/[۱١]/g, "1")
                .replace(/[۲٢]/g, "2")
                .replace(/[۳٣]/g, "3")
                .replace(/[۴٤]/g, "4")
                .replace(/[۵٥]/g, "5")
                .replace(/[۶٦]/g, "6")
                .replace(/[۷٧]/g, "7")
                .replace(/[۸٨]/g, "8")
                .replace(/[۹٩]/g, "9");
              return parseInt(latin, 10);
            })
            .filter((n) => !isNaN(n) && n > 0),
        ),
      ).sort((a, b) => a - b);

      if (digits.length === 1) {
        return `مرور فلش‌کارت‌های فصل ${toPersianDigits(digits[0])}`;
      }
      if (digits.length > 1) {
        return `مرور فلش‌کارت‌های فصل ${digits.map(toPersianDigits).join("، ")}`;
      }
    }
    return trimmed;
  }

  let title = cleanEnglishSuffix(trimmed);
  title = cleanPrefixMetadata(title);

  return title.trim() || trimmed;
}

export function resolveTaskNavigationUrl(task: StudyTaskResource): string | null {
  switch (task.taskType) {
    case "read_lesson":
      if (task.courseId && task.lessonId) {
        return `/courses/${task.courseId}?tab=lessons&lessonId=${task.lessonId}`;
      }
      if (task.courseId) {
        return `/courses/${task.courseId}?tab=lessons`;
      }
      return null;

    case "review_flashcards":
      if (task.courseId) {
        return `/flashcards/review?courses=${task.courseId}`;
      }
      return "/flashcards/review";

    case "take_quiz":
    case "review_wrong_answers":
      if (task.courseId && task.quizId) {
        return `/courses/${task.courseId}?tab=quizzes&quizId=${task.quizId}`;
      }
      if (task.courseId) {
        return `/courses/${task.courseId}?tab=quizzes`;
      }
      return "/exams";

    default:
      return null;
  }
}

export interface StudyTaskCardProps {
  task: StudyTaskResource;
  isUpdating?: boolean;
  onComplete?: (task: StudyTaskResource) => void;
  hideCourseName?: boolean;
  className?: string;
}

export function StudyTaskCard({
  task,
  isUpdating = false,
  onComplete,
  hideCourseName = false,
  className = "",
}: StudyTaskCardProps) {
  const typeConfig = getTaskTypeConfig(task.taskType);
  const statusConfig = getTaskStatusConfig(task.status);
  const categoryConfig =
    task.metadata?.category &&
    CATEGORY_CONFIG[task.metadata.category as StudyTaskCategory];
  const courseName = getTaskCourseName(task);
  const displayTitle = formatStudyPlannerTaskTitle(task.title, task);
  const isCompleted = task.status === "completed";
  const targetUrl = resolveTaskNavigationUrl(task);
  const TaskTypeIcon = typeConfig.icon;

  return (
    <div
      className={`py-2.5 px-3 rounded-card border transition-all flex items-center justify-between gap-2.5 ${
        isCompleted
          ? "bg-[var(--color-surface-warm)]/60 border-[var(--color-border)] opacity-85"
          : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
      } ${className}`}
    >
      {/* Left: Completion Checkbox, Type Icon & Content */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
        {/* Checkbox Button */}
        <button
          type="button"
          onClick={() => onComplete?.(task)}
          disabled={isCompleted || isUpdating || !onComplete}
          className={`w-5 h-5 rounded-input flex items-center justify-center shrink-0 transition-colors border ${
            isCompleted
              ? "bg-primary border-primary text-[var(--color-primary-foreground)] cursor-default"
              : isUpdating
                ? "border-primary/50 bg-[var(--color-surface)] cursor-wait"
                : "border-[var(--color-border)] hover:border-primary bg-[var(--color-surface)] cursor-pointer"
          }`}
          title={
            isCompleted
              ? "تسک تکمیل شده است"
              : "علامت‌گذاری به عنوان انجام‌شده"
          }
          aria-label={`تکمیل تسک ${displayTitle || task.title}`}
        >
          {isUpdating ? (
            <Loader2 className="w-3 h-3 animate-spin text-primary" />
          ) : isCompleted ? (
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          ) : null}
        </button>

        {/* Activity Type Icon */}
        <div
          className={`w-6 h-6 rounded-input flex items-center justify-center border ${typeConfig.colorClass} shrink-0`}
          title={`نوع فعالیت: ${typeConfig.label}`}
          aria-label={typeConfig.label}
          role="img"
        >
          <TaskTypeIcon className="w-3 h-3" />
        </div>

        {/* Content Hierarchy */}
        <div className="min-w-0 flex-1 space-y-0.5">
          {/* 1. Full Task Title */}
          <div className="flex items-center gap-2 flex-wrap">
            <h4
              className={`text-xs font-bold leading-snug break-words ${
                isCompleted
                  ? "text-[var(--color-text-muted)] line-through"
                  : "text-[var(--color-text)]"
              }`}
            >
              {displayTitle || task.title}
            </h4>

            {/* Status Badge for in_progress or skipped */}
            {(task.status === "in_progress" || task.status === "skipped") && (
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${statusConfig.badgeClass} shrink-0`}
                title={`وضعیت: ${statusConfig.label}`}
                aria-label={`وضعیت: ${statusConfig.label}`}
              >
                {statusConfig.label}
              </span>
            )}
          </div>

          {/* 2. Course Name with Priority Dot (and Exam Urgency Badge if any) */}
          {(!hideCourseName && courseName) || categoryConfig || task.metadata?.isExamRelated ? (
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)] font-medium leading-tight flex-wrap">
              {categoryConfig && (
                <span
                  className="inline-flex items-center"
                  title={`اولویت: ${categoryConfig.label}`}
                  aria-label={`اولویت: ${categoryConfig.label}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${categoryConfig.dotClass}`}
                    aria-hidden="true"
                  />
                </span>
              )}

              {!hideCourseName && courseName && (
                <span className="break-words">{courseName}</span>
              )}

              {/* Exam Urgency Badge */}
              {task.metadata?.isExamRelated && (
                <>
                  {((!hideCourseName && courseName) || categoryConfig) && (
                    <span className="text-[var(--color-border)]">•</span>
                  )}
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 flex items-center gap-1 shrink-0"
                    title={
                      task.metadata.examCourseName
                        ? `مرتبط با امتحان ${task.metadata.examCourseName}`
                        : "مرتبط با امتحان"
                    }
                  >
                    <GraduationCap className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span>
                      {task.metadata.examDaysRemaining !== undefined
                        ? task.metadata.examDaysRemaining === 0
                          ? "برای امتحان امروز"
                          : `برای امتحان ${toPersianDigits(task.metadata.examDaysRemaining)} روز دیگر`
                        : "مرتبط با امتحان"}
                    </span>
                  </span>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Right: Start Arrow Button (Compact green action box) */}
      <div className="flex items-center justify-end shrink-0">
        {targetUrl ? (
          <Link
            to={targetUrl}
            className={`w-7 h-7 rounded-button inline-flex items-center justify-center transition-colors shrink-0 ${
              isCompleted
                ? "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] border border-[var(--color-border)]"
                : "bg-primary text-[var(--color-primary-foreground)] hover:bg-primary/90 shadow-xs"
            }`}
            title={
              isCompleted
                ? typeConfig.completedActionLabel
                : typeConfig.actionLabel
            }
            aria-label={
              isCompleted
                ? typeConfig.completedActionLabel
                : typeConfig.actionLabel
            }
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="w-7 h-7 rounded-button inline-flex items-center justify-center bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)] opacity-50 cursor-not-allowed shrink-0"
            title={typeConfig.actionLabel}
            aria-label={typeConfig.actionLabel}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
