import { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  KeyRound,
  Search,
  User,
  PlusCircle,
  Infinity as InfinityIcon,
  BookOpen,
  Sparkles,
  FolderTree,
} from "lucide-react";
import type { AdminEntitlementRecord } from "../../../lib/api/admin.js";
import {
  formatPersianDate,
  getSourceTypeBadge,
  getResourceTypeLabel,
} from "../../../components/admin/commerce/commerceUtils.js";
import {
  AdminTable,
  AdminPagination,
  AdminEmptyState,
  AdminLoadingState,
  AdminErrorState,
} from "../../../components/admin/AdminUI.js";
import { UserCommerceDrawer } from "../../../components/admin/commerce/UserCommerceDrawer.js";
import { AdminGrantModal } from "../../../components/admin/commerce/AdminGrantModal.js";
import { AdminCommerceNavigation } from "../../../components/admin/commerce/AdminCommerceNavigation.js";
import { PageHeader } from "../../../components/ui/index.js";

export function AdminEntitlementsPage() {
  const adminApi = useAdmin();

  const [entitlements, setEntitlements] = useState<AdminEntitlementRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  const [search, setSearch] = useState<string>("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedDrawerUserId, setSelectedDrawerUserId] = useState<string | null>(null);
  const [isGrantModalOpen, setIsGrantModalOpen] = useState<boolean>(false);

  const fetchEntitlements = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminApi.listCommerceEntitlements({
        page,
        pageSize,
        search: search.trim() || undefined,
        resourceType: resourceTypeFilter !== "all" ? resourceTypeFilter : undefined,
        sourceType: sourceTypeFilter !== "all" ? sourceTypeFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setEntitlements(res.entitlements);
      setTotalCount(res.totalCount);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "خطا در دریافت دفتر کل دسترسی‌ها";
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEntitlements();
  }, [page, resourceTypeFilter, sourceTypeFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchEntitlements();
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <PageHeader
        title="دفتر کل حقوق دسترسی"
        badge={{
          text: "حقوق دسترسی کاربران",
          icon: <KeyRound className="w-3.5 h-3.5 shrink-0" />,
        }}
        description="مرجع نهایی بررسی دسترسی‌های آموزشی، خریدهای دائمی دوره‌ها و اشتراک‌های سراسری"
        actions={
          <button
            onClick={() => setIsGrantModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>اعطای دسترسی مستقیم (Grant)</span>
          </button>
        }
      />

      {/* Commerce Workspace Navigation Tabs */}
      <AdminCommerceNavigation />

      {/* Filter and Search Bar */}
      <div className="border border-[var(--color-border)] rounded-2xl p-4 bg-[var(--color-surface)] shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full lg:w-72 flex items-center">
          <input
            type="text"
            placeholder="جستجو با ایمیل یا شناسه منبع..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-10 pe-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)]"
          />
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </form>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Resource Type */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">نوع منبع:</span>
            <select
              value={resourceTypeFilter}
              onChange={(e) => {
                setResourceTypeFilter(e.target.value);
                setPage(1);
              }}
              className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-3 pe-8 py-2 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] cursor-pointer"
            >
              <option value="all">همه منابع</option>
              <option value="subscription">اشتراک سراسری</option>
              <option value="course">دوره آموزشی</option>
              <option value="content_pack">بسته محتوایی</option>
            </select>
          </div>

          {/* Source Type */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">منبع صدور:</span>
            <select
              value={sourceTypeFilter}
              onChange={(e) => {
                setSourceTypeFilter(e.target.value);
                setPage(1);
              }}
              className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-3 pe-8 py-2 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] cursor-pointer"
            >
              <option value="all">همه روش‌ها</option>
              <option value="purchase">خرید مستقیم</option>
              <option value="admin_grant">اعطای ادمین</option>
              <option value="promotion">کمپین / پروموشن</option>
              <option value="gift">هدیه</option>
            </select>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">وضعیت:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-3 pe-8 py-2 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] cursor-pointer"
            >
              <option value="all">همه</option>
              <option value="lifetime">دائمی / مادام‌العمر</option>
              <option value="active">فعال (دارای زمان)</option>
              <option value="expired">منقضی شده</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <AdminTable
        headers={[
          "کاربر",
          "نوع منبع",
          "عنوان منبع",
          "روش اعطا",
          "نوع دسترسی / انقضا",
          "تاریخ شروع",
          "عملیات",
        ]}
      >
        {isLoading ? (
          <AdminLoadingState colSpan={7} />
        ) : errorMsg ? (
          <AdminErrorState colSpan={7} message={errorMsg} />
        ) : entitlements.length === 0 ? (
          <AdminEmptyState message="هیچ رکوردی در دفتر کل حقوق دسترسی یافت نشد." />
        ) : (
          entitlements.map((ent) => {
            const srcBadge = getSourceTypeBadge(ent.sourceType);

            return (
              <tr key={ent.id} className="hover:bg-[var(--color-surface-warm)]/60 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span
                      className="font-semibold text-[var(--color-text)] font-mono text-xs truncate max-w-[180px]"
                      title={ent.userName ? `${ent.userEmail} (${ent.userName})` : ent.userEmail}
                      dir="ltr"
                    >
                      {ent.userEmail || ent.userName}
                    </span>
                    {ent.userName && ent.userName !== ent.userEmail && (
                      <span
                        className="text-[var(--color-text-muted)] text-[11px] truncate max-w-[120px]"
                        title={ent.userName}
                      >
                        {ent.userName}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-text)] font-medium">
                    {ent.resourceType === "subscription" ? (
                      <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
                    ) : ent.resourceType === "course" ? (
                      <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <FolderTree className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
                    )}
                    <span>{getResourceTypeLabel(ent.resourceType)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-xs font-bold text-[var(--color-text)] truncate max-w-[220px] block" title={ent.resourceId ? `${ent.resourceTitle || ent.resourceId} (ID: ${ent.resourceId})` : ent.resourceTitle}>
                    {ent.resourceTitle || ent.resourceId || "—"}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${srcBadge.className}`}>
                    {srcBadge.label}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {ent.lifetime ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--color-primary-default)]/15 text-[var(--color-primary-default)] border border-[var(--color-primary-default)]/30">
                      <InfinityIcon className="w-3 h-3" />
                      <span>دائمی / مادام‌العمر</span>
                    </span>
                  ) : ent.active ? (
                    <span className="text-xs font-medium text-[var(--color-primary-default)]">
                      تا {formatPersianDate(ent.expiresAt)}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                      منقضی شده
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                  {formatPersianDate(ent.startsAt, false)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <button
                    onClick={() => setSelectedDrawerUserId(ent.userId)}
                    className="p-1.5 rounded-lg bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] text-[var(--color-primary-default)] hover:text-[var(--color-primary-dark)] border border-[var(--color-border)] transition-colors flex items-center gap-1 text-xs cursor-pointer"
                    title="مشاهده سوابق مالی کاربر"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>کاربر</span>
                  </button>
                </td>
              </tr>
            );
          })
        )}
      </AdminTable>

      {/* Pagination */}
      {!isLoading && !errorMsg && totalCount > 0 && (
        <AdminPagination
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          onPageChange={setPage}
        />
      )}

      {/* Drawer */}
      <UserCommerceDrawer
        isOpen={Boolean(selectedDrawerUserId)}
        userId={selectedDrawerUserId}
        onClose={() => setSelectedDrawerUserId(null)}
      />

      {/* Grant Modal */}
      <AdminGrantModal
        isOpen={isGrantModalOpen}
        onClose={() => setIsGrantModalOpen(false)}
        onSuccess={() => {
          fetchEntitlements();
        }}
      />
    </div>
  );
}
