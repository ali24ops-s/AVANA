import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Lock,
  X,
  Zap,
  ArrowLeft,
  CheckCircle,
  Package,
  BookOpen,
  FileText,
} from "lucide-react";
import { PricingModal } from "./PricingModal.js";
import { useCheckout } from "../../hooks/useCommerce.js";

export interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  resourceTitle?: string;
  resourceType?: "course" | "content_pack" | "content" | "lesson" | "flashcard" | "quiz" | "ai_assistant";
  availablePurchaseOptions?: Array<{
    type: "subscription" | "content_pack" | "course" | "content";
    productId: string;
    code: string;
    title: string;
    price: number;
    currency: string;
    durationDays: number | null;
  }>;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({
  isOpen,
  onClose,
  title = "محتوای ویژه آوانا پلاس",
  description = "برای دسترسی به این محتوا و تمامی قابلیت‌های پیشرفته یادگیری، اشتراک آوانا پلاس را فعال کنید یا این محتوا/دوره را مستقلاً خریداری نمایید.",
  resourceTitle,
  resourceType = "lesson",
  availablePurchaseOptions = [],
}) => {
  const [showPricingModal, setShowPricingModal] = useState(false);
  const checkoutMutation = useCheckout();

  // Lock background body scroll while modal is active
  useEffect(() => {
    if (isOpen && !showPricingModal) {
      if (typeof document !== "undefined") {
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
          document.body.style.overflow = prevOverflow;
        };
      }
    }
  }, [isOpen, showPricingModal]);

  // Handle ESC key to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !showPricingModal) {
        onClose();
      }
    };
    if (isOpen && !showPricingModal) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, showPricingModal, onClose]);

  if (!isOpen) return null;

  if (showPricingModal) {
    return (
      <PricingModal
        isOpen={true}
        onClose={() => {
          setShowPricingModal(false);
          onClose();
        }}
      />
    );
  }

  const subscriptionOption = availablePurchaseOptions.find(
    (opt) => opt.type === "subscription",
  );
  const contentOption = availablePurchaseOptions.find(
    (opt) => opt.type === "content",
  );
  const courseOption = availablePurchaseOptions.find(
    (opt) => opt.type === "course",
  );
  const packOption = availablePurchaseOptions.find(
    (opt) => opt.type === "content_pack",
  );

  const showSubscription =
    availablePurchaseOptions.length === 0 || !!subscriptionOption;

  const handleBuy = (productId: string) => {
    checkoutMutation.mutate({
      product_id: productId,
      callback_url: `${window.location.origin}/checkout/callback`,
    });
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-modal-title"
    >
      {/* Full-viewport Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Floating Modal Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden text-center p-6 sm:p-8 my-auto flex flex-col max-h-[calc(100dvh-2rem)] animate-in fade-in zoom-in-95 duration-200"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 left-4 p-2 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 cursor-pointer"
          aria-label="بستن"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="overflow-y-auto flex-1 min-h-0 pt-2 pb-1">
          {/* Lock Graphic */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 flex items-center justify-center text-amber-500 mb-5 shadow-inner">
            <Lock className="w-8 h-8" />
          </div>

          <h3 id="paywall-modal-title" className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
            {title}
          </h3>

          {resourceTitle && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-semibold">
              {(resourceType === "course") && <BookOpen className="w-3.5 h-3.5 text-indigo-500" />}
              {(resourceType === "content" || resourceType === "lesson") && <FileText className="w-3.5 h-3.5 text-cyan-500" />}
              {resourceType === "content_pack" && <Package className="w-3.5 h-3.5 text-purple-500" />}
              <span>{resourceTitle}</span>
            </div>
          )}

          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
            {description}
          </p>

          {/* Action Options */}
          <div className="mt-6 flex flex-col gap-3">
            {/* Main Option: Subscription */}
            {showSubscription && (
              <button
                type="button"
                onClick={() => setShowPricingModal(true)}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm sm:text-base shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 group cursor-pointer"
              >
                <Zap className="w-4 h-4 text-amber-300 fill-current" />
                <span>
                  {subscriptionOption
                    ? `خرید اشتراک آوانا پلاس (${subscriptionOption.price.toLocaleString("fa-IR")} تومان)`
                    : "مشاهده و خرید اشتراک آوانا پلاس"}
                </span>
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              </button>
            )}

            {/* Content Purchase Option */}
            {contentOption && (
              <button
                type="button"
                onClick={() => handleBuy(contentOption.productId)}
                disabled={checkoutMutation.isPending}
                className="w-full py-3 px-6 rounded-2xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-900 dark:text-cyan-200 font-semibold text-xs sm:text-sm transition-all flex items-center justify-between border border-cyan-500/30 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-right">
                  <FileText className="w-4 h-4 text-cyan-500 shrink-0" />
                  <span>خرید تکی این درسنامه (دسترسی همیشگی)</span>
                </div>
                <span className="font-bold text-cyan-600 dark:text-cyan-400 shrink-0">
                  {contentOption.price.toLocaleString("fa-IR")} تومان
                </span>
              </button>
            )}

            {/* Course Purchase Option */}
            {courseOption && (
              <button
                type="button"
                onClick={() => handleBuy(courseOption.productId)}
                disabled={checkoutMutation.isPending}
                className="w-full py-3 px-6 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-900 dark:text-indigo-200 font-semibold text-xs sm:text-sm transition-all flex items-center justify-between border border-indigo-500/30 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-right">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>خرید کل این دوره (شامل تمام درسنامه‌ها)</span>
                </div>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                  {courseOption.price.toLocaleString("fa-IR")} تومان
                </span>
              </button>
            )}

            {/* Content Pack Purchase Option */}
            {packOption && (
              <button
                type="button"
                onClick={() => handleBuy(packOption.productId)}
                disabled={checkoutMutation.isPending}
                className="w-full py-3 px-6 rounded-2xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-900 dark:text-purple-200 font-semibold text-xs sm:text-sm transition-all flex items-center justify-between border border-purple-500/30 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-right">
                  <Package className="w-4 h-4 text-purple-500 shrink-0" />
                  <span>خرید دائمی این بسته آموزشی (مادام‌العمر)</span>
                </div>
                <span className="font-bold text-purple-600 dark:text-purple-400 shrink-0">
                  {packOption.price.toLocaleString("fa-IR")} تومان
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors mt-2 cursor-pointer py-1"
            >
              فعلاً نه، بعداً یادآوری کن
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : null;
};
