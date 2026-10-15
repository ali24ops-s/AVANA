import React from "react";

interface StickerProps {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Concept B: Soft 3D
 * Characteristics:
 * - Volumetric, tactile, soft-touch clay & frosted ceramic aesthetics
 * - Multi-stop linear & radial gradients to convey organic form curvature
 * - Gentle ambient occlusion and directional soft shadows (top-left key light)
 * - Restrained highlights (no garish plastic reflections or Apple emoji gloss)
 * - Brand harmony: Teal (#008080), Light Sky (#A7D0E6), Warm Ivory (#F0E6D2)
 */

// 1. Greeting Hand (Soft 3D)
export const GreetingHandB: React.FC<StickerProps> = ({ size = 64, className = "", title = "دست خوشامدگویی سه‌بعدی نرم" }) => {
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
      <defs>
        {/* Soft Shadow Filter */}
        <filter id="b-drop-shadow" x="-10%" y="-10%" width="130%" height="130%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor="#004D40" floodOpacity="0.14" />
        </filter>
        <filter id="b-finger-shadow" x="-20%" y="-20%" width="140%" height="140%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1" floodColor="#9C784C" floodOpacity="0.16" />
        </filter>

        {/* 3D Skin/Hand Gradients */}
        <linearGradient id="b-palm-grad" x1="24" y1="20" x2="40" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFDF7" />
          <stop offset="60%" stopColor="#F7EADB" />
          <stop offset="100%" stopColor="#EAD2BA" />
        </linearGradient>

        <linearGradient id="b-finger-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFDF8" />
          <stop offset="85%" stopColor="#F5E7D5" />
          <stop offset="100%" stopColor="#E2C7AA" />
        </linearGradient>

        {/* 3D Sleeve Teal Gradient */}
        <linearGradient id="b-sleeve-grad" x1="20" y1="44" x2="44" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1DA5A5" />
          <stop offset="40%" stopColor="#008080" />
          <stop offset="100%" stopColor="#005A5A" />
        </linearGradient>

        {/* Background Soft Glow */}
        <radialGradient id="b-bg-aura" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#E2F2F2" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#F4F9FA" stopOpacity="0.3" />
        </radialGradient>

        <linearGradient id="b-cuff-rim" x1="20" y1="44" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#CBE5F0" />
          <stop offset="100%" stopColor="#87B9D4" />
        </linearGradient>
      </defs>

      {/* Background Soft Plinth/Aura */}
      <circle cx="32" cy="32" r="28" fill="url(#b-bg-aura)" />

      {/* Main Hand Assembly with Filter */}
      <g filter="url(#b-drop-shadow)">
        {/* Palm base */}
        <rect x="23" y="29" width="18" height="16" rx="8" fill="url(#b-palm-grad)" />

        {/* Pinky Finger */}
        <rect x="39" y="26" width="5" height="12" rx="2.5" fill="url(#b-finger-grad)" filter="url(#b-finger-shadow)" />

        {/* Ring Finger */}
        <rect x="34" y="21" width="5.2" height="16" rx="2.6" fill="url(#b-finger-grad)" filter="url(#b-finger-shadow)" />

        {/* Middle Finger (tallest) */}
        <rect x="29" y="17" width="5.4" height="20" rx="2.7" fill="url(#b-finger-grad)" filter="url(#b-finger-shadow)" />

        {/* Index Finger */}
        <rect x="24" y="20" width="5.2" height="17" rx="2.6" fill="url(#b-finger-grad)" filter="url(#b-finger-shadow)" />

        {/* Thumb extending comfortably */}
        <path
          d="M25 38C22 38 18.5 35.5 18.5 32.5C18.5 29.8 20.8 28 23 28C24.8 28 26.5 29.5 27 32L26 38H25Z"
          fill="url(#b-palm-grad)"
          filter="url(#b-finger-shadow)"
        />

        {/* Palm Inner Volume Pill */}
        <ellipse cx="32" cy="38" rx="6" ry="4.5" fill="#FCEFE1" opacity="0.7" />

        {/* Volumetric Sleeve Cuff */}
        <rect x="20" y="44" width="24" height="11" rx="5" fill="url(#b-sleeve-grad)" />
        {/* Cuff Trim 3D Torus Highlight */}
        <rect x="21" y="44" width="22" height="2.8" rx="1.4" fill="url(#b-cuff-rim)" />
      </g>

      {/* Floating 3D Greeting Wave Orbs */}
      <circle cx="49" cy="18" r="2.8" fill="#1DA5A5" opacity="0.85" filter="url(#b-drop-shadow)" />
      <circle cx="53" cy="26" r="2.1" fill="#A7D0E6" opacity="0.9" filter="url(#b-drop-shadow)" />
    </svg>
  );
};

// 2. Learning (Soft 3D)
export const LearningB: React.FC<StickerProps> = ({ size = 64, className = "", title = "کتاب و مطالعه سه‌بعدی نرم" }) => {
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
      <defs>
        <filter id="b-book-shadow" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#003333" floodOpacity="0.18" />
        </filter>
        <linearGradient id="b-cover-grad" x1="12" y1="18" x2="52" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#009696" />
          <stop offset="50%" stopColor="#008080" />
          <stop offset="100%" stopColor="#004D4D" />
        </linearGradient>
        <linearGradient id="b-pages-left" x1="14" y1="20" x2="31" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="70%" stopColor="#F9F5EC" />
          <stop offset="100%" stopColor="#E9DFCA" />
        </linearGradient>
        <linearGradient id="b-pages-right" x1="50" y1="20" x2="33" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="70%" stopColor="#F9F5EC" />
          <stop offset="100%" stopColor="#E9DFCA" />
        </linearGradient>
      </defs>

      <circle cx="32" cy="32" r="28" fill="#F4F9FA" />

      {/* Main 3D Open Book */}
      <g filter="url(#b-book-shadow)">
        {/* Outer Beveled Cover Base */}
        <path
          d="M10 44C19 41 28 42 32 46C36 42 45 41 54 44L52 20C44 17 35 18 32 22C29 18 20 17 12 20L10 44Z"
          fill="url(#b-cover-grad)"
        />

        {/* Left Curved Volumetric Page Block */}
        <path
          d="M12 41C19 38 27 39 31.5 43.5V20C27 16 19 15 12 18V41Z"
          fill="url(#b-pages-left)"
        />

        {/* Right Curved Volumetric Page Block */}
        <path
          d="M52 41C45 38 37 39 32.5 43.5V20C37 16 45 15 52 18V41Z"
          fill="url(#b-pages-right)"
        />

        {/* Soft Spine Crease / Ambient Valley */}
        <path d="M32 20V45" stroke="#004D4D" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />

        {/* Embossed Bookmark Ribbon with 3D Depth */}
        <path
          d="M32 21V41L29.5 38.5L27 41V20"
          fill="#009696"
          filter="url(#b-drop-shadow)"
        />
        <path d="M32 20V32" stroke="#4DB6AC" strokeWidth="1.2" />

        {/* Embossed Text Lines (Soft Deboss) */}
        <rect x="17" y="24" width="9" height="1.8" rx="0.9" fill="#B3D9D9" />
        <rect x="17" y="29" width="10" height="1.8" rx="0.9" fill="#B3D9D9" />
        <rect x="17" y="34" width="7" height="1.8" rx="0.9" fill="#B3D9D9" />

        <rect x="37" y="24" width="10" height="1.8" rx="0.9" fill="#B3D9D9" />
        <rect x="37" y="29" width="9" height="1.8" rx="0.9" fill="#B3D9D9" />
        <rect x="40" y="34" width="7" height="1.8" rx="0.9" fill="#B3D9D9" />
      </g>
    </svg>
  );
};

