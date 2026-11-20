import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  Plus,
  Database,
  Sparkles,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit2,
  Filter,
  RotateCcw,
  Layers,
  BookOpen,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import {
  createStudioApi,
  type MarketingQuiz,
  type MarketingQuizQuestionSnapshot,
  type MarketingQuestionBankItem,
  type StudioAiGeneratedQuestion,
  type UnifiedQuestionBankItem,
  type QuestionBankSourcesResponse,
  type QuestionSourceType,
} from "../../lib/api/studio-api.js";
import {
  LoadingState,
  Button,
  Badge,
  Card,
  Progress,
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
} from "../../components/ui/index.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { toPersianDigits, formatPersianOf } from "@avana/domain";
import { RichContent } from "../../components/markdown/MarkdownRenderer.js";

/**
 * Resolves whether a choice is marked as correct given diverse formats:
 * - { choiceId: "2" }
 * - { choiceIds: ["1", "3"] }
 * - { booleanAnswer: true }
 * - string ID or string text
 */
function isChoiceCorrect(
  choice: { id: string; text: string },
  correctAnswer: unknown,
  _choices: Array<{ id: string; text: string }> = []
): boolean {
  if (!correctAnswer) return false;
  if (typeof correctAnswer === "object" && correctAnswer !== null) {
    const ca = correctAnswer as Record<string, unknown>;
    if (ca.choiceId !== undefined && ca.choiceId !== null) {
      return String(choice.id) === String(ca.choiceId);
    }
    if (Array.isArray(ca.choiceIds)) {
      return ca.choiceIds.map(String).includes(String(choice.id));
    }
    if (typeof ca.booleanAnswer === "boolean") {
      const positiveWords = ["درست", "صحیح", "true"];
      const negativeWords = ["نادرست", "غلط", "false"];
      const targets = ca.booleanAnswer ? positiveWords : negativeWords;
      return targets.some((w) => choice.text.trim().toLowerCase().includes(w));
    }
  }
  const raw = String(correctAnswer).trim();
  if (String(choice.id) === raw) return true;
  if (choice.text.trim().toLowerCase() === raw.toLowerCase()) return true;
  return false;
}

function isAnswerAmbiguous(correctAnswer: unknown): boolean {
  if (!correctAnswer) return true;
  if (typeof correctAnswer === "object" && correctAnswer !== null) {
    const ca = correctAnswer as Record<string, unknown>;
    return Boolean(ca.ambiguous) || (!ca.choiceId && !ca.choiceIds && ca.booleanAnswer === undefined);
  }
  return false;
}

function getPrimaryCorrectChoiceId(
  correctAnswer: unknown,
  choices: Array<{ id: string; text: string }> = []
): string {
  if (!correctAnswer) return choices[0]?.id || "1";
  if (typeof correctAnswer === "object" && correctAnswer !== null) {
    const ca = correctAnswer as Record<string, unknown>;
    if (ca.choiceId !== undefined && ca.choiceId !== null) return String(ca.choiceId);
    if (Array.isArray(ca.choiceIds) && ca.choiceIds.length > 0) {
      return String(ca.choiceIds[0]);
    }
  }
  const raw = String(correctAnswer).trim();
  const byId = choices.find((c) => String(c.id) === raw);
  if (byId) return String(byId.id);
  const byText = choices.find((c) => c.text.trim().toLowerCase() === raw.toLowerCase());
  if (byText) return String(byText.id);
  return choices[0]?.id || "1";
}

const QUESTION_TYPES = [
  { id: "conceptual", label: "مفهومی و اصول پایه" },
  { id: "mechanism_of_action", label: "مکانیسم اثر دارو" },
  { id: "clinical_pharmacology", label: "فارماکولوژی بالینی و کاربرد درمانی" },
  { id: "adverse_effects", label: "عوارض ناخواسته و سمیت دارویی" },
  { id: "drug_comparison", label: "مقایسه داروها و انتخاب بهینه" },
  { id: "drug_interactions", label: "تداخلات دارویی مهم" },
  { id: "dosage_calculations", label: "محاسبات دارویی و دوزینگ" },
  { id: "clinical_scenario", label: "سناریوی بالینی و کیس پزشکی" },
];

