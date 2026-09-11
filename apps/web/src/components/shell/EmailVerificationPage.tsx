import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Mail,
  Phone,
  ShieldCheck,
  RefreshCw,
  LogOut,
  CheckCircle2,
} from "lucide-react";
import { BrandLogo } from "../brand/BrandLogo.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { ApiError } from "../../lib/api/errors.js";
import type { VerificationChannel } from "@avana/contracts";
import { Button } from "@avana/ui";

function maskEmail(email?: string): string {
  if (!email || !email.includes("@")) return "ایمیل شما";
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function maskPhone(phone?: string | null): string {
  if (!phone) return "شماره موبایل ثبت‌نشده";
  const clean = phone.trim();
  if (clean.length >= 11) {
    return `${clean.slice(0, 4)} *** ${clean.slice(-4)}`;
  }
  return clean;
}

export function EmailVerificationPage() {
  const [channel, setChannel] = useState<VerificationChannel>("email");
  const [step, setStep] = useState<"select_channel" | "enter_code">("select_channel");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const {
    user,
    sendVerification,
    verifyChannel,
    isAuthenticated,
    isEmailVerified,
    isPhoneVerified,
    isVerified,
    signOut,
  } = useAuth();
  const navigate = useNavigate();

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // If user is already verified (either email or phone), redirect to home
  useEffect(() => {
    if (isAuthenticated && (isVerified || isEmailVerified || isPhoneVerified)) {
      navigate("/home", { replace: true });
    }
  }, [isAuthenticated, isVerified, isEmailVerified, isPhoneVerified, navigate]);

  if (!isAuthenticated) {
    navigate("/sign-in", { replace: true });
    return null;
  }

  const hasPhone = Boolean(user?.phoneNumber);

  async function handleSendCode(chosenChannel: VerificationChannel) {
    setError(null);
    setSuccessMessage(null);
    setIsSendingCode(true);

    try {
      await sendVerification(chosenChannel);
      setChannel(chosenChannel);
      setStep("enter_code");
      setCooldown(60);
      setSuccessMessage(
        chosenChannel === "phone"
          ? "کد تأیید ۶ رقمی به شماره موبایل شما ارسال شد."
          : "کد تأیید ۶ رقمی به ایمیل شما ارسال شد.",
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("ارسال کد با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
      }
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanCode = code.trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setError("لطفاً کد ۶ رقمی را به‌درستی وارد نمایید.");
      return;
    }

    setIsSubmitting(true);
    try {
      await verifyChannel(channel, cleanCode);
      setSuccessMessage(
        channel === "phone"
          ? "شماره موبایل شما با موفقیت تأیید شد!"
          : "ایمیل شما با موفقیت تأیید شد!",
      );
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
    if (cooldown > 0 || isSendingCode) return;
    await handleSendCode(channel);
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] flex flex-col font-sans" dir="rtl">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
        <BrandLogo linkTo="/" variant="logo-only" size="md" />
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>خروج</span>
        </button>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <div className="bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] p-6 sm:p-8 shadow-card">
            {error && (
              <div className="mb-6 p-3.5 rounded-card bg-[var(--avana-error-bg)] border border-[var(--avana-error-border)] text-[var(--avana-error)] text-xs font-medium leading-relaxed">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="mb-6 p-3.5 rounded-card bg-[var(--avana-accent-soft)] border border-primary/20 text-primary text-xs font-medium leading-relaxed flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {step === "select_channel" ? (
              /* Step 1: Channel Selection */
              <div>
                <div className="text-center mb-6">
                  <div className="w-12 h-12 rounded-card bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-primary flex items-center justify-center mx-auto mb-4 shadow-xs">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">تأیید حساب کاربری</h1>
                  <p className="text-[var(--color-text-muted)] mt-1.5 text-xs sm:text-sm leading-relaxed">
                    کد تأیید را چگونه دریافت می‌کنید؟
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  {/* Option: Email */}
                  <button
                    type="button"
                    onClick={() => setChannel("email")}
                    className={`w-full p-4 rounded-card border text-start transition-all flex items-center justify-between cursor-pointer ${
                      channel === "email"
                        ? "bg-[var(--avana-accent-soft)] border-primary shadow-xs"
                        : "bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-warm)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-card flex items-center justify-center ${
                          channel === "email"
                            ? "bg-primary/10 text-primary"
                            : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]"
                        }`}
                      >
                        <Mail className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[var(--color-text)]">تأیید با ایمیل</div>
                        <div className="text-xs text-[var(--color-text-muted)] font-mono" dir="ltr">
                          {maskEmail(user?.email)}
                        </div>
                      </div>
                    </div>
                    {channel === "email" && (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    )}
                  </button>

                  {/* Option: SMS Phone */}
                  <button
                    type="button"
                    disabled={!hasPhone}
                    onClick={() => setChannel("phone")}
                    className={`w-full p-4 rounded-card border text-start transition-all flex items-center justify-between ${
                      !hasPhone
                        ? "opacity-50 cursor-not-allowed bg-[var(--color-surface-warm)] border-[var(--color-border)]"
                        : channel === "phone"
                          ? "bg-[var(--avana-accent-soft)] border-primary shadow-xs cursor-pointer"
                          : "bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-card flex items-center justify-center ${
                          channel === "phone"
                            ? "bg-primary/10 text-primary"
                            : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]"
                        }`}
                      >
                        <Phone className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[var(--color-text)]">
                          تأیید با پیامک
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)] font-mono" dir="ltr">
                          {hasPhone ? maskPhone(user?.phoneNumber) : "شماره‌ای ثبت نشده است"}
                        </div>
                      </div>
                    </div>
                    {channel === "phone" && (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    )}
                  </button>
                </div>

                <div className="pt-2">
                  <Button
                    type="button"
                    onClick={() => void handleSendCode(channel)}
                    disabled={isSendingCode || (channel === "phone" && !hasPhone)}
                    isLoading={isSendingCode}
                    variant="primary"
                    fullWidth
                    size="md"
                  >
                    ارسال کد تأیید و ادامه
                  </Button>
                </div>
              </div>
            ) : (
              /* Step 2: Enter 6-digit OTP */
              <div>
                <div className="text-center mb-6">
                  <div className="w-12 h-12 rounded-card bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-primary flex items-center justify-center mx-auto mb-4 shadow-xs">
                    {channel === "phone" ? (
                      <Phone className="w-6 h-6" />
                    ) : (
                      <Mail className="w-6 h-6" />
                    )}
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">کد تأیید را وارد کنید</h1>
                  <p className="text-[var(--color-text-muted)] mt-1.5 text-xs sm:text-sm leading-relaxed">
                    کد ۶ رقمی ارسال‌شده به{" "}
                    <span className="font-mono text-primary font-semibold dir-ltr inline-block">
                      {channel === "phone" ? maskPhone(user?.phoneNumber) : maskEmail(user?.email)}
                    </span>{" "}
                    را وارد نمایید.
                  </p>
                </div>

                <form onSubmit={handleVerify} className="space-y-4">
                  <div>
                    <label
                      htmlFor="verification-code"
                      className="block text-xs font-semibold text-[var(--color-text)] mb-2 text-center"
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
                      className="w-full tracking-[0.5em] text-center text-2xl font-mono font-bold py-3.5 px-4 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 transition-all"
                    />
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={isSubmitting || code.trim().length !== 6}
                      isLoading={isSubmitting}
                      variant="primary"
                      fullWidth
                      size="md"
                    >
                      تأیید و ادامه
                    </Button>
                  </div>
                </form>

                <div className="mt-8 pt-6 border-t border-[var(--color-border)] flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleResend()}
                    disabled={cooldown > 0 || isSendingCode}
                    className="flex items-center gap-2 text-xs font-semibold text-primary hover:underline disabled:text-[var(--color-text-muted)] disabled:no-underline disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSendingCode ? "animate-spin" : ""}`} />
                    <span>
                      {cooldown > 0
                        ? `ارسال مجدد تا ${cooldown} ثانیه دیگر`
                        : "کد را دریافت نکردید؟ ارسال مجدد"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStep("select_channel");
                      setCode("");
                      setError(null);
                    }}
                    className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
                  >
                    تغییر روش دریافت کد (ایمیل / پیامک)
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
