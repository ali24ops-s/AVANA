import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CategoryIcon,
  NumberIcon,
  TrendingUpIcon,
  PlayIcon,
} from "./ExamIcons.js";
import { ArrowLeft } from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
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
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const studyApi = createStudyApi(apiClient);

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

  // Map API response to 3-Level TaxonomyCourse format (Course -> Module -> Lesson)
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
            const validLessons = (rawLessons || [])
              .filter((l: RawLessonItem) => (l.questionCount ?? l.itemCount ?? 0) > 0)
              .map((l: RawLessonItem) => ({
                id: l.lessonId || l.id || "",
                title: l.lessonTitle || l.title || "",
                itemCount: l.questionCount ?? l.itemCount,
              }));

            return {
              id: m.moduleId || m.id || "",
              title: m.moduleTitle || m.title || "",
              itemCount: m.questionCount ?? m.itemCount,
              lessons: validLessons.length > 0 ? validLessons : undefined,
            };
          });
        return {
          id: c.courseId || c.id || "",
          title: c.courseTitle || c.title || "",
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

  const handleTaxonomyChange = (selection: {
    courseIds: Set<string>;
    moduleIds: Set<string>;
    lessonIds?: Set<string>;
  }) => {
    setSelectedCourses(selection.courseIds);
    setSelectedModules(selection.moduleIds);
    setSelectedLessons(selection.lessonIds || new Set());
  };

  // Calculate dynamic eligible questions count based on selected lessons & modules
  const availableQuestionsCount = useMemo(() => {
    if (taxonomyCourses.length === 0) return 0;
    let count = 0;

    for (const c of taxonomyCourses) {
      for (const m of c.modules) {
        if (m.lessons && m.lessons.length > 0) {
          for (const l of m.lessons) {
            if (selectedLessons.has(l.id)) {
              count += l.itemCount ?? 0;
            }
          }
        } else if (selectedModules.has(m.id)) {
          count += m.itemCount ?? 0;
        }
      }
    }
    return count;
  }, [taxonomyCourses, selectedModules, selectedLessons]);

  // Compute Selection Summary string
  const selectionSummaryText = useMemo(() => {
    if (selectedLessons.size > 0) {
      return `${selectedCourses.size} دوره، ${selectedModules.size} بخش، ${selectedLessons.size} درس`;
    }
    return `${selectedCourses.size} دوره، ${selectedModules.size} بخش`;
  }, [selectedCourses, selectedModules, selectedLessons]);

  // Dynamic estimated time calculation (~1.5 minutes per question)
  const estimatedMinutes = Math.max(5, Math.round(questionCount * 1.5));

  const handleStartClick = async () => {
    setErrorMsg(null);
    setIsStarting(true);
    try {
      const activeTopics = [
        ...Array.from(selectedCourses),
        ...Array.from(selectedModules),
        ...Array.from(selectedLessons),
      ];
      const res = await studyApi.startExamAttempt(organizationId, {
        sections: Array.from(selectedModules),
        chapters: Array.from(selectedLessons),
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
          {/* 1. Hierarchical Topic Selection Section */}
          <section className="bg-[var(--color-surface)] rounded-2xl p-6 md:p-8 border border-[var(--color-border)] shadow-xs space-y-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                  <CategoryIcon className="w-6 h-6" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-[var(--color-text)]">انتخاب دوره‌ها و بخش‌های آزمون</h2>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    ساختار استاندارد Course → Module → Lesson
                  </p>
                </div>
              </div>
            </div>

            {topicsQuery.isLoading ? (
              <LoadingState message="در حال بارگذاری بخش‌ها و تعداد سوالات دیتابیس..." />
            ) : (
              <TaxonomySelector
                courses={taxonomyCourses}
                selectedCourseIds={selectedCourses}
                selectedModuleIds={selectedModules}
                selectedLessonIds={selectedLessons}
                onSelectionChange={handleTaxonomyChange}
                emptyMessage="برای این دوره هنوز سرفصل یا آزمونی ثبت نشده است."
                itemLabelSingular="سؤال"
              />
            )}
          </section>

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
                      {num}
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
            <h3 className="text-lg font-bold text-[var(--color-text)] mb-6 border-b border-[var(--color-border)] pb-4">
              خلاصه تنظیمات آزمون
            </h3>
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
            </div>

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
            <p className="text-xs text-[var(--color-text-muted)] text-center mt-4 leading-relaxed">
              آزمون بلافاصله پس از کلیک آغاز می‌شود و در سوابق شما ثبت می‌گردد.
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
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Badge
                        variant={isCompleted ? "success" : "warning"}
                        size="sm"
                      >
                        {isCompleted ? "تکمیل شده" : "در حال انجام"}
                      </Badge>
                      <span className="text-[11px] text-[var(--color-text-muted)] font-mono" dir="ltr">
                        {formattedDate}
                      </span>
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
    </div>
  );
}
