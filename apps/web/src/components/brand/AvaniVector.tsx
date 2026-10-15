import React from "react";

export type AvaniPose =
  | "default"
  | "hero"
  | "wave"
  | "learning"
  | "thinking"
  | "success"
  | "idea"
  | "processing"
  | "empty"
  | "explaining"
  | "pointing"
  | "celebrating"
  | "confused"
  | "encouraging"
  | "reading"
  | "presenting"
  | "sleeping";

export interface AvaniVectorProps extends React.SVGProps<SVGSVGElement> {
  pose?: AvaniPose;
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Avani Brand Colors (Extracted from official approved visual reference)
 */
export const AVANI_COLORS = {
  // Teal Facets
  tealHighlight: "#26A69A",
  tealPrimary: "#008080",
  tealMedium: "#00796B",
  tealDark: "#004D40",
  tealDeep: "#00332C",

  // Face & Accents
  ivoryFace: "#FFFDF9",
  charcoal: "#1A2226",
  blush: "#FF8A80",
  coralAccent: "#FF7043",
  gold: "#FFB300",
  goldDark: "#E65100",
  bookCover: "#00695C",
  bookPages: "#F7F9FA",
  glassesFrame: "#B2DFDB",
};

const C = AVANI_COLORS;

/**
 * Common Avani Base Body (Two Interlocking Solid Triangles with Faceted Shading)
 * Base ViewBox: 0 0 100 120
 */
export const AvaniBaseBody: React.FC<{ hasCoralNeck?: boolean; idPrefix?: string }> = ({
  hasCoralNeck = true,
  idPrefix = "avani",
}) => (
  <g id={`${idPrefix}-body-group`}>
    <defs>
      <linearGradient id={`${idPrefix}-left-facet`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={C.tealHighlight} />
        <stop offset="100%" stopColor={C.tealPrimary} />
      </linearGradient>
      <linearGradient id={`${idPrefix}-right-facet`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={C.tealDark} />
        <stop offset="100%" stopColor={C.tealDeep} />
      </linearGradient>
      <linearGradient id={`${idPrefix}-lower-left`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={C.tealPrimary} />
        <stop offset="100%" stopColor={C.tealMedium} />
      </linearGradient>
      <linearGradient id={`${idPrefix}-lower-right`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={C.tealDark} />
        <stop offset="100%" stopColor={C.tealDeep} />
      </linearGradient>
    </defs>

    {/* Feet / Paws */}
    <g id={`${idPrefix}-feet`}>
      <path
        d="M 37 98 L 37 108 C 37 112 30 112 30 108 C 30 103 33 99 37 98 Z"
        fill={C.tealDark}
      />
      <path
        d="M 63 98 L 63 108 C 63 112 70 112 70 108 C 70 103 67 99 63 98 Z"
        fill={C.tealDark}
      />
    </g>

    {/* 1. Lower Body: Upright Triangle ("A" letterform base) */}
    <g id={`${idPrefix}-lower-triangle`}>
      <path
        d="M 50 48 L 18 97 C 19 99 23 99 28 99 L 50 99 Z"
        fill={`url(#${idPrefix}-lower-left)`}
      />
      <path
        d="M 50 48 L 50 99 L 72 99 C 77 99 81 99 82 97 Z"
        fill={`url(#${idPrefix}-lower-right)`}
      />
    </g>

    {/* 2. Upper Body: Inverted Triangle ("V" letterform / A-frame) */}
    <g id={`${idPrefix}-upper-triangle`}>
      <path
        d="M 50 78 L 16 23 C 18 20 22 20 28 20 L 50 20 Z"
        fill={`url(#${idPrefix}-left-facet)`}
      />
      <path
        d="M 50 78 L 50 20 L 72 20 C 78 20 82 20 84 23 Z"
        fill={`url(#${idPrefix}-right-facet)`}
      />
    </g>

    {/* 3. Small Coral Necktie / Accent (Signature detail at triangle junction) */}
    {hasCoralNeck && (
      <path
        d="M 50 82 L 46 75 L 54 75 Z"
        fill={C.coralAccent}
      />
    )}
  </g>
);

/**
 * Modular Face Component with customizable eyes, mouth, and direction
 */
interface AvaniFaceProps {
  eyeType?: "normal" | "happy" | "focused" | "thinking" | "processing" | "confused" | "sleeping";
  mouthType?: "smile" | "wide-smile" | "curious" | "cheerful" | "quizzical" | "open" | "serene";
  lookOffset?: { x: number; y: number };
}

export const AvaniFace: React.FC<AvaniFaceProps> = ({
  eyeType = "normal",
  mouthType = "smile",
  lookOffset = { x: 0, y: 0 },
}) => (
  <g id="avani-face-group">
    {/* Ivory Polygon Face Cutout */}
    <path
      d="M 36 29 L 64 29 C 67 29 69 32 68 36 L 64 53 C 63 56 61 58 58 60 L 50 64 L 42 60 C 39 58 37 56 36 53 L 32 36 C 31 32 33 29 36 29 Z"
      fill={C.ivoryFace}
      stroke="rgba(0,0,0,0.03)"
      strokeWidth="0.5"
    />

    {/* Coral Blush Cheeks */}
    <ellipse cx="37" cy="50" rx="3.5" ry="2" fill={C.blush} opacity="0.65" />
    <ellipse cx="63" cy="50" rx="3.5" ry="2" fill={C.blush} opacity="0.65" />

    {/* Eyes */}
    {(eyeType === "normal" || eyeType === "processing") && (
      <g id="eyes-normal">
        <circle cx={43 + lookOffset.x} cy={44 + lookOffset.y} r="2.8" fill={C.charcoal} />
        <circle cx={42 + lookOffset.x} cy={43 + lookOffset.y} r="0.9" fill="#FFFFFF" />
        <circle cx={57 + lookOffset.x} cy={44 + lookOffset.y} r="2.8" fill={C.charcoal} />
        <circle cx={56 + lookOffset.x} cy={43 + lookOffset.y} r="0.9" fill="#FFFFFF" />
      </g>
    )}

    {eyeType === "happy" && (
      <g id="eyes-happy">
        <path
          d="M 40 45 C 41 41 45 41 46 45"
          fill="none"
          stroke={C.charcoal}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M 54 45 C 55 41 59 41 60 45"
          fill="none"
          stroke={C.charcoal}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </g>
    )}

    {eyeType === "focused" && (
      <g id="eyes-focused">
        {/* Friendly full-sized eyes looking downward attentively toward study materials */}
        <circle cx="43" cy="45.5" r="2.7" fill={C.charcoal} />
        <circle cx="42.2" cy="44.6" r="0.85" fill="#FFFFFF" />
        <circle cx="57" cy="45.5" r="2.7" fill={C.charcoal} />
        <circle cx="56.2" cy="44.6" r="0.85" fill="#FFFFFF" />
        <path
          d="M 39.5 42 Q 43 40.5 46.5 42"
          fill="none"
          stroke={C.tealDark}
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.35"
        />
        <path
          d="M 53.5 42 Q 57 40.5 60.5 42"
          fill="none"
          stroke={C.tealDark}
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.35"
        />
      </g>
    )}

    {eyeType === "thinking" && (
      <g id="eyes-thinking">
        {/* Looking up-right */}
        <circle cx="45" cy="42" r="2.8" fill={C.charcoal} />
        <circle cx="46" cy="41" r="0.9" fill="#FFFFFF" />
        <circle cx="59" cy="42" r="2.8" fill={C.charcoal} />
        <circle cx="60" cy="41" r="0.9" fill="#FFFFFF" />
      </g>
    )}

    {eyeType === "confused" && (
      <g id="eyes-confused">
        {/* Cute quizzical eyes: one wide, one slightly tilted with raised brow */}
        <circle cx="43" cy="44.5" r="3" fill={C.charcoal} />
        <circle cx="42.2" cy="43.5" r="0.9" fill="#FFFFFF" />
        <path d="M 39 39 Q 43 37 47 40" fill="none" stroke={C.charcoal} strokeWidth="1.4" strokeLinecap="round" />

        <circle cx="57" cy="44.5" r="2.5" fill={C.charcoal} />
        <circle cx="56.2" cy="43.7" r="0.8" fill="#FFFFFF" />
        <path d="M 54 41 Q 57 41.5 60 41" fill="none" stroke={C.charcoal} strokeWidth="1.2" strokeLinecap="round" />
      </g>
    )}

    {eyeType === "sleeping" && (
      <g id="eyes-sleeping">
        {/* Serene closed sleeping curves */}
        <path d="M 39 45 Q 43 47 47 45" fill="none" stroke={C.charcoal} strokeWidth="2" strokeLinecap="round" />
        <path d="M 53 45 Q 57 47 61 45" fill="none" stroke={C.charcoal} strokeWidth="2" strokeLinecap="round" />
      </g>
    )}

    {/* Mouth */}
    {mouthType === "smile" && (
      <path
        d="M 47 52 Q 50 55.5 53 52"
        fill="none"
        stroke={C.charcoal}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    )}

    {mouthType === "wide-smile" && (
      <path
        d="M 46 51 Q 50 57 54 51 Z"
        fill={C.charcoal}
      />
    )}

    {mouthType === "curious" && (
      <path
        d="M 48 52 Q 51 54 53 51"
        fill="none"
        stroke={C.charcoal}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    )}

    {mouthType === "cheerful" && (
      <path
        d="M 46 50 Q 50 56 54 50"
        fill="none"
        stroke={C.charcoal}
        strokeWidth="2"
        strokeLinecap="round"
      />
    )}

    {mouthType === "quizzical" && (
      <path
        d="M 47 53 Q 50 51.5 53 53"
        fill="none"
        stroke={C.charcoal}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    )}

    {mouthType === "open" && (
      <path
        d="M 46 50.5 Q 50 58 54 50.5 Z"
        fill={C.charcoal}
      />
    )}

    {mouthType === "serene" && (
      <path
        d="M 48 52 Q 50 54 52 52"
        fill="none"
        stroke={C.charcoal}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    )}
  </g>
);

/**
 * Common Resting Arms (Snug at y=64, hugging lower triangle to y=81.5)
 */
export const RestingLeftArm: React.FC = () => (
  <g id="arm-resting-left">
    <path
      d="M 32 64 C 27 68 22 75 22 81 C 22 84 25.5 85 27 82 C 29 77 34 70 36 65 Z"
      fill={C.tealPrimary}
    />
    <circle cx="24.5" cy="81.5" r="2.8" fill={C.tealPrimary} />
  </g>
);

export const RestingRightArm: React.FC = () => (
  <g id="arm-resting-right">
    <path
      d="M 68 64 C 73 68 78 75 78 81 C 78 84 74.5 85 73 82 C 71 77 66 70 64 65 Z"
      fill={C.tealDark}
    />
    <circle cx="75.5" cy="81.5" r="2.8" fill={C.tealDark} />
  </g>
);

// ============================================================================
// 16 STANDARD AVANI POSES
// ============================================================================

/** 1. Default (Hero) Pose: Natural compact standing pose with snug resting arms */
export const AvaniDefaultSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    <AvaniBaseBody hasCoralNeck={false} idPrefix="avani-def" />
    <RestingLeftArm />
    <RestingRightArm />
    <AvaniFace eyeType="normal" mouthType="smile" />
  </svg>
);

/** 2. Wave Pose: Left arm resting snug to torso, right arm raised waving gracefully */
export const AvaniWaveSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-wave" />
    <RestingLeftArm />
    <g id="waving-arm">
      <path
        d="M 65 66 C 70 62 76 52 80 43 C 81 40 85 41 85 44 C 83 52 76 63 69 69 Z"
        fill={C.tealDark}
      />
      <circle cx="82.5" cy="41" r="3.6" fill={C.tealDark} />
      <path
        d="M 87 35 C 89 38 89 43 87 46"
        fill="none"
        stroke={C.tealHighlight}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M 91 32 C 94 37 94 44 91 49"
        fill="none"
        stroke={C.tealPrimary}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </g>
    <AvaniFace eyeType="normal" mouthType="wide-smile" />
  </svg>
);

/** 3. Learning Pose: Holding open geometric study book with warm, focused friendly eyes */
export const AvaniLearningSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-learn" />
    <AvaniFace eyeType="focused" mouthType="smile" />
    <path
      d="M 31 65 C 27 70 29 78 35 79 C 38 79 38 76 35 75 C 32 74 31 69 34 66 Z"
      fill={C.tealPrimary}
    />
    <path
      d="M 69 65 C 73 70 71 78 65 79 C 62 79 62 76 65 75 C 68 74 69 69 66 66 Z"
      fill={C.tealDark}
    />
    <g id="avani-book">
      <path
        d="M 50 73 L 34 66 C 32 65 31 67 31 69 L 31 80 C 31 82 33 83 35 84 L 50 89 Z"
        fill={C.bookPages}
        stroke={C.bookCover}
        strokeWidth="1.2"
      />
      <path
        d="M 50 73 L 66 66 C 68 65 69 67 69 69 L 69 80 C 69 82 67 83 65 84 L 50 89 Z"
        fill={C.bookPages}
        stroke={C.tealDeep}
        strokeWidth="1.2"
      />
      <path d="M 50 73 L 50 86 L 47 83 L 50 82" fill={C.coralAccent} />
      <circle cx="35" cy="78" r="3.2" fill={C.tealPrimary} />
      <circle cx="65" cy="78" r="3.2" fill={C.tealDark} />
    </g>
  </svg>
);

/** 4. Thinking Pose: Hand on chin, natural shoulder height, looking upward at ideas */
export const AvaniThinkingSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    <circle cx="70" cy="18" r="2.2" fill={C.tealHighlight} opacity="0.7" />
    <circle cx="78" cy="12" r="3.2" fill={C.tealPrimary} opacity="0.8" />
    <circle cx="88" cy="6" r="4.2" fill={C.tealHighlight} />
    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-think" />
    <AvaniFace eyeType="thinking" mouthType="curious" />
    <RestingLeftArm />
    <path
      d="M 67 65 C 71 67 69 73 63 69 C 60 67 60 64 62 63 C 65 62 67 60 64 57 C 62 55 58 56 58 58 Z"
      fill={C.tealDark}
    />
    <circle cx="58" cy="58" r="3.2" fill={C.tealDark} />
  </svg>
);

/** 5. Success Pose: Compact arms raised high in celebration from natural shoulder */
export const AvaniSuccessSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    <g id="success-star">
      <path
        d="M 50 4 L 52.5 10 L 59 10.5 L 54 15 L 55.5 21 L 50 17.5 L 44.5 21 L 46 15 L 41 10.5 L 47.5 10 Z"
        fill={C.gold}
      />
      <circle cx="34" cy="12" r="1.5" fill={C.gold} opacity="0.8" />
      <circle cx="66" cy="12" r="1.5" fill={C.gold} opacity="0.8" />
    </g>
    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-succ" />
    <path
      d="M 31 66 C 26 58 20 47 18 38 C 17 35 21 34 23 37 C 26 44 31 56 36 64 Z"
      fill={C.tealPrimary}
    />
    <circle cx="19" cy="36" r="3.4" fill={C.tealPrimary} />
    <path
      d="M 69 66 C 74 58 80 47 82 38 C 83 35 79 34 77 37 C 74 44 69 56 64 64 Z"
      fill={C.tealDark}
    />
    <circle cx="81" cy="36" r="3.4" fill={C.tealDark} />
    <AvaniFace eyeType="happy" mouthType="wide-smile" />
  </svg>
);

