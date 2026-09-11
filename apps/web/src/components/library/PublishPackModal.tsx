/**
 * PublishPackModal Component.
 *
 * Creator confirmation modal for publishing approved educational content
 * (lesson, flashcard, quiz, review_summary) as an immutable Content Pack
 * to the Avana Public Library.
 */

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  BookOpen,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { usePublishContentPack } from "../../hooks/useLibrary.js";
import { ApiError } from "../../lib/api/errors.js";
import type { PublishContentPackResponse } from "../../lib/api/library.js";
import type { DocumentContentStatus } from "../../lib/api/generation.js";
import { toPersianDigits } from "@avana/domain";

export interface PublishPackModalProps {
  organizationId: string;
  documentId: string;
  defaultTitle?: string;
  defaultSubject?: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: (pack: PublishContentPackResponse["pack"]) => void;
  contentStatus?: {
    lesson?: DocumentContentStatus;
    flashcards?: DocumentContentStatus;
    exam?: DocumentContentStatus;
    review_summary?: DocumentContentStatus;
  } | null;
}

export function PublishPackModal({
  organizationId,
  documentId,
  defaultTitle = "",
  defaultSubject = "",
  open,
  onClose,
  onSuccess,
  contentStatus,
}: PublishPackModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [publishedResult, setPublishedResult] = useState<
    PublishContentPackResponse["pack"] | null
  >(null);

  const publishMutation = usePublishContentPack();

  // Reset form fields when opening modal
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setDescription("");
      setSubject(defaultSubject);
      setErrorMessage(null);
      setPublishedResult(null);
      if (typeof document !== "undefined") {
        document.body.style.overflow = "hidden";
      }
    } else {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "";
      }
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "";
      }
    };
  }, [open, defaultTitle, defaultSubject]);

  // Handle ESC key to close (only when idle / not pending)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !publishMutation.isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, publishMutation.isPending, onClose]);

  // Compute accepted content composition for dynamic preview
  const acceptedItemsList = useMemo(() => {
    if (!contentStatus) return [];
    const items: Array<{ type: string; label: string }> = [];
    if (contentStatus.lesson?.accepted) {
      const count = contentStatus.lesson.count || 1;
      items.push({
        type: "lesson",
        label: count > 1 ? `${toPersianDigits(count)} درسنامه` : "درسنامه",
      });
    }
    if (contentStatus.flashcards?.accepted) {
      const count = contentStatus.flashcards.count;
      items.push({
        type: "flashcard",
        label: count ? `${toPersianDigits(count)} فلش‌کارت` : "فلش‌کارت",
      });
    }
    if (contentStatus.exam?.accepted) {
      const count = contentStatus.exam.count;
      items.push({
        type: "quiz",
        label: count ? `${toPersianDigits(count)} سؤال آزمون` : "آزمون",
      });
    }
    if (contentStatus.review_summary?.accepted) {
      items.push({
        type: "review_summary",
        label: "خلاصه مروری",
      });
    }
    return items;
  }, [contentStatus]);

  if (!open) return null;

  const handlePublish = () => {
    if (publishMutation.isPending) return;
    setErrorMessage(null);

    publishMutation.mutate(
      {
        organizationId,
        documentId,
        data: {
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          subject: subject.trim() || undefined,
        },
      },
      {
        onSuccess: (res) => {
          setPublishedResult(res.pack);
          if (onSuccess) {
            onSuccess(res.pack);
          }
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            switch (err.code) {
              case "conflict":
                setErrorMessage("این سند قبلاً به عنوان یک بسته فعال در کتابخانه منتشر شده است.");
                break;
              case "bad_request":
                setErrorMessage(
                  err.message || "این محتوا هنوز برای انتشار آماده نیست.",
                );
                break;
              case "forbidden":
              case "unauthorized":
                setErrorMessage("شما دسترسی لازم برای انتشار محتوا در این سازمان را ندارید.");
                break;
              default:
                setErrorMessage(err.message || "خطایی در انتشار بسته رخ داد.");
            }
          } else if (err instanceof Error) {
            setErrorMessage(err.message || "خطایی در انتشار بسته رخ داد.");
          } else {
            setErrorMessage("خطایی در برقراری ارتباط با سرور رخ داد.");
          }
        },
      },
    );
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-xs overflow-y-auto"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !publishMutation.isPending) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-xl overflow-hidden flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-[var(--color-border)] flex items-start justify-between gap-4 bg-[var(--color-surface)]">
          <div className="min-w-0">
            <h2
              id="publish-modal-title"
              className="text-lg font-bold text-[var(--color-text)] flex items-center gap-2"
            >
              <BookOpen className="w-5 h-5 text-[#008080]" />
              <span>ارسال برای بررسی و انتشار در کتابخانه</span>
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              محتوای تاییدشده شما پس از بررسی و تعیین مدل دسترسی/قیمت توسط ادمین آوانا در کتابخانه عمومی منتشر خواهد شد.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={publishMutation.isPending}
            aria-label="بستن پنجره"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-2 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5">
          {publishedResult ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <h4 className="font-bold text-sm text-[var(--color-text)]">
                    بسته آموزشی شما با موفقیت برای بررسی ارسال شد.
                  </h4>
                  <p className="text-[var(--color-text-muted)] leading-relaxed">
                    بسته آموزشی «{publishedResult.title}» در صف بررسی ادمین قرار گرفت. پس از تأیید و تعیین قیمت، در کتابخانه عمومی در دسترس تمام کاربران قرار خواهد گرفت.
                  </p>
                </div>
              </div>

              {/* Published Pack Stats Preview */}
              {publishedResult.stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl text-center text-xs">
                  <div className="p-2 rounded-lg bg-white border border-[var(--color-border)]">
                    <span className="text-[var(--color-text-muted)] block text-[10px]">درسنامه</span>
                    <span className="font-bold text-[#008080]">
                      {publishedResult.stats.session_count || 0} جلسه
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-[var(--color-border)]">
                    <span className="text-[var(--color-text-muted)] block text-[10px]">فلش‌کارت</span>
                    <span className="font-bold text-purple-700">
                      {publishedResult.stats.flashcard_count || 0} کارت
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-[var(--color-border)]">
                    <span className="text-[var(--color-text-muted)] block text-[10px]">آزمون</span>
                    <span className="font-bold text-amber-700">
                      {publishedResult.stats.quiz_question_count || 0} سؤال
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-[var(--color-border)]">
                    <span className="text-[var(--color-text-muted)] block text-[10px]">زمان مطالعه</span>
                    <span className="font-bold text-[var(--color-text)]">
                      ~{publishedResult.stats.estimated_reading_minutes || 12} دقیقه
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-[#008080] hover:bg-[#006666] text-white text-xs font-bold transition-all shadow-xs"
                >
                  بستن
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Immutability Notice Banner */}
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-950 space-y-2">
                <div className="flex items-center gap-2 text-teal-800 font-bold">
                  <ShieldCheck className="w-4 h-4 text-[#008080]" />
                  <span>تضمین عدم وابستگی و نسخه تغییرناپذیر</span>
                </div>
                <p className="leading-relaxed">
                  با انتشار این محتوا، یک نسخه مستقل و تغییرناپذیر (Immutable Snapshot) از محتواهای تاییدشده فایل شما در کتابخانه آوانا قرار می‌گیرد.
                </p>
                <p className="text-[11px] text-teal-700">
                  تغییرات، ویرایش‌ها یا حذف بعدی فایل در دوره شما، تأثیری روی نسخه منتشرشده در کتابخانه نخواهد داشت.
                </p>
              </div>

              {/* Accepted Contents Composition */}
              {acceptedItemsList.length > 0 && (
                <div className="p-3.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-2">
                  <span className="text-xs font-bold text-[var(--color-text)] block">
                    محتواهای تاییدشده موجود در این بسته:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {acceptedItemsList.map((item, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-100/70 border border-teal-200 text-teal-800 text-xs font-medium"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#008080]" />
                        <span>{item.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Form Inputs */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                    عنوان بسته در کتابخانه:
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={publishMutation.isPending}
                    placeholder="مثال: فیزیولوژی قلب و عروق — بخش اول"
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#008080] disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                    موضوع / رشته درسی:
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={publishMutation.isPending}
                    placeholder="مثال: فیزیولوژی، فارماکولوژی، داخلی، جراحی..."
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#008080] disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                    توضیحات مختصر (اختیاری):
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={publishMutation.isPending}
                    placeholder="نکات کلیدی، پیش‌نیازها و راهنمایی مطالعه این بسته برای دانشجویان..."
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#008080] resize-none disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={publishMutation.isPending}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  انصراف
                </button>

                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={publishMutation.isPending}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#008080] hover:bg-[#006666] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-all"
                >
                  {publishMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>در حال ارسال برای بررسی...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>ارسال برای بررسی ادمین</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}
