import React from "react";

interface ViewProps {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * ============================================================================
 * CONCEPT 1: AVANI SPROUT (آوانی جوانه — بذر دانش و رویش)
 *
 * Directly channels the beloved reference image:
 * - Plump, rounded pear/seed silhouette
 * - Iconic twin sprout leaves atop the crown representing learning and growth
 * - Short cuddly paddle arms and grounded chubby paws
 * - Expressive round eyes with teal irises & catchlights, gentle smile, and warm coral blush
 * ============================================================================
 */
export const AvaniSprout = {
  id: "avani-sprout",
  nameFa: "کانسپت ۱: آوانی جوانه (The Growth Seed)",
  nameEn: "Avani Sprout",
  conceptDescFa:
    "ترجمه دقیق و دوست‌داشتنی تصویر مرجع در زبان وکتور تخت آوانا؛ کالبد دانه‌ای گلابی‌شکل با دو برگ جوانه در تاج سر، گونه‌های گل‌انداخته و پاهای تپل و باثبات.",
  designRationaleFa:
    "جوانه روی سر نماد مستقیم جوانه زدن دانش، یادگیری و پویایی ذهن دانشجو است. فرم گرد و تپل حس صمیمیت و امنیت عاطفی بالایی برای یادگیری فراهم می‌کند.",

  // 1. Monochromatic Silhouette
  Silhouette: ({ size = 64, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Crown Sprout Leaves */}
      <path
        d="M32 14C32 14 27 12 25 7C29 6 32 9 32 14Z"
        fill="#008080"
      />
      <path
        d="M32 14C32 14 37 12 39 7C35 6 32 9 32 14Z"
        fill="#008080"
      />
      <rect x="31" y="13" width="2" height="4" rx="1" fill="#008080" />

      {/* Main Seed Body Silhouette */}
      <path
        d="M32 17C21 17 15 31 15 43C15 52 22 55 32 55C42 55 49 52 49 43C49 31 43 17 32 17Z"
        fill="#008080"
      />

      {/* Grounded Paws */}
      <ellipse cx="25" cy="56" rx="6" ry="3.5" fill="#008080" />
      <ellipse cx="39" cy="56" rx="6" ry="3.5" fill="#008080" />

      {/* Paddle Arms */}
      <ellipse cx="15" cy="42" rx="3.5" ry="5.5" transform="rotate(-15 15 42)" fill="#008080" />
      <ellipse cx="49" cy="42" rx="3.5" ry="5.5" transform="rotate(15 49 42)" fill="#008080" />
    </svg>
  ),

  // 2. Primary Flat View (With colors & expression)
  Primary: ({ size = 64, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Crown Sprout: Twin Leaves */}
      <path
        d="M32 14C32 14 26 12 24 6.5C28.5 5.5 32.5 8.5 32 14Z"
        fill="#009688"
      />
      <path
        d="M32 14C32 14 38 12 40 6.5C35.5 5.5 31.5 8.5 32 14Z"
        fill="#009688"
      />
      <rect x="31" y="13" width="2" height="4.5" rx="1" fill="#00796B" />

      {/* Grounded Feet Paws */}
      <ellipse cx="25" cy="56" rx="6" ry="3.5" fill="#00796B" />
      <ellipse cx="39" cy="56" rx="6" ry="3.5" fill="#00796B" />
      {/* Toe dividers */}
      <line x1="23" y1="54" x2="23" y2="58" stroke="#004D40" strokeWidth="1" strokeLinecap="round" />
      <line x1="27" y1="54" x2="27" y2="58" stroke="#004D40" strokeWidth="1" strokeLinecap="round" />
      <line x1="37" y1="54" x2="37" y2="58" stroke="#004D40" strokeWidth="1" strokeLinecap="round" />
      <line x1="41" y1="54" x2="41" y2="58" stroke="#004D40" strokeWidth="1" strokeLinecap="round" />

      {/* Main Plump Body */}
      <path
        d="M32 17C21 17 15 31 15 43C15 52 22 55 32 55C42 55 49 52 49 43C49 31 43 17 32 17Z"
        fill="#00897B"
      />

      {/* Paddle Arms */}
      <ellipse cx="14" cy="42" rx="3.5" ry="5.5" transform="rotate(-15 14 42)" fill="#00796B" />
      <ellipse cx="50" cy="42" rx="3.5" ry="5.5" transform="rotate(15 50 42)" fill="#00796B" />

      {/* Expressive Warm Eyes */}
      {/* Sclera */}
      <circle cx="26" cy="36" r="4.8" fill="#FFFFFF" />
      <circle cx="38" cy="36" r="4.8" fill="#FFFFFF" />

      {/* Teal Iris Ring */}
      <circle cx="26.5" cy="36" r="3.4" fill="#00BCD4" />
      <circle cx="37.5" cy="36" r="3.4" fill="#00BCD4" />

      {/* Dark Pupil */}
      <circle cx="26.7" cy="36.2" r="2.2" fill="#00363A" />
      <circle cx="37.3" cy="36.2" r="2.2" fill="#00363A" />

      {/* Bright Catchlight spark */}
      <circle cx="27.8" cy="35" r="1.1" fill="#FFFFFF" />
      <circle cx="38.4" cy="35" r="1.1" fill="#FFFFFF" />

      {/* Eyebrows: Gentle curved arches */}
      <path d="M23.5 29.5C25 28 28 28.5 29 29.5" stroke="#004D40" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M35 29.5C36 28.5 39 28 40.5 29.5" stroke="#004D40" strokeWidth="1.3" strokeLinecap="round" />

      {/* Coral Pink Cheek Blush */}
      <ellipse cx="20" cy="41" rx="3.2" ry="2.2" fill="#FF8A80" opacity="0.85" />
      <ellipse cx="44" cy="41" rx="3.2" ry="2.2" fill="#FF8A80" opacity="0.85" />

      {/* Friendly Gentle Smile */}
      <path d="M29.5 41C31 43 33 43 34.5 41" stroke="#00363A" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),

  // 3. Small Scale View (32px - 48px)
  Small: ({ size = 36, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <path d="M32 14C32 14 26 12 24 6.5C28.5 5.5 32.5 8.5 32 14Z" fill="#009688" />
      <path d="M32 14C32 14 38 12 40 6.5C35.5 5.5 31.5 8.5 32 14Z" fill="#009688" />
      <path
        d="M32 17C21 17 15 31 15 43C15 52 22 55 32 55C42 55 49 52 49 43C49 31 43 17 32 17Z"
        fill="#00897B"
      />
      <ellipse cx="25" cy="56" rx="5.5" ry="3" fill="#00796B" />
      <ellipse cx="39" cy="56" rx="5.5" ry="3" fill="#00796B" />
      {/* High-contrast Eyes for small sizes */}
      <circle cx="26" cy="36" r="4.5" fill="#FFFFFF" />
      <circle cx="38" cy="36" r="4.5" fill="#FFFFFF" />
      <circle cx="26.5" cy="36.5" r="2.8" fill="#00363A" />
      <circle cx="37.5" cy="36.5" r="2.8" fill="#00363A" />
      <circle cx="27.8" cy="35" r="1.2" fill="#FFFFFF" />
      <circle cx="38.8" cy="35" r="1.2" fill="#FFFFFF" />
      {/* Blush */}
      <ellipse cx="19.5" cy="41" rx="2.8" ry="1.8" fill="#FF8A80" />
      <ellipse cx="44.5" cy="41" rx="2.8" ry="1.8" fill="#FF8A80" />
      {/* Smile */}
      <path d="M29.5 41.5C31 43.5 33 43.5 34.5 41.5" stroke="#00363A" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),

  // 4. Emotional Expression: Joy & Wink (حالت احساسی: چشمک و ذوق یادگیری)
  Emotional: ({ size = 64, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Sprout perked up */}
      <path d="M32 14C32 14 25 10 23 5C28 4.5 32.5 7.5 32 14Z" fill="#009688" />
      <path d="M32 14C32 14 39 10 41 5C36 4.5 31.5 7.5 32 14Z" fill="#009688" />
      <rect x="31" y="13" width="2" height="4" fill="#00796B" />

      <ellipse cx="25" cy="56" rx="6" ry="3.5" fill="#00796B" />
      <ellipse cx="39" cy="56" rx="6" ry="3.5" fill="#00796B" />

      {/* Body with slight happy bounce */}
      <path
        d="M32 17C21 17 15 31 15 43C15 52 22 55 32 55C42 55 49 52 49 43C49 31 43 17 32 17Z"
        fill="#00897B"
      />

      {/* Left Eye: Open & Radiant */}
      <circle cx="26" cy="36" r="4.8" fill="#FFFFFF" />
      <circle cx="26.5" cy="36" r="3.4" fill="#00BCD4" />
      <circle cx="26.7" cy="36.2" r="2.2" fill="#00363A" />
      <circle cx="27.8" cy="35" r="1.1" fill="#FFFFFF" />

      {/* Right Eye: Cheerful Wink Arc (^_~) */}
      <path d="M34.5 37C36 34.5 39 34.5 40.5 37" stroke="#00363A" strokeWidth="2.2" strokeLinecap="round" />

      <path d="M23.5 29.5C25 28 28 28.5 29 29.5" stroke="#004D40" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M35 29C36 27.5 39 27.5 40.5 29" stroke="#004D40" strokeWidth="1.3" strokeLinecap="round" />

      {/* Extra glowy cheeks */}
      <ellipse cx="20" cy="41" rx="3.5" ry="2.5" fill="#FF8A80" />
      <ellipse cx="44" cy="41" rx="3.5" ry="2.5" fill="#FF8A80" />

      {/* Big Happy Smile */}
      <path d="M28.5 40.5C29.5 44 34.5 44 35.5 40.5" stroke="#00363A" strokeWidth="1.8" strokeLinecap="round" fill="#FF8A80" />

      {/* Excited Raised Hands */}
      <ellipse cx="13" cy="38" rx="3.2" ry="5.5" transform="rotate(-35 13 38)" fill="#00796B" />
      <ellipse cx="51" cy="38" rx="3.2" ry="5.5" transform="rotate(35 51 38)" fill="#00796B" />
    </svg>
  ),

  // 5. Greeting Hand Pose (ژست خوشامدگویی داشبورد)
  Greeting: ({ size = 64, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <path d="M32 14C32 14 26 12 24 6.5C28.5 5.5 32.5 8.5 32 14Z" fill="#009688" />
      <path d="M32 14C32 14 38 12 40 6.5C35.5 5.5 31.5 8.5 32 14Z" fill="#009688" />

      <ellipse cx="25" cy="56" rx="6" ry="3.5" fill="#00796B" />
      <ellipse cx="39" cy="56" rx="6" ry="3.5" fill="#00796B" />

      {/* Body with welcoming tilt */}
      <path
        d="M32 17C21 17 15 31 15 43C15 52 22 55 32 55C42 55 49 52 49 43C49 31 43 17 32 17Z"
        fill="#00897B"
      />

      {/* Left arm resting */}
      <ellipse cx="14" cy="43" rx="3.5" ry="5.5" transform="rotate(-10 14 43)" fill="#00796B" />

      {/* Right Arm: Raised and waving in a friendly hello! */}
      <path
        d="M47 38C50 35 55 28 54 22C53 19 49 20 48 23C47 26 44 32 43 36"
        fill="#00796B"
      />
      <circle cx="53.5" cy="21.5" r="3.2" fill="#00796B" />

      {/* Eyes looking warmly toward the viewer */}
      <circle cx="26" cy="36" r="4.8" fill="#FFFFFF" />
      <circle cx="38" cy="36" r="4.8" fill="#FFFFFF" />
      <circle cx="26.5" cy="36" r="3.4" fill="#00BCD4" />
      <circle cx="37.5" cy="36" r="3.4" fill="#00BCD4" />
      <circle cx="26.7" cy="36.2" r="2.2" fill="#00363A" />
      <circle cx="37.3" cy="36.2" r="2.2" fill="#00363A" />
      <circle cx="27.8" cy="35" r="1.1" fill="#FFFFFF" />
      <circle cx="38.4" cy="35" r="1.1" fill="#FFFFFF" />

      {/* Blush */}
      <ellipse cx="20" cy="41" rx="3.2" ry="2.2" fill="#FF8A80" opacity="0.85" />
      <ellipse cx="44" cy="41" rx="3.2" ry="2.2" fill="#FF8A80" opacity="0.85" />

      {/* Cordial Smile */}
      <path d="M29.5 41C31 43 33 43 34.5 41" stroke="#00363A" strokeWidth="1.6" strokeLinecap="round" />

      {/* Welcoming Wave Accent Line */}
      <path d="M57 15C59 18 60 21 60 24" stroke="#00BCD4" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
};

/**
 * ============================================================================
 * CONCEPT 2: AVANI SCHOLAR (آوانی محقق — بذر دانش با شنل تحصیلی)
 *
 * Takes the warm seed/sprout organic anatomy and gives it scholastic dignity:
 * - Same lovable teardrop seed body and sprout leaves
 * - Features an integrated ivory/cream study collar & capelet (#F0E6D2)
 * - Focused, curious, academic eye expression
 * - Perfect balance between friendly cuddly charm and university credibility
 * ============================================================================
 */
export const AvaniScholar = {
  id: "avani-scholar",
  nameFa: "کانسپت ۲: آوانی محقق (The Caped Scholar)",
  nameEn: "Avani Scholar",
  conceptDescFa:
    "ترکیب فرم گرم و دوست‌داشتنی بذر با وقار دانشگاهی؛ دارای جوانه دانایی روی سر و طوقه/شنل تحصیلی عاجی‌رنگ (#F0E6D2) که به آن شخصیت یک دستیار علمی جدی اما مهربان می‌بخشد.",
  designRationaleFa:
    "برای مخاطبان دانشگاهی و دانشجویان پزشکی، حضور شنل تحصیلی ظریف، فرم ارگانیک را از حس فانتزی صرف خارج کرده و به یک مسکات معتبر آکادمیک تبدیل می‌کند.",

  Silhouette: ({ size = 64, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <path d="M32 14C32 14 27 12 25 7C29 6 32 9 32 14Z" fill="#008080" />
      <path d="M32 14C32 14 37 12 39 7C35 6 32 9 32 14Z" fill="#008080" />
      {/* Body with Capelet Flairs */}
      <path
        d="M32 17C21 17 15 30 15 42L11 48C13 54 22 55 32 55C42 55 51 54 53 48L49 42C49 30 43 17 32 17Z"
        fill="#008080"
      />
      <ellipse cx="25" cy="56" rx="6" ry="3.5" fill="#008080" />
      <ellipse cx="39" cy="56" rx="6" ry="3.5" fill="#008080" />
    </svg>
  ),

  Primary: ({ size = 64, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Crown Sprout */}
      <path d="M32 14C32 14 26 12 24 6.5C28.5 5.5 32.5 8.5 32 14Z" fill="#009688" />
      <path d="M32 14C32 14 38 12 40 6.5C35.5 5.5 31.5 8.5 32 14Z" fill="#009688" />
      <rect x="31" y="13" width="2" height="4.5" rx="1" fill="#00796B" />

      {/* Paws */}
      <ellipse cx="25" cy="56" rx="6" ry="3.5" fill="#00796B" />
      <ellipse cx="39" cy="56" rx="6" ry="3.5" fill="#00796B" />

      {/* Main Seed Body */}
      <path
        d="M32 17C21 17 15 31 15 43C15 52 22 55 32 55C42 55 49 52 49 43C49 31 43 17 32 17Z"
        fill="#00897B"
      />

      {/* Academic Ivory Collar & Capelet */}
      <path
        d="M20 46C24 49 28 50 32 50C36 50 40 49 44 46L48 51C43 54 37 55 32 55C27 55 21 54 16 51L20 46Z"
        fill="#F0E6D2"
        stroke="#004D40"
        strokeWidth="1.2"
      />
      {/* Gold Academic Pin */}
      <circle cx="32" cy="49" r="1.5" fill="#F2B84B" />

      {/* Scholarly Focused Eyes */}
      <circle cx="26" cy="35" r="4.6" fill="#FFFFFF" />
      <circle cx="38" cy="35" r="4.6" fill="#FFFFFF" />
      <circle cx="26.5" cy="35" r="3.2" fill="#00BCD4" />
      <circle cx="37.5" cy="35" r="3.2" fill="#00BCD4" />
      <circle cx="26.7" cy="35.2" r="2.1" fill="#00363A" />
      <circle cx="37.3" cy="35.2" r="2.1" fill="#00363A" />
      <circle cx="27.8" cy="34" r="1.1" fill="#FFFFFF" />
      <circle cx="38.4" cy="34" r="1.1" fill="#FFFFFF" />

      {/* Thoughtful Eyebrows */}
      <path d="M23 28.5C25 27.5 28 28 29.5 29" stroke="#004D40" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M34.5 29C36 28 39 27.5 41 28.5" stroke="#004D40" strokeWidth="1.4" strokeLinecap="round" />

      {/* Warm Blush */}
      <ellipse cx="20" cy="40" rx="3.2" ry="2.2" fill="#FF8A80" opacity="0.8" />
      <ellipse cx="44" cy="40" rx="3.2" ry="2.2" fill="#FF8A80" opacity="0.8" />

      {/* Serene Smile */}
      <path d="M29.5 40.5C31 42 33 42 34.5 40.5" stroke="#00363A" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),

  Small: ({ size = 36, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <path d="M32 14C32 14 26 12 24 6.5C28.5 5.5 32.5 8.5 32 14Z" fill="#009688" />
      <path d="M32 14C32 14 38 12 40 6.5C35.5 5.5 31.5 8.5 32 14Z" fill="#009688" />
      <path
        d="M32 17C21 17 15 31 15 43C15 52 22 55 32 55C42 55 49 52 49 43C49 31 43 17 32 17Z"
        fill="#00897B"
      />
      <path
        d="M20 46C24 49 28 50 32 50C36 50 40 49 44 46L48 51C43 54 37 55 32 55C27 55 21 54 16 51L20 46Z"
        fill="#F0E6D2"
      />
      <circle cx="26" cy="35" r="4.2" fill="#FFFFFF" />
      <circle cx="38" cy="35" r="4.2" fill="#FFFFFF" />
      <circle cx="26.5" cy="35" r="2.6" fill="#00363A" />
      <circle cx="37.5" cy="35" r="2.6" fill="#00363A" />
    </svg>
  ),

  Emotional: ({ size = 64, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Contemplating / Thinking Pose (پژوهش و تمرکز بر مسأله علمی) */}
      <path d="M32 14C32 14 26 12 24 6.5C28.5 5.5 32.5 8.5 32 14Z" fill="#009688" />
      <path d="M32 14C32 14 38 12 40 6.5C35.5 5.5 31.5 8.5 32 14Z" fill="#009688" />

      <path
        d="M32 17C21 17 15 31 15 43C15 52 22 55 32 55C42 55 49 52 49 43C49 31 43 17 32 17Z"
        fill="#00897B"
      />
      <path
        d="M20 46C24 49 28 50 32 50C36 50 40 49 44 46L48 51C43 54 37 55 32 55C27 55 21 54 16 51L20 46Z"
        fill="#F0E6D2"
      />

      {/* Upward Looking Contemplating Eyes */}
      <circle cx="26" cy="34" r="4.6" fill="#FFFFFF" />
      <circle cx="38" cy="34" r="4.6" fill="#FFFFFF" />
      <circle cx="27" cy="33" r="3.2" fill="#00BCD4" />
      <circle cx="39" cy="33" r="3.2" fill="#00BCD4" />
      <circle cx="27.5" cy="33" r="2" fill="#00363A" />
      <circle cx="39.5" cy="33" r="2" fill="#00363A" />

      {/* Hand Touching Chin in Contemplation */}
      <ellipse cx="33" cy="44" rx="3.5" ry="4" fill="#00796B" />
      <circle cx="34" cy="42" r="2.5" fill="#00796B" />

      <ellipse cx="20" cy="40" rx="3.2" ry="2.2" fill="#FF8A80" opacity="0.8" />
      <ellipse cx="44" cy="40" rx="3.2" ry="2.2" fill="#FF8A80" opacity="0.8" />
    </svg>
  ),

  Greeting: ({ size = 64, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <path d="M32 14C32 14 26 12 24 6.5C28.5 5.5 32.5 8.5 32 14Z" fill="#009688" />
      <path d="M32 14C32 14 38 12 40 6.5C35.5 5.5 31.5 8.5 32 14Z" fill="#009688" />

      <path
        d="M32 17C21 17 15 31 15 43C15 52 22 55 32 55C42 55 49 52 49 43C49 31 43 17 32 17Z"
        fill="#00897B"
      />
      <path
        d="M20 46C24 49 28 50 32 50C36 50 40 49 44 46L48 51C43 54 37 55 32 55C27 55 21 54 16 51L20 46Z"
        fill="#F0E6D2"
      />

      <circle cx="26" cy="35" r="4.6" fill="#FFFFFF" />
      <circle cx="38" cy="35" r="4.6" fill="#FFFFFF" />
      <circle cx="26.5" cy="35" r="3.2" fill="#00BCD4" />
      <circle cx="37.5" cy="35" r="3.2" fill="#00BCD4" />
      <circle cx="26.7" cy="35.2" r="2.1" fill="#00363A" />
      <circle cx="37.3" cy="35.2" r="2.1" fill="#00363A" />

      {/* Raised Scholarly Wave */}
      <path d="M47 38C50 35 55 27 54 21C53 18 49 19 48 22C47 25 44 32 43 36" fill="#00796B" />
      <circle cx="53.5" cy="20.5" r="3.2" fill="#00796B" />

      <ellipse cx="20" cy="40" rx="3.2" ry="2.2" fill="#FF8A80" opacity="0.8" />
      <ellipse cx="44" cy="40" rx="3.2" ry="2.2" fill="#FF8A80" opacity="0.8" />
      <path d="M29.5 40.5C31 42 33 42 34.5 40.5" stroke="#00363A" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
};

/**
 * ============================================================================
 * CONCEPT 3: AVANI LUMEN (آوانی قطره دانش — فرم ارگانیک سیال)
 *
 * An ultra-clean, fluid organic droplet anatomy:
 * - Dewdrop / ink-drop organic silhouette with a single rising leaf plume
 * - Dual-tone belly in soft Light Sky Blue (#A7D0E6)
 * - Fluid seamless paws
 * - High emotional versatility and dynamic gesture ability
 * ============================================================================
 */
export const AvaniLumen = {
  id: "avani-lumen",
  nameFa: "کانسپت ۳: آوانی لومن (The Knowledge Droplet)",
  nameEn: "Avani Lumen",
  conceptDescFa:
    "فرم سیال و مدرن قطره جوهر/دانش با یک پرچم برگی مایل در نوک سر، شکم دورنگ با آبی لطیف (#A7D0E6) و بیانی پرانرژی و مشوق.",
  designRationaleFa:
    "استفاده از کهن‌الگوی قطره آب و جوهر (چشمه خرد) که در نوک آن جوانه امید می‌روید؛ این سبک انیمیشن‌پذیری فوق‌العاده بالا و حس سبکی و پویایی دارد.",

  Silhouette: ({ size = 64, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Single Elegant Sprout Leaf Plume */}
      <path
        d="M32 15C32 15 36 10 42 9C40 14 36 16 32 16"
        stroke="#008080"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Fluid Droplet Body */}
      <path
        d="M32 16C23 20 16 31 16 43C16 52 23 56 32 56C41 56 48 52 48 43C48 31 41 20 32 16Z"
        fill="#008080"
      />
      <ellipse cx="26" cy="56" rx="5" ry="3" fill="#008080" />
      <ellipse cx="38" cy="56" rx="5" ry="3" fill="#008080" />
    </svg>
  ),

  Primary: ({ size = 64, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Leaf Plume */}
      <path
        d="M32 16C33 11 38 8 43 8C41 14 36 16 32 16Z"
        fill="#009688"
      />

      {/* Feet */}
      <ellipse cx="26" cy="56" rx="5.5" ry="3" fill="#00796B" />
      <ellipse cx="38" cy="56" rx="5.5" ry="3" fill="#00796B" />

      {/* Droplet Body */}
      <path
        d="M32 16C23 20 16 31 16 43C16 52 23 56 32 56C41 56 48 52 48 43C48 31 41 20 32 16Z"
        fill="#00897B"
      />

      {/* Dual-Tone Belly Patch in Light Sky Blue */}
      <path
        d="M22 47C22 41 26 37 32 37C38 37 42 41 42 47C42 53 38 55 32 55C26 55 22 53 22 47Z"
        fill="#A7D0E6"
        opacity="0.45"
      />

      {/* Large Bright Eyes */}
      <circle cx="26" cy="33" r="4.6" fill="#FFFFFF" />
      <circle cx="38" cy="33" r="4.6" fill="#FFFFFF" />
      <circle cx="26.5" cy="33" r="3.2" fill="#00BCD4" />
      <circle cx="37.5" cy="33" r="3.2" fill="#00BCD4" />
      <circle cx="26.8" cy="33.2" r="2.1" fill="#00363A" />
      <circle cx="37.2" cy="33.2" r="2.1" fill="#00363A" />
      <circle cx="27.8" cy="32" r="1.1" fill="#FFFFFF" />
      <circle cx="38.4" cy="32" r="1.1" fill="#FFFFFF" />

      {/* Soft Cheerful Blush */}
      <ellipse cx="19" cy="38" rx="3" ry="2" fill="#FF8A80" opacity="0.8" />
      <ellipse cx="45" cy="38" rx="3" ry="2" fill="#FF8A80" opacity="0.8" />

      {/* Joyful Upward Smile */}
      <path d="M29 38.5C30.5 40.5 33.5 40.5 35 38.5" stroke="#00363A" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),

  Small: ({ size = 36, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <path d="M32 16C33 11 38 8 43 8C41 14 36 16 32 16Z" fill="#009688" />
      <path
        d="M32 16C23 20 16 31 16 43C16 52 23 56 32 56C41 56 48 52 48 43C48 31 41 20 32 16Z"
        fill="#00897B"
      />
      <circle cx="26" cy="33" r="4.2" fill="#FFFFFF" />
      <circle cx="38" cy="33" r="4.2" fill="#FFFFFF" />
      <circle cx="26.5" cy="33" r="2.5" fill="#00363A" />
      <circle cx="37.5" cy="33" r="2.5" fill="#00363A" />
      <ellipse cx="19" cy="38" rx="2.5" ry="1.6" fill="#FF8A80" />
      <ellipse cx="45" cy="38" rx="2.5" ry="1.6" fill="#FF8A80" />
    </svg>
  ),

  Emotional: ({ size = 64, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <path d="M32 16C33 11 38 8 43 8C41 14 36 16 32 16Z" fill="#009688" />
      <path
        d="M32 16C23 20 16 31 16 43C16 52 23 56 32 56C41 56 48 52 48 43C48 31 41 20 32 16Z"
        fill="#00897B"
      />

      {/* Triumph Pose: Holding an Achievement Star */}
      <circle cx="26" cy="33" r="4.6" fill="#FFFFFF" />
      <circle cx="38" cy="33" r="4.6" fill="#FFFFFF" />
      <circle cx="26.5" cy="33" r="3.2" fill="#00BCD4" />
      <circle cx="37.5" cy="33" r="3.2" fill="#00BCD4" />
      <circle cx="26.8" cy="33.2" r="2.1" fill="#00363A" />
      <circle cx="37.2" cy="33.2" r="2.1" fill="#00363A" />

      {/* Arms holding floating gold star */}
      <path d="M32 40L33.5 36.5L37 35.5L33.5 34.5L32 31L30.5 34.5L27 35.5L30.5 36.5L32 40Z" fill="#F2B84B" />

      <ellipse cx="19" cy="38" rx="3" ry="2" fill="#FF8A80" />
      <ellipse cx="45" cy="38" rx="3" ry="2" fill="#FF8A80" />
      <path d="M29 38.5C30.5 41 33.5 41 35 38.5" stroke="#00363A" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),

  Greeting: ({ size = 64, className = "" }: ViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <path d="M32 16C33 11 38 8 43 8C41 14 36 16 32 16Z" fill="#009688" />

      <ellipse cx="26" cy="56" rx="5.5" ry="3" fill="#00796B" />
      <ellipse cx="38" cy="56" rx="5.5" ry="3" fill="#00796B" />

      <path
        d="M32 16C23 20 16 31 16 43C16 52 23 56 32 56C41 56 48 52 48 43C48 31 41 20 32 16Z"
        fill="#00897B"
      />

      <circle cx="26" cy="33" r="4.6" fill="#FFFFFF" />
      <circle cx="38" cy="33" r="4.6" fill="#FFFFFF" />
      <circle cx="26.5" cy="33" r="3.2" fill="#00BCD4" />
      <circle cx="37.5" cy="33" r="3.2" fill="#00BCD4" />
      <circle cx="26.8" cy="33.2" r="2.1" fill="#00363A" />
      <circle cx="37.2" cy="33.2" r="2.1" fill="#00363A" />

      {/* Upward Wave */}
      <path d="M46 36C49 32 54 26 53 20C52 17 48 18 47 21C46 24 43 30 42 34" fill="#00796B" />
      <circle cx="52" cy="19.5" r="3" fill="#00796B" />

      <ellipse cx="19" cy="38" rx="3" ry="2" fill="#FF8A80" opacity="0.8" />
      <ellipse cx="45" cy="38" rx="3" ry="2" fill="#FF8A80" opacity="0.8" />
      <path d="M29 38.5C30.5 40.5 33.5 40.5 35 38.5" stroke="#00363A" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
};

export const SPROUT_PROPOSALS = [AvaniSprout, AvaniScholar, AvaniLumen];
