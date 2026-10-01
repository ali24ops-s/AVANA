/**
 * JoinClassroomModal component for students.
 *
 * Allows a student to join a classroom by entering an 8-character invite code.
 * Strictly adheres to backend validation (trim + uppercase) and maps errors to friendly Persian messages.
 */

import React, { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Input,
  Alert,
} from "../ui/index.js";
import { useJoinClassroom } from "../../hooks/useStudentTeacherExams.js";
import { ApiError } from "../../lib/api/errors.js";
import { GraduationCap } from "lucide-react";

export interface JoinClassroomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoined?: (classroomId: string) => void;
}

export function JoinClassroomModal({
  isOpen,
  onClose,
  onJoined,
}: JoinClassroomModalProps) {
  const [inviteCode, setInviteCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const joinMutation = useJoinClassroom();

  const handleClose = () => {
    if (joinMutation.isPending) return;
    setInviteCode("");
    setErrorMessage(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = inviteCode.trim().toUpperCase();

    if (!cleanCode || cleanCode.length < 4) {
      setErrorMessage("لطفاً کد دعوت معتبر وارد کنید (حداقل ۴ کاراکتر).");
      return;
    }

    setErrorMessage(null);
    try {
      const res = await joinMutation.mutateAsync(cleanCode);
      setInviteCode("");
      onClose();
      if (onJoined) {
        onJoined(res.classroom.id);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 404 || err.code === "not_found") {
          setErrorMessage("کلاس با این کد دعوت یافت نشد. لطفاً از درستی کد اطمینان حاصل کنید.");
        } else if (err.statusCode === 409 || err.code === "conflict") {
          setErrorMessage("شما هم‌اکنون عضو فعال این کلاس هستید.");
        } else if (err.statusCode === 400 || err.code === "bad_request") {
          setErrorMessage(err.message || "کد دعوت نامعتبر است یا این کلاس بایگانی شده است.");
        } else {
          setErrorMessage(err.message || "خطا در پیوستن به کلاس. لطفاً مجدداً تلاش کنید.");
        }
      } else {
        setErrorMessage("خطا در برقراری ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کنید.");
      }
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="md"
      ariaLabel="عضویت در کلاس جدید"
    >
      <form onSubmit={handleSubmit}>
        <DialogHeader onClose={handleClose}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
                عضویت در کلاس جدید
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                کد دعوت ۸ رقمی که استادتان در اختیار شما قرار داده است را وارد کنید
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogContent>
          <div className="space-y-4">
            {errorMessage && (
              <Alert variant="error" title="خطای عضویت">
                {errorMessage}
              </Alert>
            )}

            <div>
              <label
                htmlFor="invite-code-input"
                className="block text-xs font-semibold text-[var(--color-text)] mb-1.5"
              >
                کد دعوت کلاس
              </label>
              <Input
                id="invite-code-input"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="مثال: AB34XY78"
                autoFocus
                maxLength={16}
                disabled={joinMutation.isPending}
                className="font-mono text-center tracking-widest uppercase text-base"
                dir="ltr"
              />
            </div>
          </div>
        </DialogContent>

        <DialogFooter>
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={joinMutation.isPending}
            >
              انصراف
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={joinMutation.isPending}
              disabled={joinMutation.isPending || inviteCode.trim().length === 0}
            >
              پیوستن به کلاس
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
