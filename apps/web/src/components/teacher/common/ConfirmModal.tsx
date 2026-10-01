/**
 * ConfirmModal component for Teacher Platform.
 *
 * Provides accessible, clear confirmation for destructive or irreversible actions:
 *  - deleting a classroom (with 409 conflict explanation)
 *  - archiving a classroom / exam
 *  - removing a student from a classroom
 *  - publishing an exam (locking question mutation)
 *  - unpublishing an exam (with 409 conflict explanation)
 */

import React from "react";
import { Dialog, DialogHeader, DialogContent, DialogFooter, Button, Alert } from "../../ui/index.js";
import { AlertTriangle, AlertCircle } from "lucide-react";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "primary" | "warning";
  isProcessing?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = "تأیید",
  cancelText = "انصراف",
  variant = "primary",
  isProcessing = false,
  errorMessage,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const buttonVariant =
    variant === "danger"
      ? "danger"
      : variant === "warning"
      ? "primary"
      : "primary";

  return (
    <Dialog
      isOpen={isOpen}
      onClose={isProcessing ? () => {} : onCancel}
      maxWidth="md"
      ariaLabel={title}
    >
      <DialogHeader onClose={isProcessing ? undefined : onCancel}>
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              variant === "danger"
                ? "bg-red-500/10 text-red-500"
                : variant === "warning"
                ? "bg-amber-500/10 text-amber-500"
                : "bg-[#008080]/10 text-[#008080]"
            }`}
          >
            {variant === "danger" || variant === "warning" ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
          </div>
          <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] leading-snug">
            {title}
          </h3>
        </div>
      </DialogHeader>

      <DialogContent>
        <div className="space-y-4 text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
          {typeof description === "string" ? <p>{description}</p> : description}

          {errorMessage && (
            <Alert variant="error" title="خطای عملیات">
              {errorMessage}
            </Alert>
          )}
        </div>
      </DialogContent>

      <DialogFooter>
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isProcessing}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={buttonVariant}
            size="sm"
            onClick={onConfirm}
            isLoading={isProcessing}
            disabled={isProcessing}
          >
            {confirmText}
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}
