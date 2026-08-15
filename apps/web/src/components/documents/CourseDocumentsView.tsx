import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, UploadCloud } from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createDocumentsApi } from "../../lib/api/documents.js";
import { DocumentUploader } from "./DocumentUploader.js";
import { DocumentStatusCard } from "./DocumentStatusCard.js";
import type { DocumentResource } from "@avana/contracts";

export interface CourseDocumentsViewProps {
  organizationId: string;
  courseId: string;
  onNavigateToReview?: () => void;
}

export function CourseDocumentsView({
  organizationId,
  courseId,
  onNavigateToReview,
}: CourseDocumentsViewProps) {
  const [localDocs, setLocalDocs] = useState<DocumentResource[]>([]);
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const docsApi = createDocumentsApi(apiClient);

  const docsQuery = useQuery({
    queryKey: ["course-documents", organizationId, courseId],
    queryFn: async () => {
      const res = await docsApi.listDocuments(organizationId);
      // Filter documents belonging to this course (or unassigned org docs)
      return res.items.filter((d) => d.course_id === courseId || d.course_id === null);
    },
    refetchInterval: 3000,
  });

  const serverDocs = docsQuery.data ?? [];
  const allDocsMap = new Map<string, DocumentResource>();
  for (const doc of [...localDocs, ...serverDocs]) {
    allDocsMap.set(doc.id, doc);
  }
  const documentsList = Array.from(allDocsMap.values());

  return (
    <div className="space-y-6">
      <DocumentUploader
        organizationId={organizationId}
        courseId={courseId}
        onUploaded={(newDoc) => {
          setLocalDocs((prev) => [newDoc, ...prev.filter((d) => d.id !== newDoc.id)]);
          void docsQuery.refetch();
        }}
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--color-text)]">
            اسناد و منابع بارگذاری‌شده
          </h3>
          <span className="text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface)] px-3 py-1 rounded-xl border border-[var(--color-border)]">
            {documentsList.length} سند
          </span>
        </div>

        {docsQuery.isLoading && documentsList.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#008080]" />
          </div>
        )}

        {docsQuery.isError && documentsList.length === 0 && (
          <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-400 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{docsQuery.error.message || "خطا در بارگذاری اسناد"}</span>
            </div>
            <button
              type="button"
              onClick={() => void docsQuery.refetch()}
              className="px-3 py-1 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 rounded-lg text-xs font-bold hover:bg-red-200 transition-colors"
            >
              تلاش مجدد
            </button>
          </div>
        )}

        {documentsList.length === 0 && !docsQuery.isLoading && (
          <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center">
            <UploadCloud className="w-10 h-10 text-[var(--color-text-muted)] mx-auto mb-3" />
            <h4 className="text-sm font-bold text-[var(--color-text)]">
              هنوز سندی بارگذاری نشده است
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              برای تولید و ساختاردهی محتوای آموزشی، فایل‌ها و جزوات درسی را از کادر بالا بارگذاری نمایید.
            </p>
          </div>
        )}

        {documentsList.length > 0 && (
          <div className="grid gap-4">
            {documentsList.map((doc: DocumentResource) => (
              <DocumentStatusCard
                key={doc.id}
                document={doc}
                organizationId={organizationId}
                courseId={courseId}
                onNavigateToReview={onNavigateToReview}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
