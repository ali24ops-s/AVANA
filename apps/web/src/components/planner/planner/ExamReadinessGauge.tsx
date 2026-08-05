import { motion } from "framer-motion";
import { Gauge, ArrowUpRight, CheckCircle2 } from "lucide-react";

interface ExamReadinessGaugeProps {
  readiness: number;
  confidence: number;
}

export function ExamReadinessGauge({
  readiness,
  confidence,
}: ExamReadinessGaugeProps) {
  const getGaugeColor = (value: number): string => {
    if (value >= 80) return "#22c55e";
    if (value >= 60) return "#f59e0b";
    if (value >= 40) return "#f97316";
    return "#ef4444";
  };

  const gaugeColor = getGaugeColor(readiness);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6"
    >
      <h3 className="font-bold mb-4 flex items-center gap-2">
        <Gauge className="w-5 h-5 text-indigo-500" />
        Exam Readiness
      </h3>

      {/* Gauge Visualization */}
      <div className="relative w-48 h-28 mx-auto my-4">
        <svg viewBox="0 0 200 120" className="w-full">
          {/* Background arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="16"
            strokeLinecap="round"
          />

          {/* Progress arc */}
          <motion.path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={gaugeColor}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={251}
            style={{ strokeDashoffset: 251 - 251 * (readiness / 100) }}
          />

          {/* Needle */}
          <motion.g
            animate={{
              transformOrigin: "100px 100px",
              rotate: [-45 + 180 * (readiness / 100)],
            }}
            transition={{ duration: 1.5, ease: "easeOut", type: "spring" }}
          >
            <line
              x1="100"
              y1="100"
              x2="100"
              y2="35"
              stroke="var(--color-text)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="100" cy="100" r="8" fill={gaugeColor} />
          </motion.g>

          {/* Min/Max labels */}
          <text x="10" y="115" fontSize="12" fill="currentColor" opacity="0.5">
            Low
          </text>
          <text x="170" y="115" fontSize="12" fill="currentColor" opacity="0.5">
            Ready
          </text>
        </svg>

        {/* Value display */}
        <div className="absolute inset-0 flex items-center justify-center pt-8">
          <div className="text-center">
            <span className="text-4xl font-bold" style={{ color: gaugeColor }}>
              {readiness}%
            </span>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Predicted Score
            </p>
          </div>
        </div>
      </div>

      {/* Confidence Comparison */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-background)] mt-4">
        <div className="text-center">
          <p className="text-xs text-[var(--color-text-muted)]">
            Your Confidence
          </p>
          <p className="font-semibold">{confidence}%</p>
        </div>

        <ArrowUpRight className={`w-5 h-5`} style={{ color: gaugeColor }} />

        <div className="text-center text-right">
          <p className="text-xs text-[var(--color-muted)]">AI Predicted</p>
          <p className="font-semibold">{readiness}%</p>
        </div>
      </div>

      {/* Analysis */}
      <div className="mt-4 p-3 rounded-xl bg-[var(--color-background)] space-y-2">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-[var(--color-text-muted)]">
            <strong className="text-[var(--color-text)]">Strong areas:</strong>{" "}
            Mechanism of action, Clinical indications
          </p>
        </div>
        <div className="flex items-start gap-2">
          <ArrowUpRight className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-[var(--color-text-muted)]">
            <strong className="text-[var(--color-text)]">Needs work:</strong>{" "}
            Drug classifications, Side effect comparisons
          </p>
        </div>
      </div>
    </motion.div>
  );
}