// 3. Idea (Soft 3D)
export const IdeaB: React.FC<StickerProps> = ({ size = 64, className = "", title = "ایده و بینش سه‌بعدی نرم" }) => {
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
      <defs>
        <filter id="b-bulb-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#008080" floodOpacity="0.25" />
        </filter>
        <radialGradient id="b-bulb-body" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#F9F1DF" />
          <stop offset="80%" stopColor="#F2DDB8" />
          <stop offset="100%" stopColor="#DFB97D" />
        </radialGradient>
        <linearGradient id="b-base-metal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#A7D0E6" />
          <stop offset="50%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#5B9CBD" />
        </linearGradient>
      </defs>

      <circle cx="32" cy="32" r="28" fill="#F4F9FA" />

      {/* Floating 3D Idea Spark Particles */}
      <circle cx="16" cy="18" r="2.5" fill="#A7D0E6" opacity="0.8" />
      <circle cx="48" cy="18" r="2.5" fill="#A7D0E6" opacity="0.8" />
      <circle cx="32" cy="9" r="3" fill="#008080" opacity="0.85" />

      {/* 3D Bulb Assembly */}
      <g filter="url(#b-bulb-glow)">
        {/* Soft Rounded Glass Body */}
        <path
          d="M21 28C21 21.9249 25.9249 17 32 17C38.0751 17 43 21.9249 43 28C43 32.1 40.7 35.7 37.4 37.6C36.3 38.2 35.6 39.4 35.6 40.7V42H28.4V40.7C28.4 39.4 27.7 38.2 26.6 37.6C23.3 35.7 21 32.1 21 28Z"
          fill="url(#b-bulb-body)"
        />

        {/* Internal Soft Glowing Filament Core */}
        <ellipse cx="32" cy="27" rx="5.5" ry="5.5" fill="#FFF5D6" />
        <path
          d="M29 29C29 27.3431 30.3431 26 32 26C33.6569 26 35 27.3431 35 29C35 30.8 33.2 32 32 33.5"
          stroke="#E09F3E"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* 3D Metal Screw Rings */}
        <rect x="28" y="42.5" width="8" height="2.5" rx="1.25" fill="url(#b-base-metal)" />
        <rect x="28.5" y="45.5" width="7" height="2.5" rx="1.25" fill="url(#b-base-metal)" />
        {/* Soft rounded contact tip */}
        <path d="M29.5 48.5C29.5 48.5 30 51 32 51C34 51 34.5 48.5 34.5 48.5H29.5Z" fill="#3D5A6C" />
      </g>
    </svg>
  );
};

