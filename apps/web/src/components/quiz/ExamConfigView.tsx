import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CategoryIcon,
  NumberIcon,
  TrendingUpIcon,
  PlayIcon,
} from "./ExamIcons.js";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import {
  TaxonomySelector,
  type TaxonomyCourse,
} from "../study/TaxonomySelector.js";

export interface ExamConfigViewProps {
  organizationId: string;
  onStartExam: (data: {
    attemptId: string;
    questions: Array<Record<string, unknown>>;
    topics: string[];
    difficulty: string;
    requestedCount: number;
  }) => void;
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

export function ExamConfigView({ organizationId, onStartExam }: ExamConfigViewProps) {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const studyApi = createStudyApi(apiClient);

  // Fetch real hierarchical topics and question counts from DB
  const topicsQuery = useQuery({
    queryKey: ["exam-topics", organizationId],
    queryFn: () => studyApi.getExamTopics(organizationId),
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
      <header className="mb-10">
        <h1 className="text-3xl font-extrabold text-white mb-2">تنظیمات آزمون</h1>
        <p className="text-slate-400 text-sm md:text-base">
          دوره‌ها و بخش‌ها را برای شروع یک جلسه تمرینی متمرکز انتخاب کنید.
        </p>
      </header>

      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-red-900/30 border border-red-500/50 text-red-200 text-sm flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs bg-red-800/50 px-2 py-1 rounded text-red-100 hover:bg-red-800"
          >
            متوجه شدم
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Hierarchical Taxonomy Selector */}
        <div className="lg:col-span-2 space-y-8">
          {/* 1. Hierarchical Topic Selection Section */}
          <section className="glass-panel rounded-2xl p-6 md:p-8 border border-white/10 shadow-lg space-y-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
                  <CategoryIcon className="w-6 h-6" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-white">انتخاب دوره‌ها و بخش‌های آزمون</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ساختار استاندارد Course → Module → Lesson
                  </p>
                </div>
              </div>
            </div>

            {topicsQuery.isLoading ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                در حال بارگذاری بخش‌ها و تعداد سوالات دیتابیس...
              </div>
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
            <section className="glass-panel rounded-2xl p-6 md:p-8 border border-white/10 shadow-lg">
              <div className="flex items-center gap-3 mb-6">
                <span className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
                  <NumberIcon className="w-6 h-6" />
                </span>
                <h2 className="text-lg font-bold text-white">تعداد سوالات</h2>
              </div>
              <div className="bg-white/5 p-1 rounded-xl flex border border-white/10">
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
                          ? "bg-teal-600 text-white shadow-md"
                          : isAvailable
                          ? "text-slate-300 hover:text-white hover:bg-white/5"
                          : "text-slate-500 opacity-50 cursor-not-allowed"
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Difficulty Level */}
            <section className="glass-panel rounded-2xl p-6 md:p-8 border border-white/10 shadow-lg">
              <div className="flex items-center gap-3 mb-6">
                <span className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
                  <TrendingUpIcon className="w-6 h-6" />
                </span>
                <h2 className="text-lg font-bold text-white">سطح دشواری</h2>
              </div>
              <div className="flex gap-3">
                {[
                  { id: "easy", label: "آسان", activeClass: "border-emerald-500 text-emerald-300 bg-emerald-500/10" },
                  { id: "medium", label: "متوسط", activeClass: "border-teal-500 text-teal-300 bg-teal-500/10" },
                  { id: "hard", label: "سخت", activeClass: "border-red-500 text-red-300 bg-red-500/10" },
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
                          : "border-white/10 bg-white/5 text-slate-300 hover:border-slate-600 hover:bg-white/10"
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
          <div className="glass-panel rounded-2xl p-6 md:p-8 sticky top-28 border-t-4 border-t-teal-500 border border-white/10 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-6 border-b border-white/10 pb-4">
              خلاصه تنظیمات آزمون
            </h3>
            <div className="space-y-4 mb-8">
              <div className="flex justify-between items-center text-sm text-slate-300">
                <span className="text-slate-400">مباحث انتخاب شده:</span>
                <span className="text-white font-semibold">{selectionSummaryText}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-slate-300">
                <span className="text-slate-400">سوالات واجد شرایط:</span>
                <span className="text-emerald-400 font-semibold font-mono">
                  {availableQuestionsCount} سوال
                </span>
              </div>
              <div className="flex justify-between items-center text-sm text-slate-300">
                <span className="text-slate-400">تعداد سوالات آزمون:</span>
                <span className="text-white font-semibold font-mono">{questionCount}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-slate-300">
                <span className="text-slate-400">سطح دشواری:</span>
                <span className="text-teal-400 font-semibold">
                  {difficulty === "easy"
                    ? "آسان"
                    : difficulty === "hard"
                    ? "سخت"
                    : "متوسط"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm text-slate-300 pt-4 border-t border-white/10">
                <span className="text-slate-400">زمان تخمینی:</span>
                <span className="text-emerald-400 font-semibold font-mono flex items-center gap-1">
                  ⏱ {estimatedMinutes} Min
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartClick}
              disabled={isStarting || selectedModules.size === 0}
              className="w-full bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white py-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(15,118,110,0.3)] active:scale-95"
            >
              {isStarting ? (
                <span>در حال آماده‌سازی...</span>
              ) : (
                <>
                  <PlayIcon className="w-5 h-5" />
                  <span>شروع آزمون</span>
                </>
              )}
            </button>
            <p className="text-xs text-slate-400 text-center mt-4 leading-relaxed">
              آزمون بلافاصله پس از کلیک آغاز می‌شود و در سوابق شما ثبت می‌گردد.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
