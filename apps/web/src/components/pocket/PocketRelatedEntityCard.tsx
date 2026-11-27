import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { PocketRelatedEntityItem } from "../../lib/api/pocket.js";
import { AggregateTypeBadge } from "./AggregateTypeBadge.js";
import { VerificationBadge } from "./VerificationBadge.js";

export interface PocketRelatedEntityCardProps {
  entity: PocketRelatedEntityItem;
  className?: string;
}

export const PocketRelatedEntityCard: React.FC<PocketRelatedEntityCardProps> = ({
  entity,
  className = "",
}) => {
  const isVerified = Boolean(entity.verification?.isClinicallyVerified);
  const verifiedCount = entity.verification?.verifiedAssertionsCount ?? 0;
  const totalCount = entity.verification?.totalAssertionsCount ?? 0;
  const hasValidRatio = totalCount > 0 && verifiedCount >= 0 && verifiedCount <= totalCount;
  const displayTitleFa = entity.titleFa?.trim() || entity.titleEn?.trim() || entity.slug || "موجودیت بالینی";
  const cleanNotes = entity.clinicalNotes?.trim();
  const cleanClassification = entity.classification?.trim();

  return (
    <article
      data-testid={`related-entity-card-${entity.id}`}
      className={`p-4 sm:p-5 rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs hover:border-[#008080] hover:shadow-sm transition-all flex flex-col justify-between gap-3 ${className}`}
      dir="rtl"
    >
      <div>
        {/* Top Badges & Verification Status */}
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <AggregateTypeBadge type={entity.type} size="sm" />
            {cleanClassification && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[var(--color-text-secondary)] font-medium">
                {cleanClassification}
              </span>
            )}
          </div>

          {/* Verification Badge */}
          {isVerified ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <VerificationBadge
                verifiedAt={entity.verification?.lastVerifiedAt ?? undefined}
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
            to={`/pocket/${entity.type}/${entity.id}`}
            className="group inline-flex items-baseline gap-2 flex-wrap"
          >
            <h4 className="text-sm sm:text-base font-bold text-[var(--color-text-primary)] group-hover:text-[#008080] transition-colors">
              {displayTitleFa}
            </h4>
            {entity.titleEn && entity.titleEn.trim() && entity.titleEn !== displayTitleFa && (
              <span className="text-xs font-mono text-[var(--color-text-muted)]" dir="ltr">
                ({entity.titleEn.trim()})
              </span>
            )}
          </Link>
        </div>

        {/* Relationship Label / Pill */}
        {entity.relationshipType && (
          <div className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-[#008080] dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-medium mt-1">
            <span>{entity.relationshipType}</span>
          </div>
        )}

        {/* Clinical Notes (when provided by backend) */}
        {cleanNotes && (
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed mt-2.5 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-[10px] border border-[var(--color-border)]">
            {cleanNotes}
          </p>
        )}
      </div>

      {/* Footer Navigation Link */}
      <div className="pt-2.5 border-t border-[var(--color-border)] flex items-center justify-between gap-2">
        <Link
          to={`/pocket/${entity.type}/${entity.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#008080] dark:text-teal-400 hover:underline"
        >
          <span>مشاهده جزئیات موجودیت</span>
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
      </div>
    </article>
  );
};
