import React from "react";
import { motion } from "framer-motion";

interface SectionHeadingProps {
  badge?: string;
  badgeIcon?: React.ReactNode;
  title: string;
  highlightText?: string;
  subtitle?: string;
  align?: "center" | "right";
  className?: string;
  level?: "h1" | "h2" | "h3";
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({
  badge,
  badgeIcon,
  title,
  highlightText,
  subtitle,
  align = "center",
  className = "",
  level = "h2",
}) => {
  const isCenter = align === "center";
  const HeadingTag = level;

  return (
    <div
      className={`flex flex-col ${
        isCenter ? "items-center text-center mx-auto" : "items-start text-right"
      } max-w-3xl mb-12 sm:mb-16 ${className}`}
    >
      {badge && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold tracking-wide border mb-4 shadow-sm"
          style={{
            backgroundColor: "rgba(0, 128, 128, 0.08)",
            color: "#2dd4bf",
            borderColor: "rgba(45, 212, 191, 0.25)",
          }}
        >
          {badgeIcon && <span className="shrink-0">{badgeIcon}</span>}
          <span>{badge}</span>
        </motion.div>
      )}

      <HeadingTag
        className="font-headline text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black leading-tight text-slate-100"
      >
        {title}{" "}
        {highlightText && (
          <span
            className="text-transparent bg-clip-text bg-gradient-to-l from-teal-300 via-teal-400 to-cyan-300 inline-block drop-shadow-[0_0_20px_rgba(45,212,191,0.2)]"
          >
            {highlightText}
          </span>
        )}
      </HeadingTag>

      {subtitle && (
        <p className="mt-4 text-sm sm:text-base md:text-lg text-slate-300/90 leading-relaxed max-w-2xl">
          {subtitle}
        </p>
      )}
    </div>
  );
};
