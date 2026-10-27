import { useState } from "react";
import {
  X,
  Share2,
  Copy,
  Check,
  Send,
  MessageCircle,
  Sparkles,
  Smartphone,
} from "lucide-react";
import { Button } from "@avana/ui";
import { CourseStoryModal } from "./CourseStoryModal.js";
import type { CourseStoryStats } from "../../lib/story/courseStoryGenerator.js";
import { cleanEducationalTitle } from "@avana/domain";

export interface CourseShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: {
    id: string;
    title: string;
    subject?: string | null;
    description?: string | null;
    coverImage?: string | null;
    stats?: CourseStoryStats;
  };
}

export function CourseShareModal({
  isOpen,
  onClose,
  course,
}: CourseShareModalProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);

  if (!isOpen) return null;

  const currentOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://aavana.ir";
  const canonicalUrl = `${currentOrigin}/courses/${encodeURIComponent(course.id)}`;

  // Public base URL: ensures crawlers are not sent unreachable localhost URLs during local testing
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname.endsWith(".local"));
  const publicBaseUrl = isLocalhost ? "https://aavana.ir" : currentOrigin;

  // Use /v1/share/courses/:courseId as Nginx proxies /v1/ directly to the Fastify API
  const sharePageUrl = `${publicBaseUrl}/v1/share/courses/${encodeURIComponent(course.id)}`;
  const cleanTitle = cleanEducationalTitle(course.title);

  const shareText = `دوره آموزشی «${cleanTitle}» در پلتفرم یادگیری آوانا\n${canonicalUrl}`;

  // 1. Copy Link
  const handleCopyLink = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(canonicalUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = canonicalUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      setIsCopied(false);
    }
  };

  // 2. Share to Telegram
  const handleTelegramShare = () => {
    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(
      sharePageUrl,
    )}&text=${encodeURIComponent(
      `دوره آموزشی «${cleanTitle}» در آوانا:`,
    )}`;
    window.open(telegramUrl, "_blank", "noopener,noreferrer");
  };

  // 3. Share to WhatsApp
  const handleWhatsAppShare = () => {
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
      shareText,
    )}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  // 4. Native Device Web Share API
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleNativeShare = async () => {
    if (!canNativeShare) return;
    try {
      await navigator.share({
        title: cleanTitle,
        text: `دوره آموزشی «${cleanTitle}» در پلتفرم یادگیری آوانا`,
        url: canonicalUrl,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
    }
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
        dir="rtl"
      >
        <div className="relative w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary">
                <Share2 className="w-4 h-4" />
              </div>
              <div>
                <h3
                  id="share-modal-title"
                  className="text-base font-bold text-[var(--color-text)]"
                >
                  اشتراک‌گذاری دوره
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate max-w-[240px]">
                  {cleanTitle}
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

          {/* Body */}
          <div className="p-6 space-y-5">
            {/* Link Copy Box */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--color-text-muted)] block">
                پیوند پایدار دوره
              </label>
              <div className="flex items-center gap-2 p-1.5 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-2xl">
                <input
                  type="text"
                  readOnly
                  value={canonicalUrl}
                  className="flex-1 px-3 py-1.5 text-xs text-[var(--color-text)] bg-transparent outline-none dir-ltr font-mono truncate"
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  variant={isCopied ? "secondary" : "primary"}
                  size="sm"
                  onClick={handleCopyLink}
                  leftIcon={
                    isCopied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )
                  }
                  className="rounded-xl text-xs shrink-0 !h-8"
                >
                  {isCopied ? "کپی شد" : "کپی لینک"}
                </Button>
              </div>
            </div>

            {/* Sharing Channels Grid */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {/* Telegram */}
              <button
                type="button"
                onClick={handleTelegramShare}
                className="flex items-center gap-2.5 p-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[#229ED9]/10 hover:border-[#229ED9]/40 text-[var(--color-text)] transition-all group text-start cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[#229ED9]/10 text-[#229ED9] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Send className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-bold truncate">تلگرام</span>
                  <span className="block text-[11px] text-[var(--color-text-muted)] truncate">
                    ارسال در چت و کانال
                  </span>
                </div>
              </button>

              {/* WhatsApp */}
              <button
                type="button"
                onClick={handleWhatsAppShare}
                className="flex items-center gap-2.5 p-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[#25D366]/10 hover:border-[#25D366]/40 text-[var(--color-text)] transition-all group text-start cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[#25D366]/10 text-[#25D366] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-bold truncate">واتساپ</span>
                  <span className="block text-[11px] text-[var(--color-text-muted)] truncate">
                    ارسال به مخاطبان
                  </span>
                </div>
              </button>

              {/* Native System Share */}
              {canNativeShare && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="flex items-center gap-2.5 p-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-primary/10 hover:border-primary/40 text-[var(--color-text)] transition-all group text-start cursor-pointer col-span-2 sm:col-span-1"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-xs font-bold truncate">اشتراک سیستمی</span>
                    <span className="block text-[11px] text-[var(--color-text-muted)] truncate">
                      منوی دستگاه
                    </span>
                  </div>
                </button>
              )}

              {/* Instagram Story CTA */}
              <button
                type="button"
                onClick={() => setIsStoryModalOpen(true)}
                className={`flex items-center gap-2.5 p-3 rounded-2xl border border-primary/30 bg-primary/5 hover:bg-primary/15 hover:border-primary text-primary transition-all group text-start cursor-pointer ${
                  canNativeShare ? "col-span-2 sm:col-span-1" : "col-span-2"
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-bold truncate">ساخت استوری دوره</span>
                  <span className="block text-[11px] text-primary/80 truncate">
                    تصویر عمودی ۹:۱۶
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]">
            <Button variant="outline" size="sm" onClick={onClose} className="rounded-button text-xs">
              بستن
            </Button>
          </div>
        </div>
      </div>

      {/* Nested Course Story Modal */}
      <CourseStoryModal
        isOpen={isStoryModalOpen}
        onClose={() => setIsStoryModalOpen(false)}
        course={{
          courseId: course.id,
          title: cleanTitle,
          subject: course.subject,
          description: course.description,
          coverImage: course.coverImage,
          stats: course.stats,
          shareUrl: canonicalUrl,
        }}
      />
    </>
  );
}
