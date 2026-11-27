import React from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";

export interface VerificationBadgeProps {
  isVerified?: boolean;
  verifiedAt?: string | Date | null;
  size?: "sm" | "md";
  className?: string;
}

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  isVerified,
  verifiedAt,
  size = "md",
  className = "",
}) => {
  const isClinicallyVerified = isVerified !== undefined ? isVerified : Boolean(verifiedAt);
  const formattedDate = verifiedAt
    ? new Date(verifiedAt).toLocaleDateString("fa-IR")
    : null;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[11px] gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
  };

  if (!isClinicallyVerified) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-medium ${sizeClasses[size]} ${className}`}
        dir="rtl"
        data-testid="verification-badge-unverified"
      >
        <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
        <span>تأیید بالینی احراز نشده است</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-medium ${sizeClasses[size]} ${className}`}
      dir="rtl"
      data-testid="verification-badge-verified"
    >
      <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span>تأییدشده بالینی</span>
      {formattedDate && (
        <span className="text-emerald-600/80 dark:text-emerald-400/80 font-normal">
          ({formattedDate})
        </span>
      )}
    </span>
  );
};
