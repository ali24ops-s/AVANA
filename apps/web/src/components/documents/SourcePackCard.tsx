import { useState, useMemo } from "react";
import {
  Layers,
  FileText,
  Star,
  Loader2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createSourcePacksApi } from "../../lib/api/source-packs.js";
import { GenerateContentModal } from "./GenerateContentModal.js";
import type { SourcePackResource, DocumentResource } from "@avana/contracts";
import { toPersianDigits } from "@avana/domain";

interface SourcePackCardProps {
  pack: SourcePackResource;
  organizationId: string;
  courseId: string;
  onDeleted?: () => void;
  onGenerationStarted?: (jobId: string) => void;
}

function getRoleBadge(role?: string) {
  switch (role) {
    case "primary_notes":
    case "primary":
      return {
        label: "جزوه اصلی",
        className: "bg-amber-500/10 text-amber-600 border border-amber-500/20 font-bold",
      };
    case "question_template":
      return {
        label: "قالب سؤالات",
        className: "bg-purple-500/10 text-purple-600 border border-purple-500/20 font-bold",
      };
    case "primary_reference":
      return {
        label: "رفرنس اصلی",
        className: "bg-blue-500/10 text-blue-600 border border-blue-500/20 font-bold",
      };
    case "supplementary_reference":
    case "supplementary":
    default:
      return {
        label: "رفرنس تکمیلی",
        className: "bg-muted text-muted-foreground border border-border/40 font-medium",
      };
  }
}

