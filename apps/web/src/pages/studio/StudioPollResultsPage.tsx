import React, { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowRight,
  Download,
  BarChart2,
  Users,
  HelpCircle,
  Calendar,
  MessageSquare,
  Search,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";
import { usePollResults, usePollDetails } from "../../hooks/useStudioPolls.js";
import { getPollsApi } from "../../lib/api/polls-api.js";
import {
  Button,
  LoadingState,
  Alert,
  EmptyState,
  Badge,
} from "../../components/ui/index.js";
import { toPersianDigits } from "@avana/domain";

export function StudioPollResultsPage() {
  const { pollId } = useParams<{ pollId: string }>();
  const { user, memberships } = useAuth();
  const pollsApi = getPollsApi();

  // RBAC checks
  const isPlatformAdmin = user?.role === "platform_admin";
  const isOrgAdmin =
    user?.role === "organization_admin" ||
    memberships?.some((m) => m.role === "organization_admin");
  const isContentWorker =
    user?.role === "content_worker" ||
    (!isPlatformAdmin && !isOrgAdmin && memberships?.some((m) => m.role === "content_worker"));

  const canExport = isPlatformAdmin || isOrgAdmin;

  const { data: poll, isLoading: isPollLoading } = usePollDetails(pollId);
  const {
    data: results,
    isLoading: isResultsLoading,
    isError,
    error,
    refetch,
  } = usePollResults(pollId);

  const [copiedLink, setCopiedLink] = useState(false);
  const [textSearchQuery, setTextSearchQuery] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleCopyLink = () => {
    if (!poll?.slug) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/polls/${poll.slug}`;
    void navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleDownloadCsv = async () => {
    if (!pollId || !canExport) return;
    try {
      setDownloading(true);
      setExportError(null);
      const csvUrl = pollsApi.getExportCsvUrl(pollId);
      // Fetch CSV with credentials to handle session cookie
      const res = await fetch(csvUrl, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("خطا در دریافت فایل خروجی CSV");
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `poll-${poll?.slug || pollId}-results.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "خطا در دانلود خروجی");
    } finally {
      setDownloading(false);
    }
  };

  if (isPollLoading || isResultsLoading) {
    return (
      <div className="py-20" dir="rtl">
        <LoadingState message="در حال محاسبه و دریافت آمار نتایج..." />
      </div>
    );
  }

  if (isError || !results) {
    return (
      <div className="space-y-4 py-8" dir="rtl">
        <Alert variant="error" title="خطا در دریافت نتایج">
          {error instanceof Error ? error.message : "امکان واکشی آمار نظرسنجی وجود ندارد."}
        </Alert>
        <Link to="/studio/polls">
          <Button variant="outline" size="sm">
            بازگشت به فهرست نظرسنجی‌ها
          </Button>
        </Link>
      </div>
    );
  }

  const hasResponses = results.totalResponses > 0;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <Link
            to="/studio/polls"
            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors border border-[var(--color-border)]"
            title="بازگشت به فهرست"
          >
            <ArrowRight className="w-4 h-4" />
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">
                نتایج و گزارش آماری: {results.pollTitle}
              </h1>

              {poll?.status === "published" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#e4f4ec] text-[#2a624b] border border-[#9ed4bb]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3d8f6e]" />
                  در حال جمع‌آوری رأی
                </span>
              )}
              {poll?.status === "closed" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                  بسته شده
                </span>
              )}
            </div>

            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              تحلیل تفکیکی پاسخ‌ها، درصدهای آماری و خروجی اکسپورت شرکت‌کنندگان
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] transition-colors cursor-pointer"
            title="کپی لینک نظرسنجی"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-[#3d8f6e]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? "کپی شد" : "کپی لینک"}</span>
          </button>

          {canExport ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleDownloadCsv}
              disabled={downloading || !hasResponses}
              leftIcon={<Download className="w-4 h-4" />}
              className="cursor-pointer"
            >
              {downloading ? "در حال دریافت..." : "خروجی CSV"}
            </Button>
          ) : (
            <span
              className="text-[11px] text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-2.5 py-1.5 rounded-xl border border-[var(--color-border)]"
              title="دسترسی دانلود فایل CSV مختص مدیران است"
            >
              خروجی CSV (نیاز به دسترسی مدیر)
            </span>
          )}
        </div>
      </div>

      {exportError && (
        <Alert variant="error" onClose={() => setExportError(null)}>
          {exportError}
        </Alert>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Responses */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              تعداد کل پاسخ‌ها (مشارکت)
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#008080]">
              {toPersianDigits(results.totalResponses)}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#e0f2f2] text-[#008080] flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Questions Count */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              تعداد سؤالات تعریف‌شده
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text)]">
              {toPersianDigits(results.questions.length)}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] flex items-center justify-center">
            <HelpCircle className="w-6 h-6" />
          </div>
        </div>

        {/* Link / Status */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              وضعیت نظرسنجی
            </span>
            <div className="text-sm font-bold text-[var(--color-text)]">
              {poll?.status === "published" ? "فعال و در دسترس" : poll?.status === "draft" ? "پیش‌نویس" : "بسته شده"}
            </div>
          </div>
          <Link
            to={`/studio/polls/${pollId}/edit`}
            className="text-xs font-bold text-[#008080] hover:underline"
          >
            ویرایش مشخصات
          </Link>
        </div>
      </div>

      {/* Questions Breakdown */}
      {!hasResponses ? (
        <EmptyState
          title="هنوز پاسخی ثبت نشده است"
          description="به محض اینکه شرکت‌کنندگان لینک نظرسنجی را باز کرده و پاسخ‌های خود را ارسال کنند، نمودارهای درصدی و پاسخ‌های متنی در این صفحه نمایش داده خواهند شد."
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                leftIcon={<Copy className="w-4 h-4" />}
              >
                کپی لینک نظرسنجی
              </Button>
              {poll?.slug && (
                <a href={`/polls/${poll.slug}`} target="_blank" rel="noreferrer">
                  <Button variant="primary" size="sm" rightIcon={<ExternalLink className="w-3.5 h-3.5" />}>
                    مشاهده فرم
                  </Button>
                </a>
              )}
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          <h2 className="text-sm font-bold text-[var(--color-text)]">
            تحلیل تفکیکی سؤالات
          </h2>

          <div className="space-y-5">
            {results.questions.map((question, qIdx) => {
              const isShortText = question.questionType === "short_text";
              const isSingle = question.questionType === "single_choice";
              const isMultiple = question.questionType === "multiple_choice";

              return (
                <div
                  key={question.questionId || qIdx}
                  className="p-5 sm:p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-4"
                >
                  {/* Question Header */}
                  <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary-dark)] text-xs font-bold flex items-center justify-center shrink-0">
                          {toPersianDigits(qIdx + 1)}
                        </span>
                        <h3 className="text-sm sm:text-base font-bold text-[var(--color-text)]">
                          {question.questionText}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-2.5 py-0.5 rounded-lg border border-[var(--color-border)]">
                        {isSingle ? "تک‌گزینه‌ای" : isMultiple ? "چندگزینه‌ای" : "متن کوتاه"}
                      </span>
                      <span className="text-[11px] font-bold text-[var(--color-text-secondary)]">
                        {toPersianDigits(question.totalAnswers)} پاسخ
                      </span>
                    </div>
                  </div>

                  {/* Choice Question: Option Percentages */}
                  {!isShortText && (
                    <div className="space-y-3 pt-1">
                      {(question.options || []).map((opt) => {
                        const pct = Math.round(opt.percentage || 0);
                        return (
                          <div key={opt.optionId} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-[var(--color-text)]">
                                {opt.optionText}
                              </span>
                              <div className="flex items-center gap-2 font-mono text-[11px]">
                                <span className="text-[var(--color-text-muted)]">
                                  ({toPersianDigits(opt.voteCount)} رأی)
                                </span>
                                <span className="font-bold text-[#008080]">
                                  {toPersianDigits(pct)}٪
                                </span>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full h-2.5 rounded-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#008080] transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Short Text Responses List */}
                  {isShortText && (
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--color-text-muted)]">
                          پاسخ‌های ثبت‌شده توسط شرکت‌کنندگان
                        </span>
                        {question.textAnswers && question.textAnswers.length > 5 && (
                          <div className="relative w-48">
                            <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                            <input
                              type="text"
                              value={textSearchQuery}
                              onChange={(e) => setTextSearchQuery(e.target.value)}
                              placeholder="جستجو در پاسخ‌ها..."
                              className="w-full pr-8 pl-2 py-1 text-xs rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] focus:outline-none focus:border-[#008080]"
                            />
                          </div>
                        )}
                      </div>

                      {(!question.textAnswers || question.textAnswers.length === 0) ? (
                        <p className="text-xs text-[var(--color-text-muted)] italic py-2">
                          هیچ پاسخ متنی برای این سؤال ثبت نشده است.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {question.textAnswers
                            .filter((ans) =>
                              !textSearchQuery ||
                              ans.toLowerCase().includes(textSearchQuery.toLowerCase()),
                            )
                            .map((ans, aIdx) => (
                              <div
                                key={aIdx}
                                className="p-3 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] text-xs text-[var(--color-text)] leading-relaxed flex items-start gap-2.5"
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-[#008080] shrink-0 mt-0.5" />
                                <span className="flex-1 whitespace-pre-wrap">{ans}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
