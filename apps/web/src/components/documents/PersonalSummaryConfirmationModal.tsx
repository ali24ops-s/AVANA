/**
 * PersonalSummaryConfirmationModal.
 *
 * Transparent payment confirmation modal before debiting 3,000 Tomans
 * from user's internal Avana wallet to generate a personal summary.
 */

import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
} from "@avana/ui";
import {
  Sparkles,
  Wallet,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import { formatTomanPrice, toPersianDigits } from "@avana/domain";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createWalletApi } from "../../lib/api/wallet.js";

export interface PersonalSummaryConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isGenerating?: boolean;
  chapterTitle: string;
  highlightsCount: number;
  notesCount: number;
  costToman?: number;
  errorMessage?: string | null;
}

export function PersonalSummaryConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  isGenerating = false,
  chapterTitle,
  highlightsCount,
  notesCount,
  costToman = 3000,
  errorMessage,
}: PersonalSummaryConfirmationModalProps) {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const walletApi = createWalletApi(apiClient);

  const walletQuery = useQuery({
    queryKey: ["wallet-me"],
    queryFn: () => walletApi.getMyWallet(),
    enabled: isOpen,
    staleTime: 5000,
  });

  const balance = walletQuery.data?.balance ?? 0;
  const isBalanceLoading = walletQuery.isLoading;
  const hasSufficientBalance = balance >= costToman;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={isGenerating ? () => {} : onClose}
      maxWidth="md"
      ariaLabel="تأیید پرداخت و تولید خلاصه شخصی"
    >
      <DialogHeader onClose={isGenerating ? undefined : onClose}>
        <div className="flex items-center gap-2.5" dir="rtl">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-[var(--color-text)]">
              ساخت خلاصه شخصی من
            </h3>
            <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-1">
              فصل: {chapterTitle}
            </p>
          </div>
        </div>
      </DialogHeader>

      <DialogContent>
        <div className="space-y-4 font-sans text-right" dir="rtl">
          {/* Summary Breakdown Card */}
          <div className="p-3.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-secondary)]">محتوای ورودی شما:</span>
              <span className="font-bold text-primary">
                {toPersianDigits(highlightsCount)} هایلایت • {toPersianDigits(notesCount)} یادداشت
              </span>
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--color-border)]">
              <span className="text-[var(--color-text-secondary)]">هزینه تولید خلاصه:</span>
              <span className="font-extrabold text-sm text-[var(--color-text)]">
                {formatTomanPrice(costToman)}
              </span>
            </div>
          </div>

          {/* Wallet Balance State */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[var(--color-text-muted)]" />
              <span className="text-xs text-[var(--color-text-secondary)]">
                موجودی فعلی کیف پول شما:
              </span>
            </div>
            <div className="text-xs font-bold text-[var(--color-text)]">
              {isBalanceLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary inline" />
              ) : (
                formatTomanPrice(balance)
              )}
            </div>
          </div>

          {/* Insufficient Funds Warning */}
          {!isBalanceLoading && !hasSufficientBalance && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>موجودی کیف پول شما برای این عملیات کافی نیست</span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                برای تولید خلاصه شخصی، به {formatTomanPrice(costToman - balance)} شارژ دیگر نیاز دارید.
              </p>
              <div className="pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.location.href = "/account/wallet";
                  }}
                  leftIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
                  className="w-full justify-center text-xs"
                >
                  افزایش موجودی کیف پول
                </Button>
              </div>
            </div>
          )}

          {/* Guarantee Note */}
          {hasSufficientBalance && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-300 text-[11px] leading-relaxed">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              <span>
                مبلغ ۳٬۰۰۰ تومان از کیف پول شما کسر می‌شود. در صورت بروز هرگونه خطا یا وقفه در تولید هوش مصنوعی، این مبلغ بلافاصله و به صورت تضمینی به کیف پول شما بازگردانده خواهد شد.
              </span>
            </div>
          )}

          {/* Error Message if present */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      </DialogContent>

      <DialogFooter>
        <div className="flex items-center justify-end gap-2 w-full" dir="rtl">
          <Button
            variant="tertiary"
            size="sm"
            onClick={onClose}
            disabled={isGenerating}
          >
            انصراف
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={onConfirm}
            disabled={isGenerating || !hasSufficientBalance || isBalanceLoading}
            leftIcon={
              isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )
            }
          >
            {isGenerating ? "در حال تولید با Gemini..." : `تأیید و پرداخت ${formatTomanPrice(costToman)}`}
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}
