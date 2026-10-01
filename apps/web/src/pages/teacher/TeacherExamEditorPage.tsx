/**
 * TeacherExamEditorPage.
 *
 * Comprehensive draft exam & question authoring suite:
 *  - Edit exam configuration (title, schedule, duration, passing score, rules)
 *  - Add, edit, delete, and reorder multiple-choice questions
 *  - Enforces stable option IDs and single authoritative correct answer key
 *  - Strict draft lock: questions are 100% immutable once published or archived
 *  - Pre-publication validation and explicit confirmation modal
 */

import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  useTeacherExam,
  useExamQuestions,
  useUpdateExam,
  useCreateQuestion,
  useUpdateQuestion,
  useDeleteQuestion,
  useReorderQuestions,
  usePublishExam,
} from "../../hooks/useTeacher.js";
import {
  PageHeader,
  Card,
  Input,
  Textarea,
  Button,
  Badge,
  Switch,
  Alert,
  LoadingState,
  EmptyState,
  PersianDatePicker,
} from "../../components/ui/index.js";
import { QuestionEditorItem } from "../../components/teacher/exams/QuestionEditorItem.js";
import { PublishConfirmModal } from "../../components/teacher/exams/PublishConfirmModal.js";
import { ExamStatusBadge } from "../../components/teacher/exams/ExamStatusBadge.js";
import type { ExamOption, TeacherQuestionInput } from "@avana/domain";
import { toPersianDigits } from "@avana/domain";
import {
  combineLocalDateAndTimeToIso,
  extractLocalDateAndTimeString,
  formatPersianExamDate,
  formatPersianTimeOnly,
} from "../../utils/date.js";
import { ApiError } from "../../lib/api/errors.js";
import {
  HelpCircle,
  Plus,
  Send,
  ArrowRight,
  Settings,
  ListOrdered,
  Lock,
  Eye,
  CheckCircle,
  Clock,
  Calendar,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

export function TeacherExamEditorPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const examQuery = useTeacherExam(examId);
  const questionsQuery = useExamQuestions(examId);

  const exam = examQuery.data?.exam;
  const questions = questionsQuery.data?.questions ?? [];

  // Settings State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [enableDuration, setEnableDuration] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [examDate, setExamDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:30");
  const [enablePassingScore, setEnablePassingScore] = useState(false);
  const [passingScorePercentage, setPassingScorePercentage] = useState(60);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [showResultsImmediately, setShowResultsImmediately] = useState(false);
  const [allowBackNavigation, setAllowBackNavigation] = useState(true);
  const [timingMode, setTimingMode] = useState<string>("off");
  const [customTimingSeconds, setCustomTimingSeconds] = useState<number>(30);
  const [perQuestionTimeSeconds, setPerQuestionTimeSeconds] = useState<number | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  const handleTimingModeChange = (mode: string) => {
    setTimingMode(mode);
    if (mode === "off") {
      setPerQuestionTimeSeconds(null);
    } else if (mode === "custom") {
      setPerQuestionTimeSeconds(customTimingSeconds);
      setAllowBackNavigation(false);
    } else {
      const val = Number(mode);
      setPerQuestionTimeSeconds(val);
      setAllowBackNavigation(false);
    }
  };

  const handleCustomTimingChange = (sec: number) => {
    setCustomTimingSeconds(sec);
    if (timingMode === "custom") {
      setPerQuestionTimeSeconds(sec);
      setAllowBackNavigation(false);
    }
  };

  // Contextual timing analysis for teacher clarity
  const timingAnalysis = useMemo(() => {
    if (!enableDuration || !startTime || !endTime) return null;
    const [sH, sM] = startTime.split(":").map(Number);
    const [eH, eM] = endTime.split(":").map(Number);
    if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return null;

    const startTotalMin = sH * 60 + sM;
    const endTotalMin = eH * 60 + eM;
    const windowMin = endTotalMin - startTotalMin;
    if (windowMin <= 0) return null;

    const isDurationExceedingWindow = durationMinutes > windowMin;

    const formatTimeMin = (tot: number) => {
      const h = Math.floor(tot / 60) % 24;
      const m = tot % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    };

    const offset1 = Math.min(30, Math.floor(windowMin / 4) || 15);
    const sample1StartMin = startTotalMin + offset1;
    const sample1EndMin = Math.min(sample1StartMin + durationMinutes, endTotalMin);

    const lateOffset = Math.max(offset1 + 15, windowMin - Math.floor(durationMinutes / 2));
    const lateStartMin = Math.min(startTotalMin + lateOffset, endTotalMin - 10);

    return {
      windowMin,
      isDurationExceedingWindow,
      sample1Start: toPersianDigits(formatTimeMin(sample1StartMin)),
      sample1End: toPersianDigits(formatTimeMin(sample1EndMin)),
      sampleLateStart: lateStartMin > sample1StartMin ? toPersianDigits(formatTimeMin(lateStartMin)) : null,
    };
  }, [enableDuration, startTime, endTime, durationMinutes]);

  // New Question Form State
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [newQuestionType, setNewQuestionType] = useState<"single_choice" | "descriptive">("single_choice");
  const [newPrompt, setNewPrompt] = useState("");
  const [newPoints, setNewPoints] = useState(1);
  const [newExplanation, setNewExplanation] = useState("");
  const [newOptions, setNewOptions] = useState<ExamOption[]>([
    { id: "opt_1", text: "" },
    { id: "opt_2", text: "" },
    { id: "opt_3", text: "" },
    { id: "opt_4", text: "" },
  ]);
  const [newCorrectOptionId, setNewCorrectOptionId] = useState("opt_1");
  const [newQuestionError, setNewQuestionError] = useState<string | null>(null);

  // Publish Modal State
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Sync settings when exam loads
  useEffect(() => {
    if (exam) {
      setTitle(exam.title);
      setDescription(exam.description ?? "");
      const hasDuration = exam.durationMinutes !== null && exam.durationMinutes !== undefined;
      setEnableDuration(hasDuration);
      setDurationMinutes(hasDuration ? exam.durationMinutes! : 60);

      const hasPassingScore = exam.passingScorePercentage !== null && exam.passingScorePercentage !== undefined;
      setEnablePassingScore(hasPassingScore);
      setPassingScorePercentage(hasPassingScore ? exam.passingScorePercentage! : 60);

      const startExtracted = extractLocalDateAndTimeString(exam.startsAt);
      const endExtracted = extractLocalDateAndTimeString(exam.endsAt);
      setExamDate(startExtracted.dateStr);
      setStartTime(startExtracted.timeStr || "10:00");
      setEndTime(endExtracted.timeStr || "11:30");
      setShuffleQuestions(exam.shuffleQuestions);
      setShuffleOptions(exam.shuffleOptions);
      setShowResultsImmediately(exam.showResultsImmediately);
      setAllowBackNavigation(exam.allowBackNavigation);
      if (exam.perQuestionTimeSeconds && exam.perQuestionTimeSeconds > 0) {
        const sec = exam.perQuestionTimeSeconds;
        setPerQuestionTimeSeconds(sec);
        if ([10, 15, 20, 30, 45, 60, 90, 120].includes(sec)) {
          setTimingMode(String(sec));
        } else {
          setTimingMode("custom");
          setCustomTimingSeconds(sec);
        }
      } else {
        setPerQuestionTimeSeconds(null);
        setTimingMode("off");
      }
    }
  }, [exam]);

  // Mutations
  const updateExamMutation = useUpdateExam(examId ?? "", exam?.classroomId);
  const createQuestionMutation = useCreateQuestion(examId ?? "");
  const updateQuestionMutation = useUpdateQuestion(examId ?? "");
  const deleteQuestionMutation = useDeleteQuestion(examId ?? "");
  const reorderMutation = useReorderQuestions(examId ?? "");
  const publishMutation = usePublishExam(examId ?? "", exam?.classroomId);

  const isDraft = exam?.status === "draft";
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

  // Save Exam Settings
  const handleSaveSettings = async () => {
    setSettingsError(null);
    setSettingsSuccess(false);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      setSettingsError("عنوان آزمون باید حداقل ۳ کاراکتر باشد.");
      return;
    }

    if (enableDuration && (durationMinutes < 5 || durationMinutes > 360)) {
      setSettingsError("مدت زمان آزمون باید بین ۵ تا ۳۶۰ دقیقه باشد.");
      return;
    }

    if (enablePassingScore && (passingScorePercentage < 0 || passingScorePercentage > 100)) {
      setSettingsError("حد نصاب قبولی باید بین ۰ تا ۱۰۰ درصد باشد.");
      return;
    }

    if (!examDate) {
      setSettingsError("لطفاً تاریخ برگزاری آزمون را مشخص کنید.");
      return;
    }

    if (!startTime || !endTime) {
      setSettingsError("لطفاً ساعت شروع و ساعت پایان آزمون را وارد کنید.");
      return;
    }

    const calculatedStartsAt = combineLocalDateAndTimeToIso(examDate, startTime);
    const calculatedEndsAt = combineLocalDateAndTimeToIso(examDate, endTime);

    const startMs = new Date(calculatedStartsAt).getTime();
    const endMs = new Date(calculatedEndsAt).getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      setSettingsError("تاریخ یا ساعت شروع و پایان آزمون نامعتبر است.");
      return;
    }

    if (startMs >= endMs) {
      setSettingsError("ساعت پایان باید بعد از ساعت شروع باشد.");
      return;
    }

    try {
      await updateExamMutation.mutateAsync({
        title: trimmedTitle,
        description: description.trim() || null,
        durationMinutes: enableDuration ? durationMinutes : null,
        startsAt: calculatedStartsAt,
        endsAt: calculatedEndsAt,
        passingScorePercentage: enablePassingScore ? passingScorePercentage : null,
        shuffleQuestions,
        shuffleOptions,
        showResultsImmediately,
        allowBackNavigation: perQuestionTimeSeconds && perQuestionTimeSeconds > 0 ? false : allowBackNavigation,
        perQuestionTimeSeconds: perQuestionTimeSeconds && perQuestionTimeSeconds > 0 ? perQuestionTimeSeconds : null,
      });

      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (err) {
      setSettingsError(err instanceof ApiError ? err.message : "خطا در به‌روزرسانی تنظیمات آزمون.");
    }
  };

  // Add New Question
  const handleCreateQuestion = async () => {
    setNewQuestionError(null);

    const trimmedPrompt = newPrompt.trim();
    if (!trimmedPrompt) {
      setNewQuestionError("صورت سوال نمی‌تواند خالی باشد.");
      return;
    }

    if (newPoints <= 0) {
      setNewQuestionError("بارم سوال باید عددی مثبت باشد.");
      return;
    }

    if (newQuestionType === "single_choice") {
      if (newOptions.length < 2) {
        setNewQuestionError("حداقل دو گزینه برای سوال تستی الزامی است.");
        return;
      }

      for (const opt of newOptions) {
        if (!opt.text.trim()) {
          setNewQuestionError("متن تمام گزینه‌ها باید تکمیل شود.");
          return;
        }
      }

      if (!newCorrectOptionId || !newOptions.some((o) => o.id === newCorrectOptionId)) {
        setNewQuestionError("لطفاً گزینه صحیح را مشخص کنید.");
        return;
      }
    }

    try {
      await createQuestionMutation.mutateAsync({
        questionType: newQuestionType,
        prompt: trimmedPrompt,
        options: newQuestionType === "single_choice" ? newOptions.map((o) => ({ id: o.id, text: o.text.trim() })) : [],
        correctOptionId: newQuestionType === "single_choice" ? newCorrectOptionId : null,
        points: newPoints,
        explanation: newExplanation.trim() || null,
        orderIndex: questions.length,
      });

      // Reset Form
      setNewQuestionType("single_choice");
      setNewPrompt("");
      setNewPoints(1);
      setNewExplanation("");
      setNewOptions([
        { id: "opt_1", text: "" },
        { id: "opt_2", text: "" },
        { id: "opt_3", text: "" },
        { id: "opt_4", text: "" },
      ]);
      setNewCorrectOptionId("opt_1");
      setIsAddingQuestion(false);
    } catch (err) {
      setNewQuestionError(err instanceof ApiError ? err.message : "خطا در ثبت سوال جدید.");
    }
  };

  // Update Question
  const handleUpdateQuestion = async (
    questionId: string,
    updated: TeacherQuestionInput,
  ) => {
    await updateQuestionMutation.mutateAsync({
      questionId,
      input: updated,
    });
  };

  // Delete Question
  const handleDeleteQuestion = async (questionId: string) => {
    await deleteQuestionMutation.mutateAsync(questionId);
  };

  // Reorder Questions (Move Up / Down)
  const handleMoveQuestion = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const reordered = [...questions];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const questionIds = reordered.map((q) => q.id);
    try {
      await reorderMutation.mutateAsync(questionIds);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "خطا در تغییر ترتیب سوالات.");
    }
  };

  // Publish Exam
  const handleConfirmPublish = async () => {
    await publishMutation.mutateAsync();
    navigate(`/teacher/exams/${examId}`);
  };

  if (examQuery.isLoading || questionsQuery.isLoading) {
    return (
      <div className="py-20 flex items-center justify-center font-sans">
        <LoadingState message="در حال دریافت اطلاعات آزمون و سوالات..." />
      </div>
    );
  }

  if (examQuery.error || !exam) {
    return (
      <div className="space-y-4">
        <Alert variant="error" title="آزمون یافت نشد">
          آزمون مورد نظر یافت نشد یا شما دسترسی به آن ندارید.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans max-w-4xl mx-auto" dir="rtl">
      {/* Breadcrumb back */}
      <Link
        to={`/teacher/classrooms/${exam.classroomId}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[#008080] transition-colors"
      >
        <ArrowRight className="w-3.5 h-3.5" />
        <span>بازگشت به کلاس</span>
      </Link>

      {/* Header */}
      <PageHeader
        title={exam.title}
        description={
          isDraft
            ? "ویرایشگر سوالات و تنظیمات آزمون. پس از اتمام طراحی و بررسی سوالات، می‌توانید آزمون را منتشر کنید."
            : "این آزمون منتشر شده یا بایگانی است؛ سوالات آن به منظور حفظ یکپارچگی ارزیابی دانش‌آموزان قفل شده‌اند."
        }
        badge={{
          text: isDraft ? "پیش‌نویس" : exam.status === "published" ? "منتشر شده" : "بایگانی",
          icon: <HelpCircle className="w-3.5 h-3.5" />,
        }}
        actions={
          <div className="flex items-center gap-2">
            <Link to={`/teacher/exams/${exam.id}`}>
              <Button variant="outline" size="sm" leftIcon={<Eye className="w-4 h-4" />}>
                مشاهده صفحه آزمون
              </Button>
            </Link>

            {isDraft && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Send className="w-4 h-4" />}
                onClick={() => setPublishModalOpen(true)}
                disabled={questions.length === 0}
              >
                انتشار رسمی آزمون
              </Button>
            )}
          </div>
        }
      />

      {/* Read-Only Warning Banner if not in Draft */}
      {!isDraft && (
        <Alert variant="warning" title="قفل بودن سوالات">
          <div className="flex items-start gap-2 mt-1">
            <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              امکان افزودن، ویرایش، حذف یا جابجایی سوالات در این وضعیت وجود ندارد. سوالات در حالت فقط-خواندنی هستند.
            </span>
          </div>
        </Alert>
      )}

      {actionError && (
        <Alert variant="error" title="خطا">
          {actionError}
        </Alert>
      )}

      {/* 1. Exam Settings Collapsible Panel */}
      <Card className="p-5 border border-[var(--color-border)] shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#008080]" />
            <h3 className="text-sm sm:text-base font-bold text-[var(--color-text)]">
              تنظیمات عمومی و زمان‌بندی آزمون
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="text-xs"
          >
            {settingsOpen ? "بستن تنظیمات" : "ویرایش مشخصات آزمون"}
          </Button>
        </div>

        {settingsOpen && (
          <div className="pt-3 border-t border-[var(--color-border)] space-y-4">
            {settingsError && (
              <Alert variant="error" title="خطای ورودی">
                {settingsError}
              </Alert>
            )}
            {settingsSuccess && (
              <Alert variant="success" title="موفق">
                تنظیمات آزمون با موفقیت به‌روزرسانی شد.
              </Alert>
            )}

            <Input
              label="عنوان آزمون *"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!isDraft || updateExamMutation.isPending}
            />

            <Textarea
              label="توضیحات و راهنمای شرکت در آزمون"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={!isDraft || updateExamMutation.isPending}
            />

            {/* Section A: Calendar Window */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-[var(--color-text)] block">
                بازه برگزاری آزمون
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <PersianDatePicker
                  label="تاریخ برگزاری آزمون *"
                  value={examDate}
                  onChange={setExamDate}
                  disabled={!isDraft || updateExamMutation.isPending}
                />
                <Input
                  type="time"
                  label="شروع آزمون *"
                  helperText="زمانی که دانشجویان می‌توانند آزمون را شروع کنند."
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={!isDraft || updateExamMutation.isPending}
                  dir="ltr"
                  required
                />

                <Input
                  type="time"
                  label="پایان آزمون *"
                  helperText="بعد از این زمان، امکان شروع یا ادامه آزمون وجود ندارد."
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={!isDraft || updateExamMutation.isPending}
                  dir="ltr"
                  required
                />
              </div>
            </div>

            {/* Section B: Duration & Contextual Timing Helper */}
            <div className="space-y-3 pt-2 border-t border-[var(--color-border)]/60">
              <span className="text-xs font-bold text-[var(--color-text)] block">
                مدت پاسخگویی و حد نصاب قبولی
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Duration Settings */}
                <div className="space-y-3 p-3.5 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-[var(--color-border)]/60">
                      <span className="text-xs font-bold text-[var(--color-text)]">
                        تعیین مدت زمان پاسخگویی
                      </span>
                      <Switch
                        checked={enableDuration}
                        onChange={setEnableDuration}
                        disabled={!isDraft || updateExamMutation.isPending}
                      />
                    </div>

                    <div className={`space-y-2 transition-opacity duration-150 ${!enableDuration ? "opacity-50 pointer-events-none select-none" : ""}`}>
                      <Input
                        type="number"
                        label="مدت زمان آزمون (دقیقه)"
                        min={5}
                        max={360}
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 60)}
                        helperText="مدتی که هر دانشجو از لحظه شروع آزمون فرصت پاسخگویی دارد."
                        disabled={!enableDuration || !isDraft || updateExamMutation.isPending}
                      />
                    </div>
                  </div>

                  {!enableDuration && (
                    <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mt-2 pt-2 border-t border-[var(--color-border)]/40">
                      مدت زمان غیرفعال است؛ دانشجویان می‌توانند در کل بازه برگزاری آزمون پاسخ دهند.
                    </p>
                  )}
                </div>

                {/* Passing Score Settings */}
                <div className="space-y-3 p-3.5 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-[var(--color-border)]/60">
                      <span className="text-xs font-bold text-[var(--color-text)]">
                        تعیین حد نصاب قبولی
                      </span>
                      <Switch
                        checked={enablePassingScore}
                        onChange={setEnablePassingScore}
                        disabled={!isDraft || updateExamMutation.isPending}
                      />
                    </div>

                    <div className={`space-y-2 transition-opacity duration-150 ${!enablePassingScore ? "opacity-50 pointer-events-none select-none" : ""}`}>
                      <Input
                        type="number"
                        label="حد نصاب قبولی (درصد)"
                        min={0}
                        max={100}
                        value={passingScorePercentage}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setPassingScorePercentage(isNaN(val) ? 0 : val);
                        }}
                        helperText="حداقل درصد نمره لازم برای قبولی در آزمون (بدون نمره منفی)."
                        disabled={!enablePassingScore || !isDraft || updateExamMutation.isPending}
                      />
                    </div>
                  </div>

                  {!enablePassingScore && (
                    <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mt-2 pt-2 border-t border-[var(--color-border)]/40">
                      حد نصاب غیرفعال است؛ آزمون بدون شرط قبولی/مردودی و صرفاً نمره‌ای ارزیابی می‌شود.
                    </p>
                  )}
                </div>
              </div>

              {/* Contextual Real-Value Guidance & Warning */}
              {enableDuration && timingAnalysis && (
                <div className="space-y-2 pt-1">
                  {timingAnalysis.isDurationExceedingWindow ? (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 leading-relaxed flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        مدت پاسخگویی آزمون ({toPersianDigits(durationMinutes)} دقیقه) از کل بازه برگزاری ({toPersianDigits(timingAnalysis.windowMin)} دقیقه) بیشتر است. دانشجویان در هر صورت حداکثر تا ساعت {toPersianDigits(endTime)} فرصت پاسخگویی خواهند داشت.
                      </span>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-[var(--color-surface-warm)]/60 border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] leading-relaxed space-y-1">
                      <div className="font-bold text-[var(--color-text)] flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#008080]" />
                        <span>مثال نحوه محاسبه مهلت پاسخگویی:</span>
                      </div>
                      <p>
                        اگر آزمون از ساعت {toPersianDigits(startTime)} تا {toPersianDigits(endTime)} برگزار شود و مدت پاسخگویی {toPersianDigits(durationMinutes)} دقیقه باشد، دانشجویی که ساعت {timingAnalysis.sample1Start} شروع کند تا ساعت {timingAnalysis.sample1End} فرصت دارد{timingAnalysis.sampleLateStart ? `؛ اما دانشجویی که دیرتر (مثلاً ساعت ${timingAnalysis.sampleLateStart}) شروع کند، فقط تا ساعت پایان (${toPersianDigits(endTime)}) فرصت خواهد داشت.` : "؛ اما اگر دانشجو نزدیک ساعت پایان شروع کند، زمان باقی‌مانده کمتر خواهد بود."}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section C: Rules & Options */}
            <div className="space-y-3 pt-3 border-t border-[var(--color-border)]">
              <span className="text-xs font-bold text-[var(--color-text)] block">
                قوانین، تصادفی‌سازی و نمایش نتایج
              </span>

              <div className="p-3 rounded-xl bg-[#008080]/5 border border-[#008080]/20 text-xs text-[#008080] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-[#008080]" />
                <span>
                  هر دانشجو <strong>فقط ۱ بار</strong> مجاز به شرکت در این آزمون است و پاسخ‌ها به صورت <strong>خودکار و لحظه‌ای</strong> در سرور ذخیره می‌شوند.
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-[var(--color-text)]">
                    بر هم زدن تصادفی ترتیب سوالات
                  </span>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    ترتیب سوالات برای هر دانشجو به صورت مجزا و تصادفی چیده می‌شود.
                  </p>
                </div>
                <Switch
                  checked={shuffleQuestions}
                  onChange={setShuffleQuestions}
                  disabled={!isDraft || updateExamMutation.isPending}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-[var(--color-text)]">
                    بر هم زدن تصادفی ترتیب گزینه‌ها
                  </span>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    ترتیب گزینه‌های هر سوال برای هر دانشجو تصادفی جابجا می‌شود.
                  </p>
                </div>
                <Switch
                  checked={shuffleOptions}
                  onChange={setShuffleOptions}
                  disabled={!isDraft || updateExamMutation.isPending}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <div className="space-y-0.5">
                  <span className="text-xs sm:text-sm font-semibold text-[var(--color-text)]">
                    نمایش آنی کارنامه و پاسخ‌ها پس از ارسال
                  </span>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    در صورت فعال بودن، بلافاصله پس از ثبت نهایی آزمون، نمره و پاسخ‌های صحیح به دانشجو نمایش داده می‌شود. در غیر این صورت تا زمان انتشار دستی توسط شما یا پایان مهلت آزمون مخفی می‌ماند.
                  </p>
                </div>
                <Switch
                  checked={showResultsImmediately}
                  onChange={setShowResultsImmediately}
                  disabled={!isDraft || updateExamMutation.isPending}
                />
              </div>

              <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs sm:text-sm font-semibold text-[var(--color-text)]">
                      زمان پاسخگویی برای هر سؤال
                    </span>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      حداکثر زمانی که دانشجو برای پاسخ‌دادن به هر سؤال دارد. این زمان با مدت کل آزمون متفاوت است (با پایان زمان هر سؤال، به سؤال بعدی هدایت شده و امکان بازگشت وجود ندارد).
                    </p>
                  </div>
                  <select
                    value={timingMode}
                    onChange={(e) => handleTimingModeChange(e.target.value)}
                    disabled={!isDraft || updateExamMutation.isPending}
                    className="px-3 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-text)] focus:outline-hidden focus:ring-2 focus:ring-[#008080]"
                  >
                    <option value="off">خاموش</option>
                    <option value="10">۱۰ ثانیه</option>
                    <option value="15">۱۵ ثانیه</option>
                    <option value="20">۲۰ ثانیه</option>
                    <option value="30">۳۰ ثانیه</option>
                    <option value="45">۴۵ ثانیه</option>
                    <option value="60">۶۰ ثانیه</option>
                    <option value="90">۹۰ ثانیه</option>
                    <option value="120">۱۲۰ ثانیه</option>
                    <option value="custom">سفارشی...</option>
                  </select>
                </div>

                {timingMode === "custom" && (
                  <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]/60">
                    <label className="text-xs text-[var(--color-text)] font-medium">
                      مقدار سفارشی (ثانیه بین ۵ تا ۳۶۰۰):
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={3600}
                      value={customTimingSeconds}
                      onChange={(e) => handleCustomTimingChange(Number(e.target.value))}
                      disabled={!isDraft || updateExamMutation.isPending}
                      className="w-24 px-3 py-1 text-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-mono font-bold text-[var(--color-text)] focus:outline-hidden focus:ring-2 focus:ring-[#008080]"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <div className="space-y-0.5">
                  <span className="text-xs sm:text-sm font-semibold text-[var(--color-text)]">
                    بازگشت به سؤالات قبلی
                  </span>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {perQuestionTimeSeconds && perQuestionTimeSeconds > 0
                      ? "در صورت فعال بودن زمان برای هر سؤال، امکان بازگشت به سؤالات قبلی غیرفعال است."
                      : "دانشجو می‌تواند در طول آزمون به سؤالات قبلی بازگردد و گزینه‌های انتخابی خود را تغییر دهد."}
                  </p>
                </div>
                <Switch
                  checked={perQuestionTimeSeconds && perQuestionTimeSeconds > 0 ? false : allowBackNavigation}
                  onChange={setAllowBackNavigation}
                  disabled={Boolean(perQuestionTimeSeconds && perQuestionTimeSeconds > 0) || !isDraft || updateExamMutation.isPending}
                />
              </div>
            </div>

            {isDraft && (
              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveSettings}
                  isLoading={updateExamMutation.isPending}
                >
                  ذخیره تنظیمات
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 2. Questions Authoring Section */}
      <div className="space-y-4">
        {/* Header bar for questions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
              <ListOrdered className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-[var(--color-text)]">
                بانک سوالات آزمون
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                مجموع: {questions.length.toLocaleString("fa-IR")} سوال ({totalPoints.toLocaleString("fa-IR")} نمره)
              </p>
            </div>
          </div>

          {isDraft && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setIsAddingQuestion(true)}
              disabled={isAddingQuestion}
            >
              طرح سوال جدید
            </Button>
          )}
        </div>

        {/* Inline Add Question Card */}
        {isAddingQuestion && (
          <Card className="p-5 border-2 border-[#008080]/40 shadow-md space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <h4 className="font-bold text-sm text-[var(--color-text)]">
                طرح سوال جدید (سوال {(questions.length + 1).toLocaleString("fa-IR")})
              </h4>
              <Badge variant="primary" size="sm">
                در حال طراحی
              </Badge>
            </div>

            {newQuestionError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 text-xs font-semibold">
                {newQuestionError}
              </div>
            )}

            {/* Question Type Toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--color-text)]">
                نوع سوال *
              </label>
              <div className="flex items-center gap-4 p-2.5 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--color-text)]">
                  <input
                    type="radio"
                    name="new-qtype"
                    value="single_choice"
                    checked={newQuestionType === "single_choice"}
                    onChange={() => setNewQuestionType("single_choice")}
                    className="w-4 h-4 text-[#008080] focus:ring-[#008080]"
                  />
                  <span>تستی (چهارگزینه‌ای)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--color-text)]">
                  <input
                    type="radio"
                    name="new-qtype"
                    value="descriptive"
                    checked={newQuestionType === "descriptive"}
                    onChange={() => setNewQuestionType("descriptive")}
                    className="w-4 h-4 text-[#008080] focus:ring-[#008080]"
                  />
                  <span>تشریحی (تصحیح دستی)</span>
                </label>
              </div>
            </div>

            <Textarea
              label="صورت سوال *"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              rows={2}
              placeholder="صورت سوال را به دقت بنویسید..."
              required
              autoFocus
            />

            {newQuestionType === "single_choice" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--color-text)]">
                    گزینه‌ها (یکی را به عنوان پاسخ صحیح علامت بزنید) *
                  </label>
                </div>

                <div className="space-y-2">
                  {newOptions.map((opt, optIdx) => {
                    const isCorrect = opt.id === newCorrectOptionId;
                    return (
                      <div key={opt.id} className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                          <input
                            type="radio"
                            name="new-correct-opt"
                            checked={isCorrect}
                            onChange={() => setNewCorrectOptionId(opt.id)}
                            className="w-4 h-4 text-[#008080] focus:ring-[#008080]"
                          />
                          <span className="text-xs font-bold text-[var(--color-text)]">
                            گزینه {(optIdx + 1).toLocaleString("fa-IR")}
                          </span>
                        </label>

                        <Input
                          value={opt.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewOptions((prev) =>
                              prev.map((o) => (o.id === opt.id ? { ...o, text: val } : o)),
                            );
                          }}
                          placeholder={`متن گزینه ${(optIdx + 1).toLocaleString("fa-IR")}...`}
                          className={isCorrect ? "border-emerald-500/60 focus:border-emerald-500" : ""}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-300">
                برای سوالات تشریحی گزینه‌ای تعریف نمی‌شود؛ دانش‌آموز متن پاسخ خود را در یک کادر متنی بزرگ تایپ می‌کند و پس از ارسال آزمون، شما به صورت دستی آن را نمره‌دهی خواهید کرد.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                type="number"
                label="بارم سوال (نمره) *"
                min={0.25}
                step={0.25}
                value={newPoints}
                onChange={(e) => setNewPoints(parseFloat(e.target.value) || 1)}
                required
              />

              <Input
                label="توضیح تشریحی یا راهنمای تصحیح (اختیاری)"
                value={newExplanation}
                onChange={(e) => setNewExplanation(e.target.value)}
                placeholder={newQuestionType === "descriptive" ? "نکات کلیدی برای نمره‌دهی..." : "توضیح راه حل یا نکته تست..."}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsAddingQuestion(false);
                  setNewQuestionError(null);
                }}
                disabled={createQuestionMutation.isPending}
              >
                انصراف
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateQuestion}
                isLoading={createQuestionMutation.isPending}
              >
                افزودن به آزمون
              </Button>
            </div>
          </Card>
        )}

        {/* Questions List */}
        {questions.length === 0 && !isAddingQuestion ? (
          <EmptyState
            icon={<HelpCircle className="w-8 h-8" />}
            title="هیچ سوالی در این آزمون ثبت نشده است"
            description="برای اینکه بتوانید آزمون را برای دانش‌آموزان منتشر کنید، باید حداقل یک سوال چهارگزینه‌ای طرح نمایید."
            action={
              isDraft && (
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="w-4 h-4" />}
                  onClick={() => setIsAddingQuestion(true)}
                >
                  طرح اولین سوال
                </Button>
              )
            }
          />
        ) : (
          <div className="space-y-4">
            {questions.map((q, idx) => (
              <QuestionEditorItem
                key={q.id}
                question={q}
                index={idx}
                totalQuestions={questions.length}
                onSave={handleUpdateQuestion}
                onDelete={handleDeleteQuestion}
                onMoveUp={isDraft && idx > 0 ? () => handleMoveQuestion(idx, "up") : undefined}
                onMoveDown={
                  isDraft && idx < questions.length - 1
                    ? () => handleMoveQuestion(idx, "down")
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal: Publish Confirmation */}
      {publishModalOpen && (
        <PublishConfirmModal
          isOpen={publishModalOpen}
          onClose={() => setPublishModalOpen(false)}
          onConfirm={handleConfirmPublish}
          isPublishing={publishMutation.isPending}
          questionsCount={questions.length}
          startsAt={exam.startsAt}
          endsAt={exam.endsAt}
        />
      )}
    </div>
  );
}
