import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { PocketSearchResultItem } from "../../lib/api/pocket.js";
import { AggregateTypeBadge } from "./AggregateTypeBadge.js";
import { VerificationBadge } from "./VerificationBadge.js";
import { SafeHighlight } from "./SafeHighlight.js";

export interface PocketSearchResultCardProps {
  item: PocketSearchResultItem;
  searchQuery?: string;
  className?: string;
}

const MATCH_FIELD_LABELS: Record<string, string> = {
  name_fa: "عنوان فارسی",
  name_en: "عنوان علمی / لاتین",
  brand_name: "نام تجاری / برند",
  alias: "نام متداول",
  classification: "رده‌بندی بالینی",
  summary: "شرح خلاصه بالینی",
};

export const PocketSearchResultCard: React.FC<PocketSearchResultCardProps> = ({
  item,
  searchQuery,
  className = "",
}) => {
  const matchLabel = item.matchField ? MATCH_FIELD_LABELS[item.matchField] ?? item.matchField : null;
  const isVerified = item.verification?.isClinicallyVerified;
  const verifiedCount = item.verification?.verifiedAssertionsCount ?? 0;
  const totalCount = item.verification?.totalAssertionsCount ?? 0;
  const highlightQuery = searchQuery ?? "";

  return (
    <article
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
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-900 border border-[var(--color-border)] text-[var(--color-text-muted)] font-mono">
              نسخه {item.versionNumber}
            </span>
          </div>

          {/* Verification Badge */}
          {isVerified ? (
            <div className="flex items-center gap-1.5">
              <VerificationBadge
                verifiedAt={item.verification?.lastVerifiedAt ?? undefined}
                size="sm"
              />
              {totalCount > 0 && (
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
              <SafeHighlight text={item.titleFa} query={highlightQuery} />
            </h3>
            {item.titleEn && (
              <span className="text-xs md:text-sm font-mono text-[var(--color-text-muted)]">
                <SafeHighlight text={`(${item.titleEn})`} query={highlightQuery} />
              </span>
            )}
          </Link>
        </div>

        {/* Summary Snippet */}
        {item.summary && (
          <p className="text-xs md:text-sm text-[var(--color-text-secondary)] leading-relaxed mb-3 line-clamp-3">
            <SafeHighlight text={item.summary} query={highlightQuery} />
          </p>
        )}

        {/* Matched Term Info */}
        {item.matchedTerm && matchLabel && item.matchedTerm !== item.titleFa && (
          <div className="inline-flex items-center gap-1.5 text-xs text-[#008080] bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/40 px-2.5 py-1 rounded-[8px]">
            <span>تطابق عبارت:</span>
            <strong className="font-semibold">
              <SafeHighlight text={item.matchedTerm} query={highlightQuery} />
            </strong>
            <span className="text-slate-400">({matchLabel})</span>
          </div>
        )}
      </div>

      {/* Footer Action */}
      <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between gap-2 text-xs">
        <span className="font-mono text-[11px] text-[var(--color-text-muted)] truncate">
          اسلاگ: {item.slug}
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
