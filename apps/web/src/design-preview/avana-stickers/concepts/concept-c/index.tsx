import React from "react";

interface StickerProps {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Concept C: Signature Character — "Avani / آوانی"
 *
 * Avani Visual Canon:
 * - Geometric Arch Form: Inspired by the organic curve of AVANA's 'A' logo
 * - Proportions: Compact, dignified scholarly silhouette (neither childish nor robotic)
 * - Signature Feature: Signature circular study goggles/lenses (عینک کاوش علمی)
 * - Apex Beacon: Top crest antenna representing intelligent synthesis and curiosity
 * - Consistent Palette: Primary Teal (#008080), Ivory faceplate (#FFFDF8), Light Sky highlights (#A7D0E6)
 */

// 1. Greeting Hand (Avani Greeting)
export const GreetingHandC: React.FC<StickerProps> = ({ size = 64, className = "", title = "آوانی — خوشامدگویی" }) => {
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
      {/* Background Soft Badge */}
      <circle cx="32" cy="32" r="28" fill="#F0F7F7" />

      {/* Avani Apex Crest Antenna */}
      <path d="M30 13C30 11.5 31 10 32 10C33 10 34 11.5 34 13V15H30V13Z" fill="#006666" />
      <circle cx="32" cy="9.5" r="2" fill="#A7D0E6" stroke="#008080" strokeWidth="0.8" />

      {/* Avani Main Body (The 'A' Arch Silhouette) */}
      <path
        d="M20 48C17 48 16 45 16 42C16 33 21 16 32 16C43 16 48 33 48 42C48 45 47 48 44 48H20Z"
        fill="#008080"
      />

      {/* Avani Belly / Lower Contour Highlight */}
      <path
        d="M22 48C21 44 25 39 32 39C39 39 43 44 42 48H22Z"
        fill="#A7D0E6"
        opacity="0.85"
      />

      {/* Faceplate (Ivory Oval) */}
      <ellipse cx="32" cy="27" rx="10" ry="7" fill="#FFFDF8" />

      {/* Avani's Signature Scholar Goggles / Eye-Frames */}
      {/* Left Frame */}
      <circle cx="28" cy="27" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
      {/* Right Frame */}
      <circle cx="36" cy="27" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
      {/* Bridge */}
      <path d="M32.2 27H31.8" stroke="#006060" strokeWidth="1.6" strokeLinecap="round" />

      {/* Expressive Warm Eyes */}
      <ellipse cx="28.5" cy="27" rx="1.8" ry="2.2" fill="#004D40" />
      <circle cx="29.2" cy="26" r="0.8" fill="#FFFFFF" />

      <ellipse cx="35.5" cy="27" rx="1.8" ry="2.2" fill="#004D40" />
      <circle cx="36.2" cy="26" r="0.8" fill="#FFFFFF" />

      {/* Friendly Gentle Smile */}
      <path d="M30 31.5C31 32.5 33 32.5 34 31.5" stroke="#004D40" strokeWidth="1.3" strokeLinecap="round" />

      {/* Left resting arm */}
      <path d="M17 38C16 40 16 43 18 44" stroke="#006666" strokeWidth="2.8" strokeLinecap="round" />

      {/* Raised Waving Right Arm / Paw */}
      <path
        d="M45 35C47 33 50 28 51 22C51 20 49 19.5 48 21C47 23 45 28 43 31"
        fill="#008080"
        stroke="#006060"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Waving Hand Palm in Ivory */}
      <circle cx="50" cy="21" r="3.2" fill="#FFF8EE" stroke="#006060" strokeWidth="1.2" />

      {/* Welcoming Energy Wave Dents */}
      <path d="M53 14C55 16 56 19 56 22" stroke="#008080" strokeWidth="2" strokeLinecap="round" />
      <path d="M56 11C59 14 60 18 60 22" stroke="#A7D0E6" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
};

// 2. Learning (Avani Studying)
export const LearningC: React.FC<StickerProps> = ({ size = 64, className = "", title = "آوانی — مطالعه و یادگیری" }) => {
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

      {/* Avani Apex Crest */}
      <path d="M30 11C30 9.5 31 8 32 8C33 8 34 9.5 34 11V13H30V11Z" fill="#006666" />
      <circle cx="32" cy="7.5" r="2" fill="#A7D0E6" stroke="#008080" strokeWidth="0.8" />

      {/* Avani Main Body Peeking behind book */}
      <path
        d="M20 42C17 42 16 37 16 34C16 25 21 13 32 13C43 13 48 25 48 34C48 37 47 42 44 42H20Z"
        fill="#008080"
      />

      {/* Faceplate */}
      <ellipse cx="32" cy="22" rx="10" ry="7" fill="#FFFDF8" />

      {/* Scholar Goggles / Reading Focus */}
      <circle cx="28" cy="22" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
      <circle cx="36" cy="22" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
      <path d="M32.2 22H31.8" stroke="#006060" strokeWidth="1.6" />

      {/* Focused downcast reading eyes */}
      <ellipse cx="28.5" cy="23.2" rx="1.8" ry="1.6" fill="#004D40" />
      <ellipse cx="35.5" cy="23.2" rx="1.8" ry="1.6" fill="#004D40" />
      <circle cx="29" cy="22.5" r="0.6" fill="#FFFFFF" />
      <circle cx="36" cy="22.5" r="0.6" fill="#FFFFFF" />

      {/* Study Tome in Foreground */}
      {/* Book Cover */}
      <path
        d="M12 49C19 46 27 47 32 50C37 47 45 46 52 49L50 32C43 30 36 31 32 34C28 31 21 30 14 32L12 49Z"
        fill="#006060"
      />
      {/* Left Page */}
      <path d="M14 47C20 44 27 45 31.5 48.5V32C27 29.5 20 29 14 31V47Z" fill="#FFFFFF" stroke="#A7D0E6" strokeWidth="1.2" />
      {/* Right Page */}
      <path d="M50 47C44 44 37 45 32.5 48.5V32C37 29.5 44 29 50 31V47Z" fill="#FFFFFF" stroke="#A7D0E6" strokeWidth="1.2" />

      {/* Little Paws holding the book sides */}
      <circle cx="16" cy="35" r="3" fill="#FFFDF8" stroke="#008080" strokeWidth="1.4" />
      <circle cx="48" cy="35" r="3" fill="#FFFDF8" stroke="#008080" strokeWidth="1.4" />

      {/* Bookmark Ribbon */}
      <path d="M32 34V46L30 44L28 46V33" fill="#008080" />
    </svg>
  );
};

