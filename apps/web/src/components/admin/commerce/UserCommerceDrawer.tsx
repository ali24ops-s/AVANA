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
        <div className="fixed inset-y-0 left-0 max-w-full flex pl-10" dir="rtl">
          <div className="w-screen max-w-2xl bg-slate-900 border-r border-slate-700/80 shadow-2xl flex flex-col">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">پرونده مالی و دسترسی کاربر</h2>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    {profile?.user.email || userId}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsGrantModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600/90 hover:bg-teal-500 text-white rounded-xl text-xs font-medium transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>اعطای دسترسی</span>
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoading && (
                <div className="py-12 text-center text-slate-400 text-sm">
                  در حال بارگذاری اطلاعات مالی و دسترسی کاربر...
                </div>
              )}

              {errorMsg && (
                <div className="flex items-center gap-2 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {!isLoading && profile && (
                <>
                  {/* 1. Active Subscription Card */}
                  <div className="glass-panel border border-white/5 rounded-2xl p-5 bg-slate-800/30">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-teal-400" />
                        وضعیت اشتراک سراسری
                      </span>
                      {profile.activeSubscription ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20">
                          اشتراک فعال
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-400">
                          بدون اشتراک فعال
                        </span>
                      )}
                    </div>

                    {profile.activeSubscription ? (
                      <div className="space-y-3 mt-3">
                        <div className="grid grid-cols-2 gap-4 bg-slate-900/60 p-3.5 rounded-xl border border-slate-700/50">
                          <div>
                            <span className="text-xs text-slate-400 block">پلن جاری:</span>
                            <span className="text-sm font-bold text-slate-100">
                              {profile.activeSubscription.productTitle}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-slate-400 block">انقضا:</span>
                            <span className="text-sm font-medium text-teal-300">
                              {formatPersianDate(profile.activeSubscription.expiresAt)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => setIsCancelModalOpen(true)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all flex items-center gap-1.5"
                          >
                            <ShieldOff className="w-3.5 h-3.5" />
                            <span>لغو اشتراک</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 mt-1">
                        کاربر در حال حاضر اشتراک سراسری فعال ندارد.
                      </p>
                    )}
                  </div>

                  {/* 2. Lifetime Purchases */}
                  <div className="glass-panel border border-white/5 rounded-2xl p-5 bg-slate-800/30">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <InfinityIcon className="w-4 h-4 text-purple-400" />
                        خریدهای دائمی / مادام‌العمر ({profile.lifetimePurchases.length})
                      </span>
                    </div>

                    {profile.lifetimePurchases.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">موردی ثبت نشده است.</p>
                    ) : (
                      <div className="space-y-2">
                        {profile.lifetimePurchases.map((ent) => {
                          const srcBadge = getSourceTypeBadge(ent.sourceType);
                          return (
                            <div
                              key={ent.id}
                              className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-xs"
                            >
                              <div>
                                <span className="font-semibold text-slate-200 block text-sm">
                                  {ent.resourceTitle || ent.resourceId}
                                </span>
                                <span className="text-slate-400 text-[11px] mt-0.5 block">
                                  نوع: {ent.resourceType === "course" ? "دوره آموزشی" : "بسته محتوایی"}
                                </span>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className={`px-2 py-0.5 rounded-full font-medium ${srcBadge.className}`}>
                                  {srcBadge.label}
                                </span>
                                <span className="text-[10px] text-slate-500">
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
                  <div className="glass-panel border border-white/5 rounded-2xl p-5 bg-slate-800/30">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Receipt className="w-4 h-4 text-blue-400" />
                        سفارش‌ها ({profile.orders.length})
                      </span>
                    </div>

                    {profile.orders.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">سفارشی ثبت نشده است.</p>
                    ) : (
                      <div className="space-y-2">
                        {profile.orders.map((o) => {
                          const statusBadge = getOrderStatusBadge(o.status);
                          return (
                            <div
                              key={o.id}
                              className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-200 text-sm">
                                  {o.productTitle}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full font-medium ${statusBadge.className}`}>
                                  {statusBadge.label}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-slate-400">
                                <span>شماره سفارش: {o.orderNumber}</span>
                                <span className="font-bold text-teal-400">{formatToman(o.amount)}</span>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {formatPersianDate(o.createdAt)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 4. Payment Transactions */}
                  <div className="glass-panel border border-white/5 rounded-2xl p-5 bg-slate-800/30">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-emerald-400" />
                        تراکنش‌های درگاه پرداخت ({profile.payments.length})
                      </span>
                    </div>

                    {profile.payments.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">تراکنشی ثبت نشده است.</p>
                    ) : (
                      <div className="space-y-2">
                        {profile.payments.map((p) => {
                          const payBadge = getPaymentStatusBadge(p.status);
                          return (
                            <div
                              key={p.id}
                              className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-slate-300 font-medium">
                                  درگاه: {p.gateway}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full font-medium ${payBadge.className}`}>
                                  {payBadge.label}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-slate-400">
                                <span className="font-mono text-[11px]">
                                  کد رهگیری: {p.transactionId || p.authority || "—"}
                                </span>
                                <span className="font-bold text-emerald-400">{formatToman(p.amount)}</span>
                              </div>
                              <div className="text-[11px] text-slate-500">
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