/** 6. Idea Pose: Hand gesturing to an inspired glowing lightbulb from torso shoulder */
export const AvaniIdeaSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    <g id="idea-bulb">
      <circle cx="50" cy="10" r="5" fill={C.gold} />
      <path d="M 48 15 L 52 15 L 51 17 L 49 17 Z" fill="#E65100" />
      <line x1="50" y1="2" x2="50" y2="0" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="43" y1="5" x2="41" y2="3" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="57" y1="5" x2="59" y2="3" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round" />
    </g>
    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-idea" />
    <RestingLeftArm />
    <path
      d="M 67 65 C 71 58 75 49 76 39 C 76 36 80 37 80 40 C 79 48 74 58 69 67 Z"
      fill={C.tealDark}
    />
    <circle cx="77" cy="38" r="3.2" fill={C.tealDark} />
    <AvaniFace eyeType="normal" mouthType="cheerful" lookOffset={{ x: 0, y: -2 }} />
  </svg>
);

/** 7. Processing Pose: Warm friendly eyes, compact busy hands, smooth CSS orbiting ring */
export const AvaniProcessingSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    <style>{`
      @keyframes avani-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .avani-spinner { transform-origin: 50px 60px; animation: avani-orbit 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
      @media (prefers-reduced-motion: reduce) { .avani-spinner { animation: none; } }
    `}</style>
    <g className="avani-spinner">
      <circle cx="50" cy="60" r="44" fill="none" stroke="rgba(0, 128, 128, 0.15)" strokeWidth="2.5" />
      <circle cx="50" cy="60" r="44" fill="none" stroke={C.tealHighlight} strokeWidth="2.5" strokeDasharray="28 248" strokeLinecap="round" />
      <circle cx="81" cy="29" r="3" fill={C.tealPrimary} />
      <circle cx="19" cy="91" r="2" fill={C.coralAccent} />
    </g>
    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-proc" />
    <AvaniFace eyeType="processing" mouthType="smile" />
    <path
      d="M 31 65 C 30 72 35 76 41 75 C 44 75 44 72 41 71 C 36 71 33 67 34 64 Z"
      fill={C.tealPrimary}
    />
    <circle cx="41" cy="74" r="3" fill={C.tealPrimary} />
    <path
      d="M 69 65 C 70 72 65 76 59 75 C 56 75 56 72 59 71 C 64 71 67 67 66 64 Z"
      fill={C.tealDark}
    />
    <circle cx="59" cy="74" r="3" fill={C.tealDark} />
  </svg>
);

