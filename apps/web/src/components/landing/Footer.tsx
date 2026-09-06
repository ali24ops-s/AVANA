/**
 * Footer for the landing page.
 *
 * Preserves 100% of existing links, brand info, and copyright.
 */

import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { BrandLogo } from "../brand/BrandLogo.js";

export function Footer() {
  const footerLinks = [
    { title: "درباره ما", href: "/about", isInternalRoute: true },
    { title: "ویژگی‌ها", href: "#benefits", isInternalRoute: false },
    { title: "مسائل و مشکلات", href: "#features", isInternalRoute: false },
    { title: "چطور کار می‌کند", href: "#how-it-works", isInternalRoute: false },
    { title: "قوانین و مقررات", href: "/terms", isInternalRoute: true },
  ];

  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      className="w-full flex flex-col items-center py-12 px-6 max-w-[1280px] mx-auto text-center"
      style={{
        backgroundColor: "var(--lp-surface-container-lowest, #0b1120)",
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
      }}
    >
      {/* Brand with Cosmic Aurora Halo */}
      <div className="relative mb-8 flex items-center justify-center">
        {/* Outer cosmic nebula halo (ambient static background) */}
        <div className="absolute -inset-x-12 -inset-y-4 bg-gradient-to-r from-teal-500/0 via-teal-400/20 to-teal-500/0 rounded-full blur-2xl opacity-60 pointer-events-none" />
        <div className="absolute -inset-x-6 -inset-y-2 bg-gradient-to-r from-emerald-500/0 via-teal-300/25 to-emerald-500/0 rounded-full blur-lg opacity-70 pointer-events-none" />

        <BrandLogo
          linkTo="/"
          variant="wordmark-only"
          size="lg"
          wordmarkClassName="drop-shadow-[0_0_18px_rgba(45,212,191,0.55)] drop-shadow-[0_0_36px_rgba(20,184,166,0.3)] transition-transform duration-300"
          className="relative z-10 hover:scale-105 transition-transform duration-300"
        />
      </div>

      {/* Links */}
      <div className="flex flex-wrap justify-center gap-6 mb-8">
        {footerLinks.map((item) =>
          item.isInternalRoute ? (
            <Link
              key={item.title}
              to={item.href}
              className="transition-colors duration-200 text-sm font-medium text-slate-400 hover:text-teal-300"
            >
              {item.title}
            </Link>
          ) : (
            <a
              key={item.title}
              href={item.href}
              className="transition-colors duration-200 text-sm font-medium text-slate-400 hover:text-teal-300"
            >
              {item.title}
            </a>
          )
        )}
      </div>

      {/* Copyright */}
      <p className="text-xs sm:text-sm text-slate-400">
        © ۲۰۲۶ آوانا. تمامی حقوق برای پلتفرم آموزشی آوانا محفوظ است.
      </p>
    </motion.footer>
  );
}