// 3. Idea (Avani Eureka Insight)
export const IdeaC: React.FC<StickerProps> = ({ size = 64, className = "", title = "آوانی — جرقه ایده و بینش" }) => {
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

      {/* Glowing Eureka Spark radiating from Avani's Apex */}
      <circle cx="32" cy="10" r="5" fill="#FFE299" opacity="0.8" />
      <circle cx="32" cy="10" r="2.8" fill="#F2B84B" />
      {/* Radiating Light Beams */}
      <line x1="32" y1="2" x2="32" y2="5" stroke="#F2B84B" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="24" y1="5" x2="26" y2="7" stroke="#008080" strokeWidth="2" strokeLinecap="round" />
      <line x1="40" y1="5" x2="38" y2="7" stroke="#008080" strokeWidth="2" strokeLinecap="round" />
      <line x1="21" y1="10" x2="24" y2="10" stroke="#A7D0E6" strokeWidth="2" strokeLinecap="round" />
      <line x1="43" y1="10" x2="40" y2="10" stroke="#A7D0E6" strokeWidth="2" strokeLinecap="round" />

      {/* Apex Antenna */}
      <path d="M30 14V17H34V14H30Z" fill="#006666" />

      {/* Avani Body */}
      <path
        d="M20 50C17 50 16 46 16 42C16 32 21 17 32 17C43 17 48 32 48 42C48 46 47 50 44 50H20Z"
        fill="#008080"
      />

      {/* Light Blue Accent Belly */}
      <path d="M23 50C22 45 26 41 32 41C38 41 42 45 41 50H23Z" fill="#A7D0E6" opacity="0.85" />

      {/* Faceplate */}
      <ellipse cx="32" cy="29" rx="10" ry="7.5" fill="#FFFDF8" />

      {/* Goggles with Wide Eureka Eyes */}
      <circle cx="28" cy="29" r="4.6" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
      <circle cx="36" cy="29" r="4.6" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
      <path d="M32.2 29H31.8" stroke="#006060" strokeWidth="1.6" />

      {/* Wide Astonished Pupil */}
      <circle cx="28" cy="28.5" r="2.2" fill="#004D40" />
      <circle cx="29" cy="27.5" r="0.9" fill="#FFFFFF" />

      <circle cx="36" cy="28.5" r="2.2" fill="#004D40" />
      <circle cx="37" cy="27.5" r="0.9" fill="#FFFFFF" />

      {/* "O" Expression Mouth of Comprehension */}
      <ellipse cx="32" cy="33.5" rx="1.5" ry="1.8" fill="#004D40" />

      {/* Eureka Gesture Hand (One finger pointing up toward the idea) */}
      <path
        d="M45 40C47 37 50 32 50 25C50 23.5 48.5 23.5 47.5 25C46.5 27 45 32 43 36"
        fill="#008080"
        stroke="#006060"
        strokeWidth="1.2"
      />
      <circle cx="49" cy="24" r="2.2" fill="#FFFDF8" stroke="#006060" strokeWidth="1.2" />
    </svg>
  );
};

