import React from "react";
import { Link } from "react-router-dom";

export interface BrandLogoProps {
  /**
   * Display variant:
   * - 'full': Always renders Logo Mark + Wordmark
   * - 'logo-only': Renders only the Logo Mark
   * - 'wordmark-only': Renders only the Wordmark
   * - 'responsive': Shows Logo only on mobile/narrow viewports, Logo + Wordmark on desktop (md+)
   */
  variant?: "full" | "logo-only" | "wordmark-only" | "responsive";

  /**
   * Size presets or height control
   * sm: h-7 logo
   * md: h-9 logo (standard header)
   * lg: h-12 logo (auth cards)
   * xl: h-16 logo
   */
  size?: "sm" | "md" | "lg" | "xl";

  /**
   * Optional navigation target (wraps brand in Link)
   */
  linkTo?: string;

  /**
   * Optional subtitle displayed below the brand (e.g. 'آموزش هوشمند پزشکی')
   */
  subtitle?: string;

  /**
   * Extra container class name
   */
  className?: string;

  /**
   * Extra classes for the logo mark image
   */
  logoClassName?: string;

  /**
   * Extra classes for the wordmark image
   */
  wordmarkClassName?: string;

  /**
   * Optional visual lighting glow enhancement
   */
  glow?: boolean;

  /**
   * Click handler if not using linkTo
   */
  onClick?: () => void;
}

const rawBase = import.meta.env.BASE_URL || "/";
const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;

export const BRAND_LOGO_SRC = `${base}brand/avana-logo.svg`;
export const BRAND_WORDMARK_SRC = `${base}brand/avana-wordmark.svg`;

const SIZE_MAP = {
  sm: {
    logo: "h-6 w-auto",
    wordmark: "h-4 w-auto",
    gap: "gap-2",
  },
  md: {
    logo: "h-9 w-auto",
    wordmark: "h-6 w-auto",
    gap: "gap-2.5",
  },
  lg: {
    logo: "h-12 w-auto",
    wordmark: "h-8 w-auto",
    gap: "gap-3",
  },
  xl: {
    logo: "h-16 w-auto",
    wordmark: "h-10 w-auto",
    gap: "gap-4",
  },
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = "logo-only",
  size = "md",
  linkTo,
  subtitle,
  className = "",
  logoClassName = "",
  wordmarkClassName = "",
  glow = true,
  onClick,
}) => {
  const sizeConfig = SIZE_MAP[size];

  const showLogo = variant !== "wordmark-only";
  const showWordmark = variant !== "logo-only";
  const isResponsiveWordmark = variant === "responsive";

  const glowEffect = glow ? "drop-shadow-[0_0_12px_rgba(45,212,191,0.25)]" : "";

  const content = (
    <div
      className={`inline-flex items-center ${sizeConfig.gap} select-none bg-transparent ${
        linkTo ? "" : className
      }`}
      onClick={onClick}
    >
      {showLogo && (
        <img
          src={BRAND_LOGO_SRC}
          alt="لوگوی آوانا"
          className={`object-contain shrink-0 transition-transform duration-300 ${sizeConfig.logo} ${glowEffect} ${logoClassName}`}
          loading="eager"
        />
      )}

      {showWordmark && (
        <div className="flex flex-col justify-center bg-transparent">
          <img
            src={BRAND_WORDMARK_SRC}
            alt="AVANA"
            className={`object-contain shrink-0 transition-transform duration-300 ${sizeConfig.wordmark} ${glowEffect} ${
              isResponsiveWordmark ? "hidden md:block" : ""
            } ${wordmarkClassName}`}
            loading="eager"
          />
          {subtitle && (
            <span
              className={`text-[10px] sm:text-xs text-slate-400 leading-tight mt-0.5 ${
                isResponsiveWordmark ? "hidden md:block" : ""
              }`}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (linkTo) {
    return (
      <Link
        to={linkTo}
        className={`inline-flex items-center bg-transparent focus:outline-none ${className}`}
        aria-label="صفحه اصلی آوانا"
      >
        {content}
      </Link>
    );
  }

  return content;
};
