/**
 * ScoreDistributionBar component.
 *
 * Renders the score distribution ranges returned by the backend
 * using AVANA design tokens and the existing Progress bar primitive.
 */

import { Card, Progress } from "../../ui/index.js";
import type { ScoreDistribution } from "../../../lib/api/teacher.js";
import { BarChart3 } from "lucide-react";

export interface ScoreDistributionBarProps {
  distribution: ScoreDistribution[];
  totalCompleted: number;
}

export function ScoreDistributionBar({
  distribution,
  totalCompleted,
}: ScoreDistributionBarProps) {
  const variantMap: Record<string, "error" | "warning" | "secondary" | "success"> = {
    "کمتر از ۵۰٪": "error",
    "۵۰ تا ۶۹٪": "warning",
    "۷۰ تا ۸۴٪": "secondary",
    "۸۵ تا ۱۰۰٪": "success",
  };

  return (
    <Card className="p-5 border border-[var(--color-border)] shadow-xs space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-[var(--color-border)]">
        <BarChart3 className="w-4 h-4 text-[#008080]" />
        <h3 className="text-sm font-bold text-[var(--color-text)]">
          توزیع درصد نمرات شرکت‌کنندگان
        </h3>
        <span className="text-xs text-[var(--color-text-muted)] mr-auto">
          مجموع شرکت‌کنندگان کامل‌شده: {totalCompleted.toLocaleString("fa-IR")} نفر
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {distribution.map((item) => {
          const pct = totalCompleted > 0 ? Math.round((item.count / totalCompleted) * 100) : 0;
          const variant = variantMap[item.range] ?? "primary";

          return (
            <div key={item.range} className="space-y-1.5 p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--color-text)]">{item.range}</span>
                <span className="font-bold text-[var(--color-text)]">
                  {item.count.toLocaleString("fa-IR")} نفر ({pct.toLocaleString("fa-IR")}٪)
                </span>
              </div>
              <Progress
                value={pct}
                max={100}
                size="md"
                variant={variant}
                aria-label={`توزیع ${item.range}`}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
