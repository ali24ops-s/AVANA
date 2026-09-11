import { useState, useEffect } from "react";
import { Edit2, Loader2 } from "lucide-react";
import { Dialog, DialogHeader, DialogContent, Input } from "@avana/ui";
import type { DocumentResource, DocumentDetailResource } from "@avana/contracts";

export interface FileRenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newName: string) => Promise<void>;
  document: DocumentResource | DocumentDetailResource | null;
  isSaving?: boolean;
}

export function FileRenameModal({
  isOpen,
  onClose,
  onConfirm,
  document,
  isSaving = false,
}: FileRenameModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (document) {
      setName(document.original_name);
      setError(null);
    }
  }, [document, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("نام فایل نمی‌تواند خالی باشد");
      return;
    }
    if (trimmed.length > 255) {
      setError("نام فایل نمی‌تواند بیش از ۲۵۵ کاراکتر باشد");
      return;
    }
    setError(null);
    await onConfirm(trimmed);
  };

  return (
    <Dialog
      isOpen={isOpen && Boolean(document)}
      onClose={() => !isSaving && onClose()}
      maxWidth="md"
      ariaLabel="تغییر نام فایل"
    >
      {/* Header */}
      <DialogHeader onClose={!isSaving ? onClose : undefined}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-[#008080] dark:text-teal-300 border border-teal-200 dark:border-teal-800">
            <Edit2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--color-text)]">تغییر نام فایل</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              ویرایش عنوان نمایشی فایل در سیستم
            </p>
          </div>
        </div>
      </DialogHeader>

      {/* Form Content */}
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="file-rename-input"
            label="نام فایل:"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            disabled={isSaving}
            error={error || undefined}
            autoFocus
          />

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              انصراف
            </button>

            <button
              type="submit"
              disabled={isSaving || !name.trim() || name.trim() === document?.original_name}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#008080] hover:bg-[#006666] text-white text-xs font-bold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در حال ذخیره...</span>
                </>
              ) : (
                <span>ذخیره تغییرات</span>
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
