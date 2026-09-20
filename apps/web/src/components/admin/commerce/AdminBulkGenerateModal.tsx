import React, { useState } from "react";
import {
  X,
  Sparkles,
  Copy,
  Check,
  Download,
  AlertCircle,
  Loader2,
  Ticket,
} from "lucide-react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import type { AdminPromotionRecord } from "../../../lib/api/admin.js";
import { toPersianDigits } from "@avana/domain";

interface AdminBulkGenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  promotion: AdminPromotionRecord | null;
  onGenerated?: () => void;
}

export function AdminBulkGenerateModal({
  isOpen,
  onClose,
  promotion,
  onGenerated,
}: AdminBulkGenerateModalProps) {
  const adminApi = useAdmin();

  const [count, setCount] = useState<number>(50);
  const [prefix, setPrefix] = useState<string>("");
  const [codeLength, setCodeLength] = useState<number>(8);
  const [maxUses, setMaxUses] = useState<number | "">("");

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen || !promotion) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsGenerating(true);
    setGeneratedCodes([]);
    setCopied(false);

    try {
      if (count < 1 || count > 1000) {
        throw new Error("تعداد کدهای درخواستی باید بین ۱ تا ۱۰۰۰ باشد.");
      }

      const res = await adminApi.bulkGenerateCommercePromotionCodes(promotion.id, {
        count,
        prefix: prefix.trim() ? prefix.trim().toUpperCase() : undefined,
        codeLength: codeLength || 8,
        maxUses: maxUses === "" ? null : Number(maxUses),
      });

      setGeneratedCodes(res.codes);
      if (onGenerated) {
        onGenerated();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "خطا در تولید دسته‌ای کدهای تخفیف";
      setErrorMsg(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyAll = async () => {
    if (generatedCodes.length === 0) return;
    try {
      await navigator.clipboard.writeText(generatedCodes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleDownloadTxt = () => {
    if (generatedCodes.length === 0) return;
    const blob = new Blob([generatedCodes.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `codes-${promotion.name}-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      dir="rtl"
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] flex items-center justify-center">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--color-text)]">
                تولید انبوه کدهای تخفیف
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                برای پروموشن: {promotion.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {generatedCodes.length === 0 ? (
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                    تعداد کدها (۱ تا ۱۰۰۰) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    required
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl text-sm font-medium text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                    طول کد تصادفی
                  </label>
                  <input
                    type="number"
                    min="4"
                    max="32"
                    value={codeLength}
                    onChange={(e) => setCodeLength(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl text-sm font-medium text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                    پیشوند اختیاری (مثلاً VIP- یا NOWRUZ)
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: FESTIVAL-"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl text-sm font-medium text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] transition-colors text-left"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                    حداکثر دفعات استفاده هر کد
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="خالی = پیش‌فرض پروموشن (۱ بار)"
                    value={maxUses}
                    onChange={(e) =>
                      setMaxUses(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className="w-full px-3 py-2 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl text-sm font-medium text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] transition-colors"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="w-full py-3 px-4 bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] rounded-xl text-sm font-bold shadow-md hover:bg-[var(--color-primary-hover)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>در حال تولید کدهای تصادفی و ثبت...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>تولید {toPersianDigits(count)} کد تخفیف</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-medium flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>
                  تعداد {toPersianDigits(generatedCodes.length)} کد با موفقیت تولید و ذخیره شدند.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  کدهای تولید شده:
                </label>
                <textarea
                  readOnly
                  rows={8}
                  value={generatedCodes.join("\n")}
                  className="w-full p-3 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl font-mono text-xs text-[var(--color-text)] focus:outline-none select-all text-left"
                  dir="ltr"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleCopyAll}
                  className="flex-1 py-2.5 px-3 bg-[var(--color-surface-warm)] border border-[var(--color-border)] hover:bg-[var(--color-surface)] text-[var(--color-text)] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span>کپی شد!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>کپی همه کدها</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownloadTxt}
                  className="flex-1 py-2.5 px-3 bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>دانلود فایل متنی (TXT)</span>
                </button>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    setGeneratedCodes([]);
                  }}
                  className="w-full py-2 text-center text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  تولید کدهای بیشتر برای این پروموشن
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
