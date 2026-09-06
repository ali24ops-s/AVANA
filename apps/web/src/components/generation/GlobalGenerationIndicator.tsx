import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
} from "lucide-react";
import { useActiveGenerations } from "../../hooks/useActiveGenerations.js";
import { useAuth } from "../../providers/AuthProvider.js";
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
  const { memberships } = useAuth();
  const effectiveOrgId = organizationId || memberships?.[0]?.organization_id || "";

  const { items, activeItems, completedItems, failedItems } =
    useActiveGenerations(effectiveOrgId);

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>(undefined);

  // If no active, recently completed, or failed items exist, render nothing
  if (items.length === 0) return null;

  const activeCount = activeItems.length;
  const primaryItem = activeItems[0] || completedItems[0] || failedItems[0] || items[0];
  if (!primaryItem) return null;

  const isPrimaryCompleted = primaryItem.status === "completed";
  const isPrimaryFailed = primaryItem.status === "failed";
  const isPrimaryStopped = primaryItem.status === "stopped";
  const isPrimaryStopping = primaryItem.status === "stopping";
  const isPrimaryDeleting = primaryItem.status === "deleting";
  const isPrimaryGenerating =
    primaryItem.status === "generating" ||
    primaryItem.status === "planning" ||
    primaryItem.status === "reviewing" ||
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
    const targetOrgId = itemOrgId || effectiveOrgId;
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
    const targetOrgId = itemOrgId || effectiveOrgId;
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
    const targetOrgId = itemOrgId || effectiveOrgId;
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
        className={`group relative flex items-center gap-2.5 px-3 py-1.5 rounded-full glass-panel border transition-all text-xs font-medium cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98] ${
          isPrimaryCompleted
            ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:border-emerald-400"
            : isPrimaryFailed
            ? "bg-rose-950/40 border-rose-500/40 text-rose-300 hover:border-rose-400"
            : isPrimaryStopped
            ? "bg-amber-950/40 border-amber-500/40 text-amber-300 hover:border-amber-400"
            : isPrimaryStopping || isPrimaryDeleting
            ? "bg-orange-950/40 border-orange-500/40 text-orange-300 hover:border-orange-400"
            : "bg-teal-950/40 border-teal-500/40 text-teal-300 hover:border-teal-400"
        } ${className}`}
        title={`مشاهده جزئیات پیشرفت تولید محتوا: ${primaryItem.documentName}`}
        aria-label="نشانگر وضعیت تولید محتوا"
      >
        {/* Status Icon */}
        <div className="flex items-center justify-center shrink-0">
          {isPrimaryCompleted ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : isPrimaryFailed ? (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          ) : isPrimaryStopped ? (
            <AlertCircle className="w-4 h-4 text-amber-400" />
          ) : isPrimaryStopping || isPrimaryDeleting ? (
            <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
          ) : (
            <div className="relative flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-teal-400 opacity-50" />
              <Loader2 className="w-4 h-4 animate-spin text-teal-400 relative" />
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
              <span className="font-mono font-bold text-[10px] text-teal-400">
                {percentage}٪
              </span>
            )}
          </div>

          {/* Subtitle with Stage Label or Counter */}
          {isPrimaryGenerating && (
            <div className="flex items-center gap-1 text-[10px] text-slate-400 leading-tight truncate max-w-[140px] sm:max-w-[180px]">
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
          <div className="absolute bottom-0 left-3 right-3 h-0.5 bg-slate-800/80 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-400 transition-all duration-300 rounded-full"
              style={{ width: `${Math.min(100, Math.max(5, percentage))}%` }}
            />
          </div>
        )}

        <ChevronLeft className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform group-hover:-translate-x-0.5" />
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
