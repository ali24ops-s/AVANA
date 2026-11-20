import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Plus, Search, Trash2, HelpCircle } from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import {
  createStudioApi,
  type MarketingQuestionBankItem,
} from "../../lib/api/studio-api.js";
import {
  LoadingState,
  Button,
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
} from "../../components/ui/index.js";

export function StudioQuestionBankPage() {
  const [items, setItems] = useState<MarketingQuestionBankItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [newQuestion, setNewQuestion] = useState("");
  const [newChoices, setNewChoices] = useState([
    { id: "1", text: "" },
    { id: "2", text: "" },
    { id: "3", text: "" },
    { id: "4", text: "" },
  ]);
  const [newCorrectId, setNewCorrectId] = useState("1");
  const [newExplanation, setNewExplanation] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [newDifficulty, setNewDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  const studioApi = useMemo(() => {
    const client = createApiClient({ baseUrl: getApiBaseUrl() });
    return createStudioApi(client);
  }, []);

  const loadBank = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await studioApi.listQuestionBank({
        search: search.trim() || undefined,
        difficulty: difficultyFilter || undefined,
      });
      setItems(res.questions || []);
    } catch (err) {
      console.error("Failed to load question bank", err);
    } finally {
      setIsLoading(false);
    }
  }, [search, difficultyFilter, studioApi]);

  useEffect(() => {
    loadBank();
  }, [loadBank]);

  const handleDelete = async (id: string) => {
    if (!confirm("آیا از حذف این سؤال از بانک اطمینان دارید؟")) return;
    try {
      await studioApi.deleteQuestionBankItem(id);
      await loadBank();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در حذف سؤال");
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validChoices = newChoices.filter((c) => c.text.trim() !== "");
    if (validChoices.length < 2) {
      alert("حداقل دو گزینه برای سؤال الزامی است.");
      return;
    }
    try {
      setIsCreating(true);
      await studioApi.createQuestionBankItem({
        sourceType: "manual",
        question: newQuestion.trim(),
        choices: validChoices,
        correctAnswer: { choiceId: newCorrectId },
        explanation: newExplanation.trim() || null,
        difficulty: newDifficulty,
        topic: newTopic.trim() || null,
        questionType: "multiple_choice",
        tags: [],
      });
      setIsCreateModalOpen(false);
      setNewQuestion("");
      setNewExplanation("");
      setNewTopic("");
      setNewChoices([
        { id: "1", text: "" },
        { id: "2", text: "" },
        { id: "3", text: "" },
        { id: "4", text: "" },
      ]);
      await loadBank();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در افزودن سؤال");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">
            بانک سؤالات استودیو
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            مخزن سؤالات قابل استفاده مجدد برای کمپین‌ها و آزمون‌های بازاریابی
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          افزودن سؤال به بانک
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="relative w-64 sm:w-72">
            <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="جستجو در متن سؤال یا موضوع..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs sm:text-sm pr-9 pl-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
            />
          </div>
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="text-xs sm:text-sm px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
          >
            <option value="">همه سطوح دشواری</option>
            <option value="easy">آسان</option>
            <option value="medium">متوسط</option>
            <option value="hard">دشوار</option>
          </select>
        </div>
        <span className="text-xs text-[var(--color-text-muted)] font-medium">
          {items.length} سؤال در دسترس
        </span>
      </div>

      {/* Questions Grid */}
      {isLoading ? (
        <div className="py-16 flex justify-center">
          <LoadingState message="در حال دریافت سؤالات بانک..." />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-2xl">
          <HelpCircle className="w-10 h-10 text-[var(--color-text-muted)] mx-auto mb-3 opacity-50" />
          <p className="text-sm text-[var(--color-text-muted)]">
            هنوز سؤالی در بانک ثبت نشده است.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-[var(--color-surface)] p-5 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-3 flex flex-col justify-between hover:border-[var(--color-primary-default)]/30 transition-all"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    {item.topic && (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-[8px] bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)] font-medium">
                        {item.topic}
                      </span>
                    )}
                    <span className="text-[11px] px-2.5 py-0.5 rounded-[8px] bg-[var(--color-secondary-light)] text-[var(--color-secondary-dark)] border border-[var(--color-secondary)]/40 font-medium">
                      سطح: {item.difficulty === "easy" ? "آسان" : item.difficulty === "hard" ? "دشوار" : "متوسط"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 text-[var(--color-text-muted)] hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    title="حذف سؤال از بانک"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <p className="font-medium text-sm text-[var(--color-text)] leading-relaxed">
                  {item.question}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 text-xs">
                  {item.choices.map((c) => {
                    const correctId =
                      typeof item.correctAnswer === "object" && item.correctAnswer !== null && "choiceId" in item.correctAnswer
                        ? item.correctAnswer.choiceId
                        : String(item.correctAnswer);
                    const isCorrect = c.id === correctId;
                    return (
                      <div
                        key={c.id}
                        className={`p-2 rounded-[8px] border text-[11px] flex items-center justify-between ${
                          isCorrect
                            ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-medium"
                            : "bg-[var(--color-background)] border-[var(--color-border)] text-[var(--color-text-muted)]"
                        }`}
                      >
                        <span>{c.text}</span>
                        {isCorrect && (
                          <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold">
                            صحیح
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {item.explanation && (
                <div className="text-[11px] text-[var(--color-text-muted)] bg-[var(--color-background)] p-3 rounded-[10px] border border-[var(--color-border)] mt-3">
                  <span className="font-semibold text-[var(--color-text)]">توضیح: </span>
                  {item.explanation}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        isCompound={true}
        maxWidth="lg"
      >
        <DialogHeader onClose={() => setIsCreateModalOpen(false)}>
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-[10px] bg-[var(--color-secondary-light)] text-[var(--color-primary-default)]">
              <Plus className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-base text-[var(--color-text)]">
                افزودن سؤال به بانک
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                سؤال چهارگزینه‌ای جدید را برای استفاده مجدد در آزمون‌ها ثبت کنید.
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogContent className="p-6">
          <form id="create-bank-question-form" onSubmit={handleCreateSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                متن سؤال *
              </label>
              <textarea
                rows={2}
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="متن سؤال چهارگزینه‌ای..."
                className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] resize-none"
                required
              />
            </div>

            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-[var(--color-text)]">
                گزینه‌ها و انتخاب گزینه صحیح *
              </label>
              {newChoices.map((c, idx) => (
                <div key={c.id} className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="bankCorrect"
                    checked={newCorrectId === c.id}
                    onChange={() => setNewCorrectId(c.id)}
                    className="text-[var(--color-primary-default)] focus:ring-[var(--color-primary-default)] shrink-0 h-4 w-4"
                  />
                  <input
                    type="text"
                    placeholder={`گزینه ${idx + 1}`}
                    value={c.text}
                    onChange={(e) => {
                      const updated = [...newChoices];
                      updated[idx].text = e.target.value;
                      setNewChoices(updated);
                    }}
                    className="flex-1 text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                    required={idx < 2}
                  />
                </div>
              ))}
              <p className="text-[11px] text-[var(--color-text-muted)]">
                با کلیک بر روی دکمه رادیویی کنار هر گزینه، آن را به عنوان پاسخ صحیح تعیین کنید.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  سطح دشواری
                </label>
                <select
                  value={newDifficulty}
                  onChange={(e) => setNewDifficulty(e.target.value as "easy" | "medium" | "hard")}
                  className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                >
                  <option value="easy">آسان</option>
                  <option value="medium">متوسط</option>
                  <option value="hard">دشوار</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  موضوع یا سرفصل
                </label>
                <input
                  type="text"
                  placeholder="مثلاً: بتابلاکرها"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                تشریح علمی پاسخ (اختیاری)
              </label>
              <textarea
                rows={2}
                value={newExplanation}
                onChange={(e) => setNewExplanation(e.target.value)}
                placeholder="توضیح کوتاه درباره دلیل درستی گزینه..."
                className="w-full text-xs px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] resize-none"
              />
            </div>
          </form>
        </DialogContent>

        <DialogFooter className="flex items-center justify-end gap-2.5">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setIsCreateModalOpen(false)}
          >
            انصراف
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            form="create-bank-question-form"
            disabled={isCreating}
            isLoading={isCreating}
          >
            {isCreating ? "در حال ذخیره..." : "ذخیره در بانک سؤالات"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
