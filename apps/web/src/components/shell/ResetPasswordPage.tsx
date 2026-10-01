/**
 * Reset password page.
 *
 * Public route — allows users to create a new password using a valid,
 * unexpired, single-use reset token delivered via email.
 */

import { useState, useEffect, useLayoutEffect, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight, KeyRound } from "lucide-react";
import { BrandLogo } from "../brand/BrandLogo.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { ApiError } from "../../lib/api/errors.js";
import { Button } from "@avana/ui";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const rawTokenFromUrl = searchParams.get("token") || "";

  // Preserve token in component state
  const [token] = useState(rawTokenFromUrl);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTokenInvalid, setIsTokenInvalid] = useState(false);
  const [success, setSuccess] = useState(false);

  const { resetPassword, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/home", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Strip token from browser address bar before paint to eliminate persistence in browser history and referrers
  useLayoutEffect(() => {
    if (rawTokenFromUrl && typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState(null, "", location.pathname);
    }
  }, [rawTokenFromUrl, location.pathname]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting || success) return;

    setError(null);

    if (!token) {
      setError("توکن بازیابی یافت نشد یا معتبر نیست. لطفاً مجدداً درخواست بازیابی دهید.");
      setIsTokenInvalid(true);
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
      await resetPassword(token, password);
      setSuccess(true);
      // Wait 2.5 seconds then redirect to login
      setTimeout(() => {
        navigate("/sign-in", {
          replace: true,
          state: { successMessage: "رمز عبور شما با موفقیت تغییر کرد. لطفاً با رمز جدید وارد شوید." },
        });
      }, 2500);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        // If token expired, invalid, or used, flag as invalid to offer retry button
        if (
          err.message.includes("نامعتبر") ||
          err.message.includes("منقضی") ||
          err.message.includes("استفاده")
        ) {
          setIsTokenInvalid(true);
        }
      } else {
        setError("تغییر رمز عبور با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] flex flex-col font-sans"
      dir="rtl"
    >
      {/* Header */}
      <header className="px-4 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs shrink-0">
        <BrandLogo
          linkTo="/"
          variant="logo-only"
          size="md"
          logoClassName="!h-8 sm:!h-9 !w-auto"
        />
        <div className="flex items-center gap-3">
          <Link
            to="/sign-in"
            className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            <span>بازگشت به ورود</span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 sm:p-8 shadow-sm">
            {/* Header Icon & Title */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-4">
                <KeyRound className="w-6 h-6" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)] tracking-tight">
                ایجاد رمز عبور جدید
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
                رمز عبور جدید خود را تعیین کنید. رمز عبور باید حداقل ۸ کاراکتر باشد.
              </p>
            </div>

            {/* Missing token alert */}
            {!token && (
              <div className="mb-5 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs sm:text-sm">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="leading-relaxed">
                    لینک بازیابی رمز عبور فاقد شناسه امنیتی لازم است یا منقضی شده است.
                  </span>
                </div>
                <div className="mt-4 text-center">
                  <Link
                    to="/forgot-password"
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:opacity-90 transition-opacity"
                  >
                    درخواست مجدد لینک بازیابی
                  </Link>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs sm:text-sm flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {/* Success Message */}
            {success ? (
              <div className="text-center py-6">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 mb-4">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h2 className="text-lg font-bold text-[var(--color-text)] mb-2">
                  رمز عبور شما با موفقیت تغییر کرد.
                </h2>
                <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mb-5">
                  در حال انتقال به صفحه ورود...
                </p>
                <Link
                  to="/sign-in"
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-button bg-primary text-white text-xs sm:text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  ورود با رمز جدید
                </Link>
              </div>
            ) : token ? (
              isTokenInvalid ? (
                <div className="text-center py-4 space-y-4">
                  <p className="text-xs sm:text-sm text-[var(--color-text-muted)]">
                    برای دریافت لینک جدید بازیابی، روی دکمه زیر کلیک کنید:
                  </p>
                  <Link
                    to="/forgot-password"
                    className="inline-flex items-center justify-center w-full py-2.5 rounded-button bg-primary text-white text-xs sm:text-sm font-semibold hover:opacity-90 transition-opacity shadow-xs"
                  >
                    درخواست لینک بازیابی جدید
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* New Password */}
                  <div>
                    <label
                      htmlFor="new-password"
                      className="block text-xs font-semibold text-[var(--color-text)] mb-1.5"
                    >
                      رمز عبور جدید (حداقل ۸ کاراکتر)
                    </label>
                    <div className="relative flex items-center" dir="ltr">
                      <Lock className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                      <input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        autoComplete="new-password"
                        disabled={isSubmitting}
                        dir="ltr"
                        className="w-full ps-10 pe-10 py-2.5 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start font-mono text-xs sm:text-sm disabled:opacity-50 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1 rounded-md transition-colors"
                        title={showPassword ? "مخفی کردن رمز عبور" : "نمایش رمز عبور"}
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Confirm New Password */}
                  <div>
                    <label
                      htmlFor="confirm-new-password"
                      className="block text-xs font-semibold text-[var(--color-text)] mb-1.5"
                    >
                      تکرار رمز عبور جدید
                    </label>
                    <div className="relative flex items-center" dir="ltr">
                      <Lock className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                      <input
                        id="confirm-new-password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        autoComplete="new-password"
                        disabled={isSubmitting}
                        dir="ltr"
                        className="w-full ps-10 pe-10 py-2.5 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start font-mono text-xs sm:text-sm disabled:opacity-50 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1 rounded-md transition-colors"
                        title={showConfirmPassword ? "مخفی کردن رمز عبور" : "نمایش رمز عبور"}
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSubmitting}
                    className="w-full py-2.5 text-xs sm:text-sm font-semibold rounded-button shadow-xs mt-2"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                        <span>در حال ذخیره رمز جدید...</span>
                      </span>
                    ) : (
                      "تغییر رمز عبور"
                    )}
                  </Button>
                </form>
              )
            ) : null}

            {/* Back link */}
            <div className="mt-6 pt-5 border-t border-[var(--color-border)] text-center">
              <Link
                to="/sign-in"
                className="text-xs sm:text-sm text-primary hover:underline font-medium inline-flex items-center gap-1.5"
              >
                <span>بازگشت به صفحه ورود</span>
              </Link>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