// 4. Success (Avani Triumph & Mastery)
export const SuccessC: React.FC<StickerProps> = ({ size = 64, className = "", title = "آوانی — نشان موفقیت و کمال" }) => {
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

      {/* Avani Apex Crest */}
      <path d="M30 15V18H34V15H30Z" fill="#006666" />
      <circle cx="32" cy="13.5" r="2" fill="#A7D0E6" stroke="#008080" strokeWidth="0.8" />

      {/* Avani Body */}
      <path
        d="M20 52C17 52 16 48 16 44C16 34 21 18 32 18C43 18 48 34 48 44C48 48 47 52 44 52H20Z"
        fill="#008080"
      />

      {/* Belly highlight */}
      <path d="M23 52C22 47 26 43 32 43C38 43 42 47 41 52H23Z" fill="#A7D0E6" opacity="0.85" />

      {/* Faceplate */}
      <ellipse cx="32" cy="29" rx="10" ry="7" fill="#FFFDF8" />

      {/* Happy Smiling Goggles (Arcs) */}
      <circle cx="28" cy="28.5" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
      <circle cx="36" cy="28.5" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
      <path d="M32.2 28.5H31.8" stroke="#006060" strokeWidth="1.6" />

      {/* Happy Crescent Eyes */}
      <path d="M26 29C26.8 27.5 29.2 27.5 30 29" stroke="#004D40" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M34 29C34.8 27.5 37.2 27.5 38 29" stroke="#004D40" strokeWidth="1.8" strokeLinecap="round" />

      {/* Joyful Big Smile */}
      <path d="M29.5 32.5C31 34.5 33 34.5 34.5 32.5" stroke="#004D40" strokeWidth="1.6" strokeLinecap="round" />

      {/* Avani Hoisting an Academic Mastery Badge / Laurel Seal in its hands */}
      <circle cx="32" cy="45" r="10.5" fill="#008080" stroke="#F0E6D2" strokeWidth="1.6" />
      <circle cx="32" cy="45" r="8" fill="#FFFFFF" />

      {/* Victory Checkmark on the Badge */}
      <path d="M27.5 45L30.5 48L36.5 42" stroke="#008080" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

      {/* Little Hands gripping the medal */}
      <circle cx="22" cy="44" r="2.8" fill="#FFFDF8" stroke="#008080" strokeWidth="1.2" />
      <circle cx="42" cy="44" r="2.8" fill="#FFFDF8" stroke="#008080" strokeWidth="1.2" />

      {/* Celebration sparkles around head */}
      <path d="M14 20L15 17L18 16L15 15L14 12L13 15L10 16L13 17L14 20Z" fill="#F0E6D2" stroke="#008080" strokeWidth="0.6" />
      <path d="M49 20L50 17L53 16L50 15L49 12L48 15L45 16L48 17L49 20Z" fill="#A7D0E6" stroke="#008080" strokeWidth="0.6" />
    </svg>
  );
};

