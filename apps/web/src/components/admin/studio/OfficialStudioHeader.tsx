import {
  Sparkles,
  BookOpen,
  Layers,
  HelpCircle,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import type { OfficialCourse } from "../../../lib/api/admin.js";

export interface OfficialStudioHeaderProps {
  course: OfficialCourse;
  courses: OfficialCourse[];
  onSelectCourse: (courseId: string) => void;
  onBackToCatalog: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function OfficialStudioHeader({
  course,
  courses,
  onSelectCourse,
  onBackToCatalog,
  onRefresh,
  isLoading,
}: OfficialStudioHeaderProps) {
  const getStatusBadge = (status: OfficialCourse["status"]) => {
    switch (status) {
      case "draft":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
            پیش‌نویس (Draft)
          </span>
        );
      case "generating":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin text-teal-600 dark:text-teal-400" />
            <span>در حال تولید هوش مصنوعی</span>
          </span>
        );
      case "review":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span>در انتظار بازبینی و تایید</span>
          </span>
        );
      case "approved":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-sky-600 dark:text-sky-400" />
            <span>تایید شده (آماده انتشار)</span>
          </span>
        );
      case "published":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>منتشر شده در کاتالوگ فروش</span>
          </span>
        );
      case "archived":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
            بایگانی شده
          </span>
        );
    }
  };

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-4">
      {/* Top row: Breadcrumb / Switcher & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <button
            type="button"
            onClick={onBackToCatalog}
            className="hover:text-[var(--color-primary-default)] transition-colors flex items-center gap-1 font-bold"
          >
            <span>استودیو محتوای رسمی</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <span className="text-[var(--color-border)]">/</span>

          {/* Quick Course Switcher Dropdown */}
          <select
            value={course.id}
            onChange={(e) => onSelectCourse(e.target.value)}
            className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] rounded-xl px-2.5 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] max-w-[200px] sm:max-w-xs truncate"
            aria-label="انتخاب دوره رسمی"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.status})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            title="به‌روزرسانی اطلاعات دوره"
            aria-label="به‌روزرسانی"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>

          <button
            type="button"
            onClick={onBackToCatalog}
            className="px-3.5 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-card)] text-[var(--color-text)] text-xs font-bold transition-colors"
          >
            کاتالوگ دوره‌ها
          </button>
        </div>
      </div>

      {/* Main Course Info & Metrics */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-3 border-t border-[var(--color-border)]">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black text-[var(--color-text)]">
              {course.name}
            </h1>
            {getStatusBadge(course.status)}
            {course.subject && (
              <span className="px-2.5 py-0.5 rounded-full bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] text-xs border border-[var(--color-border)] font-medium">
                {course.subject}
              </span>
            )}
          </div>
          {course.description && (
            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] max-w-3xl line-clamp-2">
              {course.description}
            </p>
          )}
        </div>

        {/* Aggregate Learning & Commercial Badges */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 bg-[var(--color-surface-warm)]/50 p-2.5 rounded-xl border border-[var(--color-border)]">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] text-xs">
            <Layers className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
            <span className="font-bold">{course.moduleCount}</span>
            <span className="text-[11px] text-[var(--color-text-muted)]">فصل</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] text-xs">
            <BookOpen className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span className="font-bold">{course.lessonCount}</span>
            <span className="text-[11px] text-[var(--color-text-muted)]">درس</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] text-xs">
            <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span className="font-bold">{course.flashcardCount}</span>
            <span className="text-[11px] text-[var(--color-text-muted)]">فلش‌کارت</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] text-xs">
            <HelpCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="font-bold">{course.quizQuestionCount}</span>
            <span className="text-[11px] text-[var(--color-text-muted)]">سؤال تستی</span>
          </div>

          {course.product && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
              <span>{course.product.price.toLocaleString("fa-IR")} تومان</span>
              <span className="text-[10px] opacity-80">
                {course.product.active ? "(فعال)" : "(پیش‌نویس قیمت)"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