/** 8. Empty State Pose: Relaxed posture, snug hands folded peacefully in front */
export const AvaniEmptySvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    <path d="M 12 108 L 88 108" stroke="rgba(0, 128, 128, 0.2)" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 4" />
    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-emp" />
    <path
      d="M 31 65 C 29 73 36 78 44 78 C 47 78 47 75 44 74 C 38 74 33 69 34 64 Z"
      fill={C.tealPrimary}
    />
    <path
      d="M 69 65 C 71 73 64 78 56 78 C 53 78 53 75 56 74 C 62 74 67 69 66 64 Z"
      fill={C.tealDark}
    />
    <circle cx="50" cy="76" r="3.2" fill={C.tealMedium} />
    <AvaniFace eyeType="happy" mouthType="smile" />
  </svg>
);

/** 9. Explaining Pose: Teacher/guide posture with communicative open hands */
export const AvaniExplainingSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-expl" />
    {/* Left hand gesturing open palm welcoming */}
    <path
      d="M 31 65 C 25 70 24 76 28 80 C 31 82 34 79 33 76 C 30 73 33 68 35 65 Z"
      fill={C.tealPrimary}
    />
    <ellipse cx="27" cy="78" rx="3.5" ry="3" fill={C.tealPrimary} />
    {/* Right hand expressive open explanatory gesture */}
    <path
      d="M 69 65 C 74 67 79 69 82 72 C 85 75 83 78 80 77 C 76 75 73 70 67 66 Z"
      fill={C.tealDark}
    />
    <ellipse cx="81" cy="74" rx="3.5" ry="3" fill={C.tealDark} />
    <AvaniFace eyeType="normal" mouthType="smile" />
  </svg>
);

