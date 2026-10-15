import React from "react";
import { AvaniVector, type AvaniPose } from "./AvaniVector.js";

export type AvaniVariant = AvaniPose;

export type AvaniSize = "xs" | "sm" | "md" | "lg" | "xl" | number;

export interface AvaniAvatarProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /**
   * Character pose variant:
   * - 'default' (or 'hero'): Neutral standing pose
   * - 'wave': Greeting pose waving arm (replaces waving hand emoji 👋)
   * - 'learning': Studying with open book
   * - 'thinking': Hand on chin, analyzing
   * - 'success': Cheerful celebration, arms raised
   * - 'idea': Holding up an idea spark
   * - 'processing': Busy working state
   * - 'empty': Calm relaxed posture for empty states
   * @default 'wave'
   */
  variant?: AvaniVariant;

  /**
   * Size preset or numeric pixel height:
   * - 'xs': 20px
   * - 'sm': 28px
   * - 'md': 34px (standard dashboard greeting height)
   * - 'lg': 48px
   * - 'xl': 64px
   * - number: specific height in pixels
   * @default 'md'
   */
  size?: AvaniSize;

  /**
   * Optional custom CSS class
   */
  className?: string;

  /**
   * Accessible alternative text.
   * Defaults to 'آوانی - دستیار یادگیری آوانا'.
   * Pass alt="" when decorative and accompanied by text (e.g. 'سلام علی').
   */
  alt?: string;

  /**
   * When true, renders inline SVG `<AvaniVector />` instead of `<img />`.
   * Useful for dynamic styling or CSS animation control.
   * @default false
   */
  asInlineSvg?: boolean;
}

const rawBase = import.meta.env.BASE_URL || "/";
const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;

const SIZE_PRESETS: Record<"xs" | "sm" | "md" | "lg" | "xl", number> = {
  xs: 20,
  sm: 28,
  md: 34,
  lg: 48,
  xl: 64,
};

// SVG ViewBox is 0 0 100 120 => Aspect ratio 100 / 120 = 0.833
const SVG_ASPECT_RATIO = 100 / 120;

export const AvaniAvatar: React.FC<AvaniAvatarProps> = ({
  variant = "wave",
  size = "md",
  className = "",
  alt = "آوانی - دستیار یادگیری آوانا",
  asInlineSvg = false,
  style,
  ...rest
}) => {
  const pixelHeight = typeof size === "number" ? size : SIZE_PRESETS[size] ?? 34;
  const pixelWidth = Math.round(pixelHeight * SVG_ASPECT_RATIO);

  // Normalize variant ('hero' is an alias for 'default')
  const normalizedVariant: AvaniPose = variant === "hero" ? "default" : variant;

  if (asInlineSvg) {
    return (
      <span
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={!alt ? true : undefined}
        style={{
          width: `${pixelWidth}px`,
          height: `${pixelHeight}px`,
          display: "inline-block",
          verticalAlign: "middle",
          userSelect: "none",
          ...style,
        }}
        className={`shrink-0 ${className}`.trim()}
      >
        <AvaniVector pose={normalizedVariant} size={pixelHeight} className="w-full h-full" />
      </span>
    );
  }

  const src = `${base}brand/avani-${normalizedVariant}.svg`;

  return (
    <img
      src={src}
      width={pixelWidth}
      height={pixelHeight}
      alt={alt}
      loading="eager"
      decoding="async"
      draggable={false}
      style={{
        width: `${pixelWidth}px`,
        height: `${pixelHeight}px`,
        aspectRatio: `${SVG_ASPECT_RATIO}`,
        objectFit: "contain",
        display: "inline-block",
        verticalAlign: "middle",
        userSelect: "none",
        ...style,
      }}
      className={`shrink-0 ${className}`.trim()}
      {...rest}
    />
  );
};

export default AvaniAvatar;
