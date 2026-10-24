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
  BookOpen,
} from "lucide-react";
import { Card, Button, LoadingState, Badge } from "@avana/ui";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createStudyApi } from "../lib/api/study.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createDocumentsApi } from "../lib/api/documents.js";
import { useAuth } from "../providers/AuthProvider.js";
import { TaxonomySelector } from "../components/study/TaxonomySelector.js";
import { UnfinishedSessionsList } from "../components/flashcards/UnfinishedSessionsList.js";
import {
  toPersianDigits,
  FLASHCARD_DEFAULT_DAILY_NEW_LIMIT,
  FLASHCARD_DEFAULT_DAILY_REVIEW_LIMIT,
} from "@avana/domain";

const EXAM_MODE_LIMITS = [20, 50, 100, 200, "all"] as const;
type ExamLimit = (typeof EXAM_MODE_LIMITS)[number];

type RawFlashcardLesson = {
  lesson_id?: string;
  id?: string;
  title?: string;
  total_cards?: number;
  due_cards?: number;
  new_cards?: number;
  learning_cards?: number;
  overdue_cards?: number;
  itemCount?: number;
};

type RawFlashcardModule = {
  module_id?: string;
  id?: string;
  title?: string;
  total_cards?: number;
  due_cards?: number;
  new_cards?: number;
  learning_cards?: number;
  overdue_cards?: number;
  itemCount?: number;
  lessons?: RawFlashcardLesson[];
};

