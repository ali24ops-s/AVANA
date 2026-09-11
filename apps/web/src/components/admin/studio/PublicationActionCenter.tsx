import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  Send,
  Loader2,
  Archive,
  DollarSign,
} from "lucide-react";
import {
  api,
  type OfficialCourse,
  type OfficialReviewWorkspace,
  type ConsistencyValidationReport,
} from "../../../lib/api/admin.js";
import { toPersianDigits } from "@avana/domain";

export interface PublicationActionCenterProps {
  course: OfficialCourse;
  onSuccess?: () => void;
}

export function PublicationActionCenter({
  course,
  onSuccess,
}: PublicationActionCenterProps) {
  const queryClient = useQueryClient();

  const [priceInput, setPriceInput] = useState<number>(
    course.product?.price || 499000,
  );

  useEffect(() => {
    setPriceInput(course.product?.price || 499000);
  }, [course.id, course.product?.price]);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [approveSuccessMsg, setApproveSuccessMsg] = useState<string | null>(
    null,
  );
  const [publishSuccessMsg, setPublishSuccessMsg] = useState<string | null>(
    null,
  );

  // Review workspace query to check approval invariants
  const reviewQuery = useQuery({
    queryKey: ["official-review-workspace", course.id],
    queryFn: async () => {
      return api.get<OfficialReviewWorkspace>(
        `/admin/content-studio/courses/${course.id}/review`,
      );
    },
  });

  // Consistency validation report
  const consistencyQuery = useQuery({
    queryKey: ["official-consistency", course.id],
    queryFn: async () => {
      return api.get<ConsistencyValidationReport>(
        `/admin/content-studio/courses/${course.id}/validate`,
      );
    },
  });

  const workspace = reviewQuery.data;
  const consistencyReport = consistencyQuery.data;
  const unresolvedCount = workspace?.unresolvedLessonMappings ?? 0;
  const isReadyForApproval =
    Boolean(workspace?.readyForApproval) && unresolvedCount === 0;

  // 1. Approve Course Mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      setApproveError(null);
      setApproveSuccessMsg(null);
      const res = await fetch(
        `/v1/admin/content-studio/courses/${course.id}/approve`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "خطا در تایید رسمی دوره");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setApproveSuccessMsg(
        `دوره با موفقیت تایید شد! (${data.materialized?.modules ?? 0} فصل، ${data.materialized?.lessons ?? 0} درس، ${data.materialized?.flashcards ?? 0} فلش‌کارت، ${data.materialized?.questions ?? 0} سؤال تستی)`,
      );
      void queryClient.invalidateQueries({ queryKey: ["official-courses"] });
      void queryClient.invalidateQueries({
        queryKey: ["official-review-workspace", course.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-hierarchy", course.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["official-consistency", course.id],
      });
      if (onSuccess) onSuccess();
    },
    onError: (err: Error) => {
      setApproveError(err.message || "خطا در تایید رسمی دوره");
    },
  });

  // 2. Set Price Mutation
  const pricingMutation = useMutation({
    mutationFn: async () => {
      setPricingError(null);
      const res = await fetch(
        `/v1/admin/content-studio/courses/${course.id}/pricing`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ price: priceInput }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "خطا در ثبت قیمت محصول");
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["official-courses"] });
      void queryClient.invalidateQueries({
        queryKey: ["official-consistency", course.id],
      });
      if (onSuccess) onSuccess();
    },
    onError: (err: Error) => {
      setPricingError(err.message || "خطا در ثبت قیمت");
    },
  });

  // 3. Publish Course Mutation
  const publishMutation = useMutation({
    mutationFn: async () => {
      setPublishError(null);
      setPublishSuccessMsg(null);
      const res = await fetch(
        `/v1/admin/content-studio/courses/${course.id}/publish`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "خطا در انتشار عمومی دوره");
      }
      return res.json();
    },
    onSuccess: () => {
      setPublishSuccessMsg(
        "دوره رسمی با موفقیت منتشر شد و محصول تجاری در وضعیت فعال قرار گرفت.",
      );
      void queryClient.invalidateQueries({ queryKey: ["official-courses"] });
      void queryClient.invalidateQueries({
        queryKey: ["official-consistency", course.id],
      });
      if (onSuccess) onSuccess();
    },
    onError: (err: Error) => {
      setPublishError(err.message || "خطا در انتشار عمومی دوره");
    },
  });

  // 4. Archive Course Mutation
  const archiveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/v1/admin/content-studio/courses/${course.id}/archive`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "خطا در بایگانی دوره");
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["official-courses"] });
      if (onSuccess) onSuccess();
    },
  });

  return (
    <div className="space-y-6">
      {/* 1. Official Course Approval Section */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[var(--color-primary-default)]" />
              <span>مرحله ۱: تایید رسمی و ثبت ساختار دوره (Official Approval)</span>
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              تایید محتوای تولیدشده باعث ایجاد ماژول‌ها، درس‌ها، فلش‌کارت‌ها و آزمون‌ها در پایگاه‌داده و تغییر وضعیت دوره به «تایید شده» می‌شود.
            </p>
          </div>

          <div className="shrink-0">
            {course.status === "approved" || course.status === "published" ? (
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>تایید شده است</span>
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)] text-xs font-semibold">
                در انتظار تایید
              </span>
            )}
          </div>
        </div>

        {/* Approval Alerts */}
        {approveError && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{approveError}</span>
          </div>
        )}

        {approveSuccessMsg && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{approveSuccessMsg}</span>
          </div>
        )}

        {unresolvedCount > 0 && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>
              {toPersianDigits(unresolvedCount)} مورد خطای نگاشت درسنامه وجود دارد. تایید رسمی تا رفع خطاهای نگاشت مسدود است.
            </span>
          </div>
        )}

        {course.status !== "approved" && course.status !== "published" && (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending || !isReadyForApproval}
              className="px-5 py-2.5 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در حال اعتبارسنجی و ثبت ساختار دوره...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تایید رسمی دوره و استقرار ساختار آموزشی</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 2. Product Pricing Section */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-[var(--color-primary-default)]" />
            <span>مرحله ۲: قیمت‌گذاری محصول تجاری (Product Pricing)</span>
          </h3>
          <p className="text-xs text-[var(--color-text-muted)]">
            قیمت دسترسی مادام‌العمر به دوره را تعیین نمایید. این قیمت در کاتالوگ فروش و فرآیند خرید اعمال می‌شود.
          </p>
        </div>

        {pricingError && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{pricingError}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1">
            <label
              htmlFor="course-price-input"
              className="block text-xs font-bold text-[var(--color-text)] mb-1.5"
            >
              قیمت فروش دوره (تومان) *
            </label>
            <input
              id="course-price-input"
              type="number"
              min={1000}
              step={1000}
              value={priceInput}
              onChange={(e) =>
                setPriceInput(parseInt(e.target.value, 10) || 0)
              }
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] focus:border-transparent transition-all"
            />
          </div>

          <div className="sm:self-end">
            <button
              type="button"
              onClick={() => pricingMutation.mutate()}
              disabled={pricingMutation.isPending}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] text-xs font-bold transition-colors flex items-center justify-center gap-2"
            >
              {pricingMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShoppingBag className="w-4 h-4 text-[var(--color-primary-default)]" />
              )}
              <span>ثبت قیمت تجاری</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Consistency Validation & Publishing Section */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
            <Send className="w-5 h-5 text-[var(--color-primary-default)]" />
            <span>مرحله ۳: اعتبارسنجی الزامات و انتشار عمومی (Publish & Activate)</span>
          </h3>
          <p className="text-xs text-[var(--color-text-muted)]">
            بررسی نهایی الزامات پایگاه‌داده و فعال‌سازی فروش دوره برای دانشجویان در بستر سراسری آوانا.
          </p>
        </div>

        {/* Consistency Validation Checklist */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-[var(--color-text-muted)]">
            چک‌لیست اعتبارسنجی پیش از انتشار (Consistency Pre-flight):
          </h4>

          {consistencyQuery.isLoading ? (
            <div className="p-4 text-center text-xs text-[var(--color-text-muted)] flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary-default)]" />
              <span>در حال اعتبارسنجی الزامات دوره...</span>
            </div>
          ) : consistencyReport ? (
            <div
              className={`p-4 rounded-xl border text-xs space-y-2 ${
                consistencyReport.valid
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300"
              }`}
            >
              <div className="font-bold flex items-center gap-2">
                {consistencyReport.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                )}
                <span>
                  {consistencyReport.valid
                    ? "تمامی الزامات انتشار با موفقیت تایید شد."
                    : "برخی الزامات انتشار تأمین نشده است:"}
                </span>
              </div>

              {!consistencyReport.valid && (
                <ul className="list-disc list-inside space-y-1 text-[11px] opacity-90 ps-2">
                  {consistencyReport.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        {publishError && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{publishError}</span>
          </div>
        )}

        {publishSuccessMsg && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{publishSuccessMsg}</span>
          </div>
        )}

        {/* Final Publish Button */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-[var(--color-border)]">
          <div>
            {course.status !== "archived" && (
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(
                      "آیا از بایگانی کردن این دوره رسمی و توقف فروش آن اطمینان دارید؟",
                    )
                  ) {
                    archiveMutation.mutate();
                  }
                }}
                disabled={archiveMutation.isPending}
                className="px-4 py-2 text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-500/10 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>بایگانی دوره</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => publishMutation.mutate()}
            disabled={
              publishMutation.isPending ||
              !consistencyReport?.valid ||
              course.status === "published"
            }
            className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all ${
              course.status === "published"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 cursor-default"
                : "bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white"
            }`}
          >
            {publishMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال انتشار و فعال‌سازی فروش...</span>
              </>
            ) : course.status === "published" ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>دوره منتشر شده و در حال فروش است</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>انتشار عمومی دوره و فعال‌سازی فروش</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
