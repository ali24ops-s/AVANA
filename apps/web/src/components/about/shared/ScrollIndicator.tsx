import React from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface ScrollIndicatorProps {
  targetId?: string;
  label?: string;
  className?: string;
}

export const ScrollIndicator: React.FC<ScrollIndicatorProps> = ({
  targetId = "problem-section",
  label = "ادامه داستان",
  className = "",
}) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8, duration: 0.6 }}
      className={`flex flex-col items-center justify-center gap-2 select-none ${className}`}
    >
      <a
        href={`#${targetId}`}
        onClick={handleClick}
        aria-label={label}
        className="group flex flex-col items-center gap-2 text-slate-400 hover:text-teal-300 transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-lg p-1"
      >
        <span className="text-xs font-medium tracking-wide group-hover:translate-y-0.5 transition-transform duration-300">
          {label}
        </span>
        <div className="w-8 h-12 rounded-full border border-slate-700/80 bg-slate-900/40 backdrop-blur-sm flex items-start justify-center p-1.5 shadow-[0_0_15px_rgba(0,128,128,0.15)] group-hover:border-teal-500/50 group-hover:shadow-[0_0_20px_rgba(45,212,191,0.25)] transition-all duration-300">
          <motion.div
            animate={{
              y: [0, 16, 0],
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="w-1.5 h-2 rounded-full bg-gradient-to-b from-teal-300 to-teal-500 shadow-sm"
          />
        </div>
        <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-teal-300 group-hover:translate-y-1 transition-all duration-300 animate-pulse" />
      </a>
    </motion.div>
  );
};
