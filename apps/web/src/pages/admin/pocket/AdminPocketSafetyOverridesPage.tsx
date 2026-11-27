import { useState, useMemo } from "react";
import { ShieldAlert, Plus, Eye, CheckCircle2, RefreshCw } from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import { PageHeader, Button, Alert } from "../../../components/ui/index.js";
import {
  AdminTable,
  AdminSearch,
  AdminFilter,
  AdminStatusBadge,
  AdminEmptyState,
  AdminLoadingState,
  AdminErrorState,
} from "../../../components/admin/AdminUI.js";
import { AdminPocketNavigation } from "../../../components/admin/pocket/AdminPocketNavigation.js";
import { ActivateSafetyOverrideModal } from "../../../components/admin/pocket/ActivateSafetyOverrideModal.js";
import { ClearSafetyOverrideModal } from "../../../components/admin/pocket/ClearSafetyOverrideModal.js";
import { SafetyOverrideDetailModal } from "../../../components/admin/pocket/SafetyOverrideDetailModal.js";
import { usePocketSafetyOverrides } from "../../../hooks/usePocketSafetyOverrides.js";
import { usePocketPermissions } from "../../../hooks/usePocketPermissions.js";
import type {
  SafetyOverrideRecord,
  SafetyOverrideTargetType,
} from "../../../lib/api/pocket.js";
import { formatPersianExamDateTime } from "../../../utils/date.js";

const TARGET_TYPE_LABELS: Record<SafetyOverrideTargetType, string> = {
  assertion: "گزاره علمی",
  drug: "دارو",
  disease: "بیماری",
  treatment: "درمان",
  emergency: "فوریت پزشکی",
};

const OVERRIDE_STATUS_COLOR_MAP: Record<string, string> = {
  فعال: "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20",
  پاک‌شده: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
};

