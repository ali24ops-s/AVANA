/**
 * Final CTA Section
 *
 * Full-width CTA with radial gradient background.
 */

import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";

export function FinalCTASection() {
  const { isAuthenticated } = useAuth();
  const ctaHref = isAuthenticated ? "/courses" : "/sign-in";

  return (
    <section
      className="py-24 relative overflow-hidden"
      style={{ backgroundColor: "var(--lp-surface, #f8f9ff)" }}
    >
      {/* Background radial gradient */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[var(--lp-primary)] to-transparent bg-gradient-animate" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: "easeOut" as const }}
        className="max-w-3xl mx-auto px-6 text-center relative z-10"
      >
        <h2
          className="font-headline text-3xl md:text-5xl font-bold mb-6"
          style={{ color: "var(--lp-on-surface, #0b1c30)" }}
        >
          یادگیری بهتر از همین‌جا شروع می‌شود
        </h2>
        <p
          className="text-base md:text-lg mb-10"
          style={{ color: "var(--lp-on-surface-variant, #3e4947)" }}
        >
          به هزاران دانشجوی پزشکی بپیوندید که مسیر موفقیت خود را با آوانا هموار
          کرده‌اند.
        </p>

        <Link
          to={ctaHref}
          className="inline-flex items-center justify-center gap-3 h-16 px-10 rounded-2xl font-semibold text-lg cursor-pointer active:scale-95 shadow-lg transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
          style={{
            backgroundColor: "var(--lp-primary-container, #0f766e)",
            color: "var(--lp-on-primary-container, #a3faef)",
            boxShadow: "0 10px 15px -3px rgba(15,118,110,0.3)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              "var(--lp-primary, #005c55)";
            e.currentTarget.style.color = "var(--lp-on-primary, #ffffff)";
            e.currentTarget.style.boxShadow =
              "0 20px 25px -5px rgba(15,118,110,0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor =
              "var(--lp-primary-container, #0f766e)";
            e.currentTarget.style.color =
              "var(--lp-on-primary-container, #a3faef)";
            e.currentTarget.style.boxShadow =
              "0 10px 15px -3px rgba(15,118,110,0.3)";
          }}
        >
          همین حالا شروع کنید
          <span className="material-symbols-outlined rtl:-scale-x-100 text-xl">
            rocket_launch
          </span>
        </Link>
      </motion.div>
    </section>
  );
}