/** 10. Pointing Pose: Pointing outward with index finger toward text/CTA */
export const AvaniPointingSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-pt" />
    <RestingRightArm />
    {/* Left arm extended horizontally with clear pointing index finger */}
    <g id="pointing-arm-left">
      <path
        d="M 32 65 C 24 66 18 67 12 68 C 9 68.5 9 71.5 12 72 C 18 73 25 71 34 68 Z"
        fill={C.tealPrimary}
      />
      {/* Index finger pointer tip */}
      <circle cx="11" cy="70" r="2.5" fill={C.tealPrimary} />
      {/* Subtle CTA highlight indicator ray */}
      <line x1="5" y1="70" x2="1" y2="70" stroke={C.tealHighlight} strokeWidth="1.8" strokeLinecap="round" />
    </g>
    <AvaniFace eyeType="normal" mouthType="cheerful" lookOffset={{ x: -2, y: 0 }} />
  </svg>
);

/** 11. Celebrating Pose: Ecstatic jumping celebration with colorful confetti */
export const AvaniCelebratingSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    {/* Floating Confetti Shapes */}
    <path d="M 24 16 L 27 12 L 30 16 L 27 20 Z" fill={C.gold} />
    <path d="M 73 14 L 78 12 L 76 18 Z" fill={C.coralAccent} />
    <circle cx="16" cy="24" r="2" fill={C.tealHighlight} />
    <circle cx="84" cy="20" r="2.5" fill={C.gold} />
    <circle cx="50" cy="8" r="2.5" fill={C.tealPrimary} />
    <path d="M 48 3 L 52 3 L 50 7 Z" fill={C.coralAccent} />

    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-cel" />
    {/* Both arms flung wide in ecstatic cheering */}
    <path
      d="M 30 65 C 22 56 16 44 14 34 C 13 31 17 30 19 33 C 23 42 29 55 35 64 Z"
      fill={C.tealPrimary}
    />
    <circle cx="15" cy="32" r="3.6" fill={C.tealPrimary} />

    <path
      d="M 70 65 C 78 56 84 44 86 34 C 87 31 83 30 81 33 C 77 42 71 55 65 64 Z"
      fill={C.tealDark}
    />
    <circle cx="85" cy="32" r="3.6" fill={C.tealDark} />

    <AvaniFace eyeType="happy" mouthType="open" />
  </svg>
);

