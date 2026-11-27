import { useState, useMemo } from "react";
import { Award, Plus, PauseCircle, Ban, RefreshCw, ShieldAlert, RotateCcw, History } from "lucide-react";
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
import { GrantCredentialModal } from "../../../components/admin/pocket/GrantCredentialModal.js";
import {
  CredentialActionModal,
  type CredentialActionMode,
} from "../../../components/admin/pocket/CredentialActionModal.js";
import { CredentialEventsModal } from "../../../components/admin/pocket/CredentialEventsModal.js";
import { usePocketReviewerCredentials } from "../../../hooks/usePocketReviewerCredentials.js";
import { usePocketPermissions } from "../../../hooks/usePocketPermissions.js";
import type {
  ClinicalReviewerCredential,
  CredentialLifecycleStatus,
} from "../../../lib/api/pocket.js";
import { formatPersianExamDate } from "../../../utils/date.js";

function resolveLifecycleStatus(cred: ClinicalReviewerCredential): CredentialLifecycleStatus {
  if (cred.lifecycleStatus) {
    return cred.lifecycleStatus;
  }
  if (cred.revokedAt !== null && cred.revokedAt !== undefined) {
    return "revoked";
  }
  if (!cred.isActive || (cred.suspendedAt !== null && cred.suspendedAt !== undefined)) {
    return "suspended";
  }
  return "active";
}

function isLicenseExpired(cred: ClinicalReviewerCredential): boolean {
  if (cred.validityStatus) {
    return cred.validityStatus === "expired";
  }
  const expiresAt = new Date(cred.licenseExpiresAt);
  return isNaN(expiresAt.getTime()) || expiresAt <= new Date();
}

function resolveLifecycleBadgeLabel(cred: ClinicalReviewerCredential): string {
  const lifecycle = resolveLifecycleStatus(cred);
  if (lifecycle === "revoked") return "لغوشده";
  if (lifecycle === "suspended") {
    return cred.isLegacyStatusAmbiguous ? "غیرفعال (سابقه نامشخص)" : "معلق";
  }
  return "فعال";
}

const STATUS_COLOR_MAP: Record<string, string> = {
  فعال: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  معلق: "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20",
  "غیرفعال (سابقه نامشخص)": "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20",
  لغوشده: "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20",
  منقضی‌شده: "text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border-[var(--color-border)]",
};

