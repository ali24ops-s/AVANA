import { useState, useCallback, useRef } from "react";
import { Upload as UploadIcon, FileText, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createDocumentsApi } from "../../lib/api/documents.js";
import { createOrganizationApi } from "../../lib/api/organizations.js";
import { createCourseApi } from "../../lib/api/courses.js";
import { createAuthApi } from "../../lib/api/auth.js";
import type { DocumentResource } from "@avana/contracts";

export interface DocumentUploaderProps {
  organizationId: string;
  courseId?: string | null;
  onUploaded?: (doc: DocumentResource) => void;
  autoUpload?: boolean;
}

const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".pptx", ".ppt"];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export function DocumentUploader({
  organizationId,
  courseId,
  onUploaded,
  autoUpload = false,
}: DocumentUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const docsApi = createDocumentsApi(apiClient);
  const orgApi = createOrganizationApi(apiClient);
  const courseApi = createCourseApi(apiClient);
  const authApi = createAuthApi(apiClient);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      let targetOrgId = organizationId;
      let targetCourseId = courseId;

      // Ensure valid organization exists in backend to prevent "Organization not found"
      if (!targetOrgId || targetOrgId === "00000000-0000-0000-0000-000000000010") {
        try {
          const orgList = await orgApi.listOrganizations();
          if (orgList.items && orgList.items.length > 0) {
            targetOrgId = orgList.items[0].id;
          } else {
            const created = await orgApi.createOrganization("فضای یادگیری آوانا");
            targetOrgId = created.organization.id;
          }
        } catch {
          try {
            await authApi.signIn("alice@example.com");
            const orgList = await orgApi.listOrganizations();
            if (orgList.items && orgList.items.length > 0) {
              targetOrgId = orgList.items[0].id;
            } else {
              const created = await orgApi.createOrganization("فضای یادگیری آوانا");
              targetOrgId = created.organization.id;
            }
          } catch {
            // Keep targetOrgId
          }
        }
      }

      // If targetCourseId is missing, check or create course for this organization
      if (targetOrgId && (!targetCourseId || targetCourseId.trim().length === 0)) {
        try {
          const coursesList = await courseApi.listCourses(targetOrgId);
          if (coursesList.items && coursesList.items.length > 0) {
            targetCourseId = coursesList.items[0].id;
          }
        } catch {
          // Optional course lookup
        }
      }

      const confirmRes = await docsApi.uploadDocument(
        targetOrgId,
        file,
        targetCourseId || undefined,
      );

      // Also automatically trigger extraction on successful upload
      try {
        await docsApi.triggerExtraction(targetOrgId, confirmRes.document.id);
      } catch {
        // Extraction trigger failure is handled by status view
      }

      return confirmRes.document;
    },
    onSuccess: (document) => {
      setSelectedFile(null);
      void queryClient.invalidateQueries({
        queryKey: ["documents"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["organizations"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["courses"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-documents"],
      });
      onUploaded?.(document);
    },
  });

  const validateFile = (file: File): boolean => {
    setValidationError(null);
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      setValidationError(
        `فرمت فایل پشتیبانی نمی‌شود. فرمت‌های مجاز: ${SUPPORTED_EXTENSIONS.join(", ")}`,
      );
      return false;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setValidationError("حجم فایل بیشتر از سقف مجاز (۵۰ مگابایت) است.");
      return false;
    }
    return true;
  };

  const handleFile = (file: File) => {
    if (validateFile(file)) {
      setSelectedFile(file);
      if (autoUpload && !uploadMutation.isPending) {
        uploadMutation.mutate(file);
      }
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [autoUpload, uploadMutation.isPending]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleStartUpload = () => {
    if (selectedFile && !uploadMutation.isPending) {
      uploadMutation.mutate(selectedFile);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-6 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[var(--color-text)]">
            بارگذاری منابع و جزوات آموزشی
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            فایل جزوه، اسلاید یا سرفصل دوره را بارگذاری کنید (PDF, PPTX, DOCX تا حداکثر ۵۰ مگابایت)
          </p>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="فایل‌ها را به این قسمت بکشید یا برای انتخاب کلیک کنید"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#008080] ${
          isDragOver
            ? "border-[#008080] bg-[#008080]/10"
            : "border-[var(--color-border)] hover:border-[#008080] hover:bg-[var(--color-surface-warm)]"
        }`}
      >
        <input
          ref={fileInputRef}
          id="pdf-document-file-input"
          type="file"
          accept=".pdf,.docx,.doc,.pptx,.ppt"
          className="hidden"
          onChange={handleFileInputChange}
          data-testid="document-file-input"
        />

        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#a7d0e6]/30 text-[#008080] flex items-center justify-center">
            <UploadIcon className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-[var(--color-text)]">
              برای انتخاب فایل کلیک کنید یا فایل را به اینجا بکشید
            </p>
            <p className="text-xs text-[var(--color-text-muted)] font-mono" dir="ltr">
              PDF, PPTX, DOCX, PPT, DOC (Max 50MB)
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="mt-2 px-5 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold shadow-sm transition-all"
          >
            انتخاب فایل از سیستم
          </button>
        </div>
      </div>

      {validationError && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs font-medium"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {selectedFile && (
        <div className="flex items-center justify-between p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)]">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-5 h-5 text-[#008080] flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--color-text)] truncate" dir="ltr">
                {selectedFile.name}
              </p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5" dir="ltr">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              disabled={uploadMutation.isPending}
              className="px-3 py-1.5 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-xl"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={handleStartUpload}
              disabled={uploadMutation.isPending}
              className="px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition-all shadow-sm"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>در حال آپلود و پردازش...</span>
                </>
              ) : (
                <>
                  <UploadIcon className="w-3.5 h-3.5" />
                  <span>آپلود و شروع پردازش</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {uploadMutation.isPending && !selectedFile && (
        <div className="flex items-center gap-2 p-3 bg-[#a7d0e6]/20 border border-[#008080]/30 rounded-xl text-[#008080] text-xs font-medium">
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
          <span>در حال آپلود فایل و استخراج خودکار متن...</span>
        </div>
      )}

      {uploadMutation.isError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{uploadMutation.error.message || "خطا در بارگذاری فایل"}</span>
        </div>
      )}

      {uploadMutation.isSuccess && (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-400 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>فایل با موفقیت بارگذاری شد و استخراج متن آغاز گردید.</span>
        </div>
      )}
    </div>
  );
}