export function SourcePackCard({
  pack,
  organizationId,
  courseId,
  onDeleted,
  onGenerationStarted,
}: SourcePackCardProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const packApi = createSourcePacksApi(apiClient);

  const cachedDocs = queryClient.getQueryData<DocumentResource[]>([
    "course-documents",
    organizationId,
    courseId,
  ]);

  const docQualityMap = useMemo(() => {
    const map = new Map<string, number | null | undefined>();
    if (cachedDocs) {
      for (const d of cachedDocs) {
        if (d.quality_score !== undefined && d.quality_score !== null) {
          map.set(d.id, d.quality_score);
        }
      }
    }
    for (const d of pack.documents) {
      const anyDoc = d as unknown as { quality_score?: number | null };
      if (anyDoc.quality_score !== undefined && anyDoc.quality_score !== null) {
        map.set(d.document_id, anyDoc.quality_score);
      }
    }
    return map;
  }, [cachedDocs, pack.documents]);

  const primaryDoc =
    pack.documents.find(
      (d) => d.role === "primary_notes" || d.role === "primary",
    ) ?? pack.documents[0];
  const supplementaryDocs = pack.documents.filter(
    (d) => d.document_id !== primaryDoc?.document_id,
  );

  const readyDocs = pack.documents.filter(
    (d) => d.status === "extracted" || d.status === "ready" || d.status === "review_pending",
  );
  const isGenerationReady = pack.documents.length >= 2 && readyDocs.length >= 2;

  const generateMutation = useMutation({
    mutationFn: async (options?: { types?: ("lesson" | "flashcard" | "quiz" | "review_summary")[] }) => {
      setErrorMsg(null);
      return await packApi.generateSourcePack(organizationId, courseId, pack.id, {
        types: options?.types && options.types.length > 0 ? options.types : undefined,
      });
    },
    onSuccess: (data) => {
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["documents", courseId] });
      queryClient.invalidateQueries({ queryKey: ["source-packs", courseId] });
      onGenerationStarted?.(data.job_id);
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof Error ? err.message : "خطا در شروع تولید محتوای یکپارچه");
    },
  });

  const handleConfirmGenerate = (selected: {
    lesson: boolean;
    flashcards: boolean;
    exam: boolean;
    review_summary: boolean;
  }) => {
    const types: Array<"lesson" | "flashcard" | "quiz" | "review_summary"> = [];
    if (selected.lesson) types.push("lesson");
    if (selected.flashcards) types.push("flashcard");
    if (selected.exam) types.push("quiz");
    if (selected.review_summary) types.push("review_summary");

    generateMutation.mutate({ types });
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await packApi.deleteSourcePack(organizationId, courseId, pack.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["source-packs", courseId] });
      onDeleted?.();
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof Error ? err.message : "خطا در حذف پک منابع");
    },
  });

  return (
    <>
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-5 space-y-4 shadow-xs transition-colors text-right">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-[#008080] flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-bold text-sm text-[var(--color-text)] leading-snug break-words">
                {pack.title}
              </h4>
            </div>
          </div>

          <button
            type="button"
            disabled={deleteMutation.isPending || generateMutation.isPending}
            onClick={() => {
              if (confirm("آیا از حذف این پک منابع اطمینان دارید؟ (فایل‌های اصلی حذف نمی‌شوند)")) {
                deleteMutation.mutate();
              }
            }}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-destructive hover:bg-destructive/10 transition self-start sm:self-auto"
            title="حذف پک"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Sources List */}
        <div className="space-y-2 bg-[var(--color-surface-warm)]/40 p-3 rounded-xl border border-[var(--color-border)]">
          {/* Primary Doc */}
          {primaryDoc && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs">
              <div className="flex items-center gap-2 truncate min-w-0">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0 self-center" />
                <span className="text-xs font-semibold text-[var(--color-text)] truncate inline-flex items-center" dir="ltr">
                  {primaryDoc.original_name || "منبع اصلی"}
                </span>
                {docQualityMap.get(primaryDoc.document_id) !== undefined && docQualityMap.get(primaryDoc.document_id) !== null && (
                  <span className="text-xs font-bold text-emerald-600 shrink-0 mr-1.5 inline-flex items-center">
                    {toPersianDigits(docQualityMap.get(primaryDoc.document_id)!)}٪
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${getRoleBadge(primaryDoc.role).className}`}>
                  {getRoleBadge(primaryDoc.role).label}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {primaryDoc.status === "extracted" || primaryDoc.status === "ready" ? (
                    <span className="text-emerald-600 flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> آماده
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-muted)] flex items-center gap-0.5">
                      <Clock className="w-3 h-3" /> در انتظار
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Supplementary Docs */}
          {supplementaryDocs.map((doc) => (
            <div
              key={doc.document_id}
              className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]"
            >
              <div className="flex items-center gap-2 truncate min-w-0">
                <FileText className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0 self-center" />
                <span className="text-xs text-[var(--color-text)] truncate inline-flex items-center" dir="ltr">
                  {doc.original_name || "منبع تکمیلی"}
                </span>
                {docQualityMap.get(doc.document_id) !== undefined && docQualityMap.get(doc.document_id) !== null && (
                  <span className="text-xs font-bold text-emerald-600 shrink-0 mr-1.5 inline-flex items-center">
                    {toPersianDigits(docQualityMap.get(doc.document_id)!)}٪
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${getRoleBadge(doc.role).className}`}>
                  {getRoleBadge(doc.role).label}
                </span>
                <span className="text-[10px]">
                  {doc.status === "extracted" || doc.status === "ready" ? (
                    <span className="text-emerald-600 flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> آماده
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-muted)] flex items-center gap-0.5">
                      <Clock className="w-3 h-3" /> در انتظار
                    </span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Error alert */}
        {errorMsg && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Footer / CTA (placed on the right matching single-file DocumentStatusCard) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-[var(--color-border)]">
          <div className="flex items-center">
            <button
              type="button"
              disabled={!isGenerationReady || generateMutation.isPending}
              onClick={() => setIsModalOpen(true)}
              className="px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs bg-[#008080] hover:bg-[#006666] disabled:opacity-50 text-white cursor-pointer disabled:cursor-not-allowed"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>در حال ارسال به صف...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>تولید هوشمند محتوای آموزشی</span>
                </>
              )}
            </button>
          </div>

          {!isGenerationReady && (
            <span className="text-xs text-amber-600">
              {pack.documents.length < 2
                ? "حداقل ۲ سند مورد نیاز است"
                : "تمام فایل‌ها باید پردازش و آماده شوند"}
            </span>
          )}
        </div>
      </div>

      {isModalOpen && (
        <GenerateContentModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          documentName={pack.title}
          packId={pack.id}
          organizationId={organizationId}
          courseId={courseId}
          isAllSourcesReady={pack.documents.every(
            (d) => d.status === "extracted" || d.status === "ready" || d.status === "review_pending",
          )}
          isGenerating={generateMutation.isPending}
          onConfirmGenerate={handleConfirmGenerate}
        />
      )}
    </>
  );
}
