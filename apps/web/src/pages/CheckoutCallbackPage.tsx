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
    <div className="min-h-screen bg-[#0D1719] text-[#F2F7F7] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-lg rounded-[20px] border border-[#1e3235] bg-[#142124] p-8 sm:p-10 text-center shadow-2xl space-y-6">
        {/* Pending Verification State */}
        {verifyMutation.isPending && (
          <div className="py-12 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-[16px] bg-[#008080]/10 border border-[#008080]/20 text-[#008080] flex items-center justify-center animate-pulse">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-[#F2F7F7]">
              در حال تایید و ثبت تراکنش بانکی...
            </h2>
            <p className="text-xs text-[#9AAEB0] max-w-xs">
              لطفاً چند لحظه شکیبا باشید تا اطلاعات پرداخت شما با شبکه شاپرک تایید و دسترسی شما فعال شود.
            </p>
          </div>
        )}

        {/* Success State */}
        {isSuccess && (
          <div className="space-y-6">
            <div className="w-20 h-20 rounded-[20px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/40">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-[8px] bg-[#008080]/10 text-[#008080] border border-[#008080]/20 text-xs font-bold">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>دسترسی آموزشی با موفقیت فعال شد</span>
              </div>

              <h2 className="text-2xl font-black text-[#F2F7F7] tracking-tight">
                پرداخت با موفقیت انجام شد!
              </h2>

              <p className="text-xs sm:text-sm text-[#9AAEB0] max-w-sm mx-auto leading-relaxed">
                سفارش شما با موفقیت تسویه گردید و تمامی امکانات آموزشی برای حساب کاربری شما فعال شد.
              </p>
            </div>

            {/* Transaction metadata box */}
            <div className="p-4 rounded-[12px] bg-[#192A2D] border border-[#1e3235] space-y-2 text-xs text-right">
              {verifyMutation.data?.transaction_id && (
                <div className="flex items-center justify-between">
                  <span className="text-[#9AAEB0]">کد پیگیری تراکنش بانکی:</span>
                  <span className="font-mono font-bold text-[#008080]">
                    {verifyMutation.data.transaction_id}
                  </span>
                </div>
              )}

              {verifyMutation.data?.order_id && (
                <div className="flex items-center justify-between">
                  <span className="text-[#9AAEB0]">شناسه سفارش:</span>
                  <span className="font-mono text-[#c8d8da] text-[11px]">
                    {verifyMutation.data.order_id}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <Link
                to="/account/subscription"
                className="w-full sm:flex-1 py-3 px-4 rounded-[10px] bg-[#008080] hover:bg-[#007575] text-[#F2F7F7] text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-950/30"
              >
                <Crown className="w-4 h-4 text-amber-300" />
                <span>مشاهده وضعیت اشتراک</span>
              </Link>

              <Link
                to="/courses"
                className="w-full sm:flex-1 py-3 px-4 rounded-[10px] bg-[#192A2D] hover:bg-[#1e3235] text-[#c8d8da] hover:text-[#F2F7F7] border border-[#1e3235] text-xs font-bold transition-all flex items-center justify-center gap-2"
              >
                <BookOpen className="w-4 h-4 text-[#008080]" />
                <span>ورود به دوره‌ها</span>
              </Link>
            </div>
          </div>
        )}

        {/* Failed State */}
        {isFailed && (
          <div className="space-y-6">
            <div className="w-20 h-20 rounded-[20px] bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-950/40">
              <XCircle className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-[#F2F7F7]">
                تراکنش پرداخت انجام نشد
              </h2>
              <p className="text-xs text-[#9AAEB0] max-w-sm mx-auto leading-relaxed">
                {verifyMutation.data?.error_message ||
                  "پرداخت توسط شما لغو شد یا درگاه بانکی با خطا مواجه گردید. در صورت کسر وجه، مبلغ ظرف حداکثر ۷۲ ساعت توسط بانک بازگردانده می‌شود."}
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <Link
                to="/pricing"
                className="w-full sm:flex-1 py-3 px-4 rounded-[10px] bg-[#008080] hover:bg-[#007575] text-[#F2F7F7] text-xs font-bold transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>تلاش مجدد در صفحه تعرفه‌ها</span>
              </Link>

              <Link
                to="/home"
                className="w-full sm:flex-1 py-3 px-4 rounded-[10px] bg-[#192A2D] hover:bg-[#1e3235] text-[#c8d8da] hover:text-[#F2F7F7] text-xs font-bold transition-all border border-[#1e3235] flex items-center justify-center gap-2"
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
