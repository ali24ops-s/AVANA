import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Mail,
  Phone,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  LogOut,
  CheckCircle2,
} from "lucide-react";
import { BrandLogo } from "../brand/BrandLogo.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { ApiError } from "../../lib/api/errors.js";
import type { VerificationChannel } from "@avana/contracts";

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
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex flex-col font-sans" dir="rtl">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-white/10 glass-panel">
        <BrandLogo linkTo="/" variant="logo-only" size="md" />
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>خروج</span>
        </button>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="glass-panel rounded-xl card-inner-border p-8 sm:p-10 shadow-ambient-lg">
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

            {step === "select_channel" ? (
              /* Step 1: Channel Selection */
              <div>
                <div className="text-center mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-teal-900/40 border border-teal-500/30 text-teal-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-950/50">
                    <ShieldCheck className="w-7 h-7" />
                  </div>
                  <h1 className="text-2xl font-bold text-white">تأیید حساب کاربری</h1>
                  <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                    کد تأیید را چگونه دریافت می‌کنید؟
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  {/* Option: Email */}
                  <button
                    type="button"
                    onClick={() => setChannel("email")}
                    className={`w-full p-4 rounded-xl border text-right transition-all flex items-center justify-between ${
                      channel === "email"
                        ? "bg-teal-950/50 border-teal-500/80 shadow-md shadow-teal-950/40"
                        : "bg-slate-900/50 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          channel === "email"
                            ? "bg-teal-500/20 text-teal-300"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        <Mail className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">تأیید با ایمیل</div>
                        <div className="text-xs text-slate-400 font-mono" dir="ltr">
                          {maskEmail(user?.email)}
                        </div>
                      </div>
                    </div>
                    {channel === "email" && (
                      <CheckCircle2 className="w-5 h-5 text-teal-400" />
                    )}
                  </button>

                  {/* Option: SMS Phone */}
                  <button
                    type="button"
                    disabled={!hasPhone}
                    onClick={() => setChannel("phone")}
                    className={`w-full p-4 rounded-xl border text-right transition-all flex items-center justify-between ${
                      !hasPhone
                        ? "opacity-50 cursor-not-allowed bg-slate-900/30 border-white/5"
                        : channel === "phone"
                          ? "bg-teal-950/50 border-teal-500/80 shadow-md shadow-teal-950/40"
                          : "bg-slate-900/50 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          channel === "phone"
                            ? "bg-teal-500/20 text-teal-300"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        <Phone className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">
                          تأیید با پیامک
                        </div>
                        <div className="text-xs text-slate-400 font-mono" dir="ltr">
                          {hasPhone ? maskPhone(user?.phoneNumber) : "شماره‌ای ثبت نشده است"}
                        </div>
                      </div>
                    </div>
                    {channel === "phone" && (
                      <CheckCircle2 className="w-5 h-5 text-teal-400" />
                    )}
                  </button>
                </div>

                <motion.button
                  type="button"
                  onClick={() => void handleSendCode(channel)}
                  disabled={isSendingCode || (channel === "phone" && !hasPhone)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-500 transition-all shadow-lg shadow-teal-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSendingCode ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>در حال ارسال کد...</span>
                    </>
                  ) : (
                    <>
                      <span>ارسال کد تأیید و ادامه</span>
                      <ArrowLeft className="w-4 h-4" />
                    </>
                  )}
                </motion.button>
              </div>
            ) : (
              /* Step 2: Enter 6-digit OTP */
              <div>
                <div className="text-center mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-teal-900/40 border border-teal-500/30 text-teal-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-950/50">
                    {channel === "phone" ? (
                      <Phone className="w-7 h-7" />
                    ) : (
                      <Mail className="w-7 h-7" />
                    )}
                  </div>
                  <h1 className="text-2xl font-bold text-white">کد تأیید را وارد کنید</h1>
                  <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                    کد ۶ رقمی ارسال‌شده به{" "}
                    <span className="font-mono text-teal-300 font-semibold dir-ltr inline-block">
                      {channel === "phone" ? maskPhone(user?.phoneNumber) : maskEmail(user?.email)}
                    </span>{" "}
                    را وارد نمایید.
                  </p>
                </div>

                <form onSubmit={handleVerify} className="space-y-6">
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
                        <span>تأیید و ادامه</span>
                        <ArrowLeft className="w-4 h-4" />
                      </>
                    )}
                  </motion.button>
                </form>

                <div className="mt-8 pt-6 border-t border-white/10 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleResend()}
                    disabled={cooldown > 0 || isSendingCode}
                    className="flex items-center gap-2 text-xs font-semibold text-teal-400 hover:text-teal-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
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
                    className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
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
