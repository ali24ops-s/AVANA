import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  AlertCircle,
  UploadCloud,
  Sparkles,
  Layers,
  Plus,
  Trash2,
  BookOpen,
  HelpCircle,
  BookmarkCheck,
  CheckCircle2,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createDocumentsApi } from "../../lib/api/documents.js";
import { createGenerationApi } from "../../lib/api/generation.js";
import { createSourcePacksApi } from "../../lib/api/source-packs.js";
import { DocumentUploader } from "./DocumentUploader.js";
import { DocumentStatusCard } from "./DocumentStatusCard.js";
import { SourcePackCard } from "./SourcePackCard.js";
import type { DocumentResource, SourcePackRole } from "@avana/contracts";
import { toPersianDigits, type SourceRole } from "@avana/domain";

const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".pptx", ".ppt"];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

interface PendingMultiDoc {
  file: File;
  name: string;
  sizeBytes: number;
  role: SourceRole;
  status: "idle" | "uploading" | "uploaded" | "error";
  error?: string;
  uploadedDocId?: string;
}

const ROLE_OPTIONS: Array<{
  role: SourceRole;
  label: string;
  hint: string;
}> = [
  {
    role: "primary_notes",
    label: "جزوه اصلی",
    hint: "ستون فقرات آموزش، ترتیب مباحث و ساختار سرفصل‌ها",
  },
  {
    role: "question_template",
    label: "قالب سؤالات",
    hint: "نمونه سؤال و آزمون برای استخراج سبک و نحوه طرح تست‌ها",
  },
  {
    role: "primary_reference",
    label: "رفرنس اصلی",
    hint: "کتاب مرجع برای راستی‌آزمایی علمی و رفع ابهامات جزوه",
  },
  {
    role: "supplementary_reference",
    label: "رفرنس تکمیلی",
    hint: "منبع کمکی برای مثال‌ها، توضیحات بیشتر و نکات کاربردی",
  },
];

