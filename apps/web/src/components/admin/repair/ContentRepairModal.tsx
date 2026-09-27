import { useState, useEffect } from "react";
import {
  X,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import {
  type RepairPreviewResult,
  type RepairCandidate,
  toPersianDigits,
} from "@avana/domain";
import { applyContentRepair } from "../../../lib/api/admin.js";

export interface ContentRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewData: RepairPreviewResult | null;
  lessonId?: string;
  generatedContentId?: string;
  organizationId?: string;
  onApplySuccess: (repairedContent: string) => void;
}

export function ContentRepairModal({
  isOpen,
  onClose,
  previewData,
  lessonId,
  generatedContentId,
  organizationId,
  onApplySuccess,
}: ContentRepairModalProps) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBlockIndices, setSelectedBlockIndices] = useState<number[]>([]);

  useEffect(() => {
    if (previewData?.candidates) {
      setSelectedBlockIndices(previewData.candidates.map((c) => c.blockIndex));
      setError(null);
    }
  }, [previewData]);

  if (!isOpen || !previewData) {
    return null;
  }

  const handleToggleBlock = (idx: number) => {
    setSelectedBlockIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
    );
  };

  const handleApply = async () => {
    if (!previewData) return;
    setApplying(true);
    setError(null);

    try {
      const res = await applyContentRepair({
        content: previewData.originalContent,
        originalHash: previewData.originalHash,
        lessonId,
        generatedContentId,
        organizationId,
        appliedBlockIndices: selectedBlockIndices,
      });

      if (res.success) {
        onApplySuccess(res.repairedContent);
        onClose();
      } else {
        setError(res.validation?.errors?.join(" | ") || "خطا در اعمال اصلاح محتوا");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در برقراری ارتباط با سرور");
    } finally {
      setApplying(false);
    }
  };

  const formatConfidence = (conf: number) => {
    return `${toPersianDigits(Math.round(conf * 100))}٪`;
  };

  const getRuleLabel = (ruleId: string) => {
    switch (ruleId) {
      case "json-leakage":
        return "نشت ساختار JSON";
      case "latex-command-corruption":
        return "خرابی دستور فرمول / شیمی";
      case "latex-delimiter-corruption":
        return "نقص نشانه‌گذاری ریاضی (LaTeX)";
      case "duplicated-fragment":
        return "تکرار ناخواسته سطر یا عبارت";
      case "trailing-metadata-leakage":
        return "متادیتای ساختاری بجامانده";
      case "broken-whitespace":
        return "شکستگی نامناسب سطرها";
      case "unicode-formatting-corruption":
        return "نویسه‌های کنترلی نامعتبر";
      default:
        return "اصلاح ساختاری محتوا";
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] flex items-center justify-center">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text)]">
                اصلاح هوشمند و ساختاری محتوا
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                شناسایی و بازسازی قطعی خطاهای موضعی متن آموزشی بدون هوش مصنوعی
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 rounded-xl text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {/* Status summary banner */}
          <div className="flex items-center justify-between p-4 bg-[var(--color-surface-warm)] rounded-xl border border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--color-primary-default)]" />
              <span className="text-xs font-bold text-[var(--color-text)]">
                تعداد موارد شناسایی‌شده: {toPersianDigits(previewData.candidates.length)} بخش
              </span>
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              بلوک‌های تحت تأثیر: {toPersianDigits(previewData.repairedBlockCount)} از {toPersianDigits(previewData.totalBlocks)}
            </div>
          </div>

          {/* Candidates list */}
          <div className="space-y-4">
            {previewData.candidates.map((candidate: RepairCandidate, idx: number) => {
              const isSelected = selectedBlockIndices.includes(candidate.blockIndex);
              return (
                <div
                  key={idx}
                  className={`border rounded-xl transition-all p-4 space-y-3 ${
                    isSelected
                      ? "border-[var(--color-primary-default)]/40 bg-[var(--color-surface)] shadow-xs"
                      : "border-[var(--color-border)] bg-[var(--color-surface-warm)]/30 opacity-70"
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleBlock(candidate.blockIndex)}
                        className="w-4 h-4 rounded text-[var(--color-primary-default)] cursor-pointer"
                        id={`repair-check-${idx}`}
                      />
                      <label
                        htmlFor={`repair-check-${idx}`}
                        className="text-xs font-bold text-[var(--color-text)] cursor-pointer"
                      >
                        {getRuleLabel(candidate.ruleId)} (بخش {toPersianDigits(candidate.blockIndex + 1)})
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          candidate.confidenceLevel === "HIGH"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        ضریب اطمینان: {formatConfidence(candidate.confidence)}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                    {candidate.reason}
                  </p>

                  {/* Before / After Diff comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    <div className="p-3 bg-rose-500/5 rounded-lg border border-rose-500/15 space-y-1">
                      <span className="text-[10px] font-bold text-rose-600 block">
                        قبل از اصلاح:
                      </span>
                      <pre className="text-xs font-mono text-[var(--color-text)] whitespace-pre-wrap break-all leading-relaxed max-h-36 overflow-y-auto">
                        {candidate.before}
                      </pre>
                    </div>

                    <div className="p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/15 space-y-1">
                      <span className="text-[10px] font-bold text-emerald-600 block">
                        بعد از اصلاح:
                      </span>
                      <pre className="text-xs font-mono text-[var(--color-text)] whitespace-pre-wrap break-all leading-relaxed max-h-36 overflow-y-auto">
                        {candidate.after}
                      </pre>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]/40">
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="px-4 py-2 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-xl transition-colors cursor-pointer"
          >
            انصراف
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={applying || selectedBlockIndices.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-[var(--color-primary-contrast)] rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            {applying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال اعمال اصلاح...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>اعمال اصلاحات ({toPersianDigits(selectedBlockIndices.length)} بخش)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
