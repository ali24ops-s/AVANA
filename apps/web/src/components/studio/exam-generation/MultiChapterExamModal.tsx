import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Sparkles,
  BookOpen,
  Layers,
  Sliders,
  CheckSquare,
  Square,
  AlertCircle,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { Dialog, Button, Alert, Badge } from "../../ui/index.js";
import { toPersianDigits } from "@avana/domain";
import {
  getStudioApi,
  type CreateExamOperationInput,
  type QuestionBankSourcesResponse,
} from "../../../lib/api/studio-api.js";
import { useCreateExamOperation } from "../../../hooks/useStudioExamOperation.js";

export interface MultiChapterExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  quizId: string;
  onSuccess?: (operationId: string) => void;
  initialCourseId?: string;
  studioApi?: ReturnType<typeof getStudioApi>;
}

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 100;
const DEFAULT_TOTAL_QUESTIONS = 10;

export const MultiChapterExamModal: React.FC<MultiChapterExamModalProps> = ({
  isOpen,
  onClose,
  quizId,
  onSuccess,
  initialCourseId,
  studioApi,
}) => {
  const api = useMemo(() => studioApi ?? getStudioApi(), [studioApi]);
  const createMutation = useCreateExamOperation(quizId, { api });

  // Sources State
  const [sources, setSources] = useState<QuestionBankSourcesResponse | null>(null);
  const [isLoadingSources, setIsLoadingSources] = useState<boolean>(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  // Form State
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [totalQuestions, setTotalQuestions] = useState<number>(DEFAULT_TOTAL_QUESTIONS);
  const [distributionMode, setDistributionMode] = useState<"auto" | "manual">("auto");
  const [manualQuotas, setManualQuotas] = useState<Record<string, number>>({});
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [instructions, setInstructions] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load question bank sources when modal opens
  const fetchSources = useCallback(async () => {
    if (!isOpen) return;
    setIsLoadingSources(true);
    setSourcesError(null);
    try {
      const data = await api.getQuestionBankSources();
      setSources(data);

      // Auto-select course if initialCourseId provided or only one exists
      if (initialCourseId && data.courses.some((c) => c.id === initialCourseId)) {
        setSelectedCourseId(initialCourseId);
      } else if (data.courses.length === 1) {
        setSelectedCourseId(data.courses[0].id);
      }
    } catch (err) {
      setSourcesError(
        err instanceof Error ? err.message : "خطا در بارگذاری دوره‌ها و سرفصل‌ها.",
      );
    } finally {
      setIsLoadingSources(false);
    }
  }, [isOpen, api, initialCourseId]);

  useEffect(() => {
    if (isOpen) {
      void fetchSources();
      setSubmitError(null);
    } else {
      // Reset transient state upon modal close
      setSelectedModuleIds([]);
      setManualQuotas({});
      setInstructions("");
      setSubmitError(null);
      setDistributionMode("auto");
      setTotalQuestions(DEFAULT_TOTAL_QUESTIONS);
      setDifficulty("medium");
    }
  }, [isOpen, fetchSources]);

  // Modules of selected course
  const currentCourse = useMemo(() => {
    if (!sources || !selectedCourseId) return null;
    return sources.courses.find((c) => c.id === selectedCourseId) ?? null;
  }, [sources, selectedCourseId]);

  const courseModules = useMemo(() => {
    return currentCourse?.modules ?? [];
  }, [currentCourse]);

  // When changing course, reset module selections
  const handleCourseChange = (newCourseId: string) => {
    setSelectedCourseId(newCourseId);
    setSelectedModuleIds([]);
    setManualQuotas({});
    setSubmitError(null);
  };

  // Toggle selection of a single module
  const toggleModule = (moduleId: string) => {
    setSelectedModuleIds((prev) => {
      const isSelected = prev.includes(moduleId);
      const next = isSelected ? prev.filter((id) => id !== moduleId) : [...prev, moduleId];

      // Update manual quota default
      setManualQuotas((quotas) => {
        const updated = { ...quotas };
        if (isSelected) {
          delete updated[moduleId];
        } else {
          updated[moduleId] = updated[moduleId] || 1;
        }
        return updated;
      });

      return next;
    });
    setSubmitError(null);
  };

  // Select all modules of current course
  const handleSelectAllModules = () => {
    const allIds = courseModules.map((m) => m.id);
    setSelectedModuleIds(allIds);
    setManualQuotas((prev) => {
      const next: Record<string, number> = {};
      for (const id of allIds) {
        next[id] = prev[id] || 1;
      }
      return next;
    });
    setSubmitError(null);
  };

  // Deselect all modules
  const handleDeselectAllModules = () => {
    setSelectedModuleIds([]);
    setManualQuotas({});
    setSubmitError(null);
  };

  // Switch distribution mode & initialize quotas
  const handleDistributionModeChange = (mode: "auto" | "manual") => {
    setDistributionMode(mode);
    setSubmitError(null);

    if (mode === "manual" && selectedModuleIds.length > 0) {
      // Evenly distribute totalQuestions across selected modules
      const count = selectedModuleIds.length;
      const baseQuota = Math.max(1, Math.floor(totalQuestions / count));
      let remainder = totalQuestions - baseQuota * count;

      const newQuotas: Record<string, number> = {};
      for (const id of selectedModuleIds) {
        let q = baseQuota;
        if (remainder > 0) {
          q += 1;
          remainder -= 1;
        }
        newQuotas[id] = q;
      }
      setManualQuotas(newQuotas);
    }
  };

  // Handle manual quota change for a chapter
  const handleQuotaChange = (moduleId: string, value: number) => {
    const sanitized = Math.max(1, Math.min(MAX_QUESTIONS, Math.floor(value || 1)));
    setManualQuotas((prev) => ({
      ...prev,
      [moduleId]: sanitized,
    }));
    setSubmitError(null);
  };

  // Compute sum of manual quotas
  const manualQuotasSum = useMemo(() => {
    return selectedModuleIds.reduce((sum, id) => sum + (manualQuotas[id] || 0), 0);
  }, [selectedModuleIds, manualQuotas]);

  // Validation
  const validationError = useMemo((): string | null => {
    if (!selectedCourseId) {
      return "لطفاً ابتدا دوره آموزشی مورد نظر را انتخاب کنید.";
    }
    if (selectedModuleIds.length === 0) {
      return "حداقل باید یک فصل برای تولید سؤالات انتخاب شود.";
    }
    if (
      !Number.isInteger(totalQuestions) ||
      totalQuestions < MIN_QUESTIONS ||
      totalQuestions > MAX_QUESTIONS
    ) {
      return `تعداد کل سؤالات باید بین ${toPersianDigits(MIN_QUESTIONS)} تا ${toPersianDigits(MAX_QUESTIONS)} باشد.`;
    }
    if (distributionMode === "manual") {
      for (const id of selectedModuleIds) {
        if (!manualQuotas[id] || manualQuotas[id] < 1) {
          return "سهمیه سؤالات هر فصل باید حداقل ۱ سؤال باشد.";
        }
      }
      if (manualQuotasSum !== totalQuestions) {
        const diff = Math.abs(totalQuestions - manualQuotasSum);
        if (manualQuotasSum < totalQuestions) {
          return `مجموع سهمیه فصول (${toPersianDigits(manualQuotasSum)}) با تعداد کل (${toPersianDigits(totalQuestions)}) برابر نیست. (${toPersianDigits(diff)} سؤال باقیمانده)`;
        } else {
          return `مجموع سهمیه فصول (${toPersianDigits(manualQuotasSum)}) بیشتر از سقف مجاز (${toPersianDigits(totalQuestions)}) است. (${toPersianDigits(diff)} سؤال مازاد)`;
        }
      }
    }
    return null;
  }, [
    selectedCourseId,
    selectedModuleIds,
    totalQuestions,
    distributionMode,
    manualQuotas,
    manualQuotasSum,
  ]);

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitError(null);

    const payload: CreateExamOperationInput = {
      totalQuestions,
      courseId: selectedCourseId,
      difficulty,
      instructions: instructions.trim() || undefined,
      ...(distributionMode === "auto"
        ? { moduleIds: selectedModuleIds }
        : {
            chapterAllocations: selectedModuleIds.map((moduleId) => ({
              moduleId,
              quota: manualQuotas[moduleId] || 1,
            })),
          }),
    };

    try {
      const response = await createMutation.mutateAsync(payload);
      onSuccess?.(response.operation.id);
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "خطایی در ایجاد عملیات تولید آزمون رخ داد.",
      );
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={createMutation.isPending ? () => {} : onClose}
      maxWidth="3xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" dir="rtl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--color-border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-[#008080]">
              <Sparkles className="w-5 h-5 text-[#008080]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
                تولید هوشمند آزمون چندفصلی
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                تولید خودکار سؤالات استاندارد چهارگزینه‌ای از چندین فصل دوره با هوش مصنوعی
              </p>
            </div>
          </div>
          <Badge variant="primary" size="sm" className="hidden sm:inline-flex">
            نسل جدید آزمون‌ساز
          </Badge>
        </div>

        {/* Global Errors */}
        {sourcesError && (
          <Alert variant="error" icon={<AlertCircle className="w-4 h-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span>{sourcesError}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void fetchSources()}
                type="button"
              >
                تلاش مجدد
              </Button>
            </div>
          </Alert>
        )}

        {submitError && (
          <Alert variant="error" icon={<AlertCircle className="w-4 h-4" />}>
            {submitError}
          </Alert>
        )}

        {/* Loading Sources State */}
        {isLoadingSources ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
            <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
            <span className="text-xs">در حال بارگذاری دوره‌ها و فصول آموزشی...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Step 1: Select Course */}
            <div className="space-y-2">
              <label
                htmlFor="course-select"
                className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5"
              >
                <BookOpen className="w-4 h-4 text-[#008080]" />
                <span>۱. انتخاب دوره آموزشی</span>
                <span className="text-red-500">*</span>
              </label>
              <select
                id="course-select"
                aria-label="انتخاب دوره آموزشی"
                value={selectedCourseId}
                onChange={(e) => handleCourseChange(e.target.value)}
                disabled={createMutation.isPending}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#008080] transition-colors cursor-pointer"
              >
                <option value="">-- لطفاً یک دوره را انتخاب کنید --</option>
                {sources?.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title} ({toPersianDigits(course.modules.length)} فصل)
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2: Select Chapters */}
            {selectedCourseId && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#008080]" />
                    <span>۲. انتخاب فصل‌ها (سرفصل‌های آزمون)</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllModules}
                      disabled={createMutation.isPending || courseModules.length === 0}
                      className="text-[11px] font-semibold text-[#008080] hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      انتخاب همه ({toPersianDigits(courseModules.length)})
                    </button>
                    <span className="text-[var(--color-border)]">|</span>
                    <button
                      type="button"
                      onClick={handleDeselectAllModules}
                      disabled={createMutation.isPending || selectedModuleIds.length === 0}
                      className="text-[11px] font-semibold text-[var(--color-text-muted)] hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      لغو انتخاب همه
                    </button>
                  </div>
                </div>

                {courseModules.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-[var(--color-border)] text-center text-xs text-[var(--color-text-muted)]">
                    هیچ فصلی در این دوره یافت نشد.
                  </div>
                ) : (
                  <div
                    role="group"
                    aria-label="فهرست فصل‌های آزمون"
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-1 border border-[var(--color-border)] rounded-xl bg-[var(--color-surface-warm)]/50"
                  >
                    {courseModules.map((module) => {
                      const isSelected = selectedModuleIds.includes(module.id);
                      return (
                        <div
                          key={module.id}
                          onClick={() => !createMutation.isPending && toggleModule(module.id)}
                          className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all select-none ${
                            isSelected
                              ? "bg-teal-50/80 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700/80 text-[var(--color-text)] shadow-xs"
                              : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-teal-200 text-[var(--color-text-muted)]"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[#008080] shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
                            )}
                            <span className="truncate font-medium">{module.title}</span>
                          </div>
                          <span className="text-[10px] text-[var(--color-text-muted)] shrink-0 mr-1">
                            {toPersianDigits(module.lessons?.length || 0)} درس
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="text-[11px] text-[var(--color-text-muted)] flex items-center justify-between">
                  <span>تعداد فصل‌های انتخاب‌شده:</span>
                  <span className="font-bold text-[#008080]">
                    {toPersianDigits(selectedModuleIds.length)} از {toPersianDigits(courseModules.length)} فصل
                  </span>
                </div>
              </div>
            )}

            {/* Step 3: Total Questions & Difficulty */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Total Questions */}
              <div className="space-y-1.5">
                <label
                  htmlFor="total-questions-input"
                  className="text-xs font-bold text-[var(--color-text)] flex items-center justify-between"
                >
                  <span>۳. تعداد کل سؤالات آزمون</span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    (بین {toPersianDigits(MIN_QUESTIONS)} تا {toPersianDigits(MAX_QUESTIONS)})
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="total-questions-input"
                    type="number"
                    min={MIN_QUESTIONS}
                    max={MAX_QUESTIONS}
                    value={totalQuestions}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setTotalQuestions(isNaN(val) ? 0 : val);
                      setSubmitError(null);
                    }}
                    disabled={createMutation.isPending}
                    className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-center font-bold focus:outline-none focus:ring-2 focus:ring-[#008080]"
                  />
                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    {[10, 20, 30, 50].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setTotalQuestions(preset);
                          setSubmitError(null);
                        }}
                        disabled={createMutation.isPending}
                        className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                          totalQuestions === preset
                            ? "bg-[#008080] text-white border-[#008080]"
                            : "border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)]"
                        }`}
                      >
                        {toPersianDigits(preset)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Difficulty Level */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--color-text)] flex items-center justify-between">
                  <span>۴. سطح دشواری آزمون</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: "easy", label: "آسان" },
                    { id: "medium", label: "متوسط" },
                    { id: "hard", label: "دشوار" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDifficulty(item.id as "easy" | "medium" | "hard")}
                      disabled={createMutation.isPending}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        difficulty === item.id
                          ? "bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-[#008080] shadow-xs"
                          : "border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Step 4: Distribution Mode */}
            {selectedModuleIds.length > 0 && (
              <div className="space-y-3 p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)]/40">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-[#008080]" />
                    <span>۵. شیوه توزیع سهمیه سؤالات بین فصول</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDistributionModeChange("auto")}
                      disabled={createMutation.isPending}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        distributionMode === "auto"
                          ? "bg-[#008080] text-white border-[#008080] shadow-xs"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      }`}
                    >
                      توزیع خودکار متوازن
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDistributionModeChange("manual")}
                      disabled={createMutation.isPending}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        distributionMode === "manual"
                          ? "bg-[#008080] text-white border-[#008080] shadow-xs"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      }`}
                    >
                      سهمیه‌بندی دستی
                    </button>
                  </div>
                </div>

                {/* Auto mode explanation */}
                {distributionMode === "auto" && (
                  <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                    سیستم هوش مصنوعی تعداد {toPersianDigits(totalQuestions)} سؤال را به نسبت برابر و
                    عادلانه بین {toPersianDigits(selectedModuleIds.length)} فصل انتخاب‌شده توزیع
                    می‌کند (حدوداً {toPersianDigits(Math.round(totalQuestions / selectedModuleIds.length))} سؤال به ازای هر فصل).
                  </p>
                )}

                {/* Manual mode inputs per chapter */}
                {distributionMode === "manual" && (
                  <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                    <div className="flex items-center justify-between text-[11px] font-bold text-[var(--color-text-muted)] px-1">
                      <span>نام فصل</span>
                      <span>سهمیه سؤال</span>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto p-1">
                      {selectedModuleIds.map((moduleId) => {
                        const mod = courseModules.find((m) => m.id === moduleId);
                        const quota = manualQuotas[moduleId] || 1;
                        return (
                          <div
                            key={moduleId}
                            className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs"
                          >
                            <span className="truncate max-w-[220px] font-medium text-[var(--color-text)]">
                              {mod?.title || moduleId}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={1}
                                max={totalQuestions}
                                value={quota}
                                onChange={(e) =>
                                  handleQuotaChange(moduleId, parseInt(e.target.value, 10))
                                }
                                disabled={createMutation.isPending}
                                className="w-16 px-2 py-1 rounded-lg border border-[var(--color-border)] text-center text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#008080]"
                              />
                              <span className="text-[10px] text-[var(--color-text-muted)]">سؤال</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between pt-2 px-1 text-xs font-bold border-t border-[var(--color-border)]">
                      <span>مجموع سهمیه‌ها:</span>
                      <span
                        className={
                          manualQuotasSum === totalQuestions
                            ? "text-[#008080]"
                            : "text-red-500"
                        }
                      >
                        {toPersianDigits(manualQuotasSum)} از {toPersianDigits(totalQuestions)} سؤال
                      </span>
                    </div>
                    {manualQuotasSum !== totalQuestions && (
                      <div className="text-[11px] text-red-600 font-medium px-1 pt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          مجموع سهمیه فصول ({toPersianDigits(manualQuotasSum)}) با تعداد کل ({toPersianDigits(totalQuestions)}) برابر نیست. ({toPersianDigits(Math.abs(totalQuestions - manualQuotasSum))} سؤال {manualQuotasSum < totalQuestions ? "باقیمانده" : "مازاد"})
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 5: Custom Instructions (Optional) */}
            <div className="space-y-1.5">
              <label
                htmlFor="instructions-textarea"
                className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5"
              >
                <HelpCircle className="w-4 h-4 text-[#008080]" />
                <span>۶. دستورالعمل یا پرامپت تکمیلی (اختیاری)</span>
              </label>
              <textarea
                id="instructions-textarea"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="مثال: سؤالات دارای سناریوی بالینی باشند و تمرکز بیشتری روی عوارض دارویی داشته باشند..."
                rows={2}
                disabled={createMutation.isPending}
                className="w-full text-xs p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#008080] resize-none"
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={createMutation.isPending}
          >
            انصراف
          </Button>

          <Button
            type="submit"
            variant="primary"
            disabled={
              isLoadingSources ||
              createMutation.isPending ||
              Boolean(validationError)
            }
            isLoading={createMutation.isPending}
            leftIcon={<Sparkles className="w-4 h-4" />}
          >
            {createMutation.isPending
              ? "در حال ثبت عملیات..."
              : `شروع تولید هوشمند (${toPersianDigits(totalQuestions)} سؤال)`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
