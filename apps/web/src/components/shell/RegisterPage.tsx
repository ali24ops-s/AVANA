/**
 * Registration page.
 *
 * Public route — accessible to unauthenticated users.
 * On successful registration, creates account & session, then redirects to /home.
 */

import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Phone, Lock, User, Eye, EyeOff, Gift } from "lucide-react";
import { BrandLogo } from "../brand/BrandLogo.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { ApiError } from "../../lib/api/errors.js";
import { validateAndNormalizeIranPhone } from "@avana/domain";
import { Button } from "@avana/ui";

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState(
    searchParams.get("ref") || "",
  );
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signUp, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const refFromUrl = searchParams.get("ref");
    if (refFromUrl && !referralCode) {
      setReferralCode(refFromUrl);
    }
  }, [searchParams]);

  // If already authenticated, redirect to home
  if (isAuthenticated) {
    navigate("/home", { replace: true });
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedFirstName = firstName.trim();
    if (!trimmedFirstName) {
      setError("لطفاً نام خود را وارد نمایید.");
      return;
    }

    const trimmedLastName = lastName.trim();
    if (!trimmedLastName) {
      setError("لطفاً نام خانوادگی خود را وارد نمایید.");
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("لطفاً یک نشانی ایمیل معتبر وارد نمایید.");
      return;
    }

    const trimmedPhone = phoneNumber.trim();
    if (!trimmedPhone) {
      setError("لطفاً شماره موبایل خود را وارد نمایید.");
      return;
    }

    const phoneValidation = validateAndNormalizeIranPhone(trimmedPhone);
    if (!phoneValidation.valid || !phoneValidation.normalized) {
      setError(
        phoneValidation.error ||
          "شماره موبایل معتبر نیست. شماره‌ای با فرمت ۰۹۱۲۳۴۵۶۷۸۹ وارد نمایید.",
      );
      return;
    }

    if (password.length < 8) {
      setError("رمز عبور باید حداقل ۸ کاراکتر باشد.");
      return;
    }

    if (password !== confirmPassword) {
      setError("رمز عبور و تکرار آن یکسان نیستند.");
      return;
    }

    setIsSubmitting(true);
    try {
      await signUp(
        trimmedEmail,
        password,
        `${trimmedFirstName} ${trimmedLastName}`,
        phoneValidation.normalized,
        trimmedFirstName,
        trimmedLastName,
        referralCode.trim() || undefined,
      );
      navigate("/verify-email", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const errorMsg =
          err.message === "Email domain not allowed"
            ? "دامنه ایمیل مجاز نیست."
            : err.message;
        setError(errorMsg);
      } else {
        setError("ثبت‌نام با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] flex flex-col font-sans" dir="rtl">
      {/* Header */}
      <header className="px-4 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs shrink-0">
        <BrandLogo
          linkTo="/"
          variant="logo-only"
          size="md"
          logoClassName="!h-8 sm:!h-9 !w-auto"
        />
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          سامانه هوشمند آموزش و یادگیری
        </span>
      </header>

      {/* Register form */}
      <div className="flex-1 flex items-center justify-center p-3 sm:p-4 md:py-3 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md sm:max-w-xl"
        >
          <div className="bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] p-4 sm:p-6 shadow-card">
            <div className="text-center mb-3 sm:mb-4">
              <div className="mx-auto mb-2 flex justify-center">
                <BrandLogo variant="logo-only" size="lg" logoClassName="h-9 sm:h-10 w-auto" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">
                ثبت‌نام در آوانا
              </h1>
              <p className="text-[var(--color-text-muted)] mt-1 text-xs">
                برای ایجاد حساب جدید، اطلاعات زیر را تکمیل نمایید.
              </p>
            </div>

            {error && (
              <div className="mb-3 p-3 rounded-card bg-[var(--avana-error-bg)] border border-[var(--avana-error-border)] text-[var(--avana-error)] text-xs font-medium leading-relaxed">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-2.5 sm:space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                <div>
                  <label
                    htmlFor="firstName"
                    className="block text-xs font-semibold text-[var(--color-text)] mb-1"
                  >
                    نام
                  </label>
                  <div className="relative">
                    <User className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                    <input
                      id="firstName"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="علی"
                      required
                      disabled={isSubmitting}
                      className="w-full ps-10 pe-4 py-2 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start text-xs sm:text-sm disabled:opacity-50 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="lastName"
                    className="block text-xs font-semibold text-[var(--color-text)] mb-1"
                  >
                    نام خانوادگی
                  </label>
                  <div className="relative">
                    <User className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                    <input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="محمدی"
                      required
                      disabled={isSubmitting}
                      className="w-full ps-10 pe-4 py-2 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start text-xs sm:text-sm disabled:opacity-50 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs font-semibold text-[var(--color-text)] mb-1"
                  >
                    نشانی ایمیل
                  </label>
                  <div className="relative flex items-center" dir="ltr">
                    <Mail className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      required
                      autoComplete="email"
                      disabled={isSubmitting}
                      dir="ltr"
                      className="w-full ps-10 pe-4 py-2 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start font-mono text-xs sm:text-sm disabled:opacity-50 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="phoneNumber"
                      className="block text-xs font-semibold text-[var(--color-text)]"
                    >
                      شماره موبایل
                    </label>
                    <span className="text-[11px] text-[var(--color-text-muted)] font-mono" dir="ltr">
                      مثال: 09123456789
                    </span>
                  </div>
                  <div className="relative flex items-center" dir="ltr">
                    <Phone className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                    <input
                      id="phoneNumber"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="09123456789"
                      required
                      autoComplete="tel"
                      disabled={isSubmitting}
                      dir="ltr"
                      className="w-full ps-10 pe-4 py-2 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start font-mono text-xs sm:text-sm disabled:opacity-50 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                <div>
                  <label
                    htmlFor="password"
                    className="block text-xs font-semibold text-[var(--color-text)] mb-1"
                  >
                    رمز عبور (حداقل ۸ کاراکتر)
                  </label>
                  <div className="relative flex items-center" dir="ltr">
                    <Lock className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                      disabled={isSubmitting}
                      dir="ltr"
                      className="w-full ps-10 pe-10 py-2 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start font-mono text-xs sm:text-sm disabled:opacity-50 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute end-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
                      title={showPassword ? "مخفی کردن رمز عبور" : "نمایش رمز عبور"}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-xs font-semibold text-[var(--color-text)] mb-1"
                  >
                    تکرار رمز عبور
                  </label>
                  <div className="relative flex items-center" dir="ltr">
                    <Lock className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                    <input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                      disabled={isSubmitting}
                      dir="ltr"
                      className="w-full ps-10 pe-10 py-2 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start font-mono text-xs sm:text-sm disabled:opacity-50 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="referralCode"
                    className="block text-xs font-semibold text-[var(--color-text)]"
                  >
                    کد معرف (اختیاری)
                  </label>
                  {referralCode && (
                    <span className="text-[11px] text-primary font-medium">
                      کد اعمال شد
                    </span>
                  )}
                </div>
                <div className="relative flex items-center" dir="ltr">
                  <Gift className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                  <input
                    id="referralCode"
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="مثال: AVN7K4P2"
                    disabled={isSubmitting}
                    dir="ltr"
                    className="w-full ps-10 pe-4 py-2 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start font-mono text-xs sm:text-sm disabled:opacity-50 transition-all uppercase"
                  />
                </div>
              </div>

              <div className="pt-1">
                <Button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    !firstName.trim() ||
                    !lastName.trim() ||
                    !email.trim() ||
                    !phoneNumber.trim() ||
                    !password ||
                    !confirmPassword
                  }
                  isLoading={isSubmitting}
                  variant="primary"
                  fullWidth
                  size="md"
                >
                  ثبت‌نام
                </Button>
              </div>
            </form>

            <div className="mt-2.5 sm:mt-3 text-center">
              <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                با ثبت‌نام در آوانا،{" "}
                <Link
                  to="/terms"
                  className="text-primary hover:underline font-medium"
                >
                  قوانین و مقررات استفاده
                </Link>{" "}
                از سامانه را می‌پذیرید.
              </p>
            </div>

            <div className="mt-3 pt-3 sm:mt-3.5 sm:pt-3.5 border-t border-[var(--color-border)] text-center">
              <span className="text-xs text-[var(--color-text-muted)]">
                قبلاً حساب کاربری داشته‌اید؟{" "}
              </span>
              <Link
                to="/login"
                className="text-xs font-bold text-primary hover:underline transition-colors"
              >
                ورود به حساب
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

