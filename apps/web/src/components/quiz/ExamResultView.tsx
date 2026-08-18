import { TrophyIcon, RefreshIcon } from "./ExamIcons.js";

export interface ExamResultViewProps {
  result: {
    score: number;
    correct: number;
    total: number;
    passed?: boolean;
    answers?: Record<string, unknown>;
    questions?: Array<{
      id: string;
      question: string;
      choices: string[] | null;
      correctAnswer: unknown;
      explanation?: string | null;
    }>;
  };
  onRetry: () => void;
  onReturnToConfig: () => void;
}

export function ExamResultView({
  result,
  onRetry,
  onReturnToConfig,
}: ExamResultViewProps) {
  const scorePct = Math.round(result.score);
  const isPassing = scorePct >= 60;
  const questions = result.questions || [];

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-8">
      {/* Top Banner Result Card */}
      <div className="glass-panel rounded-2xl border border-white/10 p-8 text-center space-y-6 shadow-2xl">
        <div
          className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto text-white shadow-xl ${
            isPassing ? "bg-emerald-600 shadow-emerald-900/30" : "bg-amber-600 shadow-amber-900/30"
          }`}
        >
          <TrophyIcon className="w-10 h-10" />
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            {isPassing ? "آزمون با موفقیت گذرانده شد!" : "آزمون به پایان رسید"}
          </h2>
          <p className="text-sm text-slate-300 mt-2">
            شما به <span className="font-bold text-white font-mono">{result.correct}</span> سوال از مجموع{" "}
            <span className="font-bold text-white font-mono">{result.total}</span> سوال پاسخ صحیح دادید.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-8 py-3 rounded-2xl bg-white/5 border border-white/10 shadow-inner">
          <span className="text-4xl font-black text-teal-400 font-mono" dir="ltr">
            {scorePct}%
          </span>
        </div>

        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            type="button"
            onClick={onRetry}
            className="px-5 py-3 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold border border-white/10 flex items-center gap-2 transition-all active:scale-95"
          >
            <RefreshIcon className="w-4 h-4" />
            <span>شرکت مجدد در آزمون</span>
          </button>
          <button
            type="button"
            onClick={onReturnToConfig}
            className="px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95"
          >
            بازگشت به تنظیمات آزمون
          </button>
        </div>
      </div>

      {/* Question-by-Question Review */}
      {questions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-white border-b border-white/10 pb-3">
            مرور سوالات، پاسخ‌ها و توضیحات تشریحی
          </h3>
          {questions.map((q, idx) => {
            const userAns = result.answers?.[q.id];
            const isCorrect =
              JSON.stringify(userAns) === JSON.stringify(q.correctAnswer) ||
              String(userAns) === String(q.correctAnswer);

            return (
              <div
                key={q.id}
                className="glass-panel rounded-2xl border border-white/10 p-6 space-y-4 shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-teal-400 font-mono">
                    سوال {idx + 1}
                  </span>
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full ${
                      isCorrect
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-red-500/20 text-red-300 border border-red-500/40"
                    }`}
                  >
                    {isCorrect ? "پاسخ صحیح" : "پاسخ نادرست"}
                  </span>
                </div>

                <p className="text-sm font-bold text-white leading-relaxed">
                  {q.question}
                </p>

                {q.choices && (
                  <div className="space-y-2 pt-1">
                    {q.choices.map((choice, cIdx) => {
                      const isUserChoice = String(userAns) === String(choice);
                      const isCorrectChoice = String(q.correctAnswer) === String(choice);

                      let style = "border-white/10 bg-white/5 text-slate-400";
                      if (isCorrectChoice) {
                        style = "border-emerald-500 bg-emerald-500/20 text-emerald-200 font-bold";
                      } else if (isUserChoice && !isCorrect) {
                        style = "border-red-500 bg-red-500/20 text-red-200 font-bold";
                      }

                      return (
                        <div
                          key={cIdx}
                          className={`p-3.5 rounded-xl text-xs border flex items-center justify-between ${style}`}
                        >
                          <div>
                            <span className="font-mono font-bold ml-2">{cIdx + 1}.</span>
                            {choice}
                          </div>
                          {isCorrectChoice && (
                            <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded">
                              پاسخ درست
                            </span>
                          )}
                          {isUserChoice && !isCorrectChoice && (
                            <span className="text-[10px] bg-red-600 text-white font-bold px-2 py-0.5 rounded">
                              پاسخ شما
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.explanation && (
                  <div className="p-4 bg-amber-950/30 rounded-xl border border-amber-500/30 text-xs space-y-1">
                    <p className="font-bold text-amber-300 flex items-center gap-1.5">
                      <span>توضیح پاسخ:</span>
                    </p>
                    <p className="text-slate-300 leading-relaxed">{q.explanation}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
