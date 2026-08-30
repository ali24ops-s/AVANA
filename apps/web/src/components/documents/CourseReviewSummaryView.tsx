import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Zap, FileText, Loader2, AlertCircle } from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createDocumentsApi } from "../../lib/api/documents.js";
import { ReviewSummaryViewer } from "./ReviewSummaryViewer.js";
import type { DocumentResource } from "@avana/contracts";

export interface CourseReviewSummaryViewProps {
  organizationId: string;
  courseId: string;
  onNavigateToFlashcards?: () => void;
  onNavigateToQuiz?: () => void;
}

export function CourseReviewSummaryView({
  organizationId,
  courseId,
  onNavigateToFlashcards,
  onNavigateToQuiz,
}: CourseReviewSummaryViewProps) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const docsApi = createDocumentsApi(apiClient);

  const docsQuery = useQuery({
    queryKey: ["course-documents", organizationId, courseId],
    queryFn: async () => {
      const res = await docsApi.listDocuments(organizationId);
      return res.items.filter((d) => d.course_id === courseId || d.course_id === null);
    },
  });

  const documents = docsQuery.data ?? [];
  const activeDocument =
    documents.find((d) => d.id === selectedDocId) ?? documents[0] ?? null;

  if (docsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (docsQuery.isError) {
    return (
      <div className="p-6 rounded-3xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span>خطا در دریافت اسناد دوره برای نمایش خلاصه مروری</span>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="bg-slate-900/60 rounded-3xl border border-slate-800 p-12 text-center space-y-4 font-sans" dir="rtl">
        <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center mx-auto shadow-inner">
          <Zap className="w-8 h-8" />
        </div>
        <div className="space-y-1 max-w-md mx-auto">
          <h3 className="text-base font-bold text-white">هنوز سندی برای این دوره بارگذاری نشده است</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            برای ساخت و مرور خلاصه مروری ۱۰ تا ۱۵ دقیقه‌ای، لطفاً ابتدا جزوه یا فایل آموزشی خود را در بخش «منابع و اسناد (PDF)» بارگذاری کنید.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      {/* Document Selector Header (if more than 1 document) */}
      {documents.length > 1 && (
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <FileText className="w-4 h-4 text-teal-400" />
            <span className="font-bold">انتخاب فایل آموزشی:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {documents.map((doc: DocumentResource) => {
              const isSelected = activeDocument?.id === doc.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setSelectedDocId(doc.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm"
                      : "bg-white/5 text-slate-400 hover:text-white border border-white/5"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="max-w-[200px] truncate">{doc.original_name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Review Summary Viewer */}
      {activeDocument && (
        <ReviewSummaryViewer
          key={activeDocument.id}
          organizationId={organizationId}
          documentId={activeDocument.id}
          courseId={courseId}
          documentTitle={activeDocument.original_name}
          onNavigateToFlashcards={onNavigateToFlashcards}
          onNavigateToQuiz={onNavigateToQuiz}
        />
      )}
    </div>
  );
}
