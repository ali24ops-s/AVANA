import React from "react";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className = "", id, disabled, ...props }, ref) => {
    const inputId = id || (label ? `checkbox-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

    return (
      <label
        htmlFor={inputId}
        className={`inline-flex items-start gap-2.5 cursor-pointer select-none ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        } ${className}`}
      >
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          disabled={disabled}
          className="w-4 h-4 mt-0.5 rounded text-[#008080] bg-[var(--color-surface)] border-[var(--color-border)] focus:ring-[#008080] focus:ring-offset-0 cursor-pointer"
          {...props}
        />
        {(label || description) && (
          <div className="flex flex-col text-start">
            {label && <span className="text-xs sm:text-sm font-semibold text-[var(--color-text)]">{label}</span>}
            {description && (
              <span className="text-xs text-[var(--color-text-muted)]">{description}</span>
            )}
          </div>
        )}
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";

export interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ label, description, className = "", id, disabled, ...props }, ref) => {
    const inputId = id || (label ? `radio-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

    return (
      <label
        htmlFor={inputId}
        className={`inline-flex items-start gap-2.5 cursor-pointer select-none ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        } ${className}`}
      >
        <input
          ref={ref}
          id={inputId}
          type="radio"
          disabled={disabled}
          className="w-4 h-4 mt-0.5 text-[#008080] bg-[var(--color-surface)] border-[var(--color-border)] focus:ring-[#008080] focus:ring-offset-0 cursor-pointer"
          {...props}
        />
        {(label || description) && (
          <div className="flex flex-col text-start">
            {label && <span className="text-xs sm:text-sm font-semibold text-[var(--color-text)]">{label}</span>}
            {description && (
              <span className="text-xs text-[var(--color-text-muted)]">{description}</span>
            )}
          </div>
        )}
      </label>
    );
  }
);
Radio.displayName = "Radio";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  className = "",
}) => {
  return (
    <label
      className={`inline-flex items-center gap-3 cursor-pointer select-none ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${className}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008080] ${
          checked
            ? "bg-[#008080] border-transparent"
            : "bg-slate-300 dark:bg-slate-600 border-slate-300 dark:border-slate-600"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
            checked ? "translate-x-0" : "-translate-x-4"
          }`}
        />
      </button>
      {label && <span className="text-xs sm:text-sm font-semibold text-[var(--color-text)]">{label}</span>}
    </label>
  );
};