export function AdminPocketSafetyOverridesPage() {
  const { canManageSafetyOverrides, isLoading: isPermLoading } = usePocketPermissions();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const [isActivateOpen, setIsActivateOpen] = useState<boolean>(false);
  const [detailOverrideId, setDetailOverrideId] = useState<string | null>(null);
  const [clearTarget, setClearTarget] = useState<SafetyOverrideRecord | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    const isActive =
      statusFilter === "active" ? true : statusFilter === "cleared" ? false : undefined;
    const targetEntityType =
      targetTypeFilter !== "all" ? (targetTypeFilter as SafetyOverrideTargetType) : undefined;
    return {
      isActive,
      targetEntityType,
      limit: 100,
    };
  }, [statusFilter, targetTypeFilter]);

  const {
    data: overrides = [],
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = usePocketSafetyOverrides(queryParams, {
    enabled: !isPermLoading && canManageSafetyOverrides,
  });

  const filteredOverrides = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return overrides;
    return overrides.filter(
      (item) =>
        item.targetEntityId.toLowerCase().includes(term) ||
        item.id.toLowerCase().includes(term) ||
        item.targetEntityType.toLowerCase().includes(term),
    );
  }, [overrides, search]);

  if (!isPermLoading && !canManageSafetyOverrides) {
    return (
      <div className="space-y-6" dir="rtl">
        <AdminPocketNavigation />
        <Alert variant="error" title="دسترسی محدود">
          <div className="flex items-center gap-2 text-sm">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              مدیریت Safety Override فقط برای مدیر کل سیستم (platform_admin) مجاز است.
            </span>
          </div>
        </Alert>
      </div>
    );
  }

  const errorMessage =
    error instanceof Error ? error.message : "خطا در دریافت فهرست Safety Overrideها";

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="مدیریت Safety Override"
        badge={{
          text: "AVANA Pocket",
          icon: <ShieldAlert className="w-3.5 h-3.5" />,
        }}
        description="فعال‌سازی، پایش و پاک‌سازی محدودیت‌های اضطراری ایمنی روی گزاره‌ها و موجودیت‌های بالینی"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              <span>به‌روزرسانی</span>
            </Button>
            <Button variant="danger" size="sm" onClick={() => setIsActivateOpen(true)}>
              <Plus className="w-4 h-4" />
              <span>ایجاد Safety Override</span>
            </Button>
          </div>
        }
      />

      <AdminPocketNavigation />

      {feedbackBanner && (
        <Alert variant="success" title="عملیات موفق">
          <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
            <span>{feedbackBanner}</span>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="underline text-xs cursor-pointer"
            >
              بستن
            </button>
          </div>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <AdminSearch
          value={search}
          onChange={setSearch}
          placeholder="جستجو بر اساس شناسه هدف یا شناسه Override..."
        />
        <div className="flex flex-wrap items-center gap-2">
          <AdminFilter
            value={targetTypeFilter}
            onChange={setTargetTypeFilter}
            label="نوع هدف"
            options={[
              { value: "all", label: "همه موجودیت‌ها" },
              { value: "assertion", label: "گزاره علمی" },
              { value: "drug", label: "دارو" },
              { value: "disease", label: "بیماری" },
              { value: "treatment", label: "درمان" },
              { value: "emergency", label: "فوریت پزشکی" },
            ]}
          />
          <AdminFilter
            value={statusFilter}
            onChange={setStatusFilter}
            label="وضعیت"
            options={[
              { value: "all", label: "همه وضعیت‌ها" },
              { value: "active", label: "فعال" },
              { value: "cleared", label: "پاک‌شده" },
            ]}
          />
        </div>
      </div>

      <AdminTable
        headers={["نوع موجودیت هدف", "شناسه هدف", "وضعیت", "آخرین به‌روزرسانی", "عملیات"]}
      >
        {isLoading ? (
          <AdminLoadingState colSpan={5} />
        ) : isError ? (
          <AdminErrorState message={errorMessage} colSpan={5} />
        ) : filteredOverrides.length === 0 ? (
          <AdminEmptyState message="هیچ Safety Override با فیلترهای انتخاب‌شده یافت نشد." />
        ) : (
          filteredOverrides.map((item) => (
            <tr
              key={item.id}
              className="hover:bg-[var(--color-surface-warm)]/40 transition-colors"
            >
              <td className="px-4 sm:px-6 py-3.5 text-xs sm:text-sm font-bold text-[var(--color-text)]">
                {TARGET_TYPE_LABELS[item.targetEntityType] ?? item.targetEntityType}
              </td>
              <td className="px-4 sm:px-6 py-3.5 font-mono text-xs text-[var(--color-text)]" dir="ltr">
                {item.targetEntityId}
              </td>
              <td className="px-4 sm:px-6 py-3.5">
                <AdminStatusBadge
                  status={item.isActive ? "فعال" : "پاک‌شده"}
                  colorMap={OVERRIDE_STATUS_COLOR_MAP}
                />
              </td>
              <td className="px-4 sm:px-6 py-3.5 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                {toPersianDigits(formatPersianExamDateTime(item.updatedAt))}
              </td>
              <td className="px-4 sm:px-6 py-3.5">
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDetailOverrideId(item.id)}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>جزئیات و تاریخچه</span>
                  </Button>
                  {item.isActive && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setClearTarget(item)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>پاک‌سازی</span>
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))
        )}
      </AdminTable>

      <ActivateSafetyOverrideModal
        isOpen={isActivateOpen}
        onClose={() => setIsActivateOpen(false)}
        onSuccess={() => setFeedbackBanner("Safety Override با موفقیت فعال شد.")}
      />

      <ClearSafetyOverrideModal
        override={clearTarget}
        onClose={() => setClearTarget(null)}
        onSuccess={() => setFeedbackBanner("Safety Override با موفقیت پاک‌سازی شد.")}
      />

      <SafetyOverrideDetailModal
        overrideId={detailOverrideId}
        onClose={() => setDetailOverrideId(null)}
      />
    </div>
  );
}
