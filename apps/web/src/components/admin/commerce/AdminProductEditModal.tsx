import { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import { ShoppingBag, AlertCircle, CheckCircle2, X } from "lucide-react";
import type { AdminProductRecord } from "../../../lib/api/admin.js";
import { formatToman } from "./commerceUtils.js";

interface AdminProductEditModalProps {
  isOpen: boolean;
  product: AdminProductRecord | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminProductEditModal({
  isOpen,
  product,
  onClose,
  onSuccess,
}: AdminProductEditModalProps) {
  const adminApi = useAdmin();

  const [priceInput, setPriceInput] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setPriceInput(product.price.toString());
      setIsActive(product.active);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [product]);

  if (!isOpen || !product) return null;

  const isSubscription = product.type === "subscription";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmed = priceInput.trim();
    if (!trimmed) {
      setErrorMsg("لطفاً قیمت محصول را وارد کنید.");
      return;
    }

    const price = Number(trimmed);
    if (isNaN(price) || !Number.isInteger(price) || price < 0) {
      setErrorMsg("لطفاً قیمت معتبر (عدد صحیح نامنفی به تومان) وارد کنید.");
      return;
    }

    setIsSubmitting(true);
    try {
      await adminApi.updateCommerceProduct(product.id, {
        active: isActive,
        price,
      });

      setSuccessMsg("تغییرات محصول با موفقیت ذخیره شد.");
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 800);
    } catch (err: any) {
      setErrorMsg(err.message || "خطا در ذخیره تغییرات.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
          <div className="flex items-center gap-2 text-[var(--color-primary-default)] font-bold text-base">
            <ShoppingBag className="w-5 h-5" />
            <span>ویرایش محصول کاتالوگ</span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div>
            <span className="text-xs text-[var(--color-text-muted)] block mb-1">نام محصول:</span>
            <p className="text-sm font-semibold text-[var(--color-text)]">{product.title}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono">{product.code}</p>
          </div>

          {/* Price Field */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
              قیمت فروش (تومان)
            </label>
            <div>
              <input
                type="number"
                min="0"
                step="1000"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)]"
                placeholder="مثال: ۲۵۰۰۰۰"
              />
              {priceInput && !isNaN(parseInt(priceInput, 10)) && (
                <p className="text-xs text-[var(--color-primary-default)] mt-1.5">
                  معادل: {formatToman(parseInt(priceInput, 10))}
                </p>
              )}
            </div>
            {isSubscription && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1.5 leading-relaxed">
                تغییر قیمت پلن اشتراک بلافاصله برای خریدهای جدید کاربران اعمال می‌شود.
              </p>
            )}
          </div>

          {/* Status Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
            <div>
              <span className="text-sm font-medium text-[var(--color-text)] block">وضعیت عرضه محصول</span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {isActive ? "محصول برای خرید کاربران فعال است" : "محصول غیرفعال و غیرقابل خرید است"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isActive ? "bg-[var(--color-primary-default)]" : "bg-[var(--color-surface-muted)]"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isActive ? "translate-x-0" : "-translate-x-5"
                }`}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-sm font-medium text-[var(--color-primary-contrast)] bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
            >
              {isSubmitting ? "در حال ذخیره..." : "ذخیره تغییرات"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
