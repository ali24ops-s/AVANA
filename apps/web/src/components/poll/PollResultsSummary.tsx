import React from "react";
import { BarChart3, CheckCircle2 } from "lucide-react";
import type { PollResults } from "../../lib/api/polls-api.js";
import { toPersianDigits } from "@avana/domain";

export interface PollResultsSummaryProps {
  results: PollResults;
}

export function PollResultsSummary({ results }: PollResultsSummaryProps) {
  return (
    <div className="space-y-4 pt-4 border-t border-[var(--color-border)] text-start" dir="rtl">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-4 h-4 text-[#008080]" />
        <h3 className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
          نتایج آرا تا این لحظه ({toPersianDigits(results.totalResponses)} رأی ثبت‌شده)
        </h3>
      </div>

      <div className="space-y-4">
        {results.questions.map((question, qIdx) => {
          if (question.questionType === "short_text") {
            // Short text responses are strictly private to admins
            return null;
          }

          return (
            <div
              key={question.questionId || qIdx}
              className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-[var(--color-primary-light)] text-[var(--color-primary-dark)] text-xs font-bold flex items-center justify-center shrink-0">
                    {toPersianDigits(qIdx + 1)}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
                    {question.questionText}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-[var(--color-text-muted)] shrink-0">
                  {toPersianDigits(question.totalAnswers)} پاسخ
                </span>
              </div>

              <div className="space-y-2.5 pt-1">
                {(question.options || []).map((opt) => {
                  const pct = Math.round(opt.percentage || 0);

                  return (
                    <div key={opt.optionId} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--color-text-secondary)] font-medium">
                          {opt.optionText}
                        </span>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="text-[var(--color-text-muted)]">
                            ({toPersianDigits(opt.voteCount)})
                          </span>
                          <span className="font-bold text-[#008080]">
                            {toPersianDigits(pct)}٪
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-2 rounded-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#008080] transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
