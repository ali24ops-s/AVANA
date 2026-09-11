import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";
import { isUserAdmin } from "../../utils/adminPermissions.js";
import { useActiveGenerations } from "../../hooks/useActiveGenerations.js";
import { GenerationDetailsModal } from "./GenerationDetailsModal.js";
import { useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createGenerationApi } from "../../lib/api/generation.js";

const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
const genApi = createGenerationApi(apiClient);

export interface GlobalGenerationIndicatorProps {
  organizationId?: string;
  className?: string;
}

export function GlobalGenerationIndicator({
  organizationId,
  className = "",
}: GlobalGenerationIndicatorProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, memberships } = useAuth();
  const isAdmin = isUserAdmin(user, memberships);

  const { items, activeItems, failedItems, stoppedItems } =
    useActiveGenerations(organizationId);

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>(undefined);

  // If user is not an admin, or no active, stopped, or failed items exist, render nothing
  if (!isAdmin || items.length === 0) return null;

  const activeCount = activeItems.length;
  const primaryItem = activeItems[0] || failedItems[0] || stoppedItems[0] || items[0];
  if (
    !primaryItem ||
    primaryItem.status === "reviewing" ||
    primaryItem.status === "completed" ||
    primaryItem.stage === "review" ||
    primaryItem.stage === "publishing"
  ) {
    return null;
  }

  const isPrimaryCompleted = (primaryItem.status as string) === "completed";
  const isPrimaryFailed = primaryItem.status === "failed";
  const isPrimaryStopped = primaryItem.status === "stopped";
  const isPrimaryStopping = primaryItem.status === "stopping";
  const isPrimaryDeleting = primaryItem.status === "deleting";
  const isPrimaryGenerating =
    primaryItem.status === "generating" ||
    primaryItem.status === "planning" ||
    primaryItem.status === "queued";

  const percentage = isPrimaryCompleted
    ? 100
    : primaryItem.progress?.percentage ?? 0;

  const handleNavigateToReview = (courseId?: string | null, _documentId?: string) => {
    if (courseId) {
      navigate(`/courses/${courseId}/manage`);
    } else {
      navigate("/files");
    }
  };

  const handleRetry = async (documentId: string, courseId?: string | null, itemOrgId?: string) => {
    const targetOrgId = itemOrgId || organizationId || primaryItem?.organizationId || "";
    try {
      if (courseId && targetOrgId) {
        await genApi.triggerGeneration(targetOrgId, courseId, documentId, {
          types: ["lesson", "flashcard", "quiz", "review_summary"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["active-generations"],
        });
      }
    } catch {
      // Ignored - error will be tracked via backend state
    }
  };

  const handleStop = async (documentId: string, courseId?: string | null, itemOrgId?: string) => {
    const targetOrgId = itemOrgId || organizationId || primaryItem?.organizationId || "";
    try {
      if (targetOrgId) {
        await genApi.stopGeneration(targetOrgId, documentId, courseId);
        void queryClient.invalidateQueries({
          queryKey: ["active-generations"],
        });
      }
    } catch {
      // Ignored - error will be tracked via backend state
    }
  };

  const handleDelete = async (documentId: string, courseId?: string | null, itemOrgId?: string) => {
    const targetOrgId = itemOrgId || organizationId || primaryItem?.organizationId || "";
    try {
      if (targetOrgId) {
        await genApi.deleteGeneration(targetOrgId, documentId, courseId);
        void queryClient.invalidateQueries({
          queryKey: ["active-generations"],
        });
      }
    } catch {
      // Ignored - error will be tracked via backend state
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSelectedDocId(primaryItem.documentId);
          setIsDetailsOpen(true);
        }}
        className={`group relative flex items-center gap-2.5 px-3 py-1.5 rounded-full border transition-all text-xs font-medium cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98] ${
          isPrimaryCompleted
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:border-emerald-500"
            : isPrimaryFailed
            ? "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300 hover:border-rose-500"
            : isPrimaryStopped
            ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:border-amber-500"
            : isPrimaryStopping || isPrimaryDeleting
            ? "bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-300 hover:border-orange-500"
            : "bg-[var(--color-primary-default)]/10 border-[var(--color-primary-default)]/30 text-[var(--color-primary-default)] hover:border-[var(--color-primary-default)]"
        } ${className}`}
        title={`مشاهده جزئیات پیشرفت تولید محتوا: ${primaryItem.documentName}`}
        aria-label="نشانگر وضعیت تولید محتوا"
      >
        {/* Status Icon */}
        <div className="flex items-center justify-center shrink-0">
          {isPrimaryCompleted ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          ) : isPrimaryFailed ? (
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          ) : isPrimaryStopped ? (
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          ) : isPrimaryStopping || isPrimaryDeleting ? (
            <Loader2 className="w-4 h-4 animate-spin text-orange-600 dark:text-orange-400" />
          ) : (
            <div className="relative flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-[var(--color-primary-default)] opacity-50" />
              <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary-default)] relative" />
            </div>
          )}
        </div>

        {/* Labels & Progress Information */}
        <div className="flex flex-col items-start min-w-0 text-right">
          <div className="flex items-center gap-1.5 leading-tight">
            <span className="font-bold text-[11px] sm:text-xs truncate max-w-[120px] sm:max-w-[160px]">
              {activeCount > 1
                ? `${activeCount} تولید محتوای فعال`
                : isPrimaryCompleted
                ? "تولید محتوا تکمیل شد"
                : isPrimaryFailed
                ? "خطا در تولید محتوا"
                : isPrimaryStopped
                ? "تولید متوقف شد"
                : isPrimaryStopping
                ? "در حال توقف..."
                : isPrimaryDeleting
                ? "در حال حذف..."
                : "در حال تولید محتوا"}
            </span>

            {isPrimaryGenerating && percentage > 0 && (
              <span className="font-mono font-bold text-[10px] text-[var(--color-primary-default)]">
                {percentage}٪
              </span>
            )}
          </div>

          {/* Subtitle with Stage Label or Counter */}
          {isPrimaryGenerating && (
            <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] leading-tight truncate max-w-[140px] sm:max-w-[180px]">
              <span>
                {primaryItem.stageLabel || "در حال پردازش"}
              </span>
              {primaryItem.progress && primaryItem.progress.total > 0 && (
                <span>
                  — {primaryItem.progress.current}/{primaryItem.progress.total}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Micro Progress Bar (Bottom Line) */}
        {isPrimaryGenerating && (
          <div className="absolute bottom-0 start-3 end-3 h-0.5 bg-[var(--color-surface-warm)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-primary-default)] transition-all duration-300 rounded-full"
              style={{ width: `${Math.min(100, Math.max(5, percentage))}%` }}
            />
          </div>
        )}

        <ChevronLeft className="w-3.5 h-3.5 text-[var(--color-text-muted)] group-hover:text-[var(--color-text)] transition-transform group-hover:-translate-x-0.5" />
      </button>

      {/* Details Slide-over / Modal */}
      <GenerationDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        items={items}
        selectedDocumentId={selectedDocId}
        onSelectDocument={(id) => setSelectedDocId(id)}
        onNavigateToReview={handleNavigateToReview}
        onRetry={handleRetry}
        onStop={handleStop}
        onDelete={handleDelete}
      />
    </>
  );
}
