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
import { formatToman } from "../commerce/userCommerceUtils.js";

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
    <div
      data-testid={`chapter-package-card-${packageItem.id}`}
      className="group relative flex flex-col justify-between rounded-2xl glass-panel border border-white/10 p-5 shadow-ambient hover:border-teal-500/40 hover:shadow-teal-500/5 transition-all duration-300 bg-slate-900/60"
      dir="rtl"
    >
      {/* Top Header: Subject, Completeness & Pricing Badges */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {/* Subject Badge */}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Sparkles className="w-3 h-3" />
              <span>{packageItem.subject || "عمومی / داروسازی"}</span>
            </span>

            {/* Completeness Badge */}
            {isPartial ? (
              <span
                data-testid="badge-partial"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30"
                title="بخشی از محتوای این فصل هنوز در حال تکمیل است"
              >
                <AlertCircle className="w-3 h-3" />
                <span>پک در حال تکمیل ({stats.totalItems} از ۴)</span>
              </span>
            ) : (
              <span
                data-testid="badge-complete"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-500/10 text-teal-300 border border-teal-500/30"
              >
                <CheckCircle2 className="w-3 h-3 text-teal-400" />
                <span>پک آموزشی کامل</span>
              </span>
            )}
          </div>

          {/* Access / Pricing Badge */}
          <div className="shrink-0">
            {isPurchased ? (
              <span
                data-testid="badge-purchased"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              >
                خریداری شده
              </span>
            ) : isSubscription ? (
              <span
                data-testid="badge-subscription"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30"
              >
                دارای دسترسی با اشتراک
              </span>
            ) : isFree ? (
              <span
                data-testid="badge-free"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30"
              >
                رایگان
              </span>
            ) : purchase.price > 0 ? (
              <span
                data-testid="badge-price"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30"
              >
                {formatToman(purchase.price)}
              </span>
            ) : null}
          </div>
        </div>

        {/* Chapter Title */}
        <h3 className="text-base font-bold text-white group-hover:text-teal-300 transition-colors line-clamp-1 mb-1">
          {packageItem.title}
        </h3>

        {/* Course Title Lineage */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
          <GraduationCap className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <span className="truncate">دوره: {packageItem.courseTitle}</span>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4 min-h-[2rem]">
          {packageItem.description && packageItem.description.trim().length > 0
            ? packageItem.description
            : "بسته آموزشی جامع فصل شامل درسنامه ساختاریافته، خلاصه نکات کلیدی، فلش‌کارت‌های مرور فعال و آزمون تستی."}
        </p>

        {/* 4 Educational Content Items in Package */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {/* 1. Lesson (درسنامه) */}
          {contents.lesson.exists && (
            <div
              data-testid="item-lesson"
              className="flex items-center gap-2 p-2 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-200"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="truncate">
                درسنامه {contents.lesson.count > 1 ? `(${contents.lesson.count} جلسه)` : ""}
              </span>
            </div>
          )}

          {/* 2. Summary (خلاصه) */}
          {contents.summary.exists && (
            <div
              data-testid="item-summary"
              className="flex items-center gap-2 p-2 rounded-xl bg-cyan-500/5 border border-cyan-500/20 text-xs text-cyan-200"
            >
              <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">خلاصه نکات کلیدی</span>
            </div>
          )}

          {/* 3. Flashcards (فلش‌کارت) */}
          {contents.flashcards.exists && (
            <div
              data-testid="item-flashcards"
              className="flex items-center gap-2 p-2 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200"
            >
              <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">{stats.flashcardCount} فلش‌کارت</span>
            </div>
          )}

          {/* 4. Quiz (آزمون) */}
          {contents.quiz.exists && (
            <div
              data-testid="item-quiz"
              className="flex items-center gap-2 p-2 rounded-xl bg-purple-500/5 border border-purple-500/20 text-xs text-purple-200"
            >
              <HelpCircle className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="truncate">{stats.quizQuestionCount} سوال آزمون</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer & Actions */}
      <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-3">
        {/* Total Time Estimate */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span>~{stats.estimatedReadingMinutes || 15} دقیقه</span>
        </div>

        {/* Main CTA */}
        <div className="flex items-center gap-2">
          {hasAccess ? (
            <button
              type="button"
              data-testid={`btn-view-package-${packageItem.id}`}
              onClick={() => onView(packageItem)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 shadow-md shadow-teal-900/30 transition-all cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>مشاهده بسته</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid={`btn-buy-package-${packageItem.id}`}
              onClick={() => onBuy(packageItem)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 shadow-md shadow-purple-900/30 transition-all cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>خرید بسته</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
