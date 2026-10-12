/**
 * Privacy & Analytics Consent Banner Component for AVANA.
 *
 * Implements Strict Opt-in consent:
 * - Displayed ONLY when consent status is 'pending' (no prior decision or expired).
 * - Text strictly reflects Avana educational platform policy.
 * - Allows explicit acceptance ('granted') or explicit rejection ('denied').
 * - "More Settings" (تنظیمات بیشتر) opens an accessible category dialog.
 * - Supports reopening settings at any time via avana:open-privacy-settings event.
 */

import React, { useState, useEffect } from "react";
import {
  getConsentStatus,
  setConsent,
  CONSENT_CHANGE_EVENT,
  OPEN_PRIVACY_SETTINGS_EVENT,
  type ConsentStatus,
} from "./consent.js";
import {
  Button,
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Switch,
  Badge,
} from "@avana/ui";
import { ShieldCheck, BarChart3, Settings2 } from "lucide-react";

export const CookieConsentBanner: React.FC = () => {
  const [status, setStatus] = useState<ConsentStatus | "loading">("loading");
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [analyticsToggle, setAnalyticsToggle] = useState<boolean>(false);

  useEffect(() => {
    const current = getConsentStatus();
    setStatus(current);
    setAnalyticsToggle(current === "granted");

    const handleConsentChange = (event: Event) => {
      const detail = (event as CustomEvent<{ status: ConsentStatus }>).detail;
      if (detail?.status) {
        setStatus(detail.status);
        setAnalyticsToggle(detail.status === "granted");
      }
    };

    const handleOpenSettings = () => {
      const latestStatus = getConsentStatus();
      setAnalyticsToggle(latestStatus === "granted");
      setIsSettingsOpen(true);
    };

    window.addEventListener(CONSENT_CHANGE_EVENT, handleConsentChange);
    window.addEventListener(OPEN_PRIVACY_SETTINGS_EVENT, handleOpenSettings);
    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, handleConsentChange);
      window.removeEventListener(OPEN_PRIVACY_SETTINGS_EVENT, handleOpenSettings);
    };
  }, []);

  const handleAcceptAll = () => {
    setConsent("granted");
    setIsSettingsOpen(false);
  };

  const handleDeclineAll = () => {
    setConsent("denied");
    setIsSettingsOpen(false);
  };

  const handleSaveCustomPreferences = () => {
    if (analyticsToggle) {
      setConsent("granted");
    } else {
      setConsent("denied");
    }
    setIsSettingsOpen(false);
  };

  const showBanner = status === "pending";

  return (
    <>
      {showBanner && (
        <aside
          role="region"
          aria-label="تنظیمات حریم خصوصی و رضایت تحلیل‌ها"
          className="fixed bottom-0 inset-x-0 z-50 p-4 md:p-6 bg-[var(--color-surface)] border-t border-[var(--color-border)] shadow-2xl transition-all duration-300 ease-in-out text-[var(--color-text)] font-sans"
          dir="rtl"
        >
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 space-y-1">
              <h2 className="text-sm md:text-base font-semibold text-[var(--color-text)]">
                حریم خصوصی و تحلیل عملکرد
              </h2>
              <p className="text-xs md:text-sm text-[var(--color-text-muted)] leading-relaxed">
                برای بهبود تجربه یادگیری و بررسی ترافیک صفحات، از ابزارهای آماری و
                تحلیلی استفاده می‌کنیم.
              </p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-end">
              <Button
                variant="outline"
                size="md"
                onClick={handleDeclineAll}
                className="flex-1 sm:flex-initial px-4"
              >
                رد
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleAcceptAll}
                className="flex-1 sm:flex-initial px-5"
              >
                پذیرش تحلیل‌ها
              </Button>
            </div>
          </div>
        </aside>
      )}

      {/* Privacy Preferences Dialog Modal */}
      <Dialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        maxWidth="lg"
        usePortal={true}
        ariaLabel="تنظیمات حریم خصوصی و تحلیل عملکرد"
      >
        <DialogHeader
          onClose={() => setIsSettingsOpen(false)}
          className="border-b border-[var(--color-border)]"
        >
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-[#008080]" />
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              تنظیمات حریم خصوصی و تحلیل عملکرد
            </h2>
          </div>
        </DialogHeader>

        <DialogContent className="p-5 sm:p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
            شما می‌توانید نحوه پردازش داده‌ها و ابزارهای تحلیلی را متناسب با
            ترجیحات خود تعیین کنید. انتخاب شما هیچ تأثیری بر دسترسی به دوره‌ها،
            آزمون‌ها، حساب کاربری یا فرآیند خرید نخواهد داشت.
          </p>

          <div className="space-y-4">
            {/* Category A: Essential Features (Strictly Locked / Always Active) */}
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm,#f8fafc)] dark:bg-slate-900/50 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#008080]" />
                  <h3 className="text-sm font-bold text-[var(--color-text)]">
                    کوکی‌ها و عملکردهای ضروری
                  </h3>
                </div>
                <Badge variant="neutral" size="sm">
                  همیشه فعال
                </Badge>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                این ابزارها برای عملکرد اساسی سامانه نظیر حفظ ورود به حساب
                کاربری، امنیت نشست، پایداری فرآیند خرید و ثبت ترجیحات حریم
                خصوصی شما ضروری هستند و غیرفعال‌سازی آن‌ها امکان‌پذیر نیست.
              </p>
              <div className="pt-2 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                <span>وضعیت عملکرد: فعال و غیرقابل تغییر</span>
                <Switch
                  checked={true}
                  disabled={true}
                  onChange={() => {}}
                />
              </div>
            </div>

            {/* Category B: Performance & Statistical Analytics (Strictly Opt-in) */}
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <h3 className="text-sm font-bold text-[var(--color-text)]">
                    ابزارهای آماری و تحلیل عملکرد
                  </h3>
                </div>
                <Badge
                  variant={analyticsToggle ? "success" : "neutral"}
                  size="sm"
                >
                  {analyticsToggle ? "مجاز" : "غیرفعال"}
                </Badge>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                استفاده از Google Analytics 4 و Google Tag Manager جهت
                اندازه‌گیری بازدید صفحات و بررسی الگوهای استفاده از پلتفرم برای
                بهبود تجربه یادگیری. این ابزارها تنها در صورت تأیید صریح شما فعال
                می‌شوند و داده‌های حساس مانند رمز عبور، محتوای جزوه‌ها، متن
                سؤالات، پاسخ‌های دانشجویان یا جزئیات پرداخت به آنها ارسال
                نمی‌شود.
              </p>
              <div className="pt-2 flex items-center justify-between text-xs font-medium text-[var(--color-text)]">
                <Switch
                  label="مجوز فعال‌سازی تحلیل‌های آماری"
                  checked={analyticsToggle}
                  onChange={setAnalyticsToggle}
                />
              </div>
            </div>
          </div>
        </DialogContent>

        <DialogFooter className="p-4 sm:p-5 border-t border-[var(--color-border)] flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDeclineAll}
              className="flex-1 sm:flex-initial px-3.5 py-2 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover,#f1f5f9)] hover:text-[var(--color-text)] transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 cursor-pointer"
            >
              رد تحلیل‌های غیرضروری
            </button>
            <button
              type="button"
              onClick={handleAcceptAll}
              className="flex-1 sm:flex-initial px-3.5 py-2 text-xs font-medium rounded-lg border border-[#008080]/30 text-[#008080] hover:bg-[#008080]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
            >
              پذیرش همه
            </button>
          </div>
          <button
            type="button"
            onClick={handleSaveCustomPreferences}
            className="w-full sm:w-auto px-5 py-2 text-xs font-semibold rounded-lg bg-[var(--color-primary,#008080)] hover:bg-[var(--color-primary-hover,#006666)] text-white shadow-sm hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
          >
            ذخیره تنظیمات
          </button>
        </DialogFooter>
      </Dialog>
    </>
  );
};
