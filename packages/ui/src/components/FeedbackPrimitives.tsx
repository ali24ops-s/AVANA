import React from "react";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  showLabel?: boolean;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "success" | "warning" | "error";
  className?: string;
}

export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  showLabel = false,
  label = "پیشرفت",
  size = "md",
  variant = "primary",
  className = "",
  "aria-label": ariaLabel,
  ...props
}) => {
  const percentage = Math.min(100, Math.max(0, Math.round((value / max) * 100)));

  const sizeStyles = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4",
  };

  const variantStyles = {
    primary: "bg-[#008080]",
    secondary: "bg-[#5ba0c4]",
    success: "bg-[#3d8f6e]",
    warning: "bg-[#c2853f]",
    error: "bg-[#b84c4c]",
  };

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel || label}
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`flex flex-col gap-1 w-full ${className}`}
      {...props}
    >
      {showLabel && (
        <div className="flex justify-between text-xs font-semibold text-[var(--color-text-muted)]">
          <span>{label}</span>
          <span className="font-semibold text-[#008080]">{percentage}٪</span>
        </div>
      )}
      <div
        className={`w-full bg-[#e0f2f2] dark:bg-teal-950/60 rounded-full overflow-hidden border border-[var(--color-border)] ${sizeStyles[size]}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${variantStyles[variant]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = "",
  width,
  height,
  borderRadius = "10px",
}) => {
  return (
    <div
      className={`animate-pulse bg-slate-200/80 dark:bg-slate-800/80 rounded-[10px] ${className}`}
      style={{
        width: width !== undefined ? (typeof width === "number" ? `${width}px` : width) : undefined,
        height: height !== undefined ? (typeof height === "number" ? `${height}px` : height) : undefined,
        borderRadius,
      }}
    />
  );
};

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs ${className}`}
      dir="rtl"
    >
      {icon && (
        <div className="w-12 h-12 rounded-[16px] bg-[#e0f2f2] dark:bg-teal-950/60 text-[#008080] dark:text-teal-300 flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-[var(--color-text)] mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-[var(--color-text-muted)] max-w-sm mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
};

export interface LoadingStateProps {
  message?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = "در حال بارگذاری...",
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 gap-3 text-[var(--color-text-muted)] ${className}`}
      dir="rtl"
    >
      <div className="w-8 h-8 border-3 border-[var(--color-border)] border-t-[#008080] rounded-full animate-spin" />
      <span className="text-xs font-medium">{message}</span>
    </div>
  );
};
