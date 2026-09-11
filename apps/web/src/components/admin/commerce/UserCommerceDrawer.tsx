import { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  X,
  CreditCard,
  Receipt,
  Sparkles,
  Infinity as InfinityIcon,
  PlusCircle,
  AlertCircle,
  ShieldOff,
} from "lucide-react";
import type { AdminUserCommerceProfile } from "../../../lib/api/admin.js";
import {
  formatToman,
  formatPersianDate,
  getOrderStatusBadge,
  getPaymentStatusBadge,
  getSourceTypeBadge,
} from "./commerceUtils.js";
import { AdminGrantModal } from "./AdminGrantModal.js";
import { AdminCancelSubscriptionModal } from "./AdminCancelSubscriptionModal.js";

interface UserCommerceDrawerProps {
  isOpen: boolean;
  userId: string | null;
  onClose: () => void;
}

export function UserCommerceDrawer({ isOpen, userId, onClose }: UserCommerceDrawerProps) {
  const adminApi = useAdmin();
  const [profile, setProfile] = useState<AdminUserCommerceProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  const fetchProfile = async () => {
    if (!userId) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await adminApi.getUserCommerceProfile(userId);
      setProfile(data);
    } catch (err: any) {
      setErrorMsg(err.message || "خطا در دریافت اطلاعات مالی کاربر");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && userId) {
      fetchProfile();
    } else {
      setProfile(null);
    }
  }, [isOpen, userId]);

  if (!isOpen || !userId) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm">
        <div className="absolute inset-0" onClick={onClose} />
        <div className="fixed inset-y-0 start-0 max-w-full flex ps-10" dir="rtl">
          <div className="w-screen max-w-2xl bg-[var(--color-surface)] border-e border-[var(--color-border)] shadow-2xl flex flex-col">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-default)]/10 border border-[var(--color-primary-default)]/20 flex items-center justify-center text-[var(--color-primary-default)]">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--color-text)]">پرونده مالی و دسترسی کاربر</h2>
                  <p className="text-xs text-[var(--color-text-muted)] font-mono mt-0.5">
                    {profile?.user.email || userId}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsGrantModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] rounded-xl text-xs font-medium transition-colors cursor-pointer shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>اعطای دسترسی</span>
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-lg hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoading && (
                <div className="py-12 text-center text-[var(--color-text-muted)] text-sm">
                  در حال بارگذاری اطلاعات مالی و دسترسی کاربر...
                </div>
              )}

              {errorMsg && (
                <div className="flex items-center gap-2 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {!isLoading && profile && (
                <>
                  {/* 1. Active Subscription Card */}
                  <div className="border border-[var(--color-border)] rounded-2xl p-5 bg-[var(--color-surface)] shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[var(--color-primary-default)]" />
                        وضعیت اشتراک سراسری
                      </span>
                      {profile.activeSubscription ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          اشتراک فعال
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                          بدون اشتراک فعال
                        </span>
                      )}
                    </div>

                    {profile.activeSubscription ? (
                      <div className="space-y-3 mt-3">
                        <div className="grid grid-cols-2 gap-4 bg-[var(--color-surface-warm)] p-3.5 rounded-xl border border-[var(--color-border)]">
                          <div>
                            <span className="text-xs text-[var(--color-text-muted)] block">پلن جاری:</span>
                            <span className="text-sm font-bold text-[var(--color-text)]">
                              {profile.activeSubscription.productTitle}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-[var(--color-text-muted)] block">انقضا:</span>
                            <span className="text-sm font-medium text-[var(--color-primary-default)]">
                              {formatPersianDate(profile.activeSubscription.expiresAt)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => setIsCancelModalOpen(true)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <ShieldOff className="w-3.5 h-3.5" />
                            <span>لغو اشتراک</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
                        کاربر در حال حاضر اشتراک سراسری فعال ندارد.
                      </p>
                    )}
                  </div>

                  {/* 2. Lifetime Purchases */}
                  <div className="border border-[var(--color-border)] rounded-2xl p-5 bg-[var(--color-surface)] shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                        <InfinityIcon className="w-4 h-4 text-[var(--color-primary-default)]" />
                        خریدهای دائمی / مادام‌العمر ({profile.lifetimePurchases.length})
                      </span>
                    </div>

                    {profile.lifetimePurchases.length === 0 ? (
                      <p className="text-xs text-[var(--color-text-muted)] py-2">موردی ثبت نشده است.</p>
                    ) : (
                      <div className="space-y-2">
                        {profile.lifetimePurchases.map((ent) => {
                          const srcBadge = getSourceTypeBadge(ent.sourceType);
                          return (
                            <div
                              key={ent.id}
                              className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs"
                            >
                              <div>
                                <span className="font-semibold text-[var(--color-text)] block text-sm">
                                  {ent.resourceTitle || ent.resourceId}
                                </span>
                                <span className="text-[var(--color-text-muted)] text-[11px] mt-0.5 block">
                                  نوع: {ent.resourceType === "course" ? "دوره آموزشی" : "بسته محتوایی"}
                                </span>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className={`px-2 py-0.5 rounded-full font-medium ${srcBadge.className}`}>
                                  {srcBadge.label}
                                </span>
                                <span className="text-[10px] text-[var(--color-text-muted)]">
                                  {formatPersianDate(ent.startsAt, false)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 3. Orders History */}
                  <div className="border border-[var(--color-border)] rounded-2xl p-5 bg-[var(--color-surface)] shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                        <Receipt className="w-4 h-4 text-[var(--color-primary-default)]" />
                        سفارش‌ها ({profile.orders.length})
                      </span>
                    </div>

                    {profile.orders.length === 0 ? (
                      <p className="text-xs text-[var(--color-text-muted)] py-2">سفارشی ثبت نشده است.</p>
                    ) : (
                      <div className="space-y-2">
                        {profile.orders.map((o) => {
                          const statusBadge = getOrderStatusBadge(o.status);
                          return (
                            <div
                              key={o.id}
                              className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-[var(--color-text)] text-sm">
                                  {o.productTitle}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full font-medium ${statusBadge.className}`}>
                                  {statusBadge.label}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[var(--color-text-muted)]">
                                <span>شماره سفارش: {o.orderNumber}</span>
                                <span className="font-bold text-[var(--color-primary-default)]">{formatToman(o.amount)}</span>
                              </div>
                              <div className="text-[11px] text-[var(--color-text-muted)]">
                                {formatPersianDate(o.createdAt)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 4. Payment Transactions */}
                  <div className="border border-[var(--color-border)] rounded-2xl p-5 bg-[var(--color-surface)] shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-[var(--color-primary-default)]" />
                        تراکنش‌های درگاه پرداخت ({profile.payments.length})
                      </span>
                    </div>

                    {profile.payments.length === 0 ? (
                      <p className="text-xs text-[var(--color-text-muted)] py-2">تراکنشی ثبت نشده است.</p>
                    ) : (
                      <div className="space-y-2">
                        {profile.payments.map((p) => {
                          const payBadge = getPaymentStatusBadge(p.status);
                          return (
                            <div
                              key={p.id}
                              className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[var(--color-text)] font-medium">
                                  درگاه: {p.gateway}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full font-medium ${payBadge.className}`}>
                                  {payBadge.label}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[var(--color-text-muted)]">
                                <span className="font-mono text-[11px]">
                                  کد رهگیری: {p.transactionId || p.authority || "—"}
                                </span>
                                <span className="font-bold text-[var(--color-primary-default)]">{formatToman(p.amount)}</span>
                              </div>
                              <div className="text-[11px] text-[var(--color-text-muted)]">
                                تاریخ: {formatPersianDate(p.paidAt || p.createdAt)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Grant Modal */}
      {isGrantModalOpen && profile && (
        <AdminGrantModal
          isOpen={isGrantModalOpen}
          onClose={() => setIsGrantModalOpen(false)}
          onSuccess={() => {
            fetchProfile();
          }}
          defaultUserId={profile.user.id}
          defaultUserEmail={profile.user.email}
        />
      )}

      {/* Embedded Cancel Subscription Modal */}
      {isCancelModalOpen && profile?.activeSubscription && (
        <AdminCancelSubscriptionModal
          isOpen={isCancelModalOpen}
          subscription={profile.activeSubscription}
          onClose={() => setIsCancelModalOpen(false)}
          onSuccess={() => {
            fetchProfile();
          }}
        />
      )}
    </>
  );
}
