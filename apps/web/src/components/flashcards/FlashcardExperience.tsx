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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import { useStudySessionTracker } from "../../hooks/useStudySessionTracker.js";
import type { FlashcardResource, FlashcardRating } from "@avana/contracts";
import { nextReviewInterval } from "@avana/domain";

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

  // Initialize index & results when resuming a persistent study session
  useEffect(() => {
    if (sessionId && sessionQuery.data?.session && !hasInitializedSession) {
      const session = sessionQuery.data.session;
      const initialIdx = Number(
        session.current_index ??
        (session as any).currentIndex ??
        0,
      );
      
      let targetIdx = initialIdx;
      // If we have full snapshot cards, calculate target index based on non-deleted mapped cards
      const allSessionCards = sessionQuery.data.session_cards || [];
      if (allSessionCards.length > 0 && sessionCards) {
        let validBefore = 0;
        for (let i = 0; i < Math.min(initialIdx, allSessionCards.length); i++) {
          if (allSessionCards[i].flashcard_id && sessionCards.some((c: any) => c.id === allSessionCards[i].flashcard_id)) {
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
          reactionMs: (sc as any).reaction_ms ?? (sc as any).reactionMs ?? 0,
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
            const foundIdx = allSessionCards.findIndex((sc: any) => sc.flashcard_id === nextCard.id);
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
        <Loader2 className="w-10 h-10 animate-spin text-[#14b8a6]" />
        <p className="text-sm text-[#94a3b8] font-bold">
          در حال دریافت کارت‌های مرور...
        </p>
      </div>
    );
  }

  // Error state
  if (isDataError) {
    console.error("[FLASHCARD_RESUME_DEBUG]", {
      sessionId,
      organizationId,
      sessionQueryError: sessionQuery.error,
      queueQueryError: queueQuery.error,
    });
    return (
      <div className="max-w-md mx-auto my-16 p-8 glass-panel rounded-3xl border border-[#94a3b8]/20 text-center space-y-5 shadow-2xl">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <h3 className="text-lg font-bold text-[#e0e6ed]">
          خطا در بارگذاری فلش‌کارت‌ها
        </h3>
        <p className="text-xs text-[#94a3b8]">
          {dataErrorMessage}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              if (sessionId) {
                void sessionQuery.refetch();
              } else {
                void queueQuery.refetch();
              }
              void summaryQuery.refetch();
            }}
            className="px-5 py-2.5 bg-[#14b8a6] hover:bg-[#0f766e] text-white rounded-xl text-xs font-bold transition-all shadow-md"
          >
            تلاش مجدد
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-5 py-2.5 bg-[#1e293b] hover:bg-[#334155] text-[#e0e6ed] border border-[#475569]/40 rounded-xl text-xs font-bold transition-all"
            >
              بازگشت به داشبورد
            </button>
          )}
        </div>
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
      <div className="max-w-lg mx-auto my-16 p-10 glass-panel rounded-3xl border border-[#14b8a6]/20 text-center space-y-6 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-[#14b8a6]/20 text-[#14b8a6] border border-[#14b8a6]/30 flex items-center justify-center mx-auto shadow-inner">
          <Sparkles className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-[#e0e6ed]">
            مرور کارت‌ها به پایان رسید!
          </h3>
          <p className="text-xs text-[#94a3b8] mt-2 leading-relaxed">
            در حال حاضر کارتی برای مرور زمان‌بندی نشده است.
          </p>
        </div>
        <div className="p-4 bg-[#0f172a]/60 rounded-2xl border border-[#334155]/40 text-xs text-[#94a3b8]">
          تعداد کل فلش‌کارت‌های این محدوده:{" "}
          <span className="font-bold text-[#14b8a6] text-sm">{totalCount}</span>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              void queueQuery.refetch();
              void summaryQuery.refetch();
            }}
            className="px-5 py-2.5 bg-[#1e293b] hover:bg-[#334155] text-[#e0e6ed] border border-[#475569]/40 rounded-xl text-xs font-bold transition-all"
          >
            تازه‌سازی صف مرور
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-6 py-2.5 bg-[#14b8a6] hover:bg-[#0f766e] text-white rounded-xl text-xs font-bold transition-all shadow-lg"
            >
              بازگشت به داشبورد
            </button>
          )}
        </div>
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
      <div className="max-w-xl mx-auto my-12 p-8 glass-panel rounded-3xl border border-[#14b8a6]/30 text-center space-y-6 shadow-2xl">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#14b8a6] to-[#8455ef] flex items-center justify-center mx-auto text-white shadow-xl">
          <Award className="w-10 h-10" />
        </div>

        <div>
          <h3 className="text-2xl font-extrabold text-[#e0e6ed]">
            مرور تمام شد 🎉
          </h3>
          <p className="text-xs text-[#94a3b8] mt-2 leading-relaxed">
            جلسه مرور با موفقیت به پایان رسید!
          </p>
        </div>

        <div className="p-5 bg-[#0f172a]/70 rounded-2xl border border-[#334155]/50 text-xs space-y-4">
          <div className="text-xl font-black text-[#14b8a6] pb-3 border-b border-[#334155]/50">
            {results.length} کارت مرور شد
          </div>

          <div className="grid grid-cols-4 gap-2 text-center py-1">
            <div className="bg-red-500/10 p-2.5 rounded-xl border border-red-500/30">
              <span className="text-xs font-bold text-red-400">Again</span>
              <p className="text-base font-black text-red-300 mt-0.5">{againCount}</p>
            </div>
            <div className="bg-orange-500/10 p-2.5 rounded-xl border border-orange-500/30">
              <span className="text-xs font-bold text-orange-400">Hard</span>
              <p className="text-base font-black text-orange-300 mt-0.5">{hardCount}</p>
            </div>
            <div className="bg-[#a78bfa]/10 p-2.5 rounded-xl border border-[#a78bfa]/30">
              <span className="text-xs font-bold text-[#a78bfa]">Good</span>
              <p className="text-base font-black text-[#a78bfa] mt-0.5">{goodCount}</p>
            </div>
            <div className="bg-[#14b8a6]/10 p-2.5 rounded-xl border border-[#14b8a6]/30">
              <span className="text-xs font-bold text-[#14b8a6]">Easy</span>
              <p className="text-base font-black text-[#14b8a6] mt-0.5">{easyCount}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 text-right">
            <div>
              <span className="text-[#94a3b8]">دقت پاسخ‌دهی:</span>{" "}
              <span className="font-bold text-[#e0e6ed]">{accuracy}%</span>
            </div>
            <div>
              <span className="text-[#94a3b8]">زمان مطالعه:</span>{" "}
              <span className="font-bold text-[#e0e6ed]">
                {durationMinutes > 0 ? `${durationMinutes} دقیقه` : `${durationSeconds} ثانیه`}
              </span>
            </div>
            <div>
              <span className="text-[#94a3b8]">کارت‌های ضعیف:</span>{" "}
              <span className="font-bold text-red-400">{againCount}</span>
            </div>
            <div>
              <span className="text-[#94a3b8]">کارت‌های باقی‌مانده:</span>{" "}
              <span className="font-bold text-[#e0e6ed]">
                {summaryQuery.data?.total_due || 0}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => {
              setIsCompleted(false);
              setCurrentIndex(0);
              setIsFlipped(false);
              setResults([]);
              void queueQuery.refetch();
            }}
            className="px-5 py-2.5 bg-[#1e293b] hover:bg-[#334155] text-[#e0e6ed] rounded-xl text-xs font-bold border border-[#475569]/40 flex items-center gap-2 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            <span>تکرار جلسه</span>
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-6 py-2.5 bg-[#14b8a6] hover:bg-[#0f766e] text-white rounded-xl text-xs font-bold transition-all shadow-lg"
            >
              بازگشت به داشبورد
            </button>
          )}
        </div>
      </div>
    );
  }

  // Active review session
  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-hidden bg-[#0b1116] text-[#e0e6ed]">
      {/* Ambient Background Glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#14b8a6]/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#a78bfa]/10 rounded-full blur-[100px]" />
      </div>

      {/* Review Header */}
      <header className="w-full px-4 md:px-16 py-6 z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-xl md:text-2xl text-[#e0e6ed]">
              {currentCourseInfo ? currentCourseInfo.title : "Pharmacology - Cardiovascular"}
            </h2>
            {mode === "exam" && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                مرور فشرده
              </span>
            )}
            {mode === "custom" && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#a78bfa]/20 text-[#a78bfa] border border-[#a78bfa]/30">
                مطالعه سفارشی
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs text-[#a78bfa] font-medium">مرور فلش‌کارت‌ها</p>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1 text-[11px] text-[#94a3b8] hover:text-[#e0e6ed] transition-colors"
              >
                <ArrowRight className="w-3 h-3" />
                <span>خروج از مرور</span>
              </button>
            )}
          </div>
        </div>

        {/* Compact 3-Stats Header Pill (Replaces Today's Progress) */}
        <div className="inline-flex items-center gap-4 px-4 py-2 bg-[#0f172a]/70 rounded-full border border-[#334155]/40 glass-panel shadow-sm text-xs">
          <div className="flex items-center gap-1.5 border-l border-[#334155]/40 pl-3">
            <span className="text-[#94a3b8]">دیده‌نشده:</span>
            <span className="font-bold text-[#a78bfa]">{unseenCount}</span>
          </div>
          <div className="flex items-center gap-1.5 border-l border-[#334155]/40 pl-3">
            <span className="text-[#94a3b8]">مرور مجدد:</span>
            <span className="font-bold text-red-400">{reviewCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#94a3b8]">پایان‌یافته:</span>
            <span className="font-bold text-[#14b8a6]">{finishedCount}</span>
          </div>
        </div>
      </header>

      {reviewMutation.isError && (
        <div className="max-w-3xl mx-auto w-full px-4 z-10 mb-3">
          <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/30 text-xs text-red-400 flex items-center gap-2 justify-center">
            <AlertCircle className="w-4 h-4" />
            <span>خطا در ثبت بازخورد. لطفاً دوباره تلاش کنید.</span>
          </div>
        </div>
      )}

      {/* Tier 2 Surface: Review Canvas Container Surface */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 z-10 w-full max-w-4xl mx-auto">
        <div className="w-full p-4 md:p-6 bg-[#0f172a]/50 rounded-3xl border border-[#334155]/40 shadow-2xl glass-panel flex flex-col items-center justify-center gap-4">
          
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
                    className={`flip-card-front absolute inset-0 w-full h-full p-4 md:p-8 flex flex-col justify-between items-center text-center bg-transparent border-0 shadow-none transition-opacity duration-300 ${
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
                          <label className="text-xs text-[#14b8a6] font-bold">متن سوال:</label>
                          <textarea
                            value={editQuestion}
                            onChange={(e) => setEditQuestion(e.target.value)}
                            className="w-full p-2.5 bg-[#0f172a] border border-[#334155] rounded-xl text-xs md:text-sm text-[#e0e6ed] focus:outline-none focus:border-[#14b8a6] resize-none h-20 leading-relaxed font-vazirmatn"
                            dir="rtl"
                          />
                        </div>
                        <div className="w-full text-right space-y-1">
                          <label className="text-xs text-[#14b8a6] font-bold">متن پاسخ:</label>
                          <textarea
                            value={editAnswer}
                            onChange={(e) => setEditAnswer(e.target.value)}
                            className="w-full p-2.5 bg-[#0f172a] border border-[#334155] rounded-xl text-xs md:text-sm text-[#e0e6ed] focus:outline-none focus:border-[#14b8a6] resize-none h-20 leading-relaxed font-vazirmatn"
                            dir="rtl"
                          />
                        </div>
                        <div className="flex items-center justify-center gap-3 pt-1">
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#14b8a6] text-[#0f172a] font-bold text-xs hover:bg-[#14b8a6]/90 transition-all shadow-md cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>ثبت تغییرات</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#1e293b] text-[#cbd5e1] border border-[#334155] font-bold text-xs hover:bg-[#334155]/50 transition-all cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>انصراف</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col justify-center items-center text-center w-full my-auto px-4 py-4">
                        <h3 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#e0e6ed] leading-relaxed max-w-2xl text-center">
                          {currentCard.question}
                        </h3>
                      </div>
                    )}

                    {/* Bottom Touch Prompt Footer */}
                    <div className="flex justify-center items-center gap-2 text-xs text-[#94a3b8] pt-2.5 border-t border-[#334155]/20 w-full flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                      <Pointer className="w-4 h-4 text-[#14b8a6]" />
                      <span>برای مشاهده پاسخ کلیک کنید</span>
                    </div>
                  </div>

                  {/* Back (Answer Side) - Frameless Floating Content */}
                  <div
                    className={`flip-card-back absolute inset-0 w-full h-full p-4 md:p-8 flex flex-col justify-between items-center text-center bg-transparent border-0 shadow-none transition-opacity duration-300 ${
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
                          <label className="text-xs text-[#14b8a6] font-bold">متن سوال:</label>
                          <textarea
                            value={editQuestion}
                            onChange={(e) => setEditQuestion(e.target.value)}
                            className="w-full p-2.5 bg-[#0f172a] border border-[#334155] rounded-xl text-xs md:text-sm text-[#e0e6ed] focus:outline-none focus:border-[#14b8a6] resize-none h-20 leading-relaxed font-vazirmatn"
                            dir="rtl"
                          />
                        </div>
                        <div className="w-full text-right space-y-1">
                          <label className="text-xs text-[#14b8a6] font-bold">متن پاسخ:</label>
                          <textarea
                            value={editAnswer}
                            onChange={(e) => setEditAnswer(e.target.value)}
                            className="w-full p-2.5 bg-[#0f172a] border border-[#334155] rounded-xl text-xs md:text-sm text-[#e0e6ed] focus:outline-none focus:border-[#14b8a6] resize-none h-20 leading-relaxed font-vazirmatn"
                            dir="rtl"
                          />
                        </div>
                        <div className="flex items-center justify-center gap-3 pt-1">
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#14b8a6] text-[#0f172a] font-bold text-xs hover:bg-[#14b8a6]/90 transition-all shadow-md cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>ثبت تغییرات</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#1e293b] text-[#cbd5e1] border border-[#334155] font-bold text-xs hover:bg-[#334155]/50 transition-all cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>انصراف</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col justify-center items-center text-center w-full my-auto px-4 py-4 space-y-3">
                        <p className="text-base md:text-lg lg:text-xl font-semibold text-[#e0e6ed] leading-relaxed max-w-2xl text-center">
                          {currentCard.answer}
                        </p>
                        {currentCard.explanation && (
                          <div className="w-full max-w-2xl p-3.5 bg-[#0f172a]/80 rounded-2xl border border-[#334155]/60 text-xs md:text-sm text-[#94a3b8] space-y-1.5 text-right">
                            <div className="font-bold text-[#14b8a6] flex items-center gap-1.5 justify-start">
                              <Lightbulb className="w-4 h-4 text-[#14b8a6]" />
                              <span>توضیح تکمیلی:</span>
                            </div>
                            <p className="leading-relaxed text-[#cbd5e1]">{currentCard.explanation}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bottom Status Hint */}
                    <div className="flex justify-center items-center gap-2 text-xs text-[#14b8a6] pt-2.5 border-t border-[#14b8a6]/20 w-full flex-shrink-0 font-medium">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>پاسخ ثبت آماده ارزیابی است</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* External Control Bar Below Flashcard Box */}
              <div className="w-full max-w-3xl flex items-center justify-between px-2 py-1 flex-shrink-0 gap-2 z-20">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#14b8a6]/15 text-[#14b8a6] border border-[#14b8a6]/30 text-xs font-semibold">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{currentCourseInfo ? currentCourseInfo.title : "فلش‌کارت"}</span>
                </span>

                {/* Edit Card Button */}
                <button
                  type="button"
                  onClick={handleStartEdit}
                  aria-label="ویرایش کارت"
                  title="ویرایش کارت"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#1e293b] text-[#e0e6ed] border border-[#334155]/60 hover:bg-[#14b8a6]/20 hover:text-[#14b8a6] hover:border-[#14b8a6]/40 transition-all text-xs font-medium cursor-pointer shadow-sm z-20"
                >
                  <Pencil className="w-3.5 h-3.5 text-[#14b8a6]" />
                  <span>ویرایش کارت</span>
                </button>

                <span className="text-xs text-[#94a3b8] font-medium bg-[#1e293b]/60 px-3 py-1 rounded-full border border-[#334155]/30">
                  {isFlipped ? "پاسخ" : "سوال"}
                </span>
              </div>
            </>
          )}

          {/* Spaced Repetition Controls */}
          <div className="w-full max-w-3xl flex flex-col gap-3">
            {/* Priority Markers */}
            <div className="flex justify-center items-center gap-4 p-3 glass-panel rounded-xl border border-[#334155]/30">
              <span className="text-xs text-[#94a3b8] self-center ml-2">نشانی‌گذاری اولویت:</span>
              <button
                type="button"
                onClick={() => togglePriority("high")}
                className={`w-7 h-7 rounded-full border transition-transform hover:scale-110 ${
                  currentCard && cardPriorities[currentCard.id] === "high"
                    ? "bg-red-500 border-red-400 scale-110"
                    : "bg-red-500/40 border-red-500/60"
                }`}
                aria-label="اولویت بالا"
                title="اولویت بالا"
              />
              <button
                type="button"
                onClick={() => togglePriority("medium")}
                className={`w-7 h-7 rounded-full border transition-transform hover:scale-110 ${
                  currentCard && cardPriorities[currentCard.id] === "medium"
                    ? "bg-orange-500 border-orange-400 scale-110"
                    : "bg-orange-500/40 border-orange-500/60"
                }`}
                aria-label="اولویت متوسط"
                title="اولویت متوسط"
              />
              <button
                type="button"
                onClick={() => togglePriority("low")}
                className={`w-7 h-7 rounded-full border transition-transform hover:scale-110 ${
                  currentCard && cardPriorities[currentCard.id] === "low"
                    ? "bg-[#a78bfa] border-[#a78bfa] scale-110"
                    : "bg-[#a78bfa]/40 border-[#a78bfa]/60"
                }`}
                aria-label="اولویت پایین"
                title="اولویت پایین"
              />
            </div>

            {/* Rating & Navigation Row */}
            <div className="flex items-center gap-3">
              {/* Previous Button (Icon Only - RTL ChevronRight) */}
              <button
                type="button"
                onClick={handlePrevCard}
                disabled={currentIndex === 0}
                aria-label="کارت قبلی"
                title="کارت قبلی"
                className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-[#1e293b] border border-[#334155]/40 text-[#e0e6ed] hover:bg-[#14b8a6]/20 hover:text-[#14b8a6] transition-all disabled:opacity-30 disabled:pointer-events-none shadow-md"
              >
                <ChevronRight className="w-5 h-5 text-[#e0e6ed]" />
              </button>

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
                  className="flex flex-col items-center justify-center py-3.5 px-2 rounded-xl bg-[#1e293b] border border-[#334155]/40 hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-400 transition-colors group disabled:opacity-50"
                >
                  {selectedRating === "again" && isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                  ) : (
                    <>
                      <span className="text-xs md:text-sm font-bold text-[#e0e6ed] mb-1">دوباره</span>
                      <span className="text-[11px] md:text-[12px] font-bold text-red-400">
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
                  className="flex flex-col items-center justify-center py-3.5 px-2 rounded-xl bg-[#1e293b] border border-[#334155]/40 hover:bg-orange-500/20 hover:border-orange-500/50 hover:text-orange-400 transition-colors group disabled:opacity-50"
                >
                  {selectedRating === "hard" && isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                  ) : (
                    <>
                      <span className="text-xs md:text-sm font-bold text-[#e0e6ed] mb-1">سخت</span>
                      <span className="text-[11px] md:text-[12px] font-bold text-orange-400/80">
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
                  className="flex flex-col items-center justify-center py-3.5 px-2 rounded-xl bg-[#1e293b] border border-[#334155]/40 hover:bg-[#14b8a6]/20 hover:border-[#14b8a6]/50 hover:text-[#14b8a6] transition-colors group disabled:opacity-50"
                >
                  {selectedRating === "good" && isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#14b8a6]" />
                  ) : (
                    <>
                      <span className="text-xs md:text-sm font-bold text-[#e0e6ed] mb-1">خوب</span>
                      <span className="text-[11px] md:text-[12px] font-bold text-[#a78bfa]">
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
                  className="flex flex-col items-center justify-center py-3.5 px-2 rounded-xl bg-[#1e293b] border border-[#334155]/40 hover:bg-[#4edea3]/20 hover:border-[#4edea3]/50 hover:text-[#4edea3] transition-colors group disabled:opacity-50"
                >
                  {selectedRating === "easy" && isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#4edea3]" />
                  ) : (
                    <>
                      <span className="text-xs md:text-sm font-bold text-[#e0e6ed] mb-1">آسان</span>
                      <span className="text-[11px] md:text-[12px] font-bold text-[#14b8a6]">
                        {getIntervalHint("easy", currentCard)}
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* Next Button (Icon Only - RTL ChevronLeft) */}
              <button
                type="button"
                onClick={handleNextCard}
                disabled={currentIndex >= dueCards.length - 1 && isFlipped}
                aria-label="کارت بعدی"
                title="کارت بعدی"
                className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-[#1e293b] border border-[#334155]/40 text-[#e0e6ed] hover:bg-[#14b8a6]/20 hover:text-[#14b8a6] transition-all disabled:opacity-30 disabled:pointer-events-none shadow-md"
              >
                <ChevronLeft className="w-5 h-5 text-[#e0e6ed]" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating AI Assistant Button */}
      <button
        type="button"
        aria-label="دستیار هوش مصنوعی"
        className="fixed bottom-6 left-6 md:bottom-10 md:left-10 w-14 h-14 rounded-full bg-gradient-to-br from-[#8455ef] to-[#14b8a6] shadow-[0px_4px_20px_rgba(139,92,246,0.3)] flex items-center justify-center z-50 hover:scale-105 transition-transform"
      >
        <span className="text-white text-2xl font-bold leading-none">A</span>
      </button>
    </div>
  );
}
