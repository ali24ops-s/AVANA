/**
 * «توضیح ساده» (Explain Simply) Dialog.
 *
 * Sends a one-shot explanation request to /v1/ai/ask to simplify technical/biomedical text
 * into plain, intuitive Persian without losing scientific accuracy.
 */

import React, { useState, useEffect } from "react";
import { Lightbulb, RotateCcw, AlertCircle, Quote } from "lucide-react";
import { Dialog, DialogHeader, DialogContent, DialogFooter, Button } from "@avana/ui";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer.js";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createAiAssistantApi } from "../../lib/api/ai.js";
import type { TextSelectionData } from "../../hooks/useTextSelection.js";

export interface ExplainSimplyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectionData: TextSelectionData | null;
  lessonId?: string;
  courseId?: string;
}

export function ExplainSimplyDialog({
  isOpen,
  onClose,
  selectionData,
  lessonId,
  courseId,
}: ExplainSimplyDialogProps) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExplanation = async (text: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
      const aiApi = createAiAssistantApi(apiClient);

      const prompt = `لطفاً این بخش از متن درس را به زبان فارسی ساده، روان، قابل‌فهم و شهودی برای دانشجو توضیح بده، بدون اینکه بار علمی یا مفهوم اصلی آن تغییر کند:\n\n«${text}»`;

      const response = await aiApi.ask({
        message: prompt,
        context: {
          type: "lesson",
          lessonId,
          courseId,
        },
      });

      setExplanation(response.answer);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "خطا در دریافت توضیح از هوش مصنوعی. لطفاً دوباره تلاش کنید.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && selectionData?.selectedText) {
      setExplanation(null);
      setError(null);
      void fetchExplanation(selectionData.selectedText);
    }
  }, [isOpen, selectionData?.selectedText, lessonId]);

  if (!isOpen || !selectionData) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      ariaLabel="توضیح ساده متن انتخاب‌شده"
    >
      <DialogHeader onClose={onClose}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
            <Lightbulb className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--color-text)]">توضیح ساده و مفهومی</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              تبدیل متن تخصصی به زبانی روان و قابل‌درک
            </p>
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="p-5 sm:p-6 space-y-4 max-h-[60vh] overflow-y-auto">
        {/* Context Quote */}
        <div className="p-3.5 rounded-card bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
            <Quote className="w-3.5 h-3.5" />
            <span>متن انتخاب‌شده:</span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--color-text)] leading-relaxed bg-[var(--color-surface)] p-2.5 rounded-lg border border-[var(--color-border)]">
            {selectionData.selectedText}
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-[var(--color-text-muted)]">
            <div className="w-8 h-8 border-3 border-[var(--color-border)] border-t-amber-500 rounded-full animate-spin" />
            <span className="text-xs font-semibold">در حال نگارش توضیح ساده با آوانا...</span>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="p-4 rounded-card bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchExplanation(selectionData.selectedText)}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              تلاش مجدد
            </Button>
          </div>
        )}

        {/* Explanation Result */}
        {explanation && !isLoading && (
          <div className="p-4 sm:p-5 rounded-card bg-[var(--color-surface)] border border-[var(--color-border)] space-y-2">
            <h4 className="text-xs font-bold text-teal-700 dark:text-teal-300">
              توضیح آوانا:
            </h4>
            <div className="prose prose-sm max-w-none text-[var(--color-text)] leading-relaxed">
              <MarkdownRenderer content={explanation} />
            </div>
          </div>
        )}
      </DialogContent>

      <DialogFooter className="p-4 sm:p-5 flex justify-end">
        <Button variant="tertiary" size="sm" onClick={onClose}>
          بازگشت به مطالعه
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
