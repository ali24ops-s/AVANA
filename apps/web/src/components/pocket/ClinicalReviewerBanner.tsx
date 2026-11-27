import React from "react";
import { ShieldCheck, UserCheck, Award } from "lucide-react";
import { usePocketReviewer } from "../../hooks/usePocketReviewer.js";

export interface ClinicalReviewerBannerProps {
  className?: string;
  showWhenNonReviewer?: boolean;
}

export const ClinicalReviewerBanner: React.FC<ClinicalReviewerBannerProps> = ({
  className = "",
  showWhenNonReviewer = false,
}) => {
  const { data: reviewerData, isLoading } = usePocketReviewer();

  if (isLoading) {
    return (
      <div className={`animate-pulse p-4 rounded-[16px] bg-slate-100 dark:bg-slate-800/50 border border-[var(--color-border)] ${className}`}>
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-2" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
      </div>
    );
  }

  const isReviewer = Boolean(reviewerData?.isReviewer && reviewerData?.credential?.isActive);
  const cred = reviewerData?.credential;

  if (isReviewer && cred) {
    const formattedExpiry = cred.licenseExpiresAt
      ? new Date(cred.licenseExpiresAt).toLocaleDateString("fa-IR")
      : "نامشخص";

    return (
      <div
        className={`p-4 md:p-5 rounded-[16px] bg-gradient-to-l from-teal-50 to-white dark:from-teal-950/40 dark:to-slate-900 border border-teal-200 dark:border-teal-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${className}`}
        dir="rtl"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-[12px] bg-[#008080] text-white flex items-center justify-center shrink-0 shadow-xs">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-[var(--color-text-primary)]">
                داور بالینی معتبر AVANA
              </span>
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/60 text-[#008080] dark:text-teal-300 font-semibold">
                <ShieldCheck className="w-3 h-3" />
                پروانه فعال
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              تخصص: <span className="font-semibold text-[var(--color-text-primary)]">{cred.specialty}</span> | مرجع صدور: {cred.licensingAuthority} (شماره: {cred.medicalLicenseNumber})
            </p>
          </div>
        </div>

        <div className="text-xs text-[var(--color-text-muted)] sm:text-left shrink-0">
          اعتبار تا: <span className="font-semibold text-[var(--color-text-primary)]">{formattedExpiry}</span>
        </div>
      </div>
    );
  }

  if (showWhenNonReviewer) {
    return (
      <div
        className={`p-4 rounded-[16px] bg-slate-50 dark:bg-slate-900/50 border border-[var(--color-border)] flex items-center gap-3 ${className}`}
        dir="rtl"
      >
        <div className="w-8 h-8 rounded-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
          <UserCheck className="w-4 h-4" />
        </div>
        <div className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          <span className="font-semibold text-[var(--color-text-primary)]">دسترسی مصرف‌کننده بالینی:</span> شما در حال مشاهده اطلاعات دارویی و بالینی مصوب AVANA Pocket هستید. اختیارات داوری بالینی مستلزم اعتبارسنجی پروانه نظام پزشکی است.
        </div>
      </div>
    );
  }

  return null;
};