/** 12. Confused Pose: Cute head-tilt, raised brow, scratching head with question mark */
export const AvaniConfusedSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    {/* Floating Soft Teal Question Mark */}
    <g id="confused-qm">
      <path
        d="M 76 14 C 76 11 79 9 82 9 C 85 9 87 11 87 13 C 87 16 84 18 83 20 L 83 22"
        fill="none"
        stroke={C.tealPrimary}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="83" cy="25" r="1.3" fill={C.tealPrimary} />
    </g>

    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-conf" />
    {/* Left arm slight shrug outward */}
    <path
      d="M 31 65 C 26 70 22 75 24 79 C 26 82 29 80 29 77 C 29 73 33 68 35 65 Z"
      fill={C.tealPrimary}
    />
    <circle cx="24" cy="78" r="2.8" fill={C.tealPrimary} />

    {/* Right hand scratching head at temple */}
    <path
      d="M 68 65 C 73 60 76 52 75 44 C 74 41 71 42 71 45 C 71 51 68 58 64 64 Z"
      fill={C.tealDark}
    />
    <circle cx="73" cy="44" r="3.2" fill={C.tealDark} />

    <AvaniFace eyeType="confused" mouthType="quizzical" />
  </svg>
);

/** 13. Encouraging Pose: Cheerful supportive thumbs-up / "You've got this!" */
export const AvaniEncouragingSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    {/* Supportive Sparkle of Energy */}
    <g id="encourage-sparkle">
      <circle cx="62" cy="52" r="1.8" fill={C.gold} />
      <line x1="62" y1="47" x2="62" y2="45" stroke={C.gold} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="66" y1="49" x2="68" y2="47" stroke={C.gold} strokeWidth="1.2" strokeLinecap="round" />
    </g>

    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-enc" />
    <RestingLeftArm />

    {/* Right Arm Giving Big Cheerful Thumbs-Up at Chest */}
    <path
      d="M 68 65 C 70 71 67 76 61 74 C 57 73 57 69 61 68 C 64 67 66 65 65 63 Z"
      fill={C.tealDark}
    />
    {/* Fist & Upward Thumb */}
    <circle cx="60" cy="71" r="3.5" fill={C.tealDark} />
    {/* Thumb pointing up proudly */}
    <path
      d="M 60 71 L 60 63 C 60 61.5 62.5 61.5 62.5 63 L 62.5 71 Z"
      fill={C.tealDark}
    />

    <AvaniFace eyeType="normal" mouthType="cheerful" />
  </svg>
);

