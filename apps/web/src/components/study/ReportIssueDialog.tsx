/**
 * «گزارش مشکل» (Report Issue) Dialog.
 *
 * Allows student to report scientific errors, typos, or rendering problems on lesson text selections.
 */

import React, { useState, useEffect } from "react";
import { Flag, CheckCircle2, AlertCircle, Quote } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Textarea,
} from "@avana/ui";
import type { TextSelectionData } from "../../hooks/useTextSelection.js";
import type { ContentReportCategory } from "@avana/contracts";

export interface ReportIssueDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectionData: TextSelectionData | null;
  onSubmit: (data: { category: ContentReportCategory; comment?: string }) => Promise<void>;
  isSubmitting?: boolean;
}

const CATEGORIES: Array<{ id: ContentReportCategory; title: string; description: string }> = [
  {
    id: "scientific_error",
    title: "اشتباه علمی / پزشکی",
    description: "مغایرت با منابع رفرنس یا اطلاعات نادرست",
  },
  {
    id: "typo",
    title: "غلط املایی / نگارشی",
    description: "اشتباه در تایپ، نقطه‌گذاری یا واژگان",
  },
  {
    id: "rendering_issue",
    title: "مشکل در نمایش / فرمول / جدول",
    description: "عدم نمایش درست فرمول، جدول، کد یا تصاویر",
  },
  {
    id: "unclear_content",
    title: "اطلاعات ناقص یا نامفهوم",
    description: "توضیحات ناکافی، گنگ یا ابهام‌برانگیز",
  },
  {
    id: "other",
    title: "سایر موارد",
    description: "هرگونه بازخورد یا پیشنهاد اصلاحی دیگر",
  },
];

export function ReportIssueDialog({
  isOpen,
  onClose,
  selectionData,
  onSubmit,
  isSubmitting = false,
}: ReportIssueDialogProps) {
  const [category, setCategory] = useState<ContentReportCategory>("scientific_error");
  const [comment, setComment] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCategory("scientific_error");
      setComment("");
      setIsSuccess(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !selectionData) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await onSubmit({
        category,
        comment: comment.trim() || undefined,
      });
      setIsSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "خطا در ثبت گزارش. لطفاً دوباره تلاش کنید.",
      );
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      ariaLabel="گزارش مشکل در متن درس"
    >
      <DialogHeader onClose={onClose}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Flag className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--color-text)]">گزارش مشکل در متن</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              بازخورد شما به ارتقای کیفیت محتوای آموزشی کمک می‌کند
            </p>
          </div>
        </div>
      </DialogHeader>

      {isSuccess ? (
        <div className="p-8 flex flex-col items-center justify-center gap-3 text-center" dir="rtl">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h4 className="text-base font-bold text-[var(--color-text)]">گزارش شما ثبت شد.</h4>
          <p className="text-xs text-[var(--color-text-muted)]">
            با سپاس از دقت و همکاری شما، کارشناسان محتوا مورد را بررسی خواهند کرد.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <DialogContent className="p-5 sm:p-6 space-y-4 max-h-[65vh] overflow-y-auto">
            {/* Selected Text context */}
            <div className="p-3.5 rounded-card bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400">
                <Quote className="w-3.5 h-3.5" />
                <span>متن دارای مشکل:</span>
              </div>
              <p className="text-xs sm:text-sm text-[var(--color-text)] leading-relaxed bg-[var(--color-surface)] p-2.5 rounded-lg border border-[var(--color-border)] line-clamp-3">
                {selectionData.selectedText}
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Category selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text)] block">
                نوع مشکل:
              </label>
              <div className="space-y-2">
                {CATEGORIES.map((cat) => {
                  const isSelected = category === cat.id;
                  return (
                    <label
                      key={cat.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? "bg-rose-500/5 border-rose-500/40 text-[var(--color-text)] shadow-xs"
                          : "bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="reportCategory"
                        value={cat.id}
                        checked={isSelected}
                        onChange={() => setCategory(cat.id)}
                        className="mt-1 text-rose-600 focus:ring-rose-500"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold">{cat.title}</div>
                        <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                          {cat.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Additional Explanation Textarea */}
            <Textarea
              label="توضیحات تکمیلی (اختیاری):"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="در صورت تمایل توضیح بیشتری بنویسید..."
            />
          </DialogContent>

          <DialogFooter className="p-4 sm:p-5 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              انصراف
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
            >
              ارسال گزارش
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
