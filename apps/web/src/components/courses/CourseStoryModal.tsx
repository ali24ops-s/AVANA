import { useState, useEffect } from "react";
import {
  X,
  Download,
  Share2,
  Loader2,
  AlertCircle,
  Sparkles,
  Link as LinkIcon,
  Check,
} from "lucide-react";
import { Button } from "@avana/ui";
import {
  generateCourseStory,
  downloadStoryBlob,
  canShareStoryFiles,
  shareStoryBlob,
  type CourseStoryOptions,
} from "../../lib/story/courseStoryGenerator.js";

export interface CourseStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: CourseStoryOptions;
}

export function CourseStoryModal({
  isOpen,
  onClose,
  course,
}: CourseStoryModalProps) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const supportsDirectShare = canShareStoryFiles();

  useEffect(() => {
    if (!isOpen) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setBlob(null);
      setError(null);
      setShareError(null);
      setIsSharing(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setShareError(null);

    generateCourseStory(course)
      .then((generatedBlob) => {
        if (!isMounted) return;
        setBlob(generatedBlob);
        const url = URL.createObjectURL(generatedBlob);
        setPreviewUrl(url);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(
          err instanceof Error
            ? err.message
            : "خطا در تولید تصویر استوری رخ داد.",
        );
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, course]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!blob) return;
    const safeTitle = course.title.replace(/[\s/\\:]+/g, "-").slice(0, 30);
    downloadStoryBlob(blob, `avana-story-${safeTitle}.png`);
  };

  const handleDirectShare = async () => {
    if (!blob || isSharing) return;
    setIsSharing(true);
    setShareError(null);
    try {
      const shared = await shareStoryBlob(blob, course.title, course.shareUrl);
      if (!shared) {
        // Either canceled by user or not supported for this file
        // No error displayed on user cancellation
      }
    } catch {
      // Real unexpected failure: show graceful feedback
      setShareError(
        "امکان اشتراک‌گذاری مستقیم در این دستگاه فراهم نشد. لطفاً از دکمه دانلود تصویر استفاده کنید.",
      );
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyLink = async () => {
    const url = course.shareUrl || (typeof window !== "undefined" ? window.location.href : "");
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      // Ignore clipboard write failures
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="relative w-full max-w-lg bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3
                id="story-modal-title"
                className="text-base font-bold text-[var(--color-text)]"
              >
                ساخت استوری اینستاگرام
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                تصویر استاندارد ۹:۱۶ با ابعاد ۱۰۸۰×۱۹۲۰
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-full hover:bg-[var(--color-border)]/50 transition-colors"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: 9:16 Preview */}
        <div className="p-6 overflow-y-auto flex flex-col items-center gap-5">
          {isLoading ? (
            <div className="w-52 aspect-[9/16] rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex flex-col items-center justify-center gap-3 shadow-inner">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                در حال طراحی استوری...
              </span>
            </div>
          ) : error ? (
            <div className="w-full p-6 text-center rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex flex-col items-center gap-3">
              <AlertCircle className="w-8 h-8" />
              <p className="text-sm font-semibold">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null);
                  setIsLoading(true);
                  generateCourseStory(course)
                    .then((b) => {
                      setBlob(b);
                      setPreviewUrl(URL.createObjectURL(b));
                    })
                    .catch((e) => setError(String(e)))
                    .finally(() => setIsLoading(false));
                }}
              >
                تلاش مجدد
              </Button>
            </div>
          ) : previewUrl ? (
            <div className="relative group">
              <div className="w-52 sm:w-60 aspect-[9/16] rounded-2xl overflow-hidden border-2 border-[var(--color-border)] shadow-xl transition-transform group-hover:scale-[1.02]">
                <img
                  src={previewUrl}
                  alt={`استوری دوره ${course.title}`}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          ) : null}

          {shareError && (
            <div className="w-full p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs text-center">
              {shareError}
            </div>
          )}

          {/* Instagram Link Sticker Tip Box */}
          <div className="w-full p-3.5 rounded-2xl bg-primary/5 border border-primary/20 text-xs text-[var(--color-text)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-primary flex items-center gap-1.5">
                <span>💡</span> راهنمای انتشار در اینستاگرام:
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600">لینک کپی شد</span>
                  </>
                ) : (
                  <>
                    <LinkIcon className="w-3.5 h-3.5" />
                    <span>کپی لینک دوره</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[var(--color-text-muted)] leading-relaxed">
              {supportsDirectShare
                ? "با دکمه «اشتراک‌گذاری در استوری / برنامه‌ها» تصویر مستقیماً به منوی اشتراک‌گذاری دستگاه شما فرستاده می‌شود تا بتوانید اینستاگرام را انتخاب کنید."
                : "تصویر را با دکمه زیر دانلود کرده و در استوری اینستاگرام از گالری انتخاب کنید."}{" "}
              هنگام انتشار استوری، از استیکر <strong>Link</strong> استفاده کرده و پیوند دوره را در آن قرار دهید تا مخاطبان مستقیماً وارد دوره شوند.
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 p-4 px-6 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="rounded-button"
          >
            انصراف
          </Button>

          {supportsDirectShare ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={isLoading || !blob}
                leftIcon={<Download className="w-4 h-4" />}
                className="rounded-button"
              >
                دانلود تصویر
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleDirectShare}
                disabled={isLoading || !blob || isSharing}
                leftIcon={
                  isSharing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Share2 className="w-4 h-4" />
                  )
                }
                className="rounded-button"
              >
                {isSharing ? "در حال باز کردن..." : "اشتراک‌گذاری در استوری / برنامه‌ها"}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleDownload}
              disabled={isLoading || !blob}
              leftIcon={<Download className="w-4 h-4" />}
              className="rounded-button"
            >
              دانلود تصویر استوری
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
