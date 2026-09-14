import { Plus, Trash2, CreditCard, Sparkles } from "lucide-react";
import { Textarea } from "@avana/ui";
import { toPersianDigits } from "@avana/domain";

export interface FlashcardItemData {
  id?: string;
  question: string; // Front
  answer: string;   // Back
  explanation?: string;
  cardType?: string;
  difficulty?: "easy" | "medium" | "hard";
}

export interface FlashcardFormEditorProps {
  cards: FlashcardItemData[];
  onChange: (updatedCards: FlashcardItemData[]) => void;
  errors?: Record<string, string>;
}

export function FlashcardFormEditor({
  cards,
  onChange,
  errors,
}: FlashcardFormEditorProps) {
  const handleCardChange = (
    index: number,
    field: keyof FlashcardItemData,
    value: string,
  ) => {
    const updated = [...cards];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    onChange(updated);
  };

  const handleAddCard = () => {
    const newCard: FlashcardItemData = {
      question: "",
      answer: "",
      explanation: "",
      difficulty: "medium",
      cardType: "definition",
    };
    onChange([...cards, newCard]);
  };

  const handleDeleteCard = (indexToDelete: number) => {
    if (cards.length <= 1) return;
    const updated = cards.filter((_, idx) => idx !== indexToDelete);
    onChange(updated);
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-[var(--color-primary-default)]" />
          <span className="text-xs font-bold text-[var(--color-text)]">
            لیست فلش‌کارت‌ها ({toPersianDigits(cards.length)} کارت)
          </span>
        </div>
        <button
          type="button"
          onClick={handleAddCard}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary-default)]/10 hover:bg-[var(--color-primary-default)]/20 text-[var(--color-primary-default)] rounded-xl text-xs font-bold transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>افزودن فلش‌کارت جدید</span>
        </button>
      </div>

      {/* Cards list */}
      <div className="space-y-4">
        {cards.map((card, idx) => (
          <div
            key={card.id || idx}
            className="p-4 bg-[var(--color-surface-warm)]/50 rounded-2xl border border-[var(--color-border)] space-y-3.5"
          >
            {/* Card header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--color-primary-default)] bg-[var(--color-primary-default)]/10 px-2.5 py-0.5 rounded-lg">
                  فلش‌کارت {toPersianDigits(idx + 1)}
                </span>
                <select
                  value={card.difficulty || "medium"}
                  onChange={(e) =>
                    handleCardChange(
                      idx,
                      "difficulty",
                      e.target.value as "easy" | "medium" | "hard",
                    )
                  }
                  className="text-[11px] font-semibold bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-default)]"
                  aria-label={`درجه سختی کارت ${idx + 1}`}
                >
                  <option value="easy">آسان</option>
                  <option value="medium">متوسط</option>
                  <option value="hard">سخت</option>
                </select>
              </div>

              {cards.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleDeleteCard(idx)}
                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-500/10 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  title="حذف این فلش‌کارت"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف کارت</span>
                </button>
              )}
            </div>

            {/* Front / Question */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--color-text)] flex items-center gap-1">
                <span>روی کارت / پرسش (Front)</span>
                <span className="text-rose-500 text-xs">*</span>
              </label>
              <Textarea
                value={card.question}
                onChange={(e) => handleCardChange(idx, "question", e.target.value)}
                rows={2}
                dir="auto"
                placeholder="سؤال، واژه یا مفهوم روی کارت را وارد کنید..."
                error={errors?.[`card_${idx}_question`]}
                className="text-xs font-medium leading-relaxed"
              />
            </div>

            {/* Back / Answer */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <span>پشت کارت / پاسخ (Back)</span>
                <span className="text-rose-500 text-xs">*</span>
              </label>
              <Textarea
                value={card.answer}
                onChange={(e) => handleCardChange(idx, "answer", e.target.value)}
                rows={2}
                dir="auto"
                placeholder="پاسخ مستقیم و کوتاه پشت کارت را وارد کنید..."
                error={errors?.[`card_${idx}_answer`]}
                className="text-xs font-medium leading-relaxed"
              />
            </div>

            {/* Explanation / Clinical Note */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[var(--color-text-muted)] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[var(--color-primary-default)]" />
                <span>نکته تکمیلی یا توضیح بالینی (اختیاری)</span>
              </label>
              <Textarea
                value={card.explanation || ""}
                onChange={(e) => handleCardChange(idx, "explanation", e.target.value)}
                rows={2}
                dir="auto"
                placeholder="توضیح تکمیلی جهت یادسپاری بهتر..."
                className="text-xs"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
