import { Plus, Trash2, HelpCircle, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { Input, Textarea } from "@avana/ui";
import { toPersianDigits } from "@avana/domain";

export interface ExamQuestionData {
  question: string;
  choices: string[];
  correctAnswer: string;
  explanation?: string;
  difficulty?: "easy" | "medium" | "hard";
  category?: string;
}

export interface ExamFormEditorData {
  title: string;
  questions: ExamQuestionData[];
}

export interface ExamFormEditorProps {
  data: ExamFormEditorData;
  onChange: (updated: ExamFormEditorData) => void;
  errors?: Record<string, string>;
}

export function ExamFormEditor({
  data,
  onChange,
  errors,
}: ExamFormEditorProps) {
  const handleTitleChange = (newTitle: string) => {
    onChange({
      ...data,
      title: newTitle,
    });
  };

  const handleQuestionChange = (
    qIndex: number,
    field: keyof ExamQuestionData,
    value: unknown,
  ) => {
    const updatedQuestions = [...data.questions];
    updatedQuestions[qIndex] = {
      ...updatedQuestions[qIndex],
      [field]: value,
    };
    onChange({
      ...data,
      questions: updatedQuestions,
    });
  };

  const handleChoiceTextChange = (
    qIndex: number,
    choiceIndex: number,
    newText: string,
  ) => {
    const updatedQuestions = [...data.questions];
    const currentQ = updatedQuestions[qIndex];
    const oldChoiceText = currentQ.choices[choiceIndex];
    const updatedChoices = [...currentQ.choices];
    updatedChoices[choiceIndex] = newText;

    // If the changed choice was the correctAnswer, keep it in sync with the new text
    let updatedCorrect = currentQ.correctAnswer;
    if (currentQ.correctAnswer === oldChoiceText) {
      updatedCorrect = newText;
    }

    updatedQuestions[qIndex] = {
      ...currentQ,
      choices: updatedChoices,
      correctAnswer: updatedCorrect,
    };
    onChange({
      ...data,
      questions: updatedQuestions,
    });
  };

  const handleSelectCorrectChoice = (qIndex: number, choiceText: string) => {
    const updatedQuestions = [...data.questions];
    updatedQuestions[qIndex] = {
      ...updatedQuestions[qIndex],
      correctAnswer: choiceText,
    };
    onChange({
      ...data,
      questions: updatedQuestions,
    });
  };

  const handleAddChoice = (qIndex: number) => {
    const updatedQuestions = [...data.questions];
    const currentQ = updatedQuestions[qIndex];
    if (currentQ.choices.length >= 6) return;
    const newChoiceNumber = currentQ.choices.length + 1;
    const updatedChoices = [
      ...currentQ.choices,
      `گزینه ${toPersianDigits(newChoiceNumber)}`,
    ];
    updatedQuestions[qIndex] = {
      ...currentQ,
      choices: updatedChoices,
    };
    onChange({
      ...data,
      questions: updatedQuestions,
    });
  };

  const handleDeleteChoice = (qIndex: number, choiceIndexToDelete: number) => {
    const updatedQuestions = [...data.questions];
    const currentQ = updatedQuestions[qIndex];
    if (currentQ.choices.length <= 2) return;

    const removedChoice = currentQ.choices[choiceIndexToDelete];
    const updatedChoices = currentQ.choices.filter(
      (_, idx) => idx !== choiceIndexToDelete,
    );

    let updatedCorrect = currentQ.correctAnswer;
    if (currentQ.correctAnswer === removedChoice) {
      updatedCorrect = updatedChoices[0] || "";
    }

    updatedQuestions[qIndex] = {
      ...currentQ,
      choices: updatedChoices,
      correctAnswer: updatedCorrect,
    };
    onChange({
      ...data,
      questions: updatedQuestions,
    });
  };

  const handleAddQuestion = () => {
    const newQuestionNumber = data.questions.length + 1;
    const defaultChoices = ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"];
    const newQuestion: ExamQuestionData = {
      question: `سؤال ${toPersianDigits(newQuestionNumber)}: `,
      choices: defaultChoices,
      correctAnswer: defaultChoices[0],
      explanation: "",
      difficulty: "medium",
    };
    onChange({
      ...data,
      questions: [...data.questions, newQuestion],
    });
  };

  const handleDeleteQuestion = (qIndexToDelete: number) => {
    if (data.questions.length <= 1) return;
    const updatedQuestions = data.questions.filter(
      (_, idx) => idx !== qIndexToDelete,
    );
    onChange({
      ...data,
      questions: updatedQuestions,
    });
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Quiz Title */}
      <div className="space-y-1">
        <label
          htmlFor="exam-title-input"
          className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5"
        >
          <HelpCircle className="w-4 h-4 text-[var(--color-primary-default)]" />
          <span>عنوان آزمون</span>
          <span className="text-rose-500 text-xs">*</span>
        </label>
        <Input
          id="exam-title-input"
          value={data.title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="عنوان آزمون ارزیابی..."
          error={errors?.title}
          className="text-sm font-bold"
        />
      </div>

      {/* Header bar */}
      <div className="flex items-center justify-between pt-2 pb-1 border-t border-[var(--color-border)]">
        <span className="text-xs font-bold text-[var(--color-text)]">
          سوالات آزمون ({toPersianDigits(data.questions.length)} سؤال)
        </span>
        <button
          type="button"
          onClick={handleAddQuestion}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary-default)]/10 hover:bg-[var(--color-primary-default)]/20 text-[var(--color-primary-default)] rounded-xl text-xs font-bold transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>افزودن سؤال جدید</span>
        </button>
      </div>

      {/* Questions list */}
      <div className="space-y-5">
        {data.questions.map((q, qIdx) => (
          <div
            key={qIdx}
            className="p-4.5 bg-[var(--color-surface-warm)]/50 rounded-2xl border border-[var(--color-border)] space-y-4"
          >
            {/* Question Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--color-primary-default)] bg-[var(--color-primary-default)]/10 px-2.5 py-0.5 rounded-lg">
                  سؤال {toPersianDigits(qIdx + 1)}
                </span>
                <select
                  value={q.difficulty || "medium"}
                  onChange={(e) =>
                    handleQuestionChange(
                      qIdx,
                      "difficulty",
                      e.target.value as "easy" | "medium" | "hard",
                    )
                  }
                  className="text-[11px] font-semibold bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-default)]"
                  aria-label={`درجه سختی سؤال ${qIdx + 1}`}
                >
                  <option value="easy">آسان</option>
                  <option value="medium">متوسط</option>
                  <option value="hard">سخت</option>
                </select>
              </div>

              {data.questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleDeleteQuestion(qIdx)}
                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-500/10 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  title="حذف این سؤال"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف سؤال</span>
                </button>
              )}
            </div>

            {/* Question Text */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--color-text)] flex items-center gap-1">
                <span>صورت سؤال</span>
                <span className="text-rose-500 text-xs">*</span>
              </label>
              <Textarea
                value={q.question}
                onChange={(e) => handleQuestionChange(qIdx, "question", e.target.value)}
                rows={2}
                dir="auto"
                placeholder="متن کامل صورت سؤال را بنویسید..."
                error={errors?.[`q_${qIdx}_question`]}
                className="text-xs font-bold leading-relaxed"
              />
            </div>

            {/* Choices list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[var(--color-text)] flex items-center gap-1">
                  <span>گزینه‌های پاسخ</span>
                  <span className="text-[11px] text-[var(--color-text-muted)] font-normal">
                    (پاسخ صحیح را با کلیک روی علامت کنار آن مشخص کنید)
                  </span>
                  <span className="text-rose-500 text-xs">*</span>
                </label>
                {q.choices.length < 6 && (
                  <button
                    type="button"
                    onClick={() => handleAddChoice(qIdx)}
                    className="text-[11px] font-bold text-[var(--color-primary-default)] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>افزودن گزینه</span>
                  </button>
                )}
              </div>

              {Boolean(errors?.[`q_${qIdx}_correct`]) && (
                <div className="text-xs text-rose-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors?.[`q_${qIdx}_correct`]}</span>
                </div>
              )}

              <div className="space-y-2">
                {q.choices.map((choice, cIdx) => {
                  const isCorrect = q.correctAnswer === choice;
                  return (
                    <div
                      key={cIdx}
                      className={`p-2 rounded-xl border flex items-center gap-2.5 transition-colors ${
                        isCorrect
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : "bg-[var(--color-surface)] border-[var(--color-border)]"
                      }`}
                    >
                      {/* Correct Answer Toggle Button */}
                      <button
                        type="button"
                        onClick={() => handleSelectCorrectChoice(qIdx, choice)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          isCorrect
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)]"
                        }`}
                        title={isCorrect ? "این گزینه پاسخ صحیح است" : "انتخاب به عنوان پاسخ صحیح"}
                      >
                        {isCorrect ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <Circle className="w-3.5 h-3.5" />
                        )}
                        <span>{isCorrect ? "پاسخ صحیح" : `${toPersianDigits(cIdx + 1)}`}</span>
                      </button>

                      {/* Choice Text Input */}
                      <input
                        type="text"
                        value={choice}
                        onChange={(e) =>
                          handleChoiceTextChange(qIdx, cIdx, e.target.value)
                        }
                        placeholder={`متن گزینه ${toPersianDigits(cIdx + 1)}...`}
                        className="flex-1 bg-transparent border-none text-xs font-medium text-[var(--color-text)] focus:outline-none px-2 py-1"
                      />

                      {/* Remove choice */}
                      {q.choices.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteChoice(qIdx, cIdx)}
                          className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="حذف این گزینه"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Explanation / Feedback */}
            <div className="space-y-1 pt-1 border-t border-[var(--color-border)]/60">
              <label className="text-[11px] font-medium text-[var(--color-text-muted)] block">
                توضیح تشریحی پاسخ و راهنما (اختیاری)
              </label>
              <Textarea
                value={q.explanation || ""}
                onChange={(e) =>
                  handleQuestionChange(qIdx, "explanation", e.target.value)
                }
                rows={2}
                dir="auto"
                placeholder="دلیل درستی پاسخ و نکات آموزشی جهت بازخورد به دانشجو..."
                className="text-xs"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
