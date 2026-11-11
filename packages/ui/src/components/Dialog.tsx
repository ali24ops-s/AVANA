import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Global Reference-Counted Body Scroll Lock                                 */
/* -------------------------------------------------------------------------- */
let scrollLockCount = 0;
let originalOverflow = "";

function acquireScrollLock() {
  if (typeof document === "undefined") return;
  if (scrollLockCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount++;
}

function releaseScrollLock() {
  if (typeof document === "undefined") return;
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = originalOverflow;
  }
}

/* -------------------------------------------------------------------------- */
/* Global Active Dialog Stack for LIFO Escape Key Management                   */
/* -------------------------------------------------------------------------- */
let openDialogStack: Array<() => void> = [];

/* -------------------------------------------------------------------------- */
/* Compound Subcomponents                                                     */
/* -------------------------------------------------------------------------- */
export interface DialogHeaderProps {
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
  hideCloseButton?: boolean;
}

export const DialogHeader: React.FC<DialogHeaderProps> = ({
  children,
  className = "",
  onClose,
  hideCloseButton = false,
}) => (
  <div
    className={`flex items-start justify-between gap-3 sm:gap-4 p-4 sm:p-6 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] shrink-0 ${className}`}
  >
    <div className="min-w-0 flex-1">{children}</div>
    {!hideCloseButton && onClose && (
      <button
        type="button"
        onClick={onClose}
        aria-label="بستن پنجره"
        className="p-1.5 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008080] shrink-0 cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>
    )}
  </div>
);

export interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

export const DialogContent: React.FC<DialogContentProps> = ({
  children,
  className = "",
}) => (
  <div
    className={`flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 text-start ${className}`}
  >
    {children}
  </div>
);

export interface DialogFooterProps {
  children: React.ReactNode;
  className?: string;
}

export const DialogFooter: React.FC<DialogFooterProps> = ({
  children,
  className = "",
}) => (
  <div
    className={`p-4 sm:p-6 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 shrink-0 ${className}`}
  >
    {children}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Main Dialog Component                                                      */
/* -------------------------------------------------------------------------- */
export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "full";
  usePortal?: boolean;
  className?: string;
  containerClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  hideHeader?: boolean;
  hideCloseButton?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  /**
   * Explicit compound mode toggle.
   * When true:
   * - Dialog will NEVER auto-inject a DialogHeader or wrap children in DialogContent.
   * - Children are rendered directly without any layout wrapper.
   * - Full responsibility for Header, Content, Scrolling, and Footer is with the consumer.
   * When false or undefined:
   * - Falls back to auto-detection (detectCompound) to maintain 100% backward compatibility.
   */
  isCompound?: boolean;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "lg",
  usePortal = true,
  className = "",
  containerClassName = "",
  headerClassName = "",
  bodyClassName = "",
  hideHeader = false,
  hideCloseButton = false,
  ariaLabel,
  ariaDescribedBy,
  isCompound,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Global Reference-Counted Scroll Lock & Escape listener
  useEffect(() => {
    if (!isOpen) return;

    acquireScrollLock();

    const handleClose = () => {
      onCloseRef.current();
    };
    openDialogStack.push(handleClose);

    // Store active element for focus restoration on close
    if (typeof document !== "undefined") {
      previousActiveElement.current = document.activeElement as HTMLElement | null;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Only the topmost open dialog handles Escape in LIFO order
        const topDialogOnClose = openDialogStack[openDialogStack.length - 1];
        if (topDialogOnClose === handleClose) {
          e.preventDefault();
          handleClose();
        }
        return;
      }

      // Focus trapping for Tab / Shift+Tab
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeyDown);
    }

    // Auto focus: do not steal focus if an element inside the dialog already has focus (e.g. via autoFocus)
    const animationFrameId = requestAnimationFrame(() => {
      if (dialogRef.current) {
        if (
          typeof document !== "undefined" &&
          document.activeElement &&
          dialogRef.current.contains(document.activeElement)
        ) {
          return;
        }

        const autofocusElement = dialogRef.current.querySelector<HTMLElement>(
          "[autofocus], [data-autofocus]",
        );
        if (autofocusElement) {
          autofocusElement.focus();
          return;
        }

        const firstFocusable = dialogRef.current.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          dialogRef.current.focus();
        }
      }
    });

    return () => {
      cancelAnimationFrame(animationFrameId);
      releaseScrollLock();
      openDialogStack = openDialogStack.filter((cb) => cb !== handleClose);

      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", handleKeyDown);
      }

      // Restore focus on close
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === "function") {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    full: "max-w-full m-4",
  };

  const isCompoundElement = (el: unknown): boolean =>
    React.isValidElement(el) &&
    (el.type === DialogHeader ||
      el.type === DialogContent ||
      el.type === DialogFooter);

  const detectCompound = (node: React.ReactNode, depth = 0): boolean => {
    if (depth > 3 || !node) return false;
    return React.Children.toArray(node).some((child) => {
      if (isCompoundElement(child)) return true;
      if (
        React.isValidElement(child) &&
        child.props &&
        typeof child.props === "object" &&
        "children" in child.props
      ) {
        return detectCompound(
          (child.props as { children?: React.ReactNode }).children,
          depth + 1,
        );
      }
      return false;
    });
  };

  const effectiveIsCompound = isCompound ?? detectCompound(children);

  const containerZIndex = containerClassName.includes("z-")
    ? containerClassName
    : `z-[1300] ${containerClassName}`;

  const dialogMarkup = (
    <div
      className={`fixed inset-0 ${containerZIndex} flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden`}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#0d1719]/60 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Main Dialog Box */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`relative z-10 w-full ${maxWidthStyles[maxWidth]} bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] rounded-[20px] shadow-[0_8px_40px_rgba(0,0,0,0.16)] overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)] my-auto animate-in zoom-in-95 duration-150 text-start focus:outline-none ${className}`}
      >
        {/* Simple Header (if not in compound mode) */}
        {!hideHeader && !effectiveIsCompound && (title || description || !hideCloseButton) && (
          <DialogHeader
            onClose={hideCloseButton ? undefined : onClose}
            className={headerClassName}
          >
            {title && (
              typeof title === "string" ? (
                <h3 className="text-lg sm:text-xl font-bold text-[var(--color-text)] leading-snug">
                  {title}
                </h3>
              ) : (
                title
              )
            )}
            {description && (
              typeof description === "string" ? (
                <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-1 leading-relaxed">
                  {description}
                </p>
              ) : (
                description
              )
            )}
          </DialogHeader>
        )}

        {/* Dialog Body */}
        {effectiveIsCompound ? (
          children
        ) : (
          <DialogContent className={bodyClassName}>{children}</DialogContent>
        )}
      </div>
    </div>
  );

  if (usePortal && typeof document !== "undefined") {
    return createPortal(dialogMarkup, document.body);
  }

  return dialogMarkup;
};
