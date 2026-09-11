import React from "react";

/**
 * Clean technical ambient radial accent for Landing Final CTA.
 * Replaces legacy cyberpunk spinning neon concentric rings with
 * a quiet, architectural technical focal element.
 */
export const LandingCrystallineCanvas: React.FC<{
  className?: string;
}> = ({ className = "" }) => {
  return (
    <div
      className={`relative w-full h-full pointer-events-none overflow-hidden select-none flex items-center justify-center ${className}`}
      aria-hidden="true"
    >
      {/* Subtle Canonical Ambient Radial Grid Accent */}
      <div
        className="w-[480px] h-[480px] rounded-full border border-[var(--avana-border-default)] opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, rgba(0, 128, 128, 0.05) 0%, transparent 70%)",
        }}
      />
      <div className="absolute w-[300px] h-[300px] rounded-full border border-[#008080]/15 opacity-40" />
    </div>
  );
};

export default LandingCrystallineCanvas;

