import React from "react";

interface StickerProps {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Concept A: Minimal Vector
 * Characteristics:
 * - Clean geometric 2D vectors
 * - 2-3px balanced stroke weights with soft rounded caps
 * - AVANA brand palette: Teal (#008080), Light Blue (#A7D0E6), Ivory (#F0E6D2), Deep Teal (#006060)
 * - Academic, dignified, readable from 24px to 128px
 */

// 1. Greeting Hand (Minimal Vector)
export const GreetingHandA: React.FC<StickerProps> = ({ size = 64, className = "", title = "دست خوشامدگویی مینیمال" }) => {
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
      {/* Background soft aura badge */}
      <circle cx="32" cy="32" r="28" fill="#F0F7F7" />

      {/* Sleeve / Cuff in AVANA Teal */}
      <path
        d="M20 49C20 46.7909 21.7909 45 24 45H40C42.2091 45 44 46.7909 44 49V53C44 54.1046 43.1046 55 42 55H22C20.8954 55 20 54.1046 20 53V49Z"
        fill="#008080"
      />
      {/* Sleeve trim highlight */}
      <path d="M22 45H42" stroke="#A7D0E6" strokeWidth="2" strokeLinecap="round" />

      {/* Hand & Palm Outline with Ivory Warm fill */}
      <path
        d="M23 44V34C23 32.3431 24.3431 31 26 31C27.6569 31 29 32.3431 29 34V22C29 20.3431 30.3431 19 32 19C33.6569 19 35 20.3431 35 22V33M35 25C35 23.3431 36.3431 22 38 22C39.6569 22 41 23.3431 41 25V35M41 28C41 26.3431 42.3431 25 44 25C45.6569 25 47 26.3431 47 28V39C47 43.4183 43.4183 47 39 47H27C24.7909 47 23 45.2091 23 43"
        fill="#FFF9EE"
        stroke="#006666"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Thumb */}
      <path
        d="M23 37C20.7909 37 19 35.2091 19 33C19 30.7909 20.7909 29 23 29C24.5 29 26 30.5 26 33"
        fill="#FFF9EE"
        stroke="#006666"
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* Palm crease detail */}
      <path d="M30 38C32 40 36 41 39 39" stroke="#E2C99D" strokeWidth="1.8" strokeLinecap="round" />

      {/* Welcoming wave aura motion lines */}
      <path d="M47 16C50 18.5 52 22 52 26" stroke="#008080" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M51 11C55 14.5 57 19.5 57 25" stroke="#A7D0E6" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
};

// 2. Learning (Minimal Vector)
export const LearningA: React.FC<StickerProps> = ({ size = 64, className = "", title = "کتاب و مطالعه مینیمال" }) => {
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
      <circle cx="32" cy="32" r="28" fill="#F0F7F7" />

      {/* Book Covers Outer Shadow Layer */}
      <path
        d="M10 46C18 43 28 44 32 48C36 44 46 43 54 46V22C46 19 36 20 32 24C28 20 18 19 10 22V46Z"
        fill="#006666"
      />

      {/* Left Page (Ivory paper with gentle curve) */}
      <path
        d="M12 43C19 40.5 27 41.5 31 45.5V22C27 18 19 17 12 19.5V43Z"
        fill="#FFFFFF"
        stroke="#008080"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Right Page */}
      <path
        d="M52 43C45 40.5 37 41.5 33 45.5V22C37 18 45 17 52 19.5V43Z"
        fill="#FFFFFF"
        stroke="#008080"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* Text lines on left page */}
      <line x1="17" y1="26" x2="26" y2="24.5" stroke="#A7D0E6" strokeWidth="2" strokeLinecap="round" />
      <line x1="17" y1="31" x2="27" y2="29.5" stroke="#A7D0E6" strokeWidth="2" strokeLinecap="round" />
      <line x1="17" y1="36" x2="24" y2="34.5" stroke="#A7D0E6" strokeWidth="2" strokeLinecap="round" />

      {/* Text lines on right page */}
      <line x1="38" y1="24.5" x2="47" y2="26" stroke="#A7D0E6" strokeWidth="2" strokeLinecap="round" />
      <line x1="37" y1="29.5" x2="47" y2="31" stroke="#A7D0E6" strokeWidth="2" strokeLinecap="round" />
      <line x1="40" y1="34.5" x2="47" y2="36" stroke="#A7D0E6" strokeWidth="2" strokeLinecap="round" />

      {/* Bookmark Ribbon in Teal */}
      <path
        d="M32 24V40L29.5 37.5L27 40V23"
        fill="#008080"
        stroke="#006060"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Spine Pin / Core */}
      <path d="M32 23V47" stroke="#008080" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
};

// 3. Idea (Minimal Vector)
export const IdeaA: React.FC<StickerProps> = ({ size = 64, className = "", title = "ایده و درک مطلب مینیمال" }) => {
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
      <circle cx="32" cy="32" r="28" fill="#F0F7F7" />

      {/* Radiating geometric insight rays */}
      <line x1="32" y1="8" x2="32" y2="12" stroke="#008080" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="15" y1="15" x2="18" y2="18" stroke="#A7D0E6" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="49" y1="15" x2="46" y2="18" stroke="#A7D0E6" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="8" y1="31" x2="12" y2="31" stroke="#008080" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="52" y1="31" x2="56" y2="31" stroke="#008080" strokeWidth="2.4" strokeLinecap="round" />

      {/* Bulb Glass Body */}
      <path
        d="M22 30C22 24.4772 26.4772 20 32 20C37.5228 20 42 24.4772 42 30C42 33.8 39.8 37.1 36.6 38.7C35.6 39.2 35 40.2 35 41.3V44H29V41.3C29 40.2 28.4 39.2 27.4 38.7C24.2 37.1 22 33.8 22 30Z"
        fill="#FFF9EE"
        stroke="#008080"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />

      {/* Inner Synapse / Filament */}
      <path
        d="M29 32C29 30 30.5 28.5 32 28.5C33.5 28.5 35 30 35 32C35 34 32 35 32 38"
        stroke="#008080"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="27" r="1.8" fill="#008080" />

      {/* Metal Base Screws */}
      <rect x="29" y="45" width="6" height="2" rx="1" fill="#A7D0E6" stroke="#006666" strokeWidth="1" />
      <rect x="30" y="48" width="4" height="2" rx="1" fill="#A7D0E6" stroke="#006666" strokeWidth="1" />
      <path d="M30.5 51H33.5" stroke="#006666" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};

