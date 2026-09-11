import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  AlertCircle,
  Filter,
  Play,
  ArrowRight,
  Brain,
  FolderOpen,
  Flame,
  Info,
  Sliders,
} from "lucide-react";
import { Card, Button, LoadingState } from "@avana/ui";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createStudyApi } from "../lib/api/study.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createDocumentsApi } from "../lib/api/documents.js";
import { useAuth } from "../providers/AuthProvider.js";
import { TaxonomySelector } from "../components/study/TaxonomySelector.js";
import { UnfinishedSessionsList } from "../components/flashcards/UnfinishedSessionsList.js";
import { toPersianDigits } from "@avana/domain";

const EXAM_MODE_LIMITS = [20, 50, 100, 200, "all"] as const;
type ExamLimit = (typeof EXAM_MODE_LIMITS)[number];

export function FlashcardsPage() {
  const { memberships, isLoading: isAuthLoading } = useAuth();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const orgApi = createOrganizationApi(apiClient);
  const studyApi = createStudyApi(apiClient);
  const docApi = createDocumentsApi(apiClient);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());

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
    lessonIds?: Set<string>;
  }) => {
    setSelectedCourses(selection.courseIds);
    setSelectedModules(selection.moduleIds);
    if (selection.lessonIds) {
      setSelectedLessons(selection.lessonIds);
    }
  };

  // Build clean taxonomy tree filtering out modules and lessons with 0 flashcards while retaining courses with total_cards > 0
  const validCourses = useMemo(() => {
    type RawFlashcardLesson = {
      lesson_id?: string;
      id?: string;
      title?: string;
      total_cards?: number;
      itemCount?: number;
    };
    type RawFlashcardModule = {
      module_id?: string;
      id?: string;
      title?: string;
      total_cards?: number;
      itemCount?: number;
      lessons?: RawFlashcardLesson[];
    };
    type RawFlashcardCourse = {
      course_id?: string;
      id?: string;
      title?: string;
      total_cards?: number;
      itemCount?: number;
      modules?: RawFlashcardModule[];
    };

    const rawCourses = summary?.courses as RawFlashcardCourse[] | undefined;
    if (!rawCourses) return [];
    return rawCourses
      .map((c: RawFlashcardCourse) => {
        const rawModules = c.modules;
        const validModules = (rawModules || [])
          .filter((m: RawFlashcardModule) => (m.total_cards ?? m.itemCount ?? 0) > 0)
          .map((m: RawFlashcardModule) => {
            const rawLessons = m.lessons;
            const validLessons = (rawLessons || [])
              .filter((l: RawFlashcardLesson) => (l.total_cards ?? l.itemCount ?? 0) > 0)
              .map((l: RawFlashcardLesson) => ({
                id: l.lesson_id || l.id || "",
                title: l.title || "",
                itemCount: l.total_cards ?? l.itemCount,
              }));
            return {
              id: m.module_id || m.id || "",
              title: m.title || "",
              itemCount: m.total_cards ?? m.itemCount,
              lessons: validLessons,
            };
          });
        return {
          id: c.course_id || c.id || "",
          title: c.title || "",
          itemCount: c.total_cards ?? c.itemCount,
          modules: validModules,
        };
      })
      .filter((c: { itemCount?: number }) => (c.itemCount ?? 0) > 0);
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

  const [isStartingSession, setIsStartingSession] = useState(false);

  const startStudySession = async (
    mode: "daily" | "exam" | "custom",
    options?: {
      customMode?: "weak" | "forgotten" | "review_ahead" | "new";
      aheadDays?: number;
      limit?: number;
      specificCourseId?: string;
    },
  ) => {
    if (!organizationId || isStartingSession) return;
    setIsStartingSession(true);

    try {
      const courseIds = options?.specificCourseId
        ? [options.specificCourseId]
        : Array.from(selectedCourses);
      const moduleIds = Array.from(selectedModules);
      const lessonIds = Array.from(selectedLessons);

      const res = await studyApi.createFlashcardStudySession(organizationId, {
        courseIds: courseIds.length > 0 ? courseIds : undefined,
        moduleIds: moduleIds.length > 0 ? moduleIds : undefined,
        lessonIds: lessonIds.length > 0 ? lessonIds : undefined,
        mode: mode === "daily" ? "daily" : mode === "exam" ? "exam" : "custom",
        customMode: options?.customMode,
        aheadDays: options?.aheadDays,
        limit: options?.limit,
      });

      if (res?.session?.id) {
        void queryClient.invalidateQueries({
          queryKey: ["flashcard-sessions", organizationId],
        });
        navigate(`/flashcards/review?sessionId=${res.session.id}`);
      } else {
        const params = buildQueryParams();
        if (mode === "exam") {
          params.set("mode", "exam");
          if (options?.limit) params.set("limit", String(options.limit));
        } else if (mode === "custom") {
          params.set("mode", "custom");
          if (options?.customMode) params.set("customMode", options.customMode);
          if (options?.aheadDays) params.set("aheadDays", String(options.aheadDays));
        }
        navigate(`/flashcards/review?${params.toString()}`);
      }
    } catch {
      const params = buildQueryParams();
      if (mode === "exam") {
        params.set("mode", "exam");
        if (options?.limit) params.set("limit", String(options.limit));
      } else if (mode === "custom") {
        params.set("mode", "custom");
        if (options?.customMode) params.set("customMode", options.customMode);
        if (options?.aheadDays) params.set("aheadDays", String(options.aheadDays));
      }
      navigate(`/flashcards/review?${params.toString()}`);
    } finally {
      setIsStartingSession(false);
    }
  };

  const startNormalReview = (specificCourseId?: string) => {
    void startStudySession("daily", { specificCourseId });
  };

  const startExamMode = () => {
    const limitNum = typeof examLimit === "number" ? examLimit : undefined;
    void startStudySession("exam", { limit: limitNum });
  };

  const startCustomStudy = (mode: "weak" | "forgotten" | "review_ahead" | "new") => {
    void startStudySession("custom", {
      customMode: mode,
      aheadDays: mode === "review_ahead" ? reviewAheadDays : undefined,
    });
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
        <LoadingState message="در حال بارگذاری خلاصه فلش‌کارت‌ها..." />
      </div>
    );
  }

  if (!organizationId) {
    return (
      <Card variant="solid" className="flex flex-col items-center justify-center py-16 text-center bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] p-8 max-w-xl mx-auto my-12 dir-rtl font-sans shadow-[var(--shadow-card)]">
        <FolderOpen className="w-12 h-12 text-[var(--color-warning)] mb-4" />
        <h2 className="text-lg font-bold text-[var(--color-text)]">
          سازمانی یافت نشد
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-2 mb-6">
          هیچ سازمان یا فضای یادگیری فعالی برای حساب شما یافت نشد.
        </p>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => void refetch()}
          className="rounded-[10px]"
        >
          تازه‌سازی
        </Button>
      </Card>
    );
  }

  if (isError || !summary) {
    return (
      <Card variant="solid" className="flex flex-col items-center justify-center py-16 text-center bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] p-8 max-w-xl mx-auto my-12 dir-rtl font-sans shadow-[var(--shadow-card)]">
        <AlertCircle className="w-12 h-12 text-[var(--color-error)] mb-4" />
        <h2 className="text-lg font-bold text-[var(--color-text)]">
          خطا در بارگذاری خلاصه فلش‌کارت‌ها
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-2 mb-6">
          امکان برقراری ارتباط با سرور وجود ندارد. لطفا مجددا تلاش نمایید.
        </p>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => void refetch()}
          className="rounded-[10px]"
        >
          تلاش مجدد
        </Button>
      </Card>
    );
  }

  const learnedCardsCount = Math.max(
    0,
    (summary.total_cards || 0) - ((summary.total_due || 0) + (summary.total_new || 0)),
  );

  return (
    <div className="antialiased min-h-screen flex flex-col text-[var(--color-text)] bg-[var(--color-bg)] p-4 md:p-6 relative overflow-hidden font-sans dir-rtl text-right">
      <main className="max-w-7xl mx-auto w-full relative z-10 flex-1 flex flex-col space-y-4">
        {/* Header Section */}
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[var(--color-border)] pb-6 shrink-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text)] mb-2 tracking-tight">
              آماده‌سازی مطالعه
            </h1>
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
              <span>سیستم مرور فاصله‌دار هوشمند AVANA بر پایه الگوریتم یادگیری تثبیتی</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(true)}
              className="rounded-[10px] gap-2 text-xs font-semibold"
            >
              <Sliders className="w-4 h-4 text-[var(--color-primary)]" />
              <span>تنظیمات مرور</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate(-1)}
              className="rounded-[10px] gap-2 text-xs font-semibold"
            >
              <ArrowRight className="w-4 h-4" />
              <span>بازگشت</span>
            </Button>
          </div>
        </header>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Tile 1: Title / Main Info Tile (Col 1-2, Row 1) */}
          <div className="bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-[16px] p-6 md:col-span-2 md:row-span-1 flex flex-col justify-center relative overflow-hidden transition-all duration-300 group shadow-[var(--shadow-card)]">
            <div className="absolute left-0 top-0 opacity-10 text-[var(--color-primary)] transform scale-[2] -translate-x-4 -translate-y-4 group-hover:scale-[2.2] transition-transform duration-700 pointer-events-none">
              <Brain className="w-32 h-32" />
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text)] mb-1.5 relative z-10">
              هدف امروز شما
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] relative z-10 font-medium">
              مرور {toPersianDigits(activeSelectedCardCount)} کارت در {toPersianDigits(estimatedMinutes)} دقیقه. می‌توانید انجامش دهید.
            </p>
          </div>

          {/* Tile 2: Mode: Daily Tile (Col 3, Row 1) */}
          <label
            onClick={() => setSelectedGoal("daily")}
            className={`rounded-[16px] p-6 md:col-span-1 md:row-span-1 cursor-pointer relative overflow-hidden flex flex-col justify-between transition-all duration-300 border ${
              selectedGoal === "daily"
                ? "bg-[var(--color-surface)] border-[var(--color-primary)] shadow-[var(--shadow-card)] ring-1 ring-[var(--color-primary)]"
                : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
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
              <div className="w-10 h-10 rounded-[10px] bg-[var(--color-primary-soft)] flex items-center justify-center text-[var(--color-primary)]">
                <Calendar className="w-5 h-5" />
              </div>
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selectedGoal === "daily" ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-[var(--color-primary)] transition-transform ${
                    selectedGoal === "daily" ? "scale-100" : "scale-0"
                  }`}
                />
              </div>
            </div>
            <div className="relative z-10 mt-4">
              <h3 className="text-base font-bold text-[var(--color-text)] mb-1">روزانه</h3>
              <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">یادگیری پایدار و بلندمدت SRS.</p>
            </div>
          </label>

          {/* Tile 3: Mode: Exam Tile (Col 4, Row 1) */}
          <label
            onClick={() => setSelectedGoal("exam")}
            className={`rounded-[16px] p-6 md:col-span-1 md:row-span-1 cursor-pointer relative overflow-hidden flex flex-col justify-between transition-all duration-300 border ${
              selectedGoal === "exam"
                ? "bg-[var(--color-surface)] border-[var(--color-error)] shadow-[var(--shadow-card)] ring-1 ring-[var(--color-error)]"
                : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-error)]"
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
              <div className="w-10 h-10 rounded-[10px] bg-[var(--color-error-soft)] flex items-center justify-center text-[var(--color-error)]">
                <Flame className="w-5 h-5" />
              </div>
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selectedGoal === "exam" ? "border-[var(--color-error)]" : "border-[var(--color-border)]"
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-[var(--color-error)] transition-transform ${
                    selectedGoal === "exam" ? "scale-100" : "scale-0"
                  }`}
                />
              </div>
            </div>
            <div className="relative z-10 mt-4">
              <h3 className="text-base font-bold text-[var(--color-text)] mb-1">شب امتحان</h3>
              <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">مطالعه فشرده برای امتحان</p>
            </div>
          </label>

          {/* Tile 4: Topics / Filters Tile (Col 1-2, Row 2-3) */}
          <div className="bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-[16px] p-6 md:col-span-2 md:row-span-2 flex flex-col transition-all duration-300 shadow-[var(--shadow-card)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                  <Filter className="w-5 h-5 text-[var(--color-primary)]" />
                  <span>فیلتر مباحث</span>
                </h2>
                {selectedGoal === "exam" && (
                  <div className="flex items-center gap-1 text-xs pe-2 border-s border-[var(--color-border)]">
                    <span className="text-[var(--color-text-muted)] text-[11px]">محدودیت:</span>
                    {EXAM_MODE_LIMITS.map((limit) => (
                      <button
                        key={limit}
                        type="button"
                        onClick={() => setExamLimit(limit)}
                        className={`px-1.5 py-0.5 rounded-[6px] text-[10px] font-bold border transition-colors cursor-pointer ${
                          examLimit === limit
                            ? "bg-[var(--color-error)] text-white border-[var(--color-error)]"
                            : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
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
                className="text-xs font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] bg-[var(--color-primary-soft)] hover:bg-[var(--color-primary-light)] px-3.5 py-1.5 rounded-full transition-all border border-[var(--color-primary-muted)] self-start sm:self-auto cursor-pointer"
              >
                {isAllSelected ? "لغو انتخاب همه" : "انتخاب همه"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pe-1 max-h-[300px]">
              <TaxonomySelector
                courses={validCourses}
                selectedCourseIds={selectedCourses}
                selectedModuleIds={selectedModules}
                selectedLessonIds={selectedLessons}
                onSelectionChange={handleTaxonomyChange}
                emptyMessage="برای این دوره هنوز سرفصل یا فلشکارتی ثبت نشده است."
                itemLabelSingular="کارت"
              />
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[var(--color-text-muted)]" />
                <span>
                  {selectedModules.size > 0
                    ? `${selectedModules.size} مبحث انتخاب شده است.`
                    : selectedCourses.size > 0
                    ? `${selectedCourses.size} دوره انتخاب شده است.`
                    : "همه مباحث به صورت پیش‌فرض فعال هستند."}
                </span>
              </div>
              <div className="flex gap-1 text-[10px] text-[var(--color-text-muted)]">
                <button
                  type="button"
                  onClick={() => {
                    setReviewAheadDays(3);
                    startCustomStudy("review_ahead");
                  }}
                  className="hover:text-[var(--color-text)] underline cursor-pointer"
                >
                  مرور {reviewAheadDays} روز بعد
                </button>
              </div>
            </div>
          </div>

          {/* Tile 5: Micro-Insight: Forgotten Cards Tile (Col 3, Row 2) */}
          <div
            onClick={() => startCustomStudy("forgotten")}
            className="bg-[var(--color-warning-soft)] border border-[var(--color-warning-muted)] rounded-[16px] p-6 md:col-span-1 md:row-span-1 flex flex-col justify-center relative overflow-hidden transition-all duration-300 cursor-pointer group shadow-[var(--shadow-subtle)]"
          >
            <h3 className="text-3xl font-black text-[var(--color-warning)] mb-1 relative z-10">
              {summary.total_overdue || 0}
            </h3>
            <p className="text-sm font-bold text-[var(--color-text)] relative z-10">کارت فراموش شده</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 relative z-10">
              بیایید این‌ها را امروز برطرف کنیم.
            </p>
          </div>

          {/* Tile 6: Micro-Insight: New Cards Tile (Col 4, Row 2) */}
          <div
            onClick={() => startCustomStudy("new")}
            className="bg-[var(--color-primary-soft)] border border-[var(--color-primary-muted)] rounded-[16px] p-6 md:col-span-1 md:row-span-1 flex flex-col justify-center relative overflow-hidden transition-all duration-300 cursor-pointer group shadow-[var(--shadow-subtle)]"
          >
            <h3 className="text-3xl font-black text-[var(--color-primary)] mb-1 relative z-10">
              {summary.total_new || 0}
            </h3>
            <p className="text-sm font-bold text-[var(--color-text)] relative z-10">کارت‌های جدید</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 relative z-10">آماده برای یادگیری امروز.</p>
          </div>

          {/* Tile 7: Micro-Insight: Needs Review Tile (Col 3, Row 3) */}
          <div
            onClick={() => setSelectedGoal("daily")}
            className="bg-[var(--color-error-soft)] border border-[var(--color-error-muted)] rounded-[16px] p-6 md:col-span-1 md:row-span-1 flex flex-col justify-center relative overflow-hidden transition-all duration-300 cursor-pointer group shadow-[var(--shadow-subtle)]"
          >
            <h3 className="text-3xl font-black text-[var(--color-error)] mb-1 relative z-10">
              {summary.total_due || 0}
            </h3>
            <p className="text-sm font-bold text-[var(--color-text)] relative z-10">نیاز به مرور</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 relative z-10">زمان یادآوری فرا رسیده است.</p>
          </div>

          {/* Tile 8: Micro-Insight: Learned Tile (Col 4, Row 3) */}
          <div className="bg-[var(--color-success-soft)] border border-[var(--color-success-muted)] rounded-[16px] p-6 md:col-span-1 md:row-span-1 flex flex-col justify-center relative overflow-hidden transition-all duration-300 shadow-[var(--shadow-subtle)] group">
            <h3 className="text-3xl font-black text-[var(--color-success)] mb-1 relative z-10">
              {learnedCardsCount}
            </h3>
            <p className="text-sm font-bold text-[var(--color-text)] relative z-10">یادگرفته شده</p>
            <p className="text-xs text-[var(--color-success)] mt-1 relative z-10">عالی پیش می‌روید!</p>
          </div>

          {/* Tile 9: Massive Start Button Tile (Col 1-4, Row 4) */}
          <button
            type="button"
            onClick={handleStartStudy}
            disabled={activeSelectedCardCount === 0}
            className="rounded-[16px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] text-white relative overflow-hidden group shadow-[var(--shadow-card)] hover:shadow-lg transition-all duration-300 md:col-span-4 h-24 p-4 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <div className="relative z-10 w-full h-full flex items-center justify-between px-6">
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 rounded-[10px] bg-white/20 flex items-center justify-center backdrop-blur-xs group-hover:scale-110 transition-transform duration-300 shrink-0">
                  <Play className="w-8 h-8 text-white fill-white me-1" />
                </div>
                <div className="text-right">
                  <h2 className="text-xl sm:text-2xl font-black mb-1 text-white">
                    {selectedGoal === "exam" ? "شروع مرور فشرده امتحان" : "شروع مطالعه"}
                  </h2>
                  <p className="text-white/80 text-xs sm:text-sm font-semibold">
                    ~{estimatedMinutes} دقیقه زمان تخمینی
                  </p>
                </div>
              </div>

              <div className="hidden sm:flex flex-col text-left opacity-90">
                <span className="text-xs text-white/80">کل کارت‌های انتخاب شده</span>
                <span className="text-2xl font-black text-white">{activeSelectedCardCount}</span>
              </div>
            </div>
          </button>
        </div>

        {/* Separator Divider */}
        <div className="w-full border-t border-[var(--color-border)] my-2" />

        {/* Unfinished Study Sessions List (Resume Previous Sessions) */}
        <UnfinishedSessionsList
          organizationId={organizationId}
          onSelectSession={(sessionId) =>
            navigate(`/flashcards/review?sessionId=${sessionId}`)
          }
          className="w-full"
        />
      </main>

      {/* Limits Modal */}
      {showSettings && (
        <div
          id="limits-modal"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
        >
          <Card variant="solid" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[20px] p-8 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex items-center gap-3 text-[var(--color-primary)]">
              <Sliders className="w-6 h-6" />
              <h2 className="text-lg font-bold text-[var(--color-text)]">تنظیم محدودیت‌های مطالعه</h2>
            </div>

            <div className="space-y-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                  محدودیت کارت‌های جدید روزانه
                </label>
                <input
                  type="number"
                  value={dailyNewCardsLimit}
                  onChange={(e) => setDailyNewCardsLimit(Number(e.target.value))}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[10px] px-4 py-2.5 text-[var(--color-text)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] outline-none text-sm"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                  محدودیت مرور روزانه
                </label>
                <input
                  type="number"
                  value={dailyMaxReviewsLimit}
                  onChange={(e) => setDailyMaxReviewsLimit(Number(e.target.value))}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[10px] px-4 py-2.5 text-[var(--color-text)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] outline-none text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => setShowSettings(false)}
                className="flex-1 rounded-[10px] font-bold text-sm shadow-md"
              >
                ذخیره تغییرات
              </Button>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => setShowSettings(false)}
                className="flex-1 rounded-[10px] font-semibold text-sm"
              >
                انصراف
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
