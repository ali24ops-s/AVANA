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
  borderColorClass: string;
  iconClass: string;
  pipClass: string;
}

const CALLOUT_THEMES: Record<CalloutType, CalloutThemeConfig> = {
  warning: {
    defaultTitle: "هشدار",
    icon: AlertTriangle,
    borderColorClass: "border-r-amber-500 dark:border-r-amber-400",
    iconClass: "text-amber-500 dark:text-amber-400",
    pipClass: "bg-amber-500 dark:bg-amber-400",
  },
  "common-mistake": {
    defaultTitle: "اشتباه رایج",
    icon: AlertTriangle,
    borderColorClass: "border-r-rose-500 dark:border-r-rose-400",
    iconClass: "text-rose-500 dark:text-rose-400",
    pipClass: "bg-rose-500 dark:bg-rose-400",
  },
  important: {
    defaultTitle: "نکته مهم",
    icon: AlertCircle,
    borderColorClass: "border-r-violet-500 dark:border-r-violet-400",
    iconClass: "text-violet-500 dark:text-violet-400",
    pipClass: "bg-violet-500 dark:bg-violet-400",
  },
  tip: {
    defaultTitle: "نکته",
    icon: Lightbulb,
    borderColorClass: "border-r-amber-500 dark:border-r-amber-400",
    iconClass: "text-amber-500 dark:text-amber-400",
    pipClass: "bg-amber-500 dark:bg-amber-400",
  },
  "educational-tip": {
    defaultTitle: "نکته آموزشی",
    icon: Lightbulb,
    borderColorClass: "border-r-amber-500 dark:border-r-amber-400",
    iconClass: "text-amber-500 dark:text-amber-400",
    pipClass: "bg-amber-500 dark:bg-amber-400",
  },
  "clinical-point": {
    defaultTitle: "نکته بالینی",
    icon: Stethoscope,
    borderColorClass: "border-r-emerald-500 dark:border-r-emerald-400",
    iconClass: "text-emerald-500 dark:text-emerald-400",
    pipClass: "bg-emerald-500 dark:bg-emerald-400",
  },
  "drug-application": {
    defaultTitle: "کاربرد دارویی نوین",
    icon: Pill,
    borderColorClass: "border-r-sky-500 dark:border-r-sky-400",
    iconClass: "text-sky-500 dark:text-sky-400",
    pipClass: "bg-sky-500 dark:bg-sky-400",
  },
  contraindication: {
    defaultTitle: "منع مصرف",
    icon: Ban,
    borderColorClass: "border-r-red-500 dark:border-r-red-400",
    iconClass: "text-red-500 dark:text-red-400",
    pipClass: "bg-red-500 dark:bg-red-400",
  },
  "key-point": {
    defaultTitle: "نکته کلیدی",
    icon: Key,
    borderColorClass: "border-r-teal-500 dark:border-r-teal-400",
    iconClass: "text-teal-500 dark:text-teal-400",
    pipClass: "bg-teal-500 dark:bg-teal-400",
  },
  understanding: {
    defaultTitle: "برای فهم بهتر",
    icon: Brain,
    borderColorClass: "border-r-sky-500 dark:border-r-sky-400",
    iconClass: "text-sky-500 dark:text-sky-400",
    pipClass: "bg-sky-500 dark:bg-sky-400",
  },
  supplementary: {
    defaultTitle: "توضیح تکمیلی",
    icon: Sparkles,
    borderColorClass: "border-r-indigo-500 dark:border-r-indigo-400",
    iconClass: "text-indigo-500 dark:text-indigo-400",
    pipClass: "bg-indigo-500 dark:bg-indigo-400",
  },
};

/**
 * Extracts plain text from nested React children to inspect semantic phrases safely.
 */
function extractChildText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractChildText).join("");
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractChildText(node.props.children);
  }
  return "";
}

/**
 * Strips duplicate prefix (e.g. "برداشت اشتباه:" or "توضیح صحیح:") when rendered inside badge tags.
 */
function stripMistakePrefix(node: React.ReactNode): React.ReactNode {
  if (Array.isArray(node)) {
    if (node.length === 0) return node;
    const first = node[0];
    if (typeof first === "string") {
      const stripped = first.replace(
        /^(?:✕|✓)?\s*(?:برداشت\s*اشتباه|اشتباه\s*رایج|اشتباه|باور\s*غلط|توضیح\s*صحیح|پاسخ\s*صحیح|توضیح|اصلاحیه|صحیح|درست)\s*[:：]?\s*/i,
        "",
      );
      return [stripped, ...node.slice(1)];
    }
    if (React.isValidElement<{ children?: React.ReactNode }>(first)) {
      const innerText = extractChildText(first);
      if (
        /^(?:✕|✓)?\s*(?:برداشت\s*اشتباه|اشتباه\s*رایج|اشتباه|باور\s*غلط|توضیح\s*صحیح|پاسخ\s*صحیح|توضیح|اصلاحیه|صحیح|درست)\s*[:：]?\s*$/i.test(
          innerText.trim(),
        )
      ) {
        return node.slice(1);
      }
    }
    return node;
  }
  if (typeof node === "string") {
    return node.replace(
      /^(?:✕|✓)?\s*(?:برداشت\s*اشتباه|اشتباه\s*رایج|اشتباه|باور\s*غلط|توضیح\s*صحیح|پاسخ\s*صحیح|توضیح|اصلاحیه|صحیح|درست)\s*[:：]?\s*/i,
      "",
    );
  }
  return node;
}

