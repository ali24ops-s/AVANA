/**
 * Special Exam Library Card Component.
 *
 * Displays a Special Exam product in the Avana Library:
 * - Product Title & Description
 * - Question count (e.g. ۸۰ سؤال)
 * - Difficulty & Scope / Topic coverage badges
 * - Pricing (authoritative Toman calculation)
 * - Notice explaining dynamic generation & permanent review retention
 * - Direct CTA to buy / repeat-buy creating a new Attempt
 */

import React from "react";
import {
  HelpCircle,
  Sparkles,
  Layers,
  BookOpen,
  ArrowLeft,
  Shuffle,
  RotateCcw,
  History,
} from "lucide-react";
import { Card, Badge, Button } from "@avana/ui";
import type { LibrarySpecialExamItem } from "../../lib/api/library.js";
import {
  formatSpecialExamTitle,
  formatSpecialExamDescription,
  cleanChapterTitle,
} from "../../lib/utils/exam-title-formatter.js";

export interface SpecialExamLibraryCardProps {
  exam: LibrarySpecialExamItem;
  onBuy?: (exam: LibrarySpecialExamItem) => void;
}

export function SpecialExamLibraryCard({
  exam,
  onBuy,
}: SpecialExamLibraryCardProps) {
  const price = exam.price;
  const questionCount = exam.question_count || 0;
  const topics = exam.scope?.topics || [];

  const displayTitle = formatSpecialExamTitle(exam.title);
  const isCourseExam = Boolean(
    exam.code?.includes("course") ||
      (!exam.scope?.moduleId && !displayTitle.includes("فصل")),
  );
  const displayDescription = formatSpecialExamDescription(
    exam.description,
    questionCount,
    isCourseExam,
  );

  // Filter out any topic that is merely duplicating the chapter/exam name
  const cleanTitleChapter = cleanChapterTitle(displayTitle);
  const filteredTopics = topics.filter((t) => {
    const cleanT = cleanChapterTitle(t);
    return cleanT.length > 0 && cleanT !== cleanTitleChapter;
  });

  const getDifficultyLabel = (diff?: string | null) => {
    switch (diff) {
      case "easy":
        return "ساده";
      case "medium":
        return "متوسط";
      case "hard":
        return "سخت";
      case "adaptive":
        return "تطبیقی";
      default:
        return "استاندارد";
    }
  };

  return (
    <Card
      data-testid={`library-special-exam-card-${exam.id}`}
      hoverable
      className="group relative flex flex-col justify-between p-5 bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] transition-all duration-300 rounded-2xl shadow-subtle hover:border-[var(--color-primary)]/40"
      dir="rtl"
    >
      <div className="space-y-4">
        {/* Header Badges */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 transition-transform group-hover:scale-105">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <Badge variant="primary" icon={<HelpCircle className="h-3 w-3" />}>
              آزمون ویژه
            </Badge>
          </div>

          <div className="flex items-center gap-1.5">
            <Badge variant="neutral" icon={<Layers className="h-3 w-3" />}>
              {questionCount.toLocaleString("fa-IR")} سؤال
            </Badge>
            {exam.difficulty && (
              <Badge variant="info">
                سطح {getDifficultyLabel(exam.difficulty)}
              </Badge>
            )}
          </div>
        </div>

        {/* Title and Description */}
        <div className="space-y-1.5">
          <h3
            data-testid="special-exam-title"
            className="text-base font-bold text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors line-clamp-2"
          >
            {displayTitle}
          </h3>
          <p
            data-testid="special-exam-description"
            className="text-xs text-[var(--color-text-muted)] line-clamp-2 leading-relaxed"
          >
            {displayDescription}
          </p>
        </div>

        {/* Scope / Topic Tags (rendered only if distinct from chapter title) */}
        {filteredTopics.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {filteredTopics.slice(0, 3).map((topic, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-secondary)]"
              >
                <BookOpen className="w-2.5 h-2.5 text-[var(--color-primary)]" />
                <span>{topic}</span>
              </span>
            ))}
            {filteredTopics.length > 3 && (
              <span className="text-[10px] text-[var(--color-text-muted)] self-center">
                +{filteredTopics.length - 3} مبحث دیگر
              </span>
            )}
          </div>
        )}

        {/* Dynamic Randomization Guarantee Highlight Card */}
        <div
          data-testid="special-exam-dynamic-guarantee"
          className="p-3.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/25 space-y-2.5 text-right transition-colors"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900 dark:text-amber-300">
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>آزمون پویا و اختصاصی</span>
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
              تولید هوشمند
            </span>
          </div>

          {/* Short Intro */}
          <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
            با هر بار سفارش، یک آزمون اختصاصی و تازه از بانک سؤال استخراج و برای شما آماده می‌شود:
          </p>

          {/* 3 Clear Feature Bullets */}
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center gap-2 text-[11px] text-[var(--color-text)]">
              <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400">
                <Shuffle className="w-2.5 h-2.5" />
              </div>
              <span className="font-medium">انتخاب تصادفی و فریز شدن سؤال‌ها برای هر خرید</span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[var(--color-text)]">
              <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400">
                <RotateCcw className="w-2.5 h-2.5" />
              </div>
              <span className="font-medium">خرید مجدد = آزمون جدید با سؤال‌های تصادفی جدید</span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[var(--color-text)]">
              <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400">
                <History className="w-2.5 h-2.5" />
              </div>
              <span className="font-medium">حفظ نتایج و سوابق آزمون‌های قبلی</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer: Price & Purchase Action */}
      <div className="pt-4 mt-4 border-t border-[var(--color-border)] flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-[10px] text-[var(--color-text-muted)]">قیمت آزمون:</div>
          <div className="text-sm font-extrabold text-[var(--color-text)]">
            {price === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">رایگان</span>
            ) : (
              <span>{price.toLocaleString("fa-IR")} تومان</span>
            )}
          </div>
        </div>

        <Button
          data-testid={`buy-special-exam-${exam.id}`}
          size="sm"
          variant="primary"
          onClick={() => onBuy?.(exam)}
          rightIcon={<ArrowLeft className="w-4 h-4" />}
          className="rounded-xl shadow-xs cursor-pointer"
        >
          خرید آزمون
        </Button>
      </div>
    </Card>
  );
}
