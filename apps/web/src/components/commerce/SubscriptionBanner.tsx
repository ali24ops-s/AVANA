import React, { useState } from "react";
import { Crown, Sparkles, ArrowLeft } from "lucide-react";
import { PricingModal } from "./PricingModal.js";
import { useMySubscription } from "../../hooks/useCommerce.js";

export interface SubscriptionBannerProps {
  className?: string;
  variant?: "compact" | "card";
}

export const SubscriptionBanner: React.FC<SubscriptionBannerProps> = ({
  className = "",
  variant = "card",
}) => {
  const { data: subData } = useMySubscription();
  const [showPricing, setShowPricing] = useState(false);

  // If user already has active subscription (including active_pending_payment_review), do not display banner
  if (
    subData?.subscription &&
    (subData.subscription.status === "active" ||
      subData.subscription.status === "active_pending_payment_review")
  ) {
    return null;
  }

  if (variant === "compact") {
    return (
      <>
        <div
          dir="rtl"
          className={`flex items-center justify-between px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-purple-500/10 border border-amber-400/20 text-xs text-zinc-800 dark:text-zinc-200 ${className}`}
        >
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-500 shrink-0" />
            <span>با اشتراک ویژه آوانا پلاس، به تمام امکانات و آزمون‌ها دسترسی پیدا کنید.</span>
          </div>
          <button
            onClick={() => setShowPricing(true)}
            className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 shrink-0"
          >
            <span>ارتقا</span>
            <ArrowLeft className="w-3 h-3" />
          </button>
        </div>

        <PricingModal isOpen={showPricing} onClose={() => setShowPricing(false)} />
      </>
    );
  }

  return (
    <>
      <div
        dir="rtl"
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-950 p-5 text-white shadow-md border border-indigo-700/50 ${className}`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 text-amber-300 shrink-0">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 mb-0.5">
                <Sparkles className="w-3 h-3" />
                <span>فرصت ویژه یادگیری</span>
              </div>
              <h4 className="text-base font-bold">دسترسی به تمام دوره‌ها و دستیار هوشمند</h4>
              <p className="text-xs text-zinc-300 mt-0.5 max-w-md">
                با فعال‌سازی اشتراک ماهانه یا سالانه، قفل تمام دروس، فلش‌کارت‌ها و آزمون‌ها برای شما باز می‌شود.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowPricing(true)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 text-zinc-950 font-black text-xs sm:text-sm shadow-md transition-all shrink-0 flex items-center gap-1.5"
          >
            <span>مشاهده پلن‌ها و خرید</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      <PricingModal isOpen={showPricing} onClose={() => setShowPricing(false)} />
    </>
  );
};
