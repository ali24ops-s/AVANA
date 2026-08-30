import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Sparkles,
  Zap,
  HelpCircle,
  Layers,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Hash,
  Scale,
  BrainCircuit,
  GraduationCap,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createGenerationApi } from "../../lib/api/generation.js";
import type { ReviewSummaryPayload, ReviewSummarySection } from "@avana/domain";

export interface ReviewSummaryViewerProps {
  organizationId: string;
  documentId: string;
  courseId?: string | null;
  documentTitle?: string;
  onNavigateToFlashcards?: () => void;
  onNavigateToQuiz?: () => void;
}

export function ReviewSummaryViewer({
  organizationId,
  documentId,
  courseId,
  documentTitle,
  onNavigateToFlashcards,
  onNavigateToQuiz,
}: ReviewSummaryViewerProps) {
  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const genApi = createGenerationApi(apiClient);

  // Fetch Review Summary
  const reviewSummaryQuery = useQuery({
    queryKey: ["review-summary", organizationId, documentId, courseId],
    queryFn: () => genApi.getReviewSummary(organizationId, documentId, courseId),
    enabled: Boolean(organizationId && documentId),
  });

  // Generate / Regenerate mutation
  const generateMutation = useMutation({
    mutationFn: (options?: { force?: boolean }) =>
      genApi.triggerReviewSummary(organizationId, documentId, courseId, {
        force: options?.force ?? true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["review-summary", organizationId, documentId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-content-status", organizationId, documentId],
      });
    },
  });

  const content = reviewSummaryQuery.data?.content;
  const payload = content?.payload as unknown as ReviewSummaryPayload | undefined;

  const isGenerating = generateMutation.isPending;
  const isLoading = reviewSummaryQuery.isLoading;
  const isError = reviewSummaryQuery.isError || generateMutation.isError;
  const errorMessage =
    (generateMutation.error as Error)?.message ||
    (reviewSummaryQuery.error as Error)?.message ||
    "خطا در دریافت یا تولید خلاصه مروری";

  // 1. Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 rounded-3xl bg-slate-900/60 border border-slate-800 font-sans" dir="rtl">
        <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 animate-spin">
          <Loader2 className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-white">در حال بارگذاری خلاصه مروری...</h3>
          <p className="text-xs text-slate-400">لطفاً چند لحظه صبر کنید</p>
        </div>
      </div>
    );
  }

  // 2. Generating state
  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 rounded-3xl bg-gradient-to-b from-teal-950/30 to-slate-900/80 border border-teal-500/30 font-sans" dir="rtl">
        <div className="w-16 h-16 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300 relative">
          <Sparkles className="w-8 h-8 animate-pulse text-teal-400" />
          <div className="absolute inset-0 rounded-2xl border-2 border-teal-400/50 animate-ping" />
        </div>
        <div className="space-y-2 max-w-md">
          <h3 className="text-lg font-black text-white">در حال استخراج و ساخت خلاصه مروری فشرده</h3>
          <p className="text-xs text-teal-300 leading-relaxed">
            موتور هوش مصنوعی آوانا در حال فشرده‌سازی مفاهیم کلیدی، مکانیسم‌ها، مقایسه‌ها و نکات آزمونی برای مرور ۱۰ تا ۱۵ دقیقه‌ای است...
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950/60 px-4 py-2 rounded-full border border-slate-800">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
          <span>تضمین دقت علمی بدون اضافه‌گویی</span>
        </div>
      </div>
    );
  }

  // 3. Error state
  if (isError && !payload) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center space-y-4 rounded-3xl bg-rose-950/20 border border-rose-500/30 text-slate-200 font-sans" dir="rtl">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-1 max-w-md">
          <h3 className="text-base font-bold text-white">خطا در پردازش خلاصه مروری</h3>
          <p className="text-xs text-rose-300">{errorMessage}</p>
        </div>
        <button
          type="button"
          onClick={() => generateMutation.mutate({ force: true })}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-lg shadow-rose-900/30"
        >
          <RefreshCw className="w-4 h-4" />
          <span>تلاش مجدد</span>
        </button>
      </div>
    );
  }

  // 4. Empty state (not yet generated)
  if (!payload || !payload.sections || payload.sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-10 sm:p-14 text-center space-y-5 rounded-3xl bg-slate-900/60 border border-slate-800/80 font-sans" dir="rtl">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-teal-500/20 to-indigo-500/20 border border-teal-500/30 text-teal-400 flex items-center justify-center shadow-lg shadow-teal-950/40">
          <Zap className="w-8 h-8" />
        </div>
        <div className="space-y-2 max-w-lg">
          <div className="flex items-center justify-center gap-2">
            <span className="px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-[11px] font-bold text-teal-300">
              ویژه مرور سریع قبل از آزمون (۱۰–۱۵ دقیقه)
            </span>
          </div>
          <h3 className="text-lg sm:text-xl font-black text-white">
            خلاصه مروری هنوز برای این فایل تولید نشده است
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            خلاصه مروری با بالاترین چگالی اطلاعاتی (High Information Density) طراحی شده تا در کمتر از ۱۵ دقیقه، مفاهیم کلیدی، مکانیسم‌ها، طبقه‌بندی داروها، اعداد مهم و نکات پرتکرار آزمونی را در حافظه شما فعال کند.
          </p>
        </div>

        <button
          type="button"
          onClick={() => generateMutation.mutate({ force: true })}
          className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs sm:text-sm font-black transition-all shadow-xl shadow-teal-950/50 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Sparkles className="w-4 h-4" />
          <span>تولید خلاصه مروری با هوش مصنوعی</span>
        </button>
      </div>
    );
  }

  // 5. Completed / Render state
  const estimatedMins = payload.estimatedReadingMinutes || 12;

  return (
    <div className="space-y-6 font-sans text-slate-200" dir="rtl">
      {/* Top Header Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900/90 via-[#0d1627]/90 to-teal-950/30 border border-teal-500/30 shadow-2xl relative overflow-hidden">
        {/* Background decorative glow */}
        <div className="absolute top-0 left-0 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none translate-x-1/3 translate-y-1/3" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-xl bg-teal-500/20 border border-teal-500/40 text-xs font-black text-teal-300 flex items-center gap-1.5 shadow-sm">
                <Zap className="w-3.5 h-3.5 text-teal-400" />
                خلاصه مروری (Review Summary)
              </span>
              <span className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                زمان مطالعه تقریبی: {estimatedMins.toLocaleString("fa-IR")} دقیقه
              </span>
              <span className="px-3 py-1 rounded-xl bg-purple-500/10 border border-purple-500/30 text-xs font-bold text-purple-300 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-purple-400" />
                مناسب برای: مرور سریع قبل از آزمون
              </span>
            </div>

            <button
              type="button"
              onClick={() => generateMutation.mutate({ force: true })}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white transition disabled:opacity-50"
              title="تولید مجدد خلاصه مروری"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
              <span>به‌روزرسانی خلاصه</span>
            </button>
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {payload.title || documentTitle || "خلاصه جامع و مروری مبحث"}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              طراحی‌شده برای فعال‌سازی حداکثر اطلاعات مهم در کمترین زمان ممکن بدون حاشیه‌پردازی
            </p>
          </div>
        </div>
      </div>

      {/* 1-Minute Quick Overview Box */}
      {payload.overview && (
        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-teal-950/40 via-slate-900/60 to-slate-900/80 border border-teal-500/40 shadow-lg">
          <div className="flex items-center gap-2 mb-2 text-teal-400">
            <Sparkles className="w-4 h-4" />
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider">
              خلاصه یک‌دقیقه‌ای (Quick Core Overview)
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
            {payload.overview}
          </p>
        </div>
      )}

      {/* Sections List */}
      <div className="space-y-5">
        {payload.sections.map((section, sIdx) => (
          <SectionCard key={sIdx} section={section} index={sIdx} />
        ))}
      </div>

      {/* Final Takeaways Box */}
      {payload.finalTakeaways && payload.finalTakeaways.length > 0 && (
        <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900/80 to-purple-950/30 border border-indigo-500/30 shadow-xl space-y-3">
          <div className="flex items-center gap-2 text-indigo-400">
            <Bookmark className="w-4 h-4" />
            <h2 className="text-sm font-black uppercase tracking-wider">
              جمع‌بندی نهایی و نکات کلیدی (Final Takeaways)
            </h2>
          </div>
          <ul className="space-y-2 text-xs sm:text-sm text-slate-200">
            {payload.finalTakeaways.map((takeaway, tIdx) => (
              <li key={tIdx} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{takeaway}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bottom Study Transition Action Banner */}
      <div className="p-6 sm:p-7 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-right">
          <h3 className="text-base font-black text-white flex items-center justify-center sm:justify-start gap-2">
            <span>مرور را تمام کردی؟</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              آماده تثبیت
            </span>
          </h3>
          <p className="text-xs text-slate-400">
            برای تثبیت در حافظه بلندمدت و سنجش آمادگی، فلش‌کارت‌ها و کوئیز این مبحث را شروع کنید:
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto shrink-0">
          {onNavigateToFlashcards && (
            <button
              type="button"
              onClick={onNavigateToFlashcards}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-purple-600/90 hover:bg-purple-600 text-white text-xs font-black transition-all shadow-lg shadow-purple-950/40 hover:scale-[1.02]"
            >
              <Layers className="w-4 h-4" />
              <span>شروع فلش‌کارت‌های این مبحث</span>
            </button>
          )}

          {onNavigateToQuiz && (
            <button
              type="button"
              onClick={onNavigateToQuiz}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-amber-600/90 hover:bg-amber-600 text-white text-xs font-black transition-all shadow-lg shadow-amber-950/40 hover:scale-[1.02]"
            >
              <HelpCircle className="w-4 h-4" />
              <span>آزمون سریع این درس</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Card Component
// ---------------------------------------------------------------------------

function SectionCard({
  section,
  index,
}: {
  section: ReviewSummarySection;
  index: number;
}) {
  const [isOpen, setIsOpen] = useState(true);

  const hasComparisons =
    Array.isArray(section.comparisons) && section.comparisons.length > 0;
  const hasMechanisms =
    Array.isArray(section.mechanisms) && section.mechanisms.length > 0;
  const hasClassifications =
    Array.isArray(section.classifications) && section.classifications.length > 0;
  const hasMemorization =
    Array.isArray(section.memorizationPoints) &&
    section.memorizationPoints.length > 0;
  const hasExamPoints =
    Array.isArray(section.examPoints) && section.examPoints.length > 0;

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-md transition-all">
      {/* Section Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer bg-white/[0.02] hover:bg-white/[0.04] transition select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center font-bold text-xs shrink-0">
            {(index + 1).toLocaleString("fa-IR")}
          </div>
          <h3 className="text-sm sm:text-base font-bold text-white truncate">
            {section.title}
          </h3>
        </div>

        <div className="flex items-center gap-2 shrink-0 text-slate-400">
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            {section.keyPoints?.length ?? 0} نکته کلیدی
          </span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* Section Body */}
      {isOpen && (
        <div className="p-5 sm:p-6 space-y-5 border-t border-slate-800/80 text-xs sm:text-sm">
          {/* Key Points */}
          {section.keyPoints && section.keyPoints.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                <span>نکات کلیدی و مفاهیم اصلی:</span>
              </h4>
              <ul className="space-y-2 pr-2">
                {section.keyPoints.map((pt, pIdx) => (
                  <li key={pIdx} className="flex items-start gap-2.5 text-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0 mt-2" />
                    <span className="leading-relaxed">{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Mechanisms & Classifications Grid */}
          {(hasMechanisms || hasClassifications) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {hasMechanisms && (
                <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/20 space-y-2">
                  <h5 className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <BrainCircuit className="w-3.5 h-3.5 text-cyan-400" />
                    <span>مکانیسم‌های سلولی / مولکولی:</span>
                  </h5>
                  <ul className="space-y-1.5 text-xs text-slate-300 pr-1">
                    {section.mechanisms!.map((m, mIdx) => (
                      <li key={mIdx} className="flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-cyan-400 shrink-0 mt-1.5" />
                        <span className="leading-relaxed">{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {hasClassifications && (
                <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-500/20 space-y-2">
                  <h5 className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-blue-400" />
                    <span>دسته‌بندی و طبقه‌بندی ساختاری:</span>
                  </h5>
                  <ul className="space-y-1.5 text-xs text-slate-300 pr-1">
                    {section.classifications!.map((c, cIdx) => (
                      <li key={cIdx} className="flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-blue-400 shrink-0 mt-1.5" />
                        <span className="leading-relaxed">{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Comparisons / Distinctions Table & Cards */}
          {hasComparisons && (
            <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/20 space-y-2.5">
              <h5 className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-purple-400" />
                <span>مقایسه‌ها و تفاوت‌های کلیدی (Comparisons):</span>
              </h5>
              <div className="space-y-2">
                {section.comparisons!.map((comp, compIdx) => {
                  if (typeof comp === "string") {
                    return (
                      <div
                        key={compIdx}
                        className="p-2.5 rounded-lg bg-white/5 text-xs text-slate-200 leading-relaxed"
                      >
                        {comp}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={compIdx}
                      className="p-3 rounded-lg bg-purple-950/40 border border-purple-500/20 text-xs space-y-1"
                    >
                      <div className="flex items-center gap-2 font-bold text-purple-200">
                        <span>{comp.conceptA}</span>
                        <span className="text-purple-400">vs</span>
                        <span>{comp.conceptB}</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">
                        <span className="font-semibold text-purple-300">وجه تمایز: </span>
                        {comp.keyDifferences}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Numbers, Dosages & Memorization Highlights */}
          {hasMemorization && (
            <div className="p-4 rounded-xl bg-amber-950/25 border border-amber-500/25 space-y-2">
              <h5 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>اعداد، مقادیر و نکات حفظی مهم:</span>
              </h5>
              <ul className="space-y-1.5 text-xs text-amber-100/90 pr-1">
                {section.memorizationPoints!.map((mem, memIdx) => (
                  <li key={memIdx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                    <span className="leading-relaxed font-medium">{mem}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* High-Yield Exam Points */}
          {hasExamPoints && (
            <div className="p-4 rounded-xl bg-rose-950/25 border border-rose-500/25 space-y-2">
              <h5 className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-rose-400" />
                <span>نکات طلایی و پرتکرار امتحانی (High-Yield Exam Traps):</span>
              </h5>
              <ul className="space-y-1.5 text-xs text-rose-100/90 pr-1">
                {section.examPoints!.map((ex, exIdx) => (
                  <li key={exIdx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0 mt-1.5" />
                    <span className="leading-relaxed font-semibold">{ex}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
