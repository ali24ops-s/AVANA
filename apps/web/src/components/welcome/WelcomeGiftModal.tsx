import React from "react";
import { Dialog, DialogContent, Button } from "@avana/ui";
import { Wallet, Clock, Sparkles } from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import { motion, useReducedMotion } from "framer-motion";
import { AvaniAvatar } from "../brand/AvaniAvatar.js";

export interface WelcomeGiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAmount?: number;
  subscriptionDays?: number;
  isAcknowledging?: boolean;
}

export const WelcomeGiftModal: React.FC<WelcomeGiftModalProps> = ({
  isOpen,
  onClose,
  walletAmount = 20000,
  subscriptionDays = 7,
  isAcknowledging = false,
}) => {
  const shouldReduceMotion = useReducedMotion();

  const formattedAmount = `${toPersianDigits(walletAmount.toLocaleString("fa-IR"))} تومان`;
  const formattedDays = `${toPersianDigits(subscriptionDays)} روز`;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      className="sm:max-w-[560px]"
      containerClassName="z-[9999]"
      hideHeader
      ariaLabel="هدیه خوش‌آمدگویی آوانا"
    >
      <DialogContent className="p-0 overflow-hidden bg-[#F7F9FA] dark:bg-zinc-950 text-slate-800 dark:text-zinc-100">
        {/* Top Header Banner with Brand Teal Glow */}
        <div className="relative pt-8 pb-5 px-6 sm:px-8 text-center bg-gradient-to-b from-[#008080]/15 via-[#008080]/5 to-transparent flex flex-col items-center">
          {/* Decorative Sparkle elements */}
          <div className="absolute top-4 left-6 text-[#008080]/30 animate-pulse">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="absolute top-6 right-8 text-amber-400/40 animate-pulse">
            <Sparkles className="w-4 h-4" />
          </div>

          {/* Avana Dedicated Brand Character (Avani celebrating) */}
          <motion.div
            initial={shouldReduceMotion ? { scale: 1 } : { scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="flex items-center justify-center mb-3 shrink-0"
          >
            <AvaniAvatar
              variant="celebrating"
              size={88}
              alt="آوانی - کاراکتر اختصاصی آوانا"
              asInlineSvg={true}
            />
          </motion.div>

          {/* Title & Subtitle */}
          <h2
            id="welcome-gift-modal-title"
            className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-2"
          >
            به خانواده آوانا خوش اومدی!
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-zinc-400 max-w-md leading-relaxed">
            برای شروع مسیر یادگیریت، دو هدیه ویژه برات در نظر گرفتیم.
          </p>
        </div>

        {/* Gift Cards Grid */}
        <div className="px-6 sm:px-8 py-3 space-y-3.5">
          {/* Card 1: Wallet Gift Credit */}
          <div className="bg-white dark:bg-zinc-900 border border-teal-100/80 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-100 dark:border-teal-900/40 text-[#008080] dark:text-teal-400 flex items-center justify-center shrink-0">
              <Wallet className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1 text-start">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white whitespace-nowrap">
                  شارژ هدیه کیف پول
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100/70 text-[#008080] dark:bg-teal-950 dark:text-teal-300 whitespace-nowrap shrink-0">
                  {formattedAmount}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-normal whitespace-normal sm:whitespace-nowrap">
                برای استفاده از امکانات آوانا
              </p>
            </div>
          </div>

          {/* Card 2: Free Subscription */}
          <div className="bg-white dark:bg-zinc-900 border border-teal-100/80 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-100 dark:border-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1 text-start">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white whitespace-nowrap">
                  اشتراک رایگان آوانا
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100/70 text-amber-700 dark:bg-amber-950 dark:text-amber-300 whitespace-nowrap shrink-0">
                  {formattedDays}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-normal whitespace-normal sm:whitespace-nowrap">
                برای اینکه با خیال راحت امکانات آوانا رو تجربه کنی
              </p>
            </div>
          </div>
        </div>

        {/* Motivational Footer Note & Action Button */}
        <div className="px-6 sm:px-8 pt-2 pb-7 text-center space-y-4">
          <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
            امیدواریم آوانا همراه خوبی در مسیر یادگیریت باشه.
          </p>

          <Button
            type="button"
            onClick={onClose}
            disabled={isAcknowledging}
            className="w-full py-3.5 px-6 rounded-2xl bg-[#008080] hover:bg-[#006666] active:bg-[#005555] text-white font-bold text-base shadow-lg shadow-[#008080]/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isAcknowledging ? "در حال دریافت..." : "بزن بریم!"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
