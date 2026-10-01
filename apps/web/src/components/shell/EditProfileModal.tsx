/**
 * EditProfileModal component.
 *
 * Allows authenticated user to update their first name and last name.
 * Keeps users.name as canonical source of truth in the database.
 */

import { useState, useEffect, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Input,
  Button,
  Alert,
} from "../ui/index.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { ApiError } from "../../lib/api/errors.js";
import { ACADEMIC_FIELDS, isValidAcademicField } from "@avana/domain";
import { UserCheck, GraduationCap } from "lucide-react";

export interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EditProfileModal({ isOpen, onClose }: EditProfileModalProps) {
  const queryClient = useQueryClient();
  const { user, updateProfile } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [major, setMajor] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setFormError(null);
      setFormSuccess(null);
      setIsSubmitting(false);

      if (user.name && user.name.trim()) {
        const parts = user.name.trim().split(/\s+/);
        setFirstName(parts[0] || "");
        setLastName(parts.slice(1).join(" ") || "");
      } else {
        setFirstName("");
        setLastName("");
      }
      setMajor(user.major || "");
    }
  }, [isOpen, user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const trimmedFirst = firstName.trim().replace(/\s+/g, " ");
    const trimmedLast = lastName.trim().replace(/\s+/g, " ");

    if (!trimmedFirst || trimmedFirst.length < 2) {
      setFormError("نام باید حداقل ۲ کاراکتر باشد.");
      return;
    }
    if (trimmedFirst.length > 50) {
      setFormError("نام نمی‌تواند بیش از ۵۰ کاراکتر باشد.");
      return;
    }
    if (!trimmedLast || trimmedLast.length < 2) {
      setFormError("نام خانوادگی باید حداقل ۲ کاراکتر باشد.");
      return;
    }
    if (trimmedLast.length > 50) {
      setFormError("نام خانوادگی نمی‌تواند بیش از ۵۰ کاراکتر باشد.");
      return;
    }

    if (major && !isValidAcademicField(major)) {
      setFormError("رشته تحصیلی نامعتبر است.");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateProfile(
        trimmedFirst,
        trimmedLast,
        `${trimmedFirst} ${trimmedLast}`,
        major || null,
      );
      await queryClient.invalidateQueries({ queryKey: ["my-courses"] });
      await queryClient.invalidateQueries({ queryKey: ["courses"] });
      setFormSuccess("اطلاعات پروفایل شما با موفقیت به‌روزرسانی شد.");
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("خطا در به‌روزرسانی مشخصات کاربری.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      maxWidth="md"
      ariaLabel="ویرایش مشخصات کاربری"
    >
      <form onSubmit={handleSubmit}>
        <DialogHeader onClose={isSubmitting ? undefined : onClose}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] leading-snug">
                ویرایش مشخصات کاربری
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                نام، نام خانوادگی و رشته تحصیلی برای شخصی‌سازی دروس
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogContent>
          <div className="space-y-4">
            {formError && (
              <Alert variant="error" title="خطا">
                {formError}
              </Alert>
            )}

            {formSuccess && (
              <Alert variant="success" title="موفقیت">
                {formSuccess}
              </Alert>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label="نام *"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="مثلاً: علی"
                disabled={isSubmitting}
                autoFocus
              />

              <Input
                label="نام خانوادگی *"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="مثلاً: محمدلو"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label
                htmlFor="profileMajor"
                className="block text-xs font-semibold text-[var(--color-text)] mb-1"
              >
                رشته تحصیلی
              </label>
              <div className="relative">
                <GraduationCap className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                <select
                  id="profileMajor"
                  value={major}
                  onChange={(e) => {
                    setMajor(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  disabled={isSubmitting}
                  className="w-full ps-9 pe-8 py-2 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start text-xs sm:text-sm disabled:opacity-50 transition-all appearance-none cursor-pointer"
                >
                  <option value="">(بدون رشته / تعیین نشده)</option>
                  {ACADEMIC_FIELDS.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.label}
                    </option>
                  ))}
                </select>
                <div className="absolute end-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-text-muted)] text-[10px]">
                  ▼
                </div>
              </div>
            </div>

            {user?.email && (
              <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/60 border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] flex flex-col gap-1">
                <span className="font-medium text-[var(--color-text)]">شناسه ایمیل:</span>
                <span className="font-mono" dir="ltr">{user.email}</span>
              </div>
            )}
          </div>
        </DialogContent>

        <DialogFooter>
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              انصراف
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
            >
              ذخیره تغییرات
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
