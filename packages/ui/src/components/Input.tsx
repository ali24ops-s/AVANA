import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      startIcon,
      endIcon,
      className = "",
      containerClassName = "",
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? `input-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

    return (
      <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`}>
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-[var(--color-text)]">
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          {startIcon && (
            <div className="absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none">
              {startIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={`w-full py-2.5 px-3.5 bg-[var(--color-surface)] border ${
              error
                ? "border-[#b84c4c] focus:ring-[#b84c4c]/20 text-[var(--color-text)]"
                : "border-[var(--color-border)] focus:border-[#008080] focus:ring-[#008080]/15"
            } rounded-[10px] text-xs sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              startIcon ? "ps-10" : ""
            } ${endIcon ? "pe-10" : ""} ${className}`}
            {...props}
          />
          {endIcon && (
            <div className="absolute end-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
              {endIcon}
            </div>
          )}
        </div>
        {error && <span className="text-xs font-medium text-red-500">{error}</span>}
        {!error && helperText && (
          <span className="text-xs text-[var(--color-text-muted)]">{helperText}</span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  containerClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = "", containerClassName = "", id, disabled, ...props }, ref) => {
    const textareaId = id || (label ? `textarea-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

    return (
      <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`}>
        {label && (
          <label htmlFor={textareaId} className="text-xs font-semibold text-[var(--color-text)]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          className={`w-full py-2.5 px-3.5 bg-[var(--color-surface)] border ${
            error
              ? "border-[#b84c4c] focus:ring-[#b84c4c]/20"
              : "border-[var(--color-border)] focus:border-[#008080] focus:ring-[#008080]/15"
          } rounded-[10px] text-xs sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-3 transition-all resize-y disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
          {...props}
        />
        {error && <span className="text-xs font-medium text-red-500">{error}</span>}
        {!error && helperText && (
          <span className="text-xs text-[var(--color-text-muted)]">{helperText}</span>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
