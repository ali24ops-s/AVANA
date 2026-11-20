import React, { useState, useRef } from "react";
import {
  BookOpen,
  Plus,
  Trash2,
  FileText,
  Globe,
  Hash,
  AlertCircle,
  CheckCircle2,
  X,
  UploadCloud,
} from "lucide-react";
import type {
  CreatePresentationReferenceRequest,
} from "@avana/contracts";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Input,
  Badge,
  Alert,
  AvanaSelect,
} from "../ui/index.js";
import {
  usePresentationReferences,
  useCreatePresentationReference,
  useDeletePresentationReference,
  useUploadPresentationReference,
} from "../../hooks/usePresentation.js";
import {
  toPersianDigits,
  REFERENCE_TYPE_LABELS,
} from "./presentation-utils.js";

const REFERENCE_TYPE_OPTIONS = [
  { value: "pdf", label: "سند علمی PDF (بارگذاری و استخراج خودکار)" },
  { value: "docx", label: "فایل متنی Word (.docx) (بارگذاری و استخراج خودکار)" },
  { value: "doi", label: "شناسه مقاله بین‌المللی DOI" },
  { value: "pubmed", label: "شناسه مقاله PubMed (PMID)" },
  { value: "url", label: "آدرس صفحه اینترنتی (URL)" },
  { value: "text", label: "یادداشت یا متن مرجع مستقیم" },
];

interface PresentationReferencesDrawerProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const PresentationReferencesDrawer: React.FC<
  PresentationReferencesDrawerProps
