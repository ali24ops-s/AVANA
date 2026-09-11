import React from "react";

/**
 * Technical subtle background pattern for Landing Hero.
 * Replaces legacy cyberpunk/neon floating particles with a quiet,
 * elegant technical grid aligned with AVANA's medical-SaaS aesthetic.
 */
export const LandingHeroCanvas: React.FC<{
  className?: string;
}> = ({ className = "" }) => {
  return (
    <div
      className={`relative w-full h-full pointer-events-none overflow-hidden select-none ${className}`}
      aria-hidden="true"
    >
      {/* Subtle Technical Grid Blueprint — Canonical AVANA Light Neutral / Pale Teal */}
      <div
        className="absolute inset-0 w-full h-full opacity-60"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(0, 128, 128, 0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 128, 128, 0.06) 1px, transparent 1px)
          `,
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 75% 60% at 50% 30%, black 20%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 75% 60% at 50% 30%, black 20%, transparent 80%)",
        }}
      />
    </div>
  );
};

export default LandingHeroCanvas;

