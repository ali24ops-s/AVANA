import React from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ArrowRight } from "lucide-react";

export interface PocketBreadcrumbItem {
  label: string;
  to?: string;
}

export interface PocketPageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: PocketBreadcrumbItem[];
  backLink?: {
    to: string;
    label?: string;
  };
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const PocketPageHeader: React.FC<PocketPageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  backLink,
  actions,
  badge,
  className = "",
}) => {
  return (
    <header className={`mb-6 flex flex-col gap-3 ${className}`} dir="rtl">
      {/* Navigation & Breadcrumbs */}
      {(backLink || (breadcrumbs && breadcrumbs.length > 0)) && (
        <nav aria-label="راهنمای مسیر" className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          {backLink && (
            <Link
              to={backLink.to}
              className="inline-flex items-center gap-1 font-medium hover:text-[var(--color-primary)] transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>{backLink.label ?? "بازگشت"}</span>
            </Link>
          )}

          {backLink && breadcrumbs && breadcrumbs.length > 0 && (
            <span className="text-[var(--color-border)]">|</span>
          )}

          {breadcrumbs?.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.label}>
                {idx > 0 && <ChevronLeft className="w-3 h-3 text-slate-400" />}
                {crumb.to && !isLast ? (
                  <Link
                    to={crumb.to}
                    className="hover:text-[var(--color-primary)] transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={isLast ? "font-semibold text-[var(--color-text-primary)]" : ""}>
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      {/* Main Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text-primary)]">
            {title}
          </h1>
          {badge}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {subtitle && (
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed max-w-3xl">
          {subtitle}
        </p>
      )}
    </header>
  );
};
