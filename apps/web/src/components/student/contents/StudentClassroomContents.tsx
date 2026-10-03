import { useState } from "react";
import {
  Button,
  Input,
  LoadingState,
  EmptyState,
  Dialog,
  DialogHeader,
  DialogContent,
} from "../../ui/index.js";
import { ContentTypeBadge } from "../../teacher/contents/ContentTypeBadge.js";
import { useStudentClassroomContents } from "../../../hooks/useStudentContents.js";
import {
  detectExternalVideoProvider,
  toPersianDigits,
  type ClassroomContent,
  type ClassroomContentType,
} from "@avana/domain";
import { formatPersianExamDate } from "../../../utils/date.js";
import { MarkdownRenderer } from "../../markdown/MarkdownRenderer.js";

function formatBytesToPersian(bytes: number): string {
  if (bytes < 1024) return `${toPersianDigits(bytes)} بایت`;
  if (bytes < 1024 * 1024)
    return `${toPersianDigits((bytes / 1024).toFixed(1))} کیلوبایت`;
  return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
}
import {
  BookOpen,
  Search,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Presentation,
  Video,
  Play,
} from "lucide-react";

export interface StudentClassroomContentsProps {
  classroomId: string;
}

export function StudentClassroomContents({ classroomId }: StudentClassroomContentsProps) {
  const { data, isLoading, error } = useStudentClassroomContents(classroomId);
  const contents = data?.contents ?? [];

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<ClassroomContentType | "all">("all");
  const [activeContent, setActiveContent] = useState<ClassroomContent | null>(null);

  if (isLoading) {
    return (
      <div className="py-12 flex justify-center">
        <LoadingState message="در حال دریافت محتوای آموزشی کلاس..." />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="خطا در دریافت محتوا"
        description="متأسفانه در دریافت محتوای آموزشی کلاس مشکلی پیش آمده است."
        icon={<BookOpen className="w-10 h-10 text-rose-500" />}
      />
    );
  }

  const filteredContents = contents.filter((c) => {
    if (selectedType !== "all" && c.contentType !== selectedType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchTitle = c.title.toLowerCase().includes(q);
      const matchDesc = c.description?.toLowerCase().includes(q);
      return matchTitle || matchDesc;
    }
    return true;
  });

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      {/* Header, Search and Type Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجو در عنوان یا توضیحات محتوا..."
            className="pr-9 text-xs"
          />
        </div>

        {/* Type Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedType("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              selectedType === "all"
                ? "bg-[#008080] text-white"
                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            همه ({toPersianDigits(contents.length)})
          </button>
          <button
            type="button"
            onClick={() => setSelectedType("text")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              selectedType === "text"
                ? "bg-emerald-600 text-white"
                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            متن
          </button>
          <button
            type="button"
            onClick={() => setSelectedType("image")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              selectedType === "image"
                ? "bg-blue-600 text-white"
                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            تصاویر
          </button>
          <button
            type="button"
            onClick={() => setSelectedType("pdf")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              selectedType === "pdf"
                ? "bg-rose-600 text-white"
                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            PDF
          </button>
          <button
            type="button"
            onClick={() => setSelectedType("word")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              selectedType === "word"
                ? "bg-sky-600 text-white"
                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Word
          </button>
          <button
            type="button"
            onClick={() => setSelectedType("powerpoint")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              selectedType === "powerpoint"
                ? "bg-amber-600 text-white"
                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            PowerPoint
          </button>
          <button
            type="button"
            onClick={() => setSelectedType("video_external")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              selectedType === "video_external"
                ? "bg-purple-600 text-white"
                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            ویدئوها
          </button>
        </div>
      </div>

      {/* Contents Grid */}
      {filteredContents.length === 0 ? (
        <EmptyState
          title="محتوای آموزشی یافت نشد"
          description={
            contents.length === 0
              ? "استاد هنوز محتوای آموزشی برای این کلاس منتشر نکرده است."
              : "هیچ محتوایی با فیلترهای انتخابی مطابقت ندارد."
          }
          icon={<BookOpen className="w-10 h-10 text-[var(--color-text-muted)]" />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContents.map((c) => {
            const videoInfo =
              c.contentType === "video_external" && c.externalUrl
                ? (() => {
                    try {
                      return detectExternalVideoProvider(c.externalUrl);
                    } catch {
                      return null;
                    }
                  })()
                : null;

            return (
              <div
                key={c.id}
                className="flex flex-col justify-between p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[#008080]/40 transition-all shadow-2xs hover:shadow-xs"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <ContentTypeBadge type={c.contentType} />
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      {formatPersianExamDate(c.createdAt)}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-[var(--color-text)] line-clamp-2 leading-relaxed">
                      {c.title}
                    </h4>
                    {c.description && (
                      <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 mt-1 leading-relaxed">
                        {c.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between gap-2">
                  {c.contentType === "text" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      leftIcon={<Eye className="w-3.5 h-3.5" />}
                      onClick={() => setActiveContent(c)}
                    >
                      مطالعه متن
                    </Button>
                  )}

                  {c.contentType === "image" && (
                    <div className="flex items-center gap-2 w-full">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        leftIcon={<Eye className="w-3.5 h-3.5" />}
                        onClick={() => setActiveContent(c)}
                      >
                        نمایش تصویر
                      </Button>
                      {c.fileUrl && (
                        <a
                          href={c.fileUrl}
                          download={c.fileName || "image"}
                          className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[#008080] hover:bg-[var(--color-surface-hover)] transition-colors"
                          title="دانلود تصویر"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  )}

                  {c.contentType === "pdf" && (
                    <div className="flex items-center gap-2 w-full">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        leftIcon={<Eye className="w-3.5 h-3.5" />}
                        onClick={() => setActiveContent(c)}
                      >
                        مشاهده / دانلود PDF
                      </Button>
                      {c.fileUrl && (
                        <a
                          href={c.fileUrl}
                          download={c.fileName || "document.pdf"}
                          className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="دانلود مستقیم"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  )}

                  {(c.contentType === "word" || c.contentType === "powerpoint") && (
                    <div className="flex items-center gap-2 w-full">
                      {c.fileUrl ? (
                        <a
                          href={c.fileUrl}
                          download={c.fileName || "file"}
                          className="w-full"
                        >
                          <Button
                            size="sm"
                            variant="primary"
                            className="w-full text-xs"
                            leftIcon={<Download className="w-3.5 h-3.5" />}
                          >
                            دریافت فایل{" "}
                            {c.fileSizeBytes
                              ? `(${formatBytesToPersian(c.fileSizeBytes)})`
                              : ""}
                          </Button>
                        </a>
                      ) : (
                        <Button size="sm" variant="outline" disabled className="w-full text-xs">
                          فایل موجود نیست
                        </Button>
                      )}
                    </div>
                  )}

                  {c.contentType === "video_external" && (
                    <Button
                      size="sm"
                      variant="primary"
                      className="w-full text-xs bg-purple-600 hover:bg-purple-700 text-white"
                      leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
                      onClick={() => setActiveContent(c)}
                    >
                      {videoInfo?.provider === "google_drive" && videoInfo.canEmbed
                        ? "پخش ویدئو"
                        : "مشاهده ویدئو"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Content Viewer Modal */}
      {activeContent && (
        <Dialog
          isOpen={Boolean(activeContent)}
          onClose={() => setActiveContent(null)}
          maxWidth="5xl"
          ariaLabel={activeContent.title}
        >
          <DialogHeader onClose={() => setActiveContent(null)}>
            <h3 className="text-base font-bold text-[var(--color-text)]">
              {activeContent.title}
            </h3>
          </DialogHeader>

          <DialogContent>
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <ContentTypeBadge type={activeContent.contentType} />
                <span className="text-xs text-[var(--color-text-muted)]">
                  {formatPersianExamDate(activeContent.createdAt)}
                </span>
              </div>

              {/* Description if present */}
              {activeContent.description && (
                <div className="p-3 rounded-xl bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] leading-relaxed">
                  {activeContent.description}
                </div>
              )}

              {/* Text Viewer */}
              {activeContent.contentType === "text" && (
                <div className="p-4 sm:p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] select-text">
                  <MarkdownRenderer content={activeContent.textContent} />
                </div>
              )}

              {/* Image Viewer */}
              {activeContent.contentType === "image" && activeContent.fileUrl && (
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden border border-[var(--color-border)] bg-black/5 flex items-center justify-center p-2">
                    <img
                      src={activeContent.fileUrl}
                      alt={activeContent.title}
                      className="max-h-[60vh] max-w-full object-contain rounded-lg"
                    />
                  </div>
                  <div className="flex justify-end">
                    <a
                      href={activeContent.fileUrl}
                      download={activeContent.fileName || "image"}
                    >
                      <Button size="sm" variant="outline" leftIcon={<Download className="w-4 h-4" />}>
                        دانلود تصویر با کیفیت اصلی
                      </Button>
                    </a>
                  </div>
                </div>
              )}

              {/* PDF Viewer */}
              {activeContent.contentType === "pdf" && activeContent.fileUrl && (
                <div className="space-y-3">
                  <iframe
                    src={activeContent.fileUrl}
                    title={activeContent.title}
                    className="w-full h-[60vh] rounded-xl border border-[var(--color-border)]"
                  />
                  <div className="flex justify-end">
                    <a
                      href={activeContent.fileUrl}
                      download={activeContent.fileName || "document.pdf"}
                    >
                      <Button size="sm" variant="primary" leftIcon={<Download className="w-4 h-4" />}>
                        دانلود فایل PDF
                      </Button>
                    </a>
                  </div>
                </div>
              )}

              {/* Word & PowerPoint in Modal */}
              {(activeContent.contentType === "word" || activeContent.contentType === "powerpoint") && (
                <div className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-center space-y-3">
                  {activeContent.contentType === "word" ? (
                    <FileText className="w-12 h-12 text-sky-600 mx-auto" />
                  ) : (
                    <Presentation className="w-12 h-12 text-amber-600 mx-auto" />
                  )}
                  <p className="font-bold text-sm text-[var(--color-text)]">
                    {activeContent.fileName || activeContent.title}
                  </p>
                  {activeContent.fileSizeBytes && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      حجم فایل: {formatBytesToPersian(activeContent.fileSizeBytes)}
                    </p>
                  )}
                  {activeContent.fileUrl && (
                    <a
                      href={activeContent.fileUrl}
                      download={activeContent.fileName || "file"}
                    >
                      <Button size="sm" variant="primary" leftIcon={<Download className="w-4 h-4" />}>
                        دانلود و ذخیره فایل
                      </Button>
                    </a>
                  )}
                </div>
              )}

              {/* External Video Viewer */}
              {activeContent.contentType === "video_external" && activeContent.externalUrl && (() => {
                let info;
                try {
                  info = detectExternalVideoProvider(activeContent.externalUrl);
                } catch {
                  info = null;
                }

                if (info?.provider === "google_drive" && info.canEmbed && info.embedUrl) {
                  return (
                    <div className="space-y-3">
                      <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-[var(--color-border)] bg-black">
                        <iframe
                          src={info.embedUrl}
                          title={activeContent.title}
                          className="w-full h-full"
                          allow="autoplay"
                          allowFullScreen
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                        <span>پخش‌کننده ویدئوی گوگل درایو</span>
                        <a
                          href={activeContent.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <span>مشاهده در Google Drive</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                }

                // Fallback for generic video link
                return (
                  <div className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-center space-y-4">
                    <Video className="w-12 h-12 text-purple-600 mx-auto" />
                    <div>
                      <h5 className="font-bold text-sm text-[var(--color-text)]">
                        مشاهده ویدئو در سرویس ارائه‌دهنده
                      </h5>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
                        این ویدئو در سرویس خارجی میزبانی شده است. برای تماشا روی دکمه زیر کلیک کنید.
                      </p>
                    </div>
                    <a
                      href={activeContent.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button
                        variant="primary"
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                        leftIcon={<ExternalLink className="w-4 h-4" />}
                      >
                        باز کردن لینک ویدئو در تب جدید
                      </Button>
                    </a>
                  </div>
                );
              })()}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
