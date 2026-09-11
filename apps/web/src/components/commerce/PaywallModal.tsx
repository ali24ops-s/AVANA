import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Lock,
  Zap,
  ArrowLeft,
  CheckCircle,
  Package,
  BookOpen,
  FileText,
} from "lucide-react";
import { PricingModal } from "./PricingModal.js";
import { Dialog, DialogContent, Button } from "@avana/ui";

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
  const navigate = useNavigate();
  const [showPricingModal, setShowPricingModal] = useState(false);

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
    onClose();
    navigate(`/checkout/card-to-card?productId=${encodeURIComponent(productId)}`);
  };

  return (
    <Dialog
      isOpen={isOpen && !showPricingModal}
      onClose={onClose}
      maxWidth="lg"
      containerClassName="z-[9999]"
      hideHeader
    >
      <DialogContent className="text-center p-6 sm:p-8 space-y-4">
        {/* Lock Graphic */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-4 shadow-inner">
          <Lock className="w-8 h-8" />
        </div>

        {/* Modal Title */}
        <h3 id="paywall-modal-title" className="text-xl sm:text-2xl font-black text-[var(--color-text)]">
          {title}
        </h3>

        {/* Resource Badge */}
        {resourceTitle && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)] text-xs font-semibold">
            {(resourceType === "course") && <BookOpen className="w-3.5 h-3.5 text-indigo-500" />}
            {(resourceType === "content" || resourceType === "lesson") && <FileText className="w-3.5 h-3.5 text-cyan-500" />}
            {resourceType === "content_pack" && <Package className="w-3.5 h-3.5 text-purple-500" />}
            <span>{resourceTitle}</span>
          </div>
        )}

        {/* Description */}
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed max-w-sm mx-auto">
          {description}
        </p>

        {/* Action Options */}
        <div className="pt-2 flex flex-col gap-3">
          {/* Main Option: Subscription */}
          {showSubscription && (
            <Button
              size="lg"
              variant="primary"
              onClick={() => setShowPricingModal(true)}
              className="w-full justify-between gap-2 py-3.5 text-sm sm:text-base font-bold shadow-lg shadow-[#008080]/20"
              leftIcon={<Zap className="w-4 h-4 text-amber-300 fill-current" />}
              rightIcon={<ArrowLeft className="w-4 h-4" />}
            >
              <span>
                {subscriptionOption
                  ? `خرید اشتراک آوانا پلاس (${subscriptionOption.price.toLocaleString("fa-IR")} تومان)`
                  : "مشاهده و خرید اشتراک آوانا پلاس"}
              </span>
            </Button>
          )}

          {/* Content Purchase Option */}
          {contentOption && (
            <button
              type="button"
              onClick={() => handleBuy(contentOption.productId)}
              className="w-full py-3 px-4 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-[var(--color-text)] font-semibold text-xs sm:text-sm transition-all flex items-center justify-between border border-cyan-500/30 cursor-pointer"
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
              className="w-full py-3 px-4 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-[var(--color-text)] font-semibold text-xs sm:text-sm transition-all flex items-center justify-between border border-indigo-500/30 cursor-pointer"
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
              className="w-full py-3 px-4 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-[var(--color-text)] font-semibold text-xs sm:text-sm transition-all flex items-center justify-between border border-purple-500/30 cursor-pointer"
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

          {/* Dismiss button */}
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors mt-2 cursor-pointer py-1"
          >
            فعلاً نه، بعداً یادآوری کن
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