export function AdminPocketReviewersPage() {
  const { canManageReviewers, isLoading: isPermLoading } = usePocketPermissions();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [isGrantOpen, setIsGrantOpen] = useState<boolean>(false);
  const [actionTarget, setActionTarget] = useState<{
    credential: ClinicalReviewerCredential;
    mode: CredentialActionMode;
  } | null>(null);
  const [eventsTarget, setEventsTarget] = useState<ClinicalReviewerCredential | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const apiIsActiveFilter =
    statusFilter === "active" || statusFilter === "expired"
      ? true
      : statusFilter === "suspended" || statusFilter === "revoked"
        ? false
        : undefined;

  const {
    data: credentials = [],
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = usePocketReviewerCredentials(
    apiIsActiveFilter !== undefined ? { isActive: apiIsActiveFilter, limit: 100 } : { limit: 100 },
    { enabled: !isPermLoading && canManageReviewers },
  );

  const filteredCredentials = useMemo(() => {
    const term = search.trim().toLowerCase();
    return credentials.filter((cred) => {
      const lifecycle = resolveLifecycleStatus(cred);
      const expired = isLicenseExpired(cred);
      if (statusFilter === "active" && (lifecycle !== "active" || expired)) return false;
      if (statusFilter === "suspended" && lifecycle !== "suspended") return false;
      if (statusFilter === "revoked" && lifecycle !== "revoked") return false;
      if (statusFilter === "expired" && !expired) return false;

      if (!term) return true;
      return (
        cred.userId.toLowerCase().includes(term) ||
        cred.medicalLicenseNumber.toLowerCase().includes(term) ||
        cred.specialty.toLowerCase().includes(term) ||
        cred.licensingAuthority.toLowerCase().includes(term)
      );
    });
  }, [credentials, search, statusFilter]);

  if (!isPermLoading && !canManageReviewers) {
    return (
      <div className="space-y-6" dir="rtl">
        <AdminPocketNavigation />
        <Alert variant="error" title="دسترسی محدود">
          <div className="flex items-center gap-2 text-sm">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>مدیریت اعتبارنامه داوران بالینی فقط برای مدیر کل سیستم (platform_admin) مجاز است.</span>
          </div>
        </Alert>
      </div>
    );
  }

  const errorMessage =
    error instanceof Error ? error.message : "خطا در دریافت فهرست اعتبارنامه‌های داوران";

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="مدیریت داوران و اعتبارنامه‌ها"
        badge={{
          text: "AVANA Pocket",
          icon: <Award className="w-3.5 h-3.5" />,
        }}
        description="اعطا، پایش، تعلیق و لغو اعتبارنامه‌های رسمی داوران بالینی"
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
            <Button variant="primary" size="sm" onClick={() => setIsGrantOpen(true)}>
              <Plus className="w-4 h-4" />
              <span>اعطای اعتبارنامه</span>
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
          placeholder="جستجو بر اساس شناسه کاربر، شماره مجوز، تخصص..."
        />
        <AdminFilter
          value={statusFilter}
          onChange={setStatusFilter}
          label="وضعیت"
          options={[
            { value: "all", label: "همه وضعیت‌ها" },
            { value: "active", label: "فعال" },
            { value: "suspended", label: "معلق" },
            { value: "revoked", label: "لغوشده" },
            { value: "expired", label: "منقضی‌شده" },
          ]}
        />
      </div>

      <AdminTable
        headers={[
          "شناسه کاربر",
          "شماره نظام / مجوز",
          "تخصص و مرجع",
          "وضعیت",
          "تاریخ اعتبار",
          "تاریخ اعطا",
          "عملیات",
        ]}
      >
        {isLoading ? (
          <AdminLoadingState colSpan={7} />
        ) : isError ? (
          <AdminErrorState message={errorMessage} colSpan={7} />
        ) : filteredCredentials.length === 0 ? (
          <AdminEmptyState message="هیچ اعتبارنامه داور بالینی با فیلترهای انتخاب‌شده یافت نشد." />
        ) : (
          filteredCredentials.map((cred) => {
            const lifecycle = resolveLifecycleStatus(cred);
            const expired = isLicenseExpired(cred);
            const badgeLabel = resolveLifecycleBadgeLabel(cred);
            const reasonText =
              lifecycle === "revoked"
                ? cred.revocationReason ?? cred.suspensionReason
                : cred.suspensionReason;

            return (
              <tr
                key={cred.id}
                className="hover:bg-[var(--color-surface-warm)]/40 transition-colors"
              >
                <td className="px-4 sm:px-6 py-3.5 font-mono text-xs text-[var(--color-text)]" dir="ltr">
                  {cred.userId}
                </td>
                <td className="px-4 sm:px-6 py-3.5 text-xs sm:text-sm font-bold text-[var(--color-text)]" dir="ltr">
                  {cred.medicalLicenseNumber}
                </td>
                <td className="px-4 sm:px-6 py-3.5 text-xs text-[var(--color-text)]">
                  <div className="font-semibold">{cred.specialty}</div>
                  <div className="text-[var(--color-text-muted)] mt-0.5">
                    {cred.licensingAuthority}
                  </div>
                </td>
                <td className="px-4 sm:px-6 py-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <AdminStatusBadge status={badgeLabel} colorMap={STATUS_COLOR_MAP} />
                    {expired && (
                      <AdminStatusBadge status="منقضی‌شده" colorMap={STATUS_COLOR_MAP} />
                    )}
                  </div>
                  {reasonText && (
                    <div
                      className="text-[11px] text-[var(--color-text-muted)] mt-1 max-w-[220px] truncate"
                      title={reasonText}
                    >
                      {reasonText}
                    </div>
                  )}
                </td>
                <td className="px-4 sm:px-6 py-3.5 text-xs text-[var(--color-text)] whitespace-nowrap">
                  {toPersianDigits(formatPersianExamDate(cred.licenseExpiresAt))}
                </td>
                <td className="px-4 sm:px-6 py-3.5 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                  {toPersianDigits(formatPersianExamDate(cred.grantedAt))}
                </td>
                <td className="px-4 sm:px-6 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {lifecycle === "active" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setActionTarget({ credential: cred, mode: "suspend" })}
                      >
                        <PauseCircle className="w-3.5 h-3.5" />
                        <span>تعلیق</span>
                      </Button>
                    )}
                    {lifecycle === "suspended" && !expired && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setActionTarget({ credential: cred, mode: "reactivate" })}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>فعال‌سازی مجدد</span>
                      </Button>
                    )}
                    {lifecycle !== "revoked" && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setActionTarget({ credential: cred, mode: "revoke" })}
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>لغو</span>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEventsTarget(cred)}
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>تاریخچه</span>
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </AdminTable>

      <GrantCredentialModal
        isOpen={isGrantOpen}
        onClose={() => setIsGrantOpen(false)}
        onSuccess={() => setFeedbackBanner("اعتبارنامه داور بالینی با موفقیت اعطا شد.")}
      />

      <CredentialActionModal
        credential={actionTarget?.credential ?? null}
        mode={actionTarget?.mode ?? null}
        onClose={() => setActionTarget(null)}
        onSuccess={() =>
          setFeedbackBanner(
            actionTarget?.mode === "suspend"
              ? "اعتبارنامه با موفقیت تعلیق شد."
              : actionTarget?.mode === "reactivate"
                ? "اعتبارنامه با موفقیت فعال‌سازی مجدد شد."
                : "اعتبارنامه با موفقیت لغو شد.",
          )
        }
      />

      <CredentialEventsModal
        credential={eventsTarget}
        onClose={() => setEventsTarget(null)}
      />
    </div>
  );
}