// 4. Success (Minimal Vector)
export const SuccessA: React.FC<StickerProps> = ({ size = 64, className = "", title = "موفقیت و پایان درس مینیمال" }) => {
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
      <circle cx="32" cy="32" r="28" fill="#F0F7F7" />

      {/* Ribbon Tails */}
      <path d="M25 43L21 54L28 51L32 54V44" fill="#A7D0E6" stroke="#008080" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M39 43L43 54L36 51L32 54V44" fill="#A7D0E6" stroke="#008080" strokeWidth="1.8" strokeLinejoin="round" />

      {/* Rosette Outer Scallops / Geometric Badge */}
      <circle cx="32" cy="30" r="19" fill="#008080" />
      <circle cx="32" cy="30" r="16" fill="#FFFFFF" stroke="#F0E6D2" strokeWidth="2" />
      <circle cx="32" cy="30" r="13" fill="#E8F4F4" />

      {/* Bold Academic Mastery Checkmark */}
      <path
        d="M24 30.5L29.5 36L40 25.5"
        stroke="#008080"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Sparkles / Mastery Stars */}
      <path d="M14 17L15.5 13.5L19 12L15.5 10.5L14 7L12.5 10.5L9 12L12.5 13.5L14 17Z" fill="#F0E6D2" stroke="#008080" strokeWidth="0.8" />
      <path d="M49 19L50 16.5L52.5 15.5L50 14.5L49 12L48 14.5L45.5 15.5L48 16.5L49 19Z" fill="#008080" />
    </svg>
  );
};

// 5. Progress (Minimal Vector)
export const ProgressA: React.FC<StickerProps> = ({ size = 64, className = "", title = "پیشرفت و رشد مسیر یادگیری مینیمال" }) => {
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
      <circle cx="32" cy="32" r="28" fill="#F0F7F7" />

      {/* Base baseline */}
      <line x1="14" y1="48" x2="50" y2="48" stroke="#E2E7EA" strokeWidth="2.4" strokeLinecap="round" />

      {/* Progress Metric Bar 1 */}
      <rect x="16" y="38" width="7" height="10" rx="3.5" fill="#A7D0E6" stroke="#008080" strokeWidth="1.8" />

      {/* Progress Metric Bar 2 */}
      <rect x="26" y="31" width="7" height="17" rx="3.5" fill="#A7D0E6" stroke="#008080" strokeWidth="1.8" />

      {/* Progress Metric Bar 3 (Active / Peak) */}
      <rect x="36" y="22" width="7" height="26" rx="3.5" fill="#008080" stroke="#006060" strokeWidth="1.8" />

      {/* Upward Dynamic Milestone Arrow */}
      <path
        d="M17 31C24 25 33 21 46 14"
        stroke="#008080"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="1 0"
      />
      <path
        d="M40 13H47V20"
        stroke="#008080"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Floating Target Star / Sprout node */}
      <circle cx="47" cy="14" r="3.5" fill="#F0E6D2" stroke="#008080" strokeWidth="1.6" />
    </svg>
  );
};

// 6. Empty State (Minimal Vector)
export const EmptyStateA: React.FC<StickerProps> = ({ size = 64, className = "", title = "وضعیت خالی و کتابخانه منتظر مینیمال" }) => {
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
      <circle cx="32" cy="32" r="28" fill="#F0F7F7" />

      {/* Clean Desk / Bookshelf plank */}
      <path
        d="M12 43C12 41.8954 12.8954 41 14 41H50C51.1046 41 52 41.8954 52 43V45C52 46.1046 51.1046 47 50 47H14C12.8954 47 12 46.1046 12 45V43Z"
        fill="#E8F1F5"
        stroke="#008080"
        strokeWidth="2"
      />

      {/* A single standing book ready for learning */}
      <rect x="18" y="23" width="7" height="18" rx="2" fill="#008080" stroke="#006060" strokeWidth="1.6" />
      <line x1="20" y1="26" x2="23" y2="26" stroke="#A7D0E6" strokeWidth="1.5" strokeLinecap="round" />

      {/* Leaning companion book */}
      <path
        d="M26 41L32 25C32.4 24 33.6 23.5 34.6 23.9L39.3 25.8C40.3 26.2 40.8 27.4 40.4 28.4L34.4 41H26Z"
        fill="#A7D0E6"
        stroke="#008080"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* Peaceful empty negative space with an open bookmark feather */}
      <path
        d="M45 28C47 28 48 30 48 32C48 34 47 36 45 36"
        stroke="#E2C99D"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Gentle floating dots indicating expectation */}
      <circle cx="43" cy="22" r="1.5" fill="#008080" />
      <circle cx="48" cy="24" r="1" fill="#A7D0E6" />
    </svg>
  );
};
