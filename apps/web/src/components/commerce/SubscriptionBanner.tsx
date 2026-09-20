import React, { useState } from "react";
import { ArrowLeft, BookOpen, Layers, Zap } from "lucide-react";
import { Button } from "@avana/ui";
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
          className={`relative overflow-hidden flex items-center justify-between gap-3 px-4 py-2.5 rounded-[12px] bg-gradient-to-r from-[#0B1517] via-[#0D1C1F] to-[#082326] border border-teal-800/40 text-xs text-white shadow-sm ${className}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span className="truncate text-xs font-medium text-zinc-200">
              مسیر یادگیریت را با اشتراک آوانا کامل کن؛ دسترسی به دوره‌ها، آزمون‌ها و دستیار هوشمند
            </span>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowPricing(true)}
            leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
            className="shrink-0 font-bold hover:brightness-110"
          >
            مشاهده پلن‌ها و خرید
          </Button>
        </div>

        <PricingModal isOpen={showPricing} onClose={() => setShowPricing(false)} />
      </>
    );
  }

  return (
    <>
      <style>{`
        @keyframes avanaAmbientPulse {
          0%, 100% { opacity: 0.10; transform: scale(0.96); }
          30% { opacity: 0.25; transform: scale(1.04); }
          60% { opacity: 0.10; transform: scale(0.98); }
        }
        @keyframes avanaCtaGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(45, 212, 191, 0); }
          30% { box-shadow: 0 0 10px 2px rgba(45, 212, 191, 0.22); }
          60% { box-shadow: 0 0 0 0 rgba(45, 212, 191, 0); }
        }
        @keyframes sequentialFeaturePulse {
          0% {
            transform: scale(1);
            color: #d4d4d8;
            filter: none;
          }
          6% {
            transform: scale(1.06);
            color: #ffffff;
            filter: drop-shadow(0 0 6px rgba(45, 212, 191, 0.45));
          }
          24% {
            transform: scale(1.06);
            color: #ffffff;
            filter: drop-shadow(0 0 6px rgba(45, 212, 191, 0.45));
          }
          30% {
            transform: scale(1);
            color: #d4d4d8;
            filter: none;
          }
          100% {
            transform: scale(1);
            color: #d4d4d8;
            filter: none;
          }
        }
        .animate-avana-pulse {
          animation: avanaAmbientPulse 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .animate-avana-cta {
          animation: avanaCtaGlow 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .feature-step-1 {
          animation: sequentialFeaturePulse 6s cubic-bezier(0.4, 0, 0.2, 1) 0s infinite;
          transform-origin: center right;
        }
        .feature-step-2 {
          animation: sequentialFeaturePulse 6s cubic-bezier(0.4, 0, 0.2, 1) 2s infinite;
          transform-origin: center right;
        }
        .feature-step-3 {
          animation: sequentialFeaturePulse 6s cubic-bezier(0.4, 0, 0.2, 1) 4s infinite;
          transform-origin: center right;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-avana-pulse,
          .animate-avana-cta,
          .feature-step-1,
          .feature-step-2,
          .feature-step-3 {
            animation: none !important;
            transform: none !important;
            filter: none !important;
          }
        }
      `}</style>

      <div
        dir="rtl"
        className={`relative overflow-hidden rounded-[16px] bg-gradient-to-br from-[#0A1416] via-[#0D1C1F] to-[#072528] border border-teal-800/40 p-5 sm:p-6 text-white shadow-md shadow-teal-950/20 ${className}`}
      >
        {/* Subtle breathing ambient brand glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -left-16 w-60 h-60 rounded-full bg-teal-400/20 blur-3xl animate-avana-pulse"
        />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5 md:gap-6">
          {/* Right: Integrated Content Cluster */}
          <div className="space-y-2.5 min-w-0">
            <h3 className="text-base sm:text-lg md:text-xl font-bold text-white tracking-tight">
              دسترسی کامل به مسیر یادگیری AVANA
            </h3>

            {/* 3 Sequential Highlighted Features */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-zinc-200">
              <div className="feature-step-1 inline-flex items-center gap-1.5 transition-transform duration-300">
                <BookOpen className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span className="font-medium">همه دوره‌ها</span>
              </div>

              <span className="text-zinc-600 select-none">·</span>

              <div className="feature-step-2 inline-flex items-center gap-1.5 transition-transform duration-300">
                <Layers className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span className="font-medium">فلش‌کارت و آزمون</span>
              </div>

              <span className="text-zinc-600 select-none">·</span>

              <div className="feature-step-3 inline-flex items-center gap-1.5 transition-transform duration-300">
                <Zap className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span className="font-medium">دستیار هوشمند</span>
              </div>
            </div>
          </div>

          {/* Left: Action CTA */}
          <div className="shrink-0 pt-2 md:pt-0">
            <Button
              variant="primary"
              size="md"
              onClick={() => setShowPricing(true)}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
              className="w-full sm:w-auto font-bold shrink-0 hover:brightness-110 active:scale-[0.98] transition-all shadow-sm shadow-teal-950/40 animate-avana-cta"
            >
              مشاهده پلن‌ها و خرید
            </Button>
          </div>
        </div>
      </div>

      <PricingModal isOpen={showPricing} onClose={() => setShowPricing(false)} />
    </>
  );
};
