/**
 * EditClassroomModal component.
 *
 * Allows teacher to modify classroom title and description.
 */

import { useState, useEffect, type FormEvent } from "react";
import { Dialog, DialogHeader, DialogContent, DialogFooter, Input, Textarea, Button, Alert } from "../../ui/index.js";
import { useUpdateClassroom } from "../../../hooks/useTeacher.js";
import { ApiError } from "../../../lib/api/errors.js";
import type { ClassroomWithDetails } from "../../../lib/api/teacher.js";
import { Settings } from "lucide-react";

export interface EditClassroomModalProps {
  isOpen: boolean;
  onClose: () => void;
  classroom: ClassroomWithDetails;
  organizationId?: string;
}

export function EditClassroomModal({
  isOpen,
  onClose,
  classroom,
  organizationId,
}: EditClassroomModalProps) {
  const [title, setTitle] = useState(classroom.title);
  const [description, setDescription] = useState(classroom.description ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(classroom.title);
      setDescription(classroom.description ?? "");
      setFormError(null);
    }
  }, [isOpen, classroom]);

  const updateMutation = useUpdateClassroom(classroom.id, organizationId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      setFormError("عنوان کلاس باید حداقل ۳ کاراکتر باشد");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        title: trimmedTitle,
        description: description.trim() || null,
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("خطا در به‌روزرسانی اطلاعات کلاس");
      }
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={updateMutation.isPending ? () => {} : onClose}
      maxWidth="md"
      ariaLabel="ویرایش اطلاعات کلاس"
    >
      <form onSubmit={handleSubmit}>
        <DialogHeader onClose={updateMutation.isPending ? undefined : onClose}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] leading-snug">
                ویرایش اطلاعات کلاس
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                تغییر عنوان یا توضیحات کلاس آموزشی
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

            <Input
              label="عنوان کلاس *"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={updateMutation.isPending}
              required
            />

            <Textarea
              label="توضیحات کلاس"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={updateMutation.isPending}
            />
          </div>
        </DialogContent>

        <DialogFooter>
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={updateMutation.isPending}
            >
              انصراف
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={updateMutation.isPending}
              disabled={updateMutation.isPending}
            >
              ذخیره تغییرات
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
