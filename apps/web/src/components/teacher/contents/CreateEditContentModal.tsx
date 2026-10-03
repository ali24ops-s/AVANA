import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Input,
  Textarea,
  RichTextEditor,
  Alert,
} from "../../ui/index.js";
import { MarkdownRenderer } from "../../markdown/MarkdownRenderer.js";
import {
  useCreateClassroomContent,
  useUpdateClassroomContent,
} from "../../../hooks/useTeacherContents.js";
import { createApiClient, getApiBaseUrl } from "../../../lib/api/client.js";
import { createTeacherApi } from "../../../lib/api/teacher.js";
import {
  detectExternalVideoProvider,
  toPersianDigits,
  MAX_CONTENT_TEXT_LENGTH,
  type ClassroomContent,
  type ClassroomContentType,
} from "@avana/domain";
import {
  FileText,
  Image as ImageIcon,
  FileCode,
  Presentation,
  Video,
  UploadCloud,
  CheckCircle,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

export interface CreateEditContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  classroomId: string;
  contentToEdit?: ClassroomContent | null;
}

const TYPE_OPTIONS: Array<{
  type: ClassroomContentType;
  label: string;
  icon: typeof FileText;
  description: string;
}> = [
  {
    type: "text",
    label: "متن",
    icon: FileText,
    description: "متن آموزشی، توضیحات یا نکات درسی",
  },
  {
    type: "image",
    label: "تصویر",
    icon: ImageIcon,
    description: "نمودار، اسلاید یا تصویر آموزشی (JPG, PNG, WebP)",
  },
  {
    type: "pdf",
    label: "PDF",
    icon: FileCode,
    description: "جزوه یا کتابچه به فرمت PDF",
  },
  {
    type: "word",
    label: "Word",
    icon: FileText,
    description: "فایل تمرین یا جزوه با فرمت doc یا docx",
  },
  {
    type: "powerpoint",
    label: "PowerPoint",
    icon: Presentation,
    description: "اسلایدهای کلاسی با فرمت ppt یا pptx",
  },
  {
    type: "video_external",
    label: "ویدئو (لینک خارجی)",
    icon: Video,
    description: "لینک گوگل درایو یا سرویس‌های ویدئویی خارجی",
  },
];

