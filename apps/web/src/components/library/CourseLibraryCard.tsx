/**
 * Course Card for Avana Library.
 *
 * Displays an accessible Course in the Library grid with:
 * - Course Title & Subject
 * - Pricing & Entitlement Badges (رایگان، خریداری شده، با اشتراک، قیمت به تومان)
 * - Short description
 * - Module and Lesson counts
 * - User completion progress bar & percentage
 * - Direct link / CTA to course learning hub or paywall (/courses/:courseId)
 */

import { Link } from "react-router-dom";
import {
  GraduationCap,
  BookOpen,
  Layers,
  ChevronLeft,
  CheckCircle2,
  Lock,
  Sparkles,
  Zap,
} from "lucide-react";
import type { LibraryCourseItem } from "../../lib/api/library.js";

export interface CourseLibraryCardProps {
  course: LibraryCourseItem;
  onBuy?: (course: LibraryCourseItem) => void;
}

export function CourseLibraryCard({ course, onBuy }: CourseLibraryCardProps) {
  const progress = course.progress;
  const hasProgress = progress && progress.total_lessons > 0;
  const isCompleted = hasProgress && progress.completed_lessons >= progress.total_lessons;

  const access = course.access;
  const purchase = course.purchase;
  const hasAccess = access?.hasAccess ?? true;
  const isPurchased = access?.isPurchased === true;
  const isSubscriptionAccess = access?.accessSource === "subscription";
  const isFree = access?.isFree ?? (purchase ? purchase.price === 0 : true);
  const price = purchase?.price ?? 0;

  return (
    <div
      data-testid={`library-course-card-${course.id}`}
      className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-ambient backdrop-blur-md transition-all duration-300 hover:border-teal-500/40 hover:bg-slate-900/90 hover:shadow-lg hover:shadow-teal-950/30"
    >
      {/* Card Header & Content */}
      <div className="space-y-3.5">
        {/* Top Badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-400 transition-transform group-hover:scale-105">
              <GraduationCap className="h-5 w-5" />
            </div>
            {course.subject && (
              <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-300">
                {course.subject}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {isCompleted && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                <span>تکمیل شده</span>
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

        {/* Title */}
        <h3 className="line-clamp-2 text-base font-bold text-white transition-colors group-hover:text-teal-300">
          {course.title}
        </h3>

        {/* Description (if present) */}
        {course.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-400">
            {course.description}
          </p>
        )}

        {/* Stats Badges */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-300">
          {course.module_count > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1 text-slate-300">
              <Layers className="h-3.5 w-3.5 text-amber-400" />
              <span>{course.module_count} فصل</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1 text-slate-300">
            <BookOpen className="h-3.5 w-3.5 text-teal-400" />
            <span>{course.content_count} درسنامه</span>
          </div>
        </div>

        {/* Progress Bar (if available) */}
        {hasProgress && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>پیشرفت مطالعه</span>
              <span className="font-semibold text-teal-300">{progress.percent}٪</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Action CTA Footer */}
      <div className="mt-5 border-t border-white/10 pt-3">
        {!hasAccess && onBuy ? (
          <button
            type="button"
            onClick={() => onBuy(course)}
            data-testid={`buy-course-btn-${course.id}`}
            className="flex w-full items-center justify-between rounded-xl px-3.5 py-2 text-xs font-bold transition-all group-hover:shadow-sm bg-amber-500/10 text-amber-300 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/20 cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              <span>
                {price > 0
                  ? `خرید دوره (${price.toLocaleString("fa-IR")} تومان)`
                  : "خرید دوره"}
              </span>
            </div>
            <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          </button>
        ) : (
          <Link
            to={course.href || `/courses/${course.id}`}
            className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2 text-xs font-bold transition-all group-hover:shadow-sm ${
              hasAccess
                ? "bg-teal-500/10 text-teal-300 hover:bg-teal-500 hover:text-slate-950"
                : "bg-amber-500/10 text-amber-300 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/20"
            }`}
          >
            <div className="flex items-center gap-1.5">
              {!hasAccess && <Lock className="h-3.5 w-3.5" />}
              <span>{hasAccess ? "ورود به دوره" : "مشاهده و خرید دوره"}</span>
            </div>
            <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          </Link>
        )}
      </div>
    </div>
  );
}
