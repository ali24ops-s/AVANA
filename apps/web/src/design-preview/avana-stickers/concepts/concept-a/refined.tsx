import React from "react";

interface StickerProps {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Concept A (Refined): Pure Minimal Vector
 *
 * Core Design Rules:
 * - NO background aura badge/circle (true transparency & crisp silhouette)
 * - Single uniform stroke logic (2.5px primary, 1.8px secondary)
 * - Clean geometric primitives with gentle corner fillets
 * - Elimination of decorative ray bursts, page text lines, palm creases, and ribbon clutter
 * - Immediate recognition at 24px and 32px
 * - Color palette: Primary Teal (#008080), Accent Blue (#A7D0E6), Warm Ivory (#F0E6D2), Pure Surface (#FFFFFF)
 */

// 1. Greeting Hand (Refined Minimal Vector)
// Clean 4-finger open hand silhouette with thumb, single minimal wrist band in brand teal
export const GreetingHandA_Refined: React.FC<StickerProps> = ({
  size = 64,
  className = "",
  title = "دست خوشامدگویی مینیمال (اصلاح‌شده)",
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Sleeve / Wrist Cuff: Single minimal horizontal pill in AVANA Teal */}
      <rect x="22" y="48" width="20" height="6" rx="3" fill="#008080" />

      {/* Clean Palm & Fingers in Warm Ivory with sharp Teal outline */}
      <path
        d="M24 47V31C24 29.3431 25.3431 28 27 28C28.6569 28 30 29.3431 30 31V21C30 19.3431 31.3431 18 33 18C34.6569 18 36 19.3431 36 21V29M36 23C36 21.3431 37.3431 20 39 20C40.6569 20 42 21.3431 42 23V32M42 26C42 24.3431 43.3431 23 45 23C46.6569 23 48 24.3431 48 26V39C48 43.4183 44.4183 47 40 47H24Z"
        fill="#F0E6D2"
        stroke="#008080"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Gentle Thumb */}
      <path
        d="M24 37C21.7909 37 20 35.2091 20 33C20 30.7909 21.7909 29 24 29C25.5 29 27 30.2 27 32"
        fill="#F0E6D2"
        stroke="#008080"
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* Single minimal wave accent arc: 1 line only */}
      <path
        d="M51 20C54 23 55 27 55 31"
        stroke="#A7D0E6"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
};

// 2. Learning (Refined Minimal Vector)
// Open book matching AVANA's inverted chevron / V geometry. Zero fake text noise.
export const LearningA_Refined: React.FC<StickerProps> = ({
  size = 64,
  className = "",
  title = "کتاب مطالعه مینیمال (اصلاح‌شده)",
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Outer base cover in solid deep teal */}
      <path
        d="M14 44C21 41 28 42 32 45C36 42 43 41 50 44V23C43 20 36 21 32 24C28 21 21 20 14 23V44Z"
        fill="#006666"
      />

      {/* Left Page (Clean Ivory) */}
      <path
        d="M16 42C22 39.5 28 40.5 31.5 43V22C28 19 22 18.5 16 21V42Z"
        fill="#F0E6D2"
        stroke="#008080"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* Right Page (Pure White) */}
      <path
        d="M48 42C42 39.5 36 40.5 32.5 43V22C36 19 42 18.5 48 21V42Z"
        fill="#FFFFFF"
        stroke="#008080"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* Central Spine line */}
      <line x1="32" y1="23" x2="32" y2="44" stroke="#008080" strokeWidth="2.2" strokeLinecap="round" />

      {/* Single iconic bookmark ribbon in Accent Blue */}
      <path
        d="M32 23V37L29.5 35L27 37V22"
        fill="#A7D0E6"
        stroke="#008080"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// 3. Idea (Refined Minimal Vector)