/** 14. Reading Pose: Scholarly reader with study glasses & clinical notes sheet */
export const AvaniReadingSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-read" />

    {/* Study Glasses on Face */}
    <g id="avani-glasses">
      <circle cx="43" cy="44" r="5" fill="none" stroke={C.gold} strokeWidth="1.1" />
      <circle cx="57" cy="44" r="5" fill="none" stroke={C.gold} strokeWidth="1.1" />
      <line x1="48" y1="44" x2="52" y2="44" stroke={C.gold} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="38" y1="43" x2="35" y2="42" stroke={C.gold} strokeWidth="0.9" strokeLinecap="round" />
      <line x1="62" y1="43" x2="65" y2="42" stroke={C.gold} strokeWidth="0.9" strokeLinecap="round" />
    </g>

    <AvaniFace eyeType="focused" mouthType="smile" />

    {/* Hands Holding Study Document Sheet */}
    <g id="study-sheet">
      <rect x="36" y="69" width="28" height="20" rx="2" fill={C.bookPages} stroke={C.tealDeep} strokeWidth="1" />
      <line x1="40" y1="74" x2="60" y2="74" stroke={C.tealPrimary} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      <line x1="40" y1="78" x2="58" y2="78" stroke={C.tealPrimary} strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <line x1="40" y1="82" x2="52" y2="82" stroke={C.coralAccent} strokeWidth="1" strokeLinecap="round" opacity="0.7" />
      {/* Gripping Paws */}
      <circle cx="36" cy="79" r="3" fill={C.tealPrimary} />
      <circle cx="64" cy="79" r="3" fill={C.tealDark} />
    </g>

    <path
      d="M 31 65 C 28 69 30 76 36 78"
      stroke={C.tealPrimary}
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    <path
      d="M 69 65 C 72 69 70 76 64 78"
      stroke={C.tealDark}
      strokeWidth="3.5"
      strokeLinecap="round"
    />
  </svg>
);

