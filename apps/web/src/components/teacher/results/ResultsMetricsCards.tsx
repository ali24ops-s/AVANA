/**
 * ResultsMetricsCards component.
 *
 * Renders statistical cards based on the authoritative backend aggregate:
 *  - enrolled, submitted, in-progress, absent, timed-out counts
 *  - average, max, and min scores
 *  - passing rate percentage
 */

import { Card } from "../../ui/index.js";
import type { TeacherExamResultsAggregateDTO } from "../../../lib/api/teacher.js";
import { Users, CheckCircle, Clock, AlertCircle, Award, TrendingUp } from "lucide-react";

export interface ResultsMetricsCardsProps {
  results: TeacherExamResultsAggregateDTO;
}

export function ResultsMetricsCards({ results }: ResultsMetricsCardsProps) {
  const cards = [
    {
      title: "دانش‌آموزان کلاس",
      value: `${results.enrolledCount.toLocaleString("fa-IR")} نفر`,
      icon: <Users className="w-5 h-5 text-[#008080]" />,
      bg: "bg-[#008080]/10",
      description: "تعداد کل اعضای کلاس",
    },
    {
      title: "تکمیل و ثبت نهایی",
      value: `${results.submittedCount.toLocaleString("fa-IR")} نفر`,
      icon: <CheckCircle className="w-5 h-5 text-emerald-600" />,
      bg: "bg-emerald-500/10",
      description: `${results.timedOutCount > 0 ? `${results.timedOutCount.toLocaleString("fa-IR")} پایان زمان` : "ثبت به موقع"}`,
    },
    {
      title: "غایبین آزمون",
      value: `${results.absentCount.toLocaleString("fa-IR")} نفر`,
      icon: <AlertCircle className="w-5 h-5 text-amber-600" />,
      bg: "bg-amber-500/10",
      description: "بدون شروع آزمون",
    },
    {
      title: "میانگین نمرات",
      value: results.submittedCount + results.timedOutCount > 0 ? `${results.averageScore.toLocaleString("fa-IR")}` : "—",
      icon: <TrendingUp className="w-5 h-5 text-[#5ba0c4]" />,
      bg: "bg-[#e8f4fb] dark:bg-sky-950/60",
      description: `بیشترین: ${results.maxScore.toLocaleString("fa-IR")} | کمترین: ${results.minScore.toLocaleString("fa-IR")}`,
    },
    {
      title: "درصد قبولی",
      value:
        results.passingRate !== null && results.passingRate !== undefined
          ? results.submittedCount + results.timedOutCount > 0
            ? `${results.passingRate.toLocaleString("fa-IR")}٪`
            : "—"
          : "—",
      icon: <Award className="w-5 h-5 text-purple-600" />,
      bg: "bg-purple-500/10",
      description:
        results.passingRate !== null && results.passingRate !== undefined
          ? "بر اساس حد نصاب قبولی"
          : "بدون حد نصاب قبولی",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {cards.map((card, idx) => (
        <Card
          key={idx}
          className="p-4 flex flex-col justify-between border border-[var(--color-border)] shadow-xs"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-semibold text-[var(--color-text-muted)] line-clamp-1">
              {card.title}
            </span>
            <div className={`w-8 h-8 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
              {card.icon}
            </div>
          </div>

          <div>
            <div className="text-lg sm:text-xl font-black text-[var(--color-text)]">
              {card.value}
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)] mt-1 truncate">
              {card.description}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
