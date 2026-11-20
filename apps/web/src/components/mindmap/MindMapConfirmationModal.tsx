import React from "react";
import {
  Wallet,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Alert,
} from "../ui/index.js";
import { useMyWallet } from "../../hooks/useWallet.js";

interface MindMapConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  moduleTitle: string;
  costToman?: number;
  isGenerating?: boolean;
}

export const MindMapConfirmationModal: React.FC<MindMapConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  moduleTitle,
  costToman = 2500,
  isGenerating = false,
}) => {
  const { data: walletData, isLoading: isLoadingWallet } = useMyWallet();

  const balance = walletData?.balance ?? 0;
  const hasSufficientBalance = balance >= costToman;

  return (
    <Dialog isOpen={isOpen} onClose={isGenerating ? () => {} : onClose}>
      <DialogHeader onClose={isGenerating ? undefined : onClose}>
        <div className="flex items-center gap-2 text-primary font-bold text-lg">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <span>تولید هوشمند نقشه مفهومی</span>
        </div>
      </DialogHeader>

      <DialogContent>
        <div className="space-y-4 text-sm text-slate-700">
          {/* Module Title Info */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-xs text-slate-500 block mb-1">سرفصل آموزشی:</span>
            <span className="font-semibold text-slate-900">{moduleTitle}</span>
          </div>

          {/* Pricing & Free Regeneration Guarantee */}
          <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600">هزینه اولین تولید:</span>
              <span className="font-bold text-indigo-600 text-base">
                {costToman.toLocaleString("fa-IR")} تومان
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>بازتولیدهای بعدی این سرفصل به صورت نامحدود و رایگان خواهد بود.</span>
            </div>
          </div>

          {/* Wallet Balance Status */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-slate-500" />
              <span className="text-slate-600">موجودی کیف پول شما:</span>
            </div>
            <span className="font-bold text-slate-900">
              {isLoadingWallet ? "در حال دریافت..." : `${balance.toLocaleString("fa-IR")} تومان`}
            </span>
          </div>

          {/* Insufficient Funds Warning */}
          {!isLoadingWallet && !hasSufficientBalance && (
            <Alert variant="warning">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 font-medium text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>موجودی کیف پول شما برای تولید این نقشه مفهومی کافی نیست.</span>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onClose();
                      window.location.href = "/account/wallet";
                    }}
                    className="text-xs font-semibold"
                  >
                    <span>افزایش موجودی کیف پول</span>
                    <ArrowRight className="w-3.5 h-3.5 mr-1" />
                  </Button>
                </div>
              </div>
            </Alert>
          )}

          {/* Refund Guarantee */}
          <div className="flex items-start gap-2 text-xs text-slate-500 pt-1">
            <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <span>
              ضمانت بازگشت وجه: در صورت بروز هرگونه اختلال در فرآیند تولید هوش مصنوعی، مبلغ بلافاصله به کیف پول شما مسترد خواهد شد.
            </span>
          </div>
        </div>
      </DialogContent>

      <DialogFooter>
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose} disabled={isGenerating}>
            انصراف
          </Button>

          {hasSufficientBalance ? (
            <Button
              variant="primary"
              onClick={onConfirm}
              disabled={isGenerating}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>در حال پرداخت و شروع تولید...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>تأیید و پرداخت ({costToman.toLocaleString("fa-IR")} تومان)</span>
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                if (typeof window !== "undefined") {
                  window.location.href = "/account/wallet";
                }
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              <Wallet className="w-4 h-4" />
              <span>شارژ کیف پول</span>
            </Button>
          )}
        </div>
      </DialogFooter>
    </Dialog>
  );
};
