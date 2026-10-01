/**
 * Forgot password page.
 *
 * Public route — allows users to request a secure password recovery link
 * sent to their registered email address.
 */

import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { BrandLogo } from "../brand/BrandLogo.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { ApiError } from "../../lib/api/errors.js";
import { Button } from "@avana/ui";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const { forgotPassword, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/home", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting || cooldown > 0) return;

    setError(null);
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("لطفاً نشانی ایمیل خود را وارد کنید.");
      return;
    }

    if (!trimmedEmail.includes("@") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("لطفاً یک نشانی ایمیل معتبر وارد کنید.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await forgotPassword(trimmedEmail);
      setSuccessMessage(
        response.message ||
          "اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی رمز عبور برای شما ارسال می‌شود.",
      );
      setCooldown(response.cooldown_seconds ?? 60);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("ارسال درخواست با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
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
            {/* Title & Description */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-4">
                <Mail className="w-6 h-6" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)] tracking-tight">
                بازیابی رمز عبور
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
                نشانی ایمیل حساب کاربری خود را وارد کنید تا لینک بازیابی رمز عبور برای شما ارسال شود.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs sm:text-sm flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs sm:text-sm flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="leading-relaxed">{successMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-xs font-semibold text-[var(--color-text)] mb-1.5"
                >
                  نشانی ایمیل
                </label>
                <div className="relative flex items-center" dir="ltr">
                  <Mail className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                  <input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    autoComplete="email"
                    disabled={isSubmitting || cooldown > 0}
                    dir="ltr"
                    className="w-full ps-10 pe-3.5 py-2.5 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start font-mono text-xs sm:text-sm disabled:opacity-50 transition-all"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || cooldown > 0}
                className="w-full py-2.5 text-xs sm:text-sm font-semibold rounded-button shadow-xs mt-2"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                    <span>در حال ارسال...</span>
                  </span>
                ) : cooldown > 0 ? (
                  `ارسال مجدد تا (${cooldown} ثانیه)`
                ) : (
                  "ارسال لینک بازیابی"
                )}
              </Button>
            </form>

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
