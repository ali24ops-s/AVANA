import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Sparkles,
  Zap,
  HelpCircle,
  Layers,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Bookmark,
  GraduationCap,
  Lock,
} from "lucide-react";
import { Card, Button, Badge } from "@avana/ui";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createGenerationApi } from "../../lib/api/generation.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { canManageCourseContent } from "../../utils/coursePermissions.js";
import {
  type ReviewSummaryPayload,
  type ReviewSummaryComparison,
  cleanEducationalTitle,
  toPersianDigits,
} from "@avana/domain";
import { RichContent } from "../markdown/MarkdownRenderer.js";

function renderInlineLabeledItem(
  label: string,
  content: string,
  labelClassName: string,
) {
  const trimmed = content.trim();
  const cleanLabel = label.replace(":", "").trim();
  const startsWithLabel =
    trimmed.startsWith(label) ||
    trimmed.startsWith(cleanLabel) ||
    (cleanLabel === "نکته آزمونی" &&
      (trimmed.startsWith("نکته تست") || trimmed.startsWith("تست:"))) ||
    (cleanLabel === "نکته حفظی" &&
      (trimmed.startsWith("حفظی:") ||
        trimmed.startsWith("نکته:") ||
        trimmed.startsWith("کنترااندیکاسیون"))) ||
    (cleanLabel === "طبقه‌بندی" && trimmed.startsWith("دسته")) ||
    (cleanLabel === "اشتباه رایج" &&
      (trimmed.startsWith("اشتباه:") || trimmed.startsWith("سوءبرداشت:"))) ||
    (cleanLabel === "کاربرد بالینی" &&
      (trimmed.startsWith("کاربرد:") || trimmed.startsWith("اندیکاسیون:")));

  if (trimmed.includes("|") && trimmed.includes("\n")) {
    return (
      <div className="w-full my-2 overflow-x-auto">
        <RichContent content={trimmed} compactTables />
      </div>
    );
  }

  if (startsWithLabel) {
    return <RichContent inline content={trimmed} />;
  }

  return (
    <>
      <span className={`font-bold ${labelClassName}`}>{label} </span>
      <RichContent inline content={trimmed} />
    </>
  );
}

export interface ReviewSummaryViewerProps {
  organizationId: string;
  documentId: string;
  courseId?: string | null;
  documentTitle?: string;
  onNavigateToFlashcards?: () => void;
  onNavigateToQuiz?: () => void;
  onUnlock?: () => void;
}

