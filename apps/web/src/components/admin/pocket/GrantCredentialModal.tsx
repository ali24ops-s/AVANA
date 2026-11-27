import React, { useState, useEffect } from "react";
import { Search, UserCheck, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Alert,
  PersianDatePicker,
} from "../../ui/index.js";
import { useAdmin } from "../../../hooks/useAdmin.js";
import { useGrantReviewerCredential } from "../../../hooks/usePocketReviewerCredentials.js";
import type { AdminUserRecord } from "../../../lib/api/admin.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface GrantCredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function GrantCredentialModal({
  isOpen,
  onClose,
  onSuccess,
}: GrantCredentialModalProps) {
  const adminApi = useAdmin();
  const grantMutation = useGrantReviewerCredential();

  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<AdminUserRecord[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null);

  const [userId, setUserId] = useState("");
  const [medicalLicenseNumber, setMedicalLicenseNumber] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [licensingAuthority, setLicensingAuthority] = useState("");
  const [licenseExpiresAt, setLicenseExpiresAt] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValidationError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const term = userSearch.trim();
    if (term.length < 2) {
      setUserResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearchingUsers(true);
      try {
        const res = await adminApi.listUsers(1, 10, term);
        if (!cancelled) {
          setUserResults(res.users ?? []);
        }
      } catch {
        if (!cancelled) {
          setUserResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearchingUsers(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userSearch, isOpen, adminApi]);

  const resetForm = () => {
    setUserSearch("");
    setUserResults([]);
    setSelectedUser(null);
    setUserId("");
    setMedicalLicenseNumber("");
    setSpecialty("");
    setLicensingAuthority("");
    setLicenseExpiresAt("");
    setValidationError(null);
    grantMutation.reset();
  };

  const handleClose = () => {
    if (grantMutation.isPending) return;
    resetForm();
    onClose();
  };

  const handleSelectUser = (user: AdminUserRecord) => {
    setSelectedUser(user);
    setUserId(user.id);
    setUserResults([]);
    setUserSearch("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedUserId = userId.trim();
    const trimmedLicense = medicalLicenseNumber.trim();
    const trimmedSpecialty = specialty.trim();
    const trimmedAuthority = licensingAuthority.trim();

    if (!trimmedUserId || !UUID_REGEX.test(trimmedUserId)) {
      setValidationError("شناسه کاربر (UUID) معتبر الزامی است.");
      return;
    }
    if (!trimmedLicense) {
      setValidationError("شماره پروانه / نظام پزشکی الزامی است.");
      return;
    }
    if (!trimmedSpecialty) {
      setValidationError("تخصص بالینی الزامی است.");
      return;
    }
    if (!trimmedAuthority) {
      setValidationError("مرجع صادرکننده مجوز الزامی است.");
      return;
    }
    if (!licenseExpiresAt) {
      setValidationError("تاریخ انقضای اعتبارنامه الزامی است.");
      return;
    }
    const expiryDate = new Date(licenseExpiresAt);
    if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
      setValidationError("تاریخ انقضای اعتبارنامه باید در آینده باشد.");
      return;
    }

    try {
      await grantMutation.mutateAsync({
        userId: trimmedUserId,
        medicalLicenseNumber: trimmedLicense,
        specialty: trimmedSpecialty,
        licensingAuthority: trimmedAuthority,
        licenseExpiresAt: expiryDate.toISOString(),
      });
      resetForm();
      onSuccess?.();
      onClose();
    } catch {
      // Error surfaced via grantMutation.error
    }
  };

  const apiError =
    grantMutation.error instanceof Error
      ? grantMutation.error.message
      : grantMutation.isError
        ? "خطا در اعطای اعتبارنامه داور بالینی"
        : null;

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} maxWidth="lg">
      <DialogHeader onClose={handleClose}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              اعطای اعتبارنامه داور بالینی
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              اختصاص مجوز رسمی داوری علمی AVANA Pocket به کاربر تأییدشده
            </p>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <DialogContent className="space-y-4">
          {(validationError || apiError) && (
            <Alert variant="error" title="خطا">
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{validationError || apiError}</span>
              </div>
            </Alert>
          )}

          {/* User Search & Selection */}
          <div className="space-y-2">
            <label className="block text-xs sm:text-sm font-bold text-[var(--color-text)]">
              جستجو و انتخاب کاربر
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="جستجوی نام یا ایمیل کاربر (حداقل ۲ کاراکتر)..."
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl ps-9 pe-4 py-2 text-xs sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
              />
            </div>

            {isSearchingUsers && (
              <p className="text-xs text-[var(--color-text-muted)]">در حال جستجوی کاربران...</p>
            )}

            {userResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto border border-[var(--color-border)] rounded-xl bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
                {userResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUser(u)}
                    className="w-full text-right px-3 py-2 hover:bg-[var(--color-surface-warm)] transition-colors flex items-center justify-between gap-2 text-xs cursor-pointer"
                  >
                    <span className="font-bold text-[var(--color-text)] truncate">
                      {u.name || u.email}
                    </span>
                    <span className="text-[var(--color-text-muted)] font-mono text-[11px] truncate">
                      {u.email}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selectedUser && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs">
                <span className="font-medium text-[var(--color-text)]">
                  کاربر انتخاب‌شده: <strong>{selectedUser.name || selectedUser.email}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setUserId("");
                  }}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] underline cursor-pointer"
                >
                  تغییر
                </button>
              </div>
            )}

            <div>
              <label
                htmlFor="grant-cred-user-id"
                className="block text-xs font-medium text-[var(--color-text-muted)] mb-1"
              >
                شناسه کاربر (UUID) *
              </label>
              <input
                id="grant-cred-user-id"
                type="text"
                dir="ltr"
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value);
                  if (selectedUser && e.target.value !== selectedUser.id) {
                    setSelectedUser(null);
                  }
                }}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2 text-xs sm:text-sm font-mono text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="grant-cred-license"
                className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
              >
                شماره نظام پزشکی / مجوز *
              </label>
              <input
                id="grant-cred-license"
                type="text"
                dir="ltr"
                value={medicalLicenseNumber}
                onChange={(e) => setMedicalLicenseNumber(e.target.value)}
                placeholder="مثال: IR-MC-123456"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                required
              />
            </div>

            <div>
              <label
                htmlFor="grant-cred-specialty"
                className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
              >
                تخصص بالینی *
              </label>
              <input
                id="grant-cred-specialty"
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="مثال: داروسازی بالینی / طب اورژانس"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="grant-cred-authority"
                className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
              >
                مرجع صادرکننده مجوز *
              </label>
              <input
                id="grant-cred-authority"
                type="text"
                value={licensingAuthority}
                onChange={(e) => setLicensingAuthority(e.target.value)}
                placeholder="مثال: سازمان نظام پزشکی"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                required
              />
            </div>

            <div>
              <PersianDatePicker
                id="grant-cred-expires"
                label="تاریخ انقضای اعتبارنامه *"
                value={licenseExpiresAt}
                onChange={setLicenseExpiresAt}
                minDate={new Date(Date.now() + 86_400_000)}
                required
                placeholder="انتخاب تاریخ انقضا..."
              />
            </div>
          </div>
        </DialogContent>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={grantMutation.isPending}
          >
            انصراف
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={grantMutation.isPending}
            disabled={grantMutation.isPending}
          >
            اعطای اعتبارنامه
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
