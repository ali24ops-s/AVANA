import React from "react";

export interface PageHeaderBadge {
  text: string;
  icon?: React.ReactNode;
}

export interface PageHeaderProps {
  title: React.ReactNode;
  titleClassName?: string;
  badge?: PageHeaderBadge;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  titleClassName = "",
  badge,
  description,
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-[var(--color-border)] ${className}`}
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-center sm:justify-start gap-2.5 flex-wrap">
          <h1 className={`text-lg sm:text-2xl lg:text-3xl font-black text-[var(--color-text)] tracking-tight text-center sm:text-right ${titleClassName}`}>
            {title}
          </h1>
          {badge && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-teal-500/10 text-primary border border-teal-500/20 whitespace-nowrap shrink-0">
              {badge.icon}
              <span>{badge.text}</span>
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed max-w-2xl">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="w-full lg:w-auto flex items-center gap-2 sm:gap-2.5 shrink-0 flex-wrap justify-start lg:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
