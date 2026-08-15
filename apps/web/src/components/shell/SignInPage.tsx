/**
 * Sign-in page.
 *
 * Public route — accessible to unauthenticated users.
 * On successful sign-in, redirects to the application shell (/home).
 */

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Mail, ArrowLeft } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";
import { ApiError } from "../../lib/api/errors.js";

export function SignInPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // If already authenticated, redirect to home
  if (isAuthenticated) {
    navigate("/home", { replace: true });
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("لطفاً نشانی ایمیل خود را وارد کنید.");
      return;
    }

    setIsSubmitting(true);
    try {
      await signIn(email.trim());
      navigate("/home", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("ورود به سیستم با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col font-sans" dir="rtl">
      {/* Simple header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#008080] flex items-center justify-center shadow-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-[var(--color-text)]">آوانا</span>
        </div>
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
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
          <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-8 sm:p-10 shadow-md">
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-2xl bg-[#a7d0e6]/25 text-[#008080] flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold text-[var(--color-text)]">
                ورود به حساب کاربری
              </h1>
              <p className="text-[var(--color-text-muted)] mt-2 text-sm">
                برای دسترسی به دوره‌ها و محیط یادگیری، ایمیل خود را وارد نمایید.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs font-medium leading-relaxed">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold text-[var(--color-text)] mb-2"
                >
                  نشانی ایمیل
                </label>
                <div className="relative">
                  <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
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
                    className="w-full pr-11 pl-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#008080] focus:border-transparent text-left font-mono text-sm disabled:opacity-50 transition-all"
                  />
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={isSubmitting || !email.trim()}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-[#008080] text-white rounded-xl font-bold text-sm hover:bg-[#006666] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
          </div>
        </motion.div>
      </div>
    </div>
  );
}
