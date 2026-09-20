import { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  CreditCard,
  Search,
  Filter,
  User,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Zap,
  Eye,
  FileText,
  Sparkles,
  Image as ImageIcon,
  ImageOff,
  ZoomIn,
  X,
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
import { AdminCommerceNavigation } from "../../../components/admin/commerce/AdminCommerceNavigation.js";
import { PageHeader } from "../../../components/ui/index.js";

export function AdminPaymentsPage() {
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
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);

  // Review Modal states
  const [inspectingPayment, setInspectingPayment] = useState<AdminPaymentRecord | null>(null);
  const [approvingPaymentId, setApprovingPaymentId] = useState<string | null>(null);
  const [rejectingPayment, setRejectingPayment] = useState<AdminPaymentRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchPayments = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminApi.listCommercePayments({
        page,
        pageSize,
        search: search.trim() || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        gateway: gatewayFilter !== "all" ? gatewayFilter : undefined,
      });
      setPayments(res.payments);
      setTotalCount(res.totalCount);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "خطا در دریافت لیست پرداخت‌ها";
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
      setApprovingPaymentId(null);
      await fetchPayments();
    } catch (err: unknown) {
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
    } catch (err: unknown) {
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
        title="تراکنش‌ها و پرداخت‌ها"
        badge={{
          text: "مدیریت پرداخت‌ها",
          icon: <CreditCard className="w-3.5 h-3.5 shrink-0" />,
        }}
        description="مشاهده تراکنش‌های درگاه پرداخت، پرداخت‌های کارت‌به‌کارت و بررسی و تأیید نهایی مبالغ"
      />

      {/* Commerce Workspace Navigation Tabs */}
      <AdminCommerceNavigation />

      {/* Filter and Search Bar */}
      <div className="border border-[var(--color-border)] rounded-2xl p-4 bg-[var(--color-surface)] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80 flex items-center">
          <input
            type="text"
            placeholder="جستجو با شماره پیگیری، نام، ایمیل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-10 pe-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)]"
          />
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </form>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-3 pe-8 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] cursor-pointer"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="pending_admin_review">⚡ در انتظار بررسی ادمین (کارت‌به‌کارت)</option>
              <option value="admin_approved">تأیید شده ادمین (Approved)</option>
              <option value="admin_rejected">رد شده ادمین (Rejected)</option>
              <option value="paid">پرداخت موفق درگاه (Paid)</option>
              <option value="pending">در انتظار درگاه (Pending)</option>
              <option value="failed">ناموفق (Failed)</option>
              <option value="cancelled">لغو شده (Cancelled)</option>
            </select>
          </div>

          {/* Gateway Filter */}
          <div className="flex items-center gap-2">
            <select
              value={gatewayFilter}
              onChange={(e) => {
                setGatewayFilter(e.target.value);
                setPage(1);
              }}
              className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-3 pe-8 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] cursor-pointer"
            >
              <option value="all">همه درگاه‌ها و روش‌ها</option>
              <option value="card_to_card">⚡ کارت‌به‌کارت (Card-to-Card)</option>
              <option value="zarinpal">زرین‌پال (ZarinPal)</option>
              <option value="mock">درگاه آزمایشی (Mock)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <AdminTable
        headers={[
          "کد پیگیری / سفارش",
          "کاربر پرداخت‌کننده",
          "روش پرداخت",
          "مبلغ (تومان)",
          "وضعیت",
          "اطلاعات کارت / فیش",
          "تاریخ",
          "عملیات",
        ]}
      >
        {isLoading ? (
          <AdminLoadingState colSpan={8} />
        ) : errorMsg ? (
          <AdminErrorState colSpan={8} message={errorMsg} />
        ) : payments.length === 0 ? (
          <AdminEmptyState message="هیچ تراکنشی مطابق با فیلتر یافت نشد." />
        ) : (
          payments.map((p) => {
            const payBadge = getPaymentStatusBadge(p.status);
            const isPendingAdminReview = p.status === "pending_admin_review";
            const isCardToCard = p.gateway === "card_to_card";

            return (
              <tr key={p.id} className="hover:bg-[var(--color-surface-warm)]/60 transition-colors">
                {/* Tracking & Transaction Id */}
                <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                  <span className="text-[var(--color-text)] font-bold block" title={p.orderNumber ? `سفارش: ${p.orderNumber}` : undefined}>
                    {p.trackingNumber || p.transactionId || p.authority || "—"}
                  </span>
                </td>

                {/* User */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span
                      className="font-semibold text-[var(--color-text)] font-mono text-xs truncate max-w-[170px]"
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

                {/* Gateway */}
                <td className="px-4 py-3 whitespace-nowrap">
                  {isCardToCard ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      <Zap className="w-3 h-3 text-amber-500 fill-current" />
                      <span>کارت‌به‌کارت</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                      {p.gateway === "zarinpal" ? "زرین‌پال" : p.gateway}
                    </span>
                  )}
                </td>

                {/* Amount */}
                <td className="px-4 py-3 font-bold text-xs text-[var(--color-text)] whitespace-nowrap">
                  {formatAmountOnly(p.amount)}
                </td>

                {/* Status */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${payBadge.className}`}
                    title={p.rejectionReason ? `علت رد: ${p.rejectionReason}` : undefined}
                  >
                    {payBadge.label}
                  </span>
                </td>

                {/* Card-to-Card Specific Details */}
                <td className="px-4 py-3 text-xs text-[var(--color-text)] whitespace-nowrap">
                  {isCardToCard ? (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      {p.sourceCardLast4 && (
                        <span className="font-mono text-amber-600 dark:text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          ****-{p.sourceCardLast4}
                        </span>
                      )}
                      {p.payerName && (
                        <span className="text-[var(--color-text-muted)] truncate max-w-[100px]" title={`واریزکننده: ${p.payerName}`}>
                          {p.payerName}
                        </span>
                      )}
                      {p.receiptUrl ? (
                        <button
                          type="button"
                          onClick={() => setViewingReceiptUrl(p.receiptUrl || null)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] border border-[var(--color-primary-default)]/30 hover:bg-[var(--color-primary-default)]/20 transition-colors cursor-pointer"
                          title="مشاهده تصویر فیش واریز"
                        >
                          <ImageIcon className="w-3 h-3" />
                          <span>فیش</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
                          بدون فیش
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  )}
                </td>

                {/* Date */}
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] whitespace-nowrap" title={`ثبت: ${formatPersianDate(p.createdAt)}${p.paidAt ? ` | پرداخت: ${formatPersianDate(p.paidAt)}` : ""}`}>
                  {formatPersianDate(p.paidAt || p.createdAt)}
                </td>

                {/* Actions */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {isPendingAdminReview ? (
                      <>
                        <button
                          onClick={() => setApprovingPaymentId(p.id)}
                          className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                          title="تأیید نهایی پرداخت کارت‌به‌کارت"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>تأیید</span>
                        </button>

                        <button
                          onClick={() => {
                            setRejectingPayment(p);
                            setRejectionReason("");
                            setActionError(null);
                          }}
                          className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                          title="رد پرداخت و لغو دسترسی"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>رد</span>
                        </button>
                      </>
                    ) : null}

                    {isCardToCard && (
                      <button
                        onClick={() => setInspectingPayment(p)}
                        className="p-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors flex items-center gap-1 text-xs border border-amber-500/20 cursor-pointer"
                        title="بررسی اطلاعات استخراج‌شده و متن پیامک"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>جزئیات</span>
                      </button>
                    )}

                    <button
                      onClick={() => setSelectedDrawerUserId(p.userId)}
                      className="p-1 rounded-lg bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] text-[var(--color-primary-default)] hover:text-[var(--color-primary-dark)] border border-[var(--color-border)] transition-colors flex items-center gap-1 text-xs cursor-pointer"
                      title="مشاهده سوابق مالی کاربر"
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>پرونده</span>
                    </button>
                  </div>
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

      {/* Confirmation Modal: Approve Payment */}
      {approvingPaymentId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          dir="rtl"
        >
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-[var(--color-text)]">تأیید پرداخت کارت‌به‌کارت</h3>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              آیا از صحت واریز مبلغ به حساب اطمینان دارید؟ با تأیید پرداخت، وضعیت اشتراک کاربر به «فعال دائمی» تبدیل می‌شود.
            </p>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">
                {actionError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={() => setApprovingPaymentId(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] border border-[var(--color-border)] transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={() => handleApprove(approvingPaymentId)}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-2 cursor-pointer shadow-md"
              >
                {isProcessingAction ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>در حال تأیید...</span>
                  </>
                ) : (
                  <span>بله، تأیید و نهایی‌سازی</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal: Mandatory Reason */}
      {rejectingPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          dir="rtl"
        >
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-rose-500">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-[var(--color-text)]">رد پرداخت کارت‌به‌کارت</h3>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              با رد پرداخت، دسترسی اشتراک کاربر <strong>بلافاصله لغو (Revoke)</strong> خواهد شد. سوابق مطالعه قبلی کاربر پاک نخواهد شد.
            </p>

            <form onSubmit={handleReject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                  علت رد پرداخت (اجباری) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="مثال: فیش واریزی نامعتبر است / مبلغ واریز نشده است..."
                  className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl p-3 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-rose-500"
                />
              </div>

              {actionError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">
                  {actionError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isProcessingAction}
                  onClick={() => {
                    setRejectingPayment(null);
                    setRejectionReason("");
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] border border-[var(--color-border)] transition-colors cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isProcessingAction}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors flex items-center gap-2 cursor-pointer shadow-md"
                >
                  {isProcessingAction ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>در حال لغو و رد...</span>
                    </>
                  ) : (
                    <span>رد پرداخت و لغو دسترسی</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspection Modal: View Structured Extraction & Sanitized Raw Text */}
      {inspectingPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          dir="rtl"
        >
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl max-w-xl w-full p-6 sm:p-7 space-y-5 shadow-xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2.5 text-amber-500">
                <FileText className="w-5 h-5" />
                <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
                  جزئیات پرداخت و متن استخراج‌شده
                </h3>
              </div>
              <span className="text-xs text-[var(--color-text-muted)] font-mono">
                {inspectingPayment.orderNumber}
              </span>
            </div>

            {/* Payer & Plan Info */}
            <div className="p-3.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex flex-col sm:flex-row justify-between gap-2 text-xs">
              <div>
                <span className="text-[var(--color-text-muted)]">کاربر: </span>
                <strong className="text-[var(--color-text)]">{inspectingPayment.userName || inspectingPayment.userEmail}</strong>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">پلن: </span>
                <span className="font-bold text-[var(--color-primary-default)]">{inspectingPayment.productTitle}</span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">مبلغ: </span>
                <span className="font-black text-[var(--color-primary-default)]">{formatToman(inspectingPayment.amount)}</span>
              </div>
            </div>

            {/* 1. Structured Extracted Data */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
                  <span>اطلاعات استخراج‌شده:</span>
                </span>
                {(() => {
                  const validation = inspectingPayment.initialValidationResult as { paymentExtraction?: { extractionMethod?: string; sanitizedPaymentText?: string } } | undefined;
                  const extractionMethod = validation?.paymentExtraction?.extractionMethod;
                  if (extractionMethod === "ai" || extractionMethod === "hybrid") {
                    return (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary-default)]/15 text-[var(--color-primary-default)] border border-[var(--color-primary-default)]/30 font-medium">
                        هوش مصنوعی ✨
                      </span>
                    );
                  }
                  if (extractionMethod === "rule") {
                    return (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary-default)]/15 text-[var(--color-primary-default)] border border-[var(--color-primary-default)]/30 font-medium">
                        قواعد بانکی ⚡
                      </span>
                    );
                  }
                  return (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                      ورود دستی
                    </span>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs">
                <div>
                  <span className="text-[var(--color-text-muted)] block text-[11px]">شماره پیگیری / ارجاع:</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-300 select-all">
                    {inspectingPayment.trackingNumber || inspectingPayment.transactionId || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)] block text-[11px]">۴ رقم آخر کارت مبدأ:</span>
                  <span className="font-mono font-bold text-[var(--color-text)]">
                    {inspectingPayment.sourceCardLast4 ? `****-${inspectingPayment.sourceCardLast4}` : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)] block text-[11px]">صاحب حساب واریزکننده:</span>
                  <span className="text-[var(--color-text)]">{inspectingPayment.payerName || "—"}</span>
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)] block text-[11px]">تاریخ ثبت:</span>
                  <span className="text-[var(--color-text-muted)]">{formatPersianDate(inspectingPayment.paidAt || inspectingPayment.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* 2. Sanitized Text View */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[var(--color-text)]">
                متن ثبت‌شده (پاک‌سازی‌شده):
              </label>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                متن پیامک تراکنش پس از حذف خودکار شماره کارت کامل، CVV2 و رمز پویا جهت امنیت کاربر:
              </p>
              {(() => {
                const validation = inspectingPayment.initialValidationResult as { paymentExtraction?: { extractionMethod?: string; sanitizedPaymentText?: string } } | undefined;
                const sanitizedText = validation?.paymentExtraction?.sanitizedPaymentText;
                if (sanitizedText && sanitizedText.trim().length > 0) {
                  return (
                    <pre className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs font-mono text-[var(--color-text)] whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed select-all">
                      {sanitizedText}
                    </pre>
                  );
                }
                return (
                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] italic">
                    متن خامی برای این تراکنش ارسال نشده است (ورود مستقیم فیلدها توسط کاربر).
                  </div>
                );
              })()}
            </div>

            {/* 3. Receipt Image Preview / Status */}
            <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
              <span className="text-xs font-bold text-[var(--color-text)] block">تصویر فیش واریز:</span>
              {inspectingPayment.receiptUrl ? (
                <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      onClick={() => setViewingReceiptUrl(inspectingPayment.receiptUrl || null)}
                      className="relative w-14 h-14 rounded-lg overflow-hidden border border-[var(--color-border)] bg-black/5 dark:bg-white/5 cursor-pointer shrink-0 hover:opacity-80 transition-opacity"
                    >
                      <img
                        src={inspectingPayment.receiptUrl}
                        alt="فیش واریزی"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-primary" />
                        <span>فیش پرداخت پیوست شده است</span>
                      </div>
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        جهت بزرگ‌نمایی روی تصویر کلیک کنید
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewingReceiptUrl(inspectingPayment.receiptUrl || null)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>مشاهده فیش</span>
                    </button>
                    <a
                      href={inspectingPayment.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-primary hover:bg-[var(--color-surface)] border border-[var(--color-border)] transition-colors"
                      title="باز کردن در صفحه جداگانه"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <ImageOff className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
                  <span>هیچ تصویر فیشی برای این پرداخت ثبت نشده است.</span>
                </div>
              )}
            </div>

            {/* Modal Footer / Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setInspectingPayment(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] border border-[var(--color-border)] transition-colors cursor-pointer"
              >
                بستن
              </button>

              {inspectingPayment.status === "pending_admin_review" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const p = inspectingPayment;
                      setInspectingPayment(null);
                      setRejectingPayment(p);
                      setRejectionReason("");
                      setActionError(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>رد پرداخت</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const id = inspectingPayment.id;
                      setInspectingPayment(null);
                      setApprovingPaymentId(id);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>تأیید پرداخت</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / Full-size Receipt Modal */}
      {viewingReceiptUrl && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          dir="rtl"
          onClick={() => setViewingReceiptUrl(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3.5 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text)]">
                <ImageIcon className="w-4 h-4 text-primary" />
                <span>تصویر فیش پرداخت بانکی</span>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={viewingReceiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-primary hover:bg-primary-hover text-white transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>دانلود / نمایش اصلی</span>
                </a>
                <button
                  type="button"
                  onClick={() => setViewingReceiptUrl(null)}
                  className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer"
                  title="بستن"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 flex items-center justify-center overflow-auto max-h-[calc(90vh-60px)] bg-black/10 dark:bg-black/40">
              <img
                src={viewingReceiptUrl}
                alt="تصویر فیش پرداخت"
                className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-md"
              />
            </div>
          </div>
        </div>
      )}

      {/* Drawer */}
      <UserCommerceDrawer
        isOpen={Boolean(selectedDrawerUserId)}
        userId={selectedDrawerUserId}
        onClose={() => setSelectedDrawerUserId(null)}
      />
    </div>
  );
}
