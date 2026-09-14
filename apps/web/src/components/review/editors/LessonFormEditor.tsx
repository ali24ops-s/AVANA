import { useState } from "react";
import { Plus, Trash2, BookOpen, Layers } from "lucide-react";
import { Input, Textarea } from "@avana/ui";
import { toPersianDigits } from "@avana/domain";

export interface LessonSessionData {
  sessionIndex: number;
  title: string;
  contentMarkdown: string;
  blueprintTopic?: string;
}

export interface LessonFormEditorData {
  title: string;
  contentMarkdown: string;
  sessions?: LessonSessionData[];
}

export interface LessonFormEditorProps {
  data: LessonFormEditorData;
  onChange: (updated: LessonFormEditorData) => void;
  errors?: Record<string, string>;
}

export function LessonFormEditor({
  data,
  onChange,
  errors,
}: LessonFormEditorProps) {
  const hasSessions = Array.isArray(data.sessions) && data.sessions.length > 0;
  const [activeSessionIndex, setActiveSessionIndex] = useState(0);

  const handleTitleChange = (newTitle: string) => {
    onChange({
      ...data,
      title: newTitle,
    });
  };

  const handleSingleContentChange = (newContent: string) => {
    onChange({
      ...data,
      contentMarkdown: newContent,
    });
  };

  const handleSessionTitleChange = (index: number, newTitle: string) => {
    if (!data.sessions) return;
    const updatedSessions = [...data.sessions];
    updatedSessions[index] = {
      ...updatedSessions[index],
      title: newTitle,
    };
    onChange({
      ...data,
      sessions: updatedSessions,
    });
  };

  const handleSessionContentChange = (index: number, newContent: string) => {
    if (!data.sessions) return;
    const updatedSessions = [...data.sessions];
    updatedSessions[index] = {
      ...updatedSessions[index],
      contentMarkdown: newContent,
    };
    onChange({
      ...data,
      sessions: updatedSessions,
    });
  };

  const handleAddSession = () => {
    const currentSessions = data.sessions || [];
    const newIdx = currentSessions.length;
    const newSession: LessonSessionData = {
      sessionIndex: newIdx,
      title: `جلسه ${toPersianDigits(newIdx + 1)}`,
      contentMarkdown: "",
    };
    const updatedSessions = [...currentSessions, newSession];
    onChange({
      ...data,
      sessions: updatedSessions,
    });
    setActiveSessionIndex(newIdx);
  };

  const handleDeleteSession = (indexToDelete: number) => {
    if (!data.sessions || data.sessions.length <= 1) return;
    const updatedSessions = data.sessions
      .filter((_, idx) => idx !== indexToDelete)
      .map((s, idx) => ({ ...s, sessionIndex: idx }));

    onChange({
      ...data,
      sessions: updatedSessions,
    });
    if (activeSessionIndex >= updatedSessions.length) {
      setActiveSessionIndex(Math.max(0, updatedSessions.length - 1));
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Lesson Title */}
      <div className="space-y-1">
        <label
          htmlFor="lesson-title-input"
          className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5"
        >
          <BookOpen className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
          <span>عنوان درسنامه</span>
          <span className="text-rose-500 text-xs">*</span>
        </label>
        <Input
          id="lesson-title-input"
          value={data.title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="عنوان کلی درسنامه را وارد نمایید..."
          error={errors?.title}
          className="text-sm font-bold"
        />
      </div>

      {/* Multi-Session Editor */}
      {hasSessions && data.sessions ? (
        <div className="space-y-4 pt-2 border-t border-[var(--color-border)]">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--color-primary-default)]" />
              <span className="text-xs font-bold text-[var(--color-text)]">
                جلسات درسنامه ({toPersianDigits(data.sessions.length)} جلسه)
              </span>
            </div>
            <button
              type="button"
              onClick={handleAddSession}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[var(--color-primary-default)]/10 hover:bg-[var(--color-primary-default)]/20 text-[var(--color-primary-default)] rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>افزودن جلسه جدید</span>
            </button>
          </div>

          {/* Session Tab Navigation */}
          <div className="flex flex-wrap gap-2 pb-1 overflow-x-auto">
            {data.sessions.map((session, idx) => {
              const isActive = activeSessionIndex === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveSessionIndex(idx)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? "bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] shadow-xs"
                      : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]"
                  }`}
                >
                  <span>{session.title || `جلسه ${toPersianDigits(idx + 1)}`}</span>
                </button>
              );
            })}
          </div>

          {/* Active Session Content */}
          {data.sessions[activeSessionIndex] && (
            <div className="p-4 bg-[var(--color-surface-warm)]/50 rounded-2xl border border-[var(--color-border)] space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-[var(--color-text)] block mb-1">
                    عنوان جلسه {toPersianDigits(activeSessionIndex + 1)}
                  </label>
                  <Input
                    value={data.sessions[activeSessionIndex].title}
                    onChange={(e) =>
                      handleSessionTitleChange(activeSessionIndex, e.target.value)
                    }
                    placeholder="عنوان این جلسه..."
                    error={errors?.[`session_${activeSessionIndex}_title`]}
                    className="text-xs font-bold"
                  />
                </div>
                {data.sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteSession(activeSessionIndex)}
                    title="حذف این جلسه"
                    className="mt-5 p-2 rounded-xl text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--color-text)] block">
                  متن آموزشی جلسه (فرمت Markdown)
                  <span className="text-rose-500 text-xs ms-1">*</span>
                </label>
                <Textarea
                  value={data.sessions[activeSessionIndex].contentMarkdown}
                  onChange={(e) =>
                    handleSessionContentChange(activeSessionIndex, e.target.value)
                  }
                  rows={12}
                  dir="auto"
                  placeholder="محتوای متنی جلسه را در این بخش بنویسید..."
                  error={errors?.[`session_${activeSessionIndex}_content`]}
                  className="font-mono text-xs leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Single Session Editor */
        <div className="space-y-1.5 pt-2 border-t border-[var(--color-border)]">
          <label className="text-xs font-bold text-[var(--color-text)] flex items-center justify-between">
            <span>متن درسنامه (فرمت Markdown)</span>
            <span className="text-[10px] text-[var(--color-text-muted)] font-normal">
              پشتیبانی از تیترها، لیست‌ها و جداول Markdown
            </span>
          </label>
          <Textarea
            value={data.contentMarkdown}
            onChange={(e) => handleSingleContentChange(e.target.value)}
            rows={14}
            dir="auto"
            placeholder="محتوای کامل درسنامه را در قالب Markdown در اینجا وارد کنید..."
            error={errors?.contentMarkdown}
            className="font-mono text-xs leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}
