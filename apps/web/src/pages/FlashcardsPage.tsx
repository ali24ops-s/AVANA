import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  AlertCircle,
  Loader2,
  Filter,
  Play,
  ArrowRight,
  Brain,
  FolderOpen,
  Flame,
  Info,
  Sliders,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createStudyApi } from "../lib/api/study.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createDocumentsApi } from "../lib/api/documents.js";
import { useAuth } from "../providers/AuthProvider.js";
import { TaxonomySelector } from "../components/study/TaxonomySelector.js";

const EXAM_MODE_LIMITS = [20, 50, 100, 200, "all"] as const;
type ExamLimit = (typeof EXAM_MODE_LIMITS)[number];

export function FlashcardsPage() {
  const { memberships, isLoading: isAuthLoading } = useAuth();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const orgApi = createOrganizationApi(apiClient);
  const studyApi = createStudyApi(apiClient);
  const docApi = createDocumentsApi(apiClient);
  const navigate = useNavigate();

  const orgQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: () => orgApi.listOrganizations(),
  });

  const organizationId =
    orgQuery.data?.items?.[0]?.id || memberships?.[0]?.organization_id;

  // Study Mode State: "daily" (مطالعه روزانه SRS) | "exam" (شب امتحان / فشرده)
  const [selectedGoal, setSelectedGoal] = useState<"daily" | "exam">("daily");

  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());

  const [examLimit, setExamLimit] = useState<ExamLimit>(50);
  const [reviewAheadDays, setReviewAheadDays] = useState<number>(3);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [dailyNewCardsLimit, setDailyNewCardsLimit] = useState<number>(20);
  const [dailyMaxReviewsLimit, setDailyMaxReviewsLimit] = useState<number>(100);

  const summaryQuery = useQuery({
    queryKey: ["flashcard-summary", organizationId],
    queryFn: () => studyApi.getFlashcardSummary(organizationId!),
    enabled: !!organizationId,
  });

  const docsQuery = useQuery({
    queryKey: ["documents", organizationId],
    queryFn: () => docApi.listDocuments(organizationId!),
    enabled: !!organizationId,
  });

  const summary = summaryQuery.data;

  const isLoading =
    isAuthLoading || orgQuery.isLoading || (!!organizationId && summaryQuery.isLoading);
  const isError = summaryQuery.isError;
  const refetch = () => {
    void orgQuery.refetch();
    void summaryQuery.refetch();
    void docsQuery.refetch();
  };

  const handleTaxonomyChange = (selection: {
    courseIds: Set<string>;
    moduleIds: Set<string>;
  }) => {
    setSelectedCourses(selection.courseIds);
    setSelectedModules(selection.moduleIds);
  };

  // Build clean taxonomy tree filtering out modules with 0 flashcards
  const validCourses = useMemo(() => {
    if (!summary?.courses) return [];
    return (summary.courses || [])
      .map((c: any) => {
        const rawModules = c.modules;
        const validModules = (rawModules || [])
          .filter((m: any) => (m.total_cards ?? m.itemCount ?? 0) > 0)
          .map((m: any) => ({
            id: m.module_id || m.id,
            title: m.title,
            itemCount: m.total_cards ?? m.itemCount,
          }));
        return {
          id: c.course_id || c.id,
          title: c.title,
          itemCount: c.total_cards ?? c.itemCount,
          modules: validModules,
          hasRawModules: Array.isArray(rawModules) && rawModules.length > 0,
        };
      })
      .filter((c: any) => {
        if ((c.itemCount ?? 0) <= 0) return false;
        if (c.hasRawModules) return c.modules.length > 0;
        return true;
      });
  }, [summary?.courses]);

  // Compute total available modules across all courses
  const allModuleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of validCourses) {
      for (const m of c.modules) {
        ids.add(m.id);
      }
    }
    return ids;
  }, [validCourses]);

  const allCourseIds = useMemo(() => {
    return new Set(validCourses.map((c) => c.id));
  }, [validCourses]);

  const isAllSelected = useMemo(() => {
    if (allModuleIds.size === 0 && allCourseIds.size === 0) return false;
    if (allModuleIds.size > 0) {
      return selectedModules.size === allModuleIds.size;
    }
    return selectedCourses.size === allCourseIds.size;
  }, [selectedModules, selectedCourses, allModuleIds, allCourseIds]);

  const toggleSelectAllTopics = () => {
    if (isAllSelected) {
      setSelectedCourses(new Set());
      setSelectedModules(new Set());
    } else {
      setSelectedCourses(new Set(allCourseIds));
      setSelectedModules(new Set(allModuleIds));
    }
  };

  // Compute active selected card count
  const activeSelectedCardCount = useMemo(() => {
    if (!summary) return 0;
    if (selectedModules.size > 0) {
      let count = 0;
      for (const course of validCourses) {
        for (const module of course.modules) {
          if (selectedModules.has(module.id)) {
            count += module.itemCount || 0;
          }
        }
      }
      return count;
    }
    if (selectedCourses.size > 0) {
      let count = 0;
      for (const course of validCourses) {
        if (selectedCourses.has(course.id)) {
          count += course.itemCount || 0;
        }
      }
      return count;
    }
    if (selectedGoal === "daily") {
      return (summary.total_due || 0) + (summary.total_new || 0);
    }
    return summary.total_cards || 0;
  }, [selectedModules, selectedCourses, validCourses, summary, selectedGoal]);

  // Estimated study duration in minutes (~1 min per 5 cards)
  const estimatedMinutes = Math.max(5, Math.ceil(activeSelectedCardCount * 0.2));

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (selectedCourses.size > 0) {
      params.set("courses", Array.from(selectedCourses).join(","));
    }
    if (selectedModules.size > 0) {
      params.set("modules", Array.from(selectedModules).join(","));
    }
    return params;
  };

  const startNormalReview = (specificCourseId?: string) => {
    const params = buildQueryParams();
    if (specificCourseId) {
      params.set("courses", specificCourseId);
    }
    const queryString = params.toString();
    navigate(`/flashcards/review${queryString ? `?${queryString}` : ""}`);
  };

  const startExamMode = () => {
    const params = buildQueryParams();
    params.set("mode", "exam");
    params.set("limit", String(examLimit));
    navigate(`/flashcards/review?${params.toString()}`);
  };

  const startCustomStudy = (mode: "weak" | "forgotten" | "review_ahead" | "new") => {
    const params = buildQueryParams();
    params.set("mode", "custom");
    params.set("customMode", mode);
    if (mode === "review_ahead") {
      params.set("aheadDays", String(reviewAheadDays));
    }
    navigate(`/flashcards/review?${params.toString()}`);
  };

  const handleStartStudy = () => {
    if (selectedGoal === "exam") {
      startExamMode();
    } else {
      startNormalReview();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 min-h-screen">
        <Loader2 className="w-10 h-10 animate-spin text-[#0f766e]" />
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-[#0f172a]/80 rounded-3xl border border-slate-800 p-8 max-w-xl mx-auto my-12 dir-rtl font-sans">
        <FolderOpen className="w-12 h-12 text-amber-400 mb-4" />
        <h2 className="text-lg font-bold text-slate-100">
          سازمانی یافت نشد
        </h2>
        <p className="text-xs text-slate-400 mt-2 mb-6">
          هیچ سازمان یا فضای یادگیری فعالی برای حساب شما یافت نشد.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="px-6 py-3 bg-[#0f766e] hover:bg-[#0d655e] text-white rounded-xl text-xs font-bold transition-all shadow-lg"
        >
          تازه‌سازی
        </button>
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-[#0f172a]/80 rounded-3xl border border-slate-800 p-8 max-w-xl mx-auto my-12">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
        <h2 className="text-lg font-bold text-slate-100">
          خطا در بارگذاری خلاصه فلش‌کارت‌ها
        </h2>
        <p className="text-xs text-slate-400 mt-2 mb-6">
          امکان برقراری ارتباط با سرور وجود ندارد. لطفا مجددا تلاش نمایید.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="px-6 py-3 bg-[#0f766e] hover:bg-[#0d655e] text-white rounded-xl text-xs font-bold transition-all shadow-lg"
        >
          تلاش مجدد
        </button>
      </div>
    );
  }

  const learnedCardsCount = Math.max(
    0,
    (summary.total_cards || 0) - ((summary.total_due || 0) + (summary.total_new || 0)),
  );

  return (
    <div className="antialiased min-h-screen flex flex-col text-slate-100 bg-[#020617] p-4 md:p-6 relative overflow-hidden font-sans dir-rtl text-right">
      {/* Background Ambient Glow */}
      <div className="fixed top-0 right-0 w-[800px] h-[800px] bg-[#0f766e]/10 rounded-full blur-[120px] pointer-events-none -z-0" />

      <main className="max-w-7xl mx-auto w-full relative z-10 flex-1 flex flex-col space-y-6">
        {/* Header Section */}
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-800/60 pb-6 shrink-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 mb-2 tracking-tight">
              آماده‌سازی مطالعه
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-[#0f766e] shrink-0" />
              <span>سیستم مرور فاصله‌دار هوشمند AVANA بر پایه الگوریتم یادگیری تثبیتی</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-800/40 hover:bg-slate-800/80 text-slate-300 border border-slate-700/50 text-xs font-semibold transition-all shadow-xs"
            >
              <Sliders className="w-4 h-4 text-[#0f766e]" />
              <span>تنظیمات مرور</span>
            </button>

            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-800/40 hover:bg-slate-800/80 text-slate-300 border border-slate-700/50 text-xs font-semibold transition-all shadow-xs"
            >
              <ArrowRight className="w-4 h-4" />
              <span>بازگشت</span>
            </button>
          </div>
        </header>

        {/* Bento Grid Layout */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 md:grid-rows-4 gap-4 pb-4">
          {/* Tile 1: Title / Main Info Tile (Col 1-2, Row 1) */}
          <div className="bg-slate-800/40 hover:bg-slate-800/70 border border-white/5 hover:border-white/10 rounded-3xl p-6 md:col-span-2 md:row-span-1 flex flex-col justify-center relative overflow-hidden transition-all duration-300 group">
            <div className="absolute left-0 top-0 opacity-10 text-[#0f766e] transform scale-[2] -translate-x-4 -translate-y-4 group-hover:scale-[2.2] transition-transform duration-700 pointer-events-none">
              <Brain className="w-32 h-32" />
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-100 mb-1.5 relative z-10">
              هدف امروز شما
            </h2>
            <p className="text-sm text-slate-300 relative z-10 font-medium">
              مرور {activeSelectedCardCount} کارت در {estimatedMinutes} دقیقه. می‌توانید انجامش دهید.
            </p>
          </div>

          {/* Tile 2: Mode: Daily Tile (Col 3, Row 1) */}
          <label
            onClick={() => setSelectedGoal("daily")}
            className={`rounded-3xl p-6 md:col-span-1 md:row-span-1 cursor-pointer relative overflow-hidden flex flex-col justify-between transition-all duration-300 border ${
              selectedGoal === "daily"
                ? "bg-slate-800/80 border-[#0f766e]/70 shadow-lg ring-1 ring-[#0f766e]/30"
                : "bg-slate-800/30 border-white/5 hover:bg-slate-800/60 hover:border-white/10"
            }`}
          >
            <input
              type="radio"
              name="study_mode_bento"
              checked={selectedGoal === "daily"}
              onChange={() => setSelectedGoal("daily")}
              className="sr-only"
            />
            <div className="flex justify-between items-start relative z-10">
              <div className="w-10 h-10 rounded-2xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-[#0f766e]">
                <Calendar className="w-5 h-5" />
              </div>
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selectedGoal === "daily" ? "border-[#0f766e]" : "border-slate-600"
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-[#0f766e] transition-transform ${
                    selectedGoal === "daily" ? "scale-100" : "scale-0"
                  }`}
                />
              </div>
            </div>
            <div className="relative z-10 mt-4">
              <h3 className="text-base font-bold text-slate-100 mb-1">روزانه</h3>
              <p className="text-xs text-slate-400 line-clamp-2">یادگیری پایدار و بلندمدت SRS.</p>
            </div>
          </label>

          {/* Tile 3: Mode: Exam Tile (Col 4, Row 1) */}
          <label
            onClick={() => setSelectedGoal("exam")}
            className={`rounded-3xl p-6 md:col-span-1 md:row-span-1 cursor-pointer relative overflow-hidden flex flex-col justify-between transition-all duration-300 border ${
              selectedGoal === "exam"
                ? "bg-slate-800/80 border-rose-500/70 shadow-lg ring-1 ring-rose-500/30"
                : "bg-slate-800/30 border-white/5 hover:bg-slate-800/60 hover:border-white/10"
            }`}
          >
            <input
              type="radio"
              name="study_mode_bento"
              checked={selectedGoal === "exam"}
              onChange={() => setSelectedGoal("exam")}
              className="sr-only"
            />
            <div className="flex justify-between items-start relative z-10">
              <div className="w-10 h-10 rounded-2xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-rose-400">
                <Flame className="w-5 h-5" />
              </div>
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selectedGoal === "exam" ? "border-rose-500" : "border-slate-600"
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-rose-500 transition-transform ${
                    selectedGoal === "exam" ? "scale-100" : "scale-0"
                  }`}
                />
              </div>
            </div>
            <div className="relative z-10 mt-4">
              <h3 className="text-base font-bold text-slate-100 mb-1">شب امتحان</h3>
              <p className="text-xs text-slate-400 line-clamp-2">مطالعه فشرده برای امتحان</p>
            </div>
          </label>

          {/* Tile 4: Topics / Filters Tile (Col 1-2, Row 2-3) */}
          <div className="bg-slate-800/40 hover:bg-slate-800/70 border border-white/5 hover:border-white/10 rounded-3xl p-6 md:col-span-2 md:row-span-2 flex flex-col transition-all duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Filter className="w-5 h-5 text-[#0f766e]" />
                  <span>فیلتر مباحث</span>
                </h2>
                {selectedGoal === "exam" && (
                  <div className="flex items-center gap-1 text-xs pr-2 border-r border-slate-700">
                    <span className="text-slate-400 text-[11px]">محدودیت:</span>
                    {EXAM_MODE_LIMITS.map((limit) => (
                      <button
                        key={limit}
                        type="button"
                        onClick={() => setExamLimit(limit)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                          examLimit === limit
                            ? "bg-rose-500 text-white border-rose-600"
                            : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                        }`}
                      >
                        {limit === "all" ? "همه" : limit}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={toggleSelectAllTopics}
                className="text-xs font-semibold text-[#80d5cb] hover:text-white bg-[#0f766e]/20 hover:bg-[#0f766e]/40 px-3.5 py-1.5 rounded-full transition-all border border-[#0f766e]/30 self-start sm:self-auto"
              >
                {isAllSelected ? "لغو انتخاب همه" : "انتخاب همه"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 max-h-[300px]">
              <TaxonomySelector
                courses={validCourses}
                selectedCourseIds={selectedCourses}
                selectedModuleIds={selectedModules}
                onSelectionChange={handleTaxonomyChange}
                emptyMessage="برای این دوره هنوز سرفصل یا فلشکارتی ثبت نشده است."
                itemLabelSingular="کارت"
              />
            </div>

            <div className="mt-4 pt-3 border-t border-slate-700/40 text-xs text-slate-400 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-400" />
                <span>
                  {selectedModules.size > 0
                    ? `${selectedModules.size} مبحث انتخاب شده است.`
                    : selectedCourses.size > 0
                    ? `${selectedCourses.size} دوره انتخاب شده است.`
                    : "همه مباحث به صورت پیش‌فرض فعال هستند."}
                </span>
              </div>
              <div className="flex gap-1 text-[10px] text-slate-500">
                <button
                  type="button"
                  onClick={() => {
                    setReviewAheadDays(3);
                    startCustomStudy("review_ahead");
                  }}
                  className="hover:text-slate-300 underline"
                >
                  مرور {reviewAheadDays} روز بعد
                </button>
              </div>
            </div>
          </div>

          {/* Tile 5: Micro-Insight: Forgotten Cards Tile (Col 3, Row 2) */}
          <div
            onClick={() => startCustomStudy("forgotten")}
            className="bg-gradient-to-br from-amber-500/10 via-slate-800/40 to-transparent hover:from-amber-500/20 border border-amber-500/20 rounded-3xl p-6 md:col-span-1 md:row-span-1 flex flex-col justify-center relative overflow-hidden transition-all duration-300 cursor-pointer group"
          >
            <h3 className="text-3xl font-black text-amber-400 mb-1 relative z-10">
              {summary.total_overdue || 0}
            </h3>
            <p className="text-sm font-bold text-slate-100 relative z-10">کارت فراموش شده</p>
            <p className="text-xs text-slate-400 mt-1 relative z-10">
              بیایید این‌ها را امروز برطرف کنیم.
            </p>
          </div>

          {/* Tile 6: Micro-Insight: New Cards Tile (Col 4, Row 2) */}
          <div
            onClick={() => startCustomStudy("new")}
            className="bg-gradient-to-br from-[#0f766e]/10 via-slate-800/40 to-transparent hover:from-[#0f766e]/20 border border-[#0f766e]/20 rounded-3xl p-6 md:col-span-1 md:row-span-1 flex flex-col justify-center relative overflow-hidden transition-all duration-300 cursor-pointer group"
          >
            <h3 className="text-3xl font-black text-[#80d5cb] mb-1 relative z-10">
              {summary.total_new || 0}
            </h3>
            <p className="text-sm font-bold text-slate-100 relative z-10">کارت‌های جدید</p>
            <p className="text-xs text-slate-400 mt-1 relative z-10">آماده برای یادگیری امروز.</p>
          </div>

          {/* Tile 7: Micro-Insight: Needs Review Tile (Col 3, Row 3) */}
          <div
            onClick={() => setSelectedGoal("daily")}
            className="bg-gradient-to-bl from-rose-500/10 via-slate-800/40 to-transparent hover:from-rose-500/20 border border-rose-500/20 rounded-3xl p-6 md:col-span-1 md:row-span-1 flex flex-col justify-center relative overflow-hidden transition-all duration-300 cursor-pointer group"
          >
            <h3 className="text-3xl font-black text-rose-400 mb-1 relative z-10">
              {summary.total_due || 0}
            </h3>
            <p className="text-sm font-bold text-slate-100 relative z-10">نیاز به مرور</p>
            <p className="text-xs text-slate-400 mt-1 relative z-10">زمان یادآوری فرا رسیده است.</p>
          </div>

          {/* Tile 8: Micro-Insight: Learned Tile (Col 4, Row 3) */}
          <div className="bg-gradient-to-tr from-emerald-500/10 via-slate-800/40 to-transparent hover:from-emerald-500/20 border border-emerald-500/20 rounded-3xl p-6 md:col-span-1 md:row-span-1 flex flex-col justify-center relative overflow-hidden transition-all duration-300 group">
            <h3 className="text-3xl font-black text-emerald-400 mb-1 relative z-10">
              {learnedCardsCount}
            </h3>
            <p className="text-sm font-bold text-slate-100 relative z-10">یادگرفته شده</p>
            <p className="text-xs text-emerald-400/80 mt-1 relative z-10">عالی پیش می‌روید!</p>
          </div>

          {/* Tile 9: Massive Start Button Tile (Col 1-4, Row 4) */}
          <button
            type="button"
            onClick={handleStartStudy}
            disabled={activeSelectedCardCount === 0}
            className="rounded-3xl bg-[#0f766e] text-white relative overflow-hidden group shadow-[0px_8px_32px_rgba(15,118,110,0.3)] hover:shadow-[0px_16px_48px_rgba(15,118,110,0.5)] transition-all duration-500 transform hover:scale-[1.01] md:col-span-4 h-24 p-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {/* Dynamic Background Effects */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0d655e] to-[#0f766e] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute -left-20 top-1/2 -translate-y-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700 pointer-events-none" />

            <div className="relative z-10 w-full h-full flex items-center justify-between px-6">
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm group-hover:scale-110 transition-transform duration-300 shrink-0">
                  <Play className="w-8 h-8 text-white fill-white mr-1" />
                </div>
                <div className="text-right">
                  <h2 className="text-xl sm:text-2xl font-black mb-1">
                    {selectedGoal === "exam" ? "شروع مرور فشرده امتحان" : "شروع مطالعه"}
                  </h2>
                  <p className="text-teal-200 text-xs sm:text-sm font-semibold">
                    ~{estimatedMinutes} دقیقه زمان تخمینی
                  </p>
                </div>
              </div>

              <div className="hidden sm:flex flex-col text-left opacity-90">
                <span className="text-xs text-teal-100">کل کارت‌های انتخاب شده</span>
                <span className="text-2xl font-black">{activeSelectedCardCount}</span>
              </div>
            </div>
          </button>
        </div>
      </main>

      {/* Limits Modal */}
      {showSettings && (
        <div
          id="limits-modal"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex items-center gap-3 text-[#0f766e]">
              <Sliders className="w-6 h-6" />
              <h2 className="text-lg font-bold text-slate-100">تنظیم محدودیت‌های مطالعه</h2>
            </div>

            <div className="space-y-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-300">
                  محدودیت کارت‌های جدید روزانه
                </label>
                <input
                  type="number"
                  value={dailyNewCardsLimit}
                  onChange={(e) => setDailyNewCardsLimit(Number(e.target.value))}
                  className="bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:ring-2 focus:ring-[#0f766e] focus:border-transparent outline-none text-sm"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-300">
                  محدودیت مرور روزانه
                </label>
                <input
                  type="number"
                  value={dailyMaxReviewsLimit}
                  onChange={(e) => setDailyMaxReviewsLimit(Number(e.target.value))}
                  className="bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:ring-2 focus:ring-[#0f766e] focus:border-transparent outline-none text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="flex-1 py-3 bg-[#0f766e] hover:bg-[#0d655e] text-white rounded-xl font-bold transition-colors text-sm shadow-md"
              >
                ذخیره تغییرات
              </button>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition-colors text-sm"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
