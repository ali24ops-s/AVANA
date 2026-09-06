/**
 * Payment Checkout Callback & Verification Screen.
 *
 * Route: `/checkout/callback`
 *
 * Automatically captures gateway return params (Authority & Status),
 * verifies transaction with backend, and displays clean confirmation.
 */

import React, { useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Crown,
  RotateCcw,
  BookOpen,
  Home,
} from "lucide-react";
import { useVerifyPayment } from "../hooks/useCommerce.js";

export const CheckoutCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const verifyMutation = useVerifyPayment();

  const authority = searchParams.get("Authority") || searchParams.get("authority");
  const status = searchParams.get("Status") || searchParams.get("status");

  useEffect(() => {
    if (authority && !verifyMutation.data && !verifyMutation.isPending && !verifyMutation.isError) {
      verifyMutation.mutate({
        authority,
        status: status || undefined,
      });
    }
  }, [authority, status]);

  const isSuccess = verifyMutation.data?.success === true;
  const isFailed =
    status === "NOK" ||
    (verifyMutation.data && verifyMutation.data.success === false) ||
    verifyMutation.isError;

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-lg rounded-3xl glass-panel border border-white/10 bg-slate-900/90 p-8 sm:p-10 text-center shadow-2xl space-y-6">
        {/* Pending Verification State */}
        {verifyMutation.isPending && (
          <div className="py-12 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-3xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center animate-pulse">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-white">
              در حال تایید و ثبت تراکنش بانکی...
            </h2>
            <p className="text-xs text-slate-400 max-w-xs">
              لطفاً چند لحظه شکیبا باشید تا اطلاعات پرداخت شما با شبکه شاپرک تایید و دسترسی شما فعال شود.
            </p>
          </div>
        )}

        {/* Success State */}
        {isSuccess && (
          <div className="space-y-6">
            <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/40">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 text-xs font-bold">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>دسترسی آموزشی با موفقیت فعال شد</span>
              </div>

              <h2 className="text-2xl font-black text-white tracking-tight">
                پرداخت با موفقیت انجام شد!
              </h2>

              <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
                سفارش شما با موفقیت تسویه گردید و تمامی امکانات آموزشی برای حساب کاربری شما فعال شد.
              </p>
            </div>

            {/* Transaction metadata box */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2 text-xs text-right">
              {verifyMutation.data?.transaction_id && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">کد پیگیری تراکنش بانکی:</span>
                  <span className="font-mono font-bold text-teal-300">
                    {verifyMutation.data.transaction_id}
                  </span>
                </div>
              )}

              {verifyMutation.data?.order_id && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">شناسه سفارش:</span>
                  <span className="font-mono text-slate-300 text-[11px]">
                    {verifyMutation.data.order_id}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <Link
                to="/account/subscription"
                className="w-full sm:flex-1 py-3 px-4 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-900/30"
              >
                <Crown className="w-4 h-4 text-amber-300" />
                <span>مشاهده وضعیت اشتراک</span>
              </Link>

              <Link
                to="/courses"
                className="w-full sm:flex-1 py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/10 text-xs font-bold transition-all flex items-center justify-center gap-2"
              >
                <BookOpen className="w-4 h-4 text-teal-400" />
                <span>ورود به دوره‌ها</span>
              </Link>
            </div>
          </div>
        )}

        {/* Failed State */}
        {isFailed && (
          <div className="space-y-6">
            <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-950/40">
              <XCircle className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white">
                تراکنش پرداخت انجام نشد
              </h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                {verifyMutation.data?.error_message ||
                  "پرداخت توسط شما لغو شد یا درگاه بانکی با خطا مواجه گردید. در صورت کسر وجه، مبلغ ظرف حداکثر ۷۲ ساعت توسط بانک بازگردانده می‌شود."}
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <Link
                to="/pricing"
                className="w-full sm:flex-1 py-3 px-4 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>تلاش مجدد در صفحه تعرفه‌ها</span>
              </Link>

              <Link
                to="/home"
                className="w-full sm:flex-1 py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all border border-white/10 flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" />
                <span>بازگشت به خانه</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
