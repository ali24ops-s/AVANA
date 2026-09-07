/**
 * Sign-in page.
 *
 * Public route — accessible to unauthenticated users.
 * On successful sign-in, redirects to the application shell (/home).
 */

import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  RefreshCw,
  Edit3,
} from "lucide-react";
import { BrandLogo } from "../brand/BrandLogo.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { ApiError } from "../../lib/api/errors.js";
import { validateAndNormalizeIranPhone } from "@avana/domain";

type LoginMethod = "email" | "phone";

function maskPhone(phone?: string | null): string {
  if (!phone) return "";
  const clean = phone.trim();
  if (clean.length >= 11) {
    return `${clean.slice(0, 4)} *** ${clean.slice(-4)}`;
  }
  return clean;
}

export function SignInPage() {
  const [method, setMethod] = useState<LoginMethod>("email");

  // Email form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Phone OTP form state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneStep, setPhoneStep] = useState<"enter_phone" | "enter_otp">("enter_phone");
  const [otpCode, setOtpCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signIn, sendPhoneLoginOtp, verifyPhoneLoginOtp, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Cooldown countdown timer for OTP resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // If already authenticated, redirect to home
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/home", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Handle Email + Password Sign-in
  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("لطفاً نشانی ایمیل خود را وارد کنید.");
      return;
    }

    if (!password) {
      setError("لطفاً رمز عبور خود را وارد کنید.");
      return;
    }

    setIsSubmitting(true);
    try {
      await signIn(trimmedEmail, password);
      navigate("/home", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const errorMsg =
          err.message === "Email domain not allowed"
            ? "دامنه ایمیل مجاز نیست."
            : err.message;
        setError(errorMsg);
      } else {
        setError("ورود به سیستم با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle Phone OTP Request (Step 1)
  async function handleSendPhoneOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedPhone = phoneNumber.trim();
    if (!trimmedPhone) {
      setError("لطفاً شماره موبایل خود را وارد نمایید.");
      return;
    }

    const validation = validateAndNormalizeIranPhone(trimmedPhone);
    if (!validation.valid || !validation.normalized) {
      setError(validation.error || "شماره موبایل معتبر نیست.");
      return;
    }

    setIsSubmitting(true);
    try {
      await sendPhoneLoginOtp(validation.normalized);
      setPhoneStep("enter_otp");
      setCooldown(60);
      setOtpCode("");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("ارسال کد ورود با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle Phone OTP Verification (Step 2)
  async function handleVerifyPhoneOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanCode = otpCode.trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setError("لطفاً کد ۶ رقمی را به‌درستی وارد نمایید.");
      return;
    }

    const validation = validateAndNormalizeIranPhone(phoneNumber);
    if (!validation.valid || !validation.normalized) {
      setError("شماره موبایل معتبر نیست.");
      return;
    }

    setIsSubmitting(true);
    try {
      await verifyPhoneLoginOtp(validation.normalized, cleanCode);
      navigate("/home", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("کد واردشده صحیح نیست یا منقضی شده است.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // Resend OTP handler
  async function handleResendOtp() {
    if (cooldown > 0 || isSubmitting) return;
    setError(null);
    const validation = validateAndNormalizeIranPhone(phoneNumber);
    if (!validation.valid || !validation.normalized) return;

    setIsSubmitting(true);
    try {
      await sendPhoneLoginOtp(validation.normalized);
      setCooldown(60);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex flex-col font-sans" dir="rtl">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-white/10 glass-panel">
        <BrandLogo
          linkTo="/"
          variant="logo-only"
          size="md"
        />
        <span className="text-xs font-medium text-slate-400">
          سامانه هوشمند آموزش و یادگیری
        </span>
      </header>

      {/* Sign-in form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="glass-panel rounded-xl card-inner-border p-8 sm:p-10 shadow-ambient-lg">
            <div className="text-center mb-6">
              <div className="mx-auto mb-4 flex justify-center">
                <BrandLogo variant="logo-only" size="lg" />
              </div>
              <h1 className="text-2xl font-bold text-white">
                ورود به آوانا
              </h1>
              <p className="text-slate-400 mt-2 text-sm">
                روش موردنظر خود را برای ورود به حساب کاربری انتخاب کنید.
              </p>
            </div>

            {/* Login Method Selector */}
            <div className="flex rounded-xl bg-slate-900/80 p-1 mb-6 border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setMethod("email");
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  method === "email"
                    ? "bg-teal-600 text-white shadow-md shadow-teal-950/50"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Mail className="w-4 h-4" />
                <span>ورود با ایمیل</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMethod("phone");
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  method === "phone"
                    ? "bg-teal-600 text-white shadow-md shadow-teal-950/50"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Phone className="w-4 h-4" />
                <span>ورود با شماره موبایل</span>
              </button>
            </div>

            {error && (
              <div className="mb-6 p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs font-medium leading-relaxed">
                {error}
              </div>
            )}

            {method === "email" ? (
              /* Method 1: Email + Password */
              <form onSubmit={handleEmailSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs font-semibold text-slate-300 mb-2"
                  >
                    نشانی ایمیل
                  </label>
                  <div className="relative">
                    <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
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
                      className="w-full pr-11 pl-4 py-3 rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-left font-mono text-sm disabled:opacity-50 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label
                      htmlFor="password"
                      className="block text-xs font-semibold text-slate-300"
                    >
                      رمز عبور
                    </label>
                    <span
                      className="text-xs text-slate-500 cursor-not-allowed"
                      title="بازیابی رمز عبور فعال نیست"
                    >
                      رمز عبور را فراموش کرده‌اید؟
                    </span>
                  </div>
                  <div className="relative">
                    <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      disabled={isSubmitting}
                      dir="ltr"
                      className="w-full pr-11 pl-11 py-3 rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-left font-mono text-sm disabled:opacity-50 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
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

                <motion.button
                  type="submit"
                  disabled={isSubmitting || !email.trim() || !password}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-500 transition-all shadow-lg shadow-teal-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>در حال ورود...</span>
                    </>
                  ) : (
                    <>
                      <span>ورود به حساب</span>
                      <ArrowLeft className="w-4 h-4" />
                    </>
                  )}
                </motion.button>
              </form>
            ) : (
              /* Method 2: Phone + SMS OTP */
              <div>
                {phoneStep === "enter_phone" ? (
                  /* Step 1: Input Phone Number */
                  <form onSubmit={handleSendPhoneOtp} className="space-y-5">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label
                          htmlFor="phoneNumber"
                          className="block text-xs font-semibold text-slate-300"
                        >
                          شماره موبایل
                        </label>
                        <span className="text-[11px] text-slate-500 font-mono" dir="ltr">
                          مثال: 09123456789
                        </span>
                      </div>
                      <div className="relative">
                        <Phone className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
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
                          className="w-full pr-11 pl-4 py-3 rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-left font-mono text-sm disabled:opacity-50 transition-all"
                        />
                      </div>
                    </div>

                    <motion.button
                      type="submit"
                      disabled={isSubmitting || !phoneNumber.trim()}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-500 transition-all shadow-lg shadow-teal-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>در حال ارسال کد...</span>
                        </>
                      ) : (
                        <>
                          <span>دریافت کد ورود</span>
                          <ArrowLeft className="w-4 h-4" />
                        </>
                      )}
                    </motion.button>
                  </form>
                ) : (
                  /* Step 2: Input 6-Digit OTP */
                  <form onSubmit={handleVerifyPhoneOtp} className="space-y-5">
                    <div className="text-center mb-4">
                      <p className="text-slate-400 text-xs leading-relaxed">
                        کد ۶ رقمی ارسال‌شده به شماره{" "}
                        <span className="font-mono text-teal-300 font-semibold dir-ltr inline-block">
                          {maskPhone(phoneNumber)}
                        </span>{" "}
                        را وارد نمایید.
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="login-otp-code"
                        className="block text-xs font-semibold text-slate-300 mb-2 text-center"
                      >
                        کد تأیید ۶ رقمی
                      </label>
                      <input
                        id="login-otp-code"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) =>
                          setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        placeholder="123456"
                        required
                        autoFocus
                        disabled={isSubmitting}
                        dir="ltr"
                        className="w-full tracking-[0.5em] text-center text-2xl font-mono font-bold py-3 px-4 rounded-xl border border-white/10 bg-slate-900/80 text-teal-300 placeholder:text-slate-600 placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50 transition-all"
                      />
                    </div>

                    <motion.button
                      type="submit"
                      disabled={isSubmitting || otpCode.trim().length !== 6}
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
                          <span>ورود به حساب</span>
                          <ArrowLeft className="w-4 h-4" />
                        </>
                      )}
                    </motion.button>

                    <div className="pt-4 border-t border-white/10 flex flex-col items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => void handleResendOtp()}
                        disabled={cooldown > 0 || isSubmitting}
                        className="flex items-center gap-2 text-xs font-semibold text-teal-400 hover:text-teal-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isSubmitting ? "animate-spin" : ""}`}
                        />
                        <span>
                          {cooldown > 0
                            ? `ارسال مجدد تا ${cooldown} ثانیه دیگر`
                            : "ارسال مجدد کد ورود"}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPhoneStep("enter_phone");
                          setOtpCode("");
                          setError(null);
                        }}
                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>ویرایش شماره موبایل</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-white/10 text-center">
              <span className="text-xs text-slate-400">
                حساب کاربری ندارید؟{" "}
              </span>
              <Link
                to="/register"
                className="text-xs font-bold text-teal-400 hover:text-teal-300 transition-colors"
              >
                ثبت‌نام کنید
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

