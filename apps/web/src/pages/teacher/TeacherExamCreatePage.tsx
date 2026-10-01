/**
 * TeacherExamCreatePage.
 *
 * Form to create a new draft exam under a classroom:
 *  - Title and description
 *  - StartsAt and EndsAt using PersianDatePicker
 *  - Duration (minutes)
 *  - Passing score percentage
 *  - Question & option shuffling toggles
 *  - Result visibility settings
 *
 * On success: navigates directly to /teacher/exams/:examId/edit to author questions.
 * Does NOT publish automatically.
 */

import { useState, useMemo, type FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTeacherClassroom, useCreateExam } from "../../hooks/useTeacher.js";
import {
  PageHeader,
  Card,
  Input,
  Textarea,
  Button,
  Switch,
  Alert,
  LoadingState,
  PersianDatePicker,
} from "../../components/ui/index.js";
import {
  combineLocalDateAndTimeToIso,
  extractLocalDateAndTimeString,
  formatPersianExamDate,
  formatPersianTimeOnly,
} from "../../utils/date.js";
import { toPersianDigits } from "@avana/domain";
import { ApiError } from "../../lib/api/errors.js";
import { HelpCircle, ArrowRight, Calendar, Settings2, Sliders, Clock, Info, AlertTriangle, ShieldCheck } from "lucide-react";

