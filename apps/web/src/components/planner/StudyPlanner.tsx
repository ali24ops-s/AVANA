/**
 * AVANA Daily Study Planner Component (Phase 4).
 *
 * Production-ready Daily Study Planner connected to /v1/study/daily-plan API.
 * Replaces old mock/blurred placeholder with real tasks, progress, status,
 * completion interactions, and navigation to real learning routes.
 */

import { useState } from "react";
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Loader2,
  Sparkles,
  ChevronDown,
  ListTodo,
} from "lucide-react";
import { Button } from "@avana/ui";
import { toPersianDigits } from "@avana/domain";
import type { StudyTaskResource } from "@avana/contracts";
import {
  useDailyStudyPlan,
  useRegenerateDailyPlan,
  useUpdateStudyTaskStatus,
} from "../../hooks/useDailyStudyPlan.js";

import {
  StudyTaskCard,
  formatStudyPlannerTaskTitle,
  resolveTaskNavigationUrl,
  getTaskTypeConfig,
  getTaskStatusConfig,
  getTaskCourseName,
  CATEGORY_CONFIG,
  type StudyTaskCategory,
  type TaskCategoryConfig,
  type StudyTaskCardProps,
} from "./StudyTaskCard.js";

export {
  StudyTaskCard,
  formatStudyPlannerTaskTitle,
  resolveTaskNavigationUrl,
  getTaskTypeConfig,
  getTaskStatusConfig,
  getTaskCourseName,
  CATEGORY_CONFIG,
  type StudyTaskCategory,
  type TaskCategoryConfig,
  type StudyTaskCardProps,
};

export interface StudyPlannerProps {
  className?: string;
  defaultOpen?: boolean;
}

