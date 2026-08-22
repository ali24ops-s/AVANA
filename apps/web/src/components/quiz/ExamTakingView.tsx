import { useState, useEffect, useMemo } from "react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import { useStudySessionTracker } from "../../hooks/useStudySessionTracker.js";

export interface ExamTakingViewProps {
  organizationId: string;
  attemptId: string;
  questions: Array<{
    id: string;
    quizId?: string;
    question: string;
    choices: string[] | null;
    topic?: string | null;
    difficulty?: string | null;
    questionType?: string;
    explanation?: string | null;
  }>;
  initialAnswers?: Record<string, unknown>;
  startedAt?: string;
  topicName?: string;
  onExit: () => void;
  onSubmitSuccess: (result: any) => void;
}

export function ExamTakingView({
  organizationId,
  attemptId,
  questions,
  initialAnswers,
  startedAt,
  topicName,
  onExit,
  onSubmitSuccess,
}: ExamTakingViewProps) {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const studyApi = createStudyApi(apiClient);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers || {});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Track active educational study time for exam taking
  useStudySessionTracker({
    activityType: "exam",
    enabled: questions.length > 0 && !isSubmitting,
  });

  // Modals state
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [showAiMentor, setShowAiMentor] = useState<boolean>(false);

  // Timer state (elapsed seconds calculated from backend startedAt timestamp)
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    if (!startedAt) return 0;
    const startTime = new Date(startedAt).getTime();
    if (isNaN(startTime)) return 0;
    return Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  });

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => {
      const startTime = new Date(startedAt).getTime();
      if (!isNaN(startTime)) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  // Sync initialAnswers if updated from backend on load
  useEffect(() => {
    if (initialAnswers && Object.keys(initialAnswers).length > 0) {
      setAnswers((prev) => ({ ...initialAnswers, ...prev }));
    }
  }, [initialAnswers]);

  if (!questions || questions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center" dir="rtl">
        <div className="bg-[#0f1722] border border-[#1e293b] rounded-2xl p-8 shadow-2xl">
          <span className="material-symbols-outlined text-amber-400 text-5xl mb-4">warning</span>
          <h3 className="text-xl font-bold text-white mb-2">هیچ سوالی برای این آزمون یافت نشد</h3>
          <p className="text-slate-400 text-sm mb-6">لطفاً سرفصل‌های دیگری را برای آزمون انتخاب فرمایید.</p>
          <button
            type="button"
            onClick={onExit}
            className="px-6 py-2.5 bg-primary-container hover:bg-opacity-90 text-white rounded-xl font-title-md text-sm transition-all"
          >
            بازگشت به تنظیمات آزمون
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const selectedAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;

  const answeredCount = useMemo(() => {
    return Object.keys(answers).filter(
      (key) => answers[key] !== null && answers[key] !== undefined && answers[key] !== "",
    ).length;
  }, [answers]);

  const unansweredCount = totalQuestions - answeredCount;
  const progressPercent = Math.round(((currentIndex + 1) / totalQuestions) * 100);

  // Format timer MM:SS
  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSelectChoice = async (choice: string) => {
    if (isSubmitting) return;

    // Optimistic UI update
    const updatedAnswers = { ...answers, [currentQuestion.id]: choice };
    setAnswers(updatedAnswers);

    // Save answer to backend asynchronously
    try {
      await studyApi.saveExamAnswers(organizationId, attemptId, {
        answers: [{ questionId: currentQuestion.id, answer: choice }],
      });
    } catch (err: any) {
      console.error("Failed to persist answer to backend:", err);
    }
  };

  const handleFinalSubmit = async () => {
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const formattedAnswers = questions.map((q) => ({
        questionId: q.id,
        answer: answers[q.id] ?? null,
      }));

      const res = await studyApi.submitExamAttempt(organizationId, attemptId, {
        answers: formattedAnswers,
      });

      setShowConfirmModal(false);
      onSubmitSuccess(res);
    } catch (err: any) {
      setErrorMsg(err?.message || "خطا در ثبت نتیجه آزمون. لطفاً دوباره تلاش کنید.");
      setIsSubmitting(false);
    }
  };

  const displayTopic =
    topicName || currentQuestion.topic || "فارماکولوژی قلب و عروق";

  return (
    <div className="bg-[#0b1219] text-gray-200 font-body-md min-h-screen flex flex-col antialiased selection:bg-primary-container selection:text-white" dir="rtl">
      {/* TopAppBar */}
      <header className="bg-[#0f1722] text-primary-fixed-dim font-headline-lg-mobile md:font-headline-lg docked full-width top-0 sticky border-b border-[#1e293b] shadow-sm flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop py-4 z-50">
        <div className="flex items-center gap-4">
          <span className="font-headline-lg text-primary-fixed-dim font-bold tracking-tight">AVANA</span>
          <div className="h-6 w-px bg-[#1e293b] mx-2 hidden md:block" />
          <div className="hidden md:flex items-center gap-2 text-[#94a3b8] font-body-md text-sm">
            <span className="material-symbols-outlined text-[18px]">menu_book</span>
            <span>{displayTopic}</span>
          </div>
        </div>

        {/* Progress Center Bar */}
        <div className="flex flex-1 justify-center max-w-md mx-8 hidden md:flex items-center gap-4">
          <span className="text-sm font-label-sm text-[#94a3b8] whitespace-nowrap">
            سوال {currentIndex + 1} از {totalQuestions}
          </span>
          <div className="w-full bg-[#1e293b] rounded-full h-2">
            <div
              className="bg-gradient-to-r from-[#4ade80] to-primary-container h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#1e293b] px-3 py-1.5 rounded-lg text-primary-fixed-dim font-label-sm">
            <span className="material-symbols-outlined text-[18px]">timer</span>
            <span className="font-mono text-[14px] mt-0.5" dir="ltr">
              {formatTimer(elapsedSeconds)}
            </span>
          </div>

          <button
            type="button"
            onClick={onExit}
            title="خروج از آزمون"
            className="hidden md:flex text-[#94a3b8] hover:text-white transition-colors p-2 rounded-full hover:bg-surface-container-highest"
          >
            <span className="material-symbols-outlined">help_outline</span>
          </button>

          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            className="bg-primary-container text-white px-4 py-2 rounded-lg font-title-md text-sm hover:bg-opacity-90 transition-colors hidden sm:block shadow-[0_4px_15px_rgba(15,118,110,0.3)]"
          >
            پایان آزمون
          </button>
        </div>
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="bg-[#0f1722] text-primary-fixed-dim font-title-md text-title-md docked right-0 h-full w-72 hidden md:flex flex-col border-l border-[#1e293b] z-40 fixed top-[72px] right-0 bottom-0 overflow-y-auto">
          <div className="p-6 flex flex-col gap-6 h-full">
            <div>
              <h3 className="text-white font-title-md text-lg mb-4">نقشه آزمون</h3>
              <div className="grid grid-cols-5 gap-2" dir="ltr">
                {questions.map((q, idx) => {
                  const isCurrent = idx === currentIndex;
                  const isAns = answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== "";

                  if (isCurrent) {
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setCurrentIndex(idx)}
                        className="w-10 h-10 rounded-lg bg-primary-container text-white flex items-center justify-center font-mono text-sm shadow-[0_0_15px_rgba(15,118,110,0.5)] ring-2 ring-primary-fixed-dim relative"
                      >
                        {idx + 1}
                        {isAns && (
                          <div className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-[#4ade80] rounded-full" />
                        )}
                      </button>
                    );
                  }

                  if (isAns) {
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setCurrentIndex(idx)}
                        className="w-10 h-10 rounded-lg bg-[#1e293b] border border-[#334155] text-[#94a3b8] flex items-center justify-center font-mono text-sm hover:bg-[#334155] transition-colors relative"
                      >
                        {idx + 1}
                        <div className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-[#4ade80] rounded-full" />
                      </button>
                    );
                  }

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className="w-10 h-10 rounded-lg bg-[#0b1219] border border-[#1e293b] text-[#64748b] flex items-center justify-center font-mono text-sm hover:border-[#334155] transition-colors"
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto border-t border-[#1e293b] pt-6 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-[#94a3b8]">
                <div className="w-3 h-3 bg-[#4ade80] rounded-full" />
                <span>پاسخ داده شده ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#94a3b8]">
                <div className="w-3 h-3 bg-[#0b1219] border border-[#334155] rounded-full" />
                <span>پاسخ داده نشده ({unansweredCount})</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#94a3b8]">
                <div className="w-3 h-3 bg-primary-container rounded-full ring-2 ring-primary-fixed-dim" />
                <span>سوال فعلی</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 md:mr-72 p-4 md:p-8 flex flex-col items-center justify-start min-h-[calc(100vh-72px)] overflow-y-auto">
          <div className="w-full max-w-4xl max-w-[1280px] mx-auto mt-4 md:mt-8 flex flex-col gap-6 relative">
            {/* Ambient Glow Background */}
            <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary-container rounded-full mix-blend-screen filter blur-[128px] opacity-10 pointer-events-none" />

            {errorMsg && (
              <div className="bg-red-900/30 border border-red-500/50 rounded-2xl p-4 text-red-200 text-sm flex items-center justify-between">
                <span>{errorMsg}</span>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="text-xs bg-red-800/50 px-3 py-1 rounded-lg text-red-100 hover:bg-red-800"
                >
                  متوجه شدم
                </button>
              </div>
            )}

            {/* Question Card */}
            <div className="bg-[#0f1722] border border-[#1e293b] rounded-2xl p-6 md:p-10 shadow-[0_12px_32px_rgba(15,118,110,0.03)] relative overflow-hidden">
              <div className="flex items-center gap-3 mb-6">
                <span className="bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/20 px-3 py-1 rounded-full text-xs font-label-sm tracking-wider">
                  {currentQuestion.topic || displayTopic}
                </span>
              </div>
              <h1 className="font-headline-lg-mobile md:font-headline-lg text-white leading-relaxed mb-4 text-2xl md:text-3xl">
                {currentQuestion.question}
              </h1>
            </div>

            {/* Options Grid */}
            {currentQuestion.choices && currentQuestion.choices.length > 0 && (
              <div className="grid grid-cols-1 gap-4 w-full">
                {currentQuestion.choices.map((choice, idx) => {
                  const isSelected = selectedAnswer === choice;
                  const optionLetter = String.fromCharCode(65 + idx); // A, B, C, D...

                  return (
                    <label
                      key={idx}
                      onClick={() => handleSelectChoice(choice)}
                      className={`option-card ${
                        isSelected
                          ? "active bg-[#0f1722] border-[#0f766e] bg-[rgba(15,118,110,0.1)] shadow-[0_0_20px_rgba(15,118,110,0.05)]"
                          : "bg-[#0f1722] border border-[#1e293b]"
                      } rounded-xl p-5 cursor-pointer transition-all duration-200 flex items-start gap-4 group relative overflow-hidden`}
                    >
                      <div
                        className={`flex items-center justify-center w-8 h-8 rounded-full border-2 font-mono mt-0.5 shrink-0 transition-colors ${
                          isSelected
                            ? "bg-primary-container border-primary-container text-white"
                            : "border-[#334155] text-[#94a3b8] group-hover:border-primary-container group-hover:text-primary-fixed-dim"
                        }`}
                      >
                        {optionLetter}
                      </div>
                      <div
                        className={`flex-1 ${
                          isSelected ? "text-white" : "text-gray-300"
                        } font-body-lg pt-1`}
                      >
                        {choice}
                      </div>
                      <input
                        type="radio"
                        name={`question_${currentQuestion.id}`}
                        checked={isSelected}
                        onChange={() => {}}
                        className="hidden"
                      />
                    </label>
                  );
                })}
              </div>
            )}

            {/* Footer Actions */}
            <div className="mt-8 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-[#1e293b] pt-8 pb-12">
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0 || isSubmitting}
                className="w-full sm:w-auto px-6 py-3 rounded-xl border border-[#334155] text-[#94a3b8] font-title-md hover:bg-[#1e293b] hover:text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
              >
                <span className="material-symbols-outlined text-[20px]" dir="ltr">
                  arrow_forward
                </span>
                سوال قبلی
              </button>

              <button
                type="button"
                onClick={() => setShowAiMentor(true)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl border border-[#8B5CF6] text-[#8B5CF6] font-title-md bg-[#8B5CF6]/5 hover:bg-[#8B5CF6]/10 transition-colors flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(139,92,246,0.08)] order-first sm:order-none"
              >
                <span className="material-symbols-outlined text-[20px]">smart_toy</span>
                راهنمایی از منتور هوشمند
              </button>

              {isLastQuestion ? (
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-8 py-3 rounded-xl bg-primary-container text-white font-title-md hover:bg-opacity-90 transition-colors flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(15,118,110,0.2)] disabled:opacity-50"
                >
                  ثبت و پایان آزمون
                  <span className="material-symbols-outlined text-[20px]" dir="ltr">
                    check
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-8 py-3 rounded-xl bg-primary-container text-white font-title-md hover:bg-opacity-90 transition-colors flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(15,118,110,0.2)]"
                >
                  سوال بعدی
                  <span className="material-symbols-outlined text-[20px]" dir="ltr">
                    arrow_back
                  </span>
                </button>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Completion Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" id="completion-modal">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-[#0b1219]/80 backdrop-blur-sm"
            onClick={() => !isSubmitting && setShowConfirmModal(false)}
          />
          {/* Modal Card */}
          <div className="relative bg-[#0f1722] border border-[#1e293b] rounded-2xl p-8 max-w-md w-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col items-center text-center z-10">
            <div className="w-16 h-16 bg-primary-container/20 rounded-full flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-primary-fixed-dim text-4xl">task_alt</span>
            </div>
            <h2 className="text-white font-headline-lg-mobile md:font-headline-lg mb-2">پایان آزمون</h2>
            <p className="text-[#94a3b8] font-body-md mb-8">
              شما به <span className="text-white font-bold">{answeredCount}</span> سوال از{" "}
              <span className="text-white font-bold">{totalQuestions}</span> سوال پاسخ داده‌اید. آیا از ثبت نهایی اطمینان دارید؟
            </p>
            <div className="flex flex-col w-full gap-3">
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl bg-primary-container text-white font-title-md hover:bg-opacity-90 transition-all shadow-[0_4px_20px_rgba(15,118,110,0.2)] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span>در حال ثبت...</span>
                ) : (
                  <span>ثبت و مشاهده نتایج</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl border border-[#334155] text-[#94a3b8] font-title-md hover:bg-[#1e293b] hover:text-white transition-all disabled:opacity-50"
              >
                بازگشت به آزمون
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Mentor Smart Hint Overlay */}
      {showAiMentor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8 bg-[#0b1219]/80 backdrop-blur-sm" id="ai-mentor-overlay">
          <div className="glass-panel max-w-2xl w-full rounded-2xl overflow-hidden shadow-2xl border border-primary-container/30 flex flex-col bg-[#0f1722]">
            {/* Header */}
            <div className="bg-primary-container/20 p-6 flex items-center gap-4 border-b border-primary-container/30">
              <div className="w-10 h-10 rounded-xl bg-primary-container/30 border border-primary-fixed-dim/40 flex items-center justify-center text-primary-fixed-dim shrink-0 font-bold text-base">
                AV
              </div>
              <div>
                <h2 className="text-white font-headline-lg-mobile md:font-headline-lg text-xl">تحلیل هوشمند آوانا</h2>
                <p className="text-primary-fixed-dim text-sm font-label-sm">
                  راهنمای آموزشی سوال {currentIndex + 1}
                </p>
              </div>
              <button
                type="button"
                className="mr-auto text-[#94a3b8] hover:text-white transition-colors p-1"
                onClick={() => setShowAiMentor(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {/* Content */}
            <div className="p-6 md:p-8 overflow-y-auto max-h-[70vh] flex flex-col gap-6">
              <div className="flex flex-col gap-4">
                <h3 className="text-primary-fixed-dim font-title-md flex items-center gap-2">
                  <span className="material-symbols-outlined">lightbulb</span>
                  راهنمای مفهومی سوال:
                </h3>
                <p className="text-gray-300 leading-relaxed font-body-lg">
                  {currentQuestion.explanation ||
                    `این سوال مربوط به مبحث ${currentQuestion.topic || displayTopic} است. برای پاسخ صحیح به مکانیسم عمل، طبقه‌بندی داروها و تداخلات اثر دقت فرمایید.`}
                </p>
              </div>
              <div className="bg-[#1e293b]/50 p-4 rounded-xl border border-[#334155]">
                <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">info</span>
                  نکته کلیدی:
                </h4>
                <p className="text-sm text-[#94a3b8]">
                  همواره در تست‌های تخصص فارماکولوژی و پزشکی، تفاوت‌های مکانیسمی داروهای هم‌خانواده مهم‌ترین هدف طراحان سوال است.
                </p>
              </div>
              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  className="bg-primary-container text-white px-6 py-2 rounded-lg font-title-md hover:bg-opacity-90 transition-colors"
                  onClick={() => setShowAiMentor(false)}
                >
                  متوجه شدم
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
