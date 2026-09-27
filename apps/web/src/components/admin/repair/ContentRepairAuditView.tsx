import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldAlert,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Layers,
  Sparkles,
  Info,
} from "lucide-react";
import { getContentRepairAudit } from "../../../lib/api/admin.js";
import { toPersianDigits, type RuleAuditSummary } from "@avana/domain";

export function ContentRepairAuditView() {
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);

  const {
    data: report,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin", "contentRepairAudit"],
    queryFn: () => getContentRepairAudit(),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)] space-y-3" dir="rtl">
        <RefreshCw className="w-6 h-6 animate-spin text-[var(--color-primary-default)]" />
        <span className="text-sm font-medium">در حال پایش و بررسی سلامت متون درسنامه‌ها...</span>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-600 dark:text-rose-400 flex items-center justify-between" dir="rtl">
        <span>خطا در دریافت گزارش پایش سلامت محتوا.</span>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 rounded-lg transition-colors cursor-pointer"
        >
          تلاش مجدد
        </button>
      </div>
    );
  }

  const {
    totalLessonsScanned,
    totalBlocksScanned,
    lessonsWithCorruption,
    totalCorruptionFindings,
    overallConfidence,
    ruleSummaries,
  } = report;

  const hasIssues = totalCorruptionFindings > 0;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-[var(--color-primary-default)] shrink-0" />
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text)] text-center sm:text-right">
              گزارش سلامت متون آموزشی (Content Corruption Audit)
            </h2>
            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-0.5">
              پایش قطعی و غیرمخرب (Read-only) خرابی‌های ساختاری متون درسنامه‌ها بدون تغییر در دیتابیس
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl text-xs font-bold text-[var(--color-text)] transition-colors cursor-pointer disabled:opacity-50 self-start sm:self-auto shadow-2xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          <span>بروزرسانی پایش</span>
        </button>
      </div>

      {/* Overview Status Banner */}
      <div
        className={`p-5 rounded-2xl border flex items-start gap-3.5 shadow-2xs ${
          hasIssues
            ? "bg-amber-500/10 border-amber-500/25 text-amber-900 dark:text-amber-200"
            : "bg-emerald-500/10 border-emerald-500/25 text-emerald-900 dark:text-emerald-200"
        }`}
      >
        {hasIssues ? (
          <AlertTriangle className="w-6 h-6 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        ) : (
          <CheckCircle className="w-6 h-6 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )}
        <div className="space-y-1">
          <h3 className="font-bold text-base">
            {hasIssues
              ? `${toPersianDigits(totalCorruptionFindings)} مورد خرابی ساختاری در ${toPersianDigits(lessonsWithCorruption)} درسنامه شناسایی شد.`
              : "تمام محتوای بررسی‌شده در وضعیت کاملاً سالم و بدون خرابی قرار دارد."}
          </h3>
          <p className="text-xs sm:text-sm opacity-90 leading-relaxed">
            این پایش به صورت کاملاً غیرتغییردهنده (Read-only) انجام شده و هیچ داده‌ای در پایگاه داده ویرایش یا ترمیم نشده است.
          </p>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-[var(--color-text-muted)]">
            <span className="text-xs font-bold">درسنامه‌های بررسی‌شده</span>
            <FileText className="w-4 h-4" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-[var(--color-text)] font-mono">
            {toPersianDigits(totalLessonsScanned)}
          </div>
        </div>

        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-[var(--color-text-muted)]">
            <span className="text-xs font-bold">بلوک‌های پردازش‌شده</span>
            <Layers className="w-4 h-4" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-[var(--color-text)] font-mono">
            {toPersianDigits(totalBlocksScanned)}
          </div>
        </div>

        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-[var(--color-text-muted)]">
            <span className="text-xs font-bold">درس‌های دارای خرابی</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
            {toPersianDigits(lessonsWithCorruption)}
          </div>
        </div>

        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-[var(--color-text-muted)]">
            <span className="text-xs font-bold">کل یافته‌های خرابی</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
            {toPersianDigits(totalCorruptionFindings)}
          </div>
        </div>
      </div>

      {/* Confidence Breakdown Pills */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="font-bold text-[var(--color-text)]">تفکیک سطوح اطمینان یافته‌ها:</span>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold">
            اطمینان بالا (HIGH): {toPersianDigits(overallConfidence.HIGH)}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 font-bold">
            اطمینان متوسط (MEDIUM): {toPersianDigits(overallConfidence.MEDIUM)}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-500/10 border border-slate-500/20 text-slate-700 dark:text-slate-400 font-bold">
            اطمینان پایین (LOW): {toPersianDigits(overallConfidence.LOW)}
          </span>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="font-bold text-sm sm:text-base text-[var(--color-text)]">
            پوشش قوانین ترمیم (Rule Coverage Breakdown)
          </h3>
          <span className="text-xs text-[var(--color-text-muted)]">
            مجموعاً {toPersianDigits(ruleSummaries.length)} قانون قطعی
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
              <tr>
                <th className="py-3 px-4 font-bold">قانون (Rule)</th>
                <th className="py-3 px-4 font-bold text-center">وضعیت</th>
                <th className="py-3 px-4 font-bold text-center">یافته‌ها</th>
                <th className="py-3 px-4 font-bold text-center">درس‌ها</th>
                <th className="py-3 px-4 font-bold text-center">بلوک‌ها</th>
                <th className="py-3 px-4 font-bold text-center">HIGH</th>
                <th className="py-3 px-4 font-bold text-center">MEDIUM</th>
                <th className="py-3 px-4 font-bold text-center">LOW</th>
                <th className="py-3 px-4 font-bold text-center">نمونه‌ها</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {ruleSummaries.map((rule) => {
                const isSelected = selectedRuleId === rule.ruleId;
                return (
                  <React.Fragment key={rule.ruleId}>
                    <tr
                      className={`hover:bg-[var(--color-surface-hover)] transition-colors ${
                        rule.triggered ? "bg-amber-500/[0.02]" : ""
                      }`}
                    >
                      <td className="py-3 px-4 font-medium text-[var(--color-text)]">
                        <div className="font-bold">{rule.ruleName}</div>
                        <div className="text-[11px] font-mono text-[var(--color-text-muted)]">{rule.ruleId}</div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {rule.triggered ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                            فعال (YES)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-500 border border-slate-500/20">
                            صفر (NO)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-bold font-mono text-sm">
                        {toPersianDigits(rule.triggerCount)}
                      </td>
                      <td className="py-3 px-4 text-center font-mono">{toPersianDigits(rule.affectedLessonCount)}</td>
                      <td className="py-3 px-4 text-center font-mono">{toPersianDigits(rule.affectedBlockCount)}</td>
                      <td className="py-3 px-4 text-center font-mono text-emerald-600 dark:text-emerald-400">
                        {toPersianDigits(rule.confidenceBreakdown.HIGH)}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-amber-600 dark:text-amber-400">
                        {toPersianDigits(rule.confidenceBreakdown.MEDIUM)}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-500">
                        {toPersianDigits(rule.confidenceBreakdown.LOW)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {rule.samples.length > 0 ? (
                          <button
                            onClick={() => setSelectedRuleId(isSelected ? null : rule.ruleId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--color-primary-default)]/10 hover:bg-[var(--color-primary-default)]/20 text-[var(--color-primary-default)] rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                          >
                            <span>{toPersianDigits(rule.samples.length)} نمونه</span>
                            {isSelected ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        ) : (
                          <span className="text-[var(--color-text-muted)]">-</span>
                        )}
                      </td>
                    </tr>

                    {/* Samples Expandable Row */}
                    {isSelected && rule.samples.length > 0 && (
                      <tr>
                        <td colSpan={9} className="p-4 bg-[var(--color-surface-hover)]/60">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-xs font-bold text-[var(--color-text)]">
                              <span>نمونه‌های مستند شناسایی‌شده برای {rule.ruleName}:</span>
                              <span className="text-[11px] text-[var(--color-text-muted)] font-normal">
                                (حداکثر ۵ نمونه - خلاصه‌سازی‌شده)
                              </span>
                            </div>

                            <div className="space-y-2.5">
                              {rule.samples.map((sample, idx) => (
                                <div
                                  key={idx}
                                  className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-2 text-xs"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                    <div className="font-bold text-[var(--color-text)] flex items-center gap-1.5">
                                      <FileText className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
                                      <span>{sample.lessonTitle || `درسنامه (${sample.lessonId.slice(0, 8)})`}</span>
                                      <span className="text-[var(--color-text-muted)] font-mono">
                                        • بلوک {toPersianDigits(sample.blockIndex + 1)}
                                      </span>
                                    </div>
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold">
                                      ضریب اطمینان: {toPersianDigits(Math.round(sample.confidence * 100))}٪
                                    </span>
                                  </div>

                                  <div className="text-[11px] text-[var(--color-text-muted)]">
                                    دلیل: {sample.reason}
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                                    <div className="p-2.5 bg-rose-500/5 border border-rose-500/20 rounded-lg text-rose-800 dark:text-rose-300">
                                      <div className="font-sans font-bold text-[10px] text-rose-600 mb-1">
                                        متن اصلی شناسایی‌شده:
                                      </div>
                                      <div className="whitespace-pre-wrap break-all">{sample.before}</div>
                                    </div>

                                    <div className="p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-emerald-800 dark:text-emerald-300">
                                      <div className="font-sans font-bold text-[10px] text-emerald-600 mb-1">
                                        پیشنهاد ترمیم:
                                      </div>
                                      <div className="whitespace-pre-wrap break-all">{sample.suggested}</div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
