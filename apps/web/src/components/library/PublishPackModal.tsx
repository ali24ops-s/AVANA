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
        label: count > 1 ? `${count} درسنامه` : "درسنامه",
      });
    }
    if (contentStatus.flashcards?.accepted) {
      const count = contentStatus.flashcards.count;
      items.push({
        type: "flashcard",
        label: count ? `${count} فلش‌کارت` : "فلش‌کارت",
      });
    }
    if (contentStatus.exam?.accepted) {
      const count = contentStatus.exam.count;
      items.push({
        type: "quiz",
        label: count ? `${count} سؤال آزمون` : "آزمون",
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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-xl overflow-y-auto"
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
        className="relative w-full max-w-xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden glass-panel flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-white/10 flex items-start justify-between gap-4 bg-slate-900/80">
          <div className="min-w-0">
            <h2
              id="publish-modal-title"
              className="text-lg font-bold text-white flex items-center gap-2"
            >
              <BookOpen className="w-5 h-5 text-teal-400" />
              <span>انتشار در کتابخانه آوانا</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              محتوای تأییدشده شما به‌صورت یک بسته آموزشی مستقل در کتابخانه عمومی آوانا منتشر می‌شود.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={publishMutation.isPending}
            aria-label="بستن پنجره"
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5">
          {publishedResult ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <h4 className="font-bold text-sm text-white">
                    بسته آموزشی شما با موفقیت در کتابخانه آوانا منتشر شد.
                  </h4>
                  <p className="text-slate-300 leading-relaxed">
                    بسته آموزشی «{publishedResult.title}» اکنون در کتابخانه عمومی در دسترس تمام کاربران قرار گرفته است.
                  </p>
                </div>
              </div>

              {/* Published Pack Stats Preview */}
              {publishedResult.stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-white/[0.02] border border-white/10 rounded-xl text-center text-xs">
                  <div className="p-2 rounded-lg bg-white/5">
                    <span className="text-slate-400 block text-[10px]">درسنامه</span>
                    <span className="font-bold text-teal-300">
                      {publishedResult.stats.session_count || 0} جلسه
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5">
                    <span className="text-slate-400 block text-[10px]">فلش‌کارت</span>
                    <span className="font-bold text-purple-300">
                      {publishedResult.stats.flashcard_count || 0} کارت
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5">
                    <span className="text-slate-400 block text-[10px]">آزمون</span>
                    <span className="font-bold text-amber-300">
                      {publishedResult.stats.quiz_question_count || 0} سؤال
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5">
                    <span className="text-slate-400 block text-[10px]">زمان مطالعه</span>
                    <span className="font-bold text-slate-200">
                      ~{publishedResult.stats.estimated_reading_minutes || 12} دقیقه
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all shadow-md"
                >
                  بستن
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Immutability Notice Banner */}
              <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-slate-300 space-y-2">
                <div className="flex items-center gap-2 text-teal-300 font-bold">
                  <ShieldCheck className="w-4 h-4 text-teal-400" />
                  <span>تضمین عدم وابستگی و نسخه تغییرناپذیر</span>
                </div>
                <p className="leading-relaxed">
                  با انتشار این محتوا، یک نسخه مستقل و تغییرناپذیر (Immutable Snapshot) از محتواهای تاییدشده فایل شما در کتابخانه آوانا قرار می‌گیرد.
                </p>
                <p className="text-[11px] text-slate-400">
                  تغییرات، ویرایش‌ها یا حذف بعدی فایل در دوره شما، تأثیری روی نسخه منتشرشده در کتابخانه نخواهد داشت.
                </p>
              </div>

              {/* Accepted Contents Composition */}
              {acceptedItemsList.length > 0 && (
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
                  <span className="text-xs font-bold text-slate-300 block">
                    محتواهای تاییدشده موجود در این بسته:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {acceptedItemsList.map((item, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-medium"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                        <span>{item.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Form Inputs */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    عنوان بسته در کتابخانه:
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={publishMutation.isPending}
                    placeholder="مثال: فیزیولوژی قلب و عروق — بخش اول"
                    className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    موضوع / رشته درسی:
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={publishMutation.isPending}
                    placeholder="مثال: فیزیولوژی، فارماکولوژی، داخلی، جراحی..."
                    className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    توضیحات مختصر (اختیاری):
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={publishMutation.isPending}
                    placeholder="نکات کلیدی، پیش‌نیازها و راهنمایی مطالعه این بسته برای دانشجویان..."
                    className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={publishMutation.isPending}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  انصراف
                </button>

                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={publishMutation.isPending}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-teal-900/30 transition-all"
                >
                  {publishMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>در حال انتشار در کتابخانه...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>تایید و انتشار در کتابخانه</span>
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
