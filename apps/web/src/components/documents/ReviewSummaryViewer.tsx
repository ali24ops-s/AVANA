import { useMemo, useState } from "react";
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
  Hash,
  Scale,
  BrainCircuit,
  GraduationCap,
} from "lucide-react";
import { Card, Button, Badge } from "@avana/ui";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createGenerationApi } from "../../lib/api/generation.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { canUserGenerateContent } from "../../utils/generationPermissions.js";
import { ComingSoonGenerationModal } from "../generation/ComingSoonGenerationModal.js";
import {
  type ReviewSummaryPayload,
  flattenReviewSummarySections,
  cleanEducationalTitle,
} from "@avana/domain";

export interface ReviewSummaryViewerProps {
  organizationId: string;
  documentId: string;
  courseId?: string | null;
  documentTitle?: string;
  onNavigateToFlashcards?: () => void;
  onNavigateToQuiz?: () => void;
}

export function ReviewSummaryViewer({
  organizationId,
  documentId,
  courseId,
  documentTitle,
  onNavigateToFlashcards,
  onNavigateToQuiz,
}: ReviewSummaryViewerProps) {
  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const genApi = createGenerationApi(apiClient);
  const { user, memberships } = useAuth();
  const isGenerationPermitted = canUserGenerateContent(user, memberships);
  const [isComingSoonOpen, setIsComingSoonOpen] = useState(false);

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

  const categories = useMemo(
    () => flattenReviewSummarySections(payload?.sections),
    [payload?.sections],
  );

  const isGenerating = generateMutation.isPending;
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
          variant="danger"
          size="sm"
          onClick={() => generateMutation.mutate({ force: true })}
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

        <Button
          variant="primary"
          size="md"
          onClick={() => {
            if (!isGenerationPermitted) {
              setIsComingSoonOpen(true);
              return;
            }
            generateMutation.mutate({ force: true });
          }}
          leftIcon={<Sparkles className="w-4 h-4" />}
        >
          <span>
            {isGenerationPermitted
              ? "تولید خلاصه مروری با هوش مصنوعی"
              : "تولید خلاصه مروری (به‌زودی)"}
          </span>
        </Button>
        <ComingSoonGenerationModal
          isOpen={isComingSoonOpen}
          onClose={() => setIsComingSoonOpen(false)}
        />
      </Card>
    );
  }

  // 5. Completed / Render state
  const estimatedMins = payload.estimatedReadingMinutes || 12;

  const hasKeyPoints = categories.keyPoints.length > 0;
  const hasMechanisms = categories.mechanisms.length > 0;
  const hasClassifications = categories.classifications.length > 0;
  const hasComparisons = categories.comparisons.length > 0;
  const hasMemorization = categories.memorizationPoints.length > 0;
  const hasExamPoints = categories.examPoints.length > 0;

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      {/* Top Header Card */}
      <Card className="p-6 sm:p-8 relative overflow-hidden shadow-xs">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary" size="md" icon={<Zap className="w-3.5 h-3.5" />}>
                خلاصه مروری (Review Summary)
              </Badge>
              <Badge variant="warning" size="md" icon={<Clock className="w-3.5 h-3.5" />}>
                زمان مطالعه تقریبی: {estimatedMins.toLocaleString("fa-IR")} دقیقه
              </Badge>
              <Badge variant="secondary" size="md" icon={<GraduationCap className="w-3.5 h-3.5" />}>
                مناسب برای: مرور سریع قبل از آزمون
              </Badge>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!isGenerationPermitted) {
                  setIsComingSoonOpen(true);
                  return;
                }
                generateMutation.mutate({ force: true });
              }}
              disabled={isGenerating}
              title="تولید مجدد خلاصه مروری"
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />}
            >
              <span>{isGenerationPermitted ? "به‌روزرسانی خلاصه" : "به‌روزرسانی خلاصه (به‌زودی)"}</span>
            </Button>
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-black text-[var(--color-text)] tracking-tight">
              {cleanEducationalTitle(payload.title, cleanEducationalTitle(documentTitle, "خلاصه جامع و مروری مبحث"))}
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              برگه مرور یکپارچه (Review Sheet) جهت یادآوری سریع و فعال‌سازی اطلاعات کلیدی
            </p>
          </div>
        </div>
      </Card>

      {/* 1-Minute Quick Overview Box */}
      {payload.overview && (
        <Card className="p-5 sm:p-6 bg-[var(--color-primary-soft)]/50 border-[var(--color-primary-muted)] shadow-xs">
          <div className="flex items-center gap-2 mb-2 text-[var(--color-primary)]">
            <Sparkles className="w-4 h-4" />
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider">
              خلاصه یک‌دقیقه‌ای (Quick Core Overview)
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[var(--color-text)] leading-relaxed font-medium">
            {payload.overview}
          </p>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* Category-First Review Sheet Boxes                                         */}
      {/* Each category rendered at most ONCE, omitted if empty                     */}
      {/* ========================================================================= */}
      <div className="space-y-6">
        {/* Category 1: Key Points & Core Concepts */}
        {hasKeyPoints && (
          <Card className="p-6 sm:p-7 space-y-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <h3 className="text-base sm:text-lg font-black text-[var(--color-text)] flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-button bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span>نکات کلیدی و مفاهیم اصلی</span>
              </h3>
              <Badge variant="neutral" size="sm">
                {categories.keyPoints.length.toLocaleString("fa-IR")} نکته
              </Badge>
            </div>
            <ul className="space-y-3 ps-1">
              {categories.keyPoints.map((pt, pIdx) => (
                <li key={pIdx} className="flex items-start gap-3 text-xs sm:text-sm text-[var(--color-text)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] shrink-0 mt-2 shadow-xs" />
                  <span className="leading-relaxed font-medium">{pt}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Category 2 & 3: Mechanisms & Classifications Grid */}
        {(hasMechanisms || hasClassifications) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category 2: Mechanisms */}
            {hasMechanisms && (
              <Card className="p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
                  <h3 className="text-sm sm:text-base font-black text-[var(--color-text)] flex items-center gap-2">
                    <div className="w-7 h-7 rounded-sm bg-[var(--color-secondary-soft)] dark:bg-[var(--color-secondary-dark)]/30 text-[var(--color-secondary-dark)] dark:text-[var(--color-secondary-blue)] flex items-center justify-center">
                      <BrainCircuit className="w-3.5 h-3.5" />
                    </div>
                    <span>مکانیسم‌های سلولی / مولکولی</span>
                  </h3>
                  <Badge variant="secondary" size="sm">
                    {categories.mechanisms.length.toLocaleString("fa-IR")} مکانیسم
                  </Badge>
                </div>
                <ul className="space-y-2.5 text-xs sm:text-sm text-[var(--color-text)] ps-1">
                  {categories.mechanisms.map((m, mIdx) => (
                    <li key={mIdx} className="flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-secondary-dark)] dark:bg-[var(--color-secondary-blue)] shrink-0 mt-1.5" />
                      <span className="leading-relaxed">{m}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Category 3: Classifications */}
            {hasClassifications && (
              <Card className="p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
                  <h3 className="text-sm sm:text-base font-black text-[var(--color-text)] flex items-center gap-2">
                    <div className="w-7 h-7 rounded-sm bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] flex items-center justify-center">
                      <Hash className="w-3.5 h-3.5" />
                    </div>
                    <span>دسته‌بندی و طبقه‌بندی ساختاری</span>
                  </h3>
                  <Badge variant="neutral" size="sm">
                    {categories.classifications.length.toLocaleString("fa-IR")} دسته
                  </Badge>
                </div>
                <ul className="space-y-2.5 text-xs sm:text-sm text-[var(--color-text)] ps-1">
                  {categories.classifications.map((c, cIdx) => (
                    <li key={cIdx} className="flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)] shrink-0 mt-1.5" />
                      <span className="leading-relaxed">{c}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}

        {/* Category 4: Comparisons / Key Distinctions (Single Unified Box for ALL Comparisons) */}
        {hasComparisons && (
          <Card className="p-6 sm:p-7 space-y-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <h3 className="text-base sm:text-lg font-black text-[var(--color-text)] flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-button bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center">
                  <Scale className="w-4 h-4" />
                </div>
                <span>مقایسه‌ها و تفاوت‌های کلیدی (Key Distinctions)</span>
              </h3>
              <Badge variant="primary" size="sm">
                {categories.comparisons.length.toLocaleString("fa-IR")} مورد مقایسه
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {categories.comparisons.map((comp, compIdx) => {
                if (typeof comp === "string") {
                  return (
                    <div
                      key={compIdx}
                      className="p-3.5 rounded-button bg-[var(--color-surface-warm)] text-xs text-[var(--color-text)] leading-relaxed font-medium border border-[var(--color-border)]"
                    >
                      {comp}
                    </div>
                  );
                }
                return (
                  <div
                    key={compIdx}
                    className="p-4 rounded-button bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs space-y-1.5"
                  >
                    <div className="flex items-center gap-2 font-bold text-[var(--color-text)] text-xs sm:text-sm">
                      <span>{comp.conceptA}</span>
                      <span className="text-[var(--color-primary-dark)] dark:text-[var(--color-primary-light)] font-black px-1.5 py-0.5 rounded-sm bg-[var(--color-primary-soft)] text-[11px]">
                        vs
                      </span>
                      <span>{comp.conceptB}</span>
                    </div>
                    <p className="text-[var(--color-text-muted)] leading-relaxed font-medium">
                      <span className="font-bold text-[var(--color-text)]">وجه تمایز: </span>
                      {comp.keyDifferences}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Category 5: Numbers, Dosages & Memorization Highlights */}
        {hasMemorization && (
          <Card className="p-6 sm:p-7 space-y-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <h3 className="text-base sm:text-lg font-black text-[var(--color-text)] flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-button bg-[var(--color-warning-soft)] dark:bg-amber-950/40 text-[var(--color-warning)] dark:text-amber-300 flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <span>نکات حفظی و اعداد مهم</span>
              </h3>
              <Badge variant="warning" size="sm">
                {categories.memorizationPoints.length.toLocaleString("fa-IR")} نکته حفظی
              </Badge>
            </div>

            <ul className="space-y-2.5 text-xs sm:text-sm text-[var(--color-text)] ps-1">
              {categories.memorizationPoints.map((mem, memIdx) => (
                <li key={memIdx} className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-warning)] shrink-0 mt-1.5" />
                  <span className="leading-relaxed font-semibold">{mem}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Category 6: High-Yield Exam Points */}
        {hasExamPoints && (
          <Card className="p-6 sm:p-7 space-y-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <h3 className="text-base sm:text-lg font-black text-[var(--color-text)] flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-button bg-[var(--color-error-soft)] dark:bg-red-950/40 text-[var(--color-error)] dark:text-red-300 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <span>نکات مهم و پرتکرار آزمونی</span>
              </h3>
              <Badge variant="error" size="sm">
                {categories.examPoints.length.toLocaleString("fa-IR")} نکته تست‌خیز
              </Badge>
            </div>
            <ul className="space-y-2.5 text-xs sm:text-sm text-[var(--color-text)] ps-1">
              {categories.examPoints.map((ex, exIdx) => (
                <li key={exIdx} className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-error)] shrink-0 mt-1.5" />
                  <span className="leading-relaxed font-bold">{ex}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* Final Takeaways Box */}
      {payload.finalTakeaways && payload.finalTakeaways.length > 0 && (
        <Card className="p-6 bg-[var(--color-primary-soft)]/30 border-[var(--color-primary-muted)]/50 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-[var(--color-primary)]">
            <Bookmark className="w-4 h-4" />
            <h2 className="text-sm font-black uppercase tracking-wider">
              جمع‌بندی نهایی و نکات کلیدی (Final Takeaways)
            </h2>
          </div>
          <ul className="space-y-2 text-xs sm:text-sm text-[var(--color-text)]">
            {payload.finalTakeaways.map((takeaway, tIdx) => (
              <li key={tIdx} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[var(--color-primary)] shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{takeaway}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Bottom Study Transition Action Banner */}
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

      <ComingSoonGenerationModal
        isOpen={isComingSoonOpen}
        onClose={() => setIsComingSoonOpen(false)}
      />
    </div>
  );
}
