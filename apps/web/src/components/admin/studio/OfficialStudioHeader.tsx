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
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
            پیش‌نویس (Draft)
          </span>
        );
      case "generating":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-950/60 text-purple-300 border border-purple-500/40 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
            <span>در حال تولید هوش مصنوعی</span>
          </span>
        );
      case "review":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950/60 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>در انتظار بازبینی و تایید</span>
          </span>
        );
      case "approved":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-950/60 text-blue-300 border border-blue-500/40 flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-blue-400" />
            <span>تایید شده (آماده انتشار)</span>
          </span>
        );
      case "published":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>منتشر شده در کاتالوگ فروش</span>
          </span>
        );
      case "archived":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950/40 text-rose-300 border border-rose-500/30">
            بایگانی شده
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900/80 rounded-3xl border border-slate-800 p-5 sm:p-6 shadow-xl backdrop-blur-xl space-y-4">
      {/* Top row: Breadcrumb / Switcher & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <button
            type="button"
            onClick={onBackToCatalog}
            className="hover:text-teal-400 transition-colors flex items-center gap-1 font-bold"
          >
            <span>استودیو محتوای رسمی</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <span className="text-slate-600">/</span>

          {/* Quick Course Switcher Dropdown */}
          <select
            value={course.id}
            onChange={(e) => onSelectCourse(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-teal-500 max-w-[200px] sm:max-w-xs truncate"
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
            className="p-2.5 rounded-2xl border border-slate-800 bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            title="به‌روزرسانی اطلاعات دوره"
            aria-label="به‌روزرسانی"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>

          <button
            type="button"
            onClick={onBackToCatalog}
            className="px-4 py-2 rounded-2xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
          >
            کاتالوگ دوره‌ها
          </button>
        </div>
      </div>

      {/* Main Course Info & Metrics */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-3 border-t border-slate-800/80">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black text-white">
              {course.name}
            </h1>
            {getStatusBadge(course.status)}
            {course.subject && (
              <span className="px-2.5 py-0.5 rounded-xl bg-slate-800 text-slate-300 text-xs border border-slate-700 font-medium">
                {course.subject}
              </span>
            )}
          </div>
          {course.description && (
            <p className="text-xs sm:text-sm text-slate-400 max-w-3xl line-clamp-2">
              {course.description}
            </p>
          )}
        </div>

        {/* Aggregate Learning & Commercial Badges */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-teal-950/40 border border-teal-500/20 text-teal-300 text-xs">
            <Layers className="w-3.5 h-3.5 text-teal-400" />
            <span className="font-bold">{course.moduleCount}</span>
            <span className="text-[11px] text-teal-400/70">فصل</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-950/40 border border-blue-500/20 text-blue-300 text-xs">
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-bold">{course.lessonCount}</span>
            <span className="text-[11px] text-blue-400/70">درس</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-950/40 border border-purple-500/20 text-purple-300 text-xs">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-bold">{course.flashcardCount}</span>
            <span className="text-[11px] text-purple-400/70">فلش‌کارت</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-950/40 border border-amber-500/20 text-amber-300 text-xs">
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-bold">{course.quizQuestionCount}</span>
            <span className="text-[11px] text-amber-400/70">سؤال تستی</span>
          </div>

          {course.product && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-emerald-300 text-xs font-bold">
              <span>{course.product.price.toLocaleString("fa-IR")} تومان</span>
              <span className="text-[10px] text-emerald-400/70">
                {course.product.active ? "(فعال)" : "(پیش‌نویس قیمت)"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
