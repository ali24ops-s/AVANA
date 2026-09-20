import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  CategoryIcon,
  NumberIcon,
  TrendingUpIcon,
  PlayIcon,
} from "./ExamIcons.js";
import { ArrowLeft, CreditCard, ChevronDown, Wallet, Info, Trash2 } from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import { createCommerceApi } from "../../lib/api/commerce.js";
import { createWalletApi } from "../../lib/api/wallet.js";
import {
  TaxonomySelector,
  type TaxonomyCourse,
} from "../study/TaxonomySelector.js";
import { Button, Badge, Alert, LoadingState } from "../ui/index.js";
import { toPersianDigits } from "@avana/domain";

export interface ExamConfigViewProps {
  organizationId: string;
  onStartExam: (data: {
    attemptId: string;
    questions: Array<Record<string, unknown>>;
    topics: string[];
    difficulty: string;
    requestedCount: number;
  }) => void;
  onSelectAttempt?: (attemptId: string) => void;
}

type RawLessonItem = {
  id?: string;
  lessonId?: string;
  title?: string;
  lessonTitle?: string;
  questionCount?: number;
  itemCount?: number;
};

type RawModuleItem = {
  id?: string;
  moduleId?: string;
  title?: string;
  moduleTitle?: string;
  questionCount?: number;
  itemCount?: number;
  lessons?: RawLessonItem[];
  chapters?: RawLessonItem[];
};

type RawCourseItem = {
  id?: string;
  courseId?: string;
  title?: string;
  courseTitle?: string;
  hasAccess?: boolean;
  questionCount?: number;
  itemCount?: number;
  modules?: RawModuleItem[];
  chapters?: RawModuleItem[];
};

