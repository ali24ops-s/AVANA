import { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  X,
  Smartphone,
  Laptop,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Clock,
  Globe,
} from "lucide-react";
import type {
  AdminUserDevicesResponse,
  AdminAuthAttemptRecord,
} from "../../../lib/api/admin.js";
import { formatPersianOf } from "@avana/domain";
import { Tabs } from "@avana/ui";

interface UserDevicesDrawerProps {
  isOpen: boolean;
  userId: string | null;
  onClose: () => void;
}

export function UserDevicesDrawer({
  isOpen,
  userId,
  onClose,
}: UserDevicesDrawerProps) {
  const adminApi = useAdmin();
  const [deviceData, setDeviceData] = useState<AdminUserDevicesResponse | null>(
    null,
  );
  const [attempts, setAttempts] = useState<AdminAuthAttemptRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"devices" | "attempts">("devices");
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchData = async () => {
    if (!userId) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [devicesRes, attemptsRes] = await Promise.all([
        adminApi.getUserDevices(userId),
        adminApi.getUserAuthAttempts(userId),
      ]);
      setDeviceData(devicesRes);
      setAttempts(attemptsRes.attempts || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "خطا در دریافت اطلاعات دستگاه‌های کاربر");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && userId) {
      setSuccessMsg(null);
      setErrorMsg(null);
      fetchData();
    } else {
      setDeviceData(null);
      setAttempts([]);
    }
  }, [isOpen, userId]);

  const handleResetDevices = async () => {
    if (!userId) return;
    const confirm = window.confirm(
      "آیا مطمئن هستید که می‌خواهید همه دستگاه‌های ثبت‌شده و نشست‌های فعال این کاربر را بازنشانی کنید؟ کاربر در ورود بعدی می‌تواند دستگاه جدید ثبت کند.",
    );
    if (!confirm) return;

    setIsResetting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await adminApi.resetUserDevices(userId);
      setSuccessMsg(
        res.message || "دستگاه‌ها و نشست‌های کاربر با موفقیت بازنشانی شدند.",
      );
      await fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "خطا در بازنشانی دستگاه‌های کاربر");
    } finally {
      setIsResetting(false);
    }
  };

  if (!isOpen || !userId) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="fixed inset-y-0 start-0 max-w-full flex ps-10" dir="rtl">
        <div className="w-screen max-w-2xl bg-[var(--color-surface)] border-e border-[var(--color-border)] shadow-2xl flex flex-col">
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] border border-[var(--color-primary-default)]/20">
                <Laptop className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text)]">
                  مدیریت دستگاه‌ها و سشن‌ها
                </h2>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {deviceData?.email || userId}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Info Bar */}
          {deviceData && (
            <div className="px-6 py-3 bg-[var(--color-surface-warm)] border-b border-[var(--color-border)] flex items-center justify-between text-xs">
              <div className="flex items-center gap-4">
                <span className="text-[var(--color-text-muted)]">
                  وضعیت اشتراک:{" "}
                  <span
                    className={`font-semibold px-2 py-0.5 rounded-full ${
                      deviceData.subscriptionStatus === "active"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    {deviceData.subscriptionStatus === "active"
                      ? "فعال (پرمیوم)"
                      : "عادی"}
                  </span>
                </span>
                <span className="text-[var(--color-text-muted)]">
                  دستگاه‌های فعال:{" "}
                  <span className="text-[var(--color-text)] font-medium">
                    {formatPersianOf(
                      deviceData.devices.filter(
                        (d) => d.registrationStatus === "active",
                      ).length,
                      2,
                    )}
                  </span>
                </span>
              </div>
              <button
                onClick={handleResetDevices}
                disabled={isResetting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors disabled:opacity-50 text-xs font-medium cursor-pointer"
              >
                <RotateCcw
                  className={`w-3.5 h-3.5 ${isResetting ? "animate-spin" : ""}`}
                />
                بازنشانی دستگاه‌ها
              </button>
            </div>
          )}

          {/* Messages */}
          {errorMsg && (
            <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="px-6 pt-2">
            <Tabs
              items={[
                {
                  id: "devices",
                  label: "دستگاه‌های ثبت‌شده",
                  icon: <Smartphone className="w-4 h-4" />,
                  badge:
                    deviceData?.devices.filter(
                      (d) => d.registrationStatus === "active",
                    ).length || 0,
                },
                {
                  id: "attempts",
                  label: "تلاش‌های ورود و رویدادها",
                  icon: <ShieldAlert className="w-4 h-4" />,
                  badge: attempts.length,
                },
              ]}
              activeTabId={activeTab}
              onChange={(id) => setActiveTab(id as "devices" | "attempts")}
              variant="underline"
              className="gap-0"
            />
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {isLoading ? (
              <div className="py-16 text-center text-[var(--color-text-muted)] text-sm">
                در حال دریافت اطلاعات...
              </div>
            ) : activeTab === "devices" ? (
              <div className="space-y-4">
                {!deviceData || deviceData.devices.length === 0 ? (
                  <div className="py-12 text-center text-[var(--color-text-muted)] text-sm">
                    هیچ دستگاهی برای این کاربر ثبت نشده است.
                  </div>
                ) : (
                  deviceData.devices.map((device) => (
                    <div
                      key={device.id}
                      className={`p-4 rounded-xl border ${
                        device.registrationStatus === "active"
                          ? "bg-[var(--color-surface)] border-[var(--color-border)] shadow-sm"
                          : "bg-[var(--color-surface-warm)] border-[var(--color-border)] opacity-60"
                      } space-y-3`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-[var(--color-surface-warm)] text-[var(--color-primary-default)]">
                            {device.deviceType === "mobile" ? (
                              <Smartphone className="w-5 h-5" />
                            ) : (
                              <Laptop className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[var(--color-text)] text-sm">
                                {device.deviceName ||
                                  (device.deviceType === "mobile"
                                    ? "دستگاه موبایل"
                                    : "رایانه شخصی")}
                              </span>
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full ${
                                  device.registrationStatus === "active"
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                    : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]"
                                }`}
                              >
                                {device.registrationStatus === "active"
                                  ? "ثبت‌شده"
                                  : "لغو شده"}
                              </span>
                            </div>
                            <p className="text-[11px] text-[var(--color-text-muted)] font-mono mt-0.5">
                              ID: {device.deviceId}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                          <span>اولین ورود:</span>
                          <span className="text-[var(--color-text)]">
                            {new Date(device.firstSeenAt).toLocaleString("fa-IR")}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                          <span>آخرین فعالیت:</span>
                          <span className="text-[var(--color-text)]">
                            {new Date(device.lastSeenAt).toLocaleString("fa-IR")}
                          </span>
                        </div>
                        {device.lastIp && (
                          <div className="flex items-center gap-1.5 col-span-2">
                            <Globe className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                            <span>آخرین IP:</span>
                            <span className="text-[var(--color-text)] font-mono">
                              {device.lastIp}
                            </span>
                          </div>
                        )}
                        {device.userAgent && (
                          <div className="col-span-2 text-[11px] text-[var(--color-text-muted)] truncate">
                            User Agent: {device.userAgent}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {attempts.length === 0 ? (
                  <div className="py-12 text-center text-[var(--color-text-muted)] text-sm">
                    هیچ رویداد یا تلاش ورودی ثبت نشده است.
                  </div>
                ) : (
                  attempts.map((attempt) => (
                    <div
                      key={attempt.id}
                      className="p-3.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                              attempt.result === "SUCCESS"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : attempt.result === "DEVICE_LIMIT_REACHED"
                                ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            {attempt.result === "SUCCESS"
                              ? "ورود موفق"
                              : attempt.result === "DEVICE_LIMIT_REACHED"
                              ? "سقف دستگاه پر است (تلاش مسدود)"
                              : attempt.result}
                          </span>
                          <span className="text-[var(--color-text)] font-medium">
                            {attempt.deviceType === "mobile" ? "موبایل" : "رایانه"}
                          </span>
                        </div>
                        <span className="text-[var(--color-text-muted)] text-[11px]">
                          {new Date(attempt.createdAt).toLocaleString("fa-IR")}
                        </span>
                      </div>

                      {attempt.details && (
                        <p className="text-[var(--color-text)] text-[11px]">
                          {attempt.details}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-[var(--color-text-muted)] text-[11px] font-mono">
                        {attempt.ip && <span>IP: {attempt.ip}</span>}
                        {attempt.deviceId && (
                          <span className="truncate">
                            Device: {attempt.deviceId}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
