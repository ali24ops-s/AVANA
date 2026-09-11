import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Trash2, Clock, BookOpen, Layers, AlertCircle } from "lucide-react";
import { Card, Badge, Button } from "@avana/ui";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import { toPersianDigits, formatPersianOf } from "@avana/domain";
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
    queryFn: () => studyApi.getActiveFlashcardStudySessions(organizationId),
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

  return (
    <section
      data-testid="unfinished-sessions-section"
      className={`bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] p-5 md:p-6 shadow-[var(--shadow-card)] ${className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-[10px] bg-[var(--color-primary-soft)] flex items-center justify-center text-[var(--color-primary)]">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
              مطالعات ناتمام
              {!isLoading && !isError && sessions.length > 0 && (
                <Badge variant="primary" size="sm">
                  {toPersianDigits(sessions.length)}
                </Badge>
              )}
            </h2>
          </div>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] hidden sm:block">
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
              className="bg-[var(--color-surface-hover)] rounded-[16px] p-4 border border-[var(--color-border)] animate-pulse space-y-3.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-[8px] bg-[var(--color-border)]" />
                  <div className="h-4 w-32 bg-[var(--color-border)] rounded-[6px]" />
                </div>
                <div className="w-6 h-6 rounded-[6px] bg-[var(--color-border)]" />
              </div>
              <div className="h-3 w-24 bg-[var(--color-border)] rounded-[6px]" />
              <div className="w-full bg-[var(--color-border)] h-1.5 rounded-full" />
              <div className="flex items-center justify-between pt-1">
                <div className="h-3 w-16 bg-[var(--color-border)] rounded-[6px]" />
                <div className="h-8 w-24 bg-[var(--color-border)] rounded-[10px]" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div
          data-testid="unfinished-sessions-error"
          className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 p-5 rounded-[16px] bg-[var(--color-error-soft)] border border-[var(--color-error-muted)] text-center sm:text-right"
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3.5">
            <div className="w-10 h-10 rounded-[10px] bg-[var(--color-error-muted)] text-[var(--color-error)] flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--color-error)]">
                خطا در بارگذاری مطالعات ناتمام
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                امکان دریافت اطلاعات مطالعات ناتمام وجود ندارد. لطفا مجددا تلاش نمایید.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            className="shrink-0 rounded-[10px]"
          >
            تلاش مجدد
          </Button>
        </div>
      ) : sessions.length === 0 ? (
        <div
          data-testid="unfinished-sessions-empty"
          className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-5 rounded-[16px] bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] text-center sm:text-right"
        >
          <div className="w-10 h-10 rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              هنوز مطالعه ناتمامی ندارید.
            </p>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              مطالعه‌ای که شروع کنید و کامل نکنید، اینجا برای ادامه دادن نمایش داده می‌شود.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {sessions.map((session) => {
          type SessionCamelCase = {
            totalCards?: number;
            completedCards?: number;
            lastActivityAt?: string;
            startedAt?: string;
          };
          const sAlt = session as unknown as SessionCamelCase;
          const totalCards = Number(
            session.total_cards ?? sAlt.totalCards ?? 0,
          );
          const completedCards = Number(
            session.completed_cards ?? sAlt.completedCards ?? 0,
          );
          const lastActivityAt =
            session.last_activity_at ??
            sAlt.lastActivityAt ??
            session.started_at ??
            sAlt.startedAt ??
            new Date().toISOString();

          const progressPercent =
            totalCards > 0
              ? Math.round((completedCards / totalCards) * 100)
              : 0;

          return (
            <Card
              key={session.id}
              variant="bordered"
              data-testid={`unfinished-session-${session.id}`}
              className="group relative rounded-[16px] p-4 border border-[var(--color-border)] hover:border-[var(--color-primary)] bg-[var(--color-surface)] transition-all duration-200 shadow-[var(--shadow-subtle)] hover:shadow-[var(--shadow-card)] flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-[8px] bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
                      <BookOpen className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="font-semibold text-sm text-[var(--color-text)] truncate">
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
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-soft)] p-1.5 rounded-[8px] transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] mb-3">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                    {formatPersianOf(completedCards, totalCards, { suffix: " کارت" })}
                  </span>
                  <span>•</span>
                  <span>{formatRelativeTime(lastActivityAt)}</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-[var(--color-divider)] h-1.5 rounded-full overflow-hidden mb-3">
                  <div
                    className="bg-[var(--color-primary)] h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(5, progressPercent))}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-semibold text-[var(--color-primary)]">
                  {toPersianDigits(progressPercent)}٪ تکمیل شده
                </span>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => handleSessionClick(session.id)}
                  className="rounded-[10px] text-xs font-medium px-3.5 py-1.5 h-8 gap-1.5 shadow-[var(--shadow-subtle)]"
                >
                  <span>ادامه مطالعه</span>
                  <Play className="w-3.5 h-3.5 fill-current" />
                </Button>
              </div>
            </Card>
          );
        })}
        </div>
      )}
    </section>
  );
};
