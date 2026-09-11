import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "glass" | "solid" | "bordered" | "flat";
  hoverable?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, className = "", variant = "solid", hoverable = false, ...props }, ref) => {
    const variantStyles = {
      solid: "bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[var(--shadow-subtle,0_1px_3px_rgba(0,0,0,0.06))]",
      glass: "glass-panel bg-[var(--color-surface)]/90 backdrop-blur-md border border-[var(--color-border)] shadow-sm",
      bordered: "bg-transparent border border-[var(--color-border)]",
      flat: "bg-[var(--color-surface)] border-none shadow-none",
    };

    const hoverStyles = hoverable
      ? "hover:border-[#008080]/50 hover:shadow-[var(--shadow-card,0_1px_6px_rgba(0,0,0,0.08))] transition-all duration-150 cursor-pointer hover:-translate-y-0.5"
      : "";

    return (
      <div
        ref={ref}
        className={`rounded-[16px] p-5 ${variantStyles[variant]} ${hoverStyles} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = "", ...props }) => (
  <div className={`flex flex-col gap-1 mb-4 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ children, className = "", ...props }) => (
  <h3 className={`text-base sm:text-lg font-bold text-[var(--color-text)] ${className}`} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ children, className = "", ...props }) => (
  <p className={`text-xs sm:text-sm text-[var(--color-text-muted)] ${className}`} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = "", ...props }) => (
  <div className={`space-y-4 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = "", ...props }) => (
  <div className={`flex items-center justify-between pt-4 mt-4 border-t border-[var(--color-border)] ${className}`} {...props}>
    {children}
  </div>
);
