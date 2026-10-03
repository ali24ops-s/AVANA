/**
 * QuestionEditorItem component.
 *
 * Dedicated editor for a single exam question:
 *  - prompt textarea
 *  - points input
 *  - options list with radio for marking correct option
 *  - explanation textarea
 *  - reorder (up / down) buttons
 *  - delete confirmation
 */

import { useState } from "react";
import { Card, Button, Input, Textarea, Badge } from "../../ui/index.js";
import {
  type TeacherExamQuestion,
  type ExamOption,
  type QuestionType,
  type TrueFalseStatement,
  TRUE_FALSE_FIXED_PROMPT,
  toPersianDigits,
} from "@avana/domain";
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  CheckCircle2,
  Plus,
  X,
  FileText,
  Check,
} from "lucide-react";

export interface QuestionEditorItemProps {
  question: TeacherExamQuestion;
  index: number;
  totalQuestions: number;
  isSaving?: boolean;
  onSave: (questionId: string, updated: {
    questionType?: QuestionType;
    prompt: string;
    options?: ExamOption[];
    statements?: TrueFalseStatement[];
    correctOptionId?: string | null;
    points: number;
    explanation?: string | null;
  }) => Promise<void>;
  onDelete: (questionId: string) => Promise<void>;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function QuestionEditorItem({
  question,
  index,
  totalQuestions,
  isSaving = false,
  onSave,
  onDelete,
  onMoveUp,
  onMoveDown,
}: QuestionEditorItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [questionType, setQuestionType] = useState<QuestionType>(question.questionType ?? "single_choice");
  const [prompt, setPrompt] = useState(question.prompt);
  const [points, setPoints] = useState(question.points);
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [options, setOptions] = useState<ExamOption[]>(question.options ?? []);
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(question.correctOptionId ?? null);
  const [statements, setStatements] = useState<TrueFalseStatement[]>(
    question.statements && question.statements.length > 0
      ? question.statements
      : [
          { id: "stmt_1", text: "", correctAnswer: true },
          { id: "stmt_2", text: "", correctAnswer: false },
        ],
  );
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOptionTextChange = (optId: string, text: string) => {
    setOptions((prev) =>
      prev.map((opt) => (opt.id === optId ? { ...opt, text } : opt)),
    );
  };

  const handleStatementTextChange = (stmtId: string, text: string) => {
    setStatements((prev) =>
      prev.map((s) => (s.id === stmtId ? { ...s, text } : s)),
    );
  };

  const handleStatementAnswerChange = (stmtId: string, correctAnswer: boolean) => {
    setStatements((prev) =>
      prev.map((s) => (s.id === stmtId ? { ...s, correctAnswer } : s)),
    );
  };

  const handleAddStatement = () => {
    setError(null);
    if (statements.length >= 8) {
      setError("حداکثر ۸ گزاره برای هر سؤال صحیح/غلط مجاز است.");
      return;
    }
    const newId = `stmt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setStatements((prev) => [...prev, { id: newId, text: "", correctAnswer: true }]);
  };

  const handleRemoveStatement = (stmtId: string) => {
    setError(null);
    if (statements.length <= 1) {
      setError("حداقل ۱ گزاره برای هر سؤال صحیح/غلط الزامی است.");
      return;
    }
    setStatements((prev) => prev.filter((s) => s.id !== stmtId));
  };

  const handleSetOptionCount = (targetCount: 4 | 5 | 6) => {
    setError(null);
    const currentCount = options.length;
    if (targetCount === currentCount) return;

    if (targetCount > currentCount) {
      const updated = [...options];
      for (let i = currentCount + 1; i <= targetCount; i++) {
        const newId = `opt_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
        updated.push({ id: newId, text: "" });
      }
      setOptions(updated);
    } else {
      const optionsToDrop = options.slice(targetCount);
      const isDroppingCorrect = optionsToDrop.some((o) => o.id === correctOptionId);
      if (isDroppingCorrect) {
        setError("ابتدا پاسخ صحیح را از گزینه‌ای که قرار است حذف شود تغییر دهید.");
        return;
      }
      const hasDataInDropped = optionsToDrop.some((o) => o.text.trim().length > 0);
      if (hasDataInDropped) {
        const confirmDiscard = window.confirm(
          `با کاهش تعداد گزینه‌ها به ${toPersianDigits(targetCount)}، متن گزینه‌های اضافه حذف خواهد شد. آیا مطمئن هستید؟`,
        );
        if (!confirmDiscard) return;
      }
      setOptions(options.slice(0, targetCount));
    }
  };

  const handleSave = async () => {
    setError(null);
    const trimmedPrompt = questionType === "true_false" ? TRUE_FALSE_FIXED_PROMPT : prompt.trim();
    if (!trimmedPrompt) {
      setError("صورت سوال نمی‌تواند خالی باشد.");
      return;
    }

    if (points <= 0) {
      setError("بارم سوال باید عددی مثبت باشد.");
      return;
    }

    if (questionType === "single_choice") {
      if (options.length < 4 || options.length > 6) {
        setError("سوال تستی باید دارای ۴، ۵ یا ۶ گزینه باشد.");
        return;
      }

      for (const opt of options) {
        if (!opt.text.trim()) {
          setError("متن تمام گزینه‌ها باید تکمیل شود.");
          return;
        }
      }

      if (!correctOptionId || !options.some((o) => o.id === correctOptionId)) {
        setError("لطفاً گزینه صحیح را مشخص کنید.");
        return;
      }
    } else if (questionType === "true_false") {
      if (statements.length < 1 || statements.length > 8) {
        setError("تعداد گزاره‌های سوال صحیح/غلط باید بین ۱ تا ۸ باشد.");
        return;
      }

      for (const s of statements) {
        if (!s.text.trim()) {
          setError("متن تمام گزاره‌ها باید تکمیل شود.");
          return;
        }
      }
    }

    try {
      await onSave(question.id, {
        questionType,
        prompt: trimmedPrompt,
        options:
          questionType === "single_choice"
            ? options.map((o) => ({ id: o.id, text: o.text.trim() }))
            : [],
        statements:
          questionType === "true_false"
            ? statements.map((s) => ({
                id: s.id,
                text: s.text.trim(),
                correctAnswer: s.correctAnswer,
              }))
            : undefined,
        correctOptionId: questionType === "single_choice" ? correctOptionId : null,
        points,
        explanation: explanation.trim() || null,
      });
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره سوال");
    }
  };

  const handleCancel = () => {
    setQuestionType(question.questionType ?? "single_choice");
    setPrompt(question.prompt);
    setPoints(question.points);
    setExplanation(question.explanation ?? "");
    setOptions(question.options ?? []);
    setCorrectOptionId(question.correctOptionId ?? null);
    setStatements(
      question.statements && question.statements.length > 0
        ? question.statements
        : [
            { id: "stmt_1", text: "", correctAnswer: true },
            { id: "stmt_2", text: "", correctAnswer: false },
          ],
    );
    setError(null);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!window.confirm("آیا از حذف این سوال اطمینان دارید؟")) return;
    setIsDeleting(true);
    try {
      await onDelete(question.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const isDescriptive = question.questionType === "descriptive";
  const isTrueFalse = question.questionType === "true_false";

  return (
    <Card className="relative overflow-hidden border border-[var(--color-border)] shadow-xs">
      {/* Header bar: question number, type badge, points, reorder buttons */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="primary" size="md">
            سوال {(index + 1).toLocaleString("fa-IR")}
          </Badge>
          <Badge
            variant={isDescriptive ? "neutral" : isTrueFalse ? "secondary" : "secondary"}
            size="sm"
          >
            {isDescriptive
              ? "تشریحی"
              : isTrueFalse
              ? `صحیح / غلط (${toPersianDigits(question.statements?.length ?? 0)} گزاره)`
              : `تستی (${toPersianDigits(question.options?.length ?? 4)} گزینه‌ای)`}
          </Badge>
          <span className="text-xs text-[var(--color-text-muted)] font-medium">
            بارم: {question.points.toLocaleString("fa-IR")} نمره
          </span>
        </div>

        <div className="flex items-center gap-1">
          {onMoveUp && (
            <button
              type="button"
              disabled={index === 0}
              onClick={onMoveUp}
              aria-label="انتقال به بالا"
              className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              disabled={index === totalQuestions - 1}
              onClick={onMoveDown}
              aria-label="انتقال به پایین"
              className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            aria-label="حذف سوال"
            className="p-1 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors mr-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body: View Mode or Edit Mode */}
      {!isEditing ? (
        <div className="pt-3 space-y-3">
          <div className="text-xs sm:text-sm font-semibold text-[var(--color-text)] leading-relaxed whitespace-pre-wrap">
            {isTrueFalse ? (question.prompt || TRUE_FALSE_FIXED_PROMPT) : question.prompt}
          </div>

          {/* Options view or Descriptive / True-False indicator */}
          {isDescriptive ? (
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <FileText className="w-4 h-4 shrink-0 text-blue-500" />
              <span>
                پاسخ این سوال تشریحی است. دانشجو متن پاسخ خود را در آزمون تایپ می‌کند و پس از ثبت، نیازمند تصحیح و نمره‌دهی دستی توسط شما خواهد بود.
              </span>
            </div>
          ) : isTrueFalse ? (
            <div className="space-y-2 pt-1">
              {(question.statements ?? []).map((stmt, stmtIdx) => (
                <div
                  key={stmt.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)]/40 text-xs sm:text-sm"
                >
                  <div className="flex items-start gap-2.5 flex-1">
                    <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold bg-[var(--color-surface)] border border-[var(--color-border)]">
                      {(stmtIdx + 1).toLocaleString("fa-IR")}
                    </span>
                    <span className="leading-snug text-[var(--color-text)]">{stmt.text}</span>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 self-end sm:self-auto">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                        stmt.correctAnswer
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>پاسخ صحیح: {stmt.correctAnswer ? "صحیح" : "غلط"}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {(question.options ?? []).map((opt, optIdx) => {
                const isCorrect = opt.id === question.correctOptionId;
                return (
                  <div
                    key={opt.id}
                    className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs sm:text-sm transition-all ${
                      isCorrect
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-semibold"
                        : "bg-[var(--color-surface-warm)]/40 border-[var(--color-border)] text-[var(--color-text)]"
                    }`}
                  >
                    <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold bg-[var(--color-surface)] border border-[var(--color-border)]">
                      {(optIdx + 1).toLocaleString("fa-IR")}
                    </span>
                    <span className="flex-1 leading-snug">{opt.text}</span>
                    {isCorrect && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-bold shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>پاسخ صحیح</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {question.explanation && (
            <div className="text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-warm)]/50 p-2.5 rounded-xl border border-[var(--color-border)] mt-2">
              <span className="font-bold text-[var(--color-text)]">توضیح پاسخ: </span>
              <span>{question.explanation}</span>
            </div>
          )}

          <div className="pt-1 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="text-xs"
            >
              ویرایش سوال
            </Button>
          </div>
        </div>
      ) : (
        /* Edit Mode */
        <div className="pt-3 space-y-4">
          {error && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Question Type Toggle */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--color-text)]">
              نوع سوال *
            </label>
            <div className="flex items-center gap-4 p-2.5 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--color-text)]">
                <input
                  type="radio"
                  name={`edit-qtype-${question.id}`}
                  value="single_choice"
                  checked={questionType === "single_choice"}
                  onChange={() => {
                    setQuestionType("single_choice");
                    if (options.length === 0) {
                      setOptions([
                        { id: "opt_1", text: "" },
                        { id: "opt_2", text: "" },
                        { id: "opt_3", text: "" },
                        { id: "opt_4", text: "" },
                      ]);
                      setCorrectOptionId("opt_1");
                    }
                  }}
                  className="w-4 h-4 text-[#008080] focus:ring-[#008080]"
                />
                <span>تستی</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--color-text)]">
                <input
                  type="radio"
                  name={`edit-qtype-${question.id}`}
                  value="true_false"
                  checked={questionType === "true_false"}
                  onChange={() => {
                    setQuestionType("true_false");
                    if (statements.length === 0) {
                      setStatements([
                        { id: "stmt_1", text: "", correctAnswer: true },
                        { id: "stmt_2", text: "", correctAnswer: false },
                      ]);
                    }
                  }}
                  className="w-4 h-4 text-[#008080] focus:ring-[#008080]"
                />
                <span>صحیح / غلط (چند گزاره‌ای)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--color-text)]">
                <input
                  type="radio"
                  name={`edit-qtype-${question.id}`}
                  value="descriptive"
                  checked={questionType === "descriptive"}
                  onChange={() => setQuestionType("descriptive")}
                  className="w-4 h-4 text-[#008080] focus:ring-[#008080]"
                />
                <span>تشریحی (تصحیح دستی)</span>
              </label>
            </div>
          </div>

          {questionType === "true_false" ? (
            <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/70 border border-[var(--color-border)] text-xs text-[var(--color-text)] space-y-1">
              <span className="font-bold block text-[#008080]">صورت سؤال ثابت:</span>
              <p className="font-medium text-xs sm:text-sm">{TRUE_FALSE_FIXED_PROMPT}</p>
            </div>
          ) : (
            <Textarea
              label="صورت سوال *"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="صورت سوال را تایپ کنید..."
              required
            />
          )}

          {questionType === "true_false" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-semibold text-[var(--color-text)]">
                  گزاره‌ها و تعیین وضعیت صحیح / غلط (۱ تا ۸ گزاره) *
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  onClick={handleAddStatement}
                  disabled={statements.length >= 8}
                  className="text-xs h-7 px-2.5"
                >
                  افزودن گزاره ({toPersianDigits(statements.length)}/۸)
                </Button>
              </div>

              <div className="space-y-2.5">
                {statements.map((stmt, sIdx) => (
                  <div
                    key={stmt.id}
                    className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)]/30 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--color-text)]">
                        گزاره {(sIdx + 1).toLocaleString("fa-IR")}
                      </span>
                      {statements.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStatement(stmt.id)}
                          className="text-red-500 hover:text-red-700 p-1 rounded-lg hover:bg-red-500/10 transition-colors"
                          title="حذف گزاره"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <Input
                      value={stmt.text}
                      onChange={(e) => handleStatementTextChange(stmt.id, e.target.value)}
                      placeholder={`متن گزاره ${(sIdx + 1).toLocaleString("fa-IR")} را بنویسید...`}
                      className="text-xs sm:text-sm"
                    />

                    <div className="flex items-center gap-4 pt-1">
                      <span className="text-xs text-[var(--color-text-muted)] font-medium">
                        پاسخ صحیح:
                      </span>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-[var(--color-text)]">
                        <input
                          type="radio"
                          name={`stmt-answer-${stmt.id}`}
                          checked={stmt.correctAnswer === true}
                          onChange={() => handleStatementAnswerChange(stmt.id, true)}
                          className="w-3.5 h-3.5 text-[#008080] focus:ring-[#008080]"
                        />
                        <span className="text-emerald-700 dark:text-emerald-400">صحیح</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-[var(--color-text)]">
                        <input
                          type="radio"
                          name={`stmt-answer-${stmt.id}`}
                          checked={stmt.correctAnswer === false}
                          onChange={() => handleStatementAnswerChange(stmt.id, false)}
                          className="w-3.5 h-3.5 text-[#008080] focus:ring-[#008080]"
                        />
                        <span className="text-rose-700 dark:text-rose-400">غلط</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : questionType === "single_choice" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-semibold text-[var(--color-text)]">
                  گزینه‌ها و انتخاب کلید صحیح *
                </label>

                <div className="flex items-center gap-1.5 bg-[var(--color-surface-warm)]/80 p-1 rounded-xl border border-[var(--color-border)]">
                  <span className="text-[11px] font-medium text-[var(--color-text-muted)] px-1.5">
                    تعداد گزینه‌ها:
                  </span>
                  {([4, 5, 6] as const).map((cnt) => {
                    const isSelected = options.length === cnt;
                    return (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => handleSetOptionCount(cnt)}
                        className={`px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#008080] text-white shadow-xs"
                            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                        }`}
                      >
                        {toPersianDigits(cnt)} گزینه
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                {options.map((opt, optIdx) => {
                  const isCorrect = opt.id === correctOptionId;
                  return (
                    <div key={opt.id} className="flex items-center gap-2">
                      <label
                        className="flex items-center gap-1.5 cursor-pointer shrink-0"
                        title="انتخاب به عنوان پاسخ صحیح"
                      >
                        <input
                          type="radio"
                          name={`correct-opt-${question.id}`}
                          checked={isCorrect}
                          onChange={() => setCorrectOptionId(opt.id)}
                          className="w-4 h-4 text-[#008080] focus:ring-[#008080]"
                        />
                        <span className="text-xs font-bold text-[var(--color-text)]">
                          گزینه {(optIdx + 1).toLocaleString("fa-IR")}
                        </span>
                      </label>

                      <div className="flex-1">
                        <Input
                          value={opt.text}
                          onChange={(e) => handleOptionTextChange(opt.id, e.target.value)}
                          placeholder={`متن گزینه ${(optIdx + 1).toLocaleString("fa-IR")}...`}
                          className={isCorrect ? "border-emerald-500/60 focus:border-emerald-500" : ""}
                        />
                      </div>
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
              min={0.01}
              step="0.01"
              value={points}
              onChange={(e) => setPoints(parseFloat(e.target.value) || 1)}
              required
            />

            <Input
              label="توضیح تشریحی یا راهنمای تصحیح (اختیاری)"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder={
                questionType === "descriptive"
                  ? "نکات کلیدی برای نمره‌دهی..."
                  : "نکته آموزشی یا دلیل درستی گزینه..."
              }
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
            >
              انصراف
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={isSaving}
              disabled={isSaving}
            >
              ذخیره سوال
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
