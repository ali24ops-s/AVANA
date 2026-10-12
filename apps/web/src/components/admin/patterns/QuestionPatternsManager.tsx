import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Layers,
  FileText,
  Loader2,
  X,
  AlertTriangle,
  Brain,
} from "lucide-react";
import {
  toPersianDigits,
  COGNITIVE_LEVEL_LABELS_FA,
  STANDARD_QUESTION_SKILLS,
  type CognitiveLevel,
  type QuestionPatternExtractionResult,
} from "@avana/domain";
import type {
  AdminQuestionPatternSummary,
} from "../../../lib/api/admin.js";

export function QuestionPatternsManager() {
  const adminApi = useAdmin();
  const queryClient = useQueryClient();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [expandedPatternId, setExpandedPatternId] = useState<string | null>(null);
  const [isAddExampleModalOpen, setIsAddExampleModalOpen] = useState(false);
  const [selectedPatternForExample, setSelectedPatternForExample] = useState<AdminQuestionPatternSummary | null>(null);

  // Form states for creating pattern
  const [createMode, setCreateMode] = useState<"manual" | "extract">("manual");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cognitiveLevel, setCognitiveLevel] = useState<CognitiveLevel>("recall");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [customSkillInput, setCustomSkillInput] = useState("");
  const [systemInstructions, setSystemInstructions] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Form states for AI Pattern Extraction
  const [sampleQuestionsText, setSampleQuestionsText] = useState("");
  const [extractedResult, setExtractedResult] = useState<QuestionPatternExtractionResult | null>(null);
  const [saveExtractedExamples, setSaveExtractedExamples] = useState(true);

  // Form states for adding example
  const [exampleQuestion, setExampleQuestion] = useState("");
  const [exampleChoices, setExampleChoices] = useState<string[]>(["", "", "", ""]);
  const [exampleCorrectAnswer, setExampleCorrectAnswer] = useState(0);
  const [exampleExplanation, setExampleExplanation] = useState("");
  const [exampleClinicalContext, setExampleClinicalContext] = useState("");
  const [exampleError, setExampleError] = useState<string | null>(null);

  // Query: Pattern list
  const {
    data: patternsData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["admin", "question-patterns"],
    queryFn: () => adminApi.listQuestionPatterns(),
  });

  const patterns = patternsData?.patterns ?? [];

  // Query: Pattern details when expanded
  const { data: expandedPatternData, isLoading: isDetailsLoading } = useQuery({
    queryKey: ["admin", "question-pattern", expandedPatternId],
    queryFn: () => adminApi.getQuestionPattern(expandedPatternId!),
    enabled: Boolean(expandedPatternId),
  });

  // Mutation: Create pattern
  const createMutation = useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      cognitiveLevel: string;
      skills?: string[];
      systemInstructions: string;
    }) => adminApi.createQuestionPattern(data),
    onSuccess: async (res) => {
      // If there are extracted examples to attach
      if (saveExtractedExamples && extractedResult?.parsedExamples?.length && res.pattern?.id) {
        for (const ex of extractedResult.parsedExamples) {
          try {
            await adminApi.addQuestionPatternExample(res.pattern.id, {
              question: ex.question,
              choices: ex.choices,
              correctAnswer: ex.correctAnswer,
              explanation: ex.explanation,
              clinicalContext: ex.clinicalContext,
            });
          } catch {
            // best-effort
          }
        }
      }
      setIsCreateModalOpen(false);
      setTitle("");
      setDescription("");
      setCognitiveLevel("recall");
      setSelectedSkills([]);
      setCustomSkillInput("");
      setSystemInstructions("");
      setSampleQuestionsText("");
      setExtractedResult(null);
      setCreateError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "question-patterns"] });
      void queryClient.invalidateQueries({ queryKey: ["active-question-patterns"] });
    },
    onError: (err: Error) => {
      setCreateError(err.message || "خطا در ایجاد الگو");
    },
  });

  // Mutation: AI Pattern Extraction
  const extractMutation = useMutation({
    mutationFn: (samples: string[]) =>
      adminApi.extractQuestionPattern({ samples }),
    onSuccess: (data) => {
      setExtractedResult(data);
      setTitle(data.title);
      setDescription(data.description || "");
      setCognitiveLevel(data.cognitiveLevel);
      setSelectedSkills(data.skills || []);
      setSystemInstructions(data.systemInstructions);
      setCreateError(null);
    },
    onError: (err: Error) => {
      setCreateError(err.message || "خطا در تحلیل و استخراج الگو توسط هوش مصنوعی");
    },
  });

  // Mutation: Toggle Active / Soft Delete
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminApi.updateQuestionPattern(id, { isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "question-patterns"] });
      void queryClient.invalidateQueries({ queryKey: ["active-question-patterns"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteQuestionPattern(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "question-patterns"] });
      void queryClient.invalidateQueries({ queryKey: ["active-question-patterns"] });
      if (expandedPatternId) setExpandedPatternId(null);
    },
  });

  // Mutation: Add Example
  const addExampleMutation = useMutation({
    mutationFn: ({
      patternId,
      data,
    }: {
      patternId: string;
      data: {
        question: string;
        choices: string[];
        correctAnswer: number;
        explanation?: string;
        clinicalContext?: string;
      };
    }) => adminApi.addQuestionPatternExample(patternId, data),
    onSuccess: () => {
      setIsAddExampleModalOpen(false);
      setExampleQuestion("");
      setExampleChoices(["", "", "", ""]);
      setExampleCorrectAnswer(0);
      setExampleExplanation("");
      setExampleClinicalContext("");
      setExampleError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "question-patterns"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "question-pattern", expandedPatternId] });
      void queryClient.invalidateQueries({ queryKey: ["active-question-patterns"] });
    },
    onError: (err: Error) => {
      setExampleError(err.message || "خطا در افزودن سؤال نمونه");
    },
  });

  // Mutation: Delete Example
  const deleteExampleMutation = useMutation({
    mutationFn: ({ patternId, exampleId }: { patternId: string; exampleId: string }) =>
      adminApi.deleteQuestionPatternExample(patternId, exampleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "question-patterns"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "question-pattern", expandedPatternId] });
      void queryClient.invalidateQueries({ queryKey: ["active-question-patterns"] });
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !systemInstructions.trim()) {
      setCreateError("عنوان و دستورالعمل ساختاری الگو الزامی است.");
      return;
    }
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      cognitiveLevel,
      skills: selectedSkills.length > 0 ? selectedSkills : undefined,
      systemInstructions: systemInstructions.trim(),
    });
  };

  const handleExtractSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const samples = sampleQuestionsText
      .split(/(?:^|\n)\s*---+\s*(?:\n|$)/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (samples.length === 0) {
      setCreateError("لطفاً حداقل یک سؤال نمونه وارد کنید.");
      return;
    }
    setCreateError(null);
    extractMutation.mutate(samples);
  };

  const handleAddExampleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatternForExample) return;
    const validChoices = exampleChoices.map((c) => c.trim()).filter(Boolean);
    if (!exampleQuestion.trim() || validChoices.length < 2) {
      setExampleError("متن سؤال و حداقل ۲ گزینه الزامی است.");
      return;
    }
    addExampleMutation.mutate({
      patternId: selectedPatternForExample.id,
      data: {
        question: exampleQuestion.trim(),
        choices: validChoices,
        correctAnswer: exampleCorrectAnswer,
        explanation: exampleExplanation.trim() || undefined,
        clinicalContext: exampleClinicalContext.trim() || undefined,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-xs">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            الگوهای استاندارد سؤال (Question Patterns)
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] max-w-2xl leading-relaxed">
            الگوهای سؤال به موتور هوش مصنوعی راهنمایی ساختاری، سبک نگارش سناریو و استدلال گزینه‌های انحرافی ارائه می‌دهند. محتوای واقعی و فکت‌ها همواره منحصراً از سند منبع تأمین می‌گردد.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] text-xs font-bold shadow-sm hover:opacity-90 transition-all shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>الگوی جدید</span>
        </button>
      </div>

      {/* Patterns List */}
      {isLoading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary-default)]" />
          <p className="text-xs">در حال بارگذاری الگوهای سؤال...</p>
        </div>
      ) : isError ? (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {(error as Error)?.message || "خطا در دریافت لیست الگوها"}
        </div>
      ) : patterns.length === 0 ? (
        <div className="p-12 text-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-3">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-[var(--color-text)]">هنوز هیچ الگوی سؤالی تعریف نشده است</p>
          <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto">
            با تعریف یک الگوی جدید و افزودن سؤالات نمونه مرجع، می‌توانید سبک طراحی آزمون‌های آوانا را ارتقا دهید.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {patterns.map((pattern) => {
            const isExpanded = expandedPatternId === pattern.id;
            return (
              <div
                key={pattern.id}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-xs transition-all overflow-hidden"
              >
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-bold text-sm text-[var(--color-text)]">{pattern.title}</span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                        نگارش {toPersianDigits(pattern.version)}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                        {COGNITIVE_LEVEL_LABELS_FA[pattern.cognitiveLevel as CognitiveLevel] || pattern.cognitiveLevel}
                      </span>
                      {Array.isArray(pattern.skills) && pattern.skills.map((s) => (
                        <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                          {STANDARD_QUESTION_SKILLS.find((sk) => sk.id === s)?.labelFa || s}
                        </span>
                      ))}
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-[#008080] border border-teal-500/20">
                        {toPersianDigits(pattern.examplesCount)} نمونه مرجع
                      </span>
                      {pattern.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          فعال
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                          غیرفعال
                        </span>
                      )}
                    </div>
                    {pattern.description && (
                      <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
                        {pattern.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        toggleActiveMutation.mutate({
                          id: pattern.id,
                          isActive: !pattern.isActive,
                        })
                      }
                      className="px-3 py-1.5 rounded-xl border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
                    >
                      {pattern.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatternForExample(pattern);
                        setIsAddExampleModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/20 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>افزودن نمونه</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`آیا از حذف الگوی «${pattern.title}» اطمینان دارید؟`)) {
                          deleteMutation.mutate(pattern.id);
                        }
                      }}
                      className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                      title="حذف الگو"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedPatternId(isExpanded ? null : pattern.id)}
                      className="p-1.5 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] transition-colors cursor-pointer"
                      title={isExpanded ? "بستن جزئیات" : "مشاهده نمونه‌ها و دستورالعمل"}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]/50 p-5 space-y-4 animate-in fade-in duration-150">
                    <div>
                      <h4 className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5 mb-1.5">
                        <FileText className="w-3.5 h-3.5 text-amber-600" />
                        دستورالعمل ساختاری برای هوش مصنوعی (System Instructions):
                      </h4>
                      <pre className="text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] p-3 rounded-xl whitespace-pre-wrap font-sans leading-relaxed">
                        {pattern.systemInstructions}
                      </pre>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5 mb-2">
                        <Layers className="w-3.5 h-3.5 text-amber-600" />
                        نمونه سؤالات مرجع (Few-shot Examples):
                      </h4>

                      {isDetailsLoading ? (
                        <div className="py-4 flex items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>در حال دریافت نمونه‌ها...</span>
                        </div>
                      ) : expandedPatternData?.pattern?.examples?.length ? (
                        <div className="space-y-3">
                          {expandedPatternData.pattern.examples.map((ex, idx) => (
                            <div
                              key={ex.id}
                              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 space-y-2 relative"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <span className="text-xs font-bold text-[var(--color-text)]">
                                  نمونه {toPersianDigits(idx + 1)}: {ex.question}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    deleteExampleMutation.mutate({
                                      patternId: pattern.id,
                                      exampleId: ex.id,
                                    })
                                  }
                                  className="text-rose-500 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="حذف این نمونه"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                {ex.choices.map((choice, cIdx) => (
                                  <div
                                    key={cIdx}
                                    className={`px-3 py-1.5 rounded-lg text-xs border ${
                                      Number(ex.correctAnswer) === cIdx
                                        ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-bold"
                                        : "bg-[var(--color-surface-warm)] border-[var(--color-border)] text-[var(--color-text-muted)]"
                                    }`}
                                  >
                                    {toPersianDigits(cIdx + 1)}) {choice}
                                    {Number(ex.correctAnswer) === cIdx && " (پاسخ صحیح)"}
                                  </div>
                                ))}
                              </div>

                              {ex.explanation && (
                                <p className="text-[11px] text-[var(--color-text-muted)] bg-teal-500/5 p-2 rounded-lg border border-teal-500/10">
                                  <span className="font-bold text-[#008080]">توضیح تشریحی: </span>
                                  {ex.explanation}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--color-text-muted)] italic">
                          هنوز سؤالی به این الگو افزوده نشده است.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Create Pattern */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-6 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                تعریف الگوی سؤال جدید
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Selector Tabs */}
            <div className="flex border-b border-[var(--color-border)] gap-4 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setCreateMode("manual");
                  setCreateError(null);
                }}
                className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                  createMode === "manual"
                    ? "border-[var(--color-primary-default)] text-[var(--color-primary-default)]"
                    : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                ساخت دستی الگو
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateMode("extract");
                  setCreateError(null);
                }}
                className={`pb-2 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  createMode === "extract"
                    ? "border-[var(--color-primary-default)] text-[var(--color-primary-default)]"
                    : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                استخراج هوشمند از سؤالات نمونه
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {createError}
              </div>
            )}

            {createMode === "extract" ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-[var(--color-text)]">
                      سؤالات نمونه (حداقل ۳ نمونه برای دقت بالا) *
                    </label>
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      تفکیک هر سؤال با <code className="bg-[var(--color-surface-warm)] px-1 py-0.5 rounded text-[10px]">---</code>
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    value={sampleQuestionsText}
                    onChange={(e) => setSampleQuestionsText(e.target.value)}
                    placeholder="سؤال اول...&#10;الف) گزینه ۱&#10;ب) گزینه ۲&#10;پاسخ: ب&#10;---&#10;سؤال دوم...&#10;---&#10;سؤال سوم..."
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] font-mono leading-relaxed"
                  />
                  {(() => {
                    const count = sampleQuestionsText
                      .split(/(?:^|\n)\s*---+\s*(?:\n|$)/)
                      .map((s) => s.trim())
                      .filter(Boolean).length;
                    return (
                      <div className="flex items-center justify-between mt-1 text-[11px]">
                        <span className={count < 3 ? "text-amber-600 font-medium" : "text-emerald-600 font-medium"}>
                          تعداد نمونه‌های شناسایی‌شده: {toPersianDigits(count)}
                          {count < 3 && count > 0 && " (پیشنهاد: حداقل ۳ نمونه)"}
                        </span>
                        <button
                          type="button"
                          onClick={handleExtractSubmit}
                          disabled={count === 0 || extractMutation.isPending}
                          className="px-4 py-1.5 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {extractMutation.isPending ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>در حال تحلیل...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>استخراج الگو با هوش مصنوعی</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {extractedResult?.warnings && extractedResult.warnings.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      هشدارهای استخراج الگو:
                    </div>
                    {extractedResult.warnings.map((w, idx) => (
                      <div key={idx} className="text-[11px]">• {w}</div>
                    ))}
                  </div>
                )}

                {extractedResult && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-2">
                    <div className="font-bold text-emerald-800 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        الگو با موفقیت استخراج شد! فرم زیر برای ویرایش و بازبینی آماده است.
                      </span>
                      {extractedResult.confidence && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-mono">
                          اطمینان: {extractedResult.confidence}
                        </span>
                      )}
                    </div>
                    <label className="flex items-center gap-2 text-emerald-800 text-[11px] cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={saveExtractedExamples}
                        onChange={(e) => setSaveExtractedExamples(e.target.checked)}
                        className="rounded text-[var(--color-primary-default)]"
                      />
                      <span>ذخیره خودکار نمونه‌های تفکیک‌شده ({toPersianDigits(extractedResult.parsedExamples?.length || 0)} مورد) به عنوان سؤالات مرجع الگو</span>
                    </label>
                  </div>
                )}

                {/* Form fields for review/edit */}
                <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2 border-t border-[var(--color-border)]">
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                      عنوان الگو *
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="عنوان استخراج‌شده..."
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                      سطح شناختی (بلوم) *
                    </label>
                    <select
                      value={cognitiveLevel}
                      onChange={(e) => setCognitiveLevel(e.target.value as CognitiveLevel)}
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                    >
                      <option value="recall">{COGNITIVE_LEVEL_LABELS_FA.recall} (Recall)</option>
                      <option value="understand">{COGNITIVE_LEVEL_LABELS_FA.understand} (Understand)</option>
                      <option value="apply">{COGNITIVE_LEVEL_LABELS_FA.apply} (Apply)</option>
                      <option value="analyze">{COGNITIVE_LEVEL_LABELS_FA.analyze} (Analyze)</option>
                      <option value="evaluate">{COGNITIVE_LEVEL_LABELS_FA.evaluate} (Evaluate)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                      مهارت‌های شناسایی‌شده
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {STANDARD_QUESTION_SKILLS.map((skill) => {
                        const isSelected = selectedSkills.includes(skill.id);
                        return (
                          <button
                            type="button"
                            key={skill.id}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedSkills(selectedSkills.filter((s) => s !== skill.id));
                              } else {
                                setSelectedSkills([...selectedSkills, skill.id]);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-teal-500/15 border-teal-500/30 text-[var(--color-primary-default)] font-bold"
                                : "bg-[var(--color-surface-warm)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                            }`}
                          >
                            {skill.labelFa}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                      توضیحات کوتاه
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="توضیح الگو..."
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                      دستورالعمل ساختاری برای مدل هوش مصنوعی *
                    </label>
                    <textarea
                      rows={4}
                      value={systemInstructions}
                      onChange={(e) => setSystemInstructions(e.target.value)}
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                      required
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(false)}
                      className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      disabled={createMutation.isPending || !title.trim() || !systemInstructions.trim()}
                      className="px-5 py-2 rounded-xl bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] text-xs font-bold hover:opacity-90 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>تأیید و ذخیره الگو</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                  عنوان الگو *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: سناریوی بالینی USMLE Step 2"
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                  سطح شناختی (Cognitive Level - بلوم) *
                </label>
                <select
                  value={cognitiveLevel}
                  onChange={(e) => setCognitiveLevel(e.target.value as CognitiveLevel)}
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] transition-all"
                >
                  <option value="recall">{COGNITIVE_LEVEL_LABELS_FA.recall} (Recall)</option>
                  <option value="understand">{COGNITIVE_LEVEL_LABELS_FA.understand} (Understand)</option>
                  <option value="apply">{COGNITIVE_LEVEL_LABELS_FA.apply} (Apply)</option>
                  <option value="analyze">{COGNITIVE_LEVEL_LABELS_FA.analyze} (Analyze)</option>
                  <option value="evaluate">{COGNITIVE_LEVEL_LABELS_FA.evaluate} (Evaluate)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                  مهارت‌های هدف (Target Skills)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {STANDARD_QUESTION_SKILLS.map((skill) => {
                    const isSelected = selectedSkills.includes(skill.id);
                    return (
                      <button
                        type="button"
                        key={skill.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedSkills(selectedSkills.filter((s) => s !== skill.id));
                          } else {
                            setSelectedSkills([...selectedSkills, skill.id]);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-teal-500/15 border-teal-500/30 text-[var(--color-primary-default)] font-bold"
                            : "bg-[var(--color-surface-warm)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                        }`}
                      >
                        {skill.labelFa}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                  توضیحات کوتاه
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="توضیح هدف این الگو برای سایر اعضای تیم محتوا..."
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                  دستورالعمل ساختاری برای مدل هوش مصنوعی *
                </label>
                <textarea
                  rows={4}
                  value={systemInstructions}
                  onChange={(e) => setSystemInstructions(e.target.value)}
                  placeholder="قوانین ساختار سؤال، طول صورت سؤال، شیوه طراحی گزینه‌های انحرافی و ساختار توضیح تشریحی..."
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] transition-all"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] text-xs font-bold hover:opacity-90 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>ثبت و ذخیره الگو</span>
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: Add Example Question */}
      {isAddExampleModalOpen && selectedPatternForExample && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-6 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-500" />
                افزودن نمونه سؤال مرجع به «{selectedPatternForExample.title}»
              </h3>
              <button
                type="button"
                onClick={() => setIsAddExampleModalOpen(false)}
                className="p-1.5 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {exampleError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {exampleError}
              </div>
            )}

            <form onSubmit={handleAddExampleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                  متن صورت سؤال *
                </label>
                <textarea
                  rows={3}
                  value={exampleQuestion}
                  onChange={(e) => setExampleQuestion(e.target.value)}
                  placeholder="سناریوی بالینی یا صورت سؤال نمونه..."
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-2.5 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                  گزینه‌ها (مشخص کردن گزینه صحیح با دکمه رادیویی) *
                </label>
                <div className="space-y-2">
                  {exampleChoices.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correctAnswerRadio"
                        checked={exampleCorrectAnswer === idx}
                        onChange={() => setExampleCorrectAnswer(idx)}
                        className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        title="انتخاب به عنوان پاسخ صحیح"
                      />
                      <input
                        type="text"
                        value={c}
                        onChange={(e) => {
                          const next = [...exampleChoices];
                          next[idx] = e.target.value;
                          setExampleChoices(next);
                        }}
                        placeholder={`گزینه ${toPersianDigits(idx + 1)}`}
                        className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-1.5 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] transition-all"
                        required={idx < 2}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                  پاسخ تشریحی و استدلال
                </label>
                <textarea
                  rows={2}
                  value={exampleExplanation}
                  onChange={(e) => setExampleExplanation(e.target.value)}
                  placeholder="چرا گزینه صحیح درست است و چرا سایر گزینه‌ها رد می‌شوند..."
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-2.5 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] transition-all"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => setIsAddExampleModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={addExampleMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {addExampleMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>ثبت نمونه سؤال</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
