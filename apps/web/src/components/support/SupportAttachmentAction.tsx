import React, { useState, useEffect } from "react";
import { Dialog, Button } from "@avana/ui";
import {
  Paperclip,
  FileText,
  Image as ImageIcon,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { downloadAttachment } from "../../lib/api/support.js";

export interface SupportAttachmentActionProps {
  attachmentUrl: string;
  variant?: "user" | "support" | "neutral";
  onError?: (message: string) => void;
  className?: string;
}

export const SupportAttachmentAction: React.FC<SupportAttachmentActionProps> = ({
  attachmentUrl,
  variant = "neutral",
  onError,
  className = "",
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{
    url: string;
    filename: string;
  } | null>(null);

  // Clean up object URL when component unmounts or preview closes
  useEffect(() => {
    return () => {
      if (previewImage?.url) {
        window.URL.revokeObjectURL(previewImage.url);
      }
    };
  }, [previewImage]);

  const handleClosePreview = () => {
    if (previewImage?.url) {
      window.URL.revokeObjectURL(previewImage.url);
      setPreviewImage(null);
    }
  };

  const handleDownloadPreview = () => {
    if (!previewImage) return;
    const a = document.createElement("a");
    a.href = previewImage.url;
    a.download = previewImage.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Inspect file extension to provide contextual icon and label
  const normalizedUrl = attachmentUrl.split("?")[0] || "";
  const ext = normalizedUrl.split(".").pop()?.toLowerCase() || "";
  const isImageByExt = ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext);
  const isPdfByExt = ext === "pdf";

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await downloadAttachment(attachmentUrl);
      const isImage =
        res.mimeType.startsWith("image/") ||
        ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(
          res.filename.split(".").pop()?.toLowerCase() || "",
        );

      if (isImage) {
        setPreviewImage({
          url: res.objectUrl,
          filename: res.filename,
        });
      } else {
        // Safe direct download for PDF and other files
        const a = document.createElement("a");
        a.href = res.objectUrl;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Revoke after download is triggered
        setTimeout(() => {
          if (res.objectUrl) {
            window.URL.revokeObjectURL(res.objectUrl);
          }
        }, 1500);
      }
    } catch (err: unknown) {
      const msg =
        (err as Error)?.message ||
        "خطا در دریافت فایل ضمیمه. لطفاً اتصال اینترنت خود را بررسی کنید.";
      setErrorMessage(msg);
      onError?.(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Determine button styling based on variant
  let buttonStyle =
    "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]";
  if (variant === "user") {
    buttonStyle = "bg-white/20 text-white hover:bg-white/30 border border-white/20";
  } else if (variant === "support") {
    buttonStyle =
      "bg-[var(--color-surface-warm)] text-[var(--color-text)] hover:bg-[var(--color-border)] border border-[var(--color-border)]";
  }

  const renderIcon = () => {
    if (isLoading) {
      return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
    }
    if (isImageByExt) {
      return <ImageIcon className="w-3.5 h-3.5" />;
    }
    if (isPdfByExt) {
      return <FileText className="w-3.5 h-3.5" />;
    }
    return <Paperclip className="w-3.5 h-3.5" />;
  };

  const getLabel = () => {
    if (isLoading) return "در حال دریافت فایل...";
    if (isImageByExt) return "مشاهده تصویر ضمیمه";
    if (isPdfByExt) return "دانلود فایل PDF ضمیمه";
    return "دریافت فایل ضمیمه";
  };

  return (
    <div className={`inline-flex flex-col gap-1 items-start ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        aria-label={getLabel()}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed ${buttonStyle}`}
      >
        {renderIcon()}
        <span>{getLabel()}</span>
        {!isLoading && <Download className="w-3 h-3 opacity-60" />}
      </button>

      {errorMessage && (
        <div className="flex items-center gap-1 text-[11px] text-red-500 dark:text-red-400 mt-1 max-w-xs">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <Dialog
          isOpen={Boolean(previewImage)}
          onClose={handleClosePreview}
          title={previewImage.filename || "پیش‌نمایش تصویر ضمیمه"}
          maxWidth="3xl"
        >
          <div className="p-4 sm:p-6 flex flex-col items-center justify-center gap-4" dir="rtl">
            <div className="max-h-[65vh] w-full flex items-center justify-center overflow-auto rounded-xl bg-black/5 dark:bg-white/5 p-2">
              <img
                src={previewImage.url}
                alt={previewImage.filename}
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-2 w-full pt-2 border-t border-[var(--color-border)]">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClosePreview}
              >
                بستن
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleDownloadPreview}
                leftIcon={<Download className="w-4 h-4" />}
              >
                دانلود تصویر
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
