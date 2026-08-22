import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Trash2, Clock, BookOpen, Layers, AlertCircle } from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import { toPersianDigits } from "@avana/domain";
import type { FlashcardStudySessionSummary } from "@avana/contracts";

interface UnfinishedSessionsListProps {
  organizationId: string;
  onSelectSession?: (sessionId: string) => void;
  className?: string;
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 2) return "هم‌اکنون";
    if (diffMins < 60) return `${toPersianDigits(diffMins)} دقیقه پیش`;
    if (diffHours < 24) return `${toPersianDigits(diffHours)} ساعت پیش`;
    if (diffDays === 1) return "دیروز";
    if (diffDays < 30) return `${toPersianDigits(diffDays)} روز پیش`;
    return new Intl.DateTimeFormat("fa-IR").format(date);
  } catch {
    return dateStr;
  }
}

export const UnfinishedSessionsList: React.FC<UnfinishedSessionsListProps> = ({
  organizationId,
  onSelectSession,
  className = "",
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const studyApi = createStudyApi(apiClient);

  const handleSessionClick = (sessionId: string) => {
    if (onSelectSession) {
      onSelectSession(sessionId);
    } else {
      navigate(`/flashcards/review?sessionId=${sessionId}`);
    }
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["flashcard-sessions", organizationId],
    queryFn: () => {
      console.log("[UnfinishedSessionsList] FETCH organizationId:", organizationId);
      return studyApi.getActiveFlashcardStudySessions(organizationId);
    },
    enabled: Boolean(organizationId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const cancelMutation = useMutation({
    mutationFn: (sessionId: string) =>
      studyApi.cancelFlashcardStudySession(organizationId, sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["flashcard-sessions", organizationId],
      });
    },
  });

  const sessions = (data?.sessions || []) as FlashcardStudySessionSummary[];
  
  console.log("[UnfinishedSessionsList] MOUNT/RENDER", { 
    organizationId, 
    isLoading, 
    sessionsCount: sessions.length,
    sessions: sessions.map(s => ({ id: s.id, title: s.title, status: s.status, completed: s.completed_cards, total: s.total_cards }))
  });

  return (
    <section
      data-testid="unfinished-sessions-section"
      className={`bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl border border-indigo-100/60 dark:border-indigo-950/40 p-5 md:p-6 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              مطالعات ناتمام
              {!isLoading && !isError && sessions.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-medium">
                  {toPersianDigits(sessions.length)}
                </span>
              )}
            </h2>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
          می‌توانید مطالعه‌های قبلی را از همان کارت متوقف‌شده ادامه دهید
        </p>
      </div>

      {isLoading ? (
        <div
          data-testid="unfinished-sessions-skeleton"
          className="grid grid-cols-1 md:grid-cols-2 gap-3.5"
        >
          {[1, 2].map((item) => (
            <div
              key={item}
              className="bg-slate-50/70 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200/70 dark:border-slate-700/60 animate-pulse space-y-3.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700" />
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
                <div className="w-6 h-6 rounded bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full" />
              <div className="flex items-center justify-between pt-1">
                <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div
          data-testid="unfinished-sessions-error"
          className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 p-5 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40 text-center sm:text-right"
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                خطا در بارگذاری مطالعات ناتمام
              </p>
              <p className="text-xs text-rose-700/80 dark:text-rose-400/80 leading-relaxed">
                امکان دریافت اطلاعات مطالعات ناتمام وجود ندارد. لطفا مجددا تلاش نمایید.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center justify-center px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-medium transition-colors shrink-0 shadow-sm cursor-pointer"
          >
            تلاش مجدد
          </button>
        </div>
      ) : sessions.length === 0 ? (
        <div
          data-testid="unfinished-sessions-empty"
          className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-5 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800 text-center sm:text-right"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              هنوز مطالعه ناتمامی ندارید.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              مطالعه‌ای که شروع کنید و کامل نکنید، اینجا برای ادامه دادن نمایش داده می‌شود.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {sessions.map((session) => {
          const totalCards = Number(
            session.total_cards ?? (session as any).totalCards ?? 0,
          );
          const completedCards = Number(
            session.completed_cards ?? (session as any).completedCards ?? 0,
          );
          const lastActivityAt =
            session.last_activity_at ??
            (session as any).lastActivityAt ??
            session.started_at ??
            (session as any).startedAt ??
            new Date().toISOString();

          const progressPercent =
            totalCards > 0
              ? Math.round((completedCards / totalCards) * 100)
              : 0;

          return (
            <div
              key={session.id}
              data-testid={`unfinished-session-${session.id}`}
              className="group relative bg-slate-50/70 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 rounded-xl p-4 border border-slate-200/70 dark:border-slate-700/60 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100/80 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <BookOpen className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                      {session.title || "مرور فلش‌کارت‌ها"}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        window.confirm(
                          "آیا از حذف این مطالعه ناتمام اطمینان دارید؟",
                        )
                      ) {
                        cancelMutation.mutate(session.id);
                      }
                    }}
                    disabled={cancelMutation.isPending}
                    title="انصراف و حذف مطالعه"
                    className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-3">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    {toPersianDigits(completedCards)} از{" "}
                    {toPersianDigits(totalCards)} کارت
                  </span>
                  <span>•</span>
                  <span>{formatRelativeTime(lastActivityAt)}</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mb-3">
                  <div
                    className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(5, progressPercent))}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {toPersianDigits(progressPercent)}٪ تکمیل شده
                </span>

                <button
                  type="button"
                  onClick={() => handleSessionClick(session.id)}
                  className="inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium px-3.5 py-1.5 h-8 gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <span>ادامه مطالعه</span>
                  <Play className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>
            </div>
          );
        })}
        </div>
      )}
    </section>
  );
};
