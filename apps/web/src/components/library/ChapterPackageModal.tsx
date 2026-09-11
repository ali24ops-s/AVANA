/**
 * ChapterPackageModal Component.
 *
 * Full in-modal pre-purchase Preview Experience for Educational Packages & Courses.
 * Allows non-buyers to experience real content directly inside the "مشاهده بسته" modal:
 * - Tab 1: Complete outline (TOC) with preview lesson in full markdown & locked paid lessons.
 * - Tab 2: 5 real preview flashcards with interactive flip & end CTA.
 * - Tab 3: 5 real preview quiz questions with choices, attempt submission & scoring.
 * - Footer: Real pricing and high-converting purchase CTA.
 */

import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Layers,
  HelpCircle,
  Clock,
  Sparkles,
  ShoppingBag,
  GraduationCap,
  ExternalLink,
  Lock,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Zap,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import {
  type ChapterPackageItem,
  toPersianDigits,
  formatPersianOf,
} from "@avana/domain";
import type { LibraryCourseItem } from "../../lib/api/library.js";
import { formatToman } from "../commerce/userCommerceUtils.js";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Badge,
  Button,
  Progress,
  LoadingState,
  Card,
} from "@avana/ui";
import { MarkdownRenderer, RichContent } from "../markdown/MarkdownRenderer.js";
import { createApiClient, getApiBaseUrl, generateUUID } from "../../lib/api/client.js";
import { createLearningApi } from "../../lib/api/learning.js";
import { createStudyApi } from "../../lib/api/study.js";
import { useQuery, useMutation } from "@tanstack/react-query";

export interface ChapterPackageModalProps {
  packageItem?: ChapterPackageItem | null;
  courseItem?: LibraryCourseItem | null;
  open: boolean;
  onClose: () => void;
  onBuy: (item: ChapterPackageItem | LibraryCourseItem) => void;
}

type TabType = "lesson" | "summary" | "flashcard" | "quiz";

