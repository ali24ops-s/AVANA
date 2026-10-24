/**
 * Sign-in page.
 *
 * Public route — accessible to unauthenticated users.
 * On successful sign-in, redirects to the application shell (/home).
 */

import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Edit3,
} from "lucide-react";
import { BrandLogo } from "../brand/BrandLogo.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { ApiError } from "../../lib/api/errors.js";
import { validateAndNormalizeIranPhone } from "@avana/domain";
import { Button } from "@avana/ui";
import { WORKER_MODE_ENABLED } from "../../config/features.js";
import { getSafeInternalRedirect } from "../../utils/urlSecurity.js";
import { resolveDefaultLandingRoute } from "../../utils/coursePermissions.js";
import { trackLogin } from "../../lib/tracker/index.js";

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
  const [searchParams] = useSearchParams();
  const { user, memberships, signIn, sendPhoneLoginOtp, verifyPhoneLoginOtp, workerAutoLogin, isAuthenticated } = useAuth();
  const redirectParam = searchParams.get("redirect") || searchParams.get("from");
  const defaultLanding = resolveDefaultLandingRoute(user, memberships);
  const safeRedirect = redirectParam ? getSafeInternalRedirect(redirectParam, defaultLanding) : defaultLanding;
  const isTeacherContext = safeRedirect.startsWith("/teacher") || searchParams.get("role") === "teacher";

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
  const [errorGuidance, setErrorGuidance] = useState<{
    type: "phone_not_found" | "email_credentials";
    target: string;
  } | null>(null);

  const navigate = useNavigate();

  async function handleWorkerAutoLogin() {
    setError(null);
    setErrorGuidance(null);
    setIsSubmitting(true);
    try {
      const res = await workerAutoLogin();
      const targetUser = res?.user ?? user;
      const targetMemberships = res?.memberships ?? memberships;
      const targetDefault = resolveDefaultLandingRoute(targetUser, targetMemberships);
      const target = redirectParam ? getSafeInternalRedirect(redirectParam, targetDefault) : targetDefault;
      navigate(target, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("ورود به محیط ورکر با خطا مواجه شد.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // Cooldown countdown timer for OTP resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // If already authenticated, redirect to safeRedirect
  useEffect(() => {
    if (isAuthenticated) {
      navigate(safeRedirect, { replace: true });
    }
  }, [isAuthenticated, navigate, safeRedirect]);

  // Handle Email + Password Sign-in
  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorGuidance(null);

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
      const res = await signIn(trimmedEmail, password);
      trackLogin("password");
      const targetUser = res?.user ?? user;
      const targetMemberships = res?.memberships ?? memberships;
      const targetDefault = resolveDefaultLandingRoute(targetUser, targetMemberships);
      const target = redirectParam ? getSafeInternalRedirect(redirectParam, targetDefault) : targetDefault;
      navigate(target, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        let errorMsg = err.message;
        if (err.message === "Email domain not allowed") {
          errorMsg = "دامنه ایمیل مجاز نیست.";
          setErrorGuidance(null);
        } else if (
          err.message === "A server error occurred. Please try again later." ||
          err.message === "Internal error" ||
          err.code === "internal_error"
        ) {
          errorMsg = "خطایی در ارتباط با سرور رخ داده است. لطفاً بعداً دوباره تلاش کنید.";
          setErrorGuidance(null);
        } else if (
          err.status === 401 ||
          err.code === "unauthorized" ||
          err.message.includes("نادرست است")
        ) {
          // Keep generic message to prevent enumeration, provide helpful non-assertive guidance
          setErrorGuidance({
            type: "email_credentials",
            target: trimmedEmail,
          });
        } else {
          setErrorGuidance(null);
        }
        setError(errorMsg);
      } else {
        setError("ورود به سیستم با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
        setErrorGuidance(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle Phone OTP Request (Step 1)
  async function handleSendPhoneOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorGuidance(null);

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
        if (
          err.status === 404 ||
          err.code === "not_found" ||
          err.message.includes("یافت نشد")
        ) {
          setError(err.message);
          setErrorGuidance({
            type: "phone_not_found",
            target: validation.normalized,
          });
          return;
        }
        setError(err.message);
      } else {
        setError("ارسال کد ورود با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
      }
      setErrorGuidance(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle Phone OTP Verification (Step 2)
  async function handleVerifyPhoneOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorGuidance(null);

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
      const res = await verifyPhoneLoginOtp(validation.normalized, cleanCode);
      trackLogin("otp");
      const targetUser = res?.user ?? user;
      const targetMemberships = res?.memberships ?? memberships;
      const targetDefault = resolveDefaultLandingRoute(targetUser, targetMemberships);
      const target = redirectParam ? getSafeInternalRedirect(redirectParam, targetDefault) : targetDefault;
      navigate(target, { replace: true });
    } catch (err) {
      setErrorGuidance(null);
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
    <div className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] flex flex-col font-sans" dir="rtl">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
        <BrandLogo
          linkTo="/"
          variant="logo-only"
          size="md"
        />
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          سامانه هوشمند آموزش و یادگیری
        </span>
      </header>

      {/* Sign-in form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <div className="bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] p-4 sm:p-8 shadow-card">
            <div className="text-center mb-6">
              <div className="mx-auto mb-4 flex justify-center">
                <BrandLogo variant="logo-only" size="lg" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">
                {isTeacherContext ? "ورود به پنل استاد" : "ورود به آوانا"}
              </h1>
              <p className="text-[var(--color-text-muted)] mt-1.5 text-xs sm:text-sm">
                {isTeacherContext
                  ? "برای دسترسی به پنل مدیریت کلاس‌ها و آزمون‌ها وارد شوید."
                  : "روش موردنظر خود را برای ورود به حساب کاربری انتخاب کنید."}
              </p>
            </div>

            {/* Login Method Selector */}
            <div className="flex rounded-button bg-[var(--color-surface-warm)] p-1 mb-6 border border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => {
                  setMethod("email");
                  setError(null);
                  setErrorGuidance(null);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 py-2 min-h-[42px] rounded-button text-xs font-bold transition-all cursor-pointer ${
                  method === "email"
                    ? "bg-[var(--color-surface)] text-primary shadow-xs border border-[var(--color-border)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                <Mail className="w-4 h-4 shrink-0" />
                <span>ورود با ایمیل</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMethod("phone");
                  setError(null);
                  setErrorGuidance(null);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 py-2 min-h-[42px] rounded-button text-xs font-bold transition-all cursor-pointer ${
                  method === "phone"
                    ? "bg-[var(--color-surface)] text-primary shadow-xs border border-[var(--color-border)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                <Phone className="w-4 h-4 shrink-0" />
                <span>ورود با موبایل</span>
              </button>
            </div>

            {error && (
              <div className="mb-6 space-y-2.5">
                <div className="p-3.5 rounded-card bg-[var(--avana-error-bg)] border border-[var(--avana-error-border)] text-[var(--avana-error)] text-xs font-medium leading-relaxed">
                  {error}
                </div>

                {errorGuidance?.type === "phone_not_found" && (
                  <div className="p-3.5 rounded-card bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    <span className="text-[var(--color-text)] font-medium">
                      اگر هنوز در آوانا حساب ندارید، ابتدا ثبت‌نام کنید.
                    </span>
                    <Link
                      to={
                        isTeacherContext
                          ? `/sign-up?phone=${encodeURIComponent(errorGuidance.target)}&redirect=${encodeURIComponent(safeRedirect)}&role=teacher`
                          : `/register?phone=${encodeURIComponent(errorGuidance.target)}`
                      }
                      className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-button bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors shrink-0 w-full sm:w-auto"
                    >
                      رفتن به ثبت‌نام
                    </Link>
                  </div>
                )}

                {errorGuidance?.type === "email_credentials" && (
                  <div className="p-3.5 rounded-card bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-2.5 text-xs">
                    <div className="text-[var(--color-text-muted)] leading-relaxed">
                      رمز عبور را اشتباه وارد کرده‌اید؟ یا هنوز در آوانا حساب کاربری نساخته‌اید؟
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <Link
                        to={`/forgot-password${errorGuidance.target ? `?email=${encodeURIComponent(errorGuidance.target)}` : ""}`}
                        className="inline-flex items-center justify-center min-h-[40px] px-3.5 py-1.5 rounded-button text-xs font-semibold text-primary bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--avana-accent-soft)] transition-colors"
                      >
                        بازیابی رمز عبور
                      </Link>
                      <Link
                        to={
                          isTeacherContext
                            ? `/sign-up?${errorGuidance.target ? `email=${encodeURIComponent(errorGuidance.target)}&` : ""}redirect=${encodeURIComponent(safeRedirect)}&role=teacher`
                            : `/register${errorGuidance.target ? `?email=${encodeURIComponent(errorGuidance.target)}` : ""}`
                        }
                        className="inline-flex items-center justify-center min-h-[40px] px-3.5 py-1.5 rounded-button text-xs font-semibold text-primary bg-[var(--color-surface)] border border-primary/30 hover:bg-[var(--avana-accent-soft)] transition-colors"
                      >
                        رفتن به ثبت‌نام
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {method === "email" ? (
              /* Method 1: Email + Password */
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs font-semibold text-[var(--color-text)] mb-1.5"
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
                      className="w-full ps-10 pe-4 py-2.5 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start font-mono text-xs sm:text-sm disabled:opacity-50 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="password"
                      className="block text-xs font-semibold text-[var(--color-text)]"
                    >
                      رمز عبور
                    </label>
                    <Link
                      to="/forgot-password"
                      className="text-xs text-primary hover:underline transition-colors font-medium"
                    >
                      رمز عبورتان را فراموش کرده‌اید؟
                    </Link>
                  </div>
                  <div className="relative flex items-center" dir="ltr">
                    <Lock className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
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
                      className="w-full ps-10 pe-10 py-2.5 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start font-mono text-xs sm:text-sm disabled:opacity-50 transition-all"
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

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={isSubmitting || !email.trim() || !password}
                    isLoading={isSubmitting}
                    variant="primary"
                    fullWidth
                    size="md"
                  >
                    ورود به سیستم
                  </Button>
                </div>
              </form>
            ) : phoneStep === "enter_phone" ? (
              /* Method 2 - Step 1: Enter Phone */
              <form onSubmit={handleSendPhoneOtp} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
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
                  <div className="relative">
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
                      className="w-full ps-10 pe-4 py-2.5 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start font-mono text-xs sm:text-sm disabled:opacity-50 transition-all"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={isSubmitting || !phoneNumber.trim()}
                    isLoading={isSubmitting}
                    variant="primary"
                    fullWidth
                    size="md"
                  >
                    دریافت کد ورود
                  </Button>
                </div>
              </form>
            ) : (
              /* Method 2 - Step 2: Enter OTP Code */
              <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
                <div className="text-center p-3 rounded-card bg-[var(--color-surface-warm)] border border-[var(--color-border)] mb-4">
                  <div className="text-xs text-[var(--color-text-muted)] mb-1">
                    کد تأیید ۶ رقمی به شماره زیر پیامک شد:
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-mono text-sm font-bold text-[var(--color-text)]" dir="ltr">
                      {maskPhone(phoneNumber)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPhoneStep("enter_phone");
                        setOtpCode("");
                        setError(null);
                      }}
                      className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      title="ویرایش شماره"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>ویرایش</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="otpCode"
                    className="block text-xs font-semibold text-[var(--color-text)] mb-1.5 text-center"
                  >
                    کد تأیید پیامک‌شده
                  </label>
                  <input
                    id="otpCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="— — — — — —"
                    required
                    autoFocus
                    disabled={isSubmitting}
                    dir="ltr"
                    className="w-full text-center py-3 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary font-mono text-xl tracking-[0.5em] disabled:opacity-50 transition-all font-bold"
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={isSubmitting || otpCode.trim().length !== 6}
                    isLoading={isSubmitting}
                    variant="primary"
                    fullWidth
                    size="md"
                  >
                    ورود به حساب
                  </Button>
                </div>

                <div className="pt-4 border-t border-[var(--color-border)] flex flex-col items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void handleResendOtp()}
                    disabled={cooldown > 0 || isSubmitting}
                    className="flex items-center gap-2 text-xs font-semibold text-primary hover:underline disabled:text-[var(--color-text-muted)] disabled:no-underline disabled:cursor-not-allowed transition-colors cursor-pointer"
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
                    className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>ویرایش شماره موبایل</span>
                  </button>
                </div>
              </form>
            )}

            <div className="mt-8 pt-6 border-t border-[var(--color-border)] space-y-4">
              {WORKER_MODE_ENABLED && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleWorkerAutoLogin}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-primary bg-[var(--color-primary-soft)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] transition-colors cursor-pointer"
                  >
                    <span>⚡ ورود سریع به محیط محلی Worker</span>
                  </button>
                </div>
              )}
              <div className="p-4 rounded-card bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-start">
                <div>
                  <div className="text-xs font-bold text-[var(--color-text)]">
                    حساب کاربری ندارید؟
                  </div>
                  <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                    در کمتر از یک دقیقه در آوانا عضو شوید.
                  </div>
                </div>
                <Link
                  to={
                    isTeacherContext
                      ? `/sign-up?redirect=${encodeURIComponent(safeRedirect)}&role=teacher`
                      : "/register"
                  }
                  className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-button text-xs font-bold text-primary bg-[var(--color-surface)] hover:bg-[var(--avana-accent-soft)] border border-primary/30 hover:border-primary transition-all shadow-xs cursor-pointer w-full sm:w-auto shrink-0"
                >
                  ثبت‌نام کنید
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