export function ExamConfigView({
  organizationId,
  onStartExam,
  onSelectAttempt,
}: ExamConfigViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const studyApi = createStudyApi(apiClient);
  const commerceApi = useMemo(() => createCommerceApi(apiClient), [apiClient]);
  const walletApi = useMemo(() => createWalletApi(apiClient), [apiClient]);

  // Fetch user's wallet balance
  const walletQuery = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: () => walletApi.getMyWallet(),
    staleTime: 15_000,
  });

  // Fetch real hierarchical topics and question counts from DB
  const topicsQuery = useQuery({
    queryKey: ["exam-topics", organizationId],
    queryFn: () => studyApi.getExamTopics(organizationId),
  });

  // Fetch recent exam attempts history
  const historyQuery = useQuery({
    queryKey: ["exam-history", organizationId],
    queryFn: () => studyApi.getExamHistory(organizationId, 12),
  });

  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());

  const [questionCount, setQuestionCount] = useState<number>(20);
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(false);

  const [attemptToDelete, setAttemptToDelete] = useState<{ attemptId: string; topic: string } | null>(null);
  const [isDeletingAttempt, setIsDeletingAttempt] = useState<boolean>(false);

  const handleConfirmDeleteAttempt = async () => {
    if (!attemptToDelete || !organizationId) return;
    try {
      setIsDeletingAttempt(true);
      await studyApi.removeExamAttemptFromHistory(organizationId, attemptToDelete.attemptId);
      setAttemptToDelete(null);
      void queryClient.invalidateQueries({ queryKey: ["exam-history", organizationId] });
    } catch (err) {
      console.error("Failed to remove exam attempt from history", err);
    } finally {
      setIsDeletingAttempt(false);
    }
  };

  // Map module ID -> array of underlying lesson IDs so question/lesson ownership is preserved
  const moduleToLessonsMap = useMemo(() => {
    const rawList = (topicsQuery.data?.courses || topicsQuery.data?.sections) as RawCourseItem[] | undefined;
    const map = new Map<string, string[]>();
    if (!rawList) return map;
    for (const c of rawList) {
      const rawModules = c.modules || c.chapters || [];
      for (const m of rawModules) {
        const modId = m.moduleId || m.id;
        if (!modId) continue;
        const lessonIds = (m.lessons || [])
          .map((l: RawLessonItem) => l.lessonId || l.id)
          .filter((id): id is string => Boolean(id));
        if (lessonIds.length > 0) {
          map.set(modId, lessonIds);
        }
      }
    }
    return map;
  }, [topicsQuery.data]);

  // Map API response to Chapter-Level TaxonomyCourse format (Course -> Module)
  // Questions are grouped at chapter level in Pre-Exam UI, while preserving lesson ownership in data
  const taxonomyCourses: TaxonomyCourse[] = useMemo(() => {
    const rawList = (topicsQuery.data?.courses || topicsQuery.data?.sections) as RawCourseItem[] | undefined;
    if (!rawList) return [];
    return rawList
      .map((c: RawCourseItem) => {
        const rawModules = c.modules || c.chapters;
        const validModules = (rawModules || [])
          .filter(
            (m: RawModuleItem) =>
              (m.questionCount ?? m.itemCount ?? 0) > 0 &&
              m.moduleId !== "mod-unassigned" &&
              m.id !== "mod-unassigned" &&
              m.moduleTitle !== "سایر سرفصل‌ها" &&
              m.title !== "سایر سرفصل‌ها",
          )
          .map((m: RawModuleItem) => {
            const rawLessons = m.lessons;
            const totalCount =
              (m.questionCount ?? m.itemCount) ??
              (rawLessons || []).reduce((acc, l) => acc + (l.questionCount ?? l.itemCount ?? 0), 0);

            return {
              id: m.moduleId || m.id || "",
              title: m.moduleTitle || m.title || "",
              itemCount: totalCount,
              lessons: undefined,
            };
          });
        return {
          id: c.courseId || c.id || "",
          title: c.courseTitle || c.title || "",
          hasAccess: c.hasAccess !== false,
          itemCount: c.questionCount ?? c.itemCount,
          modules: validModules,
          hasRawModules: Array.isArray(rawModules) && rawModules.length > 0,
        };
      })
      .filter((c: { id: string; title: string; modules: unknown[]; hasRawModules: boolean; itemCount?: number }) => {
        if (c.id === "course-unassigned") return false;
        if (
          c.title === "سایر مباحث آموزشی" ||
          c.title === "سایر موارد آموزشی" ||
          c.title === "سایر سرفصل‌ها"
        )
          return false;
        if ((c.itemCount ?? 0) <= 0) return false;
        if (c.hasRawModules) return c.modules.length > 0;
        return true;
      });
  }, [topicsQuery.data]);

  // Split courses strictly into Accessible ("دوره‌های من") vs Inaccessible ("دوره‌های دیگر")
  const accessibleCourses = useMemo(
    () => taxonomyCourses.filter((c) => c.hasAccess === true),
    [taxonomyCourses],
  );

  const otherCourses = useMemo(
    () => taxonomyCourses.filter((c) => c.hasAccess !== true),
    [taxonomyCourses],
  );

  const [isOtherCoursesOpen, setIsOtherCoursesOpen] = useState<boolean>(false);

  const handleTaxonomyChange = (selection: {
    courseIds: Set<string>;
    moduleIds: Set<string>;
    lessonIds?: Set<string>;
  }) => {
    setSelectedCourses(selection.courseIds);
    setSelectedModules(selection.moduleIds);
    setSelectedLessons(selection.lessonIds || new Set());
  };

  // Calculate dynamic eligible questions count based on selected modules
  const availableQuestionsCount = useMemo(() => {
    if (taxonomyCourses.length === 0) return 0;
    let count = 0;

    for (const c of taxonomyCourses) {
      for (const m of c.modules) {
        if (selectedModules.has(m.id)) {
          count += m.itemCount ?? 0;
        }
      }
    }
    return count;
  }, [taxonomyCourses, selectedModules]);

  // Compute Selection Summary string
  const selectionSummaryText = useMemo(() => {
    return `${toPersianDigits(selectedCourses.size)} دوره، ${toPersianDigits(selectedModules.size)} بخش`;
  }, [selectedCourses, selectedModules]);

  // Dynamic estimated time calculation (~1.5 minutes per question)
  const estimatedMinutes = Math.max(5, Math.round(questionCount * 1.5));

  // Find selected courses and determine access status across all selections
  const selectedCoursesList = useMemo(() => {
    if (selectedCourses.size > 0) {
      return taxonomyCourses.filter((c) => selectedCourses.has(c.id));
    }
    if (selectedModules.size > 0) {
      return taxonomyCourses.filter((c) =>
        c.modules.some((m) => selectedModules.has(m.id)),
      );
    }
    return [];
  }, [taxonomyCourses, selectedCourses, selectedModules]);

  const activeCourse = selectedCoursesList[0];
  const hasAccess =
    selectedCoursesList.length > 0
      ? selectedCoursesList.every((c) => c.hasAccess === true)
      : true;

  // Selected module IDs array belonging to the active course for special exam purchase
  const activeCourseModuleIdsArray = useMemo(() => {
    if (!activeCourse) return [];
    return Array.from(selectedModules)
      .filter((modId) => activeCourse.modules.some((m) => m.id === modId))
      .sort();
  }, [selectedModules, activeCourse]);

  // Authoritative price and pool preview query for unpurchased courses
  const previewQuery = useQuery({
    queryKey: [
      "special-exam-preview",
      organizationId,
      activeCourse?.id,
      activeCourseModuleIdsArray.join(","),
      questionCount,
      difficulty,
    ],
    queryFn: () =>
      commerceApi.previewSpecialExam({
        organizationId,
        courseId: activeCourse!.id,
        moduleIds: activeCourseModuleIdsArray,
        questionCount,
        difficulty,
      }),
    enabled: Boolean(!hasAccess && activeCourse && activeCourseModuleIdsArray.length > 0),
  });

  const examPrice = previewQuery.data?.price ?? (questionCount * 500);
  const walletBalance = walletQuery.data?.balance ?? 0;
  const isBalanceInsufficient =
    !hasAccess &&
    Boolean(
      walletQuery.data &&
      !walletQuery.isLoading &&
      walletBalance < examPrice,
    );

  const handleStartClick = async () => {
    setErrorMsg(null);
    setIsStarting(true);
    try {
      const activeLessonIds = new Set<string>();
      for (const modId of selectedModules) {
        const lessonIds = moduleToLessonsMap.get(modId);
        if (lessonIds) {
          for (const lId of lessonIds) {
            activeLessonIds.add(lId);
          }
        }
      }

      const activeTopics = [
        ...Array.from(selectedCourses),
        ...Array.from(selectedModules),
        ...Array.from(activeLessonIds),
      ];
      const res = await studyApi.startExamAttempt(organizationId, {
        sections: Array.from(selectedModules),
        chapters: Array.from(activeLessonIds),
        topics: activeTopics,
        questionCount,
        difficulty,
      });

      onStartExam({
        attemptId: res.attemptId,
        questions: res.questions,
        topics: res.topics,
        difficulty: res.difficulty,
        requestedCount: res.requestedCount,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      setErrorMsg(
        msg ||
          `امکان شروع آزمون وجود ندارد. لطفاً تعداد سؤال کمتر یا سرفصل‌های دیگری را انتخاب کنید.`,
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handleSpecialExamOrder = async () => {
    if (!activeCourse) return;
    setErrorMsg(null);
    setIsStarting(true);
    try {
      const activeLessonIds = new Set<string>();
      for (const modId of selectedModules) {
        const lessonIds = moduleToLessonsMap.get(modId);
        if (lessonIds) {
          for (const lId of lessonIds) {
            activeLessonIds.add(lId);
          }
        }
      }

      const activeTopics = [
        ...Array.from(selectedCourses),
        ...Array.from(selectedModules),
        ...Array.from(activeLessonIds),
      ];

      const res = await commerceApi.createSpecialExamOrder({
        organizationId,
        courseId: activeCourse.id,
        moduleIds: activeCourseModuleIdsArray,
        questionCount,
        difficulty,
        gateway: "wallet",
      });

      if (res.attempt_id && res.attempt) {
        onStartExam({
          attemptId: res.attempt_id,
          questions: (res.questions || (res.attempt as any).questionSnapshot || []) as Array<Record<string, unknown>>,
          topics: activeTopics,
          difficulty,
          requestedCount: questionCount,
        });
        return;
      }

      // Fallback if not wallet
      navigate(
        `/checkout/card-to-card?productId=${encodeURIComponent(res.product.id)}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      setErrorMsg(
        msg ||
          "امکان پرداخت و ساخت آزمون سفارشی وجود ندارد. لطفاً دوباره تلاش کنید.",
      );
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 font-sans" dir="rtl">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--color-text)] mb-2">تنظیمات آزمون</h1>
        <p className="text-[var(--color-text-muted)] text-sm sm:text-base">
          دوره‌ها و بخش‌ها را برای شروع یک جلسه تمرینی متمرکز انتخاب کنید.
        </p>
      </header>

      {errorMsg && (
        <div className="mb-6">
          <Alert variant="error" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Hierarchical Taxonomy Selector */}
        <div className="lg:col-span-2 space-y-8">
          {topicsQuery.isLoading ? (
            <section className="bg-[var(--color-surface)] rounded-2xl p-6 md:p-8 border border-[var(--color-border)] shadow-xs">
              <LoadingState message="در حال بارگذاری بخش‌ها و تعداد سوالات دیتابیس..." />
            </section>
          ) : (
            <>
              {/* 1. Accessible Courses Section ("دوره‌های من") */}
              {accessibleCourses.length > 0 && (
                <section className="bg-[var(--color-surface)] rounded-2xl p-6 md:p-8 border border-[var(--color-border)] shadow-xs space-y-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="p-2 rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                        <CategoryIcon className="w-6 h-6" />
                      </span>
                      <div>
                        <h2 className="text-lg font-bold text-[var(--color-text)]">دوره‌های من</h2>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                          دوره‌های دارای دسترسی برای شروع جلسه تمرینی
                        </p>
                      </div>
                    </div>
                  </div>

                  <TaxonomySelector
                    courses={accessibleCourses}
                    selectedCourseIds={selectedCourses}
                    selectedModuleIds={selectedModules}
                    selectedLessonIds={selectedLessons}
                    onSelectionChange={handleTaxonomyChange}
                    emptyMessage="دوره‌ای با دسترسی فعال یافت نشد."
                    itemLabelSingular="سؤال"
                    hideLessons={true}
                  />
                </section>
              )}

              {/* 2. Inaccessible Courses Section ("دوره‌های دیگر" - Collapsed by default) */}
              {otherCourses.length > 0 && (
                <section className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-xs overflow-hidden transition-all">
                  <button
                    type="button"
                    onClick={() => setIsOtherCoursesOpen((prev) => !prev)}
                    className="w-full p-6 md:p-8 flex items-center justify-between text-start hover:bg-[var(--color-surface-warm)]/50 transition-colors cursor-pointer"
                    aria-expanded={isOtherCoursesOpen}
                  >
                    <div className="flex items-center gap-3">
                      <span className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <span className="material-symbols-outlined text-2xl">auto_stories</span>
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-bold text-[var(--color-text)]">دوره‌های دیگر</h2>
                          <Badge variant="warning" size="sm">
                            {toPersianDigits(otherCourses.length)} دوره
                          </Badge>
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                          برای این دوره‌ها می‌توانید آزمون سفارشی بسازید.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                      <span className="text-xs font-semibold hidden sm:inline">
                        {isOtherCoursesOpen ? "بستن لیست" : "مشاهده و ساخت آزمون"}
                      </span>
                      <ChevronDown
                        className={`w-5 h-5 transition-transform duration-200 ${
                          isOtherCoursesOpen ? "rotate-180 text-[var(--color-primary)]" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {isOtherCoursesOpen && (
                    <div className="p-6 md:p-8 pt-0 border-t border-[var(--color-border)]/60">
                      <TaxonomySelector
                        courses={otherCourses}
                        selectedCourseIds={selectedCourses}
                        selectedModuleIds={selectedModules}
                        selectedLessonIds={selectedLessons}
                        onSelectionChange={handleTaxonomyChange}
                        emptyMessage="دوره‌ای یافت نشد."
                        itemLabelSingular="سؤال"
                        hideLessons={true}
                      />
                    </div>
                  )}
                </section>
              )}

              {accessibleCourses.length === 0 && otherCourses.length === 0 && (
                <section className="bg-[var(--color-surface)] rounded-2xl p-8 border border-dashed border-[var(--color-border)] text-center">
                  <p className="text-sm font-semibold text-[var(--color-text)]">هیچ دوره‌ای در دسترس نیست.</p>
                </section>
              )}
            </>
          )}

          {/* 2 & 3: Questions Count & Difficulty */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Number of Questions */}
            <section className="bg-[var(--color-surface)] rounded-2xl p-6 md:p-8 border border-[var(--color-border)] shadow-xs">
              <div className="flex items-center gap-3 mb-6">
                <span className="p-2 rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                  <NumberIcon className="w-6 h-6" />
                </span>
                <h2 className="text-lg font-bold text-[var(--color-text)]">تعداد سوالات</h2>
              </div>
              <div className="bg-[var(--color-background)] p-1 rounded-xl flex border border-[var(--color-border)]">
                {[10, 20, 40, 60].map((num) => {
                  const isSelected = questionCount === num;
                  const isAvailable = availableQuestionsCount === 0 || availableQuestionsCount >= num;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setQuestionCount(num)}
                      disabled={!isAvailable}
                      className={`flex-1 py-3 rounded-lg text-sm font-semibold transition-all font-mono ${
                        isSelected
                          ? "bg-[var(--color-primary)] text-white shadow-xs"
                          : isAvailable
                          ? "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                          : "text-[var(--color-text-muted)] opacity-40 cursor-not-allowed"
                      }`}
                    >
                      {toPersianDigits(num)}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Difficulty Level */}
            <section className="bg-[var(--color-surface)] rounded-2xl p-6 md:p-8 border border-[var(--color-border)] shadow-xs">
              <div className="flex items-center gap-3 mb-6">
                <span className="p-2 rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                  <TrendingUpIcon className="w-6 h-6" />
                </span>
                <h2 className="text-lg font-bold text-[var(--color-text)]">سطح دشواری</h2>
              </div>
              <div className="flex gap-3">
                {[
                  { id: "easy", label: "آسان", activeClass: "border-[#3d8f6e] text-[#2a624b] bg-[#e4f4ec] shadow-xs" },
                  { id: "medium", label: "متوسط", activeClass: "border-[var(--color-primary)] text-[var(--color-primary-dark)] bg-[var(--color-primary-soft)] shadow-xs" },
                  { id: "hard", label: "سخت", activeClass: "border-[#b84c4c] text-[#7f3131] bg-[#fde8e8] shadow-xs" },
                ].map((item) => {
                  const isSelected = difficulty === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDifficulty(item.id)}
                      className={`flex-1 py-3.5 rounded-xl border text-sm font-semibold transition-all ${
                        isSelected
                          ? item.activeClass
                          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        {/* Right Sidebar Column: Summary & CTA */}
        <div className="lg:col-span-1">
          <div className="bg-[var(--color-surface)] rounded-2xl p-6 md:p-8 sticky top-28 border-t-4 border-t-[var(--color-primary)] border border-[var(--color-border)] shadow-xs">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4 mb-6">
              <h3 className="text-lg font-bold text-[var(--color-text)]">
                {hasAccess ? "خلاصه تنظیمات آزمون" : "خلاصه آزمون سفارشی"}
              </h3>
              <Badge
                variant={hasAccess ? "success" : "warning"}
                size="sm"
              >
                {hasAccess ? "تمرینی / رایگان" : "آزمون سفارشی"}
              </Badge>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex justify-between items-center text-sm">
                <span className="text-[var(--color-text-muted)]">مباحث انتخاب شده:</span>
                <span className="text-[var(--color-text)] font-semibold">{selectionSummaryText}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-[var(--color-text-muted)]">سوالات واجد شرایط:</span>
                <span className="text-[#2a624b] font-bold font-mono">
                  {toPersianDigits(availableQuestionsCount)} سوال
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-[var(--color-text-muted)]">تعداد سوالات آزمون:</span>
                <span className="text-[var(--color-text)] font-bold font-mono">{toPersianDigits(questionCount)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-[var(--color-text-muted)]">سطح دشواری:</span>
                <span className="text-[var(--color-primary)] font-semibold">
                  {difficulty === "easy"
                    ? "آسان"
                    : difficulty === "hard"
                    ? "سخت"
                    : "متوسط"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm pt-4 border-t border-[var(--color-border)]">
                <span className="text-[var(--color-text-muted)]">زمان تخمینی:</span>
                <span className="text-[#2a624b] font-bold font-mono flex items-center gap-1">
                  ⏱ {toPersianDigits(estimatedMinutes)} دقیقه
                </span>
              </div>

              {!hasAccess && (
                <>
                  <div className="flex justify-between items-center text-sm pt-4 border-t border-[var(--color-border)]">
                    <span className="text-[var(--color-text-muted)] font-semibold">موجودی کیف پول:</span>
                    <span className="text-[var(--color-text)] font-bold font-mono text-sm">
                      {walletQuery.isLoading ? (
                        <span className="text-xs text-[var(--color-text-muted)]">در حال دریافت...</span>
                      ) : (
                        `${toPersianDigits(walletBalance.toLocaleString("fa-IR"))} تومان`
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-[var(--color-text-muted)] font-semibold">هزینه آزمون:</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold font-mono text-base">
                      {previewQuery.isLoading ? (
                        <span className="text-xs text-[var(--color-text-muted)]">در حال استعلام...</span>
                      ) : previewQuery.isError ? (
                        <span className="text-xs text-[var(--avana-error)]">موجودی ناکافی سؤالات</span>
                      ) : previewQuery.data ? (
                        `${toPersianDigits(previewQuery.data.price.toLocaleString("fa-IR"))} تومان`
                      ) : (
                        "—"
                      )}
                    </span>
                  </div>

                  {isBalanceInsufficient && (
                    <div
                      data-testid="insufficient-wallet-warning"
                      className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs space-y-1"
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        <Wallet className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        <span>موجودی کیف پول شما کافی نیست.</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                        هزینه آزمون {toPersianDigits(examPrice.toLocaleString("fa-IR"))} تومان است. لطفاً ابتدا کیف پول خود را شارژ کنید.
                      </p>
                    </div>
                  )}

                  <Alert
                    variant="info"
                    icon={<Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />}
                    className="mt-2"
                  >
                    سوالات آزمون به‌صورت تصادفی از بانک سوالات انتخاب می‌شوند؛ بنابراین در هر بار خرید و شروع آزمون، ترکیب سوالات می‌تواند متفاوت باشد.
                  </Alert>
                </>
              )}
            </div>

            {hasAccess ? (
              <Button
                type="button"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={isStarting}
                disabled={isStarting || selectedModules.size === 0}
                onClick={handleStartClick}
                leftIcon={<PlayIcon className="w-5 h-5" />}
              >
                {isStarting ? "در حال آماده‌سازی..." : "شروع آزمون"}
              </Button>
            ) : isBalanceInsufficient ? (
              <Button
                type="button"
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => navigate("/account/wallet")}
                leftIcon={<Wallet className="w-5 h-5" />}
              >
                شارژ کیف پول
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={isStarting || previewQuery.isLoading || walletQuery.isLoading}
                disabled={
                  isStarting ||
                  selectedModules.size === 0 ||
                  previewQuery.isLoading ||
                  walletQuery.isLoading ||
                  previewQuery.isError ||
                  previewQuery.data?.valid === false
                }
                onClick={handleSpecialExamOrder}
                leftIcon={<Wallet className="w-5 h-5" />}
              >
                {isStarting
                  ? "در حال ایجاد آزمون..."
                  : "پرداخت از کیف پول و شروع آزمون"}
              </Button>
            )}

            <p className="text-xs text-[var(--color-text-muted)] text-center mt-4 leading-relaxed">
              {hasAccess
                ? "آزمون بلافاصله پس از کلیک آغاز می‌شود و در سوابق شما ثبت می‌گردد."
                : isBalanceInsufficient
                ? "برای شروع این آزمون، ابتدا کیف پول خود را شارژ کنید."
                : "مبلغ از کیف پول کسر شده و آزمون بلافاصله آغاز می‌گردد."}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Exams History Section */}
      <section className="mt-12 bg-[var(--color-surface)] rounded-2xl p-6 md:p-8 border border-[var(--color-border)] shadow-xs">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl">history_edu</span>
            </span>
            <div>
              <h2 className="text-lg font-bold text-[var(--color-text)]">آزمون‌های اخیر شما</h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                مرور کارنامه، وضعیت پاسخ‌ها و توضیحات تشریحی آزمون‌های قبلی
              </p>
            </div>
          </div>
          {historyQuery.isLoading && (
            <span className="text-xs text-[var(--color-primary)] animate-pulse">در حال دریافت سوابق...</span>
          )}
        </div>

        {(!historyQuery.data?.items || historyQuery.data.items.length === 0) ? (
          <div className="text-center py-12 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-background)]">
            <span className="material-symbols-outlined text-[var(--color-text-muted)] text-4xl mb-2">quiz</span>
            <p className="text-[var(--color-text)] text-sm font-semibold">هنوز آزمونی ثبت نکرده‌اید.</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              با انتخاب مباحث دلخواه از بالا و زدن دکمه «شروع آزمون»، نخستین آزمون تمرینی خود را بسازید.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {historyQuery.data.items.map((item) => {
              const isCompleted = item.status === "completed" || item.completedAt != null;
              const formattedDate = item.startedAt
                ? new Date(item.startedAt).toLocaleDateString("fa-IR", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—";

              return (
                <div
                  key={item.attemptId}
                  className="bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/40 rounded-xl p-5 transition-all flex flex-col justify-between group shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={isCompleted ? "success" : "warning"}
                          size="sm"
                        >
                          {isCompleted ? "تکمیل شده" : "در حال انجام"}
                        </Badge>
                        {item.isSpecialExam && (
                          <Badge variant="primary" size="sm">
                            آزمون سفارشی
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[var(--color-text-muted)] font-mono" dir="ltr">
                          {formattedDate}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAttemptToDelete({
                              attemptId: item.attemptId,
                              topic: item.topic || "آزمون چندگزینه‌ای",
                            });
                          }}
                          aria-label="حذف از آزمون‌های اخیر"
                          data-testid={`delete-attempt-${item.attemptId}`}
                          className="text-[var(--color-text-muted)] hover:text-[var(--avana-error)] p-1 rounded-lg hover:bg-[var(--avana-error)]/10 transition-colors"
                          title="حذف از آزمون‌های اخیر"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <h4 className="text-sm font-bold text-[var(--color-text)] line-clamp-2 group-hover:text-[var(--color-primary)] transition-colors mt-1">
                      {item.topic || "آزمون چندگزینه‌ای"}
                    </h4>

                    {isCompleted ? (
                      <div className="mt-4 flex items-baseline justify-between border-t border-[var(--color-border)] pt-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-2xl font-black font-mono text-[#2a624b]">
                            ٪{toPersianDigits(Math.round(item.score))}
                          </span>
                          <span className="text-xs text-[var(--color-text-muted)]">نمره</span>
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)]">
                          <span className="text-[#2a624b] font-bold font-mono">{toPersianDigits(item.correct)}</span> صحیح از{" "}
                          <span className="text-[var(--color-text)] font-bold font-mono">{toPersianDigits(item.totalQuestions)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 text-xs text-[#8f5e27] border-t border-[var(--color-border)] pt-3 flex items-center justify-between">
                        <span>{toPersianDigits(item.totalQuestions)} سؤال</span>
                        <span>آماده ادامه آزمون</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
                    <Button
                      variant={isCompleted ? "secondary" : "tertiary"}
                      size="sm"
                      fullWidth
                      onClick={() => onSelectAttempt?.(item.attemptId)}
                      rightIcon={<ArrowLeft className="w-4 h-4" aria-hidden="true" />}
                    >
                      {isCompleted ? "مشاهده کارنامه و تحلیل" : "ادامه آزمون"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Delete Recent Exam Confirmation Modal */}
      {attemptToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs font-sans animate-fadeIn"
          dir="rtl"
        >
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5 text-right">
            <div className="flex items-center gap-3 text-[var(--avana-error)]">
              <span className="p-2.5 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </span>
              <h3 id="delete-modal-title" className="text-base font-bold text-[var(--color-text)]">
                حذف از آزمون‌های اخیر
              </h3>
            </div>

            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
              آیا می‌خواهید آزمون <strong className="text-[var(--color-text)]">«{attemptToDelete.topic}»</strong> از لیست آزمون‌های اخیر شما حذف شود؟
            </p>
            <p className="text-xs text-[var(--color-text-muted)] bg-[var(--color-background)] p-3 rounded-xl border border-[var(--color-border)] leading-relaxed">
              ℹ️ این اقدام سابقه آزمون را تنها از لیست سوابق اخیر شما مخفی می‌کند و به پیشرفت و اطلاعات ثبت‌شده شما آسیبی نمی‌زند.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                disabled={isDeletingAttempt}
                onClick={() => setAttemptToDelete(null)}
              >
                انصراف
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                isLoading={isDeletingAttempt}
                disabled={isDeletingAttempt}
                onClick={handleConfirmDeleteAttempt}
              >
                {isDeletingAttempt ? "در حال حذف..." : "حذف از لیست"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
