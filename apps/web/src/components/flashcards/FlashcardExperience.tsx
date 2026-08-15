import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Layers,
  Clock,
  CheckCircle2,
  RotateCcw,
  Lightbulb,
  Award,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import type { FlashcardResource, FlashcardRating } from "@avana/contracts";

export interface FlashcardExperienceProps {
  organizationId: string;
  courseId: string;
  onBack?: () => void;
}

interface ReviewResult {
  cardId: string;
  rating: FlashcardRating;
  reactionMs: number;
}

export function FlashcardExperience({
  organizationId,
  courseId,
  onBack,
}: FlashcardExperienceProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [flipTimestamp, setFlipTimestamp] = useState<number>(0);
  const [results, setResults] = useState<ReviewResult[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);

  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const studyApi = createStudyApi(apiClient);

  // Fetch due cards for spaced-repetition review
  const queueQuery = useQuery({
    queryKey: ["flashcards-queue", organizationId, courseId],
    queryFn: () => studyApi.getFlashcardReviewQueue(organizationId, courseId),
  });

  // Fetch all flashcards for overall count
  const allCardsQuery = useQuery({
    queryKey: ["flashcards", organizationId, courseId],
    queryFn: () => studyApi.listFlashcards(organizationId, courseId),
  });

  const dueCards = queueQuery.data?.due_cards ?? [];
  const currentCard = dueCards[currentIndex] as FlashcardResource | undefined;

  // Submit review rating mutation
  const reviewMutation = useMutation({
    mutationFn: async ({
      cardId,
      rating,
      reactionMs,
    }: {
      cardId: string;
      rating: FlashcardRating;
      reactionMs: number;
    }) => {
      return studyApi.submitFlashcardReview(organizationId, courseId, cardId, {
        rating,
        reaction_ms: reactionMs,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["flashcards", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["flashcards-queue", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["study-analytics", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["study-recommendations", organizationId, courseId],
      });
    },
  });

  const [selectedRating, setSelectedRating] = useState<FlashcardRating | null>(null);

  const handleFlip = useCallback(() => {
    if (isFlipped) return;
    setIsFlipped(true);
    setFlipTimestamp(Date.now());
  }, [isFlipped]);

  const handleRating = useCallback(
    (rating: FlashcardRating) => {
      if (!currentCard || !isFlipped || reviewMutation.isPending) return;

      setSelectedRating(rating);
      const reactionMs = flipTimestamp > 0 ? Date.now() - flipTimestamp : 0;

      reviewMutation.mutate(
        {
          cardId: currentCard.id,
          rating,
          reactionMs,
        },
        {
          onSuccess: () => {
            const newResult: ReviewResult = {
              cardId: currentCard.id,
              rating,
              reactionMs,
            };
            setResults((prev) => [...prev, newResult]);
            setSelectedRating(null);
            if (currentIndex + 1 < dueCards.length) {
              setIsFlipped(false);
              setFlipTimestamp(0);
              setCurrentIndex((prev) => prev + 1);
            } else {
              setIsCompleted(true);
              void queryClient.invalidateQueries({
                queryKey: ["flashcards-queue", organizationId, courseId],
              });
            }
          },
          onError: () => {
            setSelectedRating(null);
          },
        }
      );
    },
    [
      currentCard,
      isFlipped,
      flipTimestamp,
      currentIndex,
      dueCards.length,
      organizationId,
      courseId,
      queryClient,
      reviewMutation,
    ]
  );

  // Keyboard shortcuts (Space: Flip, 1: Again, 2: Hard, 3: Good, 4: Easy)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isCompleted || !currentCard) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleFlip();
      } else if (isFlipped) {
        if (e.key === "1") handleRating("again");
        else if (e.key === "2") handleRating("hard");
        else if (e.key === "3") handleRating("good");
        else if (e.key === "4") handleRating("easy");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFlipped, isCompleted, currentCard, handleFlip, handleRating]);

  // Loading state
  if (queueQuery.isLoading || allCardsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
      </div>
    );
  }

  // Error state
  if (queueQuery.isError) {
    return (
      <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
        <h3 className="text-base font-bold text-[var(--color-text)]">
          خطا در بارگذاری فلش‌کارت‌ها
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          {queueQuery.error?.message || "خطایی در دریافت کارت‌ها رخ داد."}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              void queueQuery.refetch();
              void allCardsQuery.refetch();
            }}
            className="px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold transition-colors"
          >
            تلاش مجدد
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 bg-[var(--color-surface-warm)] hover:bg-[var(--color-border)] text-[var(--color-text)] border border-[var(--color-border)] rounded-xl text-xs font-bold transition-colors"
            >
              بازگشت
            </button>
          )}
        </div>
      </div>
    );
  }

  // Empty queue state
  if (dueCards.length === 0 && !isCompleted) {
    const totalCount = allCardsQuery.data?.flashcards?.length ?? 0;
    return (
      <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center space-y-4 max-w-lg mx-auto shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-[var(--color-text)]">
            مرور کارت‌ها به پایان رسید!
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            در حال حاضر کارتی برای مرور زمان‌بندی نشده است.
          </p>
        </div>
        <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
          تعداد کل فلش‌کارت‌های این دوره: <span className="font-bold text-[var(--color-text)]">{totalCount}</span>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              void queueQuery.refetch();
              void allCardsQuery.refetch();
            }}
            className="px-4 py-2.5 bg-[var(--color-surface-warm)] hover:bg-[var(--color-border)] text-[var(--color-text)] border border-[var(--color-border)] rounded-xl text-xs font-bold transition-colors"
          >
            تازه‌سازی صف مرور
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2.5 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold transition-colors"
            >
              بازگشت به دوره
            </button>
          )}
        </div>
      </div>
    );
  }

  // Session completed summary
  if (isCompleted) {
    const againCount = results.filter((r) => r.rating === "again").length;
    const goodEasyCount = results.filter((r) => r.rating === "good" || r.rating === "easy").length;

    return (
      <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-8 text-center space-y-6 max-w-md mx-auto shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-[#008080] flex items-center justify-center mx-auto text-white shadow-md">
          <Award className="w-7 h-7" />
        </div>

        <div>
          <h3 className="text-xl font-bold text-[var(--color-text)]">
            جلسه مرور با موفقیت به پایان رسید!
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1.5 leading-relaxed">
            آفرین! با مرور فاصله‌دار به تثبیت بهتر مفاهیم در حافظه کمک کردید.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] text-xs">
          <div>
            <p className="text-[var(--color-text-muted)]">مرور شده</p>
            <p className="text-base font-bold text-[var(--color-text)] mt-0.5">
              {results.length}
            </p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)]">تسلط کامل</p>
            <p className="text-base font-bold text-green-600 dark:text-green-400 mt-0.5">
              {goodEasyCount}
            </p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)]">نیازمند تکرار</p>
            <p className="text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5">
              {againCount}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setIsCompleted(false);
              setCurrentIndex(0);
              setIsFlipped(false);
              setResults([]);
              void queueQuery.refetch();
            }}
            className="px-4 py-2.5 bg-[var(--color-surface-warm)] hover:bg-[var(--color-border)] text-[var(--color-text)] rounded-xl text-xs font-bold border border-[var(--color-border)] flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>بررسی کارت‌های جدید</span>
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2.5 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold"
            >
              بازگشت به دوره
            </button>
          )}
        </div>
      </div>
    );
  }

  // Active review session
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Session top bar */}
      <div className="flex items-center justify-between">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>خروج از مرور</span>
          </button>
        )}

        {/* Progress counter */}
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] font-semibold">
          <Layers className="w-4 h-4 text-[#008080]" />
          <span>
            کارت {currentIndex + 1} از {dueCards.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-[var(--color-surface-warm)] rounded-full overflow-hidden border border-[var(--color-border)]">
        <div
          className="h-full bg-[#008080] transition-all duration-300 rounded-full"
          style={{
            width: `${((currentIndex + 1) / dueCards.length) * 100}%`,
          }}
        />
      </div>

      {reviewMutation.isError && (
        <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/40 text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 justify-center">
          <AlertCircle className="w-4 h-4" />
          <span>خطا در ثبت بازخورد. لطفاً دوباره تلاش کنید.</span>
        </div>
      )}

      {/* Flashcard 3D container */}
      {currentCard && (
        <div
          role="button"
          tabIndex={0}
          aria-label={
            isFlipped
              ? "پاسخ فلش‌کارت نمایش داده شد"
              : "سوال فلش‌کارت. برای چرخش کلیک کنید یا کلید Space را فشار دهید"
          }
          onClick={handleFlip}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleFlip();
            }
          }}
          className="min-h-[320px] bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-8 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between relative group focus:outline-none focus:ring-2 focus:ring-[#008080]"
        >
          {/* Card header */}
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span className="font-bold px-2.5 py-1 rounded-lg bg-[#008080]/10 text-[#008080]">
              {currentCard.card_type === "concept" ? "مفهوم" : currentCard.card_type === "clinical" ? "بالینی" : "فلش‌کارت"}
            </span>
            <span className="text-[11px] flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              فاصله: {currentCard.interval_days} روز
            </span>
          </div>

          {/* Card content (Front / Back) */}
          <div className="py-6 my-auto text-center space-y-4">
            <h3 className="text-lg sm:text-xl font-extrabold text-[var(--color-text)] leading-relaxed">
              {currentCard.question}
            </h3>

            {isFlipped && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-6 border-t border-[var(--color-border)] text-right space-y-3"
              >
                <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)]">
                  <p className="text-xs font-bold text-[#008080] uppercase tracking-wider mb-1">
                    پاسخ:
                  </p>
                  <p className="text-sm font-semibold text-[var(--color-text)] leading-relaxed">
                    {currentCard.answer}
                  </p>
                </div>

                {currentCard.explanation && (
                  <div className="p-3.5 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl border border-amber-200/70 dark:border-amber-900/40 text-xs text-[var(--color-text-muted)]">
                    <p className="font-bold text-amber-800 dark:text-amber-400 mb-1 flex items-center gap-1">
                      <Lightbulb className="w-3.5 h-3.5" />
                      <span>توضیح تکمیلی:</span>
                    </p>
                    <p className="text-[var(--color-text)] leading-relaxed">{currentCard.explanation}</p>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Flip prompt */}
          {!isFlipped && (
            <div className="text-center pt-4 text-xs text-[var(--color-text-muted)] group-hover:text-[#008080] transition-colors">
              برای مشاهده پاسخ کلیک کنید یا کلید <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-warm)] rounded border border-[var(--color-border)] text-[10px] font-mono">Space</kbd> را فشار دهید
            </div>
          )}
        </div>
      )}

      {/* Review rating buttons (Visible once flipped) */}
      {isFlipped && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-4 gap-2 pt-2"
        >
          <button
            type="button"
            onClick={() => handleRating("again")}
            disabled={reviewMutation.isPending}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-red-50 dark:bg-red-950/30 hover:bg-red-100 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 transition-colors min-h-[64px] focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            {selectedRating === "again" ? (
              <Loader2 className="w-4 h-4 animate-spin text-red-600 dark:text-red-400" />
            ) : (
              <>
                <span className="text-xs font-bold">تکرار</span>
                <span className="text-[10px] text-red-500 dark:text-red-400 mt-0.5">کلید ۱</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleRating("hard")}
            disabled={reviewMutation.isPending}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 transition-colors min-h-[64px] focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {selectedRating === "hard" ? (
              <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400" />
            ) : (
              <>
                <span className="text-xs font-bold">سخت</span>
                <span className="text-[10px] text-amber-500 dark:text-amber-400 mt-0.5">کلید ۲</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleRating("good")}
            disabled={reviewMutation.isPending}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#a7d0e6]/30 hover:bg-[#a7d0e6]/50 border border-[#a7d0e6] text-[#008080] dark:text-[#a7d0e6] transition-colors min-h-[64px] focus:outline-none focus:ring-2 focus:ring-[#008080]"
          >
            {selectedRating === "good" ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#008080]" />
            ) : (
              <>
                <span className="text-xs font-bold">خوب</span>
                <span className="text-[10px] text-[#008080] mt-0.5">کلید ۳</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleRating("easy")}
            disabled={reviewMutation.isPending}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-green-50 dark:bg-green-950/30 hover:bg-green-100 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-300 transition-colors min-h-[64px] focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {selectedRating === "easy" ? (
              <Loader2 className="w-4 h-4 animate-spin text-green-600 dark:text-green-400" />
            ) : (
              <>
                <span className="text-xs font-bold">آسان</span>
                <span className="text-[10px] text-green-500 dark:text-green-400 mt-0.5">کلید ۴</span>
              </>
            )}
          </button>
        </motion.div>
      )}
    </div>
  );
}