export function ReviewSummaryViewer({
  organizationId,
  documentId,
  courseId,
  documentTitle,
  onNavigateToFlashcards,
  onNavigateToQuiz,
  onUnlock,
}: ReviewSummaryViewerProps) {
  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const genApi = createGenerationApi(apiClient);
  const { user, memberships } = useAuth();
  const canRegenerate = canManageCourseContent(memberships, user);

  // Fetch Review Summary
  const reviewSummaryQuery = useQuery({
    queryKey: ["review-summary", organizationId, documentId, courseId],
    queryFn: () => genApi.getReviewSummary(organizationId, documentId, courseId),
    enabled: Boolean(organizationId && documentId),
  });

  // Generate / Regenerate mutation
  const generateMutation = useMutation({
    mutationFn: (options?: { force?: boolean }) =>
      genApi.triggerReviewSummary(organizationId, documentId, courseId, {
        force: options?.force ?? true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["review-summary", organizationId, documentId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-content-status", organizationId, documentId],
      });
    },
  });

  const content = reviewSummaryQuery.data?.content;
  const payload = content?.payload as unknown as ReviewSummaryPayload | undefined;

  const isGenerating = generateMutation.isPending || content?.status === "regenerating";
  const isLoading = reviewSummaryQuery.isLoading;
  const isError = reviewSummaryQuery.isError || generateMutation.error;
  const errorMessage =
    (generateMutation.error as Error)?.message ||
    (reviewSummaryQuery.error as Error)?.message ||
    "خطا در دریافت یا تولید خلاصه مروری";

  // 1. Loading state
  if (isLoading) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center space-y-4 font-sans" dir="rtl">
        <div className="w-14 h-14 rounded-button bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-[var(--color-text)]">در حال بارگذاری خلاصه مروری...</h3>
          <p className="text-xs text-[var(--color-text-muted)]">لطفاً چند لحظه صبر کنید</p>
        </div>
      </Card>
    );
  }

  // 2. Generating state
  if (isGenerating) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center space-y-4 font-sans" dir="rtl">
        <div className="w-16 h-16 rounded-button bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center relative shadow-xs">
          <Sparkles className="w-8 h-8 animate-pulse text-[var(--color-primary)]" />
        </div>
        <div className="space-y-2 max-w-md">
          <h3 className="text-lg font-black text-[var(--color-text)]">در حال استخراج و ساخت خلاصه مروری فشرده</h3>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            موتور هوش مصنوعی آوانا در حال فشرده‌سازی مفاهیم کلیدی، مکانیسم‌ها، مقایسه‌ها و نکات آزمونی برای مرور ۱۰ تا ۱۵ دقیقه‌ای است...
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-4 py-2 rounded-full border border-[var(--color-border)]">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-primary)]" />
          <span>تضمین دقت علمی بدون اضافه‌گویی</span>
        </div>
      </Card>
    );
  }

  // 3. Error state
  if (isError && !payload) {
    const isForbidden =
      errorMessage.includes("403") ||
      errorMessage.toLowerCase().includes("forbidden") ||
      errorMessage.includes("خرید دوره") ||
      errorMessage.includes("اشتراک") ||
      errorMessage.includes("اعضای ویژه");

    if (isForbidden) {
      return (
        <Card className="flex flex-col items-center justify-center p-10 sm:p-14 text-center space-y-5 font-sans" dir="rtl">
          <div className="w-16 h-16 rounded-button bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2 max-w-lg">
            <div className="flex items-center justify-center gap-2">
              <Badge variant="warning" size="sm">
                مخصوص نسخه کامل دوره
              </Badge>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-[var(--color-text)]">
              خلاصه مروری این فصل قفل است
            </h3>
            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
              برای دسترسی به خلاصه مروری جامع این فصل، نکات کلیدی و نکات مهم آزمونی، دوره مربوطه را تهیه نمایید یا اشتراک آوانا پلاس را فعال کنید.
            </p>
          </div>
          {onUnlock && (
            <Button
              variant="primary"
              size="md"
              onClick={onUnlock}
              leftIcon={<Lock className="w-4 h-4" />}
            >
              <span>مشاهده تعرفه‌ها و خرید دوره</span>
            </Button>
          )}
        </Card>
      );
    }

    return (
      <Card className="flex flex-col items-center justify-center p-10 text-center space-y-4 font-sans" dir="rtl">
        <div className="w-12 h-12 rounded-button bg-[var(--color-error-soft)] dark:bg-red-950/40 text-[var(--color-error)] flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-1 max-w-md">
          <h3 className="text-base font-bold text-[var(--color-text)]">خطا در پردازش خلاصه مروری</h3>
          <p className="text-xs text-[var(--color-error)]">{errorMessage}</p>
        </div>
        <Button
          variant={canRegenerate ? "danger" : "outline"}
          size="sm"
          onClick={() => {
            if (canRegenerate) {
              generateMutation.mutate({ force: true });
            } else {
              void reviewSummaryQuery.refetch();
            }
          }}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          <span>تلاش مجدد</span>
        </Button>
      </Card>
    );
  }

  // 4. Empty state (not yet generated)
  if (!payload || !payload.sections || payload.sections.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-10 sm:p-14 text-center space-y-5 font-sans" dir="rtl">
        <div className="w-16 h-16 rounded-button bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center shadow-xs">
          <Zap className="w-8 h-8" />
        </div>
        <div className="space-y-2 max-w-lg">
          <div className="flex items-center justify-center gap-2">
            <Badge variant="primary" size="sm">
              ویژه مرور سریع قبل از آزمون (۱۰–۱۵ دقیقه)
            </Badge>
          </div>
          <h3 className="text-lg sm:text-xl font-black text-[var(--color-text)]">
            خلاصه مروری هنوز برای این فایل تولید نشده است
          </h3>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
            خلاصه مروری با بالاترین چگالی اطلاعاتی (High Information Density) طراحی شده تا در کمتر از ۱۵ دقیقه، مفاهیم کلیدی، مکانیسم‌ها، طبقه‌بندی داروها، اعداد مهم و نکات پرتکرار آزمونی را در حافظه شما فعال کند.
          </p>
        </div>

        {canRegenerate && (
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              generateMutation.mutate({ force: true });
            }}
            leftIcon={<Sparkles className="w-4 h-4" />}
          >
            <span>تولید خلاصه مروری با هوش مصنوعی</span>
          </Button>
        )}
      </Card>
    );
  }

  // 5. Completed / Render state
  const estimatedMins = payload.estimatedReadingMinutes || 12;

  // Aggregate all exam points across sections into the consolidated golden exam points section
  const allExamPoints: string[] = [];
  payload.sections.forEach((section) => {
    if (Array.isArray(section.examPoints)) {
      section.examPoints.forEach((ep) => {
        if (typeof ep === "string" && ep.trim().length > 0) {
          allExamPoints.push(ep.trim());
        }
      });
    }
  });

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      {/* ========================================================================= */}
      {/* Unified Educational Document (Single Booklet Container)                   */}
      {/* Replaces disjoint cards with a cohesive, continuous reading experience    */}
      {/* ========================================================================= */}
      <article
        data-testid="review-summary-document"
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 sm:p-10 shadow-xs space-y-8 text-[var(--color-text)] transition-all"
      >
        {/* Document Header */}
        <header className="space-y-4 pb-6 sm:pb-8 border-b border-[var(--color-border)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary" size="md" icon={<Zap className="w-3.5 h-3.5" />}>
                خلاصه مروری (Review Summary)
              </Badge>
              <Badge variant="warning" size="md" icon={<Clock className="w-3.5 h-3.5" />}>
                زمان مطالعه تقریبی: {toPersianDigits(estimatedMins)} دقیقه
              </Badge>
              <Badge variant="secondary" size="md" icon={<GraduationCap className="w-3.5 h-3.5" />}>
                مناسب برای: مرور سریع قبل از آزمون
              </Badge>
            </div>

            {canRegenerate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  generateMutation.mutate({ force: true });
                }}
                disabled={isGenerating}
                title="تولید مجدد خلاصه مروری"
                leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />}
              >
                <span>به‌روزرسانی خلاصه</span>
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-[var(--color-text)] tracking-tight leading-snug">
              {cleanEducationalTitle(payload.title, cleanEducationalTitle(documentTitle, "خلاصه جامع و مروری مبحث"))}
            </h1>
            <p className="text-xs sm:text-sm text-[var(--color-text-muted)]">
              برگه مرور یکپارچه (Review Sheet) جهت یادآوری سریع و فعال‌سازی اطلاعات کلیدی
            </p>
          </div>

          {/* Integrated 1-Minute Quick Overview (Part of the main document flow) */}
          {payload.overview && (
            <div className="p-4 sm:p-5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs sm:text-sm leading-relaxed mt-4">
              <div className="flex items-center gap-2 mb-2 text-[var(--color-primary)] font-black">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider">
                  خلاصه یک‌دقیقه‌ای (Quick Core Overview)
                </span>
              </div>
              <div className="text-[var(--color-text)] font-medium">
                <RichContent content={payload.overview} />
              </div>
            </div>
          )}
        </header>

        {/* ========================================================================= */}
        {/* Main Body: Topic Sections in a Continuous, Non-Card Flow                 */}
        {/* ========================================================================= */}
        <div className="divide-y divide-[var(--color-border,#E2E7EA)]">
          {payload.sections.map((section, sIdx) => {
            const isLastSection = sIdx === payload.sections.length - 1;
            const keyPoints = Array.isArray(section.keyPoints)
              ? section.keyPoints.filter((kp) => typeof kp === "string" && kp.trim().length > 0)
              : [];
            const mechanisms = Array.isArray(section.mechanisms)
              ? section.mechanisms.filter((m) => typeof m === "string" && m.trim().length > 0)
              : [];
            const classifications = Array.isArray(section.classifications)
              ? section.classifications.filter((c) => typeof c === "string" && c.trim().length > 0)
              : [];
            const rawComparisons = Array.isArray(section.comparisons) ? section.comparisons : [];
            const stringComparisons = rawComparisons.filter(
              (comp): comp is string => typeof comp === "string" && comp.trim().length > 0,
            );
            const structuredComparisons = rawComparisons.filter(
              (comp): comp is ReviewSummaryComparison =>
                Boolean(
                  comp &&
                    typeof comp === "object" &&
                    (comp.conceptA || comp.conceptB || comp.keyDifferences),
                ),
            );
            const memorizationPoints = Array.isArray(section.memorizationPoints)
              ? section.memorizationPoints.filter((mp) => typeof mp === "string" && mp.trim().length > 0)
              : [];

            const hasFlowItems =
              keyPoints.length > 0 ||
              mechanisms.length > 0 ||
              classifications.length > 0 ||
              stringComparisons.length > 0 ||
              memorizationPoints.length > 0;

            return (
              <section
                key={sIdx}
                className={`space-y-4 ${sIdx > 0 ? "pt-7 sm:pt-9" : "pt-0"} ${!isLastSection ? "pb-7 sm:pb-9" : "pb-2"}`}
              >
                {/* Topic Heading */}
                <div>
                  <h2 className="text-base sm:text-lg md:text-xl font-black text-[var(--color-text)] tracking-tight flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] shrink-0" />
                    <span>{section.title}</span>
                  </h2>
                </div>

                {/* Natural Continuous Reading Stream */}
                {hasFlowItems && (
                  <ul className="space-y-3 ps-1">
                    {/* 1. Key Points */}
                    {keyPoints.map((pt, pIdx) => {
                      const trimmed = pt.trim();
                      const isTable = trimmed.includes("|") && trimmed.includes("\n");
                      if (isTable) {
                        return (
                          <li key={`kp-${pIdx}`} className="list-none w-full my-2 block">
                            <div className="w-full overflow-x-auto">
                              <RichContent content={trimmed} compactTables />
                            </div>
                          </li>
                        );
                      }

                      const isMisconception =
                        trimmed.startsWith("اشتباه رایج:") ||
                        trimmed.startsWith("اشتباه رایج") ||
                        trimmed.startsWith("سوءبرداشت:");
                      const isClinical =
                        trimmed.startsWith("کاربرد بالینی:") ||
                        trimmed.startsWith("کاربرد بالینی");

                      let bulletColor = "bg-[var(--color-primary)]";
                      if (isMisconception) bulletColor = "bg-amber-500";
                      else if (isClinical) bulletColor = "bg-teal-600 dark:bg-teal-400";

                      return (
                        <li
                          key={`kp-${pIdx}`}
                          className={`flex items-start gap-2.5 text-xs sm:text-sm text-[var(--color-text)] ${
                            isMisconception
                              ? "p-3 rounded-xl bg-amber-500/10 border border-amber-500/20"
                              : ""
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${bulletColor} shrink-0 mt-2 shadow-xs`} />
                          <span className="leading-relaxed font-medium flex-1">
                            {isMisconception ? (
                              renderInlineLabeledItem(
                                "اشتباه رایج:",
                                trimmed,
                                "text-amber-800 dark:text-amber-400 font-bold",
                              )
                            ) : isClinical ? (
                              renderInlineLabeledItem(
                                "کاربرد بالینی:",
                                trimmed,
                                "text-teal-800 dark:text-teal-300 font-bold",
                              )
                            ) : (
                              <RichContent inline content={trimmed} />
                            )}
                          </span>
                        </li>
                      );
                    })}

                    {/* 2. Mechanisms */}
                    {mechanisms.map((m, mIdx) => (
                      <li
                        key={`m-${mIdx}`}
                        className="flex items-start gap-2.5 text-xs sm:text-sm text-[var(--color-text)]"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-secondary-dark)] dark:bg-[var(--color-secondary-blue)] shrink-0 mt-2" />
                        <span className="leading-relaxed font-medium flex-1">
                          {renderInlineLabeledItem(
                            "مکانیسم:",
                            m,
                            "text-[var(--color-secondary-dark)] dark:text-[var(--color-secondary-blue)] font-bold",
                          )}
                        </span>
                      </li>
                    ))}

                    {/* 3. Classifications */}
                    {classifications.map((c, cIdx) => (
                      <li
                        key={`c-${cIdx}`}
                        className="flex items-start gap-2.5 text-xs sm:text-sm text-[var(--color-text)]"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)] shrink-0 mt-2" />
                        <span className="leading-relaxed font-medium flex-1">
                          {renderInlineLabeledItem(
                            "طبقه‌بندی:",
                            c,
                            "text-[var(--color-text-muted)] font-bold",
                          )}
                        </span>
                      </li>
                    ))}

                    {/* 4. Simple String Comparisons */}
                    {stringComparisons.map((sc, scIdx) => {
                      const trimmedSc = sc.trim();
                      const isTable = trimmedSc.includes("|") && trimmedSc.includes("\n");
                      if (isTable) {
                        return (
                          <li key={`sc-${scIdx}`} className="list-none w-full my-2 block">
                            <div className="w-full overflow-x-auto">
                              <RichContent content={trimmedSc} compactTables />
                            </div>
                          </li>
                        );
                      }
                      return (
                        <li
                          key={`sc-${scIdx}`}
                          className="flex items-start gap-2.5 text-xs sm:text-sm text-[var(--color-text)]"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0 mt-2" />
                          <span className="leading-relaxed font-medium flex-1">
                            {renderInlineLabeledItem(
                              "مقایسه:",
                              sc,
                              "text-[var(--color-primary)] font-bold",
                            )}
                          </span>
                        </li>
                      );
                    })}

                    {/* 5. Memorization Points */}
                    {memorizationPoints.map((mem, memIdx) => (
                      <li
                        key={`mem-${memIdx}`}
                        className="flex items-start gap-2.5 text-xs sm:text-sm text-[var(--color-text)]"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-2" />
                        <span className="leading-relaxed font-medium flex-1">
                          {renderInlineLabeledItem(
                            "نکته حفظی:",
                            mem,
                            "text-amber-700 dark:text-amber-400 font-bold",
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Structured Concept Comparisons (conceptA vs conceptB) */}
                {structuredComparisons.length > 0 && (
                  <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {structuredComparisons.map((comp, compIdx) => (
                      <div
                        key={compIdx}
                        className="p-3.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs space-y-1.5"
                      >
                        <div className="flex items-center gap-2 font-bold text-[var(--color-text)] text-xs sm:text-sm">
                          <RichContent inline content={comp.conceptA} />
                          <span className="text-[var(--color-primary-dark)] dark:text-[var(--color-primary-light)] font-black px-1.5 py-0.5 rounded-sm bg-[var(--color-primary-soft)] text-[11px]">
                            vs
                          </span>
                          <RichContent inline content={comp.conceptB} />
                        </div>
                        <div className="text-[var(--color-text-muted)] leading-relaxed font-medium">
                          <span className="font-bold text-[var(--color-text)]">وجه تمایز: </span>
                          <RichContent inline content={comp.keyDifferences} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* ========================================================================= */}
        {/* Consolidated Golden Exam Points (نکات طلایی امتحانی)                       */}
        {/* Part of the main document flow at the end, not a separate card           */}
        {/* ========================================================================= */}
        {allExamPoints.length > 0 && (
          <section className="rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 p-5 sm:p-6 space-y-3.5 mt-8 sm:mt-10">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Zap className="w-5 h-5 shrink-0" />
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                نکات طلایی امتحانی
              </h2>
            </div>
            <ul className="space-y-2.5 text-xs sm:text-sm text-[var(--color-text)] ps-1">
              {allExamPoints.map((ex, exIdx) => (
                <li
                  key={`golden-exam-${exIdx}`}
                  className="flex items-start gap-2.5 text-xs sm:text-sm text-[var(--color-text)]"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-2" />
                  <span className="leading-relaxed font-medium flex-1">
                    {renderInlineLabeledItem(
                      "نکته آزمونی:",
                      ex,
                      "text-amber-700 dark:text-amber-400 font-bold",
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ========================================================================= */}
        {/* Concluding Final Takeaways Box                                            */}
        {/* ========================================================================= */}
        {payload.finalTakeaways && payload.finalTakeaways.length > 0 && (
          <section className="rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] p-5 sm:p-6 space-y-3.5 mt-6 sm:mt-8">
            <div className="flex items-center gap-2 text-[var(--color-primary)]">
              <Bookmark className="w-4 h-4 shrink-0" />
              <h2 className="text-sm sm:text-base font-black uppercase tracking-wider">
                جمع‌بندی نهایی و نکات کلیدی (Final Takeaways)
              </h2>
            </div>
            <ul className="space-y-2 text-xs sm:text-sm text-[var(--color-text)] ps-1">
              {payload.finalTakeaways.map((takeaway, tIdx) => (
                <li key={tIdx} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[var(--color-primary)] shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium flex-1">
                    <RichContent inline content={takeaway} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>

      {/* Bottom Study Transition Action Banner (Outside main document) */}
      <Card className="p-6 sm:p-7 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-start">
          <h3 className="text-base font-black text-[var(--color-text)] flex items-center justify-center sm:justify-start gap-2">
            <span>مرور را تمام کردی؟</span>
            <Badge variant="success" size="sm">
              آماده تثبیت
            </Badge>
          </h3>
          <p className="text-xs text-[var(--color-text-muted)]">
            برای تثبیت در حافظه بلندمدت و سنجش آمادگی، فلش‌کارت‌ها و کوئیز این مبحث را شروع کنید:
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto shrink-0">
          {onNavigateToFlashcards && (
            <Button
              variant="secondary"
              size="md"
              onClick={onNavigateToFlashcards}
              leftIcon={<Layers className="w-4 h-4" />}
              className="font-bold"
            >
              <span>شروع فلش‌کارت‌های این مبحث</span>
            </Button>
          )}

          {onNavigateToQuiz && (
            <Button
              variant="primary"
              size="md"
              onClick={onNavigateToQuiz}
              leftIcon={<HelpCircle className="w-4 h-4" />}
              className="font-bold"
            >
              <span>آزمون سریع این درس</span>
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
