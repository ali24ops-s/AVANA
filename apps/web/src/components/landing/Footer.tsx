/**
 * Footer for the landing page.
 *
 * Persian, centered layout matching Stitch design.
 */

import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export function Footer() {
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
      {/* Brand */}
      <Link
        to="/"
        className="font-headline text-2xl font-bold mb-6 hover:scale-105 transition-transform duration-300"
        style={{ color: "var(--lp-primary, #005c55)" }}
      >
        AVANA
      </Link>

      {/* Links */}
      <div className="flex flex-wrap justify-center gap-6 mb-8">
        {["درباره ما", "تماس با پشتیبانی", "قوانین و مقررات", "وبلاگ آموزشی"].map(
          (link) => (
            <a
              key={link}
              href="#"
              className="transition-colors duration-200"
              style={{ color: "var(--lp-on-surface-variant, #3e4947)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--lp-secondary, #6b38d4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--lp-on-surface-variant, #3e4947)";
              }}
            >
              {link}
            </a>
          )
        )}
      </div>

      {/* Copyright */}
      <p
        className="text-sm"
        style={{ color: "var(--lp-on-surface-variant, #3e4947)" }}
      >
        © ۲۰۲۶ آوانا. تمامی حقوق برای پلتفرم آموزشی آوانا محفوظ است.
      </p>
    </motion.footer>
  );
}
