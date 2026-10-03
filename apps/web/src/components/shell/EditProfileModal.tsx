/**
 * EditProfileModal component.
 *
 * Allows authenticated user to update their first name and last name.
 * Keeps users.name as canonical source of truth in the database.
 */

import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Input,
  Button,
  Alert,
  AvanaSelect,
} from "../ui/index.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { ApiError } from "../../lib/api/errors.js";
import {
  ACADEMIC_FIELDS,
  isValidAcademicField,
  TEACHING_UNIVERSITIES,
  ACADEMIC_DEPARTMENTS,
  validateTeacherAcademicProfile,
} from "@avana/domain";
import { UserCheck, GraduationCap, Building, Layers } from "lucide-react";

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
  const [university, setUniversity] = useState<string>("");
  const [faculty, setFaculty] = useState<string>("");
  const [department, setDepartment] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const universityOptions = useMemo(
    () => TEACHING_UNIVERSITIES.map((univ) => ({ value: univ, label: univ })),
    [],
  );

  const departmentOptions = useMemo(
    () => ACADEMIC_DEPARTMENTS.map((dept) => ({ value: dept, label: dept })),
    [],
  );

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
      setUniversity(user.university || "");
      setFaculty(user.faculty || "");
      setDepartment(user.department || "");
    }
  }, [isOpen, user]);

  const isTeacher = user?.role === "teacher";

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
    if (!trimmedLast.length || trimmedLast.length > 50) {
      setFormError("نام خانوادگی نمی‌تواند بیش از ۵۰ کاراکتر باشد.");
      return;
    }

    let validUniv: string | null | undefined = undefined;
    let validFac: string | null | undefined = undefined;
    let validDept: string | null | undefined = undefined;

    if (isTeacher) {
      const teacherValidation = validateTeacherAcademicProfile(
        { university, faculty, department },
        { isRequired: false },
      );
      if (!teacherValidation.valid) {
        setFormError(teacherValidation.error || "اطلاعات دانشگاه یا گروه آموزشی نامعتبر است.");
        return;
      }
      validUniv = teacherValidation.normalized?.university ?? null;
      validFac = teacherValidation.normalized?.faculty ?? null;
      validDept = teacherValidation.normalized?.department ?? null;
    } else {
      if (major && !isValidAcademicField(major)) {
        setFormError("رشته تحصیلی نامعتبر است.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await updateProfile(
        trimmedFirst,
        trimmedLast,
        `${trimmedFirst} ${trimmedLast}`,
        isTeacher ? undefined : (major || null),
        isTeacher ? validUniv : undefined,
        isTeacher ? validFac : undefined,
        isTeacher ? validDept : undefined,
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
                {isTeacher
                  ? "نام، نام خانوادگی و اطلاعات دانشگاه و گروه آموزشی محل تدریس"
                  : "نام، نام خانوادگی و رشته تحصیلی برای شخصی‌سازی دروس"}
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
                disabled={isSubmitting}
              />
            </div>

            {isTeacher ? (
              <div className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label
                      htmlFor="editUniversity"
                      className="block text-xs font-semibold text-[var(--color-text)] mb-1"
                    >
                      دانشگاه محل تدریس
                    </label>
                    <AvanaSelect
                      id="editUniversity"
                      dataTestId="edit-university-select"
                      options={universityOptions}
                      value={university}
                      onChange={(val) => {
                        setUniversity(typeof val === "string" ? val : "");
                        if (formError) setFormError(null);
                      }}
                      placeholder="انتخاب یا جستجوی دانشگاه..."
                      searchPlaceholder="جستجو در دانشگاه‌ها..."
                      isSearchable
                      disabled={isSubmitting}
                      icon={<Building className="w-4 h-4" />}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="editFaculty"
                      className="block text-xs font-semibold text-[var(--color-text)] mb-1"
                    >
                      دانشکده (اختیاری)
                    </label>
                    <div className="relative">
                      <Layers className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                      <input
                        id="editFaculty"
                        type="text"
                        value={faculty}
                        onChange={(e) => {
                          setFaculty(e.target.value);
                          if (formError) setFormError(null);
                        }}
                        placeholder="نام دانشکده..."
                        disabled={isSubmitting}
                        className="w-full ps-9 pe-4 py-2 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-start text-xs sm:text-sm disabled:opacity-50 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="editDepartment"
                    className="block text-xs font-semibold text-[var(--color-text)] mb-1"
                  >
                    گروه آموزشی
                  </label>
                  <AvanaSelect
                    id="editDepartment"
                    dataTestId="edit-department-select"
                    options={departmentOptions}
                    value={department}
                    onChange={(val) => {
                      setDepartment(typeof val === "string" ? val : "");
                      if (formError) setFormError(null);
                    }}
                    placeholder="انتخاب یا جستجوی گروه آموزشی..."
                    searchPlaceholder="جستجو در گروه‌های آموزشی..."
                    isSearchable
                    disabled={isSubmitting}
                    icon={<GraduationCap className="w-4 h-4" />}
                  />
                </div>
              </div>
            ) : (
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
            )}

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
