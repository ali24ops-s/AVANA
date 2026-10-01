/**
 * CreateClassroomModal component.
 *
 * Accessible modal dialog to define a new classroom within an organization.
 * Validates title (min 3 chars) and description (optional).
 */

import { useState, type FormEvent } from "react";
import { Dialog, DialogHeader, DialogContent, DialogFooter, Input, Textarea, Button, Alert } from "../../ui/index.js";
import { useCreateClassroom } from "../../../hooks/useTeacher.js";
import { ApiError } from "../../../lib/api/errors.js";
import { Users } from "lucide-react";

export interface CreateClassroomModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  onCreated?: (classroomId: string) => void;
}

export function CreateClassroomModal({
  isOpen,
  onClose,
  organizationId,
  onCreated,
}: CreateClassroomModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useCreateClassroom(organizationId);

  const handleClose = () => {
    if (createMutation.isPending) return;
    setTitle("");
    setDescription("");
    setFormError(null);
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      setFormError("عنوان کلاس باید حداقل ۳ کاراکتر باشد");
      return;
    }

    try {
      const res = await createMutation.mutateAsync({
        title: trimmedTitle,
        description: description.trim() || null,
      });

      handleClose();
      if (onCreated) {
        onCreated(res.classroom.id);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("خطا در ایجاد کلاس. لطفاً مجدداً تلاش کنید.");
      }
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="md"
      ariaLabel="ایجاد کلاس جدید"
    >
      <form onSubmit={handleSubmit}>
        <DialogHeader onClose={createMutation.isPending ? undefined : handleClose}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] leading-snug">
                ایجاد کلاس جدید
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                پس از ایجاد کلاس، یک کد دعوت یکتا برای ورود دانش‌آموزان صادر خواهد شد.
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogContent>
          <div className="space-y-4">
            {formError && (
              <Alert variant="error" title="خطای ورودی">
                {formError}
              </Alert>
            )}

            <Input
              label="عنوان کلاس *"
              placeholder="مثال: ریاضی تجربی - پایه دوازدهم"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={createMutation.isPending}
              required
              autoFocus
            />

            <Textarea
              label="توضیحات کلاس (اختیاری)"
              placeholder="توضیحی درباره سرفصل‌ها، قوانین یا اهداف این کلاس آموزشی بنویسید..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={createMutation.isPending}
            />
          </div>
        </DialogContent>

        <DialogFooter>
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={createMutation.isPending}
            >
              انصراف
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={createMutation.isPending}
              disabled={createMutation.isPending}
            >
              ایجاد کلاس
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