/** 15. Presenting Pose: Marketing host with welcoming open presentation gesture */
export const AvaniPresentingSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-pres" />
    <RestingLeftArm />

    {/* Right Arm Gracefully Sweeping Outward in Host/Presenter Stance */}
    <g id="presenting-arm">
      <path
        d="M 67 65 C 73 66 79 66 84 64 C 88 63 89 67 86 69 C 80 72 74 71 67 68 Z"
        fill={C.tealDark}
      />
      {/* Open upturned palm presenting the adjacent marketing copy */}
      <ellipse cx="86" cy="65" rx="3.8" ry="3" fill={C.tealDark} />
      {/* Presentation Aura Arc */}
      <path
        d="M 90 58 C 93 63 93 68 90 73"
        fill="none"
        stroke={C.tealHighlight}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.8"
      />
    </g>

    <AvaniFace eyeType="normal" mouthType="cheerful" lookOffset={{ x: 1, y: 0 }} />
  </svg>
);

/** 16. Sleeping Pose: Peaceful napping, folded arms cushion, gentle Zzz */
export const AvaniSleepingSvg: React.FC<AvaniVectorProps> = ({ size = 64, className = "", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} {...rest}>
    {/* Floating Peaceful Zzz */}
    <g id="sleeping-zzz">
      <path d="M 68 21 L 73 21 L 68 26 L 73 26" fill="none" stroke={C.tealHighlight} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 76 14 L 82 14 L 76 20 L 82 20" fill="none" stroke={C.tealPrimary} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 85 6 L 93 6 L 85 13 L 93 13" fill="none" stroke={C.tealHighlight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </g>

    <AvaniBaseBody hasCoralNeck={true} idPrefix="avani-sleep" />

    {/* Arms Folded as Comfy Pillow Cushion at Chest */}
    <g id="sleeping-arms-cushion">
      <path
        d="M 31 65 C 30 73 36 78 46 78 C 50 78 50 74 46 74 C 38 74 34 69 34 65 Z"
        fill={C.tealPrimary}
      />
      <path
        d="M 69 65 C 70 73 64 78 54 78 C 50 78 50 74 54 74 C 62 74 66 69 66 65 Z"
        fill={C.tealDark}
      />
      <ellipse cx="50" cy="76" rx="4" ry="3.2" fill={C.tealMedium} />
    </g>

    <AvaniFace eyeType="sleeping" mouthType="serene" />
  </svg>
);

/**
 * Unified Component Router for All 16 Avani Poses
 */
export const AVANI_POPES_REGISTRY: Record<AvaniPose, React.FC<AvaniVectorProps>> = {
  default: AvaniDefaultSvg,
  hero: AvaniDefaultSvg,
  wave: AvaniWaveSvg,
  learning: AvaniLearningSvg,
  thinking: AvaniThinkingSvg,
  success: AvaniSuccessSvg,
  idea: AvaniIdeaSvg,
  processing: AvaniProcessingSvg,
  empty: AvaniEmptySvg,
  explaining: AvaniExplainingSvg,
  pointing: AvaniPointingSvg,
  celebrating: AvaniCelebratingSvg,
  confused: AvaniConfusedSvg,
  encouraging: AvaniEncouragingSvg,
  reading: AvaniReadingSvg,
  presenting: AvaniPresentingSvg,
  sleeping: AvaniSleepingSvg,
};

export const AvaniVector: React.FC<AvaniVectorProps> = ({ pose = "default", ...props }) => {
  const Component = AVANI_POPES_REGISTRY[pose] ?? AvaniDefaultSvg;
  return <Component {...props} />;
};

export default AvaniVector;
