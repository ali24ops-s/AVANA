import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ArrowRight,
  RotateCcw,
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
import { AvaniAvatar } from "../brand/AvaniAvatar.js";
import { useCardSwipeFlip } from "../../hooks/useCardSwipeFlip.js";

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

  const effectiveCourseIdsKey = effectiveCourseIds.join(",");

  const userDailyNewLimit = useMemo(() => {
    if (limit !== undefined && limit > 0) return limit;
    try {
      const stored = localStorage.getItem("avana_flashcards_new_limit");
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return 40;
  }, [limit]);

  const [activeStudyTarget, setActiveStudyTarget] = useState<"due" | "new">(
    customMode === "new" ? "new" : "due",
  );

  // Fetch due cards for spaced-repetition review in normal course mode
  const dueQueueQuery = useQuery({
    queryKey: [
      "flashcards-queue",
      "due",
      organizationId,
      effectiveCourseIdsKey,
      documentIds,
    ],
    queryFn: () =>
      studyApi.getMultiReviewQueue(
        organizationId,
        effectiveCourseIds.length > 0 ? effectiveCourseIds : undefined,
        documentIds.length > 0 ? documentIds : undefined,
      ),
    enabled: Boolean(organizationId && !sessionId && mode === "normal"),
  });

  // Fetch daily new cards from completed lessons in normal course mode
  const newQueueQuery = useQuery({
    queryKey: [
      "flashcards-queue",
      "new",
      organizationId,
      effectiveCourseIdsKey,
      documentIds,
      userDailyNewLimit,
    ],
    queryFn: () =>
      studyApi.getCustomQueue(
        organizationId,
        "new",
        effectiveCourseIds.length > 0 ? effectiveCourseIds : undefined,
        userDailyNewLimit,
        aheadDays,
        documentIds.length > 0 ? documentIds : undefined,
        true, // onlyStudied = true
      ),
    enabled: Boolean(organizationId && !sessionId && mode === "normal"),
  });

  // Query for exam or custom modes
  const singleQueueQuery = useQuery({
    queryKey: [
      "flashcards-queue",
      "single",
      organizationId,
      effectiveCourseIdsKey,
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
      return studyApi.getCustomQueue(
        organizationId,
        customMode,
        effectiveCourseIds.length > 0 ? effectiveCourseIds : undefined,
        limit,
        aheadDays,
        documentIds.length > 0 ? documentIds : undefined,
      );
    },
    enabled: Boolean(organizationId && !sessionId && mode !== "normal"),
  });

  // Fetch summary to get total counts
  const summaryQuery = useQuery({
    queryKey: ["flashcard-summary", organizationId],
    queryFn: () => studyApi.getFlashcardSummary(organizationId),
    enabled: !!organizationId,
  });

  const scopedSummary = useMemo(() => {
    const rawCourses = summaryQuery.data?.courses as Array<{
      course_id?: string;
      id?: string;
      total_cards?: number;
      due_cards?: number;
      new_cards?: number;
      learning_cards?: number;
      overdue_cards?: number;
    }> | undefined;

    if (!rawCourses || rawCourses.length === 0) {
      const topTotal = summaryQuery.data?.total_cards ?? 0;
      const topDue = summaryQuery.data?.total_due ?? 0;
      const topNew = summaryQuery.data?.total_new ?? 0;
      return {
        total: topTotal,
        due: topDue,
        newCards: topNew,
        hasCourseData: false,
      };
    }

    const relevantCourses = effectiveCourseIds.length > 0
      ? rawCourses.filter((c) => effectiveCourseIds.includes(c.course_id || c.id || ""))
      : rawCourses;

    return {
      total: relevantCourses.reduce((sum, c) => sum + (c.total_cards || 0), 0),
      due: relevantCourses.reduce((sum, c) => sum + (c.due_cards || 0), 0),
      newCards: relevantCourses.reduce((sum, c) => sum + (c.new_cards || 0), 0),
      hasCourseData: true,
    };
  }, [summaryQuery.data, effectiveCourseIds]);

  const sessionCards = sessionQuery.data?.cards as FlashcardResource[] | undefined;
  const dueCardsList = useMemo(() => {
    if (sessionId) return sessionCards ?? [];
    if (mode === "normal") return dueQueueQuery.data?.due_cards ?? [];
    return singleQueueQuery.data?.due_cards ?? [];
  }, [sessionId, sessionCards, mode, dueQueueQuery.data, singleQueueQuery.data]);

  const newCardsList = useMemo(() => {
    if (sessionId || mode !== "normal") return [];
    return newQueueQuery.data?.due_cards ?? [];
  }, [sessionId, mode, newQueueQuery.data]);

  const [activeQueue, setActiveQueue] = useState<FlashcardResource[]>([]);

  // Guarantee clean state and queue when course scope or session parameters change
  useEffect(() => {
    setActiveQueue([]);
    setCurrentIndex(0);
    setResults([]);
    setCardEvaluations({});
    setIsCompleted(false);
    setIsFlipped(false);
    setFlipTimestamp(0);
    setSelectedRating(null);
  }, [effectiveCourseIdsKey, sessionId, mode, customMode, activeStudyTarget]);

  const handleSwitchTarget = useCallback((target: "due" | "new") => {
    setActiveStudyTarget(target);
    setActiveQueue([]);
    setCurrentIndex(0);
    setResults([]);
    setCardEvaluations({});
    setIsCompleted(false);
    setIsFlipped(false);
    setFlipTimestamp(0);
    setSelectedRating(null);
  }, []);

  const targetCards = useMemo(() => {
    if (sessionId || mode !== "normal") return dueCardsList;
    return activeStudyTarget === "new" ? newCardsList : dueCardsList;
  }, [sessionId, mode, activeStudyTarget, dueCardsList, newCardsList]);

  const dueCards = targetCards;

  useEffect(() => {
    if (dueCards.length > 0 && activeQueue.length === 0) {
      setActiveQueue(dueCards);
    }
  }, [dueCards, activeQueue.length]);

  const effectiveCards = activeQueue.length > 0 ? activeQueue : dueCards;
  const rawCurrentCard = effectiveCards[currentIndex] as FlashcardResource | undefined;
  const effectiveIsPreview =
    isPreview ||
    (dueQueueQuery.data as { is_preview?: boolean } | undefined)?.is_preview === true ||
    (newQueueQuery.data as { is_preview?: boolean } | undefined)?.is_preview === true ||
    (singleQueueQuery.data as { is_preview?: boolean } | undefined)?.is_preview === true;

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
      const isExam = mode === "exam";
      return studyApi.submitFlashcardReview(organizationId, targetCourseId, cardId, {
        rating,
        reaction_ms: reactionMs,
        is_exam_mode: isExam,
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
    setIsFlipped((prev) => {
      const next = !prev;
      if (next) {
        setFlipTimestamp((t) => (t > 0 ? t : Date.now()));
      }
      return next;
    });
  }, []);

  const { swipeProps } = useCardSwipeFlip({
    onFlip: handleFlip,
    enabled: Boolean(currentCard && !isCompleted && !isEditing && !isSubmitting),
  });

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

  const isDataLoading =
    (sessionId
      ? sessionQuery.isLoading
      : mode === "normal"
        ? (dueQueueQuery.isLoading || newQueueQuery.isLoading)
        : singleQueueQuery.isLoading) || summaryQuery.isLoading;

  const isDataError =
    (sessionId
      ? sessionQuery.isError
      : mode === "normal"
        ? (dueQueueQuery.isError || newQueueQuery.isError)
        : singleQueueQuery.isError) || summaryQuery.isError;

  const dataErrorMessage =
    (sessionId
      ? sessionQuery.error?.message
      : mode === "normal"
        ? (dueQueueQuery.error?.message || newQueueQuery.error?.message)
        : singleQueueQuery.error?.message) ||
    summaryQuery.error?.message ||
    "خطایی در دریافت کارت‌ها رخ داد.";

  const refetchAllQueues = () => {
    if (sessionId) {
      void sessionQuery.refetch();
    } else if (mode === "normal") {
      void dueQueueQuery.refetch();
      void newQueueQuery.refetch();
    } else {
      void singleQueueQuery.refetch();
    }
    void summaryQuery.refetch();
  };

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
              onClick={refetchAllQueues}
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

  // Segmented switcher component for dual-queue navigation
  const renderQueueSwitcher = () => {
    if (sessionId || mode !== "normal") return null;
    return (
      <div className="flex items-center justify-center p-1 bg-[var(--color-surface-hover)] rounded-xl border border-[var(--color-border)] mb-4 inline-flex gap-1">
        <button
          type="button"
          onClick={() => handleSwitchTarget("due")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeStudyTarget === "due"
              ? "bg-[var(--color-primary)] text-white shadow-xs"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>مرور کارت‌های آماده ({toPersianDigits(dueCardsList.length)})</span>
        </button>
        <button
          type="button"
          onClick={() => handleSwitchTarget("new")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeStudyTarget === "new"
              ? "bg-[var(--color-primary)] text-white shadow-xs"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>کارت‌های جدید امروز ({toPersianDigits(newCardsList.length)})</span>
        </button>
      </div>
    );
  };

  // Empty queue state
  if (dueCards.length === 0 && !isCompleted) {
    const totalCount = scopedSummary.total;

    // Course has no flashcards at all
    if (scopedSummary.hasCourseData && totalCount === 0) {
      return (
        <div className="w-full h-full h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
          <Card variant="solid" className="max-w-lg w-full p-6 sm:p-10 bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] text-center space-y-6 shadow-[var(--shadow-card)]">
            <div className="w-20 h-20 rounded-2xl bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] border border-[var(--color-border)] flex items-center justify-center mx-auto shadow-xs">
              <BookOpen className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-[var(--color-text)]">
                فلش‌کارتی یافت نشد
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-2 leading-relaxed">
                برای این دوره هنوز فلش‌کارتی ایجاد یا منتشر نشده است.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={refetchAllQueues}
                className="rounded-[10px]"
              >
                تازه‌سازی
              </Button>
              {onBack && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={onBack}
                  className="rounded-[10px]"
                >
                  بازگشت به درس‌ها
                </Button>
              )}
            </div>
          </Card>
        </div>
      );
    }

    // Normal mode empty state handling
    if (mode === "normal" && !sessionId) {
      const completedLessonsCount = newQueueQuery.data?.completed_lessons_count ?? 0;
      const totalNewInScope = newQueueQuery.data?.total_new_in_scope ?? 0;
      const learnedToday = newQueueQuery.data?.learned_today ?? 0;
      const remainingQuota = newQueueQuery.data?.remaining_quota ?? userDailyNewLimit;

      // 1. User is on "new" target, but no new cards
      if (activeStudyTarget === "new") {
        // Scenario A: User hasn't finished any lessons
        if (completedLessonsCount === 0) {
          return (
            <div className="w-full h-full h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
              <Card variant="solid" className="max-w-lg w-full p-6 sm:p-10 bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] text-center space-y-5 shadow-[var(--shadow-card)]">
                {renderQueueSwitcher()}
                <div className="w-20 h-20 rounded-2xl bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] border border-[var(--color-border)] flex items-center justify-center mx-auto shadow-xs">
                  <BookOpen className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[var(--color-text)]">
                    هنوز درسی را به پایان نرسانده‌اید
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2 leading-relaxed">
                    برای فعال شدن و یادگیری فلش‌کارت‌های جدید، ابتدا درس‌های این دوره را در تب «درسنامه» مطالعه کنید تا کارت‌های مربوط به هر درس باز شوند.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  {onBack && (
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      onClick={onBack}
                      className="rounded-[10px] gap-2"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>مشاهده درس‌های دوره</span>
                    </Button>
                  )}
                  {dueCardsList.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="md"
                      onClick={() => handleSwitchTarget("due")}
                      className="rounded-[10px] gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>مرور کارت‌های آماده ({toPersianDigits(dueCardsList.length)})</span>
                    </Button>
                  )}
                </div>
              </Card>
            </div>
          );
        }

        // Scenario B: Daily quota reached today
        if (remainingQuota === 0 || (learnedToday >= userDailyNewLimit && learnedToday > 0)) {
          return (
            <div className="w-full h-full h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
              <Card variant="solid" className="max-w-lg w-full p-6 sm:p-10 bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] text-center space-y-5 shadow-[var(--shadow-card)]">
                {renderQueueSwitcher()}
                <div className="w-20 h-20 rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary)] border border-[var(--color-primary-muted)] flex items-center justify-center mx-auto shadow-xs">
                  <Check className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[var(--color-text)]">
                    سهمیه کارت‌های جدید امروز تکمیل شد
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2 leading-relaxed">
                    شما امروز {toPersianDigits(learnedToday)} کارت جدید مطالعه کرده‌اید و به سقف مجاز روزانه ({toPersianDigits(userDailyNewLimit)} کارت) رسیده‌اید. سهمیه جدید فردا در دسترس شما خواهد بود.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  {dueCardsList.length > 0 ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      onClick={() => handleSwitchTarget("due")}
                      className="rounded-[10px] gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>مرور کارت‌های آماده ({toPersianDigits(dueCardsList.length)})</span>
                    </Button>
                  ) : onBack ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="md"
                      onClick={onBack}
                      className="rounded-[10px]"
                    >
                      بازگشت به درس‌ها
                    </Button>
                  ) : null}
                </div>
              </Card>
            </div>
          );
        }

        // Scenario C: All cards from studied lessons already learned
        if (totalNewInScope === 0 && completedLessonsCount > 0) {
          return (
            <div className="w-full h-full h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
              <Card variant="solid" className="max-w-lg w-full p-6 sm:p-10 bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] text-center space-y-5 shadow-[var(--shadow-card)]">
                {renderQueueSwitcher()}
                <div className="w-20 h-20 rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary)] border border-[var(--color-primary-muted)] flex items-center justify-center mx-auto shadow-xs">
                  <Sparkles className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[var(--color-text)]">
                    همه کارت‌های درس‌های مطالعه‌شده را یاد گرفته‌اید!
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2 leading-relaxed">
                    تمامی فلش‌کارت‌های درس‌هایی که تاکنون به اتمام رسانده‌اید وارد چرخه مرور شده‌اند. برای یادگیری کارت‌های جدید بیشتر، درس‌های بعدی دوره را مطالعه کنید.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  {onBack && (
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      onClick={onBack}
                      className="rounded-[10px] gap-2"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>ادامه یادگیری درس‌ها</span>
                    </Button>
                  )}
                  {dueCardsList.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="md"
                      onClick={() => handleSwitchTarget("due")}
                      className="rounded-[10px] gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>مرور کارت‌های آماده ({toPersianDigits(dueCardsList.length)})</span>
                    </Button>
                  )}
                </div>
              </Card>
            </div>
          );
        }
      }

      // 2. User is on "due" target, but no due cards
      if (activeStudyTarget === "due") {
        const newCardsCount = scopedSummary.newCards > 0 ? scopedSummary.newCards : newCardsList.length;
        if (newCardsCount > 0) {
          return (
            <div className="w-full h-full h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
              <Card variant="solid" className="max-w-lg w-full p-6 sm:p-10 bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] text-center space-y-6 shadow-[var(--shadow-card)]">
                {renderQueueSwitcher()}
                <div className="w-20 h-20 rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary)] border border-[var(--color-primary-muted)] flex items-center justify-center mx-auto shadow-xs">
                  <Sparkles className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[var(--color-text)]">
                    فلش‌کارت‌های جدید آماده یادگیری
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2 leading-relaxed">
                    شما {toPersianDigits(newCardsCount)} فلش‌کارت جدید در این دوره دارید که هنوز مطالعه نکرده‌اید. می‌توانید یادگیری را از همین‌جا شروع کنید.
                  </p>
                </div>
                <div className="p-4 bg-[var(--color-surface-hover)] rounded-[12px] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                  تعداد کارت‌های جدید قابل مطالعه:{" "}
                  <span className="font-bold text-[var(--color-primary)] text-sm">{toPersianDigits(newCardsCount)}</span>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={() => handleSwitchTarget("new")}
                    className="rounded-[10px] gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>شروع یادگیری فلش‌کارت‌های جدید</span>
                  </Button>
                  {onBack && (
                    <Button
                      type="button"
                      variant="outline"
                      size="md"
                      onClick={onBack}
                      className="rounded-[10px]"
                    >
                      بازگشت به درس‌ها
                    </Button>
                  )}
                </div>
              </Card>
            </div>
          );
        }
      }
    }

    // Default empty queue state (both due and new queues are zero, or non-normal mode)
    return (
      <div className="w-full h-full h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
        <Card variant="solid" className="max-w-lg w-full p-6 sm:p-10 bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] text-center space-y-6 shadow-[var(--shadow-card)]">
          {renderQueueSwitcher()}
          <div className="w-20 h-20 rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary)] border border-[var(--color-primary-muted)] flex items-center justify-center mx-auto shadow-xs">
            <AvaniAvatar variant="learning" size={60} alt="آوانی" asInlineSvg={true} />
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
              onClick={refetchAllQueues}
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
          <div className="w-24 h-24 rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] border border-[var(--color-primary-muted)] flex items-center justify-center mx-auto shadow-sm">
            <AvaniAvatar variant="celebrating" size={76} alt="آوانی" asInlineSvg={true} />
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

          <div className="flex flex-wrap items-center justify-center gap-3">
            {mode === "normal" && !sessionId && activeStudyTarget === "due" && newCardsList.length > 0 && (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => handleSwitchTarget("new")}
                className="rounded-[10px] gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>یادگیری {toPersianDigits(newCardsList.length)} کارت جدید امروز</span>
              </Button>
            )}
            {mode === "normal" && !sessionId && activeStudyTarget === "new" && dueCardsList.length > 0 && (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => handleSwitchTarget("due")}
                className="rounded-[10px] gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>مرور {toPersianDigits(dueCardsList.length)} کارت آماده</span>
              </Button>
            )}
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
                refetchAllQueues();
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
            <h2 className="font-bold text-xs sm:text-sm md:text-base text-[var(--color-text)] truncate max-w-[90px] xs:max-w-[120px] sm:max-w-xs">
              {currentCourseInfo ? currentCourseInfo.title : "مرور فلش‌کارت‌ها"}
            </h2>
            {effectiveIsPreview && (
              <Badge variant="info" size="sm" className="hidden md:inline-flex gap-1 text-[10px] sm:text-xs">
                <Sparkles className="w-3 h-3 text-teal-400" />
                پیش‌نمایش رایگان (۵ کارت)
              </Badge>
            )}
            {mode === "normal" && activeStudyTarget === "new" && (
              <Badge variant="info" size="sm" className="hidden sm:inline-flex gap-1 text-[10px] sm:text-xs">
                <Sparkles className="w-3 h-3 text-amber-500" />
                کارت جدید امروز
              </Badge>
            )}
            {mode === "normal" && activeStudyTarget === "due" && (
              <Badge variant="secondary" size="sm" className="hidden sm:inline-flex gap-1 text-[10px] sm:text-xs">
                <RotateCcw className="w-3 h-3" />
                مرور فاصله‌دار
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
          <div className="flex flex-1 justify-center max-w-[90px] xs:max-w-[130px] sm:max-w-xs md:max-w-sm mx-1 sm:mx-2 items-center gap-1.5 sm:gap-3 min-w-0">
            <span className="text-[10px] sm:text-xs text-[var(--color-text-muted)] whitespace-nowrap font-medium font-mono">
              {toPersianDigits(currentIndex + 1)}/{toPersianDigits(effectiveCards.length)}
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
        <div className="inline-flex items-center gap-1 sm:gap-2.5 px-1.5 sm:px-3 py-1 bg-[var(--color-surface-warm)] rounded-full border border-[var(--color-border)] shadow-xs text-[10px] sm:text-xs shrink-0">
          <div className="flex items-center gap-0.5 sm:gap-1 border-e border-[var(--color-border)] pe-1 sm:pe-2">
            <span className="text-[var(--color-text-muted)] hidden md:inline">دیده‌نشده:</span>
            <span className="font-bold text-[var(--color-primary)]">{toPersianDigits(unseenCount)}</span>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 border-e border-[var(--color-border)] pe-1 sm:pe-2">
            <span className="text-[var(--color-text-muted)] hidden md:inline">مرور مجدد:</span>
            <span className="font-bold text-[var(--color-error)]">{toPersianDigits(reviewCount)}</span>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <span className="text-[var(--color-text-muted)] hidden md:inline">پایان‌یافته:</span>
            <span className="font-bold text-[var(--color-success)]">{toPersianDigits(finishedCount)}</span>
          </div>
        </div>
      </header>

      {/* Normal Course Dual Queue Switcher Sub-Header */}
      {mode === "normal" && !sessionId && (
        <div className="w-full px-3 sm:px-6 py-1.5 bg-[var(--color-surface-warm)] border-b border-[var(--color-border)] flex items-center justify-between gap-2 shrink-0 text-xs">
          <div className="flex items-center gap-1.5 bg-[var(--color-surface)] p-0.5 rounded-lg border border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => handleSwitchTarget("due")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                activeStudyTarget === "due"
                  ? "bg-[var(--color-primary)] text-white shadow-xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              <span>مرور کارت‌های آماده ({toPersianDigits(dueCardsList.length)})</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchTarget("new")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                activeStudyTarget === "new"
                  ? "bg-[var(--color-primary)] text-white shadow-xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>کارت‌های جدید امروز ({toPersianDigits(newCardsList.length)})</span>
            </button>
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] hidden sm:block">
            {activeStudyTarget === "new"
              ? "فقط از درس‌های مطالعه‌شده"
              : "بر اساس الگوریتم لایتنر فاصله‌دار"}
          </div>
        </div>
      )}

      {/* Main Review Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 z-10 w-full max-w-4xl mx-auto min-h-0 overflow-hidden gap-2.5 sm:gap-3.5">
        {reviewMutation.isError && (
          <div className="w-full mb-1 sm:mb-2 shrink-0">
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
            {...swipeProps}
            className="w-full flex-1 flex flex-col min-h-0 max-h-[460px] md:max-h-[480px] bg-[var(--color-surface)] rounded-[16px] sm:rounded-[18px] border border-[var(--color-border)] shadow-xs overflow-hidden transition-all duration-300 relative cursor-pointer group focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
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
            <div className="flex-1 flex flex-col justify-center items-center text-center w-full px-4 sm:px-8 md:px-12 py-3 sm:py-4 md:py-5 overflow-y-auto min-h-0 [perspective:1000px]">
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
                <div className="w-full flex-1 flex flex-col justify-center items-center my-auto transition-transform duration-300 ease-out">
                  {/* Question View */}
                  <div
                    className={`w-full flex-col items-center justify-center my-auto transition-all duration-300 ease-out ${
                      isFlipped
                        ? "hidden opacity-0 scale-95 [transform:rotateY(40deg)]"
                        : "flex opacity-100 scale-100 [transform:rotateY(0deg)]"
                    }`}
                  >
                    <h3 className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-[var(--color-text)] leading-relaxed max-w-3xl text-center break-words">
                      <RichContent content={currentCard.question} inline />
                    </h3>
                  </div>

                  {/* Answer View */}
                  <div
                    className={`w-full flex-col items-center justify-center my-auto space-y-3 sm:space-y-4 transition-all duration-300 ease-out ${
                      isFlipped
                        ? "flex opacity-100 scale-100 [transform:rotateY(0deg)]"
                        : "hidden opacity-0 scale-95 [transform:rotateY(-40deg)]"
                    }`}
                  >
                    <div className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-[var(--color-text)] leading-relaxed max-w-3xl text-center break-words">
                      <RichContent content={currentCard.answer} inline />
                    </div>
                    {currentCard.explanation && (
                      <div className="w-full max-w-3xl p-3 sm:p-3.5 bg-[var(--color-surface-warm)] rounded-[12px] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed text-right break-words">
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
                </div>
              )}
            </div>

            {/* Clean Bottom Touch Prompt with Navigation */}
            <div
              className="flex items-center justify-between gap-1 sm:gap-2 py-1.5 sm:py-2 px-2 sm:px-4 bg-[var(--color-surface-warm)]/30 border-t border-[var(--color-border)] w-full shrink-0 select-none"
              dir="ltr"
            >
              {/* Previous Button (Left: ← قبلی) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevCard();
                }}
                disabled={currentIndex === 0 || isSubmitting || reviewMutation.isPending}
                aria-label="کارت قبلی"
                title="کارت قبلی"
                className="flex items-center justify-center min-w-[36px] min-h-[36px] w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:pointer-events-none transition-colors shrink-0 shadow-2xs touch-manipulation cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-5 h-5 text-[var(--color-text)]" />
              </button>

              {/* Center Touch Prompt */}
              <div
                className="flex-1 flex justify-center items-center gap-1.5 sm:gap-2 text-[10px] xs:text-[11px] sm:text-xs text-[var(--color-text-muted)] min-w-0 px-1 text-center"
                dir="rtl"
              >
                {!isFlipped ? (
                  <>
                    <Pointer className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0 hidden xs:inline-block" />
                    <span className="truncate sm:overflow-visible">برای مشاهده پاسخ کلیک کنید یا کلید Space را فشار دهید</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0 hidden xs:inline-block" />
                    <span className="truncate sm:overflow-visible text-[var(--color-primary)] font-medium">پاسخ نمایان شد — سطح یادگیری خود را انتخاب کنید</span>
                  </>
                )}
              </div>

              {/* Next Button (Right: → بعدی) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextCard();
                }}
                disabled={(currentIndex >= effectiveCards.length - 1 && isFlipped) || isSubmitting || reviewMutation.isPending}
                aria-label="کارت بعدی"
                title="کارت بعدی"
                className="flex items-center justify-center min-w-[36px] min-h-[36px] w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:pointer-events-none transition-colors shrink-0 shadow-2xs touch-manipulation cursor-pointer active:scale-95"
              >
                <ChevronRight className="w-5 h-5 text-[var(--color-text)]" />
              </button>
            </div>
          </div>
        )}

        {/* Spaced Repetition Review Controls */}
        <div className="w-full max-w-4xl flex items-center shrink-0 z-20">
          {/* 4-Button SRS Rating Grid */}
          <div
            className={`w-full flex-1 grid grid-cols-4 gap-1.5 sm:gap-2 md:gap-3 transition-opacity duration-300 ${
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
              className="flex flex-col items-center justify-center min-h-[48px] py-1.5 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-2 rounded-none sm:rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-error)] hover:bg-[var(--color-error-soft)] transition-all group disabled:opacity-50 cursor-pointer shadow-xs active:scale-[0.98] touch-manipulation"
            >
              {selectedRating === "again" && isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--color-error)]" />
              ) : (
                <>
                  <span className="text-xs sm:text-xs md:text-sm font-bold text-[var(--color-text)] mb-0.5 whitespace-nowrap">دوباره</span>
                  <span className="text-[10px] sm:text-[11px] md:text-xs font-bold text-[var(--color-error)] whitespace-nowrap">
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
              className="flex flex-col items-center justify-center min-h-[48px] py-1.5 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-2 rounded-none sm:rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-warning)] hover:bg-[var(--color-warning-soft)] transition-all group disabled:opacity-50 cursor-pointer shadow-xs active:scale-[0.98] touch-manipulation"
            >
              {selectedRating === "hard" && isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--color-warning)]" />
              ) : (
                <>
                  <span className="text-xs sm:text-xs md:text-sm font-bold text-[var(--color-text)] mb-0.5 whitespace-nowrap">سخت</span>
                  <span className="text-[10px] sm:text-[11px] md:text-xs font-bold text-[var(--color-warning)] whitespace-nowrap">
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
              className="flex flex-col items-center justify-center min-h-[48px] py-1.5 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-2 rounded-none sm:rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-secondary)] hover:bg-[var(--color-secondary-light)] transition-all group disabled:opacity-50 cursor-pointer shadow-xs active:scale-[0.98] touch-manipulation"
            >
              {selectedRating === "good" && isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--color-secondary-dark)]" />
              ) : (
                <>
                  <span className="text-xs sm:text-xs md:text-sm font-bold text-[var(--color-text)] mb-0.5 whitespace-nowrap">خوب</span>
                  <span className="text-[10px] sm:text-[11px] md:text-xs font-bold text-[var(--color-secondary-dark)] whitespace-nowrap">
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
              className="flex flex-col items-center justify-center min-h-[48px] py-1.5 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-2 rounded-none sm:rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-success)] hover:bg-[var(--color-success-soft)] transition-all group disabled:opacity-50 cursor-pointer shadow-xs active:scale-[0.98] touch-manipulation"
            >
              {selectedRating === "easy" && isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--color-success)]" />
              ) : (
                <>
                  <span className="text-xs sm:text-xs md:text-sm font-bold text-[var(--color-text)] mb-0.5 whitespace-nowrap">آسان</span>
                  <span className="text-[10px] sm:text-[11px] md:text-xs font-bold text-[var(--color-success)] whitespace-nowrap">
                    {getIntervalHint("easy", currentCard)}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
