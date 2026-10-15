import React from "react";

interface CharacterViewProps {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * ============================================================================
 * CURRENT BASELINE AVANI (Previous Version for Comparison)
 * Generic egg/dome body with round glasses and crest antenna.
 * ============================================================================
 */
export const Avani_Current = {
  id: "avani-current",
  nameFa: "آوانی کنونی (نسخه اولیه)",
  nameEn: "Current Baseline Avani",
  conceptDescFa: "کالبد تخم‌مرغی عمومی با عینک گرد و آنتن بالای سر (بدون پیوند هندسی با لوگوتایپ آوانا)",
  linkageFa: "فاقد ارتباط ساختاری با فرم حروف یا خطوط لوگوی آوانا؛ فرم عمومی مسکات‌های متداول.",

  Silhouette: ({ size = 64, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Top antenna */}
      <circle cx="32" cy="10" r="2" fill="#008080" />
      <rect x="31" y="11" width="2" height="4" fill="#008080" />
      {/* Egg/Bell Body Silhouette */}
      <path
        d="M20 48C17 48 16 45 16 42C16 33 21 16 32 16C43 16 48 33 48 42C48 45 47 48 44 48H20Z"
        fill="#008080"
      />
    </svg>
  ),

  Primary: ({ size = 64, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <circle cx="32" cy="9.5" r="2" fill="#A7D0E6" stroke="#008080" strokeWidth="0.8" />
      <path d="M30 13V16H34V13H30Z" fill="#006666" />
      <path
        d="M20 48C17 48 16 45 16 42C16 33 21 16 32 16C43 16 48 33 48 42C48 45 47 48 44 48H20Z"
        fill="#008080"
      />
      <ellipse cx="32" cy="27" rx="10" ry="7" fill="#FFFDF8" />
      <circle cx="28" cy="27" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
      <circle cx="36" cy="27" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
      <ellipse cx="28.5" cy="27" rx="1.8" ry="2.2" fill="#004D40" />
      <circle cx="29.2" cy="26" r="0.8" fill="#FFFFFF" />
      <ellipse cx="35.5" cy="27" rx="1.8" ry="2.2" fill="#004D40" />
      <circle cx="36.2" cy="26" r="0.8" fill="#FFFFFF" />
      <path d="M30 31.5C31 32.5 33 32.5 34 31.5" stroke="#004D40" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),

  Small: ({ size = 36, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <circle cx="32" cy="9.5" r="2" fill="#A7D0E6" stroke="#008080" strokeWidth="0.8" />
      <path
        d="M20 48C17 48 16 45 16 42C16 33 21 16 32 16C43 16 48 33 48 42C48 45 47 48 44 48H20Z"
        fill="#008080"
      />
      <ellipse cx="32" cy="27" rx="10" ry="7" fill="#FFFDF8" />
      <circle cx="28" cy="27" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.6" />
      <circle cx="36" cy="27" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.6" />
      <circle cx="28" cy="27" r="1.5" fill="#004D40" />
      <circle cx="36" cy="27" r="1.5" fill="#004D40" />
    </svg>
  ),

  Greeting: ({ size = 64, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <circle cx="32" cy="9.5" r="2" fill="#A7D0E6" stroke="#008080" strokeWidth="0.8" />
      <path
        d="M20 48C17 48 16 45 16 42C16 33 21 16 32 16C43 16 48 33 48 42C48 45 47 48 44 48H20Z"
        fill="#008080"
      />
      <ellipse cx="32" cy="27" rx="10" ry="7" fill="#FFFDF8" />
      <circle cx="28" cy="27" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
      <circle cx="36" cy="27" r="4.2" fill="#FFFFFF" stroke="#006060" strokeWidth="1.4" />
      <circle cx="28.5" cy="27" r="1.8" fill="#004D40" />
      <circle cx="35.5" cy="27" r="1.8" fill="#004D40" />
      <path d="M30 31.5C31 32.5 33 32.5 34 31.5" stroke="#004D40" strokeWidth="1.3" strokeLinecap="round" />
      {/* Waving Arm & Palm */}
      <circle cx="50" cy="21" r="3.2" fill="#FFF8EE" stroke="#006060" strokeWidth="1.2" />
      <path d="M44 32C47 28 50 24 50 21" stroke="#008080" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
};

/**
 * ============================================================================
 * CONCEPT C1: AVANI LETTERFORM (تایپوگرافیک — کالبد زنده حرف A آوانا)
 *
 * Geometric Linkage:
 * - Direct translation of the open-arch "A" from the AVANA logotype (crossbar-less chevron Λ).
 * - Exact 60° diagonal leg angles with flat horizontal apex cut and vertical-cut feet.
 * - The negative space between legs becomes the character's walking stance.
 * - Minimal visor/eye bar embedded seamlessly into the upper arch apex.
 * ============================================================================
 */
export const Avani_C1_Letterform = {
  id: "avani-c1-letterform",
  nameFa: "کانسپت C1: Avani Letterform",
  nameEn: "Avani Letterform (Typographic)",
  conceptDescFa:
    "شخصیتی که مستقیماً از استخوان‌بندی حرف «A» در لوگوتایپ آوانا (طاق Λ بدون خط وسط با زاویه ۶۰ درجه) ساخته شده است.",
  linkageFa:
    "زاویه ۶۰ درجه بازوها، نوک مسطح افقی، پایه‌های دارای برش عمودی و فضای منفی مرکزی دقیقاً از حرف A کلمه AVANA اقتباس شده است.",

  // View 1: Pure Silhouette
  Silhouette: ({ size = 64, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* The pure AVANA 'A' Letterform silhouette */}
      <path
        d="M28 14H36L49 46H41L36 33H28L23 46H15L28 14Z"
        fill="#008080"
      />
    </svg>
  ),

  // View 2: Primary View (With minimal face/eyes)
  Primary: ({ size = 64, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Outer 'A' Arch Body */}
      <path
        d="M28 14H36L49 46H41L36 33H28L23 46H15L28 14Z"
        fill="#008080"
      />

      {/* Embedded Minimal Faceplate: Clean Warm Ivory Visor between the legs */}
      <path
        d="M27 24H37L39 29H25L27 24Z"
        fill="#F0E6D2"
      />

      {/* Two Intelligent Minimalist Dot Eyes */}
      <circle cx="29.5" cy="26.5" r="1.3" fill="#004D40" />
      <circle cx="34.5" cy="26.5" r="1.3" fill="#004D40" />

      {/* Subtle Inner Negative Space Arch Definition */}
      <path d="M28 33L32 23L36 33" stroke="#A7D0E6" strokeWidth="1.2" />
    </svg>
  ),

  // View 3: Small View (32px - 48px)
  Small: ({ size = 36, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <path
        d="M28 14H36L49 46H41L36 33H28L23 46H15L28 14Z"
        fill="#008080"
      />
      <path d="M27 24H37L39 29H25L27 24Z" fill="#F0E6D2" />
      <circle cx="29.5" cy="26.5" r="1.4" fill="#004D40" />
      <circle cx="34.5" cy="26.5" r="1.4" fill="#004D40" />
    </svg>
  ),

  // View 4: Greeting Pose
  Greeting: ({ size = 64, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Left Standing Leg & Core Arch */}
      <path
        d="M28 14H36L49 46H41L36 33H28L23 46H15L28 14Z"
        fill="#008080"
      />

      {/* Faceplate */}
      <path d="M27 24H37L39 29H25L27 24Z" fill="#F0E6D2" />
      <circle cx="29.5" cy="26.5" r="1.3" fill="#004D40" />
      <circle cx="34.5" cy="26.5" r="1.3" fill="#004D40" />

      {/* Right Arm: Branches out from right leg at 60° angle in a cheerful wave gesture */}
      <path
        d="M38 27L48 16H53L43 31"
        fill="#008080"
      />
      {/* Hand Palm tip in Warm Ivory */}
      <circle cx="51" cy="15" r="3.2" fill="#F0E6D2" stroke="#008080" strokeWidth="1.2" />

      {/* Single minimal wave accent */}
      <path d="M54 9C56 12 57 16 57 19" stroke="#A7D0E6" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
};

/**
 * ============================================================================
 * CONCEPT C2: AVANI GEOMETRIC (هندسی مستقل — زبان خطی و زوایای لوگو)
 *
 * Geometric Linkage:
 * - Constructed from precise parallelograms and faceted 60° hexagonal chamfers.
 * - Bridges the peak of 'A' (pointing up) and the valley of 'V' (pointing down).
 * - Faceted head with a sleek horizontal scientific observation visor (Ivory on Teal).
 * - Clean, modern, mature academic persona — zero cartoon fluff.
 * ============================================================================
 */
export const Avani_C2_Geometric = {
  id: "avani-c2-geometric",
  nameFa: "کانسپت C2: Avani Geometric",
  nameEn: "Avani Geometric (Structured)",
  conceptDescFa:
    "شخصیتی مستقل با ساختار چندوجهی که از تناسبات هندسی و تلاقی زوایای ۶۰ درجه حروف A و V پدید آمده است.",
  linkageFa:
    "طراحی شده بر مبنای شبکه گرید ۶۰ درجه، ضخامت متناظر با استروک‌های فونت AVANA و پخ‌های متقارن گوشه‌ها.",

  // View 1: Pure Silhouette
  Silhouette: ({ size = 64, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Faceted Geometric Body combining A-Apex and V-Torso */}
      <path
        d="M32 12L44 24V40L38 48H26L20 40V24L32 12Z"
        fill="#008080"
      />
    </svg>
  ),

  // View 2: Primary View
  Primary: ({ size = 64, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Faceted Geometric Shell */}
      <path
        d="M32 12L44 24V40L38 48H26L20 40V24L32 12Z"
        fill="#008080"
      />

      {/* Diagonal Facet Tone Contrast (Light Teal right shoulder) */}
      <path
        d="M32 12L44 24V40L38 48L32 38V12Z"
        fill="#006E6E"
        opacity="0.35"
      />

      {/* Horizontal Ivory Research Visor */}
      <rect x="22" y="25" width="20" height="7" rx="3.5" fill="#F0E6D2" />

      {/* Focused Geometric Eyes */}
      <circle cx="28" cy="28.5" r="1.4" fill="#004D40" />
      <circle cx="36" cy="28.5" r="1.4" fill="#004D40" />

      {/* Lower Torso AVANA Chevron Accent Line */}
      <path d="M26 42L32 46L38 42" stroke="#A7D0E6" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),

  // View 3: Small View (32px - 48px)
  Small: ({ size = 36, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <path d="M32 12L44 24V40L38 48H26L20 40V24L32 12Z" fill="#008080" />
      <rect x="22" y="25" width="20" height="7" rx="3.5" fill="#F0E6D2" />
      <circle cx="28" cy="28.5" r="1.5" fill="#004D40" />
      <circle cx="36" cy="28.5" r="1.5" fill="#004D40" />
    </svg>
  ),

  // View 4: Greeting Pose
  Greeting: ({ size = 64, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Geometric Body */}
      <path
        d="M32 12L44 24V40L38 48H26L20 40V24L32 12Z"
        fill="#008080"
      />

      {/* Research Visor */}
      <rect x="22" y="25" width="20" height="7" rx="3.5" fill="#F0E6D2" />
      <circle cx="28" cy="28.5" r="1.4" fill="#004D40" />
      <circle cx="36" cy="28.5" r="1.4" fill="#004D40" />

      {/* Geometric Articulated Arm reaching up at crisp 60° angle */}
      <path
        d="M42 32L51 18L55 20L44 36"
        fill="#008080"
      />
      {/* Hand tip */}
      <circle cx="53" cy="18" r="3" fill="#F0E6D2" stroke="#008080" strokeWidth="1.2" />

      {/* Minimal Greeting Echo line */}
      <path d="M57 12C59 15 60 18 60 22" stroke="#A7D0E6" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
};

/**
 * ============================================================================
 * CONCEPT C3: AVANI MONOGRAM (مونوگرامیک روبانی — الهام از نشان گرافیکی آوانا)
 *
 * Geometric Linkage:
 * - Directly derived from the iconic intertwined ribbon of `avana-logo.png`.
 * - Features the signature dual-peak arch flanking a central downward chevron.
 * - Negative space central aperture serves as the focal lens of the character.
 * - Fluid, iconic, instantly recognizable as the visual mark of AVANA.
 * ============================================================================
 */
export const Avani_C3_Monogram = {
  id: "avani-c3-monogram",
  nameFa: "کانسپت C3: Avani Monogram",
  nameEn: "Avani Monogram (Ribbon Loop)",
  conceptDescFa:
    "شخصیتی که مستقیماً از گره روبانی پیوسته و فضای منفی نشان گرافیکی رسمی AVANA (مونوگرام متداخل) شکل گرفته است.",
  linkageFa:
    "استفاده مستقیم از دو قله صعودی A، دره مرکزی V و فضای منفی مثلثی نماد آوانا، خلق شخصیتی کاملاً انحصاری و غیرقابل کپی.",

  // View 1: Pure Silhouette
  Silhouette: ({ size = 64, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Continuous ribbon silhouette echoing avana-logo.png */}
      <path
        d="M17 46L24 16C25 14 28 14 29 16L32 23L35 16C36 14 39 14 40 16L47 46H39L35 28L32 34L29 28L25 46H17Z"
        fill="#008080"
      />
    </svg>
  ),

  // View 2: Primary View
  Primary: ({ size = 64, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Outer Ribbon Loop Body */}
      <path
        d="M17 46L24 16C25 14 28 14 29 16L32 23L35 16C36 14 39 14 40 16L47 46H39L35 28L32 34L29 28L25 46H17Z"
        fill="#008080"
      />

      {/* Central Negative Space Core / Chest Shield in Warm Ivory */}
      <polygon points="32,35 27,27 37,27" fill="#F0E6D2" />

      {/* Minimal Expressive Eye Dots centered above the negative space V */}
      <circle cx="29.5" cy="22" r="1.3" fill="#FFFFFF" />
      <circle cx="34.5" cy="22" r="1.3" fill="#FFFFFF" />

      {/* Accent Ribbon Turn in Light Blue */}
      <path d="M28 16L32 23L36 16" stroke="#A7D0E6" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),

  // View 3: Small View (32px - 48px)
  Small: ({ size = 36, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <path
        d="M17 46L24 16C25 14 28 14 29 16L32 23L35 16C36 14 39 14 40 16L47 46H39L35 28L32 34L29 28L25 46H17Z"
        fill="#008080"
      />
      <polygon points="32,35 27,27 37,27" fill="#F0E6D2" />
      <circle cx="29.5" cy="22" r="1.4" fill="#FFFFFF" />
      <circle cx="34.5" cy="22" r="1.4" fill="#FFFFFF" />
    </svg>
  ),

  // View 4: Greeting Pose
  Greeting: ({ size = 64, className = "" }: CharacterViewProps) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      {/* Left and Core Ribbon Loop Body */}
      <path
        d="M17 46L24 16C25 14 28 14 29 16L32 23L35 16C36 14 39 14 40 16L47 46H39L35 28L32 34L29 28L25 46H17Z"
        fill="#008080"
      />

      <polygon points="32,35 27,27 37,27" fill="#F0E6D2" />
      <circle cx="29.5" cy="22" r="1.3" fill="#FFFFFF" />
      <circle cx="34.5" cy="22" r="1.3" fill="#FFFFFF" />

      {/* Right ribbon loop extends upward and flips into a graceful waving gesture */}
      <path
        d="M39 24L48 13C49 11 52 11 53 13L55 17L44 32"
        fill="#008080"
      />
      <circle cx="53" cy="13" r="3.2" fill="#F0E6D2" stroke="#008080" strokeWidth="1.2" />

      <path d="M57 9C59 12 60 15 60 19" stroke="#A7D0E6" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
};

export const AVANI_PROPOSALS = [
  Avani_Current,
  Avani_C1_Letterform,
  Avani_C2_Geometric,
  Avani_C3_Monogram,
];
