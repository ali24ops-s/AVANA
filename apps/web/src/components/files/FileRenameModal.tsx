import { useState, useEffect } from "react";
import { Edit2, Loader2, X } from "lucide-react";
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

  if (!isOpen || !document) return null;

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
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 transition-opacity"
        onClick={() => !isSaving && onClose()}
      />

      {/* Modal Container */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        dir="rtl"
      >
        <div className="bg-[#0f172a] border border-white/15 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-slate-200 font-sans">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <Edit2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">تغییر نام فایل</h3>
                <p className="text-xs text-slate-400">
                  ویرایش عنوان نمایشی فایل در سیستم
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                نام فایل:
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                disabled={isSaving}
                className="w-full bg-[#131d31] border border-white/15 rounded-xl px-3.5 py-2.5 text-slate-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                autoFocus
              />
              {error && <p className="text-xs text-rose-400">{error}</p>}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                انصراف
              </button>

              <button
                type="submit"
                disabled={isSaving || !name.trim() || name.trim() === document.original_name}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors shadow-lg shadow-teal-900/40 disabled:opacity-50"
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
        </div>
      </div>
    </>
  );
}