function getFileAcceptForType(type: ClassroomContentType): string {
  switch (type) {
    case "image":
      return "image/jpeg,image/png,image/webp";
    case "pdf":
      return "application/pdf";
    case "word":
      return ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "powerpoint":
      return ".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "*/*";
  }
}

function formatBytesToPersian(bytes: number): string {
  if (bytes < 1024) return `${toPersianDigits(bytes)} بایت`;
  if (bytes < 1024 * 1024)
    return `${toPersianDigits((bytes / 1024).toFixed(1))} کیلوبایت`;
  return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
}

export function CreateEditContentModal({
  isOpen,
  onClose,
  classroomId,
  contentToEdit,
}: CreateEditContentModalProps) {
  const isEditing = Boolean(contentToEdit);

  const [contentType, setContentType] = useState<ClassroomContentType>("text");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [textContent, setTextContent] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("published");

  // File upload state
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileSize, setUploadedFileSize] = useState<number | null>(null);
  const [uploadedMimeType, setUploadedMimeType] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useCreateClassroomContent(classroomId);
  const updateMutation = useUpdateClassroomContent(
    contentToEdit?.id ?? "",
    classroomId,
  );

  useEffect(() => {
    if (contentToEdit) {
      setContentType(contentToEdit.contentType);
      setTitle(contentToEdit.title);
      setDescription(contentToEdit.description || "");
      setTextContent(contentToEdit.textContent || "");
      setExternalUrl(contentToEdit.externalUrl || "");
      setStatus(contentToEdit.status === "published" ? "published" : "draft");
      setUploadedFileUrl(contentToEdit.fileUrl || null);
      setUploadedFileName(contentToEdit.fileName || null);
      setUploadedFileSize(contentToEdit.fileSizeBytes || null);
      setUploadedMimeType(contentToEdit.mimeType || null);
    } else {
      setContentType("text");
      setTitle("");
      setDescription("");
      setTextContent("");
      setExternalUrl("");
      setStatus("published");
      setUploadedFileUrl(null);
      setUploadedFileName(null);
      setUploadedFileSize(null);
      setUploadedMimeType(null);
    }
    setFormError(null);
    setUploadError(null);
    setIsUploading(false);
  }, [contentToEdit, isOpen]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 30 * 1024 * 1024) {
      setUploadError("حداکثر حجم مجاز فایل ۳۰ مگابایت است.");
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    try {
      const client = createApiClient({ baseUrl: getApiBaseUrl() });
      const api = createTeacherApi(client);
      const res = await api.uploadContentFile(file);

      setUploadedFileUrl(res.fileUrl);
      setUploadedFileName(res.fileName);
      setUploadedFileSize(res.fileSizeBytes);
      setUploadedMimeType(res.fileMimeType);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "خطا در بارگذاری فایل.",
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFormError("عنوان محتوا الزامی است.");
      return;
    }

    if (contentType === "text") {
      if (!textContent.trim()) {
        setFormError("متن محتوا نمی‌تواند خالی باشد.");
        return;
      }
      if (textContent.length > MAX_CONTENT_TEXT_LENGTH) {
        setFormError("متن محتوا نمی‌تواند بیشتر از ۲۵٬۰۰۰ کاراکتر باشد.");
        return;
      }
    } else if (
      contentType === "image" ||
      contentType === "pdf" ||
      contentType === "word" ||
      contentType === "powerpoint"
    ) {
      if (!uploadedFileUrl) {
        setFormError("لطفاً فایل مورد نظر را بارگذاری نمایید.");
        return;
      }
    } else if (contentType === "video_external") {
      if (!externalUrl.trim()) {
        setFormError("لینک ویدئو الزامی است.");
        return;
      }
      try {
        const u = new URL(externalUrl.trim());
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          setFormError("آدرس ویدئو باید با http:// یا https:// آغاز شود.");
          return;
        }
      } catch {
        setFormError("آدرس لینک ویدئو نامعتبر است.");
        return;
      }
    }

    try {
      if (isEditing && contentToEdit) {
        await updateMutation.mutateAsync({
          title: cleanTitle,
          description: description.trim() || null,
          contentType,
          textContent: contentType === "text" ? textContent : null,
          fileUrl:
            contentType !== "text" && contentType !== "video_external"
              ? uploadedFileUrl
              : null,
          fileName:
            contentType !== "text" && contentType !== "video_external"
              ? uploadedFileName
              : null,
          fileSizeBytes:
            contentType !== "text" && contentType !== "video_external"
              ? uploadedFileSize
              : null,
          mimeType:
            contentType !== "text" && contentType !== "video_external"
              ? uploadedMimeType
              : null,
          externalUrl: contentType === "video_external" ? externalUrl.trim() : null,
          status,
        });
      } else {
        await createMutation.mutateAsync({
          contentType,
          title: cleanTitle,
          description: description.trim() || null,
          textContent: contentType === "text" ? textContent : null,
          fileUrl:
            contentType !== "text" && contentType !== "video_external"
              ? uploadedFileUrl ?? undefined
              : null,
          fileName:
            contentType !== "text" && contentType !== "video_external"
              ? uploadedFileName ?? undefined
              : null,
          fileSizeBytes:
            contentType !== "text" && contentType !== "video_external"
              ? uploadedFileSize ?? undefined
              : null,
          mimeType:
            contentType !== "text" && contentType !== "video_external"
              ? uploadedMimeType ?? undefined
              : null,
          externalUrl:
            contentType === "video_external" ? externalUrl.trim() : undefined,
          status,
        });
      }
      onClose();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "خطا در ذخیره محتوای آموزشی.",
      );
    }
  };

  const detectedVideoInfo =
    contentType === "video_external" && externalUrl.trim()
      ? (() => {
          try {
            return detectExternalVideoProvider(externalUrl.trim());
          } catch {
            return null;
          }
        })()
      : null;

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      maxWidth="5xl"
      ariaLabel={isEditing ? "ویرایش محتوای آموزشی" : "ایجاد محتوای آموزشی جدید"}
    >
      <DialogHeader onClose={isSubmitting ? undefined : onClose}>
        <h3 className="text-base font-bold text-[var(--color-text)]">
          {isEditing ? "ویرایش محتوای آموزشی" : "ایجاد محتوای آموزشی جدید"}
        </h3>
      </DialogHeader>

      <DialogContent>
        <form id="content-form" onSubmit={handleSubmit} className="space-y-5 pt-2">
          {formError && (
            <Alert variant="error" title="خطا در اعتبارسنجی">
              {formError}
            </Alert>
          )}

          {/* Type Selector (only when creating) */}
          {!isEditing && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[var(--color-text)]">
                نوع محتوا
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {TYPE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = contentType === opt.type;
                  return (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => {
                        setContentType(opt.type);
                        setUploadError(null);
                      }}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                        isSelected
                          ? "bg-[var(--color-primary-subtle)] border-[var(--color-primary)] text-[var(--color-primary)] font-bold shadow-xs"
                          : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-border-hover)]"
                      }`}
                    >
                      <Icon className="w-5 h-5 mb-1" />
                      <span className="text-xs">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--color-text)]">
              عنوان محتوا <span className="text-rose-500">*</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: جزوه جلسه سوم - انتگرال‌های چندگانه"
              maxLength={200}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--color-text)]">
              توضیحات تکمیلی (اختیاری)
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="توضیحات یا راهنمایی برای دانش‌آموزان..."
              rows={2}
              maxLength={2000}
            />
          </div>

          {/* Dynamic Content based on type */}
          {contentType === "text" && (
            <div className="space-y-1.5">
              <RichTextEditor
                label="متن محتوا"
                required
                value={textContent}
                onChange={setTextContent}
                placeholder="متن درسی یا آموزشی خود را اینجا بنویسید..."
                rows={10}
                minHeight={220}
                maxLength={MAX_CONTENT_TEXT_LENGTH}
                showCharacterCount
                renderPreview={(cnt) => <MarkdownRenderer content={cnt} />}
                disabled={isSubmitting}
              />
            </div>
          )}

          {(contentType === "image" ||
            contentType === "pdf" ||
            contentType === "word" ||
            contentType === "powerpoint") && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[var(--color-text)]">
                فایل محتوا <span className="text-rose-500">*</span>
              </label>

              {uploadError && (
                <Alert variant="error" title="خطا در بارگذاری">
                  {uploadError}
                </Alert>
              )}

              {uploadedFileUrl ? (
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-emerald-900 line-clamp-1">
                        {uploadedFileName || "فایل بارگذاری شده"}
                      </p>
                      {uploadedFileSize && (
                        <p className="text-[11px] text-emerald-700">
                          {formatBytesToPersian(uploadedFileSize)}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    تغییر فایل
                  </Button>
                </div>
              ) : (
                <div
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    isUploading
                      ? "border-[var(--color-border)] bg-[var(--color-surface-hover)]"
                      : "border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)]"
                  }`}
                >
                  <UploadCloud className="w-8 h-8 text-[var(--color-text-muted)] mx-auto mb-2" />
                  <p className="text-xs font-semibold text-[var(--color-text)] mb-1">
                    {isUploading
                      ? "در حال بارگذاری فایل..."
                      : "برای انتخاب و بارگذاری فایل کلیک کنید"}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    حداکثر حجم مجاز: ۳۰ مگابایت
                  </p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={getFileAcceptForType(contentType)}
                onChange={handleFileUpload}
              />
            </div>
          )}

          {contentType === "video_external" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--color-text)]">
                  لینک ویدئوی خارجی <span className="text-rose-500">*</span>
                </label>
                <Input
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/.../view یا لینک مستقیم سرویس خارجی"
                  dir="ltr"
                  required
                />
              </div>

              {detectedVideoInfo && detectedVideoInfo.provider === "google_drive" && (
                <div className="p-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-xs flex items-start gap-2">
                  <ExternalLink className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">شناسایی لینک Google Drive</p>
                    <p className="text-[11px] mt-0.5 text-blue-700">
                      این ویدئو به‌صورت پلیر مستقیم برای دانش‌آموزان در پنل کلاس تعبیه و نمایش داده خواهد شد. لطفاً مطمئن شوید دسترسی لینک در گوگل درایو روی «Anyone with the link can view» تنظیم شده باشد.
                    </p>
                  </div>
                </div>
              )}

              {detectedVideoInfo && detectedVideoInfo.provider === "generic" && (
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">لینک خارجی عمومی</p>
                    <p className="text-[11px] mt-0.5 text-amber-700">
                      دانش‌آموزان با کلیک روی دکمه مشاهده، به صفحه مقصد در تب جدید هدایت خواهند شد.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--color-text)]">
              وضعیت انتشار
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="radio"
                  name="status"
                  value="published"
                  checked={status === "published"}
                  onChange={() => setStatus("published")}
                  className="accent-[#008080]"
                />
                <span>انتشار برای دانش‌آموزان (فعال)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="radio"
                  name="status"
                  value="draft"
                  checked={status === "draft"}
                  onChange={() => setStatus("draft")}
                  className="accent-[#008080]"
                />
                <span>پیش‌نویس (فقط برای استاد)</span>
              </label>
            </div>
          </div>
        </form>
      </DialogContent>

      <DialogFooter>
        <div className="flex items-center justify-end gap-2.5 w-full flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting || isUploading}
          >
            انصراف
          </Button>
          <Button
            type="submit"
            form="content-form"
            variant="primary"
            size="sm"
            disabled={isSubmitting || isUploading}
          >
            {isSubmitting
              ? "در حال ذخیره..."
              : isEditing
                ? "ذخیره تغییرات"
                : "ایجاد محتوا"}
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}
