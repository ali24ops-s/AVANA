import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, MailCheck, ShieldCheck, ArrowLeft, RefreshCw, LogOut } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";
import { ApiError } from "../../lib/api/errors.js";

function maskEmail(email?: string): string {
  if (!email || !email.includes("@")) return "ایمیل شما";
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export function EmailVerificationPage() {
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const { user, verifyEmail, resendVerification, isAuthenticated, isEmailVerified, signOut } = useAuth();
  const navigate = useNavigate();

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // If email is already verified, redirect to home
  useEffect(() => {
    if (isAuthenticated && isEmailVerified) {
      navigate("/home", { replace: true });
    }
  }, [isAuthenticated, isEmailVerified, navigate]);

  if (!isAuthenticated) {
    navigate("/sign-in", { replace: true });
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanCode = code.trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setError("لطفاً کد ۶ رقمی را بهدرستی وارد نمایید.");
      return;
    }

    setIsSubmitting(true);
    try {
      await verifyEmail(cleanCode);
      setSuccessMessage("ایمیل شما با موفقیت تأیید شد!");
      setTimeout(() => {
        navigate("/home", { replace: true });
      }, 1000);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("تأیید کد با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || isResending) return;

    setError(null);
    setSuccessMessage(null);
    setIsResending(true);

    try {
      await resendVerification(user?.email);
      setSuccessMessage("کد تأیید جدید به ایمیل شما ارسال شد.");
      setCooldown(60);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("ارسال مجدد کد با خطا مواجه شد.");
      }
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex flex-col font-sans" dir="rtl">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-white/10 glass-panel">
        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 rounded-xl bg-teal-600/30 border border-teal-500/30 flex items-center justify-center shadow-sm text-teal-400">
            <Sparkles className="w-5 h-5 text-teal-400" />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-teal-400">آوانا</span>
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>خروج</span>
        </button>
      </header>

      {/* Form Container */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="glass-panel rounded-xl card-inner-border p-8 sm:p-10 shadow-ambient-lg">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-teal-900/40 border border-teal-500/30 text-teal-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-950/50">
                <MailCheck className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-bold text-white">
                ایمیلت را تأیید کن
              </h1>
              <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                کد تأیید ۶ رقمی به ایمیل{" "}
                <span className="font-mono text-teal-300 font-semibold dir-ltr inline-block">
                  {maskEmail(user?.email)}
                </span>{" "}
                ارسال شد.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs font-medium leading-relaxed">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="mb-6 p-3.5 rounded-xl bg-teal-950/40 border border-teal-500/30 text-teal-300 text-xs font-medium leading-relaxed flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="verification-code"
                  className="block text-xs font-semibold text-slate-300 mb-2 text-center"
                >
                  کد تأیید ۶ رقمی
                </label>
                <input
                  id="verification-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  required
                  autoFocus
                  disabled={isSubmitting}
                  dir="ltr"
                  className="w-full tracking-[0.5em] text-center text-2xl font-mono font-bold py-3.5 px-4 rounded-xl border border-white/10 bg-slate-900/80 text-teal-300 placeholder:text-slate-600 placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50 transition-all"
                />
              </div>

              <motion.button
                type="submit"
                disabled={isSubmitting || code.trim().length !== 6}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-500 transition-all shadow-lg shadow-teal-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>در حال بررسی...</span>
                  </>
                ) : (
                  <>
                    <span>تأیید ایمیل</span>
                    <ArrowLeft className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </form>

            <div className="mt-8 pt-6 border-t border-white/10 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={cooldown > 0 || isResending}
                className="flex items-center gap-2 text-xs font-semibold text-teal-400 hover:text-teal-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResending ? "animate-spin" : ""}`} />
                <span>
                  {cooldown > 0
                    ? `ارسال مجدد تا ${cooldown} ثانیه دیگر`
                    : "کد را دریافت نکردی؟ ارسال مجدد"}
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