> = ({ projectId, isOpen, onClose }) => {
  const { data, isLoading } = usePresentationReferences(projectId);
  const createMutation = useCreatePresentationReference(projectId);
  const deleteMutation = useDeletePresentationReference(projectId);
  const uploadMutation = useUploadPresentationReference(projectId);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [refType, setRefType] = useState<CreatePresentationReferenceRequest["type"]>("pdf");
  const [title, setTitle] = useState("");
  const [sourceIdentifier, setSourceIdentifier] = useState("");
  const [extractedContent, setExtractedContent] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const references = data?.items || [];
  const isFileType = refType === "pdf" || refType === "docx";

  // Handle direct file upload and extraction
  const handleFileUpload = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      setErrorMsg("حجم فایل بیشتر از ۵۰ مگابایت است. لطفاً فایل کم‌حجم‌تری انتخاب نمایید.");
      return;
    }

    const filenameLower = file.name.toLowerCase();
    if (refType === "pdf" && !filenameLower.endsWith(".pdf")) {
      setErrorMsg("لطفاً یک فایل معتبر با پسوند PDF انتخاب فرمایید.");
      return;
    }
    if (refType === "docx" && !filenameLower.endsWith(".docx")) {
      setErrorMsg("لطفاً یک فایل معتبر با پسوند DOCX انتخاب فرمایید.");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await uploadMutation.mutateAsync({
        file,
        metadata: {
          type: refType,
        },
      });

      const addedTitle = res.reference?.title || file.name;
      setSuccessMsg(`منبع علمی «${addedTitle}» با موفقیت بارگذاری و متن آن استخراج گردید.`);
      setIsAdding(false);
      setTitle("");
      setSourceIdentifier("");
      setExtractedContent("");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "خطا در بارگذاری و پردازش سند علمی. لطفاً مجدداً تلاش فرمایید.",
      );
    }
  };

  const handleManualCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("لطفاً عنوان منبع را وارد فرمایید.");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await createMutation.mutateAsync({
        type: refType,
        title: title.trim(),
        source_identifier: sourceIdentifier.trim() || null,
        extracted_content: extractedContent.trim() || null,
      });

      setTitle("");
      setSourceIdentifier("");
      setExtractedContent("");
      setIsAdding(false);
      setSuccessMsg("منبع با موفقیت به پروژه افزوده شد.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "خطا در افزودن منبع به پروژه.",
      );
    }
  };

  const handleDelete = async (refId: string) => {
    try {
      await deleteMutation.mutateAsync(refId);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "خطا در حذف منبع از پروژه.",
      );
    }
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case "url":
        return <Globe className="w-4 h-4 text-sky-500" />;
      case "doi":
      case "pubmed":
        return <Hash className="w-4 h-4 text-purple-500" />;
      case "pdf":
      case "docx":
        return <FileText className="w-4 h-4 text-emerald-500" />;
      default:
        return <BookOpen className="w-4 h-4 text-[#008080]" />;
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} maxWidth="lg">
      <DialogHeader onClose={onClose}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#008080]/10 text-[#008080] flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              مدیریت مراجع و منابع علمی ارائه
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              منابع علمی جهت اعتبارسنجی خودکار و استناددهی هوش مصنوعی در این پروژه.
            </p>
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="space-y-4">
        {errorMsg && (
          <Alert variant="error" className="text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          </Alert>
        )}

        {successMsg && (
          <Alert variant="success" className="text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          </Alert>
        )}

        {/* Action Toggle to Add Reference Form */}
        {!isAdding ? (
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-700">
              منابع متصل‌شده ({toPersianDigits(references.length)})
            </span>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                setIsAdding(true);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="gap-1.5 text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
              افزودن منبع علمی جدید
            </Button>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800">
                مشخصات منبع جدید
              </h4>
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setErrorMsg(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
                aria-label="بستن فرم منبع"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Type selector using canonical AvanaSelect */}
            <div>
              <AvanaSelect
                label="نوع منبع"
                size="sm"
                value={refType}
                options={REFERENCE_TYPE_OPTIONS}
                onChange={(val) => {
                  setRefType(val as CreatePresentationReferenceRequest["type"]);
                  setErrorMsg(null);
                }}
              />
            </div>

            {/* File Upload Zone for PDF / DOCX */}
            {isFileType ? (
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={
                    refType === "pdf"
                      ? ".pdf,application/pdf"
                      : ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  }
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileUpload(file);
                    }
                    e.target.value = "";
                  }}
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!uploadMutation.isPending) setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (uploadMutation.isPending) return;
                    const droppedFile = e.dataTransfer.files?.[0];
                    if (droppedFile) {
                      handleFileUpload(droppedFile);
                    }
                  }}
                  onClick={() => {
                    if (!uploadMutation.isPending) {
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`p-6 rounded-2xl border-2 border-dashed transition-all text-center flex flex-col items-center justify-center gap-2 cursor-pointer ${
                    isDragging
                      ? "border-[#008080] bg-[#008080]/10"
                      : "border-slate-200 hover:border-[#008080]/50 bg-white"
                  } ${uploadMutation.isPending ? "opacity-75 cursor-wait" : ""}`}
                >
                  {uploadMutation.isPending ? (
                    <div className="py-2 flex flex-col items-center gap-2 text-center">
                      <div className="w-7 h-7 rounded-full border-2 border-[#008080] border-t-transparent animate-spin" />
                      <span className="text-xs font-bold text-[#008080]">
                        در حال بارگذاری و استخراج خودکار محتوای سند...
                      </span>
                      <span className="text-[10px] text-slate-400">
                        موتور استخراج آوانا در حال تحلیل صفحات و اطلاعات استنادی است.
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-2xl bg-[#008080]/10 text-[#008080] flex items-center justify-center">
                        <UploadCloud className="w-6 h-6" />
                      </div>
                      <div className="text-xs font-bold text-slate-700">
                        فایل {refType === "pdf" ? "PDF" : "Word (.docx)"} خود را به اینجا بکشید یا برای انتخاب کلیک کنید
                      </div>
                      <p className="text-[11px] text-slate-400 max-w-sm">
                        حداکثر ۵۰ مگابایت — عنوان، متن کامل و شناسه کتاب‌شناختی (DOI، PMID و سال انتشار) خودکار استخراج خواهند شد.
                      </p>
                    </>
                  )}
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsAdding(false)}
                    disabled={uploadMutation.isPending}
                  >
                    انصراف
                  </Button>
                </div>
              </div>
            ) : (
              /* Manual Input Form for Text, DOI, PubMed, URL */
              <form onSubmit={handleManualCreate} className="space-y-3">
                {/* Source Identifier */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {refType === "doi" && "شناسه مقاله DOI (مثال: 10.1056/NEJMoa...)"}
                    {refType === "pubmed" && "شناسه مقاله PubMed (PMID مثال: 32456789)"}
                    {refType === "url" && "نشانی کامل اینترنتی (URL)"}
                    {refType === "text" && "شناسه یا برچسب مرجع (اختیاری)"}
                  </label>
                  <Input
                    type="text"
                    value={sourceIdentifier}
                    onChange={(e) => setSourceIdentifier(e.target.value)}
                    placeholder={
                      refType === "doi"
                        ? "10.1016/j.card.2023.01.002"
                        : refType === "pubmed"
                        ? "32456789"
                        : refType === "url"
                        ? "https://..."
                        : "عنوان اختصاری یا کد مرجع..."
                    }
                    className="text-xs font-mono"
                  />
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    عنوان منبع یا مقاله <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: Harrison's Principles of Internal Medicine, 21st Edition"
                    required
                    className="text-xs"
                  />
                </div>

                {/* Extracted content / Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    محتوای متنی منبع (جهت استناددهی و تقطیع جملات)
                  </label>
                  <textarea
                    value={extractedContent}
                    onChange={(e) => setExtractedContent(e.target.value)}
                    rows={3}
                    placeholder="چکیده، نکات کلیدی، یا متن پاراگراف‌های اصلی این مرجع که اسلایدها بر اساس آن تولید می‌شوند..."
                    className="w-full text-xs font-medium p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#008080] leading-relaxed"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsAdding(false)}
                    disabled={createMutation.isPending}
                  >
                    انصراف
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={createMutation.isPending}
                    isLoading={createMutation.isPending}
                  >
                    ذخیره منبع
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* References List */}
        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-400">
            در حال دریافت منابع...
          </div>
        ) : references.length === 0 ? (
          <div className="p-8 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <h4 className="text-xs font-bold text-slate-700 mb-1">
              هنوز منبعی به این ارائه اضافه نشده است
            </h4>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              می‌توانید اسناد علمی PDF، فایل‌های Word یا شناسه مقالات (DOI/PubMed) را جهت استناددهی دقیق هوش مصنوعی اضافه فرمایید.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[380px] overflow-y-auto">
            {references.map((ref) => {
              const meta =
                ref.bibliographic_metadata && typeof ref.bibliographic_metadata === "object"
                  ? (ref.bibliographic_metadata as Record<string, unknown>)
                  : null;
              const detectedDoi = typeof meta?.detectedDoi === "string" ? meta.detectedDoi : null;
              const detectedPmid = typeof meta?.detectedPmid === "string" ? meta.detectedPmid : null;
              const detectedYear =
                typeof meta?.detectedYear === "number" || typeof meta?.detectedYear === "string"
                  ? meta.detectedYear
                  : null;
              const pageCount =
                typeof meta?.pageCount === "number" || typeof meta?.pageCount === "string"
                  ? meta.pageCount
                  : null;

              return (
                <div
                  key={ref.id}
                  className="p-3 bg-white rounded-xl border border-slate-200 flex items-start justify-between gap-3 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="p-2 rounded-lg bg-slate-100 shrink-0">
                      {getSourceIcon(ref.type)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-800 truncate">
                          {ref.title}
                        </h4>
                        <Badge variant="neutral" size="sm" className="text-[10px] shrink-0">
                          {REFERENCE_TYPE_LABELS[ref.type] || ref.type}
                        </Badge>
                      </div>

                      {ref.source_identifier && (
                        <div className="text-[11px] text-[#008080] font-mono mt-1 truncate">
                          {ref.source_identifier}
                        </div>
                      )}

                      {/* Detected Bibliographic Metadata Badges */}
                      {meta && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {detectedDoi && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                              DOI: {detectedDoi}
                            </span>
                          )}
                          {detectedPmid && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                              PMID: {detectedPmid}
                            </span>
                          )}
                          {detectedYear && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                              سال انتشار: {toPersianDigits(detectedYear)}
                            </span>
                          )}
                          {pageCount && (
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                              {toPersianDigits(pageCount)} صفحه
                            </span>
                          )}
                        </div>
                      )}

                      {ref.extracted_content && (
                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-1 font-medium">
                          {ref.extracted_content}
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(ref.id)}
                    disabled={deleteMutation.isPending}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 p-1.5 shrink-0"
                    aria-label="حذف منبع"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose} size="md">
          بستن پنجره
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