/**
 * Enhances Common Mistake callout children into compact linear comparisons
 * with "✕ برداشت اشتباه:" in rose and "✓ توضیح صحیح:" in emerald, while fully
 * preserving rich formatting, LaTeX math, and code blocks.
 */
function enhanceCalloutChildren(type: CalloutType, children: React.ReactNode): React.ReactNode {
  if (type !== "common-mistake") {
    return children;
  }

  return React.Children.map(children, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) {
      return child;
    }

    const childNodes = React.Children.toArray(child.props.children);
    let splitIndex = -1;
    for (let i = 0; i < childNodes.length; i++) {
      const text = extractChildText(childNodes[i]).trim();
      if (i > 0 && /^(?:✓\s*)?(?:توضیح\s*صحیح|پاسخ\s*صحیح|اصلاحیه|صحیح|درست)\s*[:：]?$/i.test(text)) {
        splitIndex = i;
        break;
      }
    }

    if (splitIndex > 0) {
      const mistakePart = childNodes.slice(0, splitIndex);
      const correctionPart = childNodes.slice(splitIndex);

      return (
        <div className="flex flex-col gap-1.5 my-0.5">
          <div className="flex items-baseline gap-1.5 leading-[1.95]">
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400 shrink-0 select-none">
              ✕ برداشت اشتباه:
            </span>
            <span className="flex-1">{stripMistakePrefix(mistakePart)}</span>
          </div>
          <div className="flex items-baseline gap-1.5 leading-[1.95]">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0 select-none">
              ✓ توضیح صحیح:
            </span>
            <span className="flex-1">{stripMistakePrefix(correctionPart)}</span>
          </div>
        </div>
      );
    }

    const text = extractChildText(child.props.children).trim();
    const isMistake = /^(?:✕\s*)?(?:برداشت\s*اشتباه|اشتباه\s*رایج|اشتباه|باور\s*غلط)\s*[:：]/i.test(text);
    const isCorrection = /^(?:✓\s*)?(?:توضیح\s*صحیح|پاسخ\s*صحیح|توضیح|اصلاحیه|صحیح|درست)\s*[:：]/i.test(text);

    if (isMistake || isCorrection) {
      return (
        <div className="flex items-baseline gap-1.5 leading-[1.95]">
          <span
            className={`text-xs font-bold shrink-0 select-none ${
              isMistake
                ? "text-rose-600 dark:text-rose-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {isMistake ? "✕ برداشت اشتباه:" : "✓ توضیح صحیح:"}
          </span>
          <span className="flex-1">
            {stripMistakePrefix(child.props.children)}
          </span>
        </div>
      );
    }

    return child;
  });
}

/**
 * LessonCallout Component — Ultra Minimal Design
 *
 * Implements the Concept C (Ultra Minimal) design:
 * - Completely unboxed: eliminates 4-sided bounding boxes and saturated background fills
 * - Delicate vertical accent rule on the right (border-r-[2.5px]) for RTL flow
 * - Compact title bar with fine line icon (15px), clean bold typography, and micro-dot pip
 * - Reduced vertical footprint for long, fatigue-free scientific reading
 * - Linear mistake vs. correction comparison for "اشتباه رایج"
 * - Full backward compatibility with LaTeX math, code, lists, and dark mode
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
  const enhancedContent = enhanceCalloutChildren(type, children);

  return (
    <div
      className={`lesson-callout callout-ultra w-full my-3 sm:my-3.5 pr-3.5 sm:pr-4 pl-1 py-1 sm:py-1.5 border-r-[2.5px] bg-transparent ${config.borderColorClass} ${className}`.trim()}
      dir="rtl"
      data-testid={`callout-${type}`}
      data-callout-type={type}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 select-none">
        <Icon className={`callout-ultra-icon w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${config.iconClass}`} aria-hidden="true" />
        <span className="font-bold text-[13.5px] sm:text-sm text-slate-900 dark:text-slate-100 tracking-tight">
          {displayTitle}
        </span>
        <span className={`callout-ultra-pip w-1.5 h-1.5 rounded-full inline-block shrink-0 ${config.pipClass}`} aria-hidden="true" />
      </div>
      <div className="text-[14px] sm:text-[14.5px] text-[var(--color-text-secondary)] dark:text-slate-300 leading-[1.95] space-y-1.5 break-words [&>p]:!mb-0 [&>ul]:!mb-0 [&>ol]:!mb-0 [&>blockquote]:!my-1.5 [&>pre]:!my-1.5 [&>*:first-child]:!mt-0 [&>*:last-child]:!mb-0 [&_p:last-child]:!mb-0 [&>ul]:pr-4 [&>ol]:pr-4 [&>ul]:my-1.5 [&>ol]:my-1.5 [&>li]:leading-[1.95]">
        {enhancedContent}
      </div>
    </div>
  );
}
