import { motion } from "framer-motion";
import { Check, Zap, ArrowRight } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect to get started",
    features: [
      "3 uploads per month",
      "Basic AI lessons",
      "50 flashcards per upload",
      "Standard quizzes",
      "Community support",
    ],
    cta: "Get Started Free",
    popular: false,
    gradient: false,
  },
  {
    name: "Premium",
    price: "$9.99",
    period: "/month",
    description: "For serious students",
    features: [
      "Unlimited uploads",
      "Advanced AI explanations",
      "Unlimited flashcards",
      "Adaptive quizzes",
      "AI Mentor chat (24/7)",
      "Exam predictions",
      "Priority support",
    ],
    cta: "Start Premium Trial",
    popular: true,
    gradient: true,
  },
];

export function PricingSection({
  onStartStudying,
}: {
  onStartStudying: () => void;
}) {
  return (
    <section className="py-24 px-6 bg-[var(--color-surface)]">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-[var(--color-text-muted)] max-w-2xl mx-auto">
            Start free. Upgrade when you're ready.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              whileHover={{ y: -8 }}
              className={`relative rounded-3xl p-8 ${
                plan.gradient
                  ? "bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 text-white shadow-2xl shadow-indigo-500/25"
                  : "bg-[var(--color-background)] border border-[var(--color-border)]"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full text-sm font-semibold text-black flex items-center gap-1">
                  <Zap className="w-4 h-4" />
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <h3
                  className={`text-xl font-semibold mb-2 ${plan.gradient ? "" : ""}`}
                >
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold">{plan.price}</span>
                  <span
                    className={`${plan.gradient ? "text-white/70" : "text-[var(--color-text-muted)]"}`}
                  >
                    {plan.period}
                  </span>
                </div>
                <p
                  className={`mt-2 ${plan.gradient ? "text-white/80" : "text-[var(--color-text-muted)]"}`}
                >
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        plan.gradient
                          ? "bg-white/20"
                          : "bg-green-100 dark:bg-green-900/30"
                      }`}
                    >
                      <Check
                        className={`w-3 h-3 ${plan.gradient ? "text-white" : "text-green-600 dark:text-green-400"}`}
                      />
                    </div>
                    <span className={plan.gradient ? "text-white/90" : ""}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onStartStudying}
                className={`w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition-colors ${
                  plan.gradient
                    ? "bg-white text-indigo-600 hover:bg-white/90"
                    : "bg-[var(--color-text)] text-[var(--color-background)] hover:opacity-90"
                }`}
              >
                {plan.cta}
                <ArrowRight className="w-5 h-5" />
              </motion.button>
            </motion.div>
          ))}
        </div>

        {/* Trust badge */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="text-center mt-12 text-[var(--color-text-muted)]"
        >
          No credit card required for free plan • Cancel anytime
        </motion.p>
      </div>
    </section>
  );
}