// 5. Progress (Avani Climbing the Journey)
export const ProgressC: React.FC<StickerProps> = ({ size = 64, className = "", title = "آوانی — پیشرفت و بالندگی" }) => {
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

      {/* Ascending Learning Steps */}
      <rect x="10" y="44" width="12" height="8" rx="2" fill="#E2ECEF" stroke="#008080" strokeWidth="1.2" />
      <rect x="22" y="38" width="12" height="14" rx="2" fill="#A7D0E6" stroke="#008080" strokeWidth="1.2" />
      <rect x="34" y="30" width="12" height="22" rx="2" fill="#008080" stroke="#006060" strokeWidth="1.2" />

      {/* Avani Stepping Up / Progress Flag */}
      <g transform="translate(14, 4) scale(0.72)">
        {/* Avani Body */}
        <path
          d="M20 48C17 48 16 45 16 42C16 33 21 16 32 16C43 16 48 33 48 42C48 45 47 48 44 48H20Z"
          fill="#008080"
        />
        {/* Faceplate */}
        <ellipse cx="32" cy="27" rx="10" ry="7" fill="#FFFDF8" />
        {/* Goggles */}
        <circle cx="28" cy="27" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
        <circle cx="36" cy="27" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
        {/* Determined forward-looking eyes */}
        <ellipse cx="29" cy="26.5" rx="1.8" ry="2" fill="#004D40" />
        <ellipse cx="37" cy="26.5" rx="1.8" ry="2" fill="#004D40" />
        <circle cx="29.5" cy="25.5" r="0.6" fill="#FFFFFF" />
        <circle cx="37.5" cy="25.5" r="0.6" fill="#FFFFFF" />
      </g>

      {/* Knowledge Flag held by Avani atop the highest step */}
      <line x1="47" y1="12" x2="47" y2="35" stroke="#006060" strokeWidth="2" strokeLinecap="round" />
      <path d="M47 13L56 16.5L47 20V13Z" fill="#F0E6D2" stroke="#008080" strokeWidth="1.2" />
      <circle cx="47" cy="12" r="2" fill="#008080" />
    </svg>
  );
};

// 6. Empty State (Avani Awaiting New Content)
export const EmptyStateC: React.FC<StickerProps> = ({ size = 64, className = "", title = "آوانی — کتابخانه منتظر محتوا" }) => {
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

      {/* Empty Study Bench/Desk */}
      <rect x="12" y="44" width="40" height="5" rx="2.5" fill="#E8F1F5" stroke="#008080" strokeWidth="1.5" />

      {/* Avani sitting on the desk patiently */}
      <g transform="translate(10, 8) scale(0.7)">
        {/* Apex Crest */}
        <circle cx="32" cy="11" r="2.5" fill="#A7D0E6" stroke="#008080" strokeWidth="1" />
        {/* Body */}
        <path
          d="M20 48C17 48 16 45 16 42C16 33 21 16 32 16C43 16 48 33 48 42C48 45 47 48 44 48H20Z"
          fill="#008080"
        />
        {/* Faceplate */}
        <ellipse cx="32" cy="27" rx="10" ry="7" fill="#FFFDF8" />
        {/* Goggles */}
        <circle cx="28" cy="27" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
        <circle cx="36" cy="27" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
        {/* Friendly Expectant Eyes looking at user */}
        <circle cx="28" cy="27" r="2" fill="#004D40" />
        <circle cx="36" cy="27" r="2" fill="#004D40" />
        <circle cx="29" cy="26" r="0.7" fill="#FFFFFF" />
        <circle cx="37" cy="26" r="0.7" fill="#FFFFFF" />
        {/* Gentle invitational smile */}
        <path d="M30 31.5C31 32.5 33 32.5 34 31.5" stroke="#004D40" strokeWidth="1.4" strokeLinecap="round" />
      </g>

      {/* An open clean study notebook awaiting lessons */}
      <path
        d="M38 43C42 41 46 41 49 43V36C46 34 42 34 38 36V43Z"
        fill="#FFFFFF"
        stroke="#008080"
        strokeWidth="1.2"
      />
      <line x1="44" y1="35" x2="44" y2="42" stroke="#008080" strokeWidth="1" />

      {/* Floating gentle thoughts / invitation bubbles */}
      <circle cx="43" cy="25" r="2" fill="#008080" opacity="0.4" />
      <circle cx="48" cy="28" r="1.3" fill="#A7D0E6" opacity="0.6" />
      <circle cx="51" cy="24" r="1.8" fill="#F0E6D2" stroke="#008080" strokeWidth="0.8" />
    </svg>
  );
};
