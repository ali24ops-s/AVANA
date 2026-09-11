import { useState, useEffect, useCallback } from "react";
import {
  ArrowRight,
  RotateCcw,
  Award,
  Loader2,
  AlertCircle,
  Sparkles,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  Pointer,
  Lightbulb,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { Card, Button, Badge, LoadingState } from "@avana/ui";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import { useStudySessionTracker } from "../../hooks/useStudySessionTracker.js";
import type { FlashcardResource, FlashcardRating } from "@avana/contracts";
import { nextReviewInterval, toPersianDigits } from "@avana/domain";
import { RichContent } from "../markdown/MarkdownRenderer.js";

export interface FlashcardExperienceProps {
  organizationId: string;
  sessionId?: string;
  courseId?: string;
  courseIds?: string[];
  documentIds?: string[];
  mode?: "normal" | "exam" | "custom";
  customMode?: "weak" | "forgotten" | "review_ahead" | "new";
  aheadDays?: number;
  limit?: number;
  isPreview?: boolean;
  onUnlock?: () => void;
  onBack?: () => void;
}

interface ReviewResult {
  cardId: string;
  rating: FlashcardRating;
  reactionMs: number;
}

function getIntervalHint(
  rating: FlashcardRating,
  card?: { interval_days: number; ease_factor?: number | string },
): string {
  if (!card) return "";
  const prevInterval = card.interval_days ?? 0;
  const prevEase = card.ease_factor ? Number(card.ease_factor) : 2.5;

  const nextState = nextReviewInterval(rating, {
    intervalDays: prevInterval,
    easeFactor: prevEase,
  });

  if (rating === "again" || nextState.intervalDays === 0) {
    return "< ۱۰ دقیقه";
  }
  if (nextState.intervalDays === 1) {
    return "۱ روز";
  }
  return `${nextState.intervalDays} روز`;
}

export function FlashcardExperience({
  organizationId,
  sessionId,
  courseId,
  courseIds = [],
  documentIds = [],
  mode = "normal",
  customMode = "weak",
  aheadDays = 3,
  limit,
  isPreview = false,
  onUnlock,
  onBack,
}: FlashcardExperienceProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasInitializedSession, setHasInitializedSession] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [flipTimestamp, setFlipTimestamp] = useState<number>(0);
  const [sessionStartTime] = useState<number>(Date.now());
  const [results, setResults] = useState<ReviewResult[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRating, setSelectedRating] = useState<FlashcardRating | null>(null);
  const [cardPriorities, setCardPriorities] = useState<Record<string, "high" | "medium" | "low">>({});

  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const studyApi = createStudyApi(apiClient);

  // If courseId is provided but not in courseIds, add it (for backward compatibility)
  const effectiveCourseIds = courseId && courseIds.length === 0 ? [courseId] : courseIds;

  // Session query when resuming a persistent study session
  const sessionQuery = useQuery({
    queryKey: ["flashcard-study-session", organizationId, sessionId],
    queryFn: () => studyApi.getFlashcardStudySession(organizationId, sessionId!),
    enabled: Boolean(organizationId && sessionId),
    staleTime: 0,
  });

  // Fetch due cards for spaced-repetition / exam / custom review when not in a persistent session
  const queueQuery = useQuery({
    queryKey: [
      "flashcards-queue",
      organizationId,
      effectiveCourseIds,
      documentIds,
      mode,
      customMode,
      aheadDays,
      limit,
    ],
    queryFn: () => {
      if (mode === "exam") {
        return studyApi.getExamQueue(
          organizationId,
          effectiveCourseIds.length > 0 ? effectiveCourseIds : undefined,
          limit,
          documentIds.length > 0 ? documentIds : undefined,
        );
      }
      if (mode === "custom") {
        return studyApi.getCustomQueue(
          organizationId,
          customMode,
          effectiveCourseIds.length > 0 ? effectiveCourseIds : undefined,
          limit,
          aheadDays,
          documentIds.length > 0 ? documentIds : undefined,
        );
      }
      return studyApi.getMultiReviewQueue(
        organizationId,
        effectiveCourseIds.length > 0 ? effectiveCourseIds : undefined,
        documentIds.length > 0 ? documentIds : undefined,
      );
    },
    enabled: Boolean(organizationId && !sessionId),
  });

  // Fetch summary to get total counts
  const summaryQuery = useQuery({
    queryKey: ["flashcard-summary", organizationId],
    queryFn: () => studyApi.getFlashcardSummary(organizationId),
    enabled: !!organizationId,
  });

  const sessionCards = sessionQuery.data?.cards as FlashcardResource[] | undefined;
  const dueCards = sessionId
    ? (sessionCards ?? [])
    : (queueQuery.data?.due_cards ?? []);
  const rawCurrentCard = dueCards[currentIndex] as FlashcardResource | undefined;
  const effectiveIsPreview = isPreview || (queueQuery.data as any)?.is_preview === true;

  // Initialize index & results when resuming a persistent study session
  useEffect(() => {
    if (sessionId && sessionQuery.data?.session && !hasInitializedSession) {
      const session = sessionQuery.data.session;
      const initialIdx = Number(
        session.current_index ??
        (session as { currentIndex?: number }).currentIndex ??
        0,
      );
      
      let targetIdx = initialIdx;
      // If we have full snapshot cards, calculate target index based on non-deleted mapped cards
      const allSessionCards = sessionQuery.data.session_cards || [];
      if (allSessionCards.length > 0 && sessionCards) {
        let validBefore = 0;
        for (let i = 0; i < Math.min(initialIdx, allSessionCards.length); i++) {
          if (allSessionCards[i].flashcard_id && sessionCards.some((c: FlashcardResource) => c.id === allSessionCards[i].flashcard_id)) {
            validBefore++;
          }
        }
        targetIdx = validBefore;
      }
      
      // Hydrate previously reviewed cards into results state from snapshot
      const initialResults: ReviewResult[] = allSessionCards
        .filter((sc) => sc.status === "reviewed" && sc.flashcard_id)
        .map((sc) => ({
          cardId: sc.flashcard_id!,
          rating: (sc.rating as FlashcardRating) || "good",
          reactionMs: (sc as { reaction_ms?: number; reactionMs?: number }).reaction_ms ?? (sc as { reaction_ms?: number; reactionMs?: number }).reactionMs ?? 0,
        }));

      setResults(initialResults);
      setCurrentIndex(targetIdx);
      setHasInitializedSession(true);

      if (
        session.status === "completed" ||
        (session.total_cards > 0 && session.completed_cards >= session.total_cards) ||
        (sessionCards && targetIdx >= sessionCards.length && sessionCards.length > 0)
      ) {
        setIsCompleted(true);
      }
    }
  }, [sessionId, sessionQuery.data, sessionCards, hasInitializedSession]);

  // Session mutations
  const updateSessionProgressMutation = useMutation({
    mutationFn: async (vars: {
      newIndex: number;
      currentCardId?: string;
      cardId?: string;
      rating?: FlashcardRating;
      reactionMs?: number;
    }) => {
      if (sessionId) {
        let dbCurrentIndex = vars.newIndex;
        const allSessionCards = sessionQuery.data?.session_cards;
        if (allSessionCards && allSessionCards.length > 0 && sessionCards) {
          const nextCard = dueCards[vars.newIndex];
          if (nextCard) {
            const foundIdx = allSessionCards.findIndex((sc: { flashcard_id?: string | null }) => sc.flashcard_id === nextCard.id);
            if (foundIdx !== -1) {
              dbCurrentIndex = foundIdx;
            }
          } else {
            // Reached the end
            dbCurrentIndex = allSessionCards.length;
          }
        }
        
        return studyApi.updateFlashcardStudySessionProgress(
          organizationId,
          sessionId,
          {
            current_index: dbCurrentIndex,
            current_card_id: vars.currentCardId,
            card_id: vars.cardId,
            rating: vars.rating,
            reaction_ms: vars.reactionMs,
          },
        );
      }
      return Promise.resolve();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["flashcard-sessions", organizationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["flashcard-study-session", organizationId, sessionId],
      });
    },
  });

  const completeSessionMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) return;
      return studyApi.completeFlashcardStudySession(organizationId, sessionId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["flashcard-sessions", organizationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["flashcard-study-session", organizationId, sessionId],
      });
    },
  });

  // Track active educational study time for flashcard reviews
  useStudySessionTracker({
    activityType: "flashcard",
    courseId: courseId || (effectiveCourseIds.length === 1 ? effectiveCourseIds[0] : undefined),
    enabled: dueCards.length > 0 && !isCompleted,
  });

  // In-place editing state
  const [editedCards, setEditedCards] = useState<Record<string, { question: string; answer: string }>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");

  const currentCard = rawCurrentCard
    ? {
        ...rawCurrentCard,
        ...(editedCards[rawCurrentCard.id] || {}),
      }
    : undefined;

  const handleStartEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentCard) return;
    setEditQuestion(currentCard.question);
    setEditAnswer(currentCard.answer);
    setIsEditing(true);
  }, [currentCard]);

  const handleSaveEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentCard) return;
    setEditedCards((prev) => ({
      ...prev,
      [currentCard.id]: {
        question: editQuestion,
        answer: editAnswer,
      },
    }));
    setIsEditing(false);
  }, [currentCard, editQuestion, editAnswer]);

  const handleCancelEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
  }, []);

  // Resolve course name if available
  const currentCourseInfo = summaryQuery.data?.courses?.find(
    (c) => c.course_id === currentCard?.course_id,
  );

  // Submit review rating mutation
  const reviewMutation = useMutation({
    mutationFn: async ({
      cardId,
      rating,
      reactionMs,
      targetCourseId,
    }: {
      cardId: string;
      rating: FlashcardRating;
      reactionMs: number;
      targetCourseId: string;
    }) => {
      const isExamOrCustom = mode === "exam" || mode === "custom";
      return studyApi.submitFlashcardReview(organizationId, targetCourseId, cardId, {
        rating,
        reaction_ms: reactionMs,
        is_exam_mode: isExamOrCustom,
      });
    },
    onSuccess: () => {
      const targetCourseId = effectiveCourseIds[0] || courseId;
      if (targetCourseId) {
        void queryClient.invalidateQueries({
          queryKey: ["flashcards", organizationId, targetCourseId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["flashcards-queue", organizationId, targetCourseId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["study-analytics", organizationId, targetCourseId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["study-recommendations", organizationId, targetCourseId],
        });
      } else {
        void queryClient.invalidateQueries({
          queryKey: ["flashcards", organizationId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["flashcards-queue", organizationId],
        });
      }
      void queryClient.invalidateQueries({
        queryKey: ["flashcard-summary", organizationId],
      });
    },
  });

  const handleFlip = useCallback(() => {
    setIsFlipped(true);
    setFlipTimestamp((prev) => (prev > 0 ? prev : Date.now()));
  }, []);

  const handleRating = useCallback(
    (rating: FlashcardRating) => {
      if (!currentCard || !isFlipped || isSubmitting || reviewMutation.isPending) return;

      setIsSubmitting(true);
      setSelectedRating(rating);
      const reactionMs = flipTimestamp > 0 ? Date.now() - flipTimestamp : 0;

      reviewMutation.mutate(
        {
          cardId: currentCard.id,
          rating,
          reactionMs,
          targetCourseId: currentCard.course_id,
        },
        {
          onSuccess: () => {
            const newResult: ReviewResult = {
              cardId: currentCard.id,
              rating,
              reactionMs,
            };
            setResults((prev) => {
              const existingIdx = prev.findIndex((r) => r.cardId === currentCard.id);
              if (existingIdx >= 0) {
                const copy = [...prev];
                copy[existingIdx] = newResult;
                return copy;
              }
              return [...prev, newResult];
            });
            setSelectedRating(null);
            setIsSubmitting(false);

            const nextIndex = currentIndex + 1;
            const nextCard = dueCards[nextIndex];

            if (sessionId) {
              updateSessionProgressMutation.mutate({
                newIndex: nextIndex,
                currentCardId: nextCard?.id,
                cardId: currentCard.id,
                rating,
                reactionMs,
              });
            }

            if (nextIndex < dueCards.length) {
              setIsFlipped(false);
              setFlipTimestamp(0);
              setCurrentIndex(nextIndex);
            } else {
              setIsCompleted(true);
              if (sessionId) {
                completeSessionMutation.mutate();
              }
              void queryClient.invalidateQueries({
                queryKey: ["flashcards-queue", organizationId],
              });
            }
          },
          onError: () => {
            setSelectedRating(null);
            setIsSubmitting(false);
          },
        },
      );
    },
    [
      currentCard,
      isFlipped,
      isSubmitting,
      reviewMutation,
      flipTimestamp,
      currentIndex,
      dueCards,
      sessionId,
      updateSessionProgressMutation,
      completeSessionMutation,
      organizationId,
      queryClient,
    ],
  );

  const handlePrevCard = useCallback(() => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      const prevCard = dueCards[prevIdx];
      setCurrentIndex(prevIdx);
      setIsFlipped(false);
      setFlipTimestamp(0);
      if (sessionId) {
        updateSessionProgressMutation.mutate({
          newIndex: prevIdx,
          currentCardId: prevCard?.id,
        });
      }
    }
  }, [currentIndex, dueCards, sessionId, updateSessionProgressMutation]);

  const handleNextCard = useCallback(() => {
    if (!isFlipped) {
      handleFlip();
    } else if (currentIndex + 1 < dueCards.length) {
      const nextIdx = currentIndex + 1;
      const nextCard = dueCards[nextIdx];
      setCurrentIndex(nextIdx);
      setIsFlipped(false);
      setFlipTimestamp(0);
      if (sessionId) {
        updateSessionProgressMutation.mutate({
          newIndex: nextIdx,
          currentCardId: nextCard?.id,
        });
      }
    }
  }, [currentIndex, dueCards, isFlipped, handleFlip, sessionId, updateSessionProgressMutation]);

  const togglePriority = (priority: "high" | "medium" | "low") => {
    if (!currentCard) return;
    setCardPriorities((prev) => ({
      ...prev,
      [currentCard.id]: prev[currentCard.id] === priority ? "low" : priority,
    }));
  };

  // Keyboard shortcuts (Space: Flip, 1: Again, 2: Hard, 3: Good, 4: Easy)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isCompleted || !currentCard || isSubmitting) return;

      // Prevent triggering shortcuts when typing in inputs/textareas
      if (
        document.activeElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
      ) {
        return;
      }

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleFlip();
      } else if (isFlipped) {
        if (e.key === "1") {
          e.preventDefault();
          handleRating("again");
        } else if (e.key === "2") {
          e.preventDefault();
          handleRating("hard");
        } else if (e.key === "3") {
          e.preventDefault();
          handleRating("good");
        } else if (e.key === "4") {
          e.preventDefault();
          handleRating("easy");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFlipped, isCompleted, currentCard, isSubmitting, handleFlip, handleRating]);

  // Dynamic calculations for stats panel
  const totalSessionCards = sessionId
    ? (sessionQuery.data?.session?.total_cards ?? dueCards.length)
    : dueCards.length;

  const finishedCount = results.length;

  const unseenCount = sessionId
    ? Math.max(0, totalSessionCards - finishedCount)
    : dueCards.filter((c) => !c.interval_days || c.interval_days === 0).length;

  const reviewCount = sessionId
    ? results.filter((r) => r.rating === "again" || r.rating === "hard").length
    : Math.max(0, dueCards.length - unseenCount - results.length);

  const isDataLoading = (sessionId ? sessionQuery.isLoading : queueQuery.isLoading) || summaryQuery.isLoading;
  const isDataError = sessionId ? sessionQuery.isError : queueQuery.isError;
  const dataErrorMessage = (sessionId ? sessionQuery.error?.message : queueQuery.error?.message) || "خطایی در دریافت کارت‌ها رخ داد.";

  // Loading state
  if (isDataLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 gap-4 min-h-[60vh]">
        <LoadingState message="در حال دریافت کارت‌های مرور..." />
      </div>
    );
  }

  // Error state
  if (isDataError) {
    return (
      <Card variant="solid" className="max-w-md mx-auto my-16 p-8 bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] text-center space-y-5 shadow-[var(--shadow-card)]">
        <AlertCircle className="w-12 h-12 text-[var(--color-error)] mx-auto" />
        <h3 className="text-lg font-bold text-[var(--color-text)]">
          خطا در بارگذاری فلش‌کارت‌ها
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          {dataErrorMessage}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              if (sessionId) {
                void sessionQuery.refetch();
              } else {
                void queueQuery.refetch();
              }
              void summaryQuery.refetch();
            }}
            className="rounded-[10px]"
          >
            تلاش مجدد
          </Button>
          {onBack && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBack}
              className="rounded-[10px]"
            >
              بازگشت به داشبورد
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // Empty queue state
  if (dueCards.length === 0 && !isCompleted) {
    let totalCount = 0;
    if (summaryQuery.data?.courses) {
      if (effectiveCourseIds.length > 0) {
        totalCount = summaryQuery.data.courses
          .filter((c: { course_id: string; total_cards: number }) =>
            effectiveCourseIds.includes(c.course_id),
          )
          .reduce((sum: number, c: { total_cards: number }) => sum + c.total_cards, 0);
      } else {
        totalCount = summaryQuery.data.courses.reduce(
          (sum: number, c: { total_cards: number }) => sum + c.total_cards,
          0,
        );
      }
    }

    return (
      <Card variant="solid" className="max-w-lg mx-auto my-16 p-10 bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] text-center space-y-6 shadow-[var(--shadow-card)]">
        <div className="w-16 h-16 rounded-[12px] bg-[var(--color-primary-soft)] text-[var(--color-primary)] border border-[var(--color-primary-muted)] flex items-center justify-center mx-auto">
          <Sparkles className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-[var(--color-text)]">
            مرور کارت‌ها به پایان رسید!
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-2 leading-relaxed">
            در حال حاضر کارتی برای مرور زمان‌بندی نشده است.
          </p>
        </div>
        <div className="p-4 bg-[var(--color-surface-hover)] rounded-[12px] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
          تعداد کل فلش‌کارت‌های این محدوده:{" "}
          <span className="font-bold text-[var(--color-primary)] text-sm">{totalCount}</span>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void queueQuery.refetch();
              void summaryQuery.refetch();
            }}
            className="rounded-[10px]"
          >
            تازه‌سازی صف مرور
          </Button>
          {onBack && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onBack}
              className="rounded-[10px]"
            >
              بازگشت به داشبورد
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // Session completed summary
  if (isCompleted) {
    const againCount = results.filter((r) => r.rating === "again").length;
    const hardCount = results.filter((r) => r.rating === "hard").length;
    const goodCount = results.filter((r) => r.rating === "good").length;
    const easyCount = results.filter((r) => r.rating === "easy").length;
    const goodEasyCount = goodCount + easyCount;
    const accuracy =
      results.length > 0 ? Math.round((goodEasyCount / results.length) * 100) : 0;
    const durationSeconds = Math.round((Date.now() - sessionStartTime) / 1000);
    const durationMinutes = Math.floor(durationSeconds / 60);

    return (
      <Card variant="solid" className="max-w-xl mx-auto my-12 p-8 bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] text-center space-y-6 shadow-[var(--shadow-card)]">
        <div className="w-20 h-20 rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] border border-[var(--color-primary-muted)] flex items-center justify-center mx-auto shadow-sm">
          <Award className="w-10 h-10" />
        </div>

        <div>
          <h3 className="text-2xl font-extrabold text-[var(--color-text)]">
            مرور تمام شد!
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-2 leading-relaxed">
            جلسه مرور با موفقیت به پایان رسید!
          </p>
        </div>

        <div className="p-5 bg-[var(--color-surface-hover)] rounded-[14px] border border-[var(--color-border)] text-xs space-y-4">
          <div className="text-xl font-black text-[var(--color-primary)] pb-3 border-b border-[var(--color-border)]">
            {toPersianDigits(results.length)} کارت مرور شد
          </div>

          <div className="grid grid-cols-4 gap-2 text-center py-1">
            <div className="bg-[var(--color-error-soft)] p-2.5 rounded-[10px] border border-[var(--color-error-muted)]">
              <span className="text-xs font-bold text-[var(--color-error)]">Again</span>
              <p className="text-base font-black text-[var(--color-error)] mt-0.5">{toPersianDigits(againCount)}</p>
            </div>
            <div className="bg-[var(--color-warning-soft)] p-2.5 rounded-[10px] border border-[var(--color-warning-muted)]">
              <span className="text-xs font-bold text-[var(--color-warning)]">Hard</span>
              <p className="text-base font-black text-[var(--color-warning)] mt-0.5">{toPersianDigits(hardCount)}</p>
            </div>
            <div className="bg-[var(--color-secondary-light)] p-2.5 rounded-[10px] border border-[var(--color-secondary)]">
              <span className="text-xs font-bold text-[var(--color-secondary-dark)]">Good</span>
              <p className="text-base font-black text-[var(--color-secondary-dark)] mt-0.5">{toPersianDigits(goodCount)}</p>
            </div>
            <div className="bg-[var(--color-success-soft)] p-2.5 rounded-[10px] border border-[var(--color-success-muted)]">
              <span className="text-xs font-bold text-[var(--color-success)]">Easy</span>
              <p className="text-base font-black text-[var(--color-success)] mt-0.5">{toPersianDigits(easyCount)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 text-right">
            <div>
              <span className="text-[var(--color-text-muted)]">دقت پاسخ‌دهی:</span>{" "}
              <span className="font-bold text-[var(--color-text)]">{toPersianDigits(accuracy)}%</span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">زمان مطالعه:</span>{" "}
              <span className="font-bold text-[var(--color-text)]">
                {durationMinutes > 0 ? `${toPersianDigits(durationMinutes)} دقیقه` : `${toPersianDigits(durationSeconds)} ثانیه`}
              </span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">کارت‌های ضعیف:</span>{" "}
              <span className="font-bold text-[var(--color-error)]">{toPersianDigits(againCount)}</span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">کارت‌های باقی‌مانده:</span>{" "}
              <span className="font-bold text-[var(--color-text)]">
                {toPersianDigits(summaryQuery.data?.total_due || 0)}
              </span>
            </div>
          </div>
        </div>

        {effectiveIsPreview && (
          <div className="p-6 rounded-2xl bg-gradient-to-br from-teal-500/15 via-indigo-500/10 to-purple-500/15 border border-teal-500/30 text-center space-y-3.5 shadow-sm">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-400/20 text-teal-600 dark:text-teal-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>پایان پیش‌نمایش فلش‌کارت‌ها</span>
            </div>
            <h4 className="text-base font-bold text-[var(--color-text)]">
              تمام ۵ فلش‌کارت نمونه را مرور کردید!
            </h4>
            <p className="text-xs text-[var(--color-text-secondary)] max-w-md mx-auto leading-relaxed">
              برای دسترسی به تمام فلش‌کارت‌های دوره‌ها، مرور فاصله‌دار هوشمند لایتنر (Spaced Repetition) و تثبیت دائمی یادگیری در حافظه بلندمدت، دوره را تهیه کنید.
            </p>
            {onUnlock && (
              <div className="pt-2">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={onUnlock}
                  className="rounded-[10px]"
                >
                  خرید و دسترسی به تمام فلش‌کارت‌ها
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-4">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => {
              setIsCompleted(false);
              setCurrentIndex(0);
              setIsFlipped(false);
              setResults([]);
              void queueQuery.refetch();
            }}
            className="rounded-[10px] gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>تکرار جلسه</span>
          </Button>
          {onBack && (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={onBack}
              className="rounded-[10px]"
            >
              بازگشت به داشبورد
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // Active review session
  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)] font-sans dir-rtl text-right">
      {/* Review Header */}
      <header className="w-full px-4 md:px-16 py-6 z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[var(--color-border)]">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-xl md:text-2xl text-[var(--color-text)]">
              {currentCourseInfo ? currentCourseInfo.title : "Pharmacology - Cardiovascular"}
            </h2>
            {effectiveIsPreview && (
              <Badge variant="info" size="sm" className="gap-1">
                <Sparkles className="w-3 h-3 text-teal-400" />
                پیش‌نمایش رایگان (۵ کارت)
              </Badge>
            )}
            {mode === "exam" && (
              <Badge variant="warning" size="sm" className="gap-1">
                <Sparkles className="w-3 h-3" />
                مرور فشرده
              </Badge>
            )}
            {mode === "custom" && (
              <Badge variant="info" size="sm">
                مطالعه سفارشی
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs text-[var(--color-text-muted)] font-medium">مرور فلش‌کارت‌ها</p>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
              >
                <ArrowRight className="w-3 h-3" />
                <span>خروج از مرور</span>
              </button>
            )}
          </div>
        </div>

        {/* Compact 3-Stats Header Pill (Replaces Today's Progress) */}
        <div className="inline-flex items-center gap-4 px-4 py-2 bg-[var(--color-surface)] rounded-full border border-[var(--color-border)] shadow-[var(--shadow-subtle)] text-xs">
          <div className="flex items-center gap-1.5 border-e border-[var(--color-border)] pe-3">
            <span className="text-[var(--color-text-muted)]">دیده‌نشده:</span>
            <span className="font-bold text-[var(--color-primary)]">{toPersianDigits(unseenCount)}</span>
          </div>
          <div className="flex items-center gap-1.5 border-e border-[var(--color-border)] pe-3">
            <span className="text-[var(--color-text-muted)]">مرور مجدد:</span>
            <span className="font-bold text-[var(--color-error)]">{toPersianDigits(reviewCount)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--color-text-muted)]">پایان‌یافته:</span>
            <span className="font-bold text-[var(--color-success)]">{toPersianDigits(finishedCount)}</span>
          </div>
        </div>
      </header>

      {reviewMutation.isError && (
        <div className="max-w-3xl mx-auto w-full px-4 z-10 mb-3">
          <div className="p-3 bg-[var(--color-error-soft)] rounded-[10px] border border-[var(--color-error-muted)] text-xs text-[var(--color-error)] flex items-center gap-2 justify-center">
            <AlertCircle className="w-4 h-4" />
            <span>خطا در ثبت بازخورد. لطفاً دوباره تلاش کنید.</span>
          </div>
        </div>
      )}

      {/* Tier 2 Surface: Review Canvas Container Surface */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 z-10 w-full max-w-4xl mx-auto">
        <Card variant="solid" className="w-full p-4 md:p-6 bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] shadow-[var(--shadow-card)] flex flex-col items-center justify-center gap-4">
          
          {/* Tier 3 Surface: 3D Perspective Flashcard Container */}
          {currentCard && (
            <>
              <div
                id="flashcard"
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
                className={`flip-card w-full max-w-3xl min-h-[300px] md:min-h-[360px] lg:min-h-[400px] cursor-pointer group perspective-1000 ${
                  isFlipped ? "flipped" : ""
                }`}
              >
                <div
                  className="flip-card-inner relative w-full h-full transition-transform duration-600 ease-in-out"
                >
                  {/* Front (Question Side) - Frameless Floating Content */}
                  <div
                    className={`flip-card-front absolute inset-0 w-full h-full p-4 md:p-8 flex flex-col justify-between items-center text-center rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[var(--shadow-subtle)] transition-opacity duration-300 ${
                      isFlipped ? "opacity-0 pointer-events-none" : "opacity-100"
                    }`}
                  >
                    {/* Middle Centered Question Content or In-line Editor */}
                    {isEditing ? (
                      <div
                        className="flex-1 flex flex-col justify-center items-center text-center w-full my-auto px-2 py-2 space-y-2.5 z-30"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="w-full text-right space-y-1">
                          <label className="text-xs text-[var(--color-primary)] font-bold">متن سوال:</label>
                          <textarea
                            value={editQuestion}
                            onChange={(e) => setEditQuestion(e.target.value)}
                            className="w-full p-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[10px] text-xs md:text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] resize-none h-20 leading-relaxed font-sans"
                            dir="rtl"
                          />
                        </div>
                        <div className="w-full text-right space-y-1">
                          <label className="text-xs text-[var(--color-primary)] font-bold">متن پاسخ:</label>
                          <textarea
                            value={editAnswer}
                            onChange={(e) => setEditAnswer(e.target.value)}
                            className="w-full p-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[10px] text-xs md:text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] resize-none h-20 leading-relaxed font-sans"
                            dir="rtl"
                          />
                        </div>
                        <div className="flex items-center justify-center gap-3 pt-1">
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={handleSaveEdit}
                            className="rounded-[10px] gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>ثبت تغییرات</span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCancelEdit}
                            className="rounded-[10px] gap-1.5"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>انصراف</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col justify-center items-center text-center w-full my-auto px-4 py-4">
                        <h3 className="text-xl md:text-2xl lg:text-3xl font-bold text-[var(--color-text)] leading-relaxed max-w-2xl text-center">
                          <RichContent content={currentCard.question} inline />
                        </h3>
                      </div>
                    )}

                    {/* Bottom Touch Prompt Footer */}
                    <div className="flex justify-center items-center gap-2 text-xs text-[var(--color-text-muted)] pt-2.5 border-t border-[var(--color-border)] w-full flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                      <Pointer className="w-4 h-4 text-[var(--color-primary)]" />
                      <span>برای مشاهده پاسخ کلیک کنید</span>
                    </div>
                  </div>

                  {/* Back (Answer Side) - Frameless Floating Content */}
                  <div
                    className={`flip-card-back absolute inset-0 w-full h-full p-4 md:p-8 flex flex-col justify-between items-center text-center rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[var(--shadow-subtle)] transition-opacity duration-300 ${
                      isFlipped ? "opacity-100" : "opacity-0 pointer-events-none"
                    }`}
                  >
                    {/* Middle Centered Answer Content or In-line Editor */}
                    {isEditing ? (
                      <div
                        className="flex-1 flex flex-col justify-center items-center text-center w-full my-auto px-2 py-2 space-y-2.5 z-30"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="w-full text-right space-y-1">
                          <label className="text-xs text-[var(--color-primary)] font-bold">متن سوال:</label>
                          <textarea
                            value={editQuestion}
                            onChange={(e) => setEditQuestion(e.target.value)}
                            className="w-full p-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[10px] text-xs md:text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] resize-none h-20 leading-relaxed font-sans"
                            dir="rtl"
                          />
                        </div>
                        <div className="w-full text-right space-y-1">
                          <label className="text-xs text-[var(--color-primary)] font-bold">متن پاسخ:</label>
                          <textarea
                            value={editAnswer}
                            onChange={(e) => setEditAnswer(e.target.value)}
                            className="w-full p-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[10px] text-xs md:text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] resize-none h-20 leading-relaxed font-sans"
                            dir="rtl"
                          />
                        </div>
                        <div className="flex items-center justify-center gap-3 pt-1">
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={handleSaveEdit}
                            className="rounded-[10px] gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>ثبت تغییرات</span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCancelEdit}
                            className="rounded-[10px] gap-1.5"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>انصراف</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col justify-center items-center text-center w-full my-auto px-4 py-4 space-y-3">
                        <div className="text-base md:text-lg lg:text-xl font-semibold text-[var(--color-text)] leading-relaxed max-w-2xl text-center">
                          <RichContent content={currentCard.answer} inline />
                        </div>
                        {currentCard.explanation && (
                          <div className="w-full max-w-2xl p-3.5 bg-[var(--color-surface-hover)] rounded-[12px] border border-[var(--color-border)] text-xs md:text-sm text-[var(--color-text-secondary)] space-y-1.5 text-right">
                            <div className="font-bold text-[var(--color-primary)] flex items-center gap-1.5 justify-start">
                              <Lightbulb className="w-4 h-4 text-[var(--color-primary)]" />
                              <span>توضیح تکمیلی:</span>
                            </div>
                            <div className="leading-relaxed text-[var(--color-text-secondary)]">
                              <RichContent content={currentCard.explanation} />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bottom Status Hint */}
                    <div className="flex justify-center items-center gap-2 text-xs text-[var(--color-primary)] pt-2.5 border-t border-[var(--color-primary-muted)] w-full flex-shrink-0 font-medium">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>پاسخ ثبت آماده ارزیابی است</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* External Control Bar Below Flashcard Box */}
              <div className="w-full max-w-3xl flex items-center justify-between px-2 py-1 flex-shrink-0 gap-2 z-20">
                <Badge variant="primary" size="sm" className="gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{currentCourseInfo ? currentCourseInfo.title : "فلش‌کارت"}</span>
                </Badge>

                {/* Edit Card Button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleStartEdit}
                  aria-label="ویرایش کارت"
                  title="ویرایش کارت"
                  className="rounded-[10px] gap-1.5 text-xs z-20"
                >
                  <Pencil className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span>ویرایش کارت</span>
                </Button>

                <span className="text-xs text-[var(--color-text-muted)] font-medium bg-[var(--color-surface-hover)] px-3 py-1 rounded-full border border-[var(--color-border)]">
                  {isFlipped ? "پاسخ" : "سوال"}
                </span>
              </div>
            </>
          )}

          {/* Spaced Repetition Controls */}
          <div className="w-full max-w-3xl flex flex-col gap-3">
            {/* Priority Markers */}
            <div className="flex justify-center items-center gap-4 p-3 bg-[var(--color-surface-hover)] rounded-[10px] border border-[var(--color-border)]">
              <span className="text-xs text-[var(--color-text-muted)] self-center me-2">نشانی‌گذاری اولویت:</span>
              <button
                type="button"
                onClick={() => togglePriority("high")}
                className={`w-7 h-7 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                  currentCard && cardPriorities[currentCard.id] === "high"
                    ? "bg-[var(--color-error)] border-[var(--color-error)] scale-110"
                    : "bg-[var(--color-error-soft)] border-[var(--color-error-muted)]"
                }`}
                aria-label="اولویت بالا"
                title="اولویت بالا"
              />
              <button
                type="button"
                onClick={() => togglePriority("medium")}
                className={`w-7 h-7 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                  currentCard && cardPriorities[currentCard.id] === "medium"
                    ? "bg-[var(--color-warning)] border-[var(--color-warning)] scale-110"
                    : "bg-[var(--color-warning-soft)] border-[var(--color-warning-muted)]"
                }`}
                aria-label="اولویت متوسط"
                title="اولویت متوسط"
              />
              <button
                type="button"
                onClick={() => togglePriority("low")}
                className={`w-7 h-7 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                  currentCard && cardPriorities[currentCard.id] === "low"
                    ? "bg-[var(--color-secondary-dark)] border-[var(--color-secondary)] scale-110"
                    : "bg-[var(--color-secondary-light)] border-[var(--color-secondary)]"
                }`}
                aria-label="اولویت پایین"
                title="اولویت پایین"
              />
            </div>

            {/* Rating & Navigation Row */}
            <div className="flex items-center gap-3">
              {/* Previous Button (Icon Only - RTL ChevronRight) */}
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={handlePrevCard}
                disabled={currentIndex === 0}
                aria-label="کارت قبلی"
                title="کارت قبلی"
                className="flex-shrink-0 w-12 h-12 !p-0 rounded-full"
              >
                <ChevronRight className="w-5 h-5 text-[var(--color-text)]" />
              </Button>

              {/* Spaced Repetition Grid */}
              <div
                className={`flex-1 grid grid-cols-4 gap-2 md:gap-4 transition-all duration-300 ${
                  isFlipped ? "opacity-100" : "opacity-40 pointer-events-none"
                }`}
                id="review-controls"
              >
                <button
                  type="button"
                  onClick={() => handleRating("again")}
                  disabled={!isFlipped || isSubmitting || reviewMutation.isPending}
                  aria-label="تکرار"
                  className="flex flex-col items-center justify-center py-3.5 px-2 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-error)] hover:bg-[var(--color-error-soft)] transition-colors group disabled:opacity-50 cursor-pointer"
                >
                  {selectedRating === "again" && isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--color-error)]" />
                  ) : (
                    <>
                      <span className="text-xs md:text-sm font-bold text-[var(--color-text)] mb-1">دوباره</span>
                      <span className="text-[11px] md:text-[12px] font-bold text-[var(--color-error)]">
                        {getIntervalHint("again", currentCard)}
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleRating("hard")}
                  disabled={!isFlipped || isSubmitting || reviewMutation.isPending}
                  aria-label="سخت"
                  className="flex flex-col items-center justify-center py-3.5 px-2 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-warning)] hover:bg-[var(--color-warning-soft)] transition-colors group disabled:opacity-50 cursor-pointer"
                >
                  {selectedRating === "hard" && isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--color-warning)]" />
                  ) : (
                    <>
                      <span className="text-xs md:text-sm font-bold text-[var(--color-text)] mb-1">سخت</span>
                      <span className="text-[11px] md:text-[12px] font-bold text-[var(--color-warning)]">
                        {getIntervalHint("hard", currentCard)}
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleRating("good")}
                  disabled={!isFlipped || isSubmitting || reviewMutation.isPending}
                  aria-label="خوب"
                  className="flex flex-col items-center justify-center py-3.5 px-2 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-secondary)] hover:bg-[var(--color-secondary-light)] transition-colors group disabled:opacity-50 cursor-pointer"
                >
                  {selectedRating === "good" && isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--color-secondary-dark)]" />
                  ) : (
                    <>
                      <span className="text-xs md:text-sm font-bold text-[var(--color-text)] mb-1">خوب</span>
                      <span className="text-[11px] md:text-[12px] font-bold text-[var(--color-secondary-dark)]">
                        {getIntervalHint("good", currentCard)}
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleRating("easy")}
                  disabled={!isFlipped || isSubmitting || reviewMutation.isPending}
                  aria-label="آسان"
                  className="flex flex-col items-center justify-center py-3.5 px-2 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-success)] hover:bg-[var(--color-success-soft)] transition-colors group disabled:opacity-50 cursor-pointer"
                >
                  {selectedRating === "easy" && isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--color-success)]" />
                  ) : (
                    <>
                      <span className="text-xs md:text-sm font-bold text-[var(--color-text)] mb-1">آسان</span>
                      <span className="text-[11px] md:text-[12px] font-bold text-[var(--color-success)]">
                        {getIntervalHint("easy", currentCard)}
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* Next Button (Icon Only - RTL ChevronLeft) */}
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={handleNextCard}
                disabled={currentIndex >= dueCards.length - 1 && isFlipped}
                aria-label="کارت بعدی"
                title="کارت بعدی"
                className="flex-shrink-0 w-12 h-12 !p-0 rounded-full"
              >
                <ChevronLeft className="w-5 h-5 text-[var(--color-text)]" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Floating AI Assistant Button */}
      <button
        type="button"
        aria-label="دستیار هوش مصنوعی"
        className="fixed bottom-6 left-6 md:bottom-10 md:left-10 w-14 h-14 rounded-full bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] shadow-[var(--shadow-card)] flex items-center justify-center z-50 hover:scale-105 transition-transform cursor-pointer"
      >
        <span className="text-white text-2xl font-bold leading-none">A</span>
      </button>
    </div>
  );
}
