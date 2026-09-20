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
import {
  formatReviewIntervalHint,
  toPersianDigits,
  isFlashcardGraduatedInSession,
} from "@avana/domain";
import { RichContent } from "../markdown/MarkdownRenderer.js";

export interface FlashcardExperienceProps {
  organizationId: string;
  sessionId?: string;
  courseId?: string;
  courseIds?: string[];
  documentIds?: string[];
  mode?: "normal" | "exam" | "custom";
  customMode?: "weak" | "forgotten" | "overdue" | "review_ahead" | "new" | "due" | "learned";
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
  card?: {
    interval_days?: number;
    intervalDays?: number;
    ease_factor?: number | string;
    easeFactor?: number | string;
  },
): string {
  if (!card) return "";
  const prevInterval = card.interval_days ?? card.intervalDays ?? 0;
  const rawEase = card.ease_factor ?? card.easeFactor;
  const prevEase = rawEase ? Number(rawEase) : 2.5;

  return formatReviewIntervalHint(rating, {
    intervalDays: prevInterval,
    easeFactor: prevEase,
  });
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
  const [cardEvaluations, setCardEvaluations] = useState<Record<string, FlashcardRating[]>>({});
  const [isCompleted, setIsCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRating, setSelectedRating] = useState<FlashcardRating | null>(null);

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

  const [activeQueue, setActiveQueue] = useState<FlashcardResource[]>([]);

  // Guarantee clean state and queue when course scope or session parameters change
  const effectiveCourseIdsKey = effectiveCourseIds.join(",");
  useEffect(() => {
    setActiveQueue([]);
    setCurrentIndex(0);
    setResults([]);
    setCardEvaluations({});
    setIsCompleted(false);
    setIsFlipped(false);
    setFlipTimestamp(0);
    setSelectedRating(null);
  }, [effectiveCourseIdsKey, sessionId, mode, customMode]);

  const sessionCards = sessionQuery.data?.cards as FlashcardResource[] | undefined;
  const dueCards = sessionId
    ? (sessionCards ?? [])
    : (queueQuery.data?.due_cards ?? []);

  useEffect(() => {
    if (dueCards.length > 0 && activeQueue.length === 0) {
      setActiveQueue(dueCards);
    }
  }, [dueCards, activeQueue.length]);

  const effectiveCards = activeQueue.length > 0 ? activeQueue : dueCards;
  const rawCurrentCard = effectiveCards[currentIndex] as FlashcardResource | undefined;
  const effectiveIsPreview =
    isPreview ||
    (queueQuery.data as { is_preview?: boolean } | undefined)?.is_preview === true;

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
      
      // Hydrate previously reviewed cards into results & cardEvaluations state from snapshot
      const initialResults: ReviewResult[] = [];
      const initialEvaluations: Record<string, FlashcardRating[]> = {};

      for (const sc of allSessionCards) {
        if (sc.flashcard_id && sc.status === "reviewed") {
          const rating = (sc.rating as FlashcardRating) || "good";
          initialResults.push({
            cardId: sc.flashcard_id,
            rating,
            reactionMs:
              (sc as { reaction_ms?: number; reactionMs?: number }).reaction_ms ??
              (sc as { reaction_ms?: number; reactionMs?: number }).reactionMs ??
              0,
          });
          if (!initialEvaluations[sc.flashcard_id]) {
            initialEvaluations[sc.flashcard_id] = [];
          }
          initialEvaluations[sc.flashcard_id].push(rating);
        }
      }

      setResults(initialResults);
      setCardEvaluations(initialEvaluations);
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
      completedCards?: number;
    }) => {
      if (sessionId) {
        let dbCurrentIndex = vars.newIndex;
        const allSessionCards = sessionQuery.data?.session_cards;
        if (allSessionCards && allSessionCards.length > 0 && sessionCards) {
          const nextCard = effectiveCards[vars.newIndex];
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
            completed_cards: vars.completedCards,
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
    enabled: effectiveCards.length > 0 && !isCompleted,
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
  const resolvedCardCourseId =
    currentCard?.course_id ||
    (currentCard as unknown as { courseId?: string })?.courseId;
  const currentCourseInfo = summaryQuery.data?.courses?.find(
    (c) => c.course_id === resolvedCardCourseId,
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
      const targetCourseId =
        currentCard.course_id ||
        (currentCard as unknown as { courseId?: string })?.courseId ||
        effectiveCourseIds[0] ||
        courseId ||
        "";

      reviewMutation.mutate(
        {
          cardId: currentCard.id,
          rating,
          reactionMs,
          targetCourseId,
        },
        {
          onSuccess: () => {
            const newResult: ReviewResult = {
              cardId: currentCard.id,
              rating,
              reactionMs,
            };
            setResults((prev) => [...prev, newResult]);

            const prevRatings = cardEvaluations[currentCard.id] || [];
            const newRatings = [...prevRatings, rating];
            setCardEvaluations((prev) => ({
              ...prev,
              [currentCard.id]: newRatings,
            }));

            const isGraduated = isFlashcardGraduatedInSession(newRatings);

            let currentList = activeQueue.length > 0 ? activeQueue : dueCards;
            if (!isGraduated) {
              currentList = [...currentList, currentCard];
              setActiveQueue(currentList);
            }

            setSelectedRating(null);
            setIsSubmitting(false);

            const nextIndex = currentIndex + 1;
            const nextCard = currentList[nextIndex];

            const updatedEvaluations = {
              ...cardEvaluations,
              [currentCard.id]: newRatings,
            };
            const updatedFinishedCount = dueCards.filter(
              (c) =>
                updatedEvaluations[c.id] &&
                isFlashcardGraduatedInSession(updatedEvaluations[c.id]),
            ).length;

            if (sessionId) {
              updateSessionProgressMutation.mutate({
                newIndex: nextIndex,
                currentCardId: nextCard?.id,
                cardId: currentCard.id,
                rating,
                reactionMs,
                completedCards: updatedFinishedCount,
              });
            }

            if (nextIndex < currentList.length) {
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
      activeQueue,
      dueCards,
      cardEvaluations,
      sessionId,
      updateSessionProgressMutation,
      completeSessionMutation,
      organizationId,
      queryClient,
      effectiveCourseIds,
      courseId,
    ],
  );

  const handlePrevCard = useCallback(() => {
    const currentList = activeQueue.length > 0 ? activeQueue : dueCards;
    if (currentIndex > 0 && !isSubmitting && !reviewMutation.isPending) {
      const prevIdx = currentIndex - 1;
      const prevCard = currentList[prevIdx];
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
  }, [currentIndex, activeQueue, dueCards, isSubmitting, reviewMutation.isPending, sessionId, updateSessionProgressMutation]);

  const handleNextCard = useCallback(() => {
    const currentList = activeQueue.length > 0 ? activeQueue : dueCards;
    if (isSubmitting || reviewMutation.isPending) return;
    if (!isFlipped) {
      handleFlip();
    } else if (currentIndex + 1 < currentList.length) {
      const nextIdx = currentIndex + 1;
      const nextCard = currentList[nextIdx];
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
  }, [currentIndex, activeQueue, dueCards, isFlipped, handleFlip, isSubmitting, reviewMutation.isPending, sessionId, updateSessionProgressMutation]);

  // Keyboard shortcuts (Physical keys: Space -> Flip, F/ب -> Again, D/ی -> Hard, S/س -> Good, A/ش -> Easy, ArrowRight -> Prev, ArrowLeft -> Next)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isCompleted || !currentCard || isSubmitting || isEditing) return;

      // Prevent triggering shortcuts when typing in inputs/textareas
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(activeEl.tagName) ||
          activeEl.isContentEditable)
      ) {
        return;
      }

      const code = e.code;
      const key = e.key;

      const isSpaceKey = code === "Space" || key === " " || key === "Spacebar";
      const isArrowRight = code === "ArrowRight" || key === "ArrowRight";
      const isArrowLeft = code === "ArrowLeft" || key === "ArrowLeft";

      const isAgainKey = code === "KeyF" || key === "ب" || key === "f" || key === "F";
      const isHardKey =
        code === "KeyD" ||
        key === "ی" ||
        key === "ي" ||
        key === "ى" ||
        key === "d" ||
        key === "D";
      const isGoodKey = code === "KeyS" || key === "س" || key === "s" || key === "S";
      const isEasyKey = code === "KeyA" || key === "ش" || key === "a" || key === "A";

      if (isSpaceKey) {
        e.preventDefault();
        handleFlip();
        return;
      }

      if (isArrowRight) {
        e.preventDefault();
        handlePrevCard();
        return;
      }

      if (isArrowLeft) {
        e.preventDefault();
        handleNextCard();
        return;
      }

      if (isFlipped) {
        if (isAgainKey) {
          e.preventDefault();
          handleRating("again");
        } else if (isHardKey) {
          e.preventDefault();
          handleRating("hard");
        } else if (isGoodKey) {
          e.preventDefault();
          handleRating("good");
        } else if (isEasyKey) {
          e.preventDefault();
          handleRating("easy");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    isFlipped,
    isCompleted,
    currentCard,
    isSubmitting,
    isEditing,
    handleFlip,
    handleRating,
    handlePrevCard,
    handleNextCard,
  ]);

  // Dynamic calculations for stats panel
  const totalSessionCards = sessionId
    ? (sessionQuery.data?.session?.total_cards ?? dueCards.length)
    : dueCards.length;

  const finishedCount = dueCards.filter(
    (c) => cardEvaluations[c.id] && isFlashcardGraduatedInSession(cardEvaluations[c.id]),
  ).length;

  const reviewCount = dueCards.filter(
    (c) =>
      cardEvaluations[c.id] &&
      cardEvaluations[c.id].length > 0 &&
      !isFlashcardGraduatedInSession(cardEvaluations[c.id]),
  ).length;

  const unseenCount = Math.max(0, totalSessionCards - finishedCount - reviewCount);

  const isDataLoading = (sessionId ? sessionQuery.isLoading : queueQuery.isLoading) || summaryQuery.isLoading;
  const isDataError = sessionId ? sessionQuery.isError : queueQuery.isError;
  const dataErrorMessage = (sessionId ? sessionQuery.error?.message : queueQuery.error?.message) || "خطایی در دریافت کارت‌ها رخ داد.";

  // Loading state
  if (isDataLoading) {
    return (
      <div className="w-full h-full h-[100dvh] flex flex-col items-center justify-center p-4">
        <LoadingState message="در حال دریافت کارت‌های مرور..." />
      </div>
    );
  }

  // Error state
  if (isDataError) {
    return (
      <div className="w-full h-full h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
        <Card variant="solid" className="max-w-md w-full p-6 sm:p-8 bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] text-center space-y-5 shadow-[var(--shadow-card)]">
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
      </div>
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
      <div className="w-full h-full h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
        <Card variant="solid" className="max-w-lg w-full p-6 sm:p-10 bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] text-center space-y-6 shadow-[var(--shadow-card)]">
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
            <span className="font-bold text-[var(--color-primary)] text-sm">{toPersianDigits(totalCount)}</span>
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
      </div>
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
      <div className="w-full h-full h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
        <Card variant="solid" className="max-w-xl w-full p-6 sm:p-8 bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] text-center space-y-6 shadow-[var(--shadow-card)]">
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
                <p className="text-lg font-black text-[var(--color-error)] mt-1">{toPersianDigits(againCount)}</p>
              </div>
              <div className="bg-[var(--color-warning-soft)] p-2.5 rounded-[10px] border border-[var(--color-warning-muted)]">
                <span className="text-xs font-bold text-[var(--color-warning)]">Hard</span>
                <p className="text-lg font-black text-[var(--color-warning)] mt-1">{toPersianDigits(hardCount)}</p>
              </div>
              <div className="bg-[var(--color-secondary-light)] p-2.5 rounded-[10px] border border-[var(--color-secondary)]">
                <span className="text-xs font-bold text-[var(--color-secondary-dark)]">Good</span>
                <p className="text-lg font-black text-[var(--color-secondary-dark)] mt-1">{toPersianDigits(goodCount)}</p>
              </div>
              <div className="bg-[var(--color-success-soft)] p-2.5 rounded-[10px] border border-[var(--color-success-muted)]">
                <span className="text-xs font-bold text-[var(--color-success)]">Easy</span>
                <p className="text-lg font-black text-[var(--color-success)] mt-1">{toPersianDigits(easyCount)}</p>
              </div>
            </div>

            <div className="flex items-center justify-around pt-2 text-[var(--color-text-muted)] text-xs">
              <div>
                <span>دقت یادگیری: </span>
                <span className="font-bold text-[var(--color-primary)]">{toPersianDigits(accuracy)}٪</span>
              </div>
              <div className="h-4 w-px bg-[var(--color-border)]" />
              <div>
                <span>مدت زمان: </span>
                <span className="font-bold text-[var(--color-text)]">
                  {durationMinutes > 0 ? `${toPersianDigits(durationMinutes)} دقیقه` : `${toPersianDigits(durationSeconds)} ثانیه`}
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
                setCardEvaluations({});
                setActiveQueue([]);
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
      </div>
    );
  }

  // Active review session
  const progressPercent = effectiveCards.length > 0
    ? Math.min(100, Math.round(((currentIndex + 1) / effectiveCards.length) * 100))
    : 0;

  return (
    <div className="relative h-screen h-[100dvh] max-h-[100dvh] w-full flex flex-col justify-between overflow-hidden bg-[var(--color-bg-default)] text-[var(--color-text)] font-sans dir-rtl text-right select-none">
      {/* Review Top App Bar */}
      <header className="w-full px-3 sm:px-6 h-14 sm:h-16 z-10 flex justify-between items-center gap-2 sm:gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors p-1.5 rounded-lg hover:bg-[var(--color-surface-warm)] shrink-0"
              title="خروج از مرور"
            >
              <ArrowRight className="w-4 h-4" />
              <span className="hidden sm:inline font-medium">خروج</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <h2 className="font-bold text-xs sm:text-sm md:text-base text-[var(--color-text)] truncate max-w-[120px] sm:max-w-xs">
              {currentCourseInfo ? currentCourseInfo.title : "مرور فلش‌کارت‌ها"}
            </h2>
            {effectiveIsPreview && (
              <Badge variant="info" size="sm" className="hidden md:inline-flex gap-1 text-[10px] sm:text-xs">
                <Sparkles className="w-3 h-3 text-teal-400" />
                پیش‌نمایش رایگان (۵ کارت)
              </Badge>
            )}
            {mode === "exam" && (
              <Badge variant="warning" size="sm" className="hidden md:inline-flex gap-1 text-[10px] sm:text-xs">
                <Sparkles className="w-3 h-3" />
                مرور فشرده
              </Badge>
            )}
            {mode === "custom" && (
              <Badge variant="info" size="sm" className="hidden md:inline-flex text-[10px] sm:text-xs">
                مطالعه سفارشی
              </Badge>
            )}
          </div>
        </div>

        {/* Progress Center Bar */}
        {effectiveCards.length > 0 && (
          <div className="flex flex-1 justify-center max-w-[180px] sm:max-w-xs md:max-w-sm mx-2 items-center gap-2 sm:gap-3 min-w-0">
            <span className="text-[11px] sm:text-xs text-[var(--color-text-muted)] whitespace-nowrap font-medium font-mono">
              کارت {toPersianDigits(currentIndex + 1)} از {toPersianDigits(effectiveCards.length)}
            </span>
            <div className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-full h-1.5 sm:h-2 overflow-hidden">
              <div
                className="bg-[var(--color-primary)] h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Compact 3-Stats Header Pill */}
        <div className="inline-flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-3 py-1 bg-[var(--color-surface-warm)] rounded-full border border-[var(--color-border)] shadow-xs text-[11px] sm:text-xs shrink-0">
          <div className="flex items-center gap-1 border-e border-[var(--color-border)] pe-1.5 sm:pe-2">
            <span className="text-[var(--color-text-muted)] hidden md:inline">دیده‌نشده:</span>
            <span className="font-bold text-[var(--color-primary)]">{toPersianDigits(unseenCount)}</span>
          </div>
          <div className="flex items-center gap-1 border-e border-[var(--color-border)] pe-1.5 sm:pe-2">
            <span className="text-[var(--color-text-muted)] hidden md:inline">مرور مجدد:</span>
            <span className="font-bold text-[var(--color-error)]">{toPersianDigits(reviewCount)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[var(--color-text-muted)] hidden md:inline">پایان‌یافته:</span>
            <span className="font-bold text-[var(--color-success)]">{toPersianDigits(finishedCount)}</span>
          </div>
        </div>
      </header>

      {/* Main Review Area */}
      <div className="flex-1 flex flex-col items-center justify-between p-2 sm:p-4 md:p-6 z-10 w-full max-w-4xl mx-auto min-h-0 overflow-hidden">
        {reviewMutation.isError && (
          <div className="w-full mb-2 sm:mb-3 shrink-0">
            <div className="p-2 sm:p-3 bg-[var(--color-error-soft)] rounded-[10px] border border-[var(--color-error-muted)] text-xs text-[var(--color-error)] flex items-center gap-2 justify-center">
              <AlertCircle className="w-4 h-4" />
              <span>خطا در ثبت بازخورد مرور. لطفاً دوباره تلاش کنید.</span>
            </div>
          </div>
        )}

        {currentCard && (
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
              if (e.code === "Space" || e.key === " ") {
                e.preventDefault();
                handleFlip();
              }
            }}
            className="w-full flex-1 flex flex-col min-h-0 max-h-[480px] md:max-h-[500px] bg-[var(--color-surface)] rounded-[16px] sm:rounded-[18px] border border-[var(--color-border)] shadow-xs overflow-hidden transition-all duration-300 relative cursor-pointer group focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 my-auto"
          >
            {/* Integrated Card Top Bar */}
            <div
              className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]/40 shrink-0"
              onClick={(e) => isEditing && e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <Badge variant="primary" size="sm" className="gap-1.5 font-medium">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[150px] sm:max-w-[200px]">{currentCourseInfo ? currentCourseInfo.title : "فلش‌کارت"}</span>
                </Badge>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-secondary)]">
                  {isFlipped ? "پاسخ" : "سوال"}
                </span>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleStartEdit}
                aria-label="ویرایش کارت"
                title="ویرایش کارت"
                className="rounded-[8px] gap-1 text-xs py-1 h-7 text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
              >
                <Pencil className="w-3 h-3 text-[var(--color-primary)]" />
                <span>ویرایش</span>
              </Button>
            </div>

            {/* Central Card Body */}
            <div className="flex-1 flex flex-col justify-center items-center text-center w-full px-4 sm:px-8 md:px-12 py-3 sm:py-4 md:py-5 overflow-y-auto min-h-0">
              {isEditing ? (
                <div
                  className="w-full my-auto space-y-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-full text-right space-y-1">
                    <label className="text-xs text-[var(--color-primary)] font-bold">متن سوال:</label>
                    <textarea
                      value={editQuestion}
                      onChange={(e) => setEditQuestion(e.target.value)}
                      className="w-full p-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[10px] text-xs sm:text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] resize-y min-h-[80px] overflow-y-auto leading-relaxed font-sans"
                      dir="rtl"
                    />
                  </div>
                  <div className="w-full text-right space-y-1">
                    <label className="text-xs text-[var(--color-primary)] font-bold">متن پاسخ:</label>
                    <textarea
                      value={editAnswer}
                      onChange={(e) => setEditAnswer(e.target.value)}
                      className="w-full p-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[10px] text-xs sm:text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] resize-y min-h-[80px] overflow-y-auto leading-relaxed font-sans"
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
                <>
                  {/* Question View */}
                  <div className={`w-full flex-col items-center justify-center my-auto ${isFlipped ? "hidden" : "flex"}`}>
                    <h3 className="text-xs sm:text-sm md:text-lg lg:text-xl font-bold text-[var(--color-text)] leading-relaxed max-w-3xl text-center">
                      <RichContent content={currentCard.question} inline />
                    </h3>
                  </div>

                  {/* Answer View */}
                  <div className={`w-full flex-col items-center justify-center my-auto space-y-3 sm:space-y-4 ${isFlipped ? "flex" : "hidden"}`}>
                    <div className="text-xs sm:text-sm md:text-base lg:text-lg font-bold text-[var(--color-text)] leading-relaxed max-w-3xl text-center">
                      <RichContent content={currentCard.answer} inline />
                    </div>
                    {currentCard.explanation && (
                      <div className="w-full max-w-3xl p-3 sm:p-3.5 bg-[var(--color-surface-warm)] rounded-[12px] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed text-right">
                        <span className="font-bold text-[var(--color-primary)] inline-flex items-center gap-1.5 ml-1.5 align-middle">
                          <Lightbulb className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                          <span>توضیح تکمیلی:</span>
                        </span>
                        <span className="text-[var(--color-text-secondary)] inline leading-relaxed align-middle">
                          <RichContent content={currentCard.explanation} inline />
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Clean Bottom Touch Prompt */}
            <div className="flex justify-center items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs py-2 px-3 sm:px-4 bg-[var(--color-surface-warm)]/30 border-t border-[var(--color-border)] w-full shrink-0 text-[var(--color-text-muted)]">
              {!isFlipped ? (
                <>
                  <Pointer className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span>برای مشاهده پاسخ کلیک کنید یا کلید Space را فشار دهید</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span className="text-[var(--color-primary)] font-medium">پاسخ نمایان شد — سطح یادگیری خود را انتخاب کنید</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Spaced Repetition Review Controls */}
        <div className="w-full max-w-4xl flex items-center gap-2 sm:gap-3 pt-2 sm:pt-3 shrink-0 z-20">
          {/* Previous Button */}
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={handlePrevCard}
            disabled={currentIndex === 0 || isSubmitting || reviewMutation.isPending}
            aria-label="کارت قبلی"
            title="کارت قبلی"
            className="shrink-0 w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 !p-0 rounded-full"
          >
            <ChevronRight className="w-5 h-5 text-[var(--color-text)]" />
          </Button>

          {/* 4-Button SRS Rating Grid */}
          <div
            className={`flex-1 grid grid-cols-4 gap-1.5 sm:gap-2 md:gap-3 transition-opacity duration-300 ${
              isFlipped ? "opacity-100" : "opacity-40 pointer-events-none"
            }`}
            id="review-controls"
          >
            {/* 1. Again (دوباره) */}
            <button
              type="button"
              onClick={() => handleRating("again")}
              disabled={!isFlipped || isSubmitting || reviewMutation.isPending}
              aria-label="تکرار"
              className="flex flex-col items-center justify-center py-2 sm:py-2.5 md:py-3 px-1 md:px-2 rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-error)] hover:bg-[var(--color-error-soft)] transition-all group disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {selectedRating === "again" && isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--color-error)]" />
              ) : (
                <>
                  <span className="text-xs md:text-sm font-bold text-[var(--color-text)] mb-0.5">دوباره</span>
                  <span className="text-[10px] sm:text-[11px] md:text-xs font-bold text-[var(--color-error)]">
                    {getIntervalHint("again", currentCard)}
                  </span>
                </>
              )}
            </button>

            {/* 2. Hard (سخت) */}
            <button
              type="button"
              onClick={() => handleRating("hard")}
              disabled={!isFlipped || isSubmitting || reviewMutation.isPending}
              aria-label="سخت"
              className="flex flex-col items-center justify-center py-2 sm:py-2.5 md:py-3 px-1 md:px-2 rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-warning)] hover:bg-[var(--color-warning-soft)] transition-all group disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {selectedRating === "hard" && isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--color-warning)]" />
              ) : (
                <>
                  <span className="text-xs md:text-sm font-bold text-[var(--color-text)] mb-0.5">سخت</span>
                  <span className="text-[10px] sm:text-[11px] md:text-xs font-bold text-[var(--color-warning)]">
                    {getIntervalHint("hard", currentCard)}
                  </span>
                </>
              )}
            </button>

            {/* 3. Good (خوب) */}
            <button
              type="button"
              onClick={() => handleRating("good")}
              disabled={!isFlipped || isSubmitting || reviewMutation.isPending}
              aria-label="خوب"
              className="flex flex-col items-center justify-center py-2 sm:py-2.5 md:py-3 px-1 md:px-2 rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-secondary)] hover:bg-[var(--color-secondary-light)] transition-all group disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {selectedRating === "good" && isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--color-secondary-dark)]" />
              ) : (
                <>
                  <span className="text-xs md:text-sm font-bold text-[var(--color-text)] mb-0.5">خوب</span>
                  <span className="text-[10px] sm:text-[11px] md:text-xs font-bold text-[var(--color-secondary-dark)]">
                    {getIntervalHint("good", currentCard)}
                  </span>
                </>
              )}
            </button>

            {/* 4. Easy (آسان) */}
            <button
              type="button"
              onClick={() => handleRating("easy")}
              disabled={!isFlipped || isSubmitting || reviewMutation.isPending}
              aria-label="آسان"
              className="flex flex-col items-center justify-center py-2 sm:py-2.5 md:py-3 px-1 md:px-2 rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-success)] hover:bg-[var(--color-success-soft)] transition-all group disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {selectedRating === "easy" && isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--color-success)]" />
              ) : (
                <>
                  <span className="text-xs md:text-sm font-bold text-[var(--color-text)] mb-0.5">آسان</span>
                  <span className="text-[10px] sm:text-[11px] md:text-xs font-bold text-[var(--color-success)]">
                    {getIntervalHint("easy", currentCard)}
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Next Button */}
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={handleNextCard}
            disabled={(currentIndex >= effectiveCards.length - 1 && isFlipped) || isSubmitting || reviewMutation.isPending}
            aria-label="کارت بعدی"
            title="کارت بعدی"
            className="flex-shrink-0 w-11 h-11 md:w-12 md:h-12 !p-0 rounded-full"
          >
            <ChevronLeft className="w-5 h-5 text-[var(--color-text)]" />
          </Button>
        </div>
      </div>
    </div>
  );
}
