import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Download,
  Share2,
  Check,
  Copy,
  Sparkles,
  Smartphone,
  Square,
  Trophy,
  Flame,
} from "lucide-react";
import type { PublicAttemptResult } from "../../lib/api/studio-api.js";

export type CardFormat = "story" | "square" | "minimal" | "challenge";

interface QuizShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: PublicAttemptResult;
  quizSlug: string;
}

export const QuizShareModal: React.FC<QuizShareModalProps> = ({
  isOpen,
  onClose,
  result,
  quizSlug,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<CardFormat>("square");
  const [copiedLink, setCopiedLink] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const quizUrl = typeof window !== "undefined"
    ? `${window.location.origin}/quiz/${quizSlug}`
    : `https://avana.ir/quiz/${quizSlug}`;

  const score = Math.round(result.score);
  const rankTitle =
    score >= 85
      ? "استاد و نخبه"
      : score >= 70
      ? "پیشرو و متخصص"
      : score >= 50
      ? "در مسیر یادگیری"
      : "شروع‌کننده باانگیزه";

  const renderCanvas = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      let width = 1080;
      let height = 1080;

      if (selectedFormat === "story") {
        width = 1080;
        height = 1920;
      } else if (selectedFormat === "minimal") {
        width = 1000;
        height = 600;
      } else {
        // square or challenge
        width = 1080;
        height = 1080;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve("");

      // Background Gradient
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      if (selectedFormat === "challenge") {
        bgGrad.addColorStop(0, "#0f172a");
        bgGrad.addColorStop(0.5, "#1e1b4b");
        bgGrad.addColorStop(1, "#311042");
      } else if (selectedFormat === "story") {
        bgGrad.addColorStop(0, "#090d16");
        bgGrad.addColorStop(0.4, "#0f172a");
        bgGrad.addColorStop(1, "#0d2b27");
      } else if (selectedFormat === "minimal") {
        bgGrad.addColorStop(0, "#0f172a");
        bgGrad.addColorStop(1, "#1e293b");
      } else {
        // square
        bgGrad.addColorStop(0, "#0b1329");
        bgGrad.addColorStop(0.5, "#0d2438");
        bgGrad.addColorStop(1, "#064e3b");
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Decorative background glowing circles
      ctx.save();
      const circleGrad = ctx.createRadialGradient(
        width * 0.8,
        height * 0.2,
        20,
        width * 0.8,
        height * 0.2,
        width * 0.5,
      );
      circleGrad.addColorStop(0, "rgba(20, 184, 166, 0.25)");
      circleGrad.addColorStop(1, "rgba(20, 184, 166, 0)");
      ctx.fillStyle = circleGrad;
      ctx.beginPath();
      ctx.arc(width * 0.8, height * 0.2, width * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Top Brand Header
      ctx.direction = "rtl";
      ctx.textAlign = "right";

      // AVANA Brand logo pill
      const topY = selectedFormat === "story" ? 180 : 100;
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.roundRect(width - 320, topY - 40, 240, 60, 30);
      ctx.fill();

      ctx.font = "bold 26px Estedad, Vazirmatn, sans-serif";
      ctx.fillStyle = "#14b8a6";
      ctx.fillText("AVANA STUDIO", width - 120, topY);

      // Card Content Box
      const contentY = selectedFormat === "story" ? 480 : selectedFormat === "minimal" ? 180 : 260;

      // Challenge Badge if challenge
      if (selectedFormat === "challenge") {
        ctx.textAlign = "center";
        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 34px Estedad, Vazirmatn, sans-serif";
        ctx.fillText("🔥 چالش اطلاعات و دانش تخصصی", width / 2, contentY - 60);
      }

      // Quiz Title
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 46px Estedad, Vazirmatn, sans-serif";
      const title = result.quizTitle.length > 36 ? result.quizTitle.slice(0, 34) + "..." : result.quizTitle;
      ctx.fillText(title, width / 2, contentY);

      // Subtitle / Rank
      ctx.fillStyle = "#94a3b8";
      ctx.font = "26px Estedad, Vazirmatn, sans-serif";
      ctx.fillText(`سطح کسب‌شده: ${rankTitle}`, width / 2, contentY + 50);

      // Big Score Circle or Badge
      const circleY = selectedFormat === "story" ? 920 : selectedFormat === "minimal" ? 340 : 540;
      const circleRadius = selectedFormat === "minimal" ? 90 : 130;

      // Outer Glow
      ctx.beginPath();
      ctx.arc(width / 2, circleY, circleRadius + 14, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(20, 184, 166, 0.15)";
      ctx.fill();

      // Circle Base
      ctx.beginPath();
      ctx.arc(width / 2, circleY, circleRadius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.strokeStyle = "#14b8a6";
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.fill();

      // Score Text
      ctx.fillStyle = "#2dd4bf";
      ctx.font = `bold ${selectedFormat === "minimal" ? 64 : 92}px Estedad, Vazirmatn, sans-serif`;
      ctx.fillText(`%${score}`, width / 2, circleY + (selectedFormat === "minimal" ? 22 : 30));

      // Correct / Total stats
      const statsY = circleY + circleRadius + (selectedFormat === "story" ? 140 : 80);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 30px Estedad, Vazirmatn, sans-serif";
      ctx.fillText(
        `${result.correctCount} پاسخ درست از ${result.totalQuestions} سؤال`,
        width / 2,
        statsY,
      );

      // Challenge call-to-action text
      if (selectedFormat === "challenge") {
        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 32px Estedad, Vazirmatn, sans-serif";
        ctx.fillText("فکر می‌کنی بتونی نمره بیشتری از من بگیری؟ 😉", width / 2, statsY + 65);
      }

      // Footer callout & QR / link
      const footerY = height - (selectedFormat === "story" ? 200 : 80);
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.font = "24px Estedad, Vazirmatn, sans-serif";
      ctx.fillText("در این آزمون شرکت کنید و سطح خود را بسنجید:", width / 2, footerY - 45);

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 26px font-mono, sans-serif";
      const shortUrl = quizUrl.replace(/^https?:\/\//, "");
      ctx.fillText(shortUrl, width / 2, footerY);

      resolve(canvas.toDataURL("image/png"));
    });
  }, [selectedFormat, result, quizSlug, quizUrl, score, rankTitle]);

  const handleDownload = async () => {
    try {
      setIsGenerating(true);
      const dataUrl = await renderCanvas();
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `quiz-result-${quizSlug}-${selectedFormat}.png`;
      a.click();
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    try {
      setIsGenerating(true);
      const dataUrl = await renderCanvas();
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `quiz-result-${quizSlug}.png`, { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: result.quizTitle,
          text: `من در آزمون «${result.quizTitle}» نمره %${score} گرفتم! تو چطور؟`,
          files: [file],
          url: quizUrl,
        });
      } else if (navigator.share) {
        await navigator.share({
          title: result.quizTitle,
          text: `من در آزمون «${result.quizTitle}» نمره %${score} گرفتم! تو چطور؟`,
          url: quizUrl,
        });
      } else {
        // Fallback: Copy Link
        await navigator.clipboard.writeText(
          `من در آزمون «${result.quizTitle}» نمره %${score} گرفتم! لینک شرکت در آزمون: ${quizUrl}`,
        );
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      }
    } catch {
      // User cancelled share or unsupported
    } finally {
      setIsGenerating(false);
    }
  };

  const copyQuizUrl = async () => {
    await navigator.clipboard.writeText(quizUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">
                کارت اشتراک‌گذاری کارنامه
              </h3>
              <p className="text-xs text-slate-400">
                قالب دلخواه خود را انتخاب کنید و تصویر را ذخیره یا ارسال کنید
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selector Pills */}
        <div className="grid grid-cols-4 gap-2 my-4">
          {[
            { id: "square" as const, label: "پست مربعی", icon: Square },
            { id: "story" as const, label: "استوری", icon: Smartphone },
            { id: "challenge" as const, label: "کارت چالش", icon: Flame },
            { id: "minimal" as const, label: "مینیمال", icon: Trophy },
          ].map((fmt) => {
            const Icon = fmt.icon;
            const isSelected = selectedFormat === fmt.id;
            return (
              <button
                key={fmt.id}
                onClick={() => setSelectedFormat(fmt.id)}
                className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl text-xs font-semibold border transition-all ${
                  isSelected
                    ? "bg-teal-500/10 border-teal-500 text-teal-300"
                    : "bg-slate-800/50 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{fmt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Live CSS Preview of the Card */}
        <div className="flex-1 overflow-y-auto my-2 flex items-center justify-center p-2 bg-slate-950/40 rounded-2xl border border-slate-800/80">
          <div
            className={`w-full max-w-sm rounded-2xl p-6 text-center shadow-xl border border-teal-500/20 transition-all ${
              selectedFormat === "challenge"
                ? "bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950"
                : selectedFormat === "story"
                ? "bg-gradient-to-b from-slate-950 via-slate-900 to-teal-950 py-10"
                : "bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                AVANA STUDIO
              </span>
              <span className="text-[10px] text-slate-400">
                {selectedFormat === "challenge" ? "🔥 چالش علمی" : "کارنامه رسمی"}
              </span>
            </div>

            <h4 className="font-black text-lg text-white mb-1 line-clamp-2">
              {result.quizTitle}
            </h4>
            <p className="text-xs text-slate-400 mb-6">{rankTitle}</p>

            <div className="w-28 h-28 mx-auto rounded-full border-4 border-teal-400 bg-slate-900/90 flex flex-col items-center justify-center shadow-lg shadow-teal-500/20 mb-4">
              <span className="text-3xl font-black text-teal-300">
                %{score}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">نمره کسب‌شده</span>
            </div>

            <p className="text-xs text-slate-300 font-semibold mb-2">
              {result.correctCount} پاسخ درست از {result.totalQuestions} سؤال
            </p>

            {selectedFormat === "challenge" && (
              <p className="text-xs text-amber-300 font-bold mb-3">
                آیا می‌تونی رکورد من رو بزنی؟ 😉
              </p>
            )}

            <div className="text-[10px] font-mono text-slate-400 border-t border-slate-800 pt-3">
              avana.ir/quiz/{quizSlug}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-slate-800 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              disabled={isGenerating}
              className="flex-1 py-2.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-600 active:scale-[0.98] text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 transition-all disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>دانلود تصویر کارت (PNG)</span>
            </button>

            <button
              onClick={handleShare}
              disabled={isGenerating}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white font-semibold text-sm flex items-center justify-center gap-2 border border-slate-700 transition-all disabled:opacity-50"
            >
              <Share2 className="w-4 h-4 text-teal-400" />
              <span>اشتراک‌گذاری</span>
            </button>
          </div>

          <button
            onClick={copyQuizUrl}
            className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 flex items-center justify-center gap-2 transition-colors"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-teal-400">لینک آزمون کپی شد!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>کپی لینک مستقیم آزمون</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
