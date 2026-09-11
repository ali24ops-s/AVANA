import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "tertiary"
    | "outline"
    | "ghost"
    | "danger"
    | "destructive"
    | "success"
    | "link"
    | "secondary-purple";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = "",
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      type = "button",
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-semibold rounded-[10px] whitespace-nowrap leading-none select-none transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#008080] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] [&_svg]:shrink-0 [&_svg]:block";

    const gapStyles: Record<"sm" | "md" | "lg", string> = {
      sm: "gap-1.5",
      md: "gap-2",
      lg: "gap-2.5",
    };

    const sizeStyles: Record<"sm" | "md" | "lg", string> = {
      sm: "h-8 px-3.5 text-xs gap-1.5 leading-none",
      md: "h-9 px-4 text-xs sm:text-sm gap-2 leading-none",
      lg: "h-11 px-6 text-sm sm:text-base gap-2.5 leading-none",
    };

    const variantStyles: Record<string, string> = {
      primary:
        "bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-transparent",
      secondary:
        "bg-[#e0f2f2] dark:bg-teal-950/60 hover:bg-[#d0ebeb] dark:hover:bg-teal-900/60 text-[#006666] dark:text-teal-200 border border-[#b3d9d9] dark:border-teal-700/60",
      tertiary:
        "bg-[var(--color-background)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] border border-[var(--color-border)] shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
      outline:
        "bg-transparent hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] border border-[var(--color-border)]",
      ghost:
        "bg-transparent hover:bg-[#e0f2f2]/60 dark:hover:bg-teal-950/40 text-[#008080] dark:text-teal-300 border border-transparent",
      danger:
        "bg-[#b84c4c] hover:bg-[#a13e3e] text-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-transparent",
      destructive:
        "bg-[#b84c4c] hover:bg-[#a13e3e] text-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-transparent",
      success:
        "bg-[#2a624b] hover:bg-[#224e3c] text-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-transparent",
      link:
        "bg-transparent text-[#008080] dark:text-teal-300 hover:underline p-0 h-auto font-semibold focus-visible:ring-0 active:scale-100",
      "secondary-purple":
        "bg-[#8b5cf6] hover:bg-[#7c3aed] text-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-transparent",
    };

    const widthStyle = fullWidth ? "w-full" : "";

    const hasChildren =
      children !== undefined && children !== null && children !== "";

    const iconWrapperStyles =
      "inline-flex shrink-0 items-center justify-center leading-none";

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${widthStyle} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className={iconWrapperStyles}>
            <svg
              className="animate-spin h-4 w-4 text-current"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </span>
        ) : leftIcon ? (
          <span className={iconWrapperStyles}>
            {leftIcon}
          </span>
        ) : null}
        {hasChildren && (
          <span
            className={`inline-flex items-center justify-center ${gapStyles[size]} whitespace-nowrap leading-none`}
          >
            {children}
          </span>
        )}
        {!isLoading && rightIcon ? (
          <span className={iconWrapperStyles}>
            {rightIcon}
          </span>
        ) : null}
      </button>
    );
  }
);

Button.displayName = "Button";
