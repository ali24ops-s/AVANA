import React, { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { Dialog, Button, Input, Alert } from "../../../components/ui/index.js";
import type {
  PollQuestion,
  PollQuestionType,
  CreatePollQuestionInput,
  UpdatePollQuestionInput,
} from "../../../lib/api/polls-api.js";
import { toPersianDigits } from "@avana/domain";

export interface PollQuestionEditorProps {
  isOpen: boolean;
  onClose: () => void;
  questionToEdit?: PollQuestion | null;
  onSave: (data: CreatePollQuestionInput | UpdatePollQuestionInput) => Promise<void>;
  isSubmitting?: boolean;
}

export function PollQuestionEditor({
  isOpen,
  onClose,
  questionToEdit,
  onSave,
  isSubmitting = false,
}: PollQuestionEditorProps) {
  const isEditing = Boolean(questionToEdit);

  const [questionText, setQuestionText] = useState("");
  const [description, setDescription] = useState("");
  const [questionType, setQuestionType] = useState<PollQuestionType>("single_choice");
  const [isRequired, setIsRequired] = useState(false);
  const [minChoices, setMinChoices] = useState<number | "">("");
  const [maxChoices, setMaxChoices] = useState<number | "">("");
  const [options, setOptions] = useState<Array<{ id?: string; optionText: string }>>([
    { optionText: "" },
    { optionText: "" },
  ]);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Initialize form when opened or questionToEdit changes
  useEffect(() => {
    if (questionToEdit) {
      setQuestionText(questionToEdit.questionText || "");
      setDescription(questionToEdit.description || "");
      setQuestionType(questionToEdit.questionType || "single_choice");
      setIsRequired(Boolean(questionToEdit.isRequired));
      setMinChoices(questionToEdit.minChoices ?? "");
      setMaxChoices(questionToEdit.maxChoices ?? "");
      if (questionToEdit.options && questionToEdit.options.length > 0) {
        setOptions(
          questionToEdit.options.map((opt) => ({
            id: opt.id,
            optionText: opt.optionText,
          })),
        );
      } else {
        setOptions([{ optionText: "" }, { optionText: "" }]);
      }
    } else {
      setQuestionText("");
      setDescription("");
      setQuestionType("single_choice");
      setIsRequired(false);
      setMinChoices("");
      setMaxChoices("");
      setOptions([{ optionText: "" }, { optionText: "" }]);
    }
    setValidationError(null);
  }, [questionToEdit, isOpen]);

  const handleAddOption = () => {
    setOptions((prev) => [...prev, { optionText: "" }]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) {
      setValidationError("حداقل دو گزینه برای سؤالات گزینه‌ای الزامی است.");
      return;
    }
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleOptionChange = (index: number, text: string) => {
    setOptions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], optionText: text };
      return copy;
    });
  };

  const handleMoveOption = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= options.length) return;
    setOptions((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!questionText.trim()) {
      setValidationError("متن سؤال الزامی است.");
      return;
    }

    if (questionType === "single_choice" || questionType === "multiple_choice") {
      const cleanOptions = options.map((o) => ({
        ...o,
        optionText: o.optionText.trim(),
      }));

      const emptyOptIndex = cleanOptions.findIndex((o) => !o.optionText);
      if (emptyOptIndex !== -1) {
        setValidationError(`متن گزینه ${toPersianDigits(emptyOptIndex + 1)} خالی است.`);
        return;
      }

      if (cleanOptions.length < 2) {
        setValidationError("حداقل دو گزینه معتبر الزامی است.");
        return;
      }

      if (questionType === "multiple_choice") {
        const min = typeof minChoices === "number" ? minChoices : undefined;
        const max = typeof maxChoices === "number" ? maxChoices : undefined;

        if (min !== undefined && min < 1) {
          setValidationError("حداقل تعداد انتخاب نمی‌تواند کمتر از ۱ باشد.");
          return;
        }
        if (max !== undefined && max > cleanOptions.length) {
          setValidationError("حداکثر انتخاب نمی‌تواند بیشتر از تعداد کل گزینه‌ها باشد.");
          return;
        }
        if (min !== undefined && max !== undefined && min > max) {
          setValidationError("حداقل تعداد انتخاب نمی‌تواند از حداکثر بیشتر باشد.");
          return;
        }
      }

      await onSave({
        questionText: questionText.trim(),
        description: description.trim() || undefined,
        questionType,
        isRequired,
        minChoices: questionType === "multiple_choice" && typeof minChoices === "number" ? minChoices : null,
        maxChoices: questionType === "multiple_choice" && typeof maxChoices === "number" ? maxChoices : null,
        options: cleanOptions.map((opt, idx) => ({
          id: opt.id,
          optionText: opt.optionText,
          sortOrder: idx + 1,
        })),
      });
    } else {
      // short_text
      await onSave({
        questionText: questionText.trim(),
        description: description.trim() || undefined,
        questionType: "short_text",
        isRequired,
        minChoices: null,
        maxChoices: null,
        options: [],
      });
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "ویرایش سؤال" : "افزودن سؤال جدید"}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
        {validationError && (
          <Alert variant="error" onClose={() => setValidationError(null)}>
            {validationError}
          </Alert>
        )}

        {/* Question Type Selection */}
        <div>
          <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
            نوع سؤال <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setQuestionType("single_choice")}
              className={`p-2.5 rounded-xl border text-xs font-medium transition-all text-center cursor-pointer ${
                questionType === "single_choice"
                  ? "bg-[#008080]/10 border-[#008080] text-[#008080] font-bold shadow-2xs"
                  : "border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)]"
              }`}
            >
              تک‌گزینه‌ای (Radio)
            </button>
            <button
              type="button"
              onClick={() => setQuestionType("multiple_choice")}
              className={`p-2.5 rounded-xl border text-xs font-medium transition-all text-center cursor-pointer ${
                questionType === "multiple_choice"
                  ? "bg-[#008080]/10 border-[#008080] text-[#008080] font-bold shadow-2xs"
                  : "border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)]"
              }`}
            >
              چندگزینه‌ای (Checkbox)
            </button>
            <button
              type="button"
              onClick={() => setQuestionType("short_text")}
              className={`p-2.5 rounded-xl border text-xs font-medium transition-all text-center cursor-pointer ${
                questionType === "short_text"
                  ? "bg-[#008080]/10 border-[#008080] text-[#008080] font-bold shadow-2xs"
                  : "border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)]"
              }`}
            >
              متن کوتاه (Text)
            </button>
          </div>
        </div>

        {/* Question Text */}
        <div>
          <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
            متن سؤال <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="مثال: نظر شما درباره سرعت و روانی دوره‌ها چیست؟"
            required
            autoFocus
          />
        </div>

        {/* Description / Subtitle */}
        <div>
          <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
            توضیحات تکمیلی یا راهنمای سؤال (اختیاری)
          </label>
          <Input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="توضیح کوتاه زیر عنوان سؤال برای راهنمایی بیشتر"
          />
        </div>

        {/* isRequired Checkbox */}
        <div className="flex items-center gap-2 pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="rounded accent-[#008080]"
            />
            <span className="text-xs text-[var(--color-text)] font-semibold">
              پاسخ به این سؤال اجباری باشد
            </span>
          </label>
        </div>

        {/* Multiple choice bounds */}
        {questionType === "multiple_choice" && (
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[var(--color-surface-warm)]/60 border border-[var(--color-border)]">
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text)] mb-1">
                حداقل انتخاب (اختیاری)
              </label>
              <Input
                type="number"
                min={1}
                max={options.length}
                value={minChoices}
                onChange={(e) => setMinChoices(e.target.value ? parseInt(e.target.value, 10) : "")}
                placeholder="بدون محدودیت"
                className="text-center font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text)] mb-1">
                حداکثر انتخاب (اختیاری)
              </label>
              <Input
                type="number"
                min={1}
                max={options.length}
                value={maxChoices}
                onChange={(e) => setMaxChoices(e.target.value ? parseInt(e.target.value, 10) : "")}
                placeholder="بدون محدودیت"
                className="text-center font-mono text-xs"
              />
            </div>
          </div>
        )}

        {/* Options Builder for Choice Questions */}
        {(questionType === "single_choice" || questionType === "multiple_choice") && (
          <div className="space-y-2.5 pt-2 border-t border-[var(--color-border)]">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-[var(--color-text)]">
                گزینه‌ها <span className="text-red-500">*</span>
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddOption}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                className="cursor-pointer text-xs h-7 px-2.5"
              >
                افزودن گزینه
              </Button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {options.map((opt, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)]"
                >
                  <span className="text-xs font-bold text-[var(--color-text-muted)] w-5 text-center shrink-0">
                    {toPersianDigits(idx + 1)}.
                  </span>

                  <input
                    type="text"
                    value={opt.optionText}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    placeholder={`متن گزینه ${toPersianDigits(idx + 1)}`}
                    className="flex-1 py-1 px-2.5 text-xs rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[#008080]"
                  />

                  {/* Reorder Up / Down */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveOption(idx, "up")}
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30 cursor-pointer"
                      title="انتقال به بالا"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === options.length - 1}
                      onClick={() => handleMoveOption(idx, "down")}
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30 cursor-pointer"
                      title="انتقال به پایین"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Delete option */}
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(idx)}
                    disabled={options.length <= 2}
                    className="p-1 text-red-500 hover:text-red-700 disabled:opacity-30 cursor-pointer shrink-0"
                    title="حذف گزینه"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-[var(--color-border)]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
          >
            انصراف
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isSubmitting}
          >
            {isSubmitting ? "در حال ذخیره..." : isEditing ? "ذخیره تغییرات سؤال" : "افزودن سؤال"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
