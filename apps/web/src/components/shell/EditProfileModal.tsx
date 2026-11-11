/**
 * EditProfileModal component.
 *
 * Allows authenticated user to update their first name, last name, phone number,
 * email, and academic details, with independent email and phone verification flows.
 */

import { useState, useEffect, useMemo, useRef, type FormEvent } from "react";
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
  validateAndNormalizeIranPhone,
} from "@avana/domain";
import {
  UserCheck,
  GraduationCap,
  Building,
  Layers,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  RefreshCw,
} from "lucide-react";

export interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EditProfileModal({ isOpen, onClose }: EditProfileModalProps) {
  const queryClient = useQueryClient();
  const { user, updateProfile, sendVerification, verifyChannel } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [major, setMajor] = useState<string>("");
  const [university, setUniversity] = useState<string>("");
  const [faculty, setFaculty] = useState<string>("");
  const [department, setDepartment] = useState<string>("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Verification flow state
  const [activeVerifyingChannel, setActiveVerifyingChannel] = useState<"email" | "phone" | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [verificationCooldown, setVerificationCooldown] = useState(0);

  const universityOptions = useMemo(
    () => TEACHING_UNIVERSITIES.map((univ) => ({ value: univ, label: univ })),
    [],
  );

  const departmentOptions = useMemo(
    () => ACADEMIC_DEPARTMENTS.map((dept) => ({ value: dept, label: dept })),
    [],
  );

  useEffect(() => {
    if (verificationCooldown <= 0) return;
    const timer = setInterval(() => {
      setVerificationCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [verificationCooldown]);

  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      hasInitializedRef.current = false;
      return;
    }

    // Only populate form fields when modal transitions to open with a loaded user
    if (isOpen && user && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setFormError(null);
      setFormSuccess(null);
      setIsSubmitting(false);
      setActiveVerifyingChannel(null);
      setVerificationCode("");
      setVerificationCooldown(0);

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
      setPhoneNumber(user.phoneNumber || "");
      setEmail(user.email || "");
    }
  }, [isOpen, user]);

  const isTeacher = user?.role === "teacher";

  const handleStartVerification = async (channel: "email" | "phone") => {
    setFormError(null);
    setFormSuccess(null);

    if (channel === "phone") {
      const currentPhone = user?.phoneNumber?.trim();
      if (!currentPhone) {
        setFormError("ابتدا باید شماره موبایل خود را ذخیره کنید.");
        return;
      }
      const normInput = validateAndNormalizeIranPhone(phoneNumber.trim()).normalized;
      const normCurrent = validateAndNormalizeIranPhone(currentPhone).normalized;
      const isMismatch = normInput && normCurrent ? normInput !== normCurrent : phoneNumber.trim() !== currentPhone;
      if (isMismatch) {
        setFormError("شماره موبایل تغییر کرده است. لطفاً ابتدا دکمه «ذخیره تغییرات» را بزنید.");
        return;
      }
    }

    if (channel === "email") {
      const currentEmail = user?.email?.trim();
      if (email.trim().toLowerCase() !== currentEmail?.toLowerCase()) {
        setFormError("نشانی ایمیل تغییر کرده است. لطفاً ابتدا دکمه «ذخیره تغییرات» را بزنید.");
        return;
      }
    }

    setIsSendingCode(true);
    try {
      await sendVerification(channel);
      setActiveVerifyingChannel(channel);
      setVerificationCode("");
      setVerificationCooldown(60);
      setFormSuccess(
        channel === "phone"
          ? "کد ۶ رقمی تأیید به شماره موبایل شما پیامک شد."
          : "کد ۶ رقمی تأیید به نشانی ایمیل شما ارسال شد.",
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("ارسال کد تأیید با خطا مواجه شد.");
      }
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleConfirmVerification = async () => {
    if (!activeVerifyingChannel) return;
    setFormError(null);
    setFormSuccess(null);

    const cleanCode = verificationCode.trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setFormError("کد تأیید باید یک عدد ۶ رقمی معتبر باشد.");
      return;
    }

    setIsVerifyingCode(true);
    try {
      await verifyChannel(activeVerifyingChannel, cleanCode);
      setFormSuccess(
        activeVerifyingChannel === "phone"
          ? "شماره موبایل شما با موفقیت تأیید شد."
          : "نشانی ایمیل شما با موفقیت تأیید شد.",
      );
      setActiveVerifyingChannel(null);
      setVerificationCode("");
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("کد واردشده صحیح نیست یا منقضی شده است.");
      }
    } finally {
      setIsVerifyingCode(false);
    }
  };

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

    const trimmedPhone = phoneNumber.trim();
    const currentPhone = user?.phoneNumber || "";
    let validPhoneToUpdate: string | null | undefined = undefined;
    let phoneChanged = false;

    if (trimmedPhone !== currentPhone) {
      phoneChanged = true;
      if (!trimmedPhone) {
        validPhoneToUpdate = null;
      } else {
        const phoneValidation = validateAndNormalizeIranPhone(trimmedPhone);
        if (!phoneValidation.valid || !phoneValidation.normalized) {
          setFormError(phoneValidation.error || "شماره موبایل نامعتبر است.");
          return;
        }
        validPhoneToUpdate = phoneValidation.normalized;
      }
    }

    const trimmedEmail = email.trim().toLowerCase();
    const currentEmail = (user?.email || "").trim().toLowerCase();
    let validEmailToUpdate: string | undefined = undefined;
    let emailChanged = false;

    if (trimmedEmail && trimmedEmail !== currentEmail) {
      emailChanged = true;
      if (!trimmedEmail.includes("@")) {
        setFormError("نشانی ایمیل نامعتبر است.");
        return;
      }
      validEmailToUpdate = trimmedEmail;
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
        phoneChanged ? validPhoneToUpdate : undefined,
        emailChanged ? validEmailToUpdate : undefined,
      );
      await queryClient.invalidateQueries({ queryKey: ["my-courses"] });
      await queryClient.invalidateQueries({ queryKey: ["courses"] });

      if (phoneChanged && validPhoneToUpdate) {
        setPhoneNumber(validPhoneToUpdate);
      }
      if (emailChanged && validEmailToUpdate) {
        setEmail(validEmailToUpdate);
      }

      if (phoneChanged || emailChanged) {
        setFormSuccess("اطلاعات تماس با موفقیت ذخیره شد. اکنون می‌توانید آن را تأیید کنید.");
        // Keep modal open so user can immediately verify their contact info
      } else {
        setFormSuccess("اطلاعات پروفایل شما با موفقیت به‌روزرسانی شد.");
        setTimeout(() => {
          onClose();
        }, 700);
      }
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
      maxWidth="2xl"
      className="sm:max-w-[640px]"
      ariaLabel="ویرایش مشخصات کاربری"
      hideHeader
    >
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
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

            {/* Contact details and Verification section */}
            <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
              <h4 className="text-xs font-bold text-[var(--color-text)]">
                اطلاعات تماس و وضعیت تأیید
              </h4>

              {(Boolean(user?.emailVerified && user?.email && email.trim().toLowerCase() !== user.email.trim().toLowerCase()) ||
                Boolean(user?.phoneVerified && user?.phoneNumber && phoneNumber.trim() !== user.phoneNumber.trim())) && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>با ویرایش ایمیل یا شماره موبایل تأییدشده، وضعیت تأیید آن لغو شده و نیاز به تأیید مجدد خواهد داشت.</span>
                </div>
              )}

              {/* Email field & status */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="profileEmail" className="text-xs font-medium text-[var(--color-text)]">
                    نشانی ایمیل
                  </label>
                  <div>
                    {user?.emailVerified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        تأییدشده
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <AlertCircle className="w-3.5 h-3.5" />
                        تأیید نشده
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                    <input
                      id="profileEmail"
                      type="email"
                      dir="ltr"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (formError) setFormError(null);
                      }}
                      disabled={isSubmitting}
                      placeholder="name@example.com"
                      className="w-full ps-9 pe-4 py-2 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 transition-all text-left"
                    />
                  </div>
                  {!user?.emailVerified && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleStartVerification("email")}
                      disabled={isSendingCode || isSubmitting}
                      isLoading={isSendingCode && activeVerifyingChannel === "email"}
                    >
                      تأیید ایمیل
                    </Button>
                  )}
                </div>
              </div>

              {/* Phone number field & status */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="profilePhone" className="text-xs font-medium text-[var(--color-text)]">
                    شماره موبایل
                  </label>
                  <div>
                    {user?.phoneNumber ? (
                      user.phoneVerified ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          تأییدشده
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <AlertCircle className="w-3.5 h-3.5" />
                          تأیید نشده
                        </span>
                      )
                    ) : (
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        (ثبت‌نشده)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                    <input
                      id="profilePhone"
                      type="tel"
                      dir="ltr"
                      value={phoneNumber}
                      onChange={(e) => {
                        setPhoneNumber(e.target.value);
                        if (formError) setFormError(null);
                      }}
                      disabled={isSubmitting}
                      placeholder="09123456789"
                      className="w-full ps-9 pe-4 py-2 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 transition-all text-left"
                    />
                  </div>
                  {user?.phoneNumber && !user.phoneVerified && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleStartVerification("phone")}
                      disabled={isSendingCode || isSubmitting}
                      isLoading={isSendingCode && activeVerifyingChannel === "phone"}
                    >
                      تأیید شماره موبایل
                    </Button>
                  )}
                </div>
              </div>

              {/* Inline OTP Verification Box */}
              {activeVerifyingChannel && (
                <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-3 mt-2 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-primary">
                      {activeVerifyingChannel === "phone"
                        ? "ورود کد تأیید پیامک‌شده"
                        : "ورود کد تأیید ایمیل‌شده"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveVerifyingChannel(null);
                        setVerificationCode("");
                      }}
                      className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
                    >
                      انصراف
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="123456"
                      className="w-32 px-3 py-1.5 rounded-input border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono text-center tracking-widest text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleConfirmVerification}
                      disabled={verificationCode.trim().length !== 6 || isVerifyingCode}
                      isLoading={isVerifyingCode}
                    >
                      ثبت کد تأیید
                    </Button>
                    {verificationCooldown > 0 ? (
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        ارسال مجدد ({verificationCooldown}s)
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartVerification(activeVerifyingChannel)}
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        ارسال مجدد
                      </button>
                    )}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
                نکته امنیتی: در صورت تغییر نشانی ایمیل یا شماره موبایل، وضعیت تأیید قبلی لغو شده و نیاز به تأیید مجدد خواهد بود.
              </p>
            </div>
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