// Clean bulb contour with AVANA letterform arch filament. No noisy ray bursts.
export const IdeaA_Refined: React.FC<StickerProps> = ({
  size = 64,
  className = "",
  title = "ایده و درک مطلب مینیمال (اصلاح‌شده)",
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Lightbulb Glass Shell */}
      <path
        d="M23 29C23 24.0294 27.0294 20 32 20C36.9706 20 41 24.0294 41 29C41 32.5 39 35.5 36 37C35.2 37.4 34.6 38.2 34.6 39.1V42H29.4V39.1C29.4 38.2 28.8 37.4 28 37C25 35.5 23 32.5 23 29Z"
        fill="#F0E6D2"
        stroke="#008080"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />

      {/* Central Filament: Shaped precisely like the AVANA 'A' apex arch */}
      <path
        d="M28 33L32 25L36 33"
        stroke="#008080"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="25" r="1.5" fill="#008080" />

      {/* Screw Base: 2 clean compact bars */}
      <rect x="29" y="43" width="6" height="2.2" rx="1.1" fill="#A7D0E6" />
      <rect x="30" y="46.5" width="4" height="2" rx="1" fill="#008080" />

      {/* Subtle top indicator dot representing light spark */}
      <circle cx="32" cy="14" r="2" fill="#008080" />
    </svg>
  );
};

// 4. Success (Refined Minimal Vector)
// Academic seal badge with single confident mastery checkmark. No messy ribbons or sparkles.
export const SuccessA_Refined: React.FC<StickerProps> = ({
  size = 64,
  className = "",
  title = "موفقیت مینیمال (اصلاح‌شده)",
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Outer Hex-Circle Seal in AVANA Teal */}
      <circle cx="32" cy="32" r="20" fill="#008080" />

      {/* Inner White Ring */}
      <circle cx="32" cy="32" r="16.5" fill="#FFFFFF" />

      {/* Central Warm Ivory Core */}
      <circle cx="32" cy="32" r="13" fill="#F0E6D2" />

      {/* Bold, Confident Mastery Checkmark */}
      <path
        d="M24.5 32L29.5 37L39.5 27"
        stroke="#008080"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// 5. Progress (Refined Minimal Vector)
// 3 clean ascending pillars with unified spacing and an upward trajectory notch.
export const ProgressA_Refined: React.FC<StickerProps> = ({
  size = 64,
  className = "",
  title = "پیشرفت و رشد مینیمال (اصلاح‌شده)",
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Clean baseline */}
      <line x1="16" y1="47" x2="48" y2="47" stroke="#E2E7EA" strokeWidth="2.4" strokeLinecap="round" />

      {/* Bar 1 (Beginning step): Light Blue */}
      <rect x="18" y="36" width="7" height="11" rx="3.5" fill="#A7D0E6" />

      {/* Bar 2 (Mid step): Secondary Teal */}
      <rect x="28.5" y="27" width="7" height="20" rx="3.5" fill="#5BA0C4" />

      {/* Bar 3 (Mastery / Peak step): Primary Teal */}
      <rect x="39" y="17" width="7" height="30" rx="3.5" fill="#008080" />

      {/* Floating Target Sprout Orb directly above the peak */}
      <circle cx="42.5" cy="11.5" r="2.5" fill="#F0E6D2" stroke="#008080" strokeWidth="1.8" />
    </svg>
  );
};

// 6. Empty State (Refined Minimal Vector)
// Balanced study stand with a single resting book. Peaceful negative space.
export const EmptyStateA_Refined: React.FC<StickerProps> = ({
  size = 64,
  className = "",
  title = "کتابخانه خالی مینیمال (اصلاح‌شده)",
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Minimal shelf baseline */}
      <line x1="16" y1="44" x2="48" y2="44" stroke="#008080" strokeWidth="2.4" strokeLinecap="round" />

      {/* Single upright master book */}
      <rect x="22" y="24" width="7" height="20" rx="2" fill="#008080" />
      <line x1="24.5" y1="28" x2="26.5" y2="28" stroke="#A7D0E6" strokeWidth="1.6" strokeLinecap="round" />

      {/* Companion tilting book resting on it */}
      <path
        d="M30 44L36 28C36.4 27 37.6 26.5 38.6 26.9L42.5 28.5C43.5 28.9 44 30.1 43.6 31.1L38.5 44H30Z"
        fill="#A7D0E6"
        stroke="#008080"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />

      {/* Expectant subtle bookmark dot */}
      <circle cx="45" cy="22" r="2" fill="#F0E6D2" stroke="#008080" strokeWidth="1.4" />
    </svg>
  );
};
