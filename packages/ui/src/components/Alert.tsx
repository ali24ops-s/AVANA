import React from "react";

export interface AlertProps {
  title?: string;
  children: React.ReactNode;
  variant?: "info" | "success" | "warning" | "error";
  icon?: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  title,
  children,
  variant = "info",
  icon,
  onClose,
  className = "",
}) => {
  const variantStyles = {
    info: "bg-[#e8f4fb] border-[#a7d0e6] text-[#2b6d8f] dark:bg-sky-950/50 dark:border-sky-800/60 dark:text-sky-300",
    success: "bg-[#e4f4ec] border-[#9ed4bb] text-[#2a624b] dark:bg-emerald-950/50 dark:border-emerald-800/60 dark:text-emerald-300",
    warning: "bg-[#fdf2e4] border-[#e8c18a] text-[#8f5e27] dark:bg-amber-950/50 dark:border-amber-800/60 dark:text-amber-300",
    error: "bg-[#fde8e8] border-[#e8a0a0] text-[#7f3131] dark:bg-red-950/50 dark:border-red-800/60 dark:text-red-300",
  };

  return (
    <div
      className={`py-3 px-4 rounded-[16px] border flex items-start justify-between gap-3 text-start ${variantStyles[variant]} ${className}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        {icon && <div className="text-lg flex-shrink-0 mt-0.5">{icon}</div>}
        <div className="space-y-0.5 min-w-0">
          {title && <h5 className="text-xs sm:text-sm font-bold">{title}</h5>}
          <div className="text-xs leading-relaxed">{children}</div>
        </div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-xs opacity-70 hover:opacity-100 transition-opacity p-1"
        >
          ✕
        </button>
      )}
    </div>
  );
};
