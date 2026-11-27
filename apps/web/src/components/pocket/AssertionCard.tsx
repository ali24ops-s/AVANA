import React from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Globe, Users, Building2 } from "lucide-react";
import type { PublishedAssertionItem } from "../../lib/api/pocket.js";
import { VerificationBadge } from "./VerificationBadge.js";

export interface AssertionCardProps {
  assertion: PublishedAssertionItem;
  className?: string;
}

export const AssertionCard: React.FC<AssertionCardProps> = ({
  assertion,
  className = "",
}) => {
  const formattedDate = assertion.publishedAt
    ? new Date(assertion.publishedAt).toLocaleDateString("fa-IR")
    : null;

  return (
    <article
      className={`p-5 rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs hover:border-[var(--color-primary)] transition-all flex flex-col justify-between gap-4 ${className}`}
      dir="rtl"
    >
      <div>
        {/* Top Badges & Meta */}
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[var(--color-text-secondary)] font-mono">
              {assertion.assertionKey}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-[#008080] dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-medium">
              {assertion.assertionType}
            </span>
          </div>

          <VerificationBadge
            isVerified={assertion.isClinicallyVerified}
            verifiedAt={assertion.verifiedAt}
            size="sm"
          />
        </div>

        {/* Statement Text */}
        <p className="text-sm md:text-base font-normal text-[var(--color-text-primary)] leading-relaxed mb-4">
          {assertion.statementText}
        </p>

        {/* Scope Indicators */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--color-text-muted)]">
          {assertion.targetPopulation && (
            <div className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>جامعه هدف: {assertion.targetPopulation}</span>
            </div>
          )}
          {assertion.clinicalSetting && (
            <div className="flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>محیط بالینی: {assertion.clinicalSetting}</span>
            </div>
          )}
          {assertion.jurisdiction && (
            <div className="flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <span>حوزه: {assertion.jurisdiction}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer Details & Action */}
      <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
        <div>
          <span>نسخه {assertion.versionNumber}</span>
          {formattedDate && <span className="mr-2">| انتشار: {formattedDate}</span>}
        </div>

        <Link
          to={`/pocket/assertions/${assertion.id}`}
          className="inline-flex items-center gap-1 text-[#008080] dark:text-teal-400 font-semibold hover:underline"
        >
          <span>تأییدیه‌ها و جزئیات</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </article>
  );
};