// 4. Success (Soft 3D)
export const SuccessB: React.FC<StickerProps> = ({ size = 64, className = "", title = "موفقیت سه‌بعدی نرم" }) => {
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
      <defs>
        <filter id="b-medal-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="4.5" floodColor="#004D40" floodOpacity="0.2" />
        </filter>
        <radialGradient id="b-medal-bevel" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#2BB8B8" />
          <stop offset="60%" stopColor="#008080" />
          <stop offset="100%" stopColor="#004D4D" />
        </radialGradient>
        <radialGradient id="b-inner-plaque" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="70%" stopColor="#F9F6ED" />
          <stop offset="100%" stopColor="#E2D4BA" />
        </radialGradient>
        <linearGradient id="b-ribbon-left" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A7D0E6" />
          <stop offset="100%" stopColor="#5A96B8" />
        </linearGradient>
      </defs>

      <circle cx="32" cy="32" r="28" fill="#F4F9FA" />

      {/* 3D Folded Ribbon Tails */}
      <path d="M24 38L18 53L27 49L30 53L31 40" fill="url(#b-ribbon-left)" />
      <path d="M40 38L46 53L37 49L34 53L33 40" fill="url(#b-ribbon-left)" />

      {/* 3D Medal Body with Beveled Chamfer */}
      <g filter="url(#b-medal-shadow)">
        <circle cx="32" cy="29" r="18" fill="url(#b-medal-bevel)" />
        {/* Inset Ring */}
        <circle cx="32" cy="29" r="14.5" fill="url(#b-inner-plaque)" />

        {/* Embossed 3D Tick / Checkmark */}
        <path
          d="M24 29.5L29.5 35L40 23.5"
          stroke="#008080"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Soft highlight tick reflection */}
        <path
          d="M24.5 28.5L29.5 33.5L39.5 22.5"
          stroke="#FFFFFF"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.6"
        />
      </g>
    </svg>
  );
};

