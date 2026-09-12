import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Zap, FileText, Loader2, AlertCircle } from "lucide-react";
import { Card, Button } from "@avana/ui";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createDocumentsApi } from "../../lib/api/documents.js";
import { ReviewSummaryViewer } from "./ReviewSummaryViewer.js";
import { cleanEducationalTitle } from "@avana/domain";

export interface CourseReviewSummaryViewProps {
  organizationId: string;
  courseId: string;
  modules?: Array<{ id: string; title: string; document_id?: string | null }>;
  onNavigateToFlashcards?: () => void;
  onNavigateToQuiz?: () => void;
}

export function CourseReviewSummaryView({
  organizationId,
  courseId,
  modules,
  onNavigateToFlashcards,
  onNavigateToQuiz,
}: CourseReviewSummaryViewProps) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const docsApi = createDocumentsApi(apiClient);

  // Extract unique documents from modules if present
  const modulesWithDocs = (modules || []).filter(
    (m): m is typeof m & { document_id: string } => Boolean(m.document_id),
  );

  const docsQuery = useQuery({
    queryKey: ["course-documents", organizationId, courseId],
    queryFn: async () => {
      const res = await docsApi.listDocuments(organizationId);
      return res.items.filter((d) => d.course_id === courseId || d.course_id === null);
    },
    enabled: modulesWithDocs.length === 0,
  });

  const documents: Array<{ id: string; title: string }> =
    modulesWithDocs.length > 0
      ? modulesWithDocs.map((m) => ({
          id: m.document_id,
          title: cleanEducationalTitle(m.title, "سرفصل آموزشی"),
        }))
      : (docsQuery.data ?? []).map((d) => ({
          id: d.id,
          title: cleanEducationalTitle(d.original_name, "سرفصل آموزشی"),
        }));

  const activeDocument =
    documents.find((d) => d.id === selectedDocId) ?? documents[0] ?? null;

  if (modulesWithDocs.length === 0 && docsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (modulesWithDocs.length === 0 && docsQuery.isError) {
    return (
      <div className="p-6 rounded-card bg-[var(--color-surface)] border border-[var(--color-error)]/40 text-[var(--color-error)] text-xs flex items-center gap-2" dir="rtl">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span>خطا در دریافت اسناد دوره برای نمایش خلاصه مروری</span>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <Card className="p-12 text-center space-y-4 font-sans" dir="rtl">
        <div className="w-16 h-16 rounded-button bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center mx-auto shadow-xs">
          <Zap className="w-8 h-8" />
        </div>
        <div className="space-y-1 max-w-md mx-auto">
          <h3 className="text-base font-bold text-[var(--color-text)]">هنوز سندی برای این دوره بارگذاری نشده است</h3>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            برای ساخت و مرور خلاصه مروری ۱۰ تا ۱۵ دقیقه‌ای، لطفاً ابتدا جزوه یا فایل آموزشی خود را در بخش «منابع و اسناد (PDF)» بارگذاری کنید.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      {/* Document Selector Header (if more than 1 document) */}
      {documents.length > 1 && (
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <FileText className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="font-bold text-[var(--color-text)]">انتخاب مبحث آموزشی:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {documents.map((doc: { id: string; title: string }) => {
              const isSelected = activeDocument?.id === doc.id;
              return (
                <Button
                  key={doc.id}
                  variant={isSelected ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setSelectedDocId(doc.id)}
                  leftIcon={<FileText className="w-3.5 h-3.5" />}
                  className="font-bold"
                >
                  <span className="max-w-[200px] truncate">{doc.title}</span>
                </Button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Review Summary Viewer */}
      {activeDocument && (
        <ReviewSummaryViewer
          key={activeDocument.id}
          organizationId={organizationId}
          documentId={activeDocument.id}
          courseId={courseId}
          documentTitle={activeDocument.title}
          onNavigateToFlashcards={onNavigateToFlashcards}
          onNavigateToQuiz={onNavigateToQuiz}
        />
      )}
    </div>
  );
}