export function TeacherExamCreatePage() {
  const { classroomId } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();

  const classroomQuery = useTeacherClassroom(classroomId);
  const classroom = classroomQuery.data?.classroom;

  // Initial date defaults: tomorrow 10:00 to 11:30
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowLocal = extractLocalDateAndTimeString(tomorrow);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [enableDuration, setEnableDuration] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [examDate, setExamDate] = useState(tomorrowLocal.dateStr);
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
  const [formError, setFormError] = useState<string | null>(null);

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

  const createMutation = useCreateExam(classroomId ?? "");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      setFormError("عنوان آزمون باید حداقل ۳ کاراکتر باشد.");
      return;
    }

    if (enableDuration && (durationMinutes < 5 || durationMinutes > 360)) {
      setFormError("مدت زمان آزمون باید بین ۵ تا ۳۶۰ دقیقه باشد.");
      return;
    }

    if (enablePassingScore && (passingScorePercentage < 0 || passingScorePercentage > 100)) {
      setFormError("حد نصاب قبولی باید بین ۰ تا ۱۰۰ درصد باشد.");
      return;
    }

    if (!examDate) {
      setFormError("لطفاً تاریخ برگزاری آزمون را مشخص کنید.");
      return;
    }

    if (!startTime || !endTime) {
      setFormError("لطفاً ساعت شروع و ساعت پایان آزمون را وارد کنید.");
      return;
    }

    const calculatedStartsAt = combineLocalDateAndTimeToIso(examDate, startTime);
    const calculatedEndsAt = combineLocalDateAndTimeToIso(examDate, endTime);

    const startMs = new Date(calculatedStartsAt).getTime();
    const endMs = new Date(calculatedEndsAt).getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      setFormError("تاریخ یا ساعت شروع و پایان آزمون نامعتبر است.");
      return;
    }

    if (startMs >= endMs) {
      setFormError("ساعت پایان باید بعد از ساعت شروع باشد.");
      return;
    }

    if (perQuestionTimeSeconds !== null && (perQuestionTimeSeconds < 5 || perQuestionTimeSeconds > 3600)) {
      setFormError("زمان هر سؤال باید عددی بین ۵ تا ۳۶۰۰ ثانیه باشد.");
      return;
    }

    try {
      const res = await createMutation.mutateAsync({
        title: trimmedTitle,
        description: description.trim() || null,
        durationMinutes: enableDuration ? durationMinutes : null,
        startsAt: calculatedStartsAt,
        endsAt: calculatedEndsAt,
        passingScorePercentage: enablePassingScore ? passingScorePercentage : null,
        shuffleQuestions,
        shuffleOptions,
        showResultsImmediately,
        allowBackNavigation: perQuestionTimeSeconds ? false : allowBackNavigation,
        perQuestionTimeSeconds,
      });

      // Navigate to draft question editor
      navigate(`/teacher/exams/${res.exam.id}/edit`);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("خطا در ایجاد آزمون جدید.");
      }
    }
  };

  if (classroomQuery.isLoading) {
    return (
      <div className="py-20 flex items-center justify-center font-sans">
        <LoadingState message="در حال بررسی اطلاعات کلاس..." />
      </div>
    );
  }

  if (classroomQuery.error || !classroom) {
    return (
      <div className="space-y-4">
        <Alert variant="error" title="کلاس یافت نشد">
          کلاس مورد نظر برای تعریف آزمون معتبر نیست.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans max-w-4xl mx-auto" dir="rtl">
      {/* Breadcrumb */}
      <Link
        to={`/teacher/classrooms/${classroom.id}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[#008080] transition-colors"
      >
        <ArrowRight className="w-3.5 h-3.5" />
        <span>بازگشت به کلاس «{classroom.title}»</span>
      </Link>

      <PageHeader
        title="تعریف آزمون جدید (پیش‌نویس)"
        description={`تعریف عنوان، زمان‌بندی و تنظیمات آزمون برای کلاس «${classroom.title}». پس از ایجاد پیش‌نویس، به صفحه طرح و بارم‌بندی سوالات هدایت خواهید شد.`}
        badge={{
          text: "پیش‌نویس",
          icon: <HelpCircle className="w-3.5 h-3.5" />,
        }}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {formError && (
          <Alert variant="error" title="خطای اعتبارسنجی">
            {formError}
          </Alert>
        )}

        {/* 1. General Info Card */}
        <Card className="p-5 border border-[var(--color-border)] shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[var(--color-border)]">
            <Settings2 className="w-4 h-4 text-[#008080]" />
            <h3 className="text-sm sm:text-base font-bold text-[var(--color-text)]">
              مشخصات عمومی آزمون
            </h3>
          </div>

          <div className="space-y-4">
            <Input
              label="عنوان آزمون *"
              placeholder="مثال: آزمون میان‌ترم مبحث مشتق و کاربردها"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={createMutation.isPending}
              required
              autoFocus
            />

            <Textarea
              label="توضیحات و راهنمای شرکت در آزمون (اختیاری)"
              placeholder="توضیحاتی برای دانشجویان در مورد منابع، تعداد سوالات یا نکات ضروری..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={createMutation.isPending}
            />
          </div>
        </Card>

        {/* 2. Schedule and Duration Card */}
        <Card className="p-5 border border-[var(--color-border)] shadow-xs space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-[var(--color-border)]">
            <Calendar className="w-4 h-4 text-[#008080]" />
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--color-text)]">
                زمان‌بندی و مدت زمان آزمون
              </h3>
            </div>
          </div>

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
                disabled={createMutation.isPending}
                required
              />

              <Input
                type="time"
                label="شروع آزمون *"
                helperText="زمانی که دانشجویان می‌توانند آزمون را شروع کنند."
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={createMutation.isPending}
                dir="ltr"
                required
              />

              <Input
                type="time"
                label="پایان آزمون *"
                helperText="بعد از این زمان، امکان شروع یا ادامه آزمون وجود ندارد."
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={createMutation.isPending}
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
                      disabled={createMutation.isPending}
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
                      disabled={!enableDuration || createMutation.isPending}
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
                      disabled={createMutation.isPending}
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
                      disabled={!enablePassingScore || createMutation.isPending}
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
        </Card>

        {/* 3. Execution Rules & Shuffling Card */}
        <Card className="p-5 border border-[var(--color-border)] shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[var(--color-border)]">
            <Sliders className="w-4 h-4 text-[#008080]" />
            <h3 className="text-sm sm:text-base font-bold text-[var(--color-text)]">
              قوانین آزمون، تصادفی‌سازی و نمایش نتایج
            </h3>
          </div>

          <div className="p-3 rounded-xl bg-[#008080]/5 border border-[#008080]/20 text-xs text-[#008080] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 text-[#008080]" />
            <span>
              هر دانشجو <strong>فقط ۱ بار</strong> مجاز به شرکت در این آزمون است و پاسخ‌ها به صورت <strong>خودکار و لحظه‌ای</strong> در سرور ذخیره می‌شوند.
            </span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
              <div className="space-y-0.5">
                <span className="text-xs sm:text-sm font-semibold text-[var(--color-text)]">
                  بر هم زدن تصادفی ترتیب سوالات
                </span>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  ترتیب سوالات برای هر دانشجو به صورت مجزا و تصادفی چیده می‌شود.
                </p>
              </div>
              <Switch
                checked={shuffleQuestions}
                onChange={setShuffleQuestions}
                disabled={createMutation.isPending}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
              <div className="space-y-0.5">
                <span className="text-xs sm:text-sm font-semibold text-[var(--color-text)]">
                  بر هم زدن تصادفی ترتیب گزینه‌ها
                </span>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  ترتیب گزینه‌های هر سوال برای هر دانشجو تصادفی جابجا می‌شود.
                </p>
              </div>
              <Switch
                checked={shuffleOptions}
                onChange={setShuffleOptions}
                disabled={createMutation.isPending}
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
                disabled={createMutation.isPending}
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
                  disabled={createMutation.isPending}
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
                    disabled={createMutation.isPending}
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
                disabled={Boolean(perQuestionTimeSeconds && perQuestionTimeSeconds > 0) || createMutation.isPending}
              />
            </div>
          </div>
        </Card>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link to={`/teacher/classrooms/${classroom.id}`}>
            <Button variant="outline" size="md" disabled={createMutation.isPending}>
              انصراف
            </Button>
          </Link>
          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={createMutation.isPending}
            disabled={createMutation.isPending}
          >
            ایجاد پیش‌نویس و ورود به بخش سوالات
          </Button>
        </div>
      </form>
    </div>
  );
}
