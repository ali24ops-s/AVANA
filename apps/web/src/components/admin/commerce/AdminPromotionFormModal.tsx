import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Percent,
  DollarSign,
  Coins,
  AlertCircle,
  Loader2,
  Users,
  Package,
} from "lucide-react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import type {
  AdminPromotionDetail,
  CreateAdminPromotionInput,
  UpdateAdminPromotionInput,
} from "../../../lib/api/admin.js";

interface AdminPromotionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  promotionToEdit?: AdminPromotionDetail | null;
  onSaved: () => void;
}

export function AdminPromotionFormModal({
  isOpen,
  onClose,
  promotionToEdit,
  onSaved,
}: AdminPromotionFormModalProps) {
  const adminApi = useAdmin();

  const isEdit = Boolean(promotionToEdit);

  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [benefitType, setBenefitType] = useState<
    "percentage_discount" | "fixed_discount" | "percentage_cashback" | "fixed_cashback"
  >("percentage_discount");
  const [benefitValue, setBenefitValue] = useState<number | "">("");
  const [maxDiscountAmount, setMaxDiscountAmount] = useState<number | "">("");
  const [minOrderAmount, setMinOrderAmount] = useState<number | "">("");
  const [totalUsageLimit, setTotalUsageLimit] = useState<number | "">("");
  const [perUserUsageLimit, setPerUserUsageLimit] = useState<number | "">("");
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [initialCode, setInitialCode] = useState("");

  // Restrictions
  const [productTypeRestriction, setProductTypeRestriction] = useState<string>("all");
  const [userRestrictionsText, setUserRestrictionsText] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (promotionToEdit) {
      setName(promotionToEdit.name);
      setDescription(promotionToEdit.description || "");
      setBenefitType(promotionToEdit.benefitType);
      setBenefitValue(promotionToEdit.benefitValue);
      setMaxDiscountAmount(promotionToEdit.maxDiscountAmount ?? "");
      setMinOrderAmount(promotionToEdit.minOrderAmount ?? "");
      setTotalUsageLimit(promotionToEdit.totalUsageLimit ?? "");
      setPerUserUsageLimit(promotionToEdit.perUserUsageLimit ?? "");
      setActive(promotionToEdit.active);
      setStartsAt(
        promotionToEdit.startsAt
          ? new Date(promotionToEdit.startsAt).toISOString().split("T")[0]
          : "",
      );
      setEndsAt(
        promotionToEdit.endsAt
          ? new Date(promotionToEdit.endsAt).toISOString().split("T")[0]
          : "",
      );
      setInitialCode("");

      if (promotionToEdit.productRestrictions && promotionToEdit.productRestrictions.length > 0) {
        const first = promotionToEdit.productRestrictions[0];
        setProductTypeRestriction(first.productType || "all");
      } else {
        setProductTypeRestriction("all");
      }

      if (promotionToEdit.userRestrictions && promotionToEdit.userRestrictions.length > 0) {
        setUserRestrictionsText(
          promotionToEdit.userRestrictions.map((u) => u.userId).join("\n"),
        );
      } else {
        setUserRestrictionsText("");
      }
    } else {
      setName("");
      setDescription("");
      setBenefitType("percentage_discount");
      setBenefitValue(20);
      setMaxDiscountAmount("");
      setMinOrderAmount("");
      setTotalUsageLimit("");
      setPerUserUsageLimit(1);
      setActive(true);
      setStartsAt("");
      setEndsAt("");
      setInitialCode("");
      setProductTypeRestriction("all");
      setUserRestrictionsText("");
    }
    setErrorMsg(null);
  }, [promotionToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg("نام پروموشن الزامی است.");
      return;
    }

    if (benefitValue === "" || Number(benefitValue) <= 0) {
      setErrorMsg("مقدار تخفیف/کش‌بک باید عددی مثبت باشد.");
      return;
    }

    if (
      (benefitType === "percentage_discount" || benefitType === "percentage_cashback") &&
      Number(benefitValue) > 100
    ) {
      setErrorMsg("درصد تخفیف یا کش‌بک نمی‌تواند بیشتر از ۱۰۰ باشد.");
      return;
    }

    // Parse product restrictions
    const productRestrictions: { productType?: string }[] = [];
    if (productTypeRestriction !== "all") {
      productRestrictions.push({ productType: productTypeRestriction });
    }

    // Parse user restrictions
    const userRestrictions = userRestrictionsText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    setIsSubmitting(true);
    try {
      if (isEdit && promotionToEdit) {
        const payload: UpdateAdminPromotionInput = {
          name: name.trim(),
          description: description.trim() || null,
          benefitType,
          benefitValue: Number(benefitValue),
          maxDiscountAmount: maxDiscountAmount !== "" ? Number(maxDiscountAmount) : null,
          minOrderAmount: minOrderAmount !== "" ? Number(minOrderAmount) : null,
          totalUsageLimit: totalUsageLimit !== "" ? Number(totalUsageLimit) : null,
          perUserUsageLimit: perUserUsageLimit !== "" ? Number(perUserUsageLimit) : null,
          active,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          productRestrictions,
          userRestrictions,
        };
        await adminApi.updateCommercePromotion(promotionToEdit.id, payload);
      } else {
        const payload: CreateAdminPromotionInput = {
          name: name.trim(),
          description: description.trim() || null,
          benefitType,
          benefitValue: Number(benefitValue),
          maxDiscountAmount: maxDiscountAmount !== "" ? Number(maxDiscountAmount) : null,
          minOrderAmount: minOrderAmount !== "" ? Number(minOrderAmount) : null,
          totalUsageLimit: totalUsageLimit !== "" ? Number(totalUsageLimit) : null,
          perUserUsageLimit: perUserUsageLimit !== "" ? Number(perUserUsageLimit) : null,
          active,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          code: initialCode.trim() || undefined,
          productRestrictions,
          userRestrictions,
        };
        await adminApi.createCommercePromotion(payload);
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در ذخیره پروموشن";
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      dir="rtl"
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] flex items-center justify-center">
              <Percent className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[var(--color-text)]">
                {isEdit ? "ویرایش پروموشن / کد تخفیف" : "تعریف پروموشن / کد تخفیف جدید"}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                {isEdit
                  ? `ویرایش مشخصات و قوانین پروموشن ${promotionToEdit?.name}`
                  : "تعریف قوانین تخفیف، کش‌بک، محدودیت‌های استفاده و کدهای کوپن"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)] rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            {errorMsg && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

          {/* 1. Basic Info */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
              مشخصات پایه
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  نام پروموشن <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: تخفیف نوروزی ۱۴۰۵"
                  className="w-full px-3.5 py-2.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                  required
                />
              </div>

              {!isEdit && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                    کد کوپن اولیه (اختیاری)
                  </label>
                  <input
                    type="text"
                    value={initialCode}
                    onChange={(e) => setInitialCode(e.target.value.toUpperCase())}
                    placeholder="مثال: NOWRUZ1405"
                    className="w-full px-3.5 py-2.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-xs font-mono text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] text-left"
                    dir="ltr"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                توضیحات (اختیاری)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="توضیحات داخلی یا توضیحات نمایش به کاربران..."
                className="w-full px-3.5 py-2 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
              />
            </div>
          </div>

          {/* 2. Benefit Type & Value */}
          <div className="space-y-4 pt-2 border-t border-[var(--color-border)]">
            <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
              نوع و میزان امتیاز (Benefit)
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {[
                {
                  id: "percentage_discount",
                  label: "تخفیف درصدی",
                  icon: Percent,
                  desc: "درصد کسر از صورت‌حساب",
                },
                {
                  id: "fixed_discount",
                  label: "تخفیف مبلغ ثابت",
                  icon: DollarSign,
                  desc: "مبلغ ثابت کسر از صورت‌حساب",
                },
                {
                  id: "percentage_cashback",
                  label: "کش‌بک درصدی",
                  icon: Coins,
                  desc: "شارژ درصدی کیف پول پس از پرداخت",
                },
                {
                  id: "fixed_cashback",
                  label: "کش‌بک مبلغ ثابت",
                  icon: Sparkles,
                  desc: "شارژ مبلغ ثابت به کیف پول",
                },
              ].map((item) => {
                const isSelected = benefitType === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setBenefitType(
                        item.id as
                          | "percentage_discount"
                          | "fixed_discount"
                          | "percentage_cashback"
                          | "fixed_cashback",
                      )
                    }
                    className={`p-3 rounded-xl border text-right transition-all flex flex-col gap-1.5 ${
                      isSelected
                        ? "bg-[var(--color-primary-default)]/10 border-[var(--color-primary-default)] text-[var(--color-primary-default)] shadow-sm"
                        : "bg-[var(--color-surface-subtle)] border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-bold">{item.label}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)] leading-tight">
                      {item.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  {benefitType.includes("percentage")
                    ? "درصد تخفیف / کش‌بک (۱ تا ۱۰۰)"
                    : "مبلغ تخفیف / کش‌بک (تومان)"}{" "}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={benefitValue}
                  onChange={(e) =>
                    setBenefitValue(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder={benefitType.includes("percentage") ? "مثال: ۲۵" : "مثال: ۵۰۰۰۰"}
                  className="w-full px-3.5 py-2.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                  required
                  min={1}
                  max={benefitType.includes("percentage") ? 100 : undefined}
                />
              </div>

              {benefitType === "percentage_discount" && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                    سقف حداکثر تخفیف (تومان - اختیاری)
                  </label>
                  <input
                    type="number"
                    value={maxDiscountAmount}
                    onChange={(e) =>
                      setMaxDiscountAmount(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    placeholder="مثال: ۱۵۰۰۰۰ (بدون سقف اگر خالی باشد)"
                    className="w-full px-3.5 py-2.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                    min={0}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 3. Usage Limits & Orders */}
          <div className="space-y-4 pt-2 border-t border-[var(--color-border)]">
            <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
              سقف استفاده و مبالغ سفارش
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  حداقل مبلغ سفارش (تومان)
                </label>
                <input
                  type="number"
                  value={minOrderAmount}
                  onChange={(e) =>
                    setMinOrderAmount(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="بدون حداقل اگر خالی باشد"
                  className="w-full px-3.5 py-2.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                  min={0}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  سقف کل استفاده (تعداد)
                </label>
                <input
                  type="number"
                  value={totalUsageLimit}
                  onChange={(e) =>
                    setTotalUsageLimit(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  placeholder="نامحدود اگر خالی باشد"
                  className="w-full px-3.5 py-2.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                  min={1}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  سقف استفاده به ازای هر کاربر
                </label>
                <input
                  type="number"
                  value={perUserUsageLimit}
                  onChange={(e) =>
                    setPerUserUsageLimit(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  placeholder="پیش‌فرض: ۱ بار"
                  className="w-full px-3.5 py-2.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                  min={1}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  تاریخ شروع اعتبار
                </label>
                <input
                  type="date"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  تاریخ پایان اعتبار (انقضا)
                </label>
                <input
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                />
              </div>
            </div>
          </div>

          {/* 4. Scope & Restrictions */}
          <div className="space-y-4 pt-2 border-t border-[var(--color-border)]">
            <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
              محدودیت‌های دامنه (محصول و کاربر)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                  <span>محدودیت نوع محصول</span>
                </label>
                <select
                  value={productTypeRestriction}
                  onChange={(e) => setProductTypeRestriction(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                >
                  <option value="all">همه محصولات (به جز شارژ کیف پول)</option>
                  <option value="subscription">فقط پلن‌های اشتراک</option>
                  <option value="course">فقط دوره‌های آموزشی</option>
                  <option value="content_pack">فقط بسته‌های محتوایی</option>
                  <option value="special_exam">فقط آزمون‌های ویژه</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                  <span>محدودیت کاربران خاص (شناسه کاربر در هر خط)</span>
                </label>
                <textarea
                  value={userRestrictionsText}
                  onChange={(e) => setUserRestrictionsText(e.target.value)}
                  rows={2}
                  placeholder="UUID کاربران مجاز (خالی = همه کاربران)..."
                  className="w-full px-3.5 py-2 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-xs font-mono text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] text-left"
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {/* 5. Active Status */}
          <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-[var(--color-text)]">وضعیت فعال بودن پروموشن</span>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                در صورت غیرفعال بودن، کدهای این پروموشن قابل اعمال نخواهند بود.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary-default)]"></div>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)] transition-colors cursor-pointer"
          >
            انصراف
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] text-xs font-bold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال ذخیره...</span>
              </>
            ) : (
              <span>{isEdit ? "ذخیره تغییرات" : "ایجاد پروموشن"}</span>
            )}
          </button>
        </div>
      </form>
    </div>
  </div>
  );
}