// 5. Progress (Soft 3D)
export const ProgressB: React.FC<StickerProps> = ({ size = 64, className = "", title = "پیشرفت و رشد سه‌بعدی نرم" }) => {
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
      <defs>
        <filter id="b-progress-shadow" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor="#003B3B" floodOpacity="0.16" />
        </filter>
        <linearGradient id="b-bar-1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#CBE5F2" />
          <stop offset="100%" stopColor="#8ABED9" />
        </linearGradient>
        <linearGradient id="b-bar-2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8DC2DD" />
          <stop offset="100%" stopColor="#519ABA" />
        </linearGradient>
        <linearGradient id="b-bar-3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1DA5A5" />
          <stop offset="100%" stopColor="#006060" />
        </linearGradient>
        <radialGradient id="b-sphere" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#FFF9EB" />
          <stop offset="60%" stopColor="#F2D7A5" />
          <stop offset="100%" stopColor="#C99B4B" />
        </radialGradient>
      </defs>

      <circle cx="32" cy="32" r="28" fill="#F4F9FA" />

      {/* 3D Foundation Pod */}
      <ellipse cx="32" cy="49" rx="20" ry="4" fill="#E2ECEF" />

      {/* 3D Rounded Cylinder Bars */}
      <g filter="url(#b-progress-shadow)">
        {/* Bar 1 */}
        <rect x="15" y="37" width="8" height="11" rx="4" fill="url(#b-bar-1)" />
        {/* Bar 2 */}
        <rect x="26" y="29" width="8" height="19" rx="4" fill="url(#b-bar-2)" />
        {/* Bar 3 (Peak) */}
        <rect x="37" y="19" width="8" height="29" rx="4" fill="url(#b-bar-3)" />

        {/* Floating Ascent Milestone Sphere */}
        <circle cx="48" cy="14" r="5" fill="url(#b-sphere)" />
        {/* Floating Orb Shadow / Energy Glow */}
        <ellipse cx="48" cy="22" rx="3.5" ry="1.2" fill="#008080" opacity="0.2" />
      </g>
    </svg>
  );
};

// 6. Empty State (Soft 3D)
export const EmptyStateB: React.FC<StickerProps> = ({ size = 64, className = "", title = "کتابخانه منتظر سه‌بعدی نرم" }) => {
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
      <defs>
        <filter id="b-empty-shadow" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#002E2E" floodOpacity="0.14" />
        </filter>
        <linearGradient id="b-shelf-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E0EDF2" />
        </linearGradient>
        <linearGradient id="b-rest-book" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2BB8B8" />
          <stop offset="100%" stopColor="#006666" />
        </linearGradient>
      </defs>

      <circle cx="32" cy="32" r="28" fill="#F4F9FA" />

      {/* Floating 3D Rounded Shelf Plinth */}
      <g filter="url(#b-empty-shadow)">
        <rect x="13" y="42" width="38" height="6" rx="3" fill="url(#b-shelf-grad)" />

        {/* Single Volumetric Standing Book with Rounded Spine */}
        <rect x="19" y="24" width="7.5" height="18" rx="2.5" fill="url(#b-rest-book)" />
        <rect x="20" y="25" width="2" height="16" rx="1" fill="#FFFFFF" opacity="0.35" />

        {/* Companion Tilting Pastel Book */}
        <path
          d="M28 42L34 26C34.5 25 35.8 24.5 36.8 25L41.3 27C42.3 27.5 42.8 28.8 42.3 29.8L36.3 42H28Z"
          fill="#A7D0E6"
        />

        {/* Gentle 3D Waiting Feather / Bookmark resting */}
        <path
          d="M45 36C47 34 49 34 49 36C49 38 47 40 45 40"
          stroke="#D8A854"
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* Soft floating expectation orbs */}
        <circle cx="46" cy="24" r="2" fill="#008080" opacity="0.4" />
        <circle cx="50" cy="29" r="1.5" fill="#A7D0E6" opacity="0.6" />
      </g>
    </svg>
  );
};
