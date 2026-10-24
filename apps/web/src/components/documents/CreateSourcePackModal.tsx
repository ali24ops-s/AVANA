import { useState, useRef } from "react";
import {
  Upload as UploadIcon,
  X,
  FileText,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Trash2,
  Plus,
  BookOpen,
  HelpCircle,
  BookmarkCheck,
  Layers,
  Sparkles,
  Info,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createDocumentsApi } from "../../lib/api/documents.js";
import { createSourcePacksApi } from "../../lib/api/source-packs.js";
import type { DocumentResource, SourcePackRole } from "@avana/contracts";
import { toPersianDigits, type SourceRole } from "@avana/domain";

interface PendingSourceDoc {
  file?: File;
  existingDoc?: DocumentResource;
  name: string;
  sizeBytes: number;
  uploadedDocId?: string;
  role: SourceRole;
  status: "idle" | "uploading" | "uploaded" | "error";
  error?: string;
}

interface CreateSourcePackModalProps {
  organizationId: string;
  courseId: string;
  existingDocuments?: DocumentResource[];
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".pptx", ".ppt"];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

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

export function CreateSourcePackModal({
  organizationId,
  courseId,
  existingDocuments = [],
  isOpen,
  onClose,
  onCreated,
}: CreateSourcePackModalProps) {
  const [title, setTitle] = useState("پک منابع درس");
  const [docs, setDocs] = useState<PendingSourceDoc[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExistingPicker, setShowExistingPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const docsApi = createDocumentsApi(apiClient);
  const packApi = createSourcePacksApi(apiClient);

  // Reset state when modal is opened afresh
  const prevOpenRef = useRef(isOpen);
  if (isOpen && !prevOpenRef.current) {
    // Modal just opened
    if (docs.length > 0) {
      setDocs([]);
      setTitle("پک منابع درس");
      setValidationError(null);
      setIsSubmitting(false);
      setShowExistingPicker(false);
    }
  }
  prevOpenRef.current = isOpen;

  if (!isOpen) return null;

  const handleFiles = (fileList: FileList | File[]) => {
    setValidationError(null);
    const newItems: PendingSourceDoc[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (docs.length + newItems.length >= 10) {
        setValidationError("حداکثر ۱۰ فایل را می‌توانید اضافه کنید.");
        break;
      }

      const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        setValidationError(`فرمت فایل ${file.name} پشتیبانی نمی‌شود.`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setValidationError(`حجم فایل ${file.name} بیشتر از سقف ۵۰ مگابایت است.`);
        continue;
      }

      const isFirst = docs.length === 0 && newItems.length === 0;
      newItems.push({
        file,
        name: file.name,
        sizeBytes: file.size,
        role: isFirst ? "primary_notes" : "supplementary_reference",
        status: "idle",
      });
    }

    setDocs((prev) => [...prev, ...newItems]);
  };

  const handleSelectExisting = (doc: DocumentResource) => {
    if (docs.length >= 10) {
      setValidationError("حداکثر ۱۰ فایل در یک پک مجاز است.");
      return;
    }
    if (docs.some((d) => d.uploadedDocId === doc.id || d.existingDoc?.id === doc.id)) {
      setValidationError("این فایل قبلاً اضافه شده است.");
      return;
    }

    const isFirst = docs.length === 0;
    setDocs((prev) => [
      ...prev,
      {
        existingDoc: doc,
        uploadedDocId: doc.id,
        name: doc.original_name,
        sizeBytes: doc.size_bytes,
        role: isFirst ? "primary_notes" : "supplementary_reference",
        status: "uploaded",
      },
    ]);
    setShowExistingPicker(false);
  };

  const handleRoleChange = (index: number, newRole: SourceRole) => {
    setDocs((prev) => {
      const updated = [...prev];
      const currentItem = updated[index];
      if (!currentItem) return prev;

      const previousRole = currentItem.role;
      if (previousRole === newRole) return prev;

      // 1. If newRole is a unique role (primary_notes, question_template, primary_reference),
      // any other document currently having that role must be demoted to supplementary_reference
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

      // 2. If the document was primary_notes and is being changed to something else,
      // another document MUST become primary_notes so exactly one primary_notes exists.
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

  const removeDoc = (index: number) => {
    setDocs((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length > 0 && !updated.some((d) => d.role === "primary_notes")) {
        updated[0].role = "primary_notes";
      }
      return updated;
    });
  };

  const handleSubmit = async () => {
    if (docs.length < 1) {
      setValidationError("لطفاً حداقل یک فایل به درس اضافه کنید.");
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      // 1. Upload pending files and trigger extraction
      const readyDocs: Array<{ id: string; role: SourceRole }> = [];

      for (let i = 0; i < docs.length; i++) {
        const item = docs[i];
        if (item.uploadedDocId) {
          readyDocs.push({ id: item.uploadedDocId, role: item.role });
          continue;
        }

        if (item.file) {
          setDocs((prev) =>
            prev.map((d, idx) => (idx === i ? { ...d, status: "uploading" } : d)),
          );

          try {
            const uploadRes = await docsApi.uploadDocument(organizationId, item.file, courseId);
            const uploadedId = uploadRes.document.id;

            // Trigger extraction automatically upon upload
            try {
              await docsApi.triggerExtraction(organizationId, uploadedId);
            } catch {
              // Extraction trigger non-blocking for status view
            }

            readyDocs.push({ id: uploadedId, role: item.role });

            setDocs((prev) =>
              prev.map((d, idx) =>
                idx === i
                  ? { ...d, status: "uploaded", uploadedDocId: uploadedId }
                  : d,
              ),
            );
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "خطا در آپلود";
            setDocs((prev) =>
              prev.map((d, idx) =>
                idx === i
                  ? {
                      ...d,
                      status: "error",
                      error: msg,
                    }
                  : d,
              ),
            );
            throw new Error(`خطا در آپلود فایل ${item.name}: ${msg}`);
          }
        }
      }

      // 2. Single-source branch: Do NOT create a 1-document Source Pack!
      // The single document is uploaded and extraction is triggered.
      // It is ready for the standard single-source generation flow.
      if (readyDocs.length === 1) {
        queryClient.invalidateQueries({ queryKey: ["course-documents", organizationId, courseId] });
        queryClient.invalidateQueries({ queryKey: ["documents"] });
        onCreated?.();
        onClose();
        return;
      }

      // 3. Multi-source branch: Prepare payload for Source Pack creation
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
        title: title.trim() || "پک منابع درس",
        documents: documentsPayload,
      });

      queryClient.invalidateQueries({ queryKey: ["source-packs", courseId] });
      queryClient.invalidateQueries({ queryKey: ["course-documents", organizationId, courseId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : "خطا در ثبت منبع");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isMultiSource = docs.length >= 2;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-3xl border border-[#E2E7EA] shadow-2xl p-5 sm:p-7 text-right space-y-6 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E7EA]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#008080]/10 flex items-center justify-center text-[#008080]">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">
                {isMultiSource ? "پک منابع یکپارچه" : "افزودن منبع به درس"}
              </h3>
              <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                {isMultiSource
                  ? "منابع را برای تولید یکپارچه محتوا کنار هم قرار دهید."
                  : "فایل جزوه، اسلاید یا کتاب درسی را برای تولید محتوا انتخاب کنید."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Title Input: Only visible in multi-source mode */}
        {isMultiSource && (
          <div>
            <label className="block text-xs font-bold text-gray-800 mb-1.5">
              عنوان پک منابع
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              placeholder="مثال: جزوه و اسلایدهای فصل دوم شیمی"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-[#E2E7EA] bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#008080]/20 focus:border-[#008080] transition"
            />
          </div>
        )}

        {/* Hidden file input for file selection */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.pptx,.ppt"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              handleFiles(e.target.files);
            }
          }}
        />

        {/* Dropzone (shown when docs count is 0) */}
        {docs.length === 0 && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (e.dataTransfer.files) {
                handleFiles(e.dataTransfer.files);
              }
            }}
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all bg-white ${
              isDragOver
                ? "border-[#008080] bg-[#008080]/5"
                : "border-[#E2E7EA] hover:border-[#008080]/60 hover:bg-gray-50/80"
            }`}
            onClick={() => !isSubmitting && fileInputRef.current?.click()}
          >
            <div className="w-12 h-12 mx-auto rounded-full bg-[#008080]/10 border border-[#008080]/20 flex items-center justify-center text-[#008080] mb-3">
              <UploadIcon className="w-6 h-6" />
            </div>
            <p className="text-xs sm:text-sm font-bold text-gray-900 mb-1">
              فایل جزوه، اسلاید، نمونه سؤال یا کتاب را بکشید یا انتخاب کنید
            </p>
            <p className="text-[11px] text-gray-500 font-medium">
              پشتیبانی از فرمت‌های PDF، DOCX، PPTX تا سقف ۵۰ مگابایت برای هر فایل
            </p>
          </div>
        )}

        {/* Existing Documents Picker Button (when 0 docs or adding more) */}
        {existingDocuments.length > 0 && docs.length < 10 && (
          <div className="flex justify-between items-center text-xs">
            <button
              type="button"
              onClick={() => setShowExistingPicker(!showExistingPicker)}
              className="text-[#008080] hover:text-[#006060] flex items-center gap-1.5 font-bold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>انتخاب از میان فایل‌های قبلاً آپلودشده در این درس ({toPersianDigits(existingDocuments.length)})</span>
            </button>
          </div>
        )}

        {/* Existing Docs Accordion */}
        {showExistingPicker && (
          <div className="p-3 bg-gray-50 rounded-2xl border border-[#E2E7EA] max-h-44 overflow-y-auto space-y-1.5 text-xs">
            {existingDocuments.map((doc) => {
              const alreadyAdded = docs.some(
                (d) => d.uploadedDocId === doc.id || d.existingDoc?.id === doc.id,
              );
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-2 rounded-xl bg-white border border-[#E2E7EA] hover:border-[#008080]/40 transition shadow-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                    <span className="truncate font-medium text-gray-800">{doc.original_name}</span>
                  </div>
                  <button
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => handleSelectExisting(doc)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      alreadyAdded
                        ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                        : "bg-[#008080] text-white hover:bg-[#007070] shadow-xs"
                    }`}
                  >
                    {alreadyAdded ? "اضافه شده" : "افزودن"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Document Cards Section */}
        {docs.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="font-bold text-gray-800">
                {isMultiSource
                  ? `منابع این تولید (${toPersianDigits(docs.length)} از ۱۰)`
                  : "منبع انتخاب‌شده"}
              </span>
              <span className="text-[11px] text-gray-500 font-medium flex items-center gap-1">
                <Info className="w-3 h-3 text-gray-400" />
                <span>
                  {isMultiSource
                    ? "مشخص می‌کند هر منبع چه نقشی در تولید یکپارچه محتوا دارد"
                    : "منبع اولیه به عنوان جزوه اصلی در نظر گرفته می‌شود"}
                </span>
              </span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
              {docs.map((item, idx) => (
                <div
                  key={idx}
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
                      <p className="text-xs sm:text-sm font-bold text-gray-900 truncate">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-500 font-medium">
                          {(item.sizeBytes / 1024 / 1024).toFixed(1)} مگابایت
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

                  {/* Role Selector & Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                    {/* Role Selector: Only shown when multi-source (2+ files) */}
                    {isMultiSource ? (
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] text-gray-500 font-medium">نقش:</label>
                        <select
                          disabled={isSubmitting}
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
                    ) : (
                      <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-800 border border-amber-300 flex items-center gap-1 shadow-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                        <span>جزوه اصلی</span>
                      </span>
                    )}

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => removeDoc(idx)}
                      className="p-1.5 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                      title="حذف فایل"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* "+ افزودن منبع دیگر" CTA */}
            {docs.length < 10 && (
              <button
                type="button"
                onClick={() => !isSubmitting && fileInputRef.current?.click()}
                className="w-full py-2.5 px-3 rounded-2xl border-2 border-dashed border-[#E2E7EA] hover:border-[#008080] hover:bg-[#008080]/5 text-[#008080] text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>+ افزودن منبع دیگر</span>
              </button>
            )}
          </div>
        )}

        {/* Validation Error Alert */}
        {validationError && (
          <div className="flex items-center gap-2 p-3 text-xs rounded-2xl bg-red-50 border border-red-200 text-red-700 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-[#E2E7EA]">
          <span className="text-xs text-gray-500 font-medium">
            {isMultiSource ? (
              <span className="flex items-center gap-1 text-[#008080] font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>تولید محتوای یکپارچه فعال است</span>
              </span>
            ) : docs.length === 1 ? (
              <span>منبع اول به عنوان جزوه اصلی ثبت خواهد شد</span>
            ) : null}
          </span>

          <div className="flex items-center gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-[#E2E7EA] bg-white hover:bg-gray-50 transition text-gray-700"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || docs.length === 0}
              className="px-5 py-2 text-xs sm:text-sm font-bold rounded-xl bg-[#008080] text-white hover:bg-[#007575] active:bg-[#006060] transition flex items-center gap-2 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isMultiSource ? "در حال ثبت پک منابع..." : "در حال بارگذاری منبع..."}
                </>
              ) : isMultiSource ? (
                "ایجاد پک منابع یکپارچه"
              ) : (
                "بارگذاری و ثبت منبع"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