export function ChapterPackageModal({
  packageItem,
  courseItem,
  open,
  onClose,
  onBuy,
}: ChapterPackageModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("lesson");
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Flashcards state
  const [cardIndex, setCardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [isFlashcardCompleted, setIsFlashcardCompleted] = useState(false);

  // Quiz state
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [attemptResult, setAttemptResult] = useState<any>(null);

  const apiClient = useMemo(
    () => createApiClient({ baseUrl: getApiBaseUrl() }),
    [],
  );
  const learningApi = useMemo(() => createLearningApi(apiClient), [apiClient]);
  const studyApi = useMemo(() => createStudyApi(apiClient), [apiClient]);

  const targetItem = packageItem || courseItem;
  const effectiveCourseId = packageItem?.courseId || courseItem?.id || (packageItem as any)?.id;
  const targetModuleId = packageItem?.moduleId;
  const title = packageItem?.title || courseItem?.title || "";
  const courseTitle = packageItem?.courseTitle || courseItem?.title || "";
  const subject = packageItem?.subject || courseItem?.subject || "آموزش پزشکی و داروسازی";
  const hasAccess = packageItem?.access?.hasAccess ?? courseItem?.access?.hasAccess ?? false;
  const price = packageItem?.purchase?.price ?? courseItem?.purchase?.price ?? 0;
  const estimatedMinutes =
    packageItem?.stats?.estimatedReadingMinutes ||
    (courseItem?.content_count ? courseItem.content_count * 15 : 20);

  // Stable previewSessionId across modal lifetime
  const previewSessionId = useMemo(() => {
    if (!open) return "";
    return generateUUID();
  }, [open, targetModuleId, effectiveCourseId]);

  // Reset state when opening a new item
  useEffect(() => {
    if (open && targetItem) {
      setActiveTab("lesson");
      setSelectedLessonId(null);
      setCardIndex(0);
      setIsCardFlipped(false);
      setIsFlashcardCompleted(false);
      setQuestionIndex(0);
      setAnswers({});
      setAttemptResult(null);
    }
  }, [open, effectiveCourseId, targetModuleId]);

  // 1. Fetch Curriculum & Lesson content (scoped to targetModuleId)
  const learningQuery = useQuery({
    queryKey: ["package-modal-learning", effectiveCourseId, targetModuleId],
    queryFn: () =>
      learningApi.getCourseLearning(effectiveCourseId!, {
        moduleId: targetModuleId,
        previewSessionId,
      }),
    enabled: Boolean(open && effectiveCourseId),
    staleTime: 60_000,
  });

  // Resolve active/preview lesson (strictly scoped to targetModuleId if provided)
  const rawModules = learningQuery.data?.modules || [];
  const modules = useMemo(() => {
    if (targetModuleId) {
      return rawModules.filter((m) => m.id === targetModuleId);
    }
    return rawModules;
  }, [rawModules, targetModuleId]);

  const previewLessonId =
    learningQuery.data?.preview?.preview_lesson_id ||
    packageItem?.preview?.lesson?.id;

  // 2. Fetch Flashcards Preview (scoped to targetModuleId & canonical previewLessonId, max 15)
  const flashcardsQuery = useQuery({
    queryKey: ["package-modal-flashcards", effectiveCourseId, targetModuleId, previewLessonId, previewSessionId],
    queryFn: () =>
      studyApi.getCourseFlashcards(effectiveCourseId!, {
        moduleId: targetModuleId,
        previewLessonId: previewLessonId || undefined,
        previewSessionId,
        limit: 15,
      }),
    enabled: Boolean(open && effectiveCourseId && activeTab === "flashcard"),
    staleTime: 60_000,
  });

  // 3. Fetch Quiz List / Preview
  const quizzesQuery = useQuery({
    queryKey: ["package-modal-quizzes", effectiveCourseId],
    queryFn: () => studyApi.getCourseQuizzes(effectiveCourseId!),
    enabled: Boolean(open && effectiveCourseId && activeTab === "quiz"),
    staleTime: 60_000,
  });

  const activeQuizId =
    packageItem?.preview?.quiz?.id ||
    quizzesQuery.data?.quizzes?.[0]?.id;

  const quizDetailQuery = useQuery({
    queryKey: ["package-modal-quiz-detail", effectiveCourseId, activeQuizId, targetModuleId, previewLessonId, previewSessionId],
    queryFn: () =>
      studyApi.getCourseQuiz(effectiveCourseId!, activeQuizId!, {
        moduleId: targetModuleId,
        previewLessonId: previewLessonId || undefined,
        previewSessionId,
      }),
    enabled: Boolean(open && effectiveCourseId && activeQuizId && activeTab === "quiz"),
    staleTime: 60_000,
  });

  // Submit Quiz Mutation
  const submitQuizMutation = useMutation({
    mutationFn: () => {
      const formattedAnswers = Object.entries(answers).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));
      return studyApi.submitCourseQuizAttempt(effectiveCourseId!, activeQuizId!, {
        answers: formattedAnswers,
      });
    },
    onSuccess: (data) => {
      setAttemptResult(data);
    },
  });

  useEffect(() => {
    if (modules.length > 0) {
      // Auto-expand module containing preview lesson
      setExpandedModules(new Set(modules.map((m) => m.id)));

      if (!selectedLessonId) {
        if (previewLessonId) {
          setSelectedLessonId(previewLessonId);
        } else {
          const firstPreview = modules.flatMap((m) => m.lessons).find((l) => l.is_preview || !l.locked);
          setSelectedLessonId(firstPreview ? firstPreview.id : modules[0].lessons[0]?.id || null);
        }
      }
    }
  }, [modules, previewLessonId, selectedLessonId]);

  if (!open || !targetItem) return null;

  const currentLesson = modules
    .flatMap((m) => m.lessons)
    .find((l) => l.id === selectedLessonId);

  const previewCards = flashcardsQuery.data?.flashcards || (flashcardsQuery.data as any)?.items || [];
  const currentCard = previewCards[cardIndex];

  const quizQuestions = quizDetailQuery.data?.quiz?.questions || [];
  const currentQuestion = quizQuestions[questionIndex];

  return (
    <Dialog
      isOpen={open && !!targetItem}
      onClose={onClose}
      maxWidth="4xl"
      hideHeader
    >
      {/* 1. Header */}
      <DialogHeader onClose={onClose}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Badge variant="primary">
            {subject}
          </Badge>

          {hasAccess ? (
            <Badge variant="success" icon={<CheckCircle2 className="w-3 h-3" />}>
              دسترسی کامل فعال
            </Badge>
          ) : (
            <Badge variant="info" icon={<Sparkles className="w-3 h-3" />}>
              پیش‌نمایش رایگان بسته
            </Badge>
          )}

          {courseTitle && (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] font-medium">
              <GraduationCap className="w-3.5 h-3.5 text-[#008080]" />
              <span>دوره: {courseTitle}</span>
            </span>
          )}
        </div>

        <h2
          id="chapter-package-title"
          className="text-lg sm:text-xl font-extrabold text-[var(--color-text)]"
        >
          {title}
        </h2>

        {/* Free Preview Explanatory Banner */}
        {!hasAccess && (
          <div className="mt-3 p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center gap-2 text-xs text-sky-700 dark:text-sky-300 font-medium">
            <Sparkles className="w-4 h-4 text-sky-500 shrink-0" />
            <span>این محتوا پولی است، اما برای آشنایی یک بخش از آن رایگان است.</span>
          </div>
        )}
      </DialogHeader>

      {/* 2. Navigation Tabs */}
      <div className="flex items-center gap-1 px-6 pt-3 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] overflow-x-auto shrink-0">
        <button
          type="button"
          data-testid="tab-package-lesson"
          onClick={() => setActiveTab("lesson")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all shrink-0 cursor-pointer ${
            activeTab === "lesson"
              ? "border-[#008080] text-[#008080]"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <BookOpen className="w-4 h-4 text-blue-500" />
          <span>درسنامه و سرفصل‌ها</span>
          {!hasAccess && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-700 dark:text-sky-300">
              پیش‌نمایش رایگان
            </span>
          )}
        </button>

        <button
          type="button"
          data-testid="tab-package-summary"
          onClick={() => setActiveTab("summary")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all shrink-0 cursor-pointer ${
            activeTab === "summary"
              ? "border-[#008080] text-[#008080]"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <FileText className="w-4 h-4 text-cyan-500" />
          <span>خلاصه و جمع‌بندی</span>
        </button>

        <button
          type="button"
          data-testid="tab-package-flashcard"
          onClick={() => setActiveTab("flashcard")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all shrink-0 cursor-pointer ${
            activeTab === "flashcard"
              ? "border-[#008080] text-[#008080]"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <Layers className="w-4 h-4 text-amber-500" />
          <span>فلش‌کارت‌ها</span>
          {!hasAccess && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300">
              پیش‌نمایش رایگان (تا {toPersianDigits(15)} کارت)
            </span>
          )}
        </button>

        <button
          type="button"
          data-testid="tab-package-quiz"
          onClick={() => setActiveTab("quiz")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all shrink-0 cursor-pointer ${
            activeTab === "quiz"
              ? "border-[#008080] text-[#008080]"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <HelpCircle className="w-4 h-4 text-purple-500" />
          <span>آزمون تستی</span>
          {!hasAccess && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-700 dark:text-purple-300">
              پیش‌نمایش رایگان ({toPersianDigits(5)} سوال)
            </span>
          )}
        </button>
      </div>

      {/* 3. Main Body */}
      <DialogContent className="p-4 sm:p-6 space-y-6 max-h-[72vh] overflow-y-auto custom-scrollbar">
        {/* TAB 1: LESSON & SYLLABUS OUTLINE */}
        {activeTab === "lesson" && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-200 leading-relaxed">
              این بسته شامل درسنامه ساختاریافته به همراه مفاهیم علمی، جداول آموزشی و نکات بالینی استاندارد است.
            </div>

            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-[var(--color-text-muted)]">عنوان درسنامه:</h4>
              <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)]">
                {packageItem?.contents?.lesson?.title || title}
              </div>
            </div>

            {learningQuery.isLoading ? (
              <div className="py-12">
                <LoadingState message="در حال بارگذاری سرفصل‌ها و درسنامه نمونه..." />
              </div>
            ) : learningQuery.isError ? (
              <Card className="p-8 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                <p className="text-sm font-bold text-[var(--color-text)]">
                  خطا در دریافت اطلاعات سرفصل‌ها
                </p>
                <Button size="sm" variant="outline" onClick={() => void learningQuery.refetch()}>
                  تلاش مجدد
                </Button>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* SECTION 1: Full Curriculum Outline (فهرست کامل سرفصل‌ها) */}
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                    <h3 className="text-xs font-extrabold text-[var(--color-text)] flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-primary" />
                      <span>فهرست کامل سرفصل‌ها و جلسات این بسته ({toPersianDigits(modules.flatMap((m) => m.lessons).length)} جلسه)</span>
                    </h3>
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      برای مطالعه روی هر درس کلیک کنید
                    </span>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {modules.map((mod) => {
                      const isExpanded = expandedModules.has(mod.id);
                      return (
                        <div
                          key={mod.id}
                          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedModules((prev) => {
                                const next = new Set(prev);
                                if (next.has(mod.id)) next.delete(mod.id);
                                else next.add(mod.id);
                                return next;
                              });
                            }}
                            className="w-full flex items-center justify-between p-2.5 text-start hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer text-xs font-bold text-[var(--color-text)]"
                          >
                            <span>{mod.title}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-[var(--color-text-muted)]" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
                            )}
                          </button>

                          {isExpanded && (
                            <div className="p-2 pt-0 space-y-1 border-t border-[var(--color-border)]">
                              {mod.lessons.map((lesson) => {
                                const isSelected = lesson.id === selectedLessonId;
                                const isLocked = (lesson as any).is_locked || lesson.locked;
                                return (
                                  <button
                                    key={lesson.id}
                                    type="button"
                                    data-testid={`toc-lesson-${lesson.id}`}
                                    onClick={() => setSelectedLessonId(lesson.id)}
                                    className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors cursor-pointer text-start ${
                                      isSelected
                                        ? "bg-primary/15 text-primary font-bold"
                                        : "hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] font-medium"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      {lesson.is_preview ? (
                                        <Sparkles className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                                      ) : isLocked ? (
                                        <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      ) : (
                                        <BookOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                      )}
                                      <span className="truncate">{lesson.title}</span>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      {lesson.is_preview && (
                                        <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-600 dark:text-teal-300 text-[10px] font-bold">
                                          پیش‌نمایش رایگان
                                        </span>
                                      )}
                                      {isLocked && (
                                        <span className="text-[10px] text-slate-400">
                                          قفل
                                        </span>
                                      )}
                                      {lesson.estimated_minutes && (
                                        <span className="text-[10px] text-[var(--color-text-muted)]">
                                          {toPersianDigits(lesson.estimated_minutes)} د
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SECTION 2: Lesson Viewer Content (نمایشگر محتوای درس) */}
                {currentLesson ? (
                  <div className="space-y-4">
                    {/* Lesson Meta Header */}
                    <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-base text-[var(--color-text)]">
                            {currentLesson.title}
                          </h4>
                          {currentLesson.is_preview && (
                            <Badge variant="info" icon={<Sparkles className="w-3 h-3" />}>
                              پیش‌نمایش رایگان
                            </Badge>
                          )}
                        </div>
                        {currentLesson.estimated_minutes && (
                          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                            <Clock className="w-3 h-3 text-[#008080]" />
                            <span>زمان مطالعه: {toPersianDigits(currentLesson.estimated_minutes)} دقیقه</span>
                          </div>
                        )}
                      </div>

                      {currentLesson.is_preview && (
                        <Link
                          to={`/courses/${effectiveCourseId}?lessonId=${currentLesson.id}`}
                          data-testid="btn-view-preview-lesson"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button text-xs font-bold bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
                        >
                          <span>مشاهده درسنامه رایگان</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>

                    {/* Locked Paywall State vs Full Markdown Rendering */}
                    {((currentLesson as any).is_locked ?? currentLesson.locked ?? false) ? (
                      <div className="p-8 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-800/10 to-purple-500/10 border border-amber-400/30 text-center space-y-4 shadow-sm">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
                          <Lock className="w-6 h-6" />
                        </div>
                        <div className="space-y-1.5">
                          <h4 className="font-bold text-base text-[var(--color-text)]">
                            این جلسه جزو محتوای ویژه است
                          </h4>
                          <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto leading-relaxed">
                            برای مطالعه متن کامل این درسنامه، نکات تخصصی و پرسش‌های مرتبط، بسته آموزشی را تهیه کنید.
                          </p>
                        </div>
                        <div className="pt-2 flex items-center justify-center gap-3">
                          <Button
                            variant="primary"
                            size="md"
                            onClick={() => {
                              onClose();
                              onBuy(targetItem);
                            }}
                            leftIcon={<ShoppingBag className="w-4 h-4" />}
                          >
                            خرید و دسترسی کامل {price > 0 ? `(${formatToman(price)})` : ""}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Free preview introduction banner */}
                        {currentLesson.is_preview && (
                          <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center gap-3 text-xs text-teal-700 dark:text-teal-300">
                            <Sparkles className="w-4 h-4 text-teal-500 shrink-0" />
                            <span>
                              شما در حال مطالعه جلسه نمونه رایگان هستید. متن کامل درسنامه بدون هیچ کم‌وکاستی در دسترس شماست.
                            </span>
                          </div>
                        )}

                        {/* Full Lesson Markdown */}
                        <div className="p-4 sm:p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] leading-relaxed text-sm">
                          <MarkdownRenderer
                            content={
                              currentLesson.content_markdown ||
                              (currentLesson as any).content?.markdown ||
                              (typeof (currentLesson as any).content === "string" ? (currentLesson as any).content : "") ||
                              ""
                            }
                            enableLessonCallouts
                          />
                        </div>

                        {/* End of Preview Lesson High-Converting CTA */}
                        {currentLesson.is_preview && (
                          <div className="p-6 rounded-2xl bg-gradient-to-br from-teal-500/15 via-indigo-500/10 to-purple-500/15 border border-teal-500/30 text-center space-y-3.5 shadow-sm">
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-400/20 text-teal-600 dark:text-teal-300 text-xs font-bold">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>پایان جلسه نمونه رایگان</span>
                            </div>
                            <h4 className="text-base font-bold text-[var(--color-text)]">
                              از این مبحث لذت بردید؟ کل این بسته آموزشی را آزاد کنید!
                            </h4>
                            <p className="text-xs text-[var(--color-text-secondary)] max-w-lg mx-auto leading-relaxed">
                              با تهیه این دوره به تمام درسنامه‌های تخصصی، فلش‌کارت‌های هوشمند لایتنر، آزمون‌های آزمایشی استاندارد و یادداشت‌های تفصیلی دسترسی پیدا کنید.
                            </p>
                            <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
                              <Button
                                variant="primary"
                                size="md"
                                onClick={() => {
                                  onClose();
                                  onBuy(targetItem);
                                }}
                                leftIcon={<Zap className="w-4 h-4 fill-current text-amber-300" />}
                              >
                                خرید و دسترسی کامل {price > 0 ? `(${formatToman(price)})` : ""}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-[var(--color-text-muted)]">
                    یک درس را از فهرست بالا انتخاب کنید.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB: SUMMARY */}
        {activeTab === "summary" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-700 dark:text-cyan-200 leading-relaxed">
              {packageItem?.contents?.summary?.overview ||
                "در این بسته مبانی پتانسیل عمل قلبی، کانال‌های کلسیمی نوع L و نکات کلیدی جمع‌بندی شده است. خلاصه پربازده شامل نکات کلیدی و جمع‌بندی سریع مفاهیم اصلی این فصل برای مرور شب امتحان."}
            </div>
            <div className="p-5 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-3">
              <h4 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-500" />
                <span>نکات طلایی و خلاصه فصل</span>
              </h4>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                مفاهیم کلیدی این بخش به گونه‌ای تدوین شده‌اند که در کوتاه‌ترین زمان ممکن، تسلط شما را بر مباحث آزمونی به حداکثر برسانند.
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: FLASHCARDS PREVIEW */}
        {activeTab === "flashcard" && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-200 leading-relaxed">
              مجموعه {packageItem?.stats?.flashcardCount || 24} فلش‌کارت مرور فعال با سیستم تکرار فاصله‌دار (Spaced Repetition) جهت تثبیت در حافظه بلندمدت.
            </div>
            {flashcardsQuery.isLoading ? (
              <div className="py-12">
                <LoadingState message="در حال بارگذاری فلش‌کارت‌های نمونه..." />
              </div>
            ) : flashcardsQuery.isError ? (
              <Card className="p-8 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                <p className="text-sm font-bold text-[var(--color-text)]">
                  خطا در دریافت فلش‌کارت‌ها
                </p>
                <Button size="sm" variant="outline" onClick={() => void flashcardsQuery.refetch()}>
                  تلاش مجدد
                </Button>
              </Card>
            ) : previewCards.length === 0 ? (
              <Card className="p-8 text-center space-y-2 text-xs text-[var(--color-text-muted)]">
                فلش‌کارتی برای پیش‌نمایش در این بسته یافت نشد.
              </Card>
            ) : isFlashcardCompleted ? (
              /* End of 5 Preview Flashcards Completion Screen */
              <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-amber-500/15 via-teal-500/10 to-purple-500/15 border border-amber-400/30 text-center space-y-4 shadow-sm">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-500 border border-amber-500/30 flex items-center justify-center mx-auto">
                  <Sparkles className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-lg font-bold text-[var(--color-text)]">
                    تمام {toPersianDigits(previewCards.length)} فلش‌کارت نمونه را مرور کردید!
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)] max-w-md mx-auto leading-relaxed">
                    برای دسترسی به تمام فلش‌کارت‌های این بسته، مرور فاصله‌دار هوشمند لایتنر (Spaced Repetition) و تثبیت دائمی یادگیری در حافظه بلندمدت، بسته را تهیه کنید.
                  </p>
                </div>
                <div className="pt-3 flex items-center justify-center gap-3 flex-wrap">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => {
                      onClose();
                      onBuy(targetItem);
                    }}
                    leftIcon={<ShoppingBag className="w-4 h-4" />}
                  >
                    خرید و دسترسی به تمام فلش‌کارت‌ها {price > 0 ? `(${formatToman(price)})` : ""}
                  </Button>
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => {
                      setCardIndex(0);
                      setIsCardFlipped(false);
                      setIsFlashcardCompleted(false);
                    }}
                    leftIcon={<RotateCcw className="w-4 h-4" />}
                  >
                    مرور مجدد
                  </Button>
                </div>
              </div>
            ) : (
              /* Active Interactive Flashcard Player */
              <div className="space-y-4 max-w-2xl mx-auto">
                {/* Header bar */}
                <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] pb-2 border-b border-[var(--color-border)] flex-wrap gap-2">
                  <span className="font-bold text-[var(--color-text)]">
                    کارت {toPersianDigits(cardIndex + 1)} از {toPersianDigits(previewCards.length)}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="info" size="sm" icon={<Sparkles className="w-3 h-3" />}>
                      پیش‌نمایش رایگان ({toPersianDigits(previewCards.length)} کارت)
                    </Badge>
                    <Link
                      to={targetModuleId ? `/courses/${effectiveCourseId}/flashcards?moduleId=${targetModuleId}` : `/courses/${effectiveCourseId}/flashcards`}
                      data-testid="btn-view-preview-flashcards"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-button text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500 hover:text-white transition-colors"
                    >
                      <span>مشاهده فلش‌کارت رایگان</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>

                {/* Flip Card Box */}
                <div
                  data-testid="preview-flashcard-interactive"
                  onClick={() => setIsCardFlipped(!isCardFlipped)}
                  role="button"
                  tabIndex={0}
                  className="w-full min-h-[260px] sm:min-h-[300px] p-6 sm:p-8 rounded-2xl bg-[var(--color-surface)] border-2 border-[var(--color-border)] hover:border-[#008080]/50 transition-all flex flex-col justify-between items-center text-center cursor-pointer shadow-ambient"
                >
                  <div className="w-full flex justify-between items-center text-xs text-[var(--color-text-muted)]">
                    <span className="font-semibold text-primary">
                      {isCardFlipped ? "پاسخ" : "پرسش"}
                    </span>
                    <span className="text-[11px]">
                      {isCardFlipped ? "برای مشاهده سوال کلیک کنید" : "برای مشاهده پاسخ کلیک کنید"}
                    </span>
                  </div>

                  <div className="my-auto py-4 text-base sm:text-lg font-bold text-[var(--color-text)] leading-relaxed">
                    {isCardFlipped ? (
                      <div className="space-y-3">
                        <div>
                          <RichContent content={currentCard.answer || (currentCard as any).back || ""} />
                        </div>
                        {currentCard.explanation && (
                          <div className="text-xs text-[var(--color-text-muted)] font-normal border-t border-[var(--color-border)] pt-2 mt-2">
                            <RichContent content={currentCard.explanation} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <RichContent content={currentCard.question || (currentCard as any).front || ""} />
                    )}
                  </div>

                  <div className="text-[11px] text-[var(--color-text-muted)]">
                    کلیک برای چرخش کارت
                  </div>
                </div>

                {/* Navigation Controls */}
                <div className="flex items-center justify-between pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cardIndex === 0}
                    onClick={() => {
                      setCardIndex((i) => Math.max(0, i - 1));
                      setIsCardFlipped(false);
                    }}
                    leftIcon={<ChevronRight className="w-4 h-4" />}
                  >
                    کارت قبلی
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setIsCardFlipped(!isCardFlipped)}
                  >
                    {isCardFlipped ? "مشاهده سوال" : "مشاهده پاسخ"}
                  </Button>

                  {cardIndex < previewCards.length - 1 ? (
                    <Button
                      size="sm"
                      variant="primary"
                      data-testid="btn-next-flashcard"
                      onClick={() => {
                        setCardIndex((i) => i + 1);
                        setIsCardFlipped(false);
                      }}
                      rightIcon={<ChevronLeft className="w-4 h-4" />}
                    >
                      کارت بعدی
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setIsFlashcardCompleted(true)}
                      rightIcon={<Check className="w-4 h-4" />}
                    >
                      پایان مرور
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: QUIZ PREVIEW */}
        {activeTab === "quiz" && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-700 dark:text-purple-200 leading-relaxed">
              آزمون تستی چهارگزینه‌ای شامل {packageItem?.stats?.quizQuestionCount || 15} سوال مفهومی به همراه پاسخ تشریحی و تحلیل گزینه‌ها.
            </div>
            {quizDetailQuery.isLoading ? (
              <div className="py-12">
                <LoadingState message="در حال بارگذاری سوالات آزمون نمونه..." />
              </div>
            ) : quizDetailQuery.isError ? (
              <Card className="p-8 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                <p className="text-sm font-bold text-[var(--color-text)]">
                  خطا در دریافت سوالات آزمون
                </p>
                <Button size="sm" variant="outline" onClick={() => void quizDetailQuery.refetch()}>
                  تلاش مجدد
                </Button>
              </Card>
            ) : quizQuestions.length === 0 ? (
              <Card className="p-8 text-center space-y-2 text-xs text-[var(--color-text-muted)]">
                آزمونی برای پیش‌نمایش در این بسته یافت نشد.
              </Card>
            ) : attemptResult ? (
              /* Quiz Attempt Results Screen */
              <div className="space-y-5 max-w-2xl mx-auto">
                <div className="p-6 rounded-2xl bg-gradient-to-br from-teal-500/15 via-indigo-500/10 to-purple-500/15 border border-teal-500/30 text-center space-y-3 shadow-sm">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-400/20 text-teal-600 dark:text-teal-300 text-xs font-bold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>پایان پیش‌نمایش آزمون</span>
                  </div>
                  <h4 className="text-xl font-black text-[var(--color-text)]">
                    نمره شما: {toPersianDigits(attemptResult.score_percent || 0)}٪
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {toPersianDigits(attemptResult.correct_count || 0)} پاسخ صحیح • {toPersianDigits(attemptResult.incorrect_count || 0)} پاسخ نادرست
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto leading-relaxed pt-1">
                    برای دسترسی به بانک کامل سوالات آزمون، شبیه‌سازهای پایان ترم، پاسخ‌های تشریحی تفصیلی و ثبت رسمی کارنامه تحصیلی، بسته را تهیه کنید.
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => {
                        onClose();
                        onBuy(targetItem);
                      }}
                      leftIcon={<ShoppingBag className="w-4 h-4" />}
                    >
                      خرید و فعال‌سازی آزمون کامل {price > 0 ? `(${formatToman(price)})` : ""}
                    </Button>
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => {
                        setQuestionIndex(0);
                        setAnswers({});
                        setAttemptResult(null);
                      }}
                      leftIcon={<RotateCcw className="w-4 h-4" />}
                    >
                      آزمون مجدد
                    </Button>
                  </div>
                </div>

                {/* Per-question breakdown */}
                <div className="space-y-3">
                  <h5 className="text-xs font-bold text-[var(--color-text)]">
                    مرور سوالات آزمون نمونه:
                  </h5>
                  {quizQuestions.map((q: any, idx: number) => {
                    const evalRes = attemptResult.questionResults?.[q.id];
                    const isCorrect = evalRes?.status === "correct";
                    return (
                      <div
                        key={q.id}
                        className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[var(--color-text)]">
                            سوال {toPersianDigits(idx + 1)}
                          </span>
                          {isCorrect ? (
                            <span className="text-emerald-500 flex items-center gap-1 font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>صحیح</span>
                            </span>
                          ) : (
                            <span className="text-red-400 flex items-center gap-1 font-bold">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>نادرست</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[var(--color-text)] font-medium leading-relaxed">
                          <RichContent content={q.question} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Active Quiz Question Taking */
              <div className="space-y-5 max-w-2xl mx-auto">
                <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] flex-wrap gap-2">
                  <span className="font-bold text-[var(--color-text)]">
                    {formatPersianOf(questionIndex + 1, quizQuestions.length, { prefix: "سوال" })}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="info" size="sm" icon={<Sparkles className="w-3 h-3" />}>
                      پیش‌نمایش رایگان ({toPersianDigits(quizQuestions.length)} سوال)
                    </Badge>
                    {activeQuizId && (
                      <Link
                        to={targetModuleId ? `/courses/${effectiveCourseId}/quizzes/${activeQuizId}?moduleId=${targetModuleId}` : `/courses/${effectiveCourseId}/quizzes/${activeQuizId}`}
                        data-testid="btn-view-preview-quiz"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-button text-xs font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 hover:bg-purple-500 hover:text-white transition-colors"
                      >
                        <span>شرکت در آزمون رایگان</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>

                <Progress
                  value={((questionIndex + 1) / quizQuestions.length) * 100}
                  max={100}
                  aria-label="پیشرفت آزمون"
                />

                {currentQuestion && (
                  <Card className="p-5 sm:p-6 space-y-4">
                    <div className="text-sm sm:text-base font-bold text-[var(--color-text)] leading-relaxed">
                      <RichContent content={currentQuestion.question} />
                    </div>

                    {/* Choices list */}
                    {currentQuestion.choices && (
                      <div className="space-y-2 pt-2">
                        {currentQuestion.choices.map((choice: string, cIdx: number) => {
                          const isSelected =
                            answers[currentQuestion.id] === choice ||
                            answers[currentQuestion.id] === cIdx;
                          return (
                            <button
                              key={cIdx}
                              type="button"
                              onClick={() => {
                                setAnswers((prev) => ({
                                  ...prev,
                                  [currentQuestion.id]: choice,
                                }));
                              }}
                              className={`w-full text-start p-3 rounded-xl border text-xs sm:text-sm font-medium transition-all flex items-center gap-3 cursor-pointer ${
                                isSelected
                                  ? "border-[#008080] bg-[#e0f2f2] text-[#006666] font-bold ring-2 ring-[#008080]/20"
                                  : "border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] bg-[var(--color-surface)]"
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                  isSelected
                                    ? "bg-[#008080] text-white"
                                    : "bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                                }`}
                              >
                                {toPersianDigits(cIdx + 1)}
                              </span>
                              <span>{choice}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Navigation Buttons */}
                    <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={questionIndex === 0}
                        onClick={() => setQuestionIndex((i) => Math.max(0, i - 1))}
                        leftIcon={<ChevronRight className="w-4 h-4" />}
                      >
                        سوال قبلی
                      </Button>

                      {questionIndex < quizQuestions.length - 1 ? (
                        <Button
                          size="sm"
                          variant="primary"
                          data-testid="btn-next-question"
                          onClick={() => setQuestionIndex((i) => i + 1)}
                          rightIcon={<ChevronLeft className="w-4 h-4" />}
                        >
                          سوال بعدی
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          data-testid="btn-submit-quiz-preview"
                          isLoading={submitQuizMutation.isPending}
                          onClick={() => submitQuizMutation.mutate()}
                          rightIcon={<Check className="w-4 h-4" />}
                        >
                          ثبت نهایی و مشاهده کارنامه
                        </Button>
                      )}
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>

      {/* 4. Footer */}
      <DialogFooter>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--color-text-muted)]">مجموع زمان تقریبی مطالعه:</span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#008080] bg-[#008080]/10 px-2.5 py-1 rounded-full border border-[#008080]/20">
            <Clock className="w-3.5 h-3.5" />
            <span>~{toPersianDigits(estimatedMinutes)} دقیقه</span>
          </span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          {hasAccess ? (
            <Link
              to={`/courses/${effectiveCourseId}/learn`}
              className="w-full sm:w-auto text-decoration-none"
            >
              <Button
                size="md"
                variant="primary"
                className="w-full sm:w-auto"
                rightIcon={<ExternalLink className="w-4 h-4" />}
              >
                ورود به محیط مطالعه و یادگیری
              </Button>
            </Link>
          ) : (
            <Button
              size="md"
              variant="primary"
              data-testid="modal-footer-buy-btn"
              onClick={() => {
                onClose();
                onBuy(targetItem);
              }}
              className="w-full sm:w-auto"
              leftIcon={<ShoppingBag className="w-4 h-4" />}
            >
              خرید و دسترسی کامل {price > 0 ? `(${formatToman(price)})` : ""}
            </Button>
          )}
        </div>
      </DialogFooter>
    </Dialog>
  );
}
