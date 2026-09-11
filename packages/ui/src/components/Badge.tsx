import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "primary"
    | "secondary"
    | "warm"
    | "success"
    | "warning"
    | "error"
    | "info"
    | "neutral"
    | "purple";
  size?: "sm" | "md";
  outlined?: boolean;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className = "",
  variant = "primary",
  size = "md",
  outlined = false,
  icon,
  ...props
}) => {
  const sizeStyles = {
    sm: "px-2 py-0.5 text-[10px] rounded-full gap-1 font-semibold leading-none",
    md: "px-2.5 py-1 text-[11px] sm:text-xs rounded-full gap-1.5 font-semibold leading-none",
  };

  const filledStyles: Record<string, string> = {
    primary:
      "bg-[#e0f2f2] text-[#006666] dark:bg-teal-950/60 dark:text-teal-200 border border-[#b3d9d9] dark:border-teal-800/60",
    secondary:
      "bg-[#e8f4fb] text-[#2b6d8f] dark:bg-sky-950/60 dark:text-sky-200 border border-[#a7d0e6] dark:border-sky-800/60",
    warm:
      "bg-[#fdf2e4] text-[#8f5e27] dark:bg-amber-950/60 dark:text-amber-200 border border-[#e8c18a] dark:border-amber-800/60",
    success:
      "bg-[#e4f4ec] text-[#2a624b] dark:bg-emerald-950/60 dark:text-emerald-200 border border-[#9ed4bb] dark:border-emerald-800/60",
    warning:
      "bg-[#fdf2e4] text-[#8f5e27] dark:bg-amber-950/60 dark:text-amber-200 border border-[#e8c18a] dark:border-amber-800/60",
    error:
      "bg-[#fde8e8] text-[#7f3131] dark:bg-red-950/60 dark:text-red-200 border border-[#e8a0a0] dark:border-red-800/60",
    info:
      "bg-[#e8f4fb] text-[#2b6d8f] dark:bg-sky-950/60 dark:text-sky-200 border border-[#a7d0e6] dark:border-sky-800/60",
    neutral:
      "bg-[#EEF1F3] text-[#3d4f55] dark:bg-slate-800/80 dark:text-slate-300 border border-[#E2E7EA] dark:border-slate-700",
    purple:
      "bg-[#f3e8ff] text-[#7c3aed] dark:bg-purple-950/60 dark:text-purple-300 border border-[#d8b4fe] dark:border-purple-800/60",
  };

  const outlinedStyles: Record<string, string> = {
    primary: "bg-transparent text-[#006666] dark:text-teal-300 border border-[#008080] font-semibold",
    secondary: "bg-transparent text-[#2b6d8f] dark:text-sky-300 border border-[#5ba0c4] font-semibold",
    warm: "bg-transparent text-[#8f5e27] dark:text-amber-300 border border-[#c2853f] font-semibold",
    success: "bg-transparent text-[#2a624b] dark:text-emerald-300 border border-[#3d8f6e] font-semibold",
    warning: "bg-transparent text-[#8f5e27] dark:text-amber-300 border border-[#c2853f] font-semibold",
    error: "bg-transparent text-[#7f3131] dark:text-red-300 border border-[#b84c4c] font-semibold",
    info: "bg-transparent text-[#2b6d8f] dark:text-sky-300 border border-[#5ba0c4] font-semibold",
    neutral: "bg-transparent text-[#3d4f55] dark:text-slate-300 border border-[#CBD5E1] font-semibold",
    purple: "bg-transparent text-[#7c3aed] dark:text-purple-300 border border-[#8b5cf6] font-semibold",
  };

  const style = (outlined ? outlinedStyles[variant] : filledStyles[variant]) || filledStyles.primary;

  return (
    <span
      className={`inline-flex items-center justify-center whitespace-nowrap leading-none transition-colors [&_svg]:shrink-0 [&_svg]:block ${sizeStyles[size]} ${style} ${className}`}
      {...props}
    >
      {icon && (
        <span className="inline-flex shrink-0 items-center justify-center leading-none">
          {icon}
        </span>
      )}
      <span className="inline-flex items-center leading-none">{children}</span>
    </span>
  );
};

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  label?: React.ReactNode;
  onRemove?: () => void;
  variant?: "primary" | "secondary" | "neutral" | "info" | "success" | "warning";
}

export const Chip: React.FC<ChipProps> = ({
  label,
  children,
  onRemove,
  variant = "primary",
  className = "",
  ...props
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium leading-none whitespace-nowrap transition-colors [&_svg]:shrink-0 [&_svg]:block ${
        variant === "secondary"
          ? "bg-[#e8f4fb] text-[#2b6d8f] dark:bg-sky-950/60 dark:text-sky-200 border border-[#a7d0e6] dark:border-sky-800/60"
          : variant === "info"
          ? "bg-[#e8f4fb] text-[#2b6d8f] dark:bg-sky-950/60 dark:text-sky-200 border border-[#a7d0e6] dark:border-sky-800/60"
          : variant === "success"
          ? "bg-[#e4f4ec] text-[#2a624b] dark:bg-emerald-950/60 dark:text-emerald-200 border border-[#9ed4bb] dark:border-emerald-800/60"
          : variant === "warning"
          ? "bg-[#fdf2e4] text-[#8f5e27] dark:bg-amber-950/60 dark:text-amber-200 border border-[#e8c18a] dark:border-amber-800/60"
          : variant === "neutral"
          ? "bg-[#EEF1F3] text-[#3d4f55] dark:bg-slate-800/80 dark:text-slate-300 border border-[#E2E7EA] dark:border-slate-700"
          : "bg-[#e0f2f2] text-[#006666] dark:bg-teal-950/60 dark:text-teal-200 border border-[#b3d9d9] dark:border-teal-800/60"
      } ${className}`}
      {...props}
    >
      {label || children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-75 focus:outline-none text-current ms-0.5 leading-none"
          aria-label="Remove"
        >
          ×
        </button>
      )}
    </span>
  );
};
