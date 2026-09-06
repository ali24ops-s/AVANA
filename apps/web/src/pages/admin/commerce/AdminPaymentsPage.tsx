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
} from "lucide-react";
import type { AdminPaymentRecord } from "../../../lib/api/admin.js";
import {
  formatToman,
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
    } catch (err: any) {
      setErrorMsg(err.message || "خطا در دریافت لیست پرداخت‌ها");
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
    } catch (err: any) {
      setActionError(err.message || "خطا در تأیید پرداخت");
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
    } catch (err: any) {
      setActionError(err.message || "خطا در رد پرداخت");
    } finally {
      setIsProcessingAction(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <CreditCard className="w-7 h-7 text-emerald-400" />
            تراکنش‌ها و پرداخت‌ها (Payments & Gateways)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            مشاهده تراکنش‌های درگاه پرداخت، پرداخت‌های کارت‌به‌کارت و بررسی و تأیید نهایی مبالغ
          </p>
        </div>
      </div>

      {/* Commerce Workspace Navigation Tabs */}
      <AdminCommerceNavigation />

      {/* Filter and Search Bar */}
      <div className="glass-panel border border-white/5 rounded-2xl p-4 bg-slate-800/40 flex flex-col sm:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="جستجو با شماره پیگیری، نام، ایمیل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
        </form>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
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
              className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
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
          "کد پیگیری / شناسه تراکنش",
          "کاربر پرداخت‌کننده",
          "روش پرداخت",
          "مبلغ (تومان)",
          "وضعیت تراکنش",
          "اطلاعات کارت مبدأ / فیش",
          "تاریخ پرداخت",
          "عملیات بررسی",
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
              <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                {/* Tracking & Transaction Id */}
                <td className="px-6 py-4">
                  <div className="flex flex-col font-mono text-xs">
                    <span className="text-slate-200 font-bold">
                      {p.trackingNumber || p.transactionId || p.authority || "—"}
                    </span>
                    <span className="text-slate-500 text-[10px] mt-0.5">
                      سفارش: {p.orderNumber}
                    </span>
                  </div>
                </td>

                {/* User */}
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-200">
                      {p.userName || p.userEmail}
                    </span>
                    <span className="text-xs text-slate-400 font-mono mt-0.5">
                      {p.userEmail}
                    </span>
                  </div>
                </td>

                {/* Gateway */}
                <td className="px-6 py-4 whitespace-nowrap">
                  {isCardToCard ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                      <Zap className="w-3 h-3 text-amber-400 fill-current" />
                      <span>کارت‌به‌کارت</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                      {p.gateway === "zarinpal" ? "زرین‌پال" : p.gateway}
                    </span>
                  )}
                </td>

                {/* Amount */}
                <td className="px-6 py-4 font-bold text-emerald-400 whitespace-nowrap">
                  {formatToman(p.amount)}
                </td>

                {/* Status */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${payBadge.className}`}
                  >
                    {payBadge.label}
                  </span>
                  {p.rejectionReason && (
                    <div className="text-[11px] text-rose-400 mt-1 max-w-[200px] truncate" title={p.rejectionReason}>
                      علت رد: {p.rejectionReason}
                    </div>
                  )}
                </td>

                {/* Card-to-Card Specific Details */}
                <td className="px-6 py-4 text-xs text-slate-300">
                  {isCardToCard ? (
                    <div className="space-y-1">
                      {p.sourceCardLast4 && (
                        <div>
                          کارت مبدأ: <span className="font-mono text-amber-300">****-{p.sourceCardLast4}</span>
                        </div>
                      )}
                      {p.payerName && (
                        <div className="text-slate-400">
                          صاحب حساب: <span className="text-slate-200">{p.payerName}</span>
                        </div>
                      )}
                      {p.receiptUrl && (
                        <a
                          href={p.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-teal-400 hover:underline text-[11px]"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>مشاهده فیش واریز</span>
                        </a>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>

                {/* Date */}
                <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                  {formatPersianDate(p.paidAt || p.createdAt)}
                </td>

                {/* Actions */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {isPendingAdminReview ? (
                      <>
                        <button
                          onClick={() => setApprovingPaymentId(p.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 transition-colors shadow-sm cursor-pointer"
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
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 transition-colors shadow-sm cursor-pointer"
                          title="رد پرداخت و لغو دسترسی اشتراک"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>رد</span>
                        </button>
                      </>
                    ) : null}

                    {isCardToCard && (
                      <button
                        onClick={() => setInspectingPayment(p)}
                        className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition-colors flex items-center gap-1 text-xs border border-amber-500/20"
                        title="بررسی اطلاعات استخراج‌شده و متن پیامک"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>جزئیات</span>
                      </button>
                    )}

                    <button
                      onClick={() => setSelectedDrawerUserId(p.userId)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-400 hover:text-teal-300 transition-colors flex items-center gap-1 text-xs"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          dir="rtl"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-emerald-400">
              <CheckCircle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">تأیید پرداخت کارت‌به‌کارت</h3>
            </div>
            <p className="text-sm text-slate-300">
              آیا از صحت واریز مبلغ به حساب اطمینان دارید؟ با تأیید پرداخت، وضعیت اشتراک کاربر به «فعال دائمی» تبدیل می‌شود.
            </p>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {actionError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={() => setApprovingPaymentId(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          dir="rtl"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">رد پرداخت کارت‌به‌کارت</h3>
            </div>
            <p className="text-xs text-slate-300">
              با رد پرداخت، دسترسی اشتراک کاربر <strong>بلافاصله لغو (Revoke)</strong> خواهد شد. سوابق مطالعه قبلی کاربر پاک نخواهد شد.
            </p>

            <form onSubmit={handleReject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  علت رد پرداخت (اجباری) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="مثال: فیش واریزی نامعتبر است / مبلغ واریز نشده است..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              {actionError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
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
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          dir="rtl"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-xl w-full p-6 sm:p-7 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5 text-amber-400">
                <FileText className="w-5 h-5" />
                <h3 className="text-base sm:text-lg font-bold text-white">
                  جزئیات پرداخت و متن استخراج‌شده
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {inspectingPayment.orderNumber}
              </span>
            </div>

            {/* Payer & Plan Info */}
            <div className="p-3.5 rounded-2xl bg-slate-800/60 border border-white/5 flex flex-col sm:flex-row justify-between gap-2 text-xs">
              <div>
                <span className="text-slate-400">کاربر: </span>
                <strong className="text-white">{inspectingPayment.userName || inspectingPayment.userEmail}</strong>
              </div>
              <div>
                <span className="text-slate-400">پلن: </span>
                <span className="font-bold text-teal-300">{inspectingPayment.productTitle}</span>
              </div>
              <div>
                <span className="text-slate-400">مبلغ: </span>
                <span className="font-black text-emerald-400">{formatToman(inspectingPayment.amount)}</span>
              </div>
            </div>

            {/* 1. Structured Extracted Data */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                  <span>اطلاعات استخراج‌شده:</span>
                </span>
                {(() => {
                  const extractionMethod = (inspectingPayment.initialValidationResult as any)?.paymentExtraction?.extractionMethod;
                  if (extractionMethod === "ai" || extractionMethod === "hybrid") {
                    return (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                        هوش مصنوعی ✨
                      </span>
                    );
                  }
                  if (extractionMethod === "rule") {
                    return (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-medium">
                        قواعد بانکی ⚡
                      </span>
                    );
                  }
                  return (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                      ورود دستی
                    </span>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">شماره پیگیری / ارجاع:</span>
                  <span className="font-mono font-bold text-amber-300 select-all">
                    {inspectingPayment.trackingNumber || inspectingPayment.transactionId || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">۴ رقم آخر کارت مبدأ:</span>
                  <span className="font-mono font-bold text-slate-200">
                    {inspectingPayment.sourceCardLast4 ? `****-${inspectingPayment.sourceCardLast4}` : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">صاحب حساب واریزکننده:</span>
                  <span className="text-slate-300">{inspectingPayment.payerName || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">تاریخ ثبت:</span>
                  <span className="text-slate-400">{formatPersianDate(inspectingPayment.paidAt || inspectingPayment.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* 2. Sanitized Text View */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-200">
                متن ثبت‌شده (پاک‌سازی‌شده):
              </label>
              <p className="text-[10px] text-slate-400">
                متن پیامک تراکنش پس از حذف خودکار شماره کارت کامل، CVV2 و رمز پویا جهت امنیت کاربر:
              </p>
              {(() => {
                const sanitizedText = (inspectingPayment.initialValidationResult as any)?.paymentExtraction?.sanitizedPaymentText;
                if (sanitizedText && sanitizedText.trim().length > 0) {
                  return (
                    <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed select-all">
                      {sanitizedText}
                    </pre>
                  );
                }
                return (
                  <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 text-xs text-slate-500 italic">
                    متن خامی برای این تراکنش ارسال نشده است (ورود مستقیم فیلدها توسط کاربر).
                  </div>
                );
              })()}
            </div>

            {/* 3. Receipt Image Link if exists */}
            {inspectingPayment.receiptUrl && (
              <div className="pt-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">تصویر فیش واریز:</span>
                <a
                  href={inspectingPayment.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 transition-colors font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>مشاهده و دانلود فیش</span>
                </a>
              </div>
            )}

            {/* Modal Footer / Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setInspectingPayment(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
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

      {/* Drawer */}
      <UserCommerceDrawer
        isOpen={Boolean(selectedDrawerUserId)}
        userId={selectedDrawerUserId}
        onClose={() => setSelectedDrawerUserId(null)}
      />
    </div>
  );
}