export function StudioQuizEditorPage() {
  const { quizId: paramQuizId, id: paramId } = useParams<{ quizId?: string; id?: string }>();
  const quizId = paramQuizId || paramId;
  const { user } = useAuth();
  const [quiz, setQuiz] = useState<MarketingQuiz | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState(false);

  // Quiz Details Form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [ctaTitle, setCtaTitle] = useState("");
  const [ctaDescription, setCtaDescription] = useState("");
  const [ctaButtonText, setCtaButtonText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");

  // Add Question Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addMethod, setAddMethod] = useState<"manual" | "bank" | "ai">("manual");

  // Manual Question State
  const [manualQuestion, setManualQuestion] = useState("");
  const [manualChoices, setManualChoices] = useState([
    { id: "1", text: "" },
    { id: "2", text: "" },
    { id: "3", text: "" },
    { id: "4", text: "" },
  ]);
  const [manualCorrectChoiceId, setManualCorrectChoiceId] = useState("1");
  const [manualExplanation, setManualExplanation] = useState("");
  const [manualDifficulty, setManualDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [manualTopic, setManualTopic] = useState("");
  const [manualSaveToBank, setManualSaveToBank] = useState(true);

  // Edit Question State
  const [editingQuestion, setEditingQuestion] = useState<MarketingQuizQuestionSnapshot | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editChoices, setEditChoices] = useState<Array<{ id: string; text: string }>>([
    { id: "1", text: "" },
    { id: "2", text: "" },
    { id: "3", text: "" },
    { id: "4", text: "" },
  ]);
  const [editCorrectChoiceId, setEditCorrectChoiceId] = useState("1");
  const [editExplanation, setEditExplanation] = useState("");
  const [editDifficulty, setEditDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [editTopic, setEditTopic] = useState("");
  const [editQuestionType, setEditQuestionType] = useState("multiple_choice");
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

  // Unified Question Bank State
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [bankSources, setBankSources] = useState<QuestionBankSourcesResponse | null>(null);
  const [unifiedBankQuestions, setUnifiedBankQuestions] = useState<UnifiedQuestionBankItem[]>([]);
  const [unifiedBankTotal, setUnifiedBankTotal] = useState(0);
  const [isUnifiedBankLoading, setIsUnifiedBankLoading] = useState(false);
  const [bankPage, setBankPage] = useState(1);

  // In-Studio Quick Preview State
  const [isQuickPreviewOpen, setIsQuickPreviewOpen] = useState(false);
  const [quickPreviewIndex, setQuickPreviewIndex] = useState(0);
  const [quickPreviewShowAnswerKey, setQuickPreviewShowAnswerKey] = useState(true);
  const [quickPreviewAnswers, setQuickPreviewAnswers] = useState<Record<string, string>>({});

  // Bank Filters
  const [bankSourceType, setBankSourceType] = useState<"all" | QuestionSourceType>("all");
  const [bankCourseId, setBankCourseId] = useState("");
  const [bankModuleId, setBankModuleId] = useState("");
  const [bankLessonId, setBankLessonId] = useState("");
  const [bankDifficulty, setBankDifficulty] = useState<"all" | "easy" | "medium" | "hard">("all");
  const [bankQuestionType, setBankQuestionType] = useState("all");
  const [bankSearchText, setBankSearchText] = useState("");

  // Multi-select State: Map keyed by question unique ID (retains selection across filters)
  const [selectedBankQuestions, setSelectedBankQuestions] = useState<Map<string, UnifiedQuestionBankItem>>(new Map());
  const [isBatchAdding, setIsBatchAdding] = useState(false);

  // Legacy Bank Import State for modal
  const [bankItems, setBankItems] = useState<MarketingQuestionBankItem[]>([]);
  const [bankSearch, setBankSearch] = useState("");
  const [isBankLoading, setIsBankLoading] = useState(false);

  // AI Generation State
  const [aiTopic, setAiTopic] = useState("");
  const [aiQuestionType, setAiQuestionType] = useState("mechanism_of_action");
  const [aiDifficulty, setAiDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [aiCount, setAiCount] = useState(3);
  const [aiInstructions, setAiInstructions] = useState("");
  const [aiSampleQuestion, setAiSampleQuestion] = useState("");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiGeneratedList, setAiGeneratedList] = useState<StudioAiGeneratedQuestion[]>([]);

  const isContentWorker = user?.role === "content_worker";

  const studioApi = useMemo(() => {
    const client = createApiClient({ baseUrl: getApiBaseUrl() });
    return createStudioApi(client);
  }, []);

  const loadQuiz = useCallback(async () => {
    if (!quizId) return;
    try {
      setIsLoading(true);
      const res = await studioApi.getQuiz(quizId);
      const q = res.quiz;
      setQuiz(q);
      setTitle(q.title || "");
      setDescription(q.description || "");
      setCoverImageUrl(q.coverImageUrl || "");
      setCtaTitle((q.settings?.ctaTitle as string) || "");
      setCtaDescription((q.settings?.ctaDescription as string) || "");
      setCtaButtonText((q.settings?.ctaButtonText as string) || "");
      setCtaUrl((q.settings?.ctaUrl as string) || "");
    } catch (err) {
      console.error("Failed to load quiz", err);
    } finally {
      setIsLoading(false);
    }
  }, [quizId, studioApi]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizId) return;
    try {
      setIsSavingDetails(true);
      const updated = await studioApi.updateQuiz(quizId, {
        title: title.trim(),
        description: description.trim() || undefined,
        coverImageUrl: coverImageUrl.trim() || undefined,
        settings: {
          ...quiz?.settings,
          ctaTitle: ctaTitle.trim() || undefined,
          ctaDescription: ctaDescription.trim() || undefined,
          ctaButtonText: ctaButtonText.trim() || undefined,
          ctaUrl: ctaUrl.trim() || undefined,
        },
      });
      setQuiz(updated.quiz);
      alert("اطلاعات آزمون با موفقیت به‌روزرسانی شد.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در ذخیره مشخصات");
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!quiz || !quizId) return;
    const nextStatus = quiz.status === "published" ? "disabled" : "published";
    try {
      const res = await studioApi.updateQuiz(quizId, { status: nextStatus });
      setQuiz(res.quiz);
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در تغییر وضعیت آزمون");
    }
  };

  const handleCopyLink = () => {
    if (!quiz) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/quiz/${quiz.slug}`;
    void navigator.clipboard.writeText(url);
    setCopiedSlug(true);
    setTimeout(() => setCopiedSlug(false), 2500);
  };

  // Reorder questions
  const handleMoveQuestion = async (index: number, direction: "up" | "down") => {
    if (!quiz?.questions) return;
    const newQuestions = [...quiz.questions];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newQuestions.length) return;

    const temp = newQuestions[index];
    newQuestions[index] = newQuestions[targetIdx];
    newQuestions[targetIdx] = temp;

    const orderedIds = newQuestions.map((q) => q.id);
    setQuiz({ ...quiz, questions: newQuestions });

    try {
      await studioApi.reorderQuestions(quiz.id, orderedIds);
    } catch (err) {
      console.error("Failed to persist question reordering", err);
      loadQuiz();
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!quiz || !confirm("آیا از حذف این سؤال از آزمون اطمینان دارید؟")) return;
    try {
      await studioApi.deleteQuestionSnapshot(quiz.id, questionId);
      await loadQuiz();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در حذف سؤال");
    }
  };

  // Manual Question Submit
  const handleManualAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizId || !manualQuestion.trim()) return;
    const validChoices = manualChoices.filter((c) => c.text.trim() !== "");
    if (validChoices.length < 2) {
      alert("حداقل دو گزینه باید پر شوند.");
      return;
    }

    try {
      await studioApi.addManualQuestion(quizId, {
        question: manualQuestion.trim(),
        choices: validChoices,
        correctAnswer: { choiceId: manualCorrectChoiceId },
        explanation: manualExplanation.trim() || undefined,
        difficulty: manualDifficulty,
        topic: manualTopic.trim() || undefined,
        addToQuestionBank: manualSaveToBank,
      });
      setIsAddModalOpen(false);
      setManualQuestion("");
      setManualExplanation("");
      setManualTopic("");
      setManualChoices([
        { id: "1", text: "" },
        { id: "2", text: "" },
        { id: "3", text: "" },
        { id: "4", text: "" },
      ]);
      await loadQuiz();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در ثبت سؤال");
    }
  };

  // Open Edit Question Modal
  const handleOpenEditQuestion = (q: MarketingQuizQuestionSnapshot) => {
    setEditingQuestion(q);
    setEditPrompt(q.question);
    const existingChoices =
      q.choices && q.choices.length > 0
        ? q.choices.map((c) => ({ id: String(c.id), text: c.text }))
        : [
            { id: "1", text: "" },
            { id: "2", text: "" },
            { id: "3", text: "" },
            { id: "4", text: "" },
          ];
    setEditChoices(existingChoices);
    const correctId = getPrimaryCorrectChoiceId(q.correctAnswer, existingChoices);
    setEditCorrectChoiceId(correctId);
    setEditExplanation(q.explanation || "");
    setEditDifficulty(q.difficulty || "medium");
    setEditTopic(q.topic || "");
    setEditQuestionType(q.questionType || "multiple_choice");
  };

  // Save Question Edit Submit
  const handleSaveEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizId || !editingQuestion) return;
    const validChoices = editChoices.filter((c) => c.text.trim() !== "");
    if (validChoices.length < 2) {
      alert("حداقل دو گزینه باید پر شوند.");
      return;
    }

    try {
      setIsSavingQuestion(true);
      const res = await studioApi.updateQuestionSnapshot(quizId, editingQuestion.id, {
        question: editPrompt.trim(),
        choices: validChoices,
        correctAnswer: { choiceId: editCorrectChoiceId },
        explanation: editExplanation.trim() || undefined,
        difficulty: editDifficulty,
        topic: editTopic.trim() || undefined,
        questionType: editQuestionType,
      });

      if (quiz && quiz.questions) {
        setQuiz({
          ...quiz,
          questions: quiz.questions.map((q) =>
            q.id === editingQuestion.id ? res.question : q,
          ),
        });
      }
      setEditingQuestion(null);
      await loadQuiz();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در ویرایش سؤال");
    } finally {
      setIsSavingQuestion(false);
    }
  };

  // Load Bank Sources (Courses, Modules, Lessons)
  const loadBankSources = useCallback(async () => {
    try {
      const res = await studioApi.getQuestionBankSources();
      setBankSources(res);
    } catch (err) {
      console.error("Failed to load question bank sources", err);
    }
  }, [studioApi]);

  // Load Unified Bank Questions with Pagination
  const loadUnifiedBankQuestions = useCallback(
    async (pageTarget = bankPage) => {
      try {
        setIsUnifiedBankLoading(true);
        const res = await studioApi.searchQuestionBank({
          search: bankSearchText.trim() || undefined,
          sourceType: bankSourceType,
          courseId: bankCourseId || undefined,
          moduleId: bankModuleId || undefined,
          lessonId: bankLessonId || undefined,
          difficulty: bankDifficulty !== "all" ? bankDifficulty : undefined,
          questionType: bankQuestionType !== "all" ? bankQuestionType : undefined,
          excludeQuizId: quizId || undefined,
          limit: 50,
          offset: (pageTarget - 1) * 50,
        });
        setUnifiedBankQuestions(res.questions || []);
        setUnifiedBankTotal(res.total || 0);
      } catch (err) {
        console.error("Failed to search question bank", err);
      } finally {
        setIsUnifiedBankLoading(false);
      }
    },
    [
      studioApi,
      bankSearchText,
      bankSourceType,
      bankCourseId,
      bankModuleId,
      bankLessonId,
      bankDifficulty,
      bankQuestionType,
      quizId,
      bankPage,
    ]
  );

  useEffect(() => {
    if (isBankModalOpen) {
      loadBankSources();
    }
  }, [isBankModalOpen, loadBankSources]);

  useEffect(() => {
    if (isBankModalOpen) {
      loadUnifiedBankQuestions(bankPage);
    }
  }, [bankPage, isBankModalOpen, loadUnifiedBankQuestions]);

  const isQuestionAlreadyInQuiz = useCallback(
    (item: UnifiedQuestionBankItem) => {
      if (!quiz?.questions || quiz.questions.length === 0) return false;
      return quiz.questions.some(
        (q) =>
          ((q as any).sourceId && item.sourceId && (q as any).sourceId === item.sourceId) ||
          q.question.trim().toLowerCase() === item.question.trim().toLowerCase()
      );
    },
    [quiz?.questions]
  );

  const handleToggleSelectBankQuestion = (q: UnifiedQuestionBankItem) => {
    if (isQuestionAlreadyInQuiz(q)) return;
    setSelectedBankQuestions((prev) => {
      const next = new Map(prev);
      if (next.has(q.id)) {
        next.delete(q.id);
      } else {
        next.set(q.id, q);
      }
      return next;
    });
  };

  const handleSelectAllOnPage = () => {
    setSelectedBankQuestions((prev) => {
      const next = new Map(prev);
      for (const q of unifiedBankQuestions) {
        if (!isQuestionAlreadyInQuiz(q)) {
          next.set(q.id, q);
        }
      }
      return next;
    });
  };

  const handleClearAllSelections = () => {
    setSelectedBankQuestions(new Map());
  };

  const handleBatchAddSelected = async () => {
    if (!quizId || selectedBankQuestions.size === 0) return;
    try {
      setIsBatchAdding(true);
      const items = Array.from(selectedBankQuestions.values()).map((q) => ({
        sourceType: q.sourceType,
        sourceId: q.sourceId,
        question: q.question,
        choices: q.choices,
        correctAnswer: q.correctAnswer as any,
        explanation: q.explanation || undefined,
        difficulty: q.difficulty,
        topic: q.topic || undefined,
        questionType: q.questionType,
      }));

      const res = await studioApi.batchAddQuestions(quizId, items);
      if (quiz) {
        setQuiz({ ...quiz, questions: res.questions });
      }
      setSelectedBankQuestions(new Map());
      setIsBankModalOpen(false);
      await loadQuiz();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در افزودن سؤالات انتخاب‌شده");
    } finally {
      setIsBatchAdding(false);
    }
  };

  // Bank Search & Import
  const handleSearchBank = useCallback(async () => {
    try {
      setIsBankLoading(true);
      const res = await studioApi.listQuestionBank({ search: bankSearch.trim() || undefined, limit: 20 });
      setBankItems(res.questions || []);
    } catch (err) {
      console.error("Failed to load bank questions", err);
    } finally {
      setIsBankLoading(false);
    }
  }, [bankSearch, studioApi]);

  useEffect(() => {
    if (isAddModalOpen && addMethod === "bank") {
      handleSearchBank();
    }
  }, [isAddModalOpen, addMethod, handleSearchBank]);

  const handleImportFromBank = async (bankItem: MarketingQuestionBankItem) => {
    if (!quizId) return;
    try {
      await studioApi.addQuestionFromBank(quizId, bankItem.id);
      setIsAddModalOpen(false);
      await loadQuiz();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در افزودن سؤال از بانک");
    }
  };

  // AI Generation
  const handleGenerateAi = async () => {
    if (!aiTopic.trim()) {
      alert("لطفاً موضوع سؤالات را وارد کنید.");
      return;
    }
    try {
      setIsAiGenerating(true);
      const res = await studioApi.generateAiQuestions({
        topic: aiTopic.trim(),
        questionType: aiQuestionType,
        difficulty: aiDifficulty,
        count: aiCount,
        instructions: aiInstructions.trim() || undefined,
        sampleQuestions: aiSampleQuestion.trim()
          ? [{ question: aiSampleQuestion.trim() }]
          : undefined,
      });
      setAiGeneratedList(res.questions || []);
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در تولید سؤال با هوش مصنوعی");
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleAddAiQuestionToQuiz = async (q: StudioAiGeneratedQuestion) => {
    if (!quizId) return;
    try {
      await studioApi.addManualQuestion(quizId, {
        question: q.question,
        choices: q.choices,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        topic: q.topic,
        questionType: q.questionType,
        addToQuestionBank: true,
      });
      setAiGeneratedList((prev) => prev.filter((item) => item !== q));
      await loadQuiz();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در افزودن سؤال");
    }
  };

  if (isLoading || !quiz) {
    return (
      <div className="py-12 flex justify-center">
        <LoadingState message="در حال بارگذاری ویرایشگر آزمون..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--color-surface)] p-5 sm:p-6 rounded-[16px] border border-[var(--color-border)] shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            to="/studio/quizzes"
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] rounded-xl transition-colors cursor-pointer"
            aria-label="بازگشت به آزمون‌ها"
          >
            <ArrowRight className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">
                {quiz.title}
              </h1>
              {quiz.status === "published" && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e4f4ec] text-[#2a624b] border border-[#9ed4bb]">
                  منتشرشده
                </span>
              )}
              {quiz.status === "draft" && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#fdf2e4] text-[#8f5e27] border border-[#e8c18a]">
                  پیش‌نویس
                </span>
              )}
              {quiz.status === "disabled" && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                  غیرفعال
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 font-mono">
              اسلاگ یکتا: {quiz.slug}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setQuickPreviewIndex(0);
              setIsQuickPreviewOpen(true);
            }}
            leftIcon={<Eye className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />}
          >
            پیش‌نمایش سریع
          </Button>

          <Link
            to={`/quiz/${quiz.slug}?preview=true`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold border border-[var(--color-border)] rounded-[10px] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <span>صفحه کامل آزمون</span>
          </Link>

          {quiz.status === "published" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              leftIcon={copiedSlug ? <Check className="w-3.5 h-3.5 text-[#2a624b]" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {copiedSlug ? "کپی شد" : "لینک آزمون"}
            </Button>
          )}

          {!isContentWorker && (
            <Button
              variant={quiz.status === "published" ? "outline" : "primary"}
              size="sm"
              onClick={handleTogglePublish}
            >
              {quiz.status === "published" ? "غیرفعال‌سازی آزمون" : "انتشار آزمون"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Questions Management */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[var(--color-surface)] p-5 sm:p-6 rounded-[16px] border border-[var(--color-border)] space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-base text-[var(--color-text)]">
                  سؤالات آزمون ({quiz.questions?.length ?? 0} سؤال)
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  سؤالات به صورت Snapshot مستقل ذخیره شده و مستقل از دوره‌ها عمل می‌کنند.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsBankModalOpen(true)}
                  leftIcon={<Database className="w-3.5 h-3.5" />}
                >
                  بانک جامع سؤالات
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsAddModalOpen(true)}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  افزودن سؤال / هوش مصنوعی
                </Button>
              </div>
            </div>

            {/* Questions List */}
            {(!quiz.questions || quiz.questions.length === 0) ? (
              <div className="text-center py-12 border border-dashed border-[var(--color-border)] rounded-[16px] bg-[var(--color-surface-warm)]/30 space-y-3">
                <p className="text-sm text-[var(--color-text-muted)]">
                  هنوز هیچ سؤالی به این آزمون اضافه نشده است.
                </p>
                <div className="flex items-center justify-center gap-2.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsBankModalOpen(true)}
                    leftIcon={<Database className="w-3.5 h-3.5" />}
                  >
                    افزودن از بانک جامع سؤالات
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsAddModalOpen(true)}
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                  >
                    سؤال دستی / هوش مصنوعی
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                {quiz.questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-4 sm:p-5 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] space-y-3.5 hover:border-[var(--color-primary-default)]/30 transition-all shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] flex items-center justify-center text-xs font-bold border border-[var(--color-border)] shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-semibold text-sm text-[var(--color-text)] leading-relaxed">
                            {q.question}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            {q.topic && (
                              <span className="text-[11px] font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-2 py-0.5 rounded-md border border-[var(--color-border)]">
                                {q.topic}
                              </span>
                            )}
                            <span className="text-[11px] text-[var(--color-text-muted)]">
                              سطح: {q.difficulty === "easy" ? "آسان" : q.difficulty === "hard" ? "دشوار" : "متوسط"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenEditQuestion(q)}
                          leftIcon={<Edit2 className="w-3 h-3" />}
                        >
                          ویرایش
                        </Button>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveQuestion(idx, "up")}
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] disabled:opacity-30 rounded-lg transition-colors cursor-pointer"
                          title="انتقال به بالا"
                          aria-label="انتقال به بالا"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === (quiz.questions?.length ?? 1) - 1}
                          onClick={() => handleMoveQuestion(idx, "down")}
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] disabled:opacity-30 rounded-lg transition-colors cursor-pointer"
                          title="انتقال به پایین"
                          aria-label="انتقال به پایین"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-[#b84c4c] hover:bg-[#fde8e8] rounded-lg transition-colors cursor-pointer"
                          title="حذف سؤال"
                          aria-label="حذف سؤال"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Choices Preview */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[var(--color-border)]/60">
                      {q.choices.map((c) => {
                        const isCorrect = isChoiceCorrect(c, q.correctAnswer, q.choices);
                        return (
                          <div
                            key={c.id}
                            className={`p-2.5 rounded-[10px] text-xs flex items-center justify-between border ${
                              isCorrect
                                ? "bg-[#e4f4ec] border-[#9ed4bb] text-[#2a624b] font-medium"
                                : "bg-[var(--color-surface-warm)]/40 border-[var(--color-border)] text-[var(--color-text-muted)]"
                            }`}
                          >
                            <span>{c.text}</span>
                            {isCorrect && (
                              <span className="text-[10px] bg-[#2a624b] text-white px-2 py-0.5 rounded-full font-bold">
                                پاسخ صحیح
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {isAnswerAmbiguous(q.correctAnswer) && (
                      <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>پاسخ صحیح این سؤال مشخص نیست؛ لطفاً با ویرایش سؤال، گزینه صحیح را مشخص کنید.</span>
                      </div>
                    )}

                    {q.explanation && (
                      <div className="text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] p-3 rounded-[10px] border border-[var(--color-border)]/60 leading-relaxed">
                        <span className="font-semibold text-[var(--color-text)]">تشریح پاسخ: </span>
                        {q.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 Col): Quiz Settings Form */}
        <div className="space-y-4">
          <form
            onSubmit={handleSaveDetails}
            className="bg-[var(--color-surface)] p-5 rounded-[16px] border border-[var(--color-border)] space-y-4 shadow-xs"
          >
            <h3 className="font-bold text-sm text-[var(--color-text)] border-b border-[var(--color-border)] pb-2.5">
              مشخصات و تنظیمات آزمون
            </h3>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                عنوان آزمون *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                توضیحات و پیام مقدماتی
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] resize-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                آدرس تصویر کاور
              </label>
              <input
                type="url"
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] text-left font-mono transition-all"
              />
            </div>

            <div className="pt-2 border-t border-[var(--color-border)] space-y-3">
              <h4 className="font-semibold text-xs text-[var(--color-text)]">
                تنظیمات پیام عضویت و بازاریابی (CTA)
              </h4>

              <div>
                <label className="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1">
                  عنوان کارت ترغیب به ثبت‌نام
                </label>
                <input
                  type="text"
                  placeholder="مثلاً: تحلیل کامل کارنامه و دسترسی به ویدیوهای دوره"
                  value={ctaTitle}
                  onChange={(e) => setCtaTitle(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1">
                  متن دکمه CTA
                </label>
                <input
                  type="text"
                  placeholder="عضویت رایگان در AVANA"
                  value={ctaButtonText}
                  onChange={(e) => setCtaButtonText(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1">
                  لینک مقصد دکمه (پیش‌فرض: /register)
                </label>
                <input
                  type="text"
                  placeholder="/register"
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] text-left font-mono"
                />
              </div>
            </div>

            <Button
              variant="primary"
              size="md"
              type="submit"
              fullWidth
              disabled={isSavingDetails}
              isLoading={isSavingDetails}
            >
              {isSavingDetails ? "در حال ذخیره..." : "ذخیره تغییرات مشخصات"}
            </Button>
          </form>
        </div>
      </div>

      {/* Add Question Modal */}
      <Dialog
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        isCompound={true}
        maxWidth="3xl"
      >
        <DialogHeader onClose={() => setIsAddModalOpen(false)}>
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-[10px] bg-[var(--color-secondary-light)] text-[var(--color-primary-default)]">
              <Plus className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-base text-[var(--color-text)]">
                افزودن سؤال به آزمون
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                سؤال جدید را به صورت دستی، از بانک سؤالات یا توسط هوش مصنوعی به آزمون اضافه کنید.
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogContent className="p-0">
          {/* Method Tabs */}
          <div className="flex border-b border-[var(--color-border)] px-6 bg-[var(--color-background)] text-xs font-medium">
            <button
              type="button"
              onClick={() => setAddMethod("manual")}
              className={`px-4 py-3 border-b-2 -mb-[1px] transition-colors ${
                addMethod === "manual"
                  ? "border-[var(--color-primary-default)] text-[var(--color-primary-default)] font-bold"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              ۱. ورود دستی سؤال
            </button>
            <button
              type="button"
              onClick={() => setAddMethod("bank")}
              className={`px-4 py-3 border-b-2 -mb-[1px] transition-colors ${
                addMethod === "bank"
                  ? "border-[var(--color-primary-default)] text-[var(--color-primary-default)] font-bold"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              ۲. انتخاب از بانک سؤالات
            </button>
            <button
              type="button"
              onClick={() => setAddMethod("ai")}
              className={`px-4 py-3 border-b-2 -mb-[1px] transition-colors ${
                addMethod === "ai"
                  ? "border-[var(--color-primary-default)] text-[var(--color-primary-default)] font-bold"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              ۳. تولید با هوش مصنوعی (Gemini)
            </button>
          </div>

          {/* Tab 1: Manual Question Form */}
          {addMethod === "manual" && (
            <form onSubmit={handleManualAddSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  متن سؤال *
                </label>
                <textarea
                  rows={2}
                  value={manualQuestion}
                  onChange={(e) => setManualQuestion(e.target.value)}
                  placeholder="متن سؤال چهارگزینه‌ای را وارد کنید..."
                  className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] resize-none"
                  required
                />
              </div>

              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-[var(--color-text)]">
                  گزینه‌ها و تعیین پاسخ صحیح *
                </label>
                {manualChoices.map((choice, cIdx) => (
                  <div key={choice.id} className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="correctChoice"
                      checked={manualCorrectChoiceId === choice.id}
                      onChange={() => setManualCorrectChoiceId(choice.id)}
                      className="text-[var(--color-primary-default)] focus:ring-[var(--color-primary-default)] shrink-0 h-4 w-4"
                    />
                    <input
                      type="text"
                      placeholder={`گزینه ${cIdx + 1}`}
                      value={choice.text}
                      onChange={(e) => {
                        const updated = [...manualChoices];
                        updated[cIdx].text = e.target.value;
                        setManualChoices(updated);
                      }}
                      className="flex-1 text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                      required={cIdx < 2}
                    />
                  </div>
                ))}
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  با کلیک بر روی دکمه رادیویی کنار هر گزینه، آن را به عنوان پاسخ صحیح تعیین کنید.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  تشریح علمی و دلیل پاسخ (اختیاری)
                </label>
                <textarea
                  rows={2}
                  value={manualExplanation}
                  onChange={(e) => setManualExplanation(e.target.value)}
                  placeholder="توضیح کوتاه درباره دلیل درستی گزینه..."
                  className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                    سطح دشواری
                  </label>
                  <select
                    value={manualDifficulty}
                    onChange={(e) => setManualDifficulty(e.target.value as "easy" | "medium" | "hard")}
                    className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                  >
                    <option value="easy">آسان</option>
                    <option value="medium">متوسط</option>
                    <option value="hard">دشوار</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                    موضوع یا مبحث
                  </label>
                  <input
                    type="text"
                    placeholder="مثلاً: بتابلاکرها"
                    value={manualTopic}
                    onChange={(e) => setManualTopic(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="saveToBank"
                  checked={manualSaveToBank}
                  onChange={(e) => setManualSaveToBank(e.target.checked)}
                  className="rounded text-[var(--color-primary-default)] focus:ring-[var(--color-primary-default)] h-4 w-4"
                />
                <label htmlFor="saveToBank" className="text-xs text-[var(--color-text)] cursor-pointer">
                  همچنین این سؤال به بانک سؤالات استودیو اضافه شود
                </label>
              </div>

              <div className="pt-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  انصراف
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                >
                  افزودن سؤال به آزمون
                </Button>
              </div>
            </form>
          )}

          {/* Tab 2: Bank Selection */}
          {addMethod === "bank" && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="جستجو در بانک سؤالات بر اساس متن یا موضوع..."
                    value={bankSearch}
                    onChange={(e) => setBankSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchBank()}
                    className="w-full text-xs pr-9 pl-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={handleSearchBank}
                >
                  جستجو
                </Button>
              </div>

              {isBankLoading ? (
                <div className="py-12 text-center text-xs text-[var(--color-text-muted)]">
                  در حال دریافت بانک سؤالات...
                </div>
              ) : bankItems.length === 0 ? (
                <div className="text-center py-12 text-xs text-[var(--color-text-muted)] border border-dashed border-[var(--color-border)] rounded-xl">
                  هیچ سؤالی در بانک با این کلمات یافت نشد.
                </div>
              ) : (
                <div className="space-y-3 max-h-[55vh] overflow-y-auto">
                  {bankItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl flex items-start justify-between gap-3 hover:border-[var(--color-primary-default)]/40 transition-colors"
                    >
                      <div className="space-y-1.5 flex-1">
                        <p className="text-xs font-medium text-[var(--color-text)] line-clamp-2">
                          {item.question}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
                          {item.topic && (
                            <span className="px-2 py-0.5 rounded bg-[var(--color-background)] border border-[var(--color-border)]">
                              موضوع: {item.topic}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-[var(--color-background)] border border-[var(--color-border)]">
                            گزینه‌ها: {item.choices.length}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => handleImportFromBank(item)}
                        className="shrink-0 font-medium"
                      >
                        + افزودن Snapshot
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Gemini AI Generation */}
          {addMethod === "ai" && (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                    موضوع یا مبحث آزمون *
                  </label>
                  <input
                    type="text"
                    placeholder="مثلاً: مهارکننده‌های ACE و مسدودکننده‌های ARB"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                    قالب تخصصی سؤال
                  </label>
                  <select
                    value={aiQuestionType}
                    onChange={(e) => setAiQuestionType(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                    سطح دشواری
                  </label>
                  <select
                    value={aiDifficulty}
                    onChange={(e) => setAiDifficulty(e.target.value as "easy" | "medium" | "hard")}
                    className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                  >
                    <option value="easy">آسان</option>
                    <option value="medium">متوسط</option>
                    <option value="hard">دشوار</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                    تعداد سؤال درخواستی
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={aiCount}
                    onChange={(e) => setAiCount(parseInt(e.target.value, 10) || 1)}
                    className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  دستورالعمل و الزامات مدیر (اختیاری)
                </label>
                <input
                  type="text"
                  placeholder="مثلاً: تأکید بر تفاوت کاپتوپریل و لوزارتان در بروز سرفه خشک"
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  تولید مشابه نمونه (Few-Shot) - اختیاری
                </label>
                <textarea
                  rows={2}
                  placeholder="یک سؤال نمونه وارد کنید تا مدل سبک نگارش و کیفیت گزینه‌ها را از آن الگوبرداری کند..."
                  value={aiSampleQuestion}
                  onChange={(e) => setAiSampleQuestion(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] resize-none"
                />
              </div>

              <Button
                variant="primary"
                size="md"
                type="button"
                fullWidth
                onClick={handleGenerateAi}
                disabled={isAiGenerating}
                isLoading={isAiGenerating}
                className="gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {isAiGenerating ? "در حال تولید سؤالات با Gemini..." : "تولید هوشمند سؤالات با هوش مصنوعی"}
              </Button>

              {/* AI Generated Preview List */}
              {aiGeneratedList.length > 0 && (
                <div className="pt-4 border-t border-[var(--color-border)] space-y-3">
                  <h4 className="font-bold text-xs text-[var(--color-text)]">
                    سؤالات تولیدشده (بررسی و افزودن):
                  </h4>
                  {aiGeneratedList.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-3"
                    >
                      <p className="text-xs font-medium text-[var(--color-text)]">
                        {item.question}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        {item.choices.map((c) => (
                          <div
                            key={c.id}
                            className={`p-2 rounded-[8px] border ${
                              c.id === item.correctAnswer.choiceId
                                ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-bold"
                                : "bg-[var(--color-background)] border-[var(--color-border)] text-[var(--color-text-muted)]"
                            }`}
                          >
                            {c.text}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-[var(--color-text-muted)]">
                          {item.explanation ? `توضیح: ${item.explanation.slice(0, 60)}...` : ""}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          onClick={() => handleAddAiQuestionToQuiz(item)}
                          className="font-medium"
                        >
                          + افزودن این سؤال به آزمون
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Question Modal */}
      <Dialog
        isOpen={!!editingQuestion}
        onClose={() => setEditingQuestion(null)}
        isCompound={true}
        maxWidth="2xl"
      >
        <DialogHeader onClose={() => setEditingQuestion(null)}>
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-[10px] bg-[var(--color-secondary-light)] text-[var(--color-primary-default)]">
              <Edit2 className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-base text-[var(--color-text)]">
                ویرایش سؤال آزمون
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                تغییرات به صورت ایزوله (Snapshot) در این آزمون ثبت می‌شود و منبع اصلی تغییر نمی‌کند.
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogContent className="p-6">
          <form id="edit-question-form" onSubmit={handleSaveEditSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                متن سؤال *
              </label>
              <textarea
                rows={2}
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="متن سؤال چهارگزینه‌ای را وارد کنید..."
                className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] resize-none"
                required
              />
            </div>

            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-[var(--color-text)]">
                گزینه‌ها و تعیین پاسخ صحیح *
              </label>
              {editChoices.map((choice, cIdx) => (
                <div key={choice.id || cIdx} className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="editCorrectChoice"
                    checked={editCorrectChoiceId === choice.id}
                    onChange={() => setEditCorrectChoiceId(choice.id)}
                    className="text-[var(--color-primary-default)] focus:ring-[var(--color-primary-default)] shrink-0 h-4 w-4"
                  />
                  <input
                    type="text"
                    placeholder={`گزینه ${cIdx + 1}`}
                    value={choice.text}
                    onChange={(e) => {
                      const updated = [...editChoices];
                      updated[cIdx].text = e.target.value;
                      setEditChoices(updated);
                    }}
                    className="flex-1 text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                    required={cIdx < 2}
                  />
                </div>
              ))}
              <p className="text-[11px] text-[var(--color-text-muted)]">
                با کلیک بر روی دکمه رادیویی کنار هر گزینه، آن را به عنوان پاسخ صحیح تعیین کنید.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                تشریح علمی و دلیل پاسخ (اختیاری)
              </label>
              <textarea
                rows={2}
                value={editExplanation}
                onChange={(e) => setEditExplanation(e.target.value)}
                placeholder="توضیح درباره پاسخ صحیح و نکات تشریحی..."
                className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  سطح دشواری
                </label>
                <select
                  value={editDifficulty}
                  onChange={(e) => setEditDifficulty(e.target.value as "easy" | "medium" | "hard")}
                  className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                >
                  <option value="easy">آسان</option>
                  <option value="medium">متوسط</option>
                  <option value="hard">دشوار</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  موضوع یا مبحث
                </label>
                <input
                  type="text"
                  placeholder="مثلاً: بتابلاکرها"
                  value={editTopic}
                  onChange={(e) => setEditTopic(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  نوع سؤال
                </label>
                <select
                  value={editQuestionType}
                  onChange={(e) => setEditQuestionType(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </form>
        </DialogContent>

        <DialogFooter className="flex items-center justify-end gap-2.5">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setEditingQuestion(null)}
          >
            انصراف
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            form="edit-question-form"
            disabled={isSavingQuestion}
            isLoading={isSavingQuestion}
          >
            {isSavingQuestion ? "در حال ذخیره..." : "ذخیره تغییرات سؤال"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Unified Question Bank Modal */}
      <Dialog
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        isCompound={true}
        maxWidth="5xl"
      >
        <DialogHeader onClose={() => setIsBankModalOpen(false)}>
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-[10px] bg-[var(--color-secondary-light)] text-[var(--color-primary-default)]">
              <Database className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-base text-[var(--color-text)]">
                بانک جامع سؤالات AVANA
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                جستجو و انتخاب سؤالات از دوره‌های آموزشی، بانک سؤالات استودیو و سایر آزمون‌ها با کپی مستقل (Snapshot)
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogContent className="p-0 flex flex-col max-h-[75vh]">
          {/* Filter & Taxonomy Control Center */}
          <div className="p-4 bg-[var(--color-background)] border-b border-[var(--color-border)] space-y-3 shrink-0">
            {/* Source Type Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 bg-[var(--color-surface)] p-1 rounded-xl border border-[var(--color-border)] w-fit text-xs font-medium">
              <button
                type="button"
                onClick={() => {
                  setBankSourceType("all");
                  setBankCourseId("");
                  setBankModuleId("");
                  setBankLessonId("");
                }}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  bankSourceType === "all"
                    ? "bg-[var(--color-primary-default)] text-white font-bold"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                همه منابع
              </button>
              <button
                type="button"
                onClick={() => setBankSourceType("course")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  bankSourceType === "course"
                    ? "bg-[var(--color-primary-default)] text-white font-bold"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                سؤالات دوره‌های آموزشی
              </button>
              <button
                type="button"
                onClick={() => {
                  setBankSourceType("bank");
                  setBankCourseId("");
                  setBankModuleId("");
                  setBankLessonId("");
                }}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  bankSourceType === "bank"
                    ? "bg-[var(--color-primary-default)] text-white font-bold"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                بانک سؤالات استودیو
              </button>
              <button
                type="button"
                onClick={() => {
                  setBankSourceType("studio_quiz");
                  setBankCourseId("");
                  setBankModuleId("");
                  setBankLessonId("");
                }}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  bankSourceType === "studio_quiz"
                    ? "bg-[var(--color-primary-default)] text-white font-bold"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                سایر آزمون‌های استودیو
              </button>
            </div>

            {/* Search & Hierarchical Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {/* Search Input */}
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="جستجو در متن یا موضوع..."
                  value={bankSearchText}
                  onChange={(e) => setBankSearchText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadUnifiedBankQuestions()}
                  className="w-full text-xs pr-9 pl-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                />
              </div>

              {/* Course Cascading Select */}
              {(bankSourceType === "all" || bankSourceType === "course") && (
                <div>
                  <select
                    value={bankCourseId}
                    onChange={(e) => {
                      setBankCourseId(e.target.value);
                      setBankModuleId("");
                      setBankLessonId("");
                    }}
                    className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                  >
                    <option value="">همه دوره‌ها</option>
                    {bankSources?.courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Chapter / Module Cascading Select */}
              {(bankSourceType === "all" || bankSourceType === "course") && bankCourseId && (
                <div>
                  <select
                    value={bankModuleId}
                    onChange={(e) => {
                      setBankModuleId(e.target.value);
                      setBankLessonId("");
                    }}
                    className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                  >
                    <option value="">همه فصل‌ها / ماژول‌ها</option>
                    {bankSources?.courses
                      .find((c) => c.id === bankCourseId)
                      ?.modules.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Lesson Cascading Select */}
              {(bankSourceType === "all" || bankSourceType === "course") && bankModuleId && (
                <div>
                  <select
                    value={bankLessonId}
                    onChange={(e) => setBankLessonId(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                  >
                    <option value="">همه درس‌ها</option>
                    {bankSources?.courses
                      .find((c) => c.id === bankCourseId)
                      ?.modules.find((m) => m.id === bankModuleId)
                      ?.lessons.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.title}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Difficulty Select */}
              <div>
                <select
                  value={bankDifficulty}
                  onChange={(e) => setBankDifficulty(e.target.value as "all" | "easy" | "medium" | "hard")}
                  className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                >
                  <option value="all">همه سطوح دشواری</option>
                  <option value="easy">آسان</option>
                  <option value="medium">متوسط</option>
                  <option value="hard">دشوار</option>
                </select>
              </div>

              {/* Question Type Select */}
              <div>
                <select
                  value={bankQuestionType}
                  onChange={(e) => setBankQuestionType(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                >
                  <option value="all">همه قالب‌ها</option>
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Apply Button */}
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setBankPage(1);
                    loadUnifiedBankQuestions(1);
                  }}
                  className="flex-1"
                >
                  اعمال فیلتر
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setBankSearchText("");
                    setBankCourseId("");
                    setBankModuleId("");
                    setBankLessonId("");
                    setBankDifficulty("all");
                    setBankQuestionType("all");
                    setBankPage(1);
                  }}
                  title="پاک‌سازی فیلترها"
                >
                  بازنشانی
                </Button>
              </div>
            </div>

            {/* Sub-bar: Selection stats & bulk actions */}
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-[var(--color-text-muted)] font-medium">
                {isUnifiedBankLoading
                  ? "در حال جستجو..."
                  : `${unifiedBankTotal} سؤال منطبق یافت شد`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllOnPage}
                  disabled={unifiedBankQuestions.length === 0}
                  className="text-xs text-[var(--color-primary-default)] hover:underline disabled:opacity-40"
                >
                  انتخاب همه در این صفحه ({unifiedBankQuestions.length})
                </button>
                <span className="text-[var(--color-border)]">|</span>
                <button
                  type="button"
                  onClick={handleClearAllSelections}
                  disabled={selectedBankQuestions.size === 0}
                  className="text-xs text-[var(--color-text-muted)] hover:text-red-600 disabled:opacity-40"
                >
                  لغو همه انتخاب‌ها ({selectedBankQuestions.size})
                </button>
              </div>
            </div>
          </div>

          {/* Questions List (Scrollable Area) */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px]">
            {isUnifiedBankLoading ? (
              <div className="py-20 text-center text-xs text-[var(--color-text-muted)]">
                در حال جستجو و دریافت سؤالات بانک...
              </div>
            ) : unifiedBankQuestions.length === 0 ? (
              <div className="py-16 text-center text-xs text-[var(--color-text-muted)] border border-dashed border-[var(--color-border)] rounded-xl">
                هیچ سؤالی با فیلترهای مشخص‌شده یافت نشد.
              </div>
            ) : (
              unifiedBankQuestions.map((item) => {
                const isSelected = selectedBankQuestions.has(item.id);
                const alreadyInQuiz = isQuestionAlreadyInQuiz(item);

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (!alreadyInQuiz) handleToggleSelectBankQuestion(item);
                    }}
                    className={`p-4 rounded-xl border transition-all ${
                      alreadyInQuiz
                        ? "bg-[var(--color-surface)]/60 border-[var(--color-border)] opacity-70 cursor-not-allowed"
                        : isSelected
                        ? "bg-[var(--color-secondary-light)]/40 border-[var(--color-primary-default)] shadow-sm ring-1 ring-[var(--color-primary-default)] cursor-pointer"
                        : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-primary-default)]/40 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={alreadyInQuiz ? false : isSelected}
                          disabled={alreadyInQuiz}
                          onChange={() => {}} // Handled by container onClick
                          className="mt-0.5 rounded text-[var(--color-primary-default)] focus:ring-[var(--color-primary-default)] h-4 w-4 disabled:opacity-40"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs sm:text-sm font-medium text-[var(--color-text)] leading-relaxed">
                              {item.question}
                            </p>
                            {alreadyInQuiz && (
                              <Badge variant="neutral" size="sm" className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 shrink-0 text-[10px]">
                                در این آزمون موجود است
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {/* Source Badge */}
                            {item.sourceType === "course" && (
                              <span className="text-[10px] bg-[var(--color-secondary-light)] text-[var(--color-secondary-dark)] px-2 py-0.5 rounded-md border border-[var(--color-secondary)]/40">
                                دوره: {item.sourceCourseTitle || "نامشخص"} {item.sourceLessonTitle ? `> ${item.sourceLessonTitle}` : ""}
                              </span>
                            )}
                            {item.sourceType === "bank" && (
                              <span className="text-[10px] bg-[var(--color-warm)]/40 text-[#8c6b2d] px-2 py-0.5 rounded-md border border-[var(--color-warm)]">
                                بانک استودیو
                              </span>
                            )}
                            {item.sourceType === "studio_quiz" && (
                              <span className="text-[10px] bg-[var(--color-primary-light)] text-[var(--color-primary-default)] px-2 py-0.5 rounded-md border border-[var(--color-primary-default)]/30">
                                آزمون قبلی: {item.sourceQuizTitle || "نامشخص"}
                              </span>
                            )}
                            {/* Difficulty */}
                            <span className="text-[10px] bg-[var(--color-background)] text-[var(--color-text-muted)] px-2 py-0.5 rounded border border-[var(--color-border)]">
                              {item.difficulty === "easy" ? "آسان" : item.difficulty === "hard" ? "دشوار" : "متوسط"}
                            </span>
                            {/* Topic */}
                            {item.topic && (
                              <span className="text-[10px] bg-[var(--color-background)] text-[var(--color-text-muted)] px-2 py-0.5 rounded border border-[var(--color-border)]">
                                {item.topic}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Choices Preview */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-[var(--color-border)]">
                      {item.choices.map((c) => {
                        const isCorrect = isChoiceCorrect(c, item.correctAnswer, item.choices);
                        return (
                          <div
                            key={c.id}
                            className={`p-2 rounded-[8px] text-[11px] flex items-center justify-between border ${
                              isCorrect
                                ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-medium"
                                : "bg-[var(--color-background)] border-[var(--color-border)] text-[var(--color-text-muted)]"
                            }`}
                          >
                            <span>{c.text}</span>
                            {isCorrect && (
                              <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold">
                                صحیح
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {isAnswerAmbiguous(item.correctAnswer) && (
                      <div className="mt-2 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>پاسخ صحیح این سؤال مشخص نیست و نیاز به بازبینی دارد.</span>
                      </div>
                    )}

                    {/* Explanation Preview */}
                    {item.explanation && (
                      <div className="mt-2.5 text-[11px] text-[var(--color-text-muted)] bg-[var(--color-background)] p-2.5 rounded-[8px] border border-[var(--color-border)]">
                        <span className="font-semibold text-[var(--color-text)]">تشریح: </span>
                        {item.explanation}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Controls */}
          {Math.ceil(unifiedBankTotal / 50) > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--color-border)] bg-[var(--color-background)] shrink-0 text-xs">
              <div className="text-[var(--color-text-muted)]">
                صفحه <span className="font-bold text-[var(--color-text)]">{toPersianDigits(bankPage)}</span> از{" "}
                <span className="font-bold text-[var(--color-text)]">
                  {toPersianDigits(Math.ceil(unifiedBankTotal / 50))}
                </span>{" "}
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  ({toPersianDigits(unifiedBankTotal)} سؤال کل)
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={bankPage <= 1 || isUnifiedBankLoading}
                  onClick={() => setBankPage((p) => Math.max(1, p - 1))}
                  leftIcon={<ChevronRight className="w-3.5 h-3.5" />}
                >
                  صفحه قبل
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.ceil(unifiedBankTotal / 50) }, (_, i) => i + 1)
                    .filter((p, _, arr) => p === 1 || p === arr.length || Math.abs(p - bankPage) <= 1)
                    .reduce<(number | string)[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                        acc.push("...");
                      }
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === "..." ? (
                        <span key={`dots-${idx}`} className="px-1 text-[var(--color-text-muted)]">
                          ...
                        </span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setBankPage(item as number)}
                          disabled={isUnifiedBankLoading}
                          className={`w-7 h-7 text-xs font-semibold rounded-lg transition-colors ${
                            bankPage === item
                              ? "bg-[var(--color-primary-default)] text-white"
                              : "text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
                          }`}
                        >
                          {toPersianDigits(item)}
                        </button>
                      )
                    )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={bankPage >= Math.ceil(unifiedBankTotal / 50) || isUnifiedBankLoading}
                  onClick={() => setBankPage((p) => Math.min(Math.ceil(unifiedBankTotal / 50), p + 1))}
                  rightIcon={<ChevronLeft className="w-3.5 h-3.5" />}
                >
                  صفحه بعد
                </Button>
              </div>
            </div>
          )}
        </DialogContent>

        {/* Modal Sticky Footer */}
        <DialogFooter className="flex items-center justify-between gap-3">
          <div className="text-xs text-[var(--color-text)]">
            <span className="font-bold text-[var(--color-primary-default)] text-sm">
              {toPersianDigits(selectedBankQuestions.size)}
            </span>{" "}
            سؤال جهت افزودن انتخاب شده است.
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setIsBankModalOpen(false)}
            >
              انصراف
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={handleBatchAddSelected}
              disabled={selectedBankQuestions.size === 0 || isBatchAdding}
              isLoading={isBatchAdding}
            >
              {isBatchAdding
                ? "در حال افزودن سؤالات..."
                : `+ افزودن ${toPersianDigits(selectedBankQuestions.size)} سؤال به این آزمون`}
            </Button>
          </div>
        </DialogFooter>
      </Dialog>

      {/* Quick Preview Dialog */}
      <Dialog
        isOpen={isQuickPreviewOpen}
        onClose={() => setIsQuickPreviewOpen(false)}
        isCompound={true}
        maxWidth="3xl"
      >
        <DialogHeader onClose={() => setIsQuickPreviewOpen(false)}>
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-[10px] bg-[var(--color-primary-light)]/20 text-[var(--color-primary-default)]">
                <Eye className="w-4 h-4" />
              </span>
              <div>
                <h3 className="font-bold text-base text-[var(--color-text)]">
                  پیش‌نمایش سریع آزمون (ویژه طراح)
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  بررسی جریان پاسخگویی و صحت پاسخنامه قبل از انتشار عمومی
                </p>
              </div>
            </div>

            {/* Answer Key Toggle */}
            <button
              type="button"
              onClick={() => setQuickPreviewShowAnswerKey((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                quickPreviewShowAnswerKey
                  ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-800 dark:text-emerald-200"
                  : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-muted)]"
              }`}
            >
              <span>{quickPreviewShowAnswerKey ? "پاسخنامه: فعال ✓" : "پاسخنامه: غیرفعال"}</span>
            </button>
          </div>
        </DialogHeader>

        <DialogContent className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {(!quiz.questions || quiz.questions.length === 0) ? (
            <div className="text-center py-12 text-xs text-[var(--color-text-muted)]">
              هنوز هیچ سؤالی به آزمون اضافه نشده است.
            </div>
          ) : (
            (() => {
              const currentQ = quiz.questions[quickPreviewIndex] || quiz.questions[0];
              const totalQ = quiz.questions.length;
              const selectedChoiceId = quickPreviewAnswers[currentQ.id];

              return (
                <div className="space-y-4">
                  {/* Progress & Counter */}
                  <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                    <span className="font-semibold text-[var(--color-primary-default)]">
                      سؤال {toPersianDigits(quickPreviewIndex + 1)} از {toPersianDigits(totalQ)}
                    </span>
                    {currentQ.topic && (
                      <span className="bg-[var(--color-surface-warm)] px-2.5 py-0.5 rounded-full border border-[var(--color-border)]">
                        {currentQ.topic}
                      </span>
                    )}
                  </div>

                  <Progress value={((quickPreviewIndex + 1) / totalQ) * 100} size="sm" />

                  {/* Question Prompt */}
                  <div className="p-4 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] text-sm font-bold text-[var(--color-text)] leading-relaxed">
                    <RichContent content={currentQ.question} />
                  </div>

                  {/* Choices */}
                  <div className="space-y-2.5">
                    {currentQ.choices.map((choice, cIdx) => {
                      const isSelected = selectedChoiceId === choice.id;
                      const isCorrectChoice = isChoiceCorrect(choice, currentQ.correctAnswer, currentQ.choices);
                      const shouldHighlight = quickPreviewShowAnswerKey && isCorrectChoice;

                      return (
                        <div
                          key={choice.id}
                          onClick={() =>
                            setQuickPreviewAnswers((prev) => ({
                              ...prev,
                              [currentQ.id]: choice.id,
                            }))
                          }
                          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 cursor-pointer transition-all ${
                            shouldHighlight
                              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-900 dark:text-emerald-100 font-bold"
                              : isSelected
                              ? "bg-[var(--color-primary-light)]/20 border-[var(--color-primary-default)] text-[var(--color-text)] font-semibold"
                              : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary-default)]/40"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-6 h-6 rounded-lg bg-[var(--color-surface-warm)] flex items-center justify-center text-xs font-bold text-[var(--color-text-muted)] border border-[var(--color-border)]">
                              {["الف", "ب", "ج", "د"][cIdx] || toPersianDigits(cIdx + 1)}
                            </span>
                            <RichContent content={choice.text} inline />
                          </div>

                          {shouldHighlight && (
                            <Badge variant="success" size="sm">
                              پاسخ صحیح
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation if Answer Key enabled */}
                  {quickPreviewShowAnswerKey && currentQ.explanation && (
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-xs text-[var(--color-text)] space-y-1">
                      <span className="font-bold text-amber-800 dark:text-amber-300">تشریح و تحلیل پاسخ:</span>
                      <RichContent content={currentQ.explanation} />
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </DialogContent>

        <DialogFooter className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={quickPreviewIndex <= 0}
            onClick={() => setQuickPreviewIndex((i) => Math.max(0, i - 1))}
            leftIcon={<ChevronRight className="w-3.5 h-3.5" />}
          >
            سؤال قبلی
          </Button>

          <Button
            variant="primary"
            size="sm"
            disabled={quickPreviewIndex >= (quiz.questions?.length ?? 1) - 1}
            onClick={() =>
              setQuickPreviewIndex((i) => Math.min((quiz.questions?.length ?? 1) - 1, i + 1))
            }
            rightIcon={<ChevronLeft className="w-3.5 h-3.5" />}
          >
            سؤال بعدی
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