type RawFlashcardCourse = {
  course_id?: string;
  id?: string;
  title?: string;
  total_cards?: number;
  due_cards?: number;
  new_cards?: number;
  learning_cards?: number;
  overdue_cards?: number;
  itemCount?: number;
  modules?: RawFlashcardModule[];
};

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
  const [dailyNewCardsLimit, setDailyNewCardsLimit] = useState<number>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = window.localStorage.getItem("avana_flashcards_new_limit");
      if (saved && !isNaN(Number(saved)) && Number(saved) > 0) {
        return Number(saved);
      }
    }
    return FLASHCARD_DEFAULT_DAILY_NEW_LIMIT;
  });
  const [dailyMaxReviewsLimit, setDailyMaxReviewsLimit] = useState<number>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = window.localStorage.getItem("avana_flashcards_review_limit");
      if (saved && !isNaN(Number(saved)) && Number(saved) > 0) {
        return Number(saved);
      }
    }
    return FLASHCARD_DEFAULT_DAILY_REVIEW_LIMIT;
  });

  const handleSaveSettings = () => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem("avana_flashcards_new_limit", String(dailyNewCardsLimit));
      window.localStorage.setItem("avana_flashcards_review_limit", String(dailyMaxReviewsLimit));
    }
    setShowSettings(false);
  };

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

  const modulelessCourseIds = useMemo(() => {
    return validCourses
      .filter((c) => c.modules.length === 0)
      .map((c) => c.id);
  }, [validCourses]);

  const isAllSelected = useMemo(() => {
    if (validCourses.length === 0) return false;

    const allModulesSelected =
      allModuleIds.size === 0 || selectedModules.size === allModuleIds.size;
    const allModulelessCoursesSelected =
      modulelessCourseIds.length === 0 ||
      modulelessCourseIds.every((id) => selectedCourses.has(id));

    return allModulesSelected && allModulelessCoursesSelected;
  }, [selectedModules, selectedCourses, allModuleIds, modulelessCourseIds, validCourses.length]);

  // Compute scoped stats for the 4 insight tiles based on taxonomy selection
  const scopedStats = useMemo(() => {
    if (!summary) {
      return { overdue: 0, newCards: 0, due: 0, learned: 0, totalCards: 0 };
    }

    const isAll =
      (selectedCourses.size === 0 &&
        selectedModules.size === 0 &&
        selectedLessons.size === 0) ||
      isAllSelected;

    if (isAll) {
      const totalCards = summary.total_cards || 0;
      const due = summary.total_due || 0;
      const newCards = summary.total_new || 0;
      const overdue = summary.total_overdue || 0;
      const learned = Math.max(0, totalCards - (due + newCards));
      return { overdue, newCards, due, learned, totalCards };
    }

    const rawCourses = summary.courses as RawFlashcardCourse[] | undefined;
    if (!rawCourses || rawCourses.length === 0) {
      return { overdue: 0, newCards: 0, due: 0, learned: 0, totalCards: 0 };
    }

    let totalCards = 0;
    let due = 0;
    let newCards = 0;
    let overdue = 0;

    for (const course of rawCourses) {
      const courseId = course.course_id || course.id || "";
      const isCourseSelected = selectedCourses.has(courseId);

      if (isCourseSelected) {
        // Entire course is selected: include its total stats (no double counting)
        totalCards += course.total_cards || 0;
        due += course.due_cards || 0;
        newCards += course.new_cards || 0;
        overdue += course.overdue_cards || 0;
      } else if (course.modules && course.modules.length > 0) {
        // Individual modules or lessons within the course may be selected
        for (const mod of course.modules) {
          const moduleId = mod.module_id || mod.id || "";
          const isModuleSelected = selectedModules.has(moduleId);

          if (isModuleSelected) {
            // Entire module is selected
            totalCards += mod.total_cards || 0;
            due += mod.due_cards || 0;
            newCards += mod.new_cards || 0;
            overdue += mod.overdue_cards || 0;
          } else if (mod.lessons && mod.lessons.length > 0) {
            // Specific lessons in the module may be selected
            for (const les of mod.lessons) {
              const lessonId = les.lesson_id || les.id || "";
              if (selectedLessons.has(lessonId)) {
                totalCards += les.total_cards || 0;
                due += les.due_cards || 0;
                newCards += les.new_cards || 0;
                overdue += les.overdue_cards || 0;
              }
            }
          }
        }
      }
    }

    const learned = Math.max(0, totalCards - (due + newCards));
    return { overdue, newCards, due, learned, totalCards };
  }, [
    summary,
    selectedCourses,
    selectedModules,
    selectedLessons,
    isAllSelected,
  ]);

  const toggleSelectAllTopics = () => {
    if (isAllSelected) {
      setSelectedCourses(new Set());
      setSelectedModules(new Set());
      setSelectedLessons(new Set());
    } else {
      setSelectedCourses(new Set(allCourseIds));
      setSelectedModules(new Set(allModuleIds));
      const allLessons = new Set<string>();
      for (const c of validCourses) {
        for (const m of c.modules) {
          if (m.lessons) {
            for (const l of m.lessons) allLessons.add(l.id);
          }
        }
      }
      setSelectedLessons(allLessons);
    }
  };

  // List of courses that have at least one selected module or are directly selected
  const selectedCoursesList = useMemo(() => {
    return validCourses.filter(
      (c) =>
        selectedCourses.has(c.id) ||
        c.modules.some((m) => selectedModules.has(m.id)),
    );
  }, [validCourses, selectedCourses, selectedModules]);

  // Compute active selected card count
  const activeSelectedCardCount = useMemo(() => {
    if (!summary) return 0;
    if (selectedModules.size > 0 || selectedCourses.size > 0) {
      let count = 0;
      for (const course of validCourses) {
        if (selectedCourses.has(course.id)) {
          count += course.itemCount || 0;
        } else {
          for (const module of course.modules) {
            if (selectedModules.has(module.id)) {
              count += module.itemCount || 0;
            }
          }
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

  const [isStartingSession, setIsStartingSession] = useState(false);

  const startStudySession = async (
    mode: "daily" | "exam" | "custom",
    options?: {
      customMode?: "weak" | "forgotten" | "overdue" | "review_ahead" | "new" | "due" | "learned";
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
      }
    } catch (err) {
      console.error("Failed to create flashcard study session:", err);
    } finally {
      setIsStartingSession(false);
    }
  };

  const startNormalReview = (specificCourseId?: string) => {
    void startStudySession("daily", {
      specificCourseId,
      limit: dailyMaxReviewsLimit,
    });
  };

  const startExamMode = () => {
    // قابلیت شب امتحان موقتاً غیرفعال است (حالت به‌زودی)
    return;
  };

  const startCustomStudy = (mode: "weak" | "forgotten" | "overdue" | "review_ahead" | "new" | "due" | "learned") => {
    const limit = mode === "new" ? dailyNewCardsLimit : dailyMaxReviewsLimit;
    void startStudySession("custom", {
      customMode: mode,
      aheadDays: mode === "review_ahead" ? reviewAheadDays : undefined,
      limit,
    });
  };

  const handleStartStudy = () => {
    if (selectedGoal === "exam") {
      return;
    }
    startNormalReview();
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

  const learnedCardsCount = scopedStats.learned;

  return (
    <div className="antialiased min-h-screen flex flex-col text-[var(--color-text)] bg-[var(--color-bg)] p-4 md:p-6 relative overflow-hidden font-sans dir-rtl text-right">
      <main className="max-w-7xl mx-auto w-full relative z-10 flex-1 flex flex-col space-y-4">
        {/* Header Section */}
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[var(--color-border)] pb-6 shrink-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text)] mb-2 tracking-tight text-center sm:text-right">
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

        {/* Top Section: Goal & Study Mode */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Tile 1: Goal */}
          <div className="bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-[16px] p-6 md:col-span-2 flex flex-col justify-center relative overflow-hidden transition-all duration-300 group shadow-[var(--shadow-card)]">
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

          {/* Tile 2: Mode Selector (Daily & Exam) */}
          <div className="grid grid-cols-2 gap-3 md:col-span-1">
            <label
              onClick={() => setSelectedGoal("daily")}
              className={`rounded-[16px] p-4 cursor-pointer relative overflow-hidden flex flex-col justify-between transition-all duration-300 border ${
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
                <div className="w-8 h-8 rounded-[8px] bg-[var(--color-primary-soft)] flex items-center justify-center text-[var(--color-primary)]">
                  <Calendar className="w-4 h-4" />
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selectedGoal === "daily" ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"
                  }`}
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] transition-transform ${
                      selectedGoal === "daily" ? "scale-100" : "scale-0"
                    }`}
                  />
                </div>
              </div>
              <div className="relative z-10 mt-2">
                <h3 className="text-sm font-bold text-[var(--color-text)] mb-0.5">روزانه</h3>
                <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-1">یادگیری پایدار SRS</p>
              </div>
            </label>

            <div
              aria-disabled="true"
              className="rounded-[16px] p-4 relative overflow-hidden flex flex-col justify-between transition-all duration-300 border bg-[var(--color-surface)] border-[var(--color-border)] opacity-75 cursor-not-allowed select-none"
            >
              <div className="flex justify-between items-start relative z-10">
                <div className="w-8 h-8 rounded-[8px] bg-[var(--color-error-soft)]/50 flex items-center justify-center text-[var(--color-error)]/70">
                  <Flame className="w-4 h-4" />
                </div>
                <Badge variant="warning" size="sm" className="font-bold pointer-events-none text-[10px]">
                  به‌زودی
                </Badge>
              </div>
              <div className="relative z-10 mt-2">
                <h3 className="text-sm font-bold text-[var(--color-text-muted)] mb-0.5">شب امتحان</h3>
                <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-1">مطالعه فشرده</p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 1: Course & Topic Two-Panel Selector (Aligned with Exam Settings) */}
        <section className="bg-[var(--color-surface)] rounded-2xl p-6 md:p-8 border border-[var(--color-border)] shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <BookOpen className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
                    مباحث و دوره‌های مطالعه
                  </h2>
                  <Badge variant="primary" size="sm">
                    {toPersianDigits(validCourses.length)} دوره
                  </Badge>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  دوره و سرفصل‌های مورد نظر خود را برای مرور فاصله‌دار هوشمند انتخاب کنید
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAllTopics}
                aria-label={isAllSelected ? "لغو انتخاب همه مباحث" : "انتخاب همه مباحث"}
                className="text-xs font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] bg-[var(--color-primary-soft)] hover:bg-[var(--color-primary-light)] px-3.5 py-1.5 rounded-full transition-all border border-[var(--color-primary-muted)] self-start sm:self-auto cursor-pointer"
              >
                {isAllSelected ? "لغو انتخاب همه" : "انتخاب همه"}
              </button>
            </div>
          </div>

          <TaxonomySelector
            courses={validCourses}
            selectedCourseIds={selectedCourses}
            selectedModuleIds={selectedModules}
            selectedLessonIds={selectedLessons}
            onSelectionChange={handleTaxonomyChange}
            emptyMessage="برای این دوره هنوز سرفصل یا فلشکارتی ثبت نشده است."
            itemLabelSingular="کارت"
            hideLessons={true}
            enableCourseSearch={validCourses.length > 2}
            courseSearchPlaceholder="جست‌وجوی دوره..."
            layout="two-panel"
          />
        </section>

        {/* Section 2: Full-Width Study Settings Summary & Actions (Aligned with Exam Settings Box 2) */}
        <section className="bg-[var(--color-surface)] rounded-2xl p-6 md:p-8 border-t-4 border-t-[var(--color-primary)] border border-[var(--color-border)] shadow-xs space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <Sliders className="w-5 h-5" />
              </span>
              <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
                خلاصه انتخاب و کارت‌های آماده مطالعه
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setReviewAheadDays(3);
                  startCustomStudy("review_ahead");
                }}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] underline cursor-pointer"
              >
                مرور {toPersianDigits(reviewAheadDays)} روز بعد
              </button>
            </div>
          </div>

          {/* Part A: Summary Stats Badges */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <div className="py-2.5 px-3 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] text-center flex items-center justify-center">
                <span className="text-sm sm:text-base font-bold font-mono text-[var(--color-text)]">
                  {toPersianDigits(selectedCoursesList.length > 0 ? selectedCoursesList.length : validCourses.length)} دوره
                </span>
              </div>
              <div className="py-2.5 px-3 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] text-center flex items-center justify-center">
                <span className="text-sm sm:text-base font-bold font-mono text-[var(--color-primary)]">
                  {toPersianDigits(selectedModules.size > 0 ? selectedModules.size : allModuleIds.size)} فصل
                </span>
              </div>
              <div className="py-2.5 px-3 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] text-center flex items-center justify-center">
                <span className="text-sm sm:text-base font-bold font-mono text-[#2a624b]">
                  {toPersianDigits(activeSelectedCardCount)} کارت
                </span>
              </div>
              <div className="py-2.5 px-3 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] text-center flex items-center justify-center">
                <span className="text-sm sm:text-base font-bold font-mono text-[var(--color-text)]">
                  ⏱ {toPersianDigits(estimatedMinutes)} دقیقه
                </span>
              </div>
            </div>

            {/* Direct Topics Display */}
            {selectedCoursesList.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {selectedCoursesList.map((c) => {
                  const count = c.modules.filter((m) => selectedModules.has(m.id)).length;
                  return (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text)]"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                      <span className="font-semibold">{c.title}:</span>
                      <span className="text-[var(--color-primary)] font-bold font-mono">
                        {c.modules.length > 0
                          ? `${toPersianDigits(count)} از ${toPersianDigits(c.modules.length)} فصل`
                          : "کل دوره"}
                      </span>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)] pt-1">
                همه مباحث به صورت پیش‌فرض فعال هستند (مطالعه جامع).
              </p>
            )}

            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] pt-1">
              <Info className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
              <span>
                {selectedModules.size > 0
                  ? `${toPersianDigits(selectedModules.size)} مبحث انتخاب شده است.`
                  : selectedCourses.size > 0
                  ? `${toPersianDigits(selectedCourses.size)} دوره انتخاب شده است.`
                  : "همه مباحث به صورت پیش‌فرض فعال هستند."}
              </span>
            </div>
          </div>

          {/* Part B: Micro-Insight SRS Status Breakdown (Interactive Study Launchers) */}
          <div className="space-y-3 pt-5 border-t border-[var(--color-border)]">
            <h4 className="text-xs font-bold text-[var(--color-text-secondary)]">
              تفکیک وضعیت کارت‌ها در مباحث انتخابی (برای مطالعه اختصاصی هر گروه کلیک کنید):
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Tile 5: Forgotten Cards */}
              <div
                onClick={() => {
                  if (scopedStats.overdue > 0) {
                    startCustomStudy("overdue");
                  }
                }}
                role="button"
                tabIndex={scopedStats.overdue > 0 ? 0 : -1}
                aria-disabled={scopedStats.overdue === 0}
                className={`bg-[var(--color-warning-soft)] border border-[var(--color-warning-muted)] rounded-[14px] p-4 flex flex-col justify-center relative overflow-hidden transition-all duration-300 group shadow-[var(--shadow-subtle)] ${
                  scopedStats.overdue > 0 ? "cursor-pointer hover:shadow-md" : "opacity-60 cursor-not-allowed"
                }`}
              >
                <h3 className="text-2xl font-black text-[var(--color-warning)] mb-0.5 relative z-10">
                  {toPersianDigits(scopedStats.overdue)}
                </h3>
                <p className="text-xs font-bold text-[var(--color-text)] relative z-10">کارت فراموش شده</p>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 relative z-10">
                  بیایید این‌ها را برطرف کنیم
                </p>
              </div>

              {/* Tile 6: New Cards */}
              <div
                onClick={() => {
                  if (scopedStats.newCards > 0) {
                    startCustomStudy("new");
                  }
                }}
                role="button"
                tabIndex={scopedStats.newCards > 0 ? 0 : -1}
                aria-disabled={scopedStats.newCards === 0}
                className={`bg-[var(--color-primary-soft)] border border-[var(--color-primary-muted)] rounded-[14px] p-4 flex flex-col justify-center relative overflow-hidden transition-all duration-300 group shadow-[var(--shadow-subtle)] ${
                  scopedStats.newCards > 0 ? "cursor-pointer hover:shadow-md" : "opacity-60 cursor-not-allowed"
                }`}
              >
                <h3 className="text-2xl font-black text-[var(--color-primary)] mb-0.5 relative z-10">
                  {toPersianDigits(scopedStats.newCards)}
                </h3>
                <p className="text-xs font-bold text-[var(--color-text)] relative z-10">کارت‌های جدید</p>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 relative z-10">آماده یادگیری</p>
              </div>

              {/* Tile 7: Needs Review */}
              <div
                onClick={() => {
                  if (scopedStats.due > 0) {
                    startCustomStudy("due");
                  }
                }}
                role="button"
                tabIndex={scopedStats.due > 0 ? 0 : -1}
                aria-disabled={scopedStats.due === 0}
                className={`bg-[var(--color-error-soft)] border border-[var(--color-error-muted)] rounded-[14px] p-4 flex flex-col justify-center relative overflow-hidden transition-all duration-300 group shadow-[var(--shadow-subtle)] ${
                  scopedStats.due > 0 ? "cursor-pointer hover:shadow-md" : "opacity-60 cursor-not-allowed"
                }`}
              >
                <h3 className="text-2xl font-black text-[var(--color-error)] mb-0.5 relative z-10">
                  {toPersianDigits(scopedStats.due)}
                </h3>
                <p className="text-xs font-bold text-[var(--color-text)] relative z-10">نیاز به مرور</p>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 relative z-10">زمان یادآوری</p>
              </div>

              {/* Tile 8: Learned */}
              <div
                onClick={() => {
                  if (scopedStats.learned > 0) {
                    startCustomStudy("learned");
                  }
                }}
                role="button"
                tabIndex={scopedStats.learned > 0 ? 0 : -1}
                aria-disabled={scopedStats.learned === 0}
                className={`bg-[var(--color-success-soft)] border border-[var(--color-success-muted)] rounded-[14px] p-4 flex flex-col justify-center relative overflow-hidden transition-all duration-300 group shadow-[var(--shadow-subtle)] ${
                  scopedStats.learned > 0 ? "cursor-pointer hover:shadow-md" : "opacity-60 cursor-not-allowed"
                }`}
              >
                <h3 className="text-2xl font-black text-[var(--color-success)] mb-0.5 relative z-10">
                  {toPersianDigits(learnedCardsCount)}
                </h3>
                <p className="text-xs font-bold text-[var(--color-text)] relative z-10">یادگرفته شده</p>
                <p className="text-[10px] text-[var(--color-success)] mt-0.5 relative z-10">تثبیت‌شده</p>
              </div>
            </div>
          </div>

          {/* Part C: Massive Start Button */}
          <button
            type="button"
            onClick={handleStartStudy}
            disabled={activeSelectedCardCount === 0}
            className="w-full rounded-[16px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] text-white relative overflow-hidden group shadow-[var(--shadow-card)] hover:shadow-lg transition-all duration-300 h-20 sm:h-24 p-4 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <div className="relative z-10 w-full h-full flex items-center justify-between px-4 sm:px-6">
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-[10px] bg-white/20 flex items-center justify-center backdrop-blur-xs group-hover:scale-110 transition-transform duration-300 shrink-0">
                  <Play className="w-7 h-7 sm:w-8 sm:h-8 text-white fill-white me-1" />
                </div>
                <div className="text-right">
                  <h2 className="text-lg sm:text-2xl font-black mb-1 text-white">
                    {selectedGoal === "exam" ? "شروع مرور فشرده امتحان" : "شروع مطالعه"}
                  </h2>
                  <p className="text-white/80 text-xs sm:text-sm font-semibold">
                    ~{toPersianDigits(estimatedMinutes)} دقیقه زمان تخمینی
                  </p>
                </div>
              </div>

              <div className="hidden sm:flex flex-col text-left opacity-90">
                <span className="text-xs text-white/80">کل کارت‌های انتخاب شده</span>
                <span className="text-xl sm:text-2xl font-black text-white">{toPersianDigits(activeSelectedCardCount)}</span>
              </div>
            </div>
          </button>
        </section>

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
                onClick={handleSaveSettings}
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
