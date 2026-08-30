/**
 * ContentPackCard Component.
 *
 * Renders a published content pack card in the public library grid.
 * Displays subject, title, description, creator, educational stats,
 * and clear actionable CTAs ("مشاهده محتوا" & "افزودن به دوره").
 */

import {
  BookOpen,
  Layers,
  HelpCircle,
  Clock,
  Users,
  Eye,
  PlusCircle,
  Sparkles,
} from "lucide-react";
import type { PublicContentPackItemSummary } from "@avana/domain";

export interface ContentPackCardProps {
  pack: PublicContentPackItemSummary;
  onViewDetails: (pack: PublicContentPackItemSummary) => void;
  onAddToCourse: (pack: PublicContentPackItemSummary) => void;
}

export function ContentPackCard({
  pack,
  onViewDetails,
  onAddToCourse,
}: ContentPackCardProps) {
  const sessionCount = pack.stats?.session_count ?? 0;
  const flashcardCount = pack.stats?.flashcard_count ?? 0;
  const quizQuestionCount = pack.stats?.quiz_question_count ?? 0;
  const estimatedReadingMinutes = pack.stats?.estimated_reading_minutes ?? 10;
  const usageCount = pack.usage_count ?? 0;

  return (
    <div
      className="group relative flex flex-col justify-between rounded-2xl glass-panel border border-white/10 p-5 shadow-ambient hover:border-teal-500/40 hover:shadow-teal-500/5 transition-all duration-300 bg-slate-900/60"
      dir="rtl"
    >
      {/* Top Header: Subject Badge & Usage Count */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <Sparkles className="w-3 h-3" />
            <span>{pack.subject || "عمومی / پزشکی"}</span>
          </span>

          <span
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-medium bg-white/5 px-2 py-0.5 rounded-full border border-white/5"
            title="تعداد دفعات اضافه‌شده به دوره‌ها"
          >
            <Users className="w-3 h-3 text-teal-400" />
            <span>{usageCount} نصب</span>
          </span>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-white group-hover:text-teal-300 transition-colors line-clamp-1 mb-1.5">
          {pack.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4 min-h-[2rem]">
          {pack.description && pack.description.trim().length > 0
            ? pack.description
            : "مجموعه آموزشی جامع شامل درسنامه ساختاریافته، فلش‌کارت‌های مرور فعال، آزمون تستی و خلاصه نکات کلیدی."}
        </p>

        {/* Creator Info */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5 text-[11px] text-slate-400">
          <span className="text-slate-500">سازنده:</span>
          <span className="font-medium text-slate-300">
            {pack.creator?.name || "کاربر آوانا"}
          </span>
        </div>

        {/* Educational Content Stats Grid */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <div className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-slate-300">
            <BookOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="truncate">{sessionCount} جلسه درس</span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-slate-300">
            <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{flashcardCount} فلش‌کارت</span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-slate-300">
            <HelpCircle className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="truncate">{quizQuestionCount} سوال آزمون</span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-slate-300">
            <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">~{estimatedReadingMinutes} دقیقه</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={() => onViewDetails(pack)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all"
        >
          <Eye className="w-3.5 h-3.5 text-slate-400" />
          <span>مشاهده محتوا</span>
        </button>

        <button
          type="button"
          onClick={() => onAddToCourse(pack)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 shadow-md shadow-teal-900/30 transition-all"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>افزودن به دوره</span>
        </button>
      </div>
    </div>
  );
}
