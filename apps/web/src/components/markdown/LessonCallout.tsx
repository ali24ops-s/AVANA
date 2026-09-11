import React from "react";
import {
  AlertTriangle,
  AlertCircle,
  Brain,
  Lightbulb,
  Pill,
  Sparkles,
  Key,
  Ban,
  Stethoscope,
} from "lucide-react";
import type { CalloutType } from "@avana/domain";
import { CALLOUT_DEFINITIONS } from "@avana/domain";

export type { CalloutType };

export interface LessonCalloutProps {
  type: CalloutType;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

interface CalloutThemeConfig {
  defaultTitle: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  containerClass: string;
  iconClass: string;
  titleClass: string;
}

const CALLOUT_THEMES: Record<CalloutType, CalloutThemeConfig> = {
  warning: {
    defaultTitle: "هشدار",
    icon: AlertTriangle,
    containerClass:
      "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:bg-amber-950/25 dark:border-amber-800/40 dark:text-amber-100 border-r-4 border-r-amber-500",
    iconClass: "text-amber-500 dark:text-amber-400",
    titleClass: "text-amber-600 dark:text-amber-400",
  },
  "common-mistake": {
    defaultTitle: "اشتباه رایج",
    icon: AlertTriangle,
    containerClass:
      "bg-rose-500/10 border-rose-500/30 text-rose-950 dark:bg-rose-950/25 dark:border-rose-800/40 dark:text-rose-100 border-r-4 border-r-rose-500",
    iconClass: "text-rose-500 dark:text-rose-400",
    titleClass: "text-rose-600 dark:text-rose-400",
  },
  important: {
    defaultTitle: "نکته مهم",
    icon: AlertCircle,
    containerClass:
      "bg-violet-500/10 border-violet-500/30 text-violet-950 dark:bg-violet-950/25 dark:border-violet-800/40 dark:text-violet-100 border-r-4 border-r-violet-500",
    iconClass: "text-violet-500 dark:text-violet-400",
    titleClass: "text-violet-600 dark:text-violet-400",
  },
  tip: {
    defaultTitle: "نکته",
    icon: Lightbulb,
    containerClass:
      "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:bg-amber-950/25 dark:border-amber-800/40 dark:text-amber-100 border-r-4 border-r-amber-500",
    iconClass: "text-amber-500 dark:text-amber-400",
    titleClass: "text-amber-600 dark:text-amber-400",
  },
  "educational-tip": {
    defaultTitle: "نکته آموزشی",
    icon: Lightbulb,
    containerClass:
      "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:bg-amber-950/25 dark:border-amber-800/40 dark:text-amber-100 border-r-4 border-r-amber-500",
    iconClass: "text-amber-500 dark:text-amber-400",
    titleClass: "text-amber-600 dark:text-amber-400",
  },
  "clinical-point": {
    defaultTitle: "نکته بالینی",
    icon: Stethoscope,
    containerClass:
      "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:bg-emerald-950/25 dark:border-emerald-800/40 dark:text-emerald-100 border-r-4 border-r-emerald-500",
    iconClass: "text-emerald-500 dark:text-emerald-400",
    titleClass: "text-emerald-600 dark:text-emerald-400",
  },
  "drug-application": {
    defaultTitle: "کاربرد دارویی نوین",
    icon: Pill,
    containerClass:
      "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:bg-emerald-950/25 dark:border-emerald-800/40 dark:text-emerald-100 border-r-4 border-r-emerald-500",
    iconClass: "text-emerald-500 dark:text-emerald-400",
    titleClass: "text-emerald-600 dark:text-emerald-400",
  },
  contraindication: {
    defaultTitle: "منع مصرف",
    icon: Ban,
    containerClass:
      "bg-red-500/10 border-red-500/30 text-red-950 dark:bg-red-950/25 dark:border-red-800/40 dark:text-red-100 border-r-4 border-r-red-500",
    iconClass: "text-red-500 dark:text-red-400",
    titleClass: "text-red-600 dark:text-red-400",
  },
  "key-point": {
    defaultTitle: "نکته کلیدی",
    icon: Key,
    containerClass:
      "bg-teal-500/10 border-teal-500/30 text-teal-950 dark:bg-teal-950/25 dark:border-teal-800/40 dark:text-teal-100 border-r-4 border-r-teal-500",
    iconClass: "text-teal-500 dark:text-teal-400",
    titleClass: "text-teal-600 dark:text-teal-400",
  },
  understanding: {
    defaultTitle: "برای فهم بهتر",
    icon: Brain,
    containerClass:
      "bg-sky-500/10 border-sky-500/30 text-sky-950 dark:bg-sky-950/25 dark:border-sky-800/40 dark:text-sky-100 border-r-4 border-r-sky-500",
    iconClass: "text-sky-500 dark:text-sky-400",
    titleClass: "text-sky-600 dark:text-sky-400",
  },
  supplementary: {
    defaultTitle: "توضیح تکمیلی",
    icon: Sparkles,
    containerClass:
      "bg-indigo-500/10 border-indigo-500/30 text-indigo-950 dark:bg-indigo-950/25 dark:border-indigo-800/40 dark:text-indigo-100 border-r-4 border-r-indigo-500",
    iconClass: "text-indigo-500 dark:text-indigo-400",
    titleClass: "text-indigo-600 dark:text-indigo-400",
  },
};

/**
 * LessonCallout Component
 *
 * Renders an educational Callout Box with:
 * - Subtle background and accent right border
 * - Decorative Lucide SVG icon
 * - Clean Persian text title (strictly without emojis)
 * - Full rich Markdown children support (Math, bold, lists, code)
 * - Complete RTL & Persian typography support
 * - Dark mode support without harsh glare
 */
export function LessonCallout({
  type,
  title,
  children,
  className = "",
}: LessonCalloutProps) {
  const config =
    CALLOUT_THEMES[type] ||
    CALLOUT_THEMES["educational-tip"] ||
    CALLOUT_THEMES["tip"];
  const Icon = config.icon;
  const fallbackTitle = CALLOUT_DEFINITIONS[type]?.defaultTitle || config.defaultTitle;
  const displayTitle = title?.trim() || fallbackTitle;

  return (
    <div
      className={`lesson-callout w-full my-3.5 sm:my-4 rounded-2xl border px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-xs transition-colors overflow-hidden ${config.containerClass} ${className}`.trim()}
      dir="rtl"
      data-testid={`callout-${type}`}
      data-callout-type={type}
    >
      <div className="flex items-center gap-2 mb-1.5 sm:mb-2 select-none">
        <Icon className={`w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0 ${config.iconClass}`} aria-hidden="true" />
        <span className={`font-bold text-sm sm:text-[15px] tracking-tight ${config.titleClass}`}>
          {displayTitle}
        </span>
      </div>
      <div className="text-[13.5px] sm:text-[14.5px] text-[var(--color-text-secondary)] dark:text-slate-200 leading-[1.8] space-y-2 break-words [&>p]:!mb-0 [&>ul]:!mb-0 [&>ol]:!mb-0 [&>blockquote]:!my-1.5 [&>pre]:!my-1.5 [&>*:first-child]:!mt-0 [&>*:last-child]:!mb-0 [&_p:last-child]:!mb-0 [&>ul]:pr-4 [&>ol]:pr-4 [&>ul]:my-1.5 [&>ol]:my-1.5 [&>li]:leading-[1.8]">
        {children}
      </div>
    </div>
  );
}
