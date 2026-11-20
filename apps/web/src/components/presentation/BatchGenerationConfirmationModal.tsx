import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Layers,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Alert,
} from "../ui/index.js";
import { usePresentationBatchCostPreview } from "../../hooks/usePresentation.js";

interface BatchGenerationConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (onlyUnprocessed: boolean) => void;
  projectId: string;
  isStarting?: boolean;
}

export const BatchGenerationConfirmationModal: React.FC<
  BatchGenerationConfirmationModalProps
> = ({ isOpen, onClose, onConfirm, projectId, isStarting = false }) => {
  const navigate = useNavigate();
  const [onlyUnprocessed, setOnlyUnprocessed] = useState<boolean>(true);

  const { data: preview, isLoading, error } = usePresentationBatchCostPreview(
    projectId,
    onlyUnprocessed,
    { enabled: isOpen },
  );

  const hasSufficient = preview?.has_sufficient_balance ?? false;
  const totalCost = preview?.total_cost_toman ?? 0;
  const unpaidCount = preview?.unpaid_slides ?? 0;
  const previouslyPaid = preview?.previously_paid_slides ?? 0;
  const balance = preview?.wallet_balance_toman ?? 0;

  return (
    <Dialog isOpen={isOpen} onClose={isStarting ? () => {} : onClose}>
      <DialogHeader onClose={isStarting ? undefined : onClose}>
        <div className="flex items-center gap-2 text-primary font-bold text-lg">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <span>تولید گروهی متن ارائه با هوش مصنوعی</span>
        </div>
      </DialogHeader>

      <DialogContent>
        <div className="space-y-4 text-sm text-slate-700">
          {/* Options toggle: only unprocessed */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyUnprocessed}
                onChange={(e) => setOnlyUnprocessed(e.target.checked)}
                disabled={isStarting}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              <div className="text-xs">
                <span className="font-semibold text-slate-800 block mb-0.5">
                  فقط اسلایدهای بدون متن (پیشنهادی)
                </span>
                <span className="text-slate-500 leading-relaxed block">
                  اسلایدهایی که قبلاً برای آن‌ها متن تولید شده مجدداً بازتولید نمی‌شوند و هزینه‌ای نخواهند داشت.
                </span>
              </div>
            </label>
          </div>

          {isLoading ? (
            <div className="p-6 text-center text-slate-500 flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
              <span className="text-xs">در حال محاسبه هزینه اسلایدها و استعلام موجودی...</span>
            </div>
          ) : error ? (
            <Alert variant="error">
              <span className="text-xs">خطا در دریافت پیش‌نمایش هزینه: {error.message}</span>
            </Alert>
          ) : (
            <>
              {/* Cost Breakdown Card */}
              <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-slate-600 pb-1.5 border-b border-indigo-100/70">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    <span>تعداد کل اسلایدها:</span>
                  </span>
                  <span className="font-bold text-slate-800">
                    {(preview?.total_slides ?? 0).toLocaleString("fa-IR")} اسلاید
                  </span>
                </div>

                {previouslyPaid > 0 && (
                  <div className="flex items-center justify-between text-emerald-700 font-medium">
                    <span className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>قبلاً پرداخت‌شده (بازتولید رایگان):</span>
                    </span>
                    <span>{previouslyPaid.toLocaleString("fa-IR")} اسلاید (۰ تومان)</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-slate-700">
                  <span>اسلایدهای جدید مشمول هزینه ({unpaidCount.toLocaleString("fa-IR")} × ۱٬۵۰۰ تومان):</span>
                  <span className="font-semibold text-slate-900">
                    {totalCost.toLocaleString("fa-IR")} تومان
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm pt-2 border-t border-indigo-100">
                  <span className="font-bold text-slate-800">هزینه نهایی قابل پرداخت:</span>
                  <span className="font-bold text-indigo-600 text-base">
                    {totalCost === 0 ? "رایگان" : `${totalCost.toLocaleString("fa-IR")} تومان`}
                  </span>
                </div>
              </div>

              {/* Wallet Balance Status */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-600">موجودی کیف پول شما:</span>
                </div>
                <span className="font-bold text-slate-900 text-sm">
                  {balance.toLocaleString("fa-IR")} تومان
                </span>
              </div>

              {/* Insufficient Funds Warning */}
              {totalCost > 0 && !hasSufficient && (
                <Alert variant="warning">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 font-medium text-amber-900 text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        موجودی کیف پول شما ({balance.toLocaleString("fa-IR")} تومان) کمتر از هزینه کل (
                        {totalCost.toLocaleString("fa-IR")} تومان) است.
                      </span>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onClose();
                          navigate("/account/wallet");
                        }}
                        className="text-xs font-semibold"
                      >
                        <span>شارژ کیف پول</span>
                        <ArrowRight className="w-3.5 h-3.5 mr-1" />
                      </Button>
                    </div>
                  </div>
                </Alert>
              )}

              {/* Refund Guarantee */}
              <div className="flex items-start gap-2 text-xs text-slate-500 pt-0.5">
                <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <span>
                  ضمانت بازگشت وجه: در صورت بروز هرگونه اختلال در فرآیند تولید هر اسلاید، مبلغ آن اسلاید بلافاصله به صورت خودکار به کیف پول شما مسترد خواهد شد.
                </span>
              </div>
            </>
          )}
        </div>
      </DialogContent>

      <DialogFooter>
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose} disabled={isStarting}>
            انصراف
          </Button>

          {totalCost === 0 || hasSufficient ? (
            <Button
              variant="primary"
              onClick={() => onConfirm(onlyUnprocessed)}
              disabled={isStarting || isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
            >
              {isStarting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>در حال آغاز تولید هوشمند...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {totalCost === 0
                      ? "تأیید و شروع تولید رایگان"
                      : `تأیید و پرداخت (${totalCost.toLocaleString("fa-IR")} تومان)`}
                  </span>
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                navigate("/account/wallet");
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