export function StudyPlanner({
  className = "",
  defaultOpen = false,
}: StudyPlannerProps) {
  const { data, isLoading, isError, refetch } = useDailyStudyPlan();
  const regenerateMutation = useRegenerateDailyPlan();
  const updateTaskMutation = useUpdateStudyTaskStatus();

  // Collapsible task list state (collapsed by default to prevent long list on first glance)
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Track pending completion for specific task ID to provide instant button feedback
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const plan = data?.plan;
  const tasks = plan?.tasks ?? [];

  // Completion calculation purely based on server response duration
  const targetMinutes = plan?.targetDurationMinutes ?? 0;
  const completedMinutes = plan?.completedDurationMinutes ?? 0;
  const remainingMinutes = plan?.remainingDurationMinutes ?? 0;

  const progressPercent =
    targetMinutes > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((completedMinutes / targetMinutes) * 100),
          ),
        )
      : 0;

  const handleRegenerate = () => {
    if (regenerateMutation.isPending) return;
    regenerateMutation.mutate(undefined);
  };

  const handleCompleteTask = (task: StudyTaskResource) => {
    // If already completed, do not allow accidental revert to pending
    if (task.status === "completed") {
      return;
    }

    if (updateTaskMutation.isPending && updatingTaskId === task.id) {
      return;
    }

    setUpdatingTaskId(task.id);
    updateTaskMutation.mutate(
      { taskId: task.id, status: "completed" },
      {
        onSettled: () => {
          setUpdatingTaskId(null);
        },
      },
    );
  };

  return (
    <section
      className={`bg-[var(--color-surface)] p-5 md:p-6 rounded-card border border-[var(--color-border)] shadow-xs space-y-5 relative overflow-hidden ${className}`}
      aria-label="برنامه مطالعه امروز"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-card bg-[var(--avana-accent-soft)] flex items-center justify-center text-primary border border-primary/20 shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[var(--color-text)] truncate">
              برنامه مطالعه امروز
            </h3>
            {plan && (
              <p className="text-[11px] text-[var(--color-text-muted)] truncate">
                {toPersianDigits(completedMinutes)} دقیقه از{" "}
                {toPersianDigits(targetMinutes)} دقیقه هدف
              </p>
            )}
          </div>
        </div>

        {/* Regenerate Action */}
        <Button
          type="button"
          onClick={handleRegenerate}
          disabled={regenerateMutation.isPending || isLoading}
          variant="ghost"
          size="sm"
          className="!px-2.5 !py-1 text-xs text-[var(--color-text-muted)] hover:text-primary transition-colors shrink-0"
          title="بازسازی برنامه مطالعه"
          aria-label="بازسازی برنامه مطالعه"
        >
          {regenerateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : (
            <RotateCcw className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">بازسازی برنامه</span>
        </Button>
      </div>

      {/* Loading Skeleton State */}
      {isLoading && (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <div className="space-y-2">
            <div className="h-2 w-full bg-[var(--color-surface-warm)] rounded-full animate-pulse" />
            <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
              <span className="h-3 w-16 bg-[var(--color-surface-warm)] rounded animate-pulse" />
              <span className="h-3 w-12 bg-[var(--color-surface-warm)] rounded animate-pulse" />
            </div>
          </div>
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="py-2.5 px-3 rounded-card border border-[var(--color-border)] bg-[var(--color-surface-warm)] flex items-center justify-between gap-2.5 animate-pulse"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-5 h-5 rounded-input bg-[var(--color-border)] shrink-0" />
                  <div className="w-6 h-6 rounded-input bg-[var(--color-border)] shrink-0" />
                  <div className="space-y-1 flex-1">
                    <div className="h-3.5 bg-[var(--color-border)] rounded w-3/4" />
                    <div className="h-2.5 bg-[var(--color-border)] rounded w-1/3" />
                  </div>
                </div>
                <div className="h-7 w-7 bg-[var(--color-border)] rounded-button shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error State */}
      {isError && !isLoading && (
        <div className="py-6 flex flex-col items-center justify-center text-center p-5 rounded-card border border-dashed border-[var(--color-border)] bg-[var(--color-surface-warm)] space-y-3">
          <div className="w-10 h-10 rounded-full bg-[var(--avana-error-bg)] border border-[var(--avana-error-border)] flex items-center justify-center text-[var(--avana-error)] shadow-xs">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-[var(--color-text)]">
              خطا در دریافت برنامه مطالعه امروز
            </p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1 max-w-[240px] leading-relaxed">
              امکان دریافت برنامه مطالعه وجود ندارد. لطفاً مجدداً تلاش کنید.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void refetch()}
            variant="primary"
            size="sm"
          >
            <span>تلاش مجدد</span>
          </Button>
        </div>
      )}

      {/* Plan Content */}
      {!isLoading && !isError && plan && (
        <>
          {/* Progress Indicator & Legend */}
          <div className="space-y-2 bg-[var(--color-surface-warm)] p-3 rounded-card border border-[var(--color-border)]">
            <div className="flex justify-between items-center text-xs font-medium">
              <span className="text-[var(--color-text)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>پیشرفت مطالعه امروز</span>
              </span>
              <span className="text-primary font-bold">
                {toPersianDigits(progressPercent)}٪
              </span>
            </div>

            <div
              className="w-full bg-[var(--color-surface)] rounded-full h-2 overflow-hidden border border-[var(--color-border)]"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`پیشرفت برنامه مطالعه ${toPersianDigits(progressPercent)} درصد`}
            >
              <div
                className="bg-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex justify-between items-center text-[11px] text-[var(--color-text-muted)] pt-0.5">
              <span>انجام‌شده: {toPersianDigits(completedMinutes)} دقیقه</span>
              <span>باقیمانده: {toPersianDigits(remainingMinutes)} دقیقه</span>
            </div>

            {/* Category Color Legend */}
            <div
              className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)] pt-2 border-t border-[var(--color-border)] flex-wrap gap-2"
              aria-label="راهنمای اولویت برنامه‌ها"
            >
              <span className="font-medium text-[var(--color-text)]">راهنمای اولویت:</span>
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex items-center gap-1.5"
                  title="برنامه اجباری"
                  aria-label="اجباری"
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" aria-hidden="true" />
                  <span>اجباری</span>
                </span>
                <span
                  className="inline-flex items-center gap-1.5"
                  title="برنامه اختیاری"
                  aria-label="اختیاری"
                >
                  <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" aria-hidden="true" />
                  <span>اختیاری</span>
                </span>
                <span
                  className="inline-flex items-center gap-1.5"
                  title="تمرین بیشتر"
                  aria-label="تمرین بیشتر"
                >
                  <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" aria-hidden="true" />
                  <span>تمرین بیشتر</span>
                </span>
              </div>
            </div>
          </div>

          {/* Empty Tasks State */}
          {tasks.length === 0 ? (
            <div className="py-6 flex flex-col items-center justify-center text-center p-5 rounded-card border border-dashed border-[var(--color-border)] bg-[var(--color-surface-warm)] space-y-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-primary shadow-xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-[var(--color-text)]">
                  برای امروز کاری برای انجام باقی نمانده است
                </p>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-1 max-w-[240px] leading-relaxed">
                  برنامه روزانه شما کامل است. در صورت نیاز می‌توانید برنامه جدید بسازید.
                </p>
              </div>
              <Button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerateMutation.isPending}
                variant="primary"
                size="sm"
              >
                {regenerateMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                <span>بازسازی برنامه</span>
              </Button>
            </div>
          ) : (
            /* Collapsible Tasks List (User can expand/collapse to view tasks) */
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-expanded={isOpen}
                aria-controls="study-planner-tasks-list"
                className="w-full flex items-center justify-between p-3 rounded-card bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] transition-all text-xs font-semibold text-[var(--color-text)] cursor-pointer group shadow-2xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-input bg-[var(--avana-accent-soft)] flex items-center justify-center text-primary border border-primary/20 shrink-0">
                    <ListTodo className="w-3.5 h-3.5" />
                  </div>
                  <span className="truncate">فعالیت‌های مطالعه امروز</span>
                  <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] shrink-0">
                    {toPersianDigits(tasks.length)} فعالیت
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-primary font-medium shrink-0">
                  <span>{isOpen ? "بستن" : "مشاهده"}</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  />
                </div>
              </button>

              {isOpen && (
                <div id="study-planner-tasks-list" className="space-y-2.5 pt-0.5">
                  {tasks.map((task) => (
                    <StudyTaskCard
                      key={task.id}
                      task={task}
                      isUpdating={
                        updateTaskMutation.isPending && updatingTaskId === task.id
                      }
                      onComplete={handleCompleteTask}
                      hideCourseName={false}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
