import { motion } from "framer-motion";
import { Sparkles, Moon, Sun } from "lucide-react";
import { HeroSection } from "./landing/HeroSection";
import { FeatureCards } from "./landing/FeatureCards";
import { TestimonialsSection } from "./landing/TestimonialsSection";
import { FeaturesSection } from "./landing/FeaturesSection";
import { PricingSection } from "./landing/PricingSection";
import { Footer } from "./landing/Footer";

interface LandingPageProps {
  onStartStudying: () => void;
  isDark: boolean;
  onToggleDark: () => void;
}

export function LandingPage({
  onStartStudying,
  isDark,
  onToggleDark,
}: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)]">
      {/* Header/Nav */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 left-0 right-0 z-50 bg-[var(--color-background)]/80 backdrop-blur-xl border-b border-[var(--color-border)]"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <motion.div
            className="flex items-center gap-2"
            whileHover={{ scale: 1.02 }}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">AVANA</span>
          </motion.div>

          <div className="flex items-center gap-4">
            <button
              onClick={onToggleDark}
              className="p-2 rounded-lg hover:bg-[var(--color-border)] transition-colors"
            >
              {isDark ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onStartStudying}
              className="px-5 py-2.5 bg-[var(--color-text)] text-[var(--color-background)] rounded-xl font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Get Started Free
            </motion.button>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <main>
        <HeroSection onStartStudying={onStartStudying} />
        <FeatureCards />
        <TestimonialsSection />
        <FeaturesSection />
        <PricingSection onStartStudying={onStartStudying} />
      </main>

      <Footer />
    </div>
  );
}
