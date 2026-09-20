import { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  Sparkles,
  Search,
  Filter,
  User,
  XCircle,
  Loader2,
  ExternalLink,
  Eye,
} from "lucide-react";
import type { AdminPaymentRecord } from "../../../lib/api/admin.js";
import {
  formatToman,
  formatAmountOnly,
  formatPersianDate,
  getPaymentStatusBadge,
} from "../../../components/admin/commerce/commerceUtils.js";
import {
  AdminTable,
  AdminPagination,
  AdminEmptyState,
  AdminLoadingState,
  AdminErrorState,
} from "../../../components/admin/AdminUI.js";
import { UserCommerceDrawer } from "../../../components/admin/commerce/UserCommerceDrawer.js";
import { AdminUsersNavigation } from "../../../components/admin/users/AdminUsersNavigation.js";
import { PageHeader } from "../../../components/ui/index.js";

export function AdminUserSubscriptionsPage() {
  const adminApi = useAdmin();

  const [payments, setPayments] = useState<AdminPaymentRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [gatewayFilter, setGatewayFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedDrawerUserId, setSelectedDrawerUserId] = useState<string | null>(null);

  // Review Modal states for card_to_card
  const [inspectingPayment, setInspectingPayment] = useState<AdminPaymentRecord | null>(null);
  const [rejectingPayment, setRejectingPayment] = useState<AdminPaymentRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchPayments = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminApi.listCommercePayments({
        category: "subscription",
        page,
        pageSize,
        search: search.trim() || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        gateway: gatewayFilter !== "all" ? gatewayFilter : undefined,
      });
      setPayments(res.payments);
      setTotalCount(res.totalCount);
    } catch (err) {
      const message = err instanceof Error ? err.message : "خطا در دریافت لیست پرداخت‌های اشتراک";
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [page, statusFilter, gatewayFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchPayments();
  };

  const handleApprove = async (paymentId: string) => {
    setIsProcessingAction(true);
    setActionError(null);
    try {
      await adminApi.approveCommercePayment(paymentId);
      setInspectingPayment(null);
      await fetchPayments();
    } catch (err) {
      const message = err instanceof Error ? err.message : "خطا در تأیید پرداخت";
      setActionError(message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingPayment) return;
    const trimmed = rejectionReason.trim();
    if (!trimmed) {
      setActionError("علت رد پرداخت الزامی است.");
      return;
    }

    setIsProcessingAction(true);
    setActionError(null);
    try {
      await adminApi.rejectCommercePayment(rejectingPayment.id, trimmed);
      setRejectingPayment(null);
      setRejectionReason("");
      await fetchPayments();
    } catch (err) {
      const message = err instanceof Error ? err.message : "خطا در رد پرداخت";
      setActionError(message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <PageHeader
        title="پرداخت اشتراک‌های کاربران"
        badge={{
          text: "اشتراک و دسترسی کاربران",
          icon: <Sparkles className="w-3.5 h-3.5 shrink-0" />,
        }}
        description="مشاهده و مدیریت تراکنش‌ها و پرداخت‌های مرتبط با خرید اشتراک‌های پلتفرم"
      />

      {/* Users Navigation Tabs */}
      <AdminUsersNavigation />

      {/* Filter and Search Bar */}
      <div className="border border-[var(--color-border)] rounded-2xl p-4 bg-[var(--color-surface)] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="جستجو با ایمیل، نام، شماره سفارش..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-10 pe-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] transition-colors"
          />
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </form>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[var(--color-text-muted)]" />
            <select
              aria-label="فیلتر وضعیت پرداخت"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-3 pe-8 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] cursor-pointer"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="paid">پرداخت موفق (Paid)</option>
              <option value="pending_admin_review">در انتظار بررسی ادمین (کارت‌به‌کارت)</option>
              <option value="admin_approved">تأیید شده ادمین (Approved)</option>
              <option value="admin_rejected">رد شده ادمین (Rejected)</option>
              <option value="pending">در انتظار پرداخت (Pending)</option>
              <option value="failed">ناموفق (Failed)</option>
              <option value="cancelled">لغو شده (Cancelled)</option>
            </select>
          </div>

          {/* Gateway Filter */}
          <div className="flex items-center gap-2">
            <select
              aria-label="فیلتر روش پرداخت"
              value={gatewayFilter}
              onChange={(e) => {
                setGatewayFilter(e.target.value);
                setPage(1);
              }}
              className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-3 pe-8 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] cursor-pointer"
            >
              <option value="all">همه روش‌های پرداخت</option>
              <option value="zarinpal">زرین‌پال (ZarinPal)</option>
              <option value="card_to_card">کارت‌به‌کارت (Card-to-Card)</option>
              <option value="mock">درگاه آزمایشی (Mock)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <AdminTable
        headers={[
          "کاربر",
          "نوع اشتراک",
          "شماره سفارش",
          "مبلغ (تومان)",
          "روش پرداخت",
          "وضعیت",
          "تاریخ",
          "عملیات",
        ]}
      >
        {isLoading ? (
          <AdminLoadingState colSpan={8} />
        ) : errorMsg ? (
          <AdminErrorState colSpan={8} message={errorMsg} />
        ) : payments.length === 0 ? (
          <AdminEmptyState message="هیچ تراکنش اشتراکی مطابق با فیلترها یافت نشد." />
        ) : (
          payments.map((p) => {
            const isC2C = p.gateway === "card_to_card";
            const isPendingReview = p.status === "pending_admin_review";

            return (
              <tr
                key={p.id}
                className="hover:bg-[var(--color-surface-warm)]/50 transition-colors"
              >
                {/* User */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span
                      className="font-semibold text-[var(--color-text)] font-mono text-xs truncate max-w-[180px]"
                      title={p.userName ? `${p.userEmail} (${p.userName})` : p.userEmail}
                      dir="ltr"
                    >
                      {p.userEmail || p.userName}
                    </span>
                    {p.userName && p.userName !== p.userEmail && (
                      <span
                        className="text-[var(--color-text-muted)] text-[11px] truncate max-w-[120px]"
                        title={p.userName}
                      >
                        {p.userName}
                      </span>
                    )}
                  </div>
                </td>

                {/* Subscription Title */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text)]">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary-default)] shrink-0" />
                    <span className="truncate max-w-[200px]" title={p.productTitle || "اشتراک ویژه"}>
                      {p.productTitle || "اشتراک ویژه"}
                    </span>
                  </div>
                </td>

                {/* Order / Transaction ID */}
                <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                  <span className="font-bold text-[var(--color-text)]" title={p.trackingNumber ? `کد پیگیری: ${p.trackingNumber}` : undefined}>
                    {p.orderNumber || p.orderId.slice(0, 8)}
                  </span>
                </td>

                {/* Amount */}
                <td className="px-4 py-3 whitespace-nowrap font-bold text-xs text-[var(--color-text)]">
                  {formatAmountOnly(p.amount)}
                </td>

                {/* Gateway */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-2 py-0.5 rounded-md border border-[var(--color-border)]">
                    {p.gateway === "card_to_card"
                      ? "کارت‌به‌کارت"
                      : p.gateway === "zarinpal"
                      ? "زرین‌پال"
                      : p.gateway}
                  </span>
                </td>

                {/* Status */}
                <td className="px-4 py-3 whitespace-nowrap">
                  {(() => {
                    const badge = getPaymentStatusBadge(p.status);
                    return (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    );
                  })()}
                </td>

                {/* Date */}
                <td className="px-4 py-3 whitespace-nowrap text-xs text-[var(--color-text-muted)]" title={`ثبت: ${formatPersianDate(p.createdAt)}${p.paidAt ? ` | پرداخت: ${formatPersianDate(p.paidAt)}` : ""}`}>
                  {formatPersianDate(p.paidAt || p.createdAt)}
                </td>

                {/* Actions */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedDrawerUserId(p.userId)}
                      className="text-xs font-medium text-[var(--color-primary-default)] hover:text-[var(--color-primary-dark)] bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] border border-[var(--color-border)] px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                      title="پرونده مالی کاربر"
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>کاربر</span>
                    </button>

                    {isC2C && isPendingReview && (
                      <button
                        onClick={() => setInspectingPayment(p)}
                        className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                        title="بررسی و تایید فیش کارت‌به‌کارت"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>بررسی فیش</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </AdminTable>

      {/* Pagination */}
      {!isLoading && totalCount > 0 && (
        <AdminPagination
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          onPageChange={(newPage) => setPage(newPage)}
        />
      )}

      {/* User Commerce Drawer */}
      <UserCommerceDrawer
        isOpen={Boolean(selectedDrawerUserId)}
        userId={selectedDrawerUserId}
        onClose={() => setSelectedDrawerUserId(null)}
      />

      {/* C2C Inspection Modal */}
      {inspectingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-[var(--color-text)]">
              بررسی و تأیید پرداخت کارت‌به‌کارت
            </h3>
            <div className="space-y-2 text-xs text-[var(--color-text)] bg-[var(--color-surface-warm)] p-4 rounded-xl border border-[var(--color-border)]">
              <div>
                <span className="text-[var(--color-text-muted)]">کاربر: </span>
                <span className="font-bold" dir="ltr">{inspectingPayment.userEmail}</span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">مبلغ: </span>
                <span className="font-bold">{formatToman(inspectingPayment.amount)} تومان</span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">شماره پیگیری: </span>
                <span className="font-mono font-bold">{inspectingPayment.trackingNumber || "—"}</span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">۴ رقم آخر کارت: </span>
                <span className="font-mono font-bold">{inspectingPayment.sourceCardLast4 || "—"}</span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">نام واریزکننده: </span>
                <span className="font-bold">{inspectingPayment.payerName || "—"}</span>
              </div>
              {inspectingPayment.receiptUrl && (
                <div className="pt-2">
                  <a
                    href={inspectingPayment.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-600 hover:underline flex items-center gap-1 font-bold"
                  >
                    <span>مشاهده تصویر فیش واریزی</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-xs font-medium">
                {actionError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setInspectingPayment(null)}
                className="px-4 py-2 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] rounded-xl transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectingPayment(inspectingPayment);
                  setInspectingPayment(null);
                }}
                className="px-4 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors cursor-pointer"
              >
                رد پرداخت
              </button>
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={() => handleApprove(inspectingPayment.id)}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                {isProcessingAction && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>تأیید پرداخت و فعال‌سازی اشتراک</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form onSubmit={handleReject} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              <span>رد پرداخت کارت‌به‌کارت</span>
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              لطفاً دلیل رد پرداخت را مشخص کنید تا در سوابق ذخیره شود.
            </p>
            <div>
              <textarea
                required
                rows={3}
                placeholder="علت رد (مثلاً: عدم تطابق مبلغ واریزی، فیش نامعتبر...)"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl p-3 text-xs text-[var(--color-text)] focus:outline-none focus:border-red-500"
              />
            </div>
            {actionError && (
              <div className="text-xs text-red-600">{actionError}</div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRejectingPayment(null);
                  setRejectionReason("");
                }}
                className="px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)] rounded-xl cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={isProcessingAction}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                {isProcessingAction && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>ثبت رد پرداخت</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
