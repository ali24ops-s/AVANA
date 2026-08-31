/**
 * Registration page.
 *
 * Public route — accessible to unauthenticated users.
 * On successful registration, creates account & session, then redirects to /home.
 */

import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Mail, Lock, User, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";
import { ApiError } from "../../lib/api/errors.js";
import { isAuthEnabled } from "../../config/authConfig.js";

export function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signUp, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // If already authenticated or auth is disabled in public/demo mode, redirect to home
  if (!isAuthEnabled() || isAuthenticated) {
    navigate("/home", { replace: true });
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("لطفاً یک نشانی ایمیل معتبر وارد نمایید.");
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
      await signUp(trimmedEmail, password, name.trim() || undefined);
      navigate("/home", { replace: true });
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
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex flex-col font-sans" dir="rtl">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-white/10 glass-panel">
        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 rounded-xl bg-teal-600/30 border border-teal-500/30 flex items-center justify-center shadow-sm text-teal-400">
            <Sparkles className="w-5 h-5 text-teal-400" />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-teal-400">آوانا</span>
        </Link>
        <span className="text-xs font-medium text-slate-400">
          سامانه هوشمند آموزش و یادگیری
        </span>
      </header>

      {/* Register form */}
      <div className="flex-1 flex items-center justify-center p-6 my-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="glass-panel rounded-xl card-inner-border p-8 sm:p-10 shadow-ambient-lg">
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-2xl bg-teal-900/40 border border-teal-500/30 text-teal-400 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold text-white">
                ثبت‌نام در آوانا
              </h1>
              <p className="text-slate-400 mt-2 text-sm">
                برای ایجاد حساب جدید، اطلاعات زیر را تکمیل نمایید.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs font-medium leading-relaxed">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-xs font-semibold text-slate-300 mb-1.5"
                >
                  نام و نام خانوادگی (اختیاری)
                </label>
                <div className="relative">
                  <User className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="علی محمدی"
                    disabled={isSubmitting}
                    className="w-full pr-11 pl-4 py-3 rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-right text-sm disabled:opacity-50 transition-all"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold text-slate-300 mb-1.5"
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
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-slate-300 mb-1.5"
                >
                  رمز عبور (حداقل ۸ کاراکتر)
                </label>
                <div className="relative">
                  <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
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

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs font-semibold text-slate-300 mb-1.5"
                >
                  تکرار رمز عبور
                </label>
                <div className="relative">
                  <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
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
                    className="w-full pr-11 pl-11 py-3 rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-left font-mono text-sm disabled:opacity-50 transition-all"
                  />
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={
                  isSubmitting ||
                  !email.trim() ||
                  !password ||
                  !confirmPassword
                }
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-500 transition-all shadow-lg shadow-teal-900/50 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>در حال ایجاد حساب...</span>
                  </>
                ) : (
                  <>
                    <span>ثبت‌نام</span>
                    <ArrowLeft className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </form>

            <div className="mt-6 pt-6 border-t border-white/10 text-center">
              <span className="text-xs text-slate-400">
                قبلاً حساب کاربری داشته‌اید؟{" "}
              </span>
              <Link
                to="/login"
                className="text-xs font-bold text-teal-400 hover:text-teal-300 transition-colors"
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