const getRoleIcon = (role: SourceRole) => {
  switch (role) {
    case "primary_notes":
      return <BookOpen className="w-4 h-4 text-amber-600" />;
    case "question_template":
      return <HelpCircle className="w-4 h-4 text-purple-600" />;
    case "primary_reference":
      return <BookmarkCheck className="w-4 h-4 text-blue-600" />;
    case "supplementary_reference":
    default:
      return <Layers className="w-4 h-4 text-emerald-600" />;
  }
};

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
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [multiGenError, setMultiGenError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<"single" | "multi">("single");
  const [packTitle, setPackTitle] = useState("پک منابع درس");
  const [multiDocs, setMultiDocs] = useState<PendingMultiDoc[]>([]);
  const [isSubmittingPack, setIsSubmittingPack] = useState(false);
  const [multiDragOver, setMultiDragOver] = useState(false);
  const [multiValidationError, setMultiValidationError] = useState<string | null>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const apiClient = useMemo(() => createApiClient({ baseUrl: getApiBaseUrl() }), []);
  const docsApi = useMemo(() => createDocumentsApi(apiClient), [apiClient]);
  const genApi = useMemo(() => createGenerationApi(apiClient), [apiClient]);
  const packApi = useMemo(() => createSourcePacksApi(apiClient), [apiClient]);

  // Clear local docs when switching course
  useEffect(() => {
    setLocalDocs([]);
    setSelectedDocIds([]);
    setMultiDocs([]);
    setUploadMode("single");
  }, [courseId]);

  // 1. Fetch course documents strictly filtered to current courseId
  const docsQuery = useQuery({
    queryKey: ["course-documents", organizationId, courseId],
    queryFn: async () => {
      const courseRes = await docsApi.listDocuments(organizationId, {
        courseId,
        limit: 100,
      });
      return courseRes.items;
    },
    refetchInterval: 3000,
  });

  // 2. Fetch source packs for this course
  const packsQuery = useQuery({
    queryKey: ["source-packs", courseId],
    queryFn: async () => {
      return await packApi.listSourcePacks(organizationId, courseId);
    },
    refetchInterval: 5000,
  });

  const serverDocs = docsQuery.data ?? [];
  const allDocsMap = new Map<string, DocumentResource>();
  for (const doc of [...localDocs, ...serverDocs]) {
    if (doc.course_id === courseId) {
      allDocsMap.set(doc.id, doc);
    }
  }
  const documentsList = Array.from(allDocsMap.values());
  const sourcePacksList = packsQuery.data ?? [];

  const toggleSelect = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId],
    );
  };

  const multiGenerateMutation = useMutation({
    mutationFn: async () => {
      setMultiGenError(null);
      const sources = selectedDocIds.map((id, index) => ({
        documentId: id,
        order: index,
      }));
      return genApi.triggerMultiSourceGeneration(organizationId, courseId, {
        sources,
        types: ["lesson", "flashcard", "quiz", "review_summary"],
      });
    },
    onSuccess: () => {
      setSelectedDocIds([]);
      void queryClient.invalidateQueries({
        queryKey: ["course-documents", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["active-generations"],
      });
      if (onNavigateToReview) {
        onNavigateToReview();
      }
    },
    onError: (err: Error) => {
      setMultiGenError(err.message || "خطا در شروع تولید محتوای چندسندی");
    },
  });

  const handleAddMultiFiles = (files: FileList | File[]) => {
    setMultiValidationError(null);
    const newItems: PendingMultiDoc[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (multiDocs.length + newItems.length >= 10) {
        setMultiValidationError("حداکثر ۱۰ فایل را می‌توانید اضافه کنید.");
        break;
      }

      const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        setMultiValidationError(`فرمت فایل ${file.name} پشتیبانی نمی‌شود.`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setMultiValidationError(`حجم فایل ${file.name} بیشتر از سقف ۵۰ مگابایت است.`);
        continue;
      }

      const isFirst = multiDocs.length === 0 && newItems.length === 0;
      newItems.push({
        file,
        name: file.name,
        sizeBytes: file.size,
        role: isFirst ? "primary_notes" : "supplementary_reference",
        status: "idle",
      });
    }

    const updated = [...multiDocs, ...newItems];

    if (updated.length === 1 && multiDocs.length === 0) {
      setUploadMode("single");
      setMultiDocs([]);
      return;
    }

    if (updated.length >= 2) {
      setUploadMode("multi");
      setMultiDocs(updated);
    }
  };

  const handleMultiDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMultiDragOver(true);
  };

  const handleMultiDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMultiDragOver(false);
  };

  const handleMultiDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMultiDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddMultiFiles(e.dataTransfer.files);
    }
  };

  const handleMultiFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleAddMultiFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleRoleChange = (index: number, newRole: SourceRole) => {
    setMultiDocs((prev) => {
      const updated = [...prev];
      const currentItem = updated[index];
      if (!currentItem) return prev;

      const previousRole = currentItem.role;
      if (previousRole === newRole) return prev;

      // Unique roles: primary_notes, question_template, primary_reference
      if (
        newRole === "primary_notes" ||
        newRole === "question_template" ||
        newRole === "primary_reference"
      ) {
        updated.forEach((d, i) => {
          if (i !== index && d.role === newRole) {
            d.role = "supplementary_reference";
          }
        });
      }

      // If previous was primary_notes and changed to something else,
      // another document MUST become primary_notes
      if (previousRole === "primary_notes" && newRole !== "primary_notes") {
        const nextPrimaryIndex = updated.findIndex((_d, i) => i !== index);
        if (nextPrimaryIndex !== -1) {
          updated[nextPrimaryIndex].role = "primary_notes";
        }
      }

      currentItem.role = newRole;
      return updated;
    });
  };

  const removeMultiDoc = (index: number) => {
    setMultiDocs((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length <= 1) {
        setUploadMode("single");
        return [];
      }
      if (!updated.some((d) => d.role === "primary_notes")) {
        updated[0].role = "primary_notes";
      }
      return updated;
    });
  };

  const handleCreateSourcePack = async () => {
    if (multiDocs.length < 2) {
      setMultiValidationError("لطفاً حداقل دو فایل برای ایجاد پک منابع انتخاب کنید.");
      return;
    }

    setIsSubmittingPack(true);
    setMultiValidationError(null);

    try {
      const readyDocs: Array<{ id: string; role: SourceRole }> = [];

      for (let i = 0; i < multiDocs.length; i++) {
        const item = multiDocs[i];
        if (item.uploadedDocId) {
          readyDocs.push({ id: item.uploadedDocId, role: item.role });
          continue;
        }

        setMultiDocs((prev) =>
          prev.map((d, idx) => (idx === i ? { ...d, status: "uploading" } : d)),
        );

        try {
          const uploadRes = await docsApi.uploadDocument(organizationId, item.file, courseId);
          const uploadedId = uploadRes.document.id;

          try {
            await docsApi.triggerExtraction(organizationId, uploadedId);
          } catch {
            // Non-blocking
          }

          readyDocs.push({ id: uploadedId, role: item.role });

          setMultiDocs((prev) =>
            prev.map((d, idx) =>
              idx === i
                ? { ...d, status: "uploaded", uploadedDocId: uploadedId }
                : d,
            ),
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "خطا در آپلود";
          setMultiDocs((prev) =>
            prev.map((d, idx) =>
              idx === i ? { ...d, status: "error", error: msg } : d,
            ),
          );
          throw new Error(`خطا در آپلود فایل ${item.name}: ${msg}`);
        }
      }

      const primaryDoc = readyDocs.find((d) => d.role === "primary_notes") ?? readyDocs[0];
      const otherDocs = readyDocs.filter((d) => d.id !== primaryDoc.id);

      const documentsPayload = [
        {
          document_id: primaryDoc.id,
          role: "primary_notes" as SourcePackRole,
          order_index: 0,
        },
        ...otherDocs.map((d, idx) => ({
          document_id: d.id,
          role: d.role as SourcePackRole,
          order_index: idx + 1,
        })),
      ];

      await packApi.createSourcePack(organizationId, courseId, {
        title: packTitle.trim() || "پک منابع درس",
        documents: documentsPayload,
      });

      void queryClient.invalidateQueries({ queryKey: ["source-packs", courseId] });
      void queryClient.invalidateQueries({ queryKey: ["course-documents", organizationId, courseId] });
      void queryClient.invalidateQueries({ queryKey: ["documents"] });

      setMultiDocs([]);
      setPackTitle("پک منابع درس");
      setUploadMode("single");
    } catch (err: unknown) {
      setMultiValidationError(err instanceof Error ? err.message : "خطا در ثبت پک منابع");
    } finally {
      setIsSubmittingPack(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Unified Document Upload Box (Single & Multi-File) */}
      {uploadMode === "single" ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setUploadMode("multi")}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#008080] hover:text-[#006666] bg-teal-50 hover:bg-teal-100 border border-teal-200/80 rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>تولید محتوا از چند فایل</span>
            </button>
          </div>
          <DocumentUploader
            organizationId={organizationId}
            courseId={courseId}
            onUploaded={(newDoc) => {
              setLocalDocs((prev) => [newDoc, ...prev.filter((d) => d.id !== newDoc.id)]);
              void docsQuery.refetch();
            }}
          />
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-[#E2E7EA] p-5 sm:p-7 space-y-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E2E7EA]">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#008080]/10 flex items-center justify-center text-[#008080]">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-gray-900">
                  بارگذاری منابع و جزوات آموزشی
                </h3>
                <span className="text-[11px] font-bold text-[#008080] bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                  حالت چندفایلی
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                چندین فایل جزوه، اسلاید یا سرفصل را انتخاب کنید تا به صورت یکپارچه پردازش شوند (حداکثر ۱۰ فایل، تا ۵۰ مگابایت برای هر فایل)
              </p>
            </div>

            <button
              type="button"
              disabled={isSubmittingPack}
              onClick={() => {
                setUploadMode("single");
                setMultiDocs([]);
                setMultiValidationError(null);
              }}
              className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl border border-[#E2E7EA] transition-colors shrink-0 cursor-pointer"
            >
              <span>بازگشت به حالت یک فایل</span>
            </button>
          </div>

          {/* Hidden multi-file input */}
          <input
            ref={multiFileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.pptx,.ppt"
            className="hidden"
            onChange={handleMultiFileInputChange}
          />

          {/* Dropzone: Shown when 0 docs */}
          {multiDocs.length === 0 && (
            <div
              role="button"
              tabIndex={0}
              aria-label="فایل‌ها را به این قسمت بکشید یا برای انتخاب کلیک کنید"
              onDragOver={handleMultiDragOver}
              onDragLeave={handleMultiDragLeave}
              onDrop={handleMultiDrop}
              onClick={() => !isSubmittingPack && multiFileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  multiFileInputRef.current?.click();
                }
              }}
              className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#008080] bg-white ${
                multiDragOver
                  ? "border-[#008080] bg-teal-50/50"
                  : "border-[#E2E7EA] hover:border-[#008080] hover:bg-slate-50"
              }`}
            >
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-[#008080] flex items-center justify-center">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-bold text-gray-900">
                    برای انتخاب حداقل دو فایل کلیک کنید یا فایل‌ها را به اینجا بکشید
                  </p>
                  <p className="text-[11px] sm:text-xs text-gray-500 font-mono" dir="ltr">
                    PDF, PPTX, DOCX, PPT, DOC (Max 50MB per file)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    multiFileInputRef.current?.click();
                  }}
                  className="mt-1 sm:mt-2 px-5 py-2.5 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold shadow-xs transition-all w-full sm:w-auto"
                >
                  انتخاب چند فایل از سیستم
                </button>
              </div>
            </div>
          )}

          {/* Document list with roles (when docs are present) */}
          {multiDocs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="font-bold text-gray-800">
                  فایل‌های انتخاب‌شده ({toPersianDigits(multiDocs.length)} از ۱۰)
                </span>
                <button
                  type="button"
                  disabled={isSubmittingPack}
                  onClick={() => {
                    setUploadMode("single");
                    setMultiDocs([]);
                  }}
                  className="text-xs text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
                >
                  حذف همه
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                {multiDocs.map((item, idx) => (
                  <div
                    key={`${item.name}-${idx}`}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border transition shadow-xs ${
                      item.role === "primary_notes"
                        ? "bg-amber-500/5 border-amber-300 ring-1 ring-amber-400/30"
                        : "bg-white border-[#E2E7EA] hover:border-gray-300"
                    }`}
                  >
                    {/* File info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          item.role === "primary_notes"
                            ? "bg-amber-100 border-amber-200 text-amber-700"
                            : item.role === "question_template"
                            ? "bg-purple-100 border-purple-200 text-purple-700"
                            : item.role === "primary_reference"
                            ? "bg-blue-100 border-blue-200 text-blue-700"
                            : "bg-gray-100 border-gray-200 text-gray-700"
                        }`}
                      >
                        {getRoleIcon(item.role)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-bold text-gray-900 truncate" dir="ltr">
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-500 font-mono" dir="ltr">
                            {(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                          </span>
                          {item.status === "uploading" && (
                            <span className="text-[10px] text-[#008080] font-bold flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> در حال آپلود...
                            </span>
                          )}
                          {item.status === "uploaded" && (
                            <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3" /> آماده
                            </span>
                          )}
                          {item.status === "error" && (
                            <span className="text-[10px] text-red-600 font-bold">
                              {item.error}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Role Selector & Remove */}
                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] text-gray-500 font-medium">نقش:</label>
                        <select
                          disabled={isSubmittingPack}
                          value={item.role}
                          onChange={(e) => handleRoleChange(idx, e.target.value as SourceRole)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl border focus:outline-none transition cursor-pointer ${
                            item.role === "primary_notes"
                              ? "bg-amber-500/10 text-amber-800 border-amber-300 focus:ring-2 focus:ring-amber-400/20"
                              : item.role === "question_template"
                              ? "bg-purple-500/10 text-purple-800 border-purple-300 focus:ring-2 focus:ring-purple-400/20"
                              : item.role === "primary_reference"
                              ? "bg-blue-500/10 text-blue-800 border-blue-300 focus:ring-2 focus:ring-blue-400/20"
                              : "bg-gray-50 text-gray-700 border-gray-200 focus:ring-2 focus:ring-[#008080]/20"
                          }`}
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.role} value={opt.role}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        disabled={isSubmittingPack}
                        onClick={() => removeMultiDoc(idx)}
                        className="p-1.5 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                        title="حذف فایل"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add more files CTA */}
              {multiDocs.length < 10 && (
                <button
                  type="button"
                  disabled={isSubmittingPack}
                  onClick={() => multiFileInputRef.current?.click()}
                  className="w-full py-2 px-3 rounded-xl border-2 border-dashed border-[#E2E7EA] hover:border-[#008080] hover:bg-[#008080]/5 text-[#008080] text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ افزودن فایل دیگر</span>
                </button>
              )}

              {/* Source Pack Title Field */}
              <div className="space-y-1.5 pt-3 border-t border-[#E2E7EA]">
                <label className="block text-xs font-bold text-gray-800">
                  عنوان پک منابع
                </label>
                <input
                  type="text"
                  value={packTitle}
                  onChange={(e) => setPackTitle(e.target.value)}
                  disabled={isSubmittingPack}
                  placeholder="مثال: جزوه و اسلایدهای فصل دوم شیمی"
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-[#E2E7EA] bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#008080]/20 focus:border-[#008080] transition"
                />
              </div>

              {/* Footer Actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-[#E2E7EA]">
                <span className="text-xs text-gray-500 font-medium flex items-center gap-1 text-[#008080] font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>تولید محتوای یکپارچه از {toPersianDigits(multiDocs.length)} منبع</span>
                </span>

                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    disabled={isSubmittingPack}
                    onClick={() => {
                      setUploadMode("single");
                      setMultiDocs([]);
                      setMultiValidationError(null);
                    }}
                    className="px-4 py-2 text-xs font-semibold rounded-xl border border-[#E2E7EA] bg-white hover:bg-gray-50 text-gray-700 transition cursor-pointer"
                  >
                    انصراف
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingPack || multiDocs.length < 2}
                    onClick={handleCreateSourcePack}
                    className="px-5 py-2.5 text-xs font-bold rounded-xl bg-[#008080] text-white hover:bg-[#007575] active:bg-[#006060] transition flex items-center justify-center gap-2 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSubmittingPack ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>در حال ایجاد پک منابع...</span>
                      </>
                    ) : (
                      <span>ایجاد پک منابع یکپارچه</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Validation error */}
          {multiValidationError && (
            <div
              role="alert"
              className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
              <span>{multiValidationError}</span>
            </div>
          )}
        </div>
      )}

      {/* Sticky Multi-source selection bar (for ad-hoc selection of individual documents) */}
      {selectedDocIds.length >= 2 && (
        <div className="sticky top-4 z-20 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-2xl shadow-lg transition-all animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#008080] text-white flex items-center justify-center shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-teal-950 dark:text-teal-100">
                تولید محتوای منسجم از {toPersianDigits(selectedDocIds.length)} منبع
              </h4>
              <p className="text-xs text-teal-700 dark:text-teal-300">
                یک سرفصل یکپارچه، درسنامه، فلش‌کارت و آزمون واحد از ترکیب منابع انتخاب‌شده تولید می‌شود.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setSelectedDocIds([])}
              className="px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-xl transition-colors"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={() => multiGenerateMutation.mutate()}
              disabled={multiGenerateMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {multiGenerateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در حال صف‌بندی...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>شروع تولید یکپارچه</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {multiGenError && (
        <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-400 text-xs flex items-center justify-between">
          <span>{multiGenError}</span>
          <button
            type="button"
            onClick={() => setMultiGenError(null)}
            className="text-red-800 dark:text-red-200 font-bold hover:underline"
          >
            بستن
          </button>
        </div>
      )}

      {/* Documents and Source Packs List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--color-text)]">
            تمام اسناد و فایل‌های درس
          </h3>
          <span className="text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface)] px-3 py-1 rounded-xl border border-[var(--color-border)]">
            {toPersianDigits(documentsList.length + sourcePacksList.length)} منبع
          </span>
        </div>

        {docsQuery.isLoading && documentsList.length === 0 && sourcePacksList.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#008080]" />
          </div>
        )}

        {docsQuery.isError && documentsList.length === 0 && sourcePacksList.length === 0 && (
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

        {documentsList.length === 0 && sourcePacksList.length === 0 && !docsQuery.isLoading && (
          <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center">
            <UploadCloud className="w-10 h-10 text-[var(--color-text-muted)] mx-auto mb-3" />
            <h4 className="text-sm font-bold text-[var(--color-text)]">
              هنوز سندی بارگذاری نشده است
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              برای تولید و ساختاردهی محتوای آموزشی، فایل‌ها و جزوات درسی را از کادر بارگذاری بالا اضافه نمایید.
            </p>
          </div>
        )}

        {(documentsList.length > 0 || sourcePacksList.length > 0) && (
          <div className="grid gap-4">
            {sourcePacksList.map((pack) => (
              <SourcePackCard
                key={pack.id}
                pack={pack}
                organizationId={organizationId}
                courseId={courseId}
                onGenerationStarted={() => {
                  if (onNavigateToReview) {
                    onNavigateToReview();
                  }
                }}
              />
            ))}
            {documentsList.map((doc: DocumentResource) => {
              const isSelectable =
                doc.status === "extracted" ||
                doc.status === "review_pending" ||
                doc.status === "ready";
              return (
                <DocumentStatusCard
                  key={doc.id}
                  document={doc}
                  organizationId={organizationId}
                  courseId={courseId}
                  onNavigateToReview={onNavigateToReview}
                  isSelectable={isSelectable}
                  isSelected={selectedDocIds.includes(doc.id)}
                  onToggleSelect={toggleSelect}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
