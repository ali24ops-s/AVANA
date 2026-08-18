import React from "react";
import { FileText, BookOpen, Layers } from "lucide-react";
import type { SourceChunkResource } from "@avana/contracts";
import {
  calculateWordCount,
  extractTopicsFromSourceChunks,
} from "../../lib/utils/evidence-utils.js";

export interface EvidenceSummaryProps {
  sourceChunks?: SourceChunkResource[] | null;
  payload?: Record<string, unknown> | null;
  className?: string;
}

export const EvidenceSummary: React.FC<EvidenceSummaryProps> = ({
  sourceChunks,
  payload,
  className = "",
}) => {
  const wordCount = calculateWordCount(sourceChunks);
  const topics = extractTopicsFromSourceChunks(sourceChunks, payload);

  const hasChunks = Boolean(sourceChunks && sourceChunks.length > 0);

  return (
    <div
      className={`bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-6 space-y-4 shadow-sm ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#008080]" />
          <span>ارجاعات و شواهد متنی از منبع</span>
        </h3>
        <span className="text-xs font-bold text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-2.5 py-0.5 rounded-lg">
          {sourceChunks?.length ?? 0} بخش
        </span>
      </div>

      {!hasChunks ? (
        <p className="text-xs text-[var(--color-text-muted)] py-4 text-center">
          ارجاع متنی مستقیمی برای این مورد ثبت نشده است.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Word Count */}
          <div className="p-3.5 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#008080]/10 text-[#008080]">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <span className="block text-[11px] text-[var(--color-text-muted)] font-medium">
                تعداد کلمات خوانده‌شده
              </span>
              <span className="text-sm font-black text-[var(--color-text)] dir-ltr text-right inline-block">
                {wordCount.toLocaleString("fa-IR")}
              </span>
            </div>
          </div>

          {/* Extracted Topics Count */}
          <div className="p-3.5 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#008080]/10 text-[#008080]">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="block text-[11px] text-[var(--color-text-muted)] font-medium">
                مطالب استخراج‌شده
              </span>
              <span className="text-sm font-black text-[var(--color-text)]">
                {topics.length.toLocaleString("fa-IR")} موضوع
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
