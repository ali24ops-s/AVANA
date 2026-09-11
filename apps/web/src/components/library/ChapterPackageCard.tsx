/**
 * ChapterPackageCard Component.
 *
 * Renders an independent Educational Chapter Package Card in the Avana Library.
 * Displays:
 * - Chapter Title, Course Title, Subject
 * - 4 Educational Content badges with counts (Lesson, Summary, Flashcards, Quiz)
 * - Completeness Status (پک کامل / پک در حال تکمیل)
 * - Access & Pricing State (خریداری شده / در دسترس با اشتراک / رایگان / قیمت)
 * - Action CTA ("مشاهده بسته" vs "خرید بسته")
 */

import {
  BookOpen,
  Layers,
  HelpCircle,
  FileText,
  Clock,
  Eye,
  ShoppingBag,
  Sparkles,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { ChapterPackageItem } from "@avana/domain";
import { toPersianDigits, formatPersianOf } from "@avana/domain";
import { formatToman } from "../commerce/userCommerceUtils.js";
import { Card, Badge, Button } from "@avana/ui";

export interface ChapterPackageCardProps {
  packageItem: ChapterPackageItem;
  onView: (pkg: ChapterPackageItem) => void;
  onBuy: (pkg: ChapterPackageItem) => void;
}

export function ChapterPackageCard({
  packageItem,
  onView,
  onBuy,
}: ChapterPackageCardProps) {
  const access = packageItem.access ?? {
    hasAccess: false,
    accessType: "paywalled" as const,
    accessSource: "none" as const,
    isEnrolled: false,
    isPurchased: false,
    isSubscriptionActive: false,
    isFree: false,
  };
  const contents = packageItem.contents ?? {
    lesson: { exists: false, count: 0, estimatedMinutes: 0 },
    summary: { exists: false },
    flashcards: { exists: false, count: 0 },
    quiz: { exists: false, questionCount: 0 },
  };
  const stats = packageItem.stats ?? {
    totalItems: 0,
    lessonCount: 0,
    flashcardCount: 0,
    quizQuestionCount: 0,
    estimatedReadingMinutes: 0,
  };
  const purchase = packageItem.purchase ?? {
    canPurchase: false,
    productId: null,
    price: 0,
    currency: "IRR",
    formattedPrice: "رایگان",
    isPurchased: false,
  };

  const hasAccess = access.hasAccess;
  const isPurchased = access.isPurchased;
  const isSubscription = access.accessSource === "subscription";
  const isFree = access.isFree;
  const isPartial = packageItem.completeness === "partial";

  return (
    <Card
      data-testid={`chapter-package-card-${packageItem.id}`}
      hoverable
      className="group relative flex flex-col justify-between p-5 bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] transition-all duration-300"
      dir="rtl"
    >
      {/* Top Header: Subject, Completeness & Pricing Badges */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {/* Subject Badge */}
            <Badge variant="primary" icon={<Sparkles className="w-3 h-3" />}>
              {packageItem.subject || "عمومی / داروسازی"}
            </Badge>

            {/* Completeness Badge */}
            {isPartial ? (
              <span
                data-testid="badge-partial"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/30"
                title="بخشی از محتوای این فصل هنوز در حال تکمیل است"
              >
                <AlertCircle className="w-3 h-3" />
                <span>پک در حال تکمیل ({formatPersianOf(stats.totalItems, 4)})</span>
              </span>
            ) : (
              <span
                data-testid="badge-complete"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/30"
              >
                <CheckCircle2 className="w-3 h-3 text-primary" />
                <span>پک آموزشی کامل</span>
              </span>
            )}
          </div>

          {/* Access / Pricing Badge */}
          <div className="shrink-0 flex items-center gap-1.5">
            {isPurchased ? (
              <span
                data-testid="badge-purchased"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
              >
                خریداری شده
              </span>
            ) : isSubscription ? (
              <span
                data-testid="badge-subscription"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary/15 text-primary border border-primary/30"
              >
                دارای دسترسی با اشتراک
              </span>
            ) : isFree ? (
              <span
                data-testid="badge-free"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30"
              >
                رایگان
              </span>
            ) : purchase.price > 0 ? (
              <span
                data-testid="badge-price"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/30"
              >
                {formatToman(purchase.price)}
              </span>
            ) : null}
            {!hasAccess && packageItem.preview?.hasPreview && (
              <span
                data-testid="badge-preview"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30"
              >
                <Sparkles className="w-3 h-3" />
                <span>پیش‌نمایش رایگان</span>
              </span>
            )}
          </div>
        </div>

        {/* Chapter Title */}
        <h3 className="text-base font-bold text-[var(--color-text)] group-hover:text-primary transition-colors line-clamp-1 mb-1">
          {packageItem.title}
        </h3>

        {/* Course Title Lineage */}
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] mb-3">
          <GraduationCap className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="truncate">دوره: {packageItem.courseTitle}</span>
        </div>

        {/* Description */}
        <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 leading-relaxed mb-4 min-h-[2rem]">
          {packageItem.description && packageItem.description.trim().length > 0
            ? packageItem.description
            : "بسته آموزشی جامع فصل شامل درسنامه ساختاریافته، خلاصه نکات کلیدی، فلش‌کارت‌های مرور فعال و آزمون تستی."}
        </p>

        {/* Free Preview Explanatory Notice */}
        {!hasAccess && packageItem.preview?.hasPreview && (
          <div className="mb-3 rounded-button border border-sky-500/20 bg-sky-500/5 p-2 text-[11px] text-sky-700 dark:text-sky-300">
            این محتوا پولی است، اما برای آشنایی یک بخش از آن رایگان است.
          </div>
        )}

        {/* 4 Educational Content Items in Package */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {/* 1. Lesson (درسنامه) */}
          {contents.lesson.exists && (
            <div
              data-testid="item-lesson"
              className="flex items-center justify-between p-2 rounded-button bg-blue-500/10 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-200"
            >
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="truncate">
                  درسنامه {contents.lesson.count > 1 ? `(${contents.lesson.count} جلسه)` : ""}
                </span>
              </div>
              {!hasAccess && packageItem.preview?.lesson?.available && (
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-700 dark:text-sky-300">
                  پیش‌نمایش رایگان
                </span>
              )}
            </div>
          )}

          {/* 2. Summary (خلاصه) */}
          {contents.summary.exists && (
            <div
              data-testid="item-summary"
              className="flex items-center gap-2 p-2 rounded-button bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-700 dark:text-cyan-200"
            >
              <FileText className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              <span className="truncate">خلاصه نکات کلیدی</span>
            </div>
          )}

          {/* 3. Flashcards (فلش‌کارت) */}
          {contents.flashcards.exists && (
            <div
              data-testid="item-flashcards"
              className="flex items-center justify-between p-2 rounded-button bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-200"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="truncate">{stats.flashcardCount} فلش‌کارت</span>
              </div>
              {!hasAccess && packageItem.preview?.flashcards?.available && (
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  پیش‌نمایش رایگان (۵ کارت)
                </span>
              )}
            </div>
          )}

          {/* 4. Quiz (آزمون) */}
          {contents.quiz.exists && (
            <div
              data-testid="item-quiz"
              className="flex items-center justify-between p-2 rounded-button bg-purple-500/10 border border-purple-500/20 text-xs text-purple-700 dark:text-purple-200"
            >
              <div className="flex items-center gap-2 min-w-0">
                <HelpCircle className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                <span className="truncate">{stats.quizQuestionCount} سوال آزمون</span>
              </div>
              {!hasAccess && packageItem.preview?.quiz?.available && (
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-700 dark:text-purple-300">
                  پیش‌نمایش رایگان
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer & Actions */}
      <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between gap-3">
        {/* Total Time Estimate */}
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <Clock className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
          <span>~{stats.estimatedReadingMinutes || 15} دقیقه</span>
        </div>

        {/* Main CTA */}
        <div className="flex items-center gap-2">
          {!hasAccess && (
            <Button
              size="sm"
              variant="outline"
              data-testid={`btn-view-package-${packageItem.id}`}
              onClick={() => onView(packageItem)}
              leftIcon={<Eye className="w-3.5 h-3.5" />}
            >
              مشاهده بسته
            </Button>
          )}
          {hasAccess ? (
            <Button
              size="sm"
              variant="primary"
              data-testid={`btn-view-package-${packageItem.id}`}
              onClick={() => onView(packageItem)}
              leftIcon={<Eye className="w-3.5 h-3.5" />}
            >
              مشاهده بسته
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              data-testid={`btn-buy-package-${packageItem.id}`}
              onClick={() => onBuy(packageItem)}
              leftIcon={<ShoppingBag className="w-3.5 h-3.5" />}
            >
              خرید بسته
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
