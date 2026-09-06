/**
 * Standalone Content Card for Avana Library.
 *
 * Displays an accessible content item (e.g. Lesson) from any user-accessible course with:
 * - Content Title
 * - Content Type badge (درسنامه)
 * - Pricing & Entitlement Badges (رایگان، خریداری شده، با اشتراک، قیمت مستقل به تومان)
 * - Parent Course Title & Module / Chapter Title
 * - Estimated reading time
 * - Completion / Study status badge
 * - Direct link / CTA straight to the content or paywall (/courses/:courseId?lessonId=:id)
 */

import { Link } from "react-router-dom";
import {
  FileText,
  Layers,
  Clock,
  ChevronLeft,
  CheckCircle2,
  CircleDashed,
  Lock,
  Sparkles,
  Zap,
} from "lucide-react";
import type { LibraryContentItem } from "../../lib/api/library.js";

export interface ContentLibraryCardProps {
  content: LibraryContentItem;
  onBuy?: (content: LibraryContentItem) => void;
}

export function ContentLibraryCard({ content, onBuy }: ContentLibraryCardProps) {
  const isCompleted = content.completed === true;

  const access = content.access;
  const purchase = content.purchase;
  const hasAccess = access?.hasAccess ?? true;
  const isPurchased = access?.isPurchased === true;
  const isSubscriptionAccess = access?.accessSource === "subscription";
  const isFree = access?.isFree ?? (purchase ? purchase.price === 0 : true);
  const price = purchase?.price ?? 0;

  return (
    <div
      data-testid={`library-content-card-${content.id}`}
      className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-ambient backdrop-blur-md transition-all duration-300 hover:border-cyan-500/40 hover:bg-slate-900/90 hover:shadow-lg hover:shadow-cyan-950/30"
    >
      {/* Card Header & Content */}
      <div className="space-y-3">
        {/* Top Badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 transition-transform group-hover:scale-105">
              <FileText className="h-4.5 w-4.5" />
            </div>
            <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
              {content.type === "lesson" ? "درسنامه" : "محتوای آموزشی"}
            </span>
          </div>

          {/* Badges: Completion & Pricing */}
          <div className="flex flex-wrap items-center gap-1.5">
            {isCompleted ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                <span>تکمیل شده</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[11px] font-medium text-slate-400">
                <CircleDashed className="h-3 w-3" />
                <span>شروع نشده</span>
              </span>
            )}

            {/* Pricing & Entitlement Badges */}
            {isPurchased ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                <span>خریداری شده</span>
              </span>
            ) : isSubscriptionAccess ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[11px] font-bold text-purple-300">
                <Zap className="h-3 w-3" />
                <span>اشتراک فعال</span>
              </span>
            ) : isFree ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/15 px-2 py-0.5 text-[11px] font-bold text-teal-300">
                <Sparkles className="h-3 w-3" />
                <span>رایگان</span>
              </span>
            ) : price > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                <Lock className="h-3 w-3" />
                <span>{price.toLocaleString("fa-IR")} تومان</span>
              </span>
            ) : !hasAccess ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                <Lock className="h-3 w-3" />
                <span>ویژه</span>
              </span>
            ) : null}
          </div>
        </div>

        {/* Content Title */}
        <h3 className="line-clamp-2 text-base font-bold text-white transition-colors group-hover:text-cyan-300">
          {content.title}
        </h3>

        {/* Parent Course & Module Context */}
        <div className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-xs text-slate-400">
          <div className="flex items-center gap-1.5 truncate font-medium text-slate-300" title={content.course_title}>
            <span className="shrink-0 text-slate-500">دوره:</span>
            <span className="truncate text-teal-300">{content.course_title}</span>
          </div>

          {content.module_title && (
            <div className="flex items-center gap-1.5 truncate text-[11px] text-slate-400" title={content.module_title}>
              <Layers className="h-3 w-3 shrink-0 text-amber-400/80" />
              <span className="truncate">{content.module_title}</span>
            </div>
          )}
        </div>

        {/* Estimated Reading Time */}
        {content.estimated_minutes && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Clock className="h-3 w-3 text-slate-400" />
            <span>زمان مطالعه: ~{content.estimated_minutes} دقیقه</span>
          </div>
        )}
      </div>

      {/* Action CTA Footer */}
      <div className="mt-5 border-t border-white/10 pt-3">
        {!hasAccess && onBuy ? (
          <button
            type="button"
            onClick={() => onBuy(content)}
            data-testid={`buy-content-btn-${content.id}`}
            className="flex w-full items-center justify-between rounded-xl px-3.5 py-2 text-xs font-bold transition-all group-hover:shadow-sm bg-amber-500/10 text-amber-300 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/20 cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              <span>
                {price > 0
                  ? `خرید محتوا (${price.toLocaleString("fa-IR")} تومان)`
                  : "خرید محتوا"}
              </span>
            </div>
            <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          </button>
        ) : (
          <Link
            to={content.href || `/courses/${content.course_id}?lessonId=${content.lesson_id || content.id}`}
            className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2 text-xs font-bold transition-all group-hover:shadow-sm ${
              hasAccess
                ? "bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500 hover:text-slate-950"
                : "bg-amber-500/10 text-amber-300 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/20"
            }`}
          >
            <div className="flex items-center gap-1.5">
              {!hasAccess && <Lock className="h-3.5 w-3.5" />}
              <span>{hasAccess ? (isCompleted ? "مرور مجدد درس" : "مطالعه محتوا") : "مشاهده و خرید محتوا"}</span>
            </div>
            <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          </Link>
        )}
      </div>
    </div>
  );
}
