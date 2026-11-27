import React from "react";
import { Network, RefreshCw } from "lucide-react";
import type { PocketRelatedGroup } from "../../lib/api/pocket.js";
import { PocketRelatedEntityCard } from "./PocketRelatedEntityCard.js";
import { Skeleton, Alert, EmptyState } from "../ui/index.js";

export interface PocketRelatedEntitiesSectionProps {
  groups?: PocketRelatedGroup[];
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
  onRetry?: () => void;
  className?: string;
}

export const PocketRelatedEntitiesSection: React.FC<PocketRelatedEntitiesSectionProps> = ({
  groups,
  isLoading,
  isError,
  error,
  onRetry,
  className = "",
}) => {
  const totalEntities = groups?.reduce((acc, g) => acc + g.entities.length, 0) ?? 0;

  return (
    <section
      aria-label="موجودیت‌های بالینی مرتبط"
      className={`mt-10 pt-8 border-t border-[var(--color-border)] ${className}`}
      dir="rtl"
    >
      {/* Section Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-[#008080]" />
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            موجودیت‌های بالینی مرتبط (Related Clinical Entities)
          </h2>
        </div>
        {!isLoading && !isError && (
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-[#008080] dark:text-teal-300 font-mono">
            {totalEntities} موجودیت مرتبط
          </span>
        )}
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-6">
          <div>
            <Skeleton height={20} width="30%" className="mb-3" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton height={140} className="rounded-[16px]" />
              <Skeleton height={140} className="rounded-[16px]" />
            </div>
          </div>
        </div>
      )}

      {/* Error State with Non-blocking Graceful Handling */}
      {!isLoading && isError && (
        <Alert
          variant="warning"
          title="خطا در بازیابی موجودیت‌های بالینی مرتبط"
        >
          <div className="text-xs text-[var(--color-text-secondary)]">
            {error?.message || "امکان دریافت اطلاعات موجودیت‌های بالینی مرتبط در حال حاضر وجود ندارد."}
          </div>
          {onRetry && (
            <div className="mt-3">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#008080] hover:underline"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تلاش مجدد برای بارگذاری ارتباطات</span>
              </button>
            </div>
          )}
        </Alert>
      )}

      {/* Empty State */}
      {!isLoading && !isError && totalEntities === 0 && (
        <EmptyState
          title="هیچ موجودیت بالینی مرتبطی برای این مدخل ثبت نشده است"
          description="ارتباط مستقیم بالینی مصوب (مانند اندیکاسیون، پروتکل درمانی، تداخل دارویی یا اقدامات اورژانس) در پایگاه دانش موجود نیست."
        />
      )}

      {/* Relationship Groups */}
      {!isLoading && !isError && totalEntities > 0 && groups && (
        <div className="space-y-6">
          {groups.map((group) => {
            if (group.entities.length === 0) return null;
            return (
              <div
                key={group.relationshipCategory}
                data-testid={`related-group-${group.relationshipCategory}`}
                className="rounded-[16px] bg-slate-50/50 dark:bg-slate-900/30 border border-[var(--color-border)] p-4 sm:p-5"
              >
                {/* Group Header */}
                <div className="flex items-center justify-between gap-2 mb-3.5">
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#008080]" />
                    <span>{group.relationshipLabelFa}</span>
                  </h3>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[var(--color-text-secondary)] font-mono">
                    {group.entities.length} مورد
                  </span>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {group.entities.map((entity) => (
                    <PocketRelatedEntityCard
                      key={`${entity.type}-${entity.id}`}
                      entity={entity}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
