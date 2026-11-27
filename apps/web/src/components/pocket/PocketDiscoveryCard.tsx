import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { PocketDiscoveryItem } from "../../lib/api/pocket.js";
import { AggregateTypeBadge } from "./AggregateTypeBadge.js";
import { VerificationBadge } from "./VerificationBadge.js";
import { SafeHighlight } from "./SafeHighlight.js";

export interface PocketDiscoveryCardProps {
  item: PocketDiscoveryItem;
  searchQuery?: string;
  className?: string;
}

export const PocketDiscoveryCard: React.FC<PocketDiscoveryCardProps> = ({
  item,
  searchQuery,
  className = "",
}) => {
  const isVerified = Boolean(item.verification?.isClinicallyVerified);
  const verifiedCount = item.verification?.verifiedAssertionsCount ?? 0;
  const totalCount = item.verification?.totalAssertionsCount ?? 0;
  const hasValidRatio = totalCount > 0 && verifiedCount >= 0 && verifiedCount <= totalCount;
  const displayTitleFa = item.titleFa?.trim() || item.titleEn?.trim() || item.slug || "موجودیت بالینی";
  const cleanSummary = item.summary?.trim();

  return (
    <article
      data-testid={`discovery-card-${item.id}`}
      className={`p-5 rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs hover:border-[#008080] hover:shadow-sm transition-all flex flex-col justify-between gap-4 ${className}`}
      dir="rtl"
    >
      <div>
        {/* Top Badges & Meta */}
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <AggregateTypeBadge type={item.type} size="sm" />
            {item.classification && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[var(--color-text-secondary)] font-medium">
                {item.classification}
              </span>
            )}
            {item.versionNumber !== undefined && item.versionNumber !== null && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-900 border border-[var(--color-border)] text-[var(--color-text-muted)] font-mono">
                نسخه {item.versionNumber}
              </span>
            )}
          </div>

          {/* Verification Badge */}
          {isVerified ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <VerificationBadge
                verifiedAt={item.verification?.lastVerifiedAt ?? undefined}
                size="sm"
              />
              {hasValidRatio && (
                <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  {verifiedCount} از {totalCount} بیانیه
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-[var(--color-text-muted)] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              در انتظار داوری نهایی
            </span>
          )}
        </div>

        {/* Title Row */}
        <div className="mb-2">
          <Link
            to={`/pocket/${item.type}/${item.id}`}
            className="group inline-flex items-baseline gap-2 flex-wrap"
          >
            <h3 className="text-base md:text-lg font-bold text-[var(--color-text-primary)] group-hover:text-[#008080] transition-colors">
              <SafeHighlight text={displayTitleFa} query={searchQuery} />
            </h3>
            {item.titleEn && item.titleEn.trim() && item.titleEn !== displayTitleFa && (
              <span className="text-xs md:text-sm font-mono text-[var(--color-text-muted)]" dir="ltr">
                <SafeHighlight text={`(${item.titleEn.trim()})`} query={searchQuery} />
              </span>
            )}
          </Link>
        </div>

        {/* Summary Snippet */}
        {cleanSummary && (
          <p className="text-xs md:text-sm text-[var(--color-text-secondary)] leading-relaxed mb-3 line-clamp-3">
            <SafeHighlight text={cleanSummary} query={searchQuery} />
          </p>
        )}

        {/* Category Badge if distinct from classification */}
        {item.category && item.category !== item.classification && (
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-[8px]">
            <span>دسته‌بندی:</span>
            <span className="font-medium text-[var(--color-text-primary)]">{item.category}</span>
          </div>
        )}
      </div>

      {/* Footer Action */}
      <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between gap-2 text-xs">
        <span className="font-mono text-[11px] text-[var(--color-text-muted)] truncate">
          شناسه: {item.slug || item.id}
        </span>

        <Link
          to={`/pocket/${item.type}/${item.id}`}
          className="inline-flex items-center gap-1 font-semibold text-[#008080] hover:text-[#006060] transition-colors shrink-0"
        >
          <span>مشاهده اسناد و بیانیه‌ها</span>
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
      </div>
    </article>
  );
};
