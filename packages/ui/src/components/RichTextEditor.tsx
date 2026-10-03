import React, { useState, useRef, useCallback, useId } from "react";

export interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  rows?: number;
  minHeight?: number;
  maxLength?: number;
  showCharacterCount?: boolean;
  className?: string;
  containerClassName?: string;
  id?: string;
  renderPreview?: (content: string) => React.ReactNode;
}

interface HistoryState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  label,
  placeholder = "متن خود را اینجا بنویسید...",
  error,
  helperText,
  disabled = false,
  required = false,
  rows = 8,
  minHeight = 160,
  maxLength,
  showCharacterCount = false,
  className = "",
  containerClassName = "",
  id,
  renderPreview,
}) => {
  const generatedId = useId();
  const editorId = id || `rich-editor-${generatedId}`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const [savedSelection, setSavedSelection] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });

  const updateSelection = useCallback((e?: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const nativeTarget = (e?.nativeEvent as any)?.target;
    const target =
      nativeTarget ||
      (e?.target as HTMLTextAreaElement | undefined) ||
      (e?.currentTarget as HTMLTextAreaElement | undefined) ||
      textareaRef.current;
    if (target) {
      const start = typeof target.selectionStart === "number" ? target.selectionStart : 0;
      const end = typeof target.selectionEnd === "number" ? target.selectionEnd : 0;
      selectionRef.current = { start, end };
    }
  }, []);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
    const target = (e?.target as HTMLTextAreaElement | undefined) || textareaRef.current;
    if (target && target.selectionStart !== target.selectionEnd) {
      selectionRef.current = {
        start: target.selectionStart ?? 0,
        end: target.selectionEnd ?? 0,
      };
    }
  }, []);

  const getSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return { start: 0, end: 0 };
    // If a non-empty selection was captured before clicking the toolbar, preserve it
    if (selectionRef.current.start !== selectionRef.current.end) {
      return selectionRef.current;
    }
    if (textarea.selectionStart !== textarea.selectionEnd) {
      return { start: textarea.selectionStart, end: textarea.selectionEnd };
    }
    return { start: textarea.selectionStart ?? 0, end: textarea.selectionEnd ?? 0 };
  }, []);

  // Undo / Redo History Stacks
  const historyRef = useRef<HistoryState[]>([{ value, selectionStart: 0, selectionEnd: 0 }]);
  const historyIndexRef = useRef<number>(0);
  const isUndoRedoActionRef = useRef<boolean>(false);

  const pushHistory = useCallback((newValue: string, start: number, end: number) => {
    if (isUndoRedoActionRef.current) return;
    const history = historyRef.current.slice(0, historyIndexRef.current + 1);
    // Avoid duplicate consecutive entries
    if (history.length > 0 && history[history.length - 1]?.value === newValue) {
      return;
    }
    history.push({ value: newValue, selectionStart: start, selectionEnd: end });
    if (history.length > 50) {
      history.shift();
    }
    historyRef.current = history;
    historyIndexRef.current = history.length - 1;
  }, []);

  const handleUndo = useCallback(() => {
    if (disabled || historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const previous = historyRef.current[historyIndexRef.current];
    if (!previous) return;
    isUndoRedoActionRef.current = true;
    onChange(previous.value);
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(previous.selectionStart, previous.selectionEnd);
        updateSelection();
      }
      isUndoRedoActionRef.current = false;
    }, 0);
  }, [disabled, onChange, updateSelection]);

  const handleRedo = useCallback(() => {
    if (disabled || historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const next = historyRef.current[historyIndexRef.current];
    if (!next) return;
    isUndoRedoActionRef.current = true;
    onChange(next.value);
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(next.selectionStart, next.selectionEnd);
        updateSelection();
      }
      isUndoRedoActionRef.current = false;
    }, 0);
  }, [disabled, onChange, updateSelection]);

  // Handle Text Insertion / Formatting
  const applyInlineFormatting = useCallback(
    (prefix: string, suffix: string = "", defaultText: string = "متن") => {
      const textarea = textareaRef.current;
      if (!textarea || disabled) return;

      const { start, end } = getSelection();
      const selected = value.substring(start, end);

      const targetText = selected || defaultText;
      const replacement = `${prefix}${targetText}${suffix}`;
      const newValue = value.substring(0, start) + replacement + value.substring(end);

      onChange(newValue);
      const newCursorStart = start + prefix.length;
      const newCursorEnd = newCursorStart + targetText.length;
      pushHistory(newValue, newCursorStart, newCursorEnd);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorStart, newCursorEnd);
        updateSelection();
      }, 0);
    },
    [disabled, getSelection, onChange, pushHistory, updateSelection, value]
  );

  const applyLinePrefix = useCallback(
    (prefix: string, defaultText: string = "") => {
      const textarea = textareaRef.current;
      if (!textarea || disabled) return;

      const { start, end } = getSelection();

      // Find start of current line
      const lastNewline = value.lastIndexOf("\n", start - 1);
      const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
      const nextNewline = value.indexOf("\n", end);
      const lineEnd = nextNewline === -1 ? value.length : nextNewline;

      const currentLine = value.substring(lineStart, lineEnd);

      let newLine = currentLine;
      // Toggle prefix if already present
      if (currentLine.startsWith(prefix)) {
        newLine = currentLine.slice(prefix.length);
      } else {
        // Strip other heading prefixes if applying a heading
        const cleaned = currentLine.replace(/^#{1,6}\s+|^>\s+|^[-*]\s+|^\d+\.\s+/, "");
        newLine = `${prefix}${cleaned || defaultText}`;
      }

      const newValue = value.substring(0, lineStart) + newLine + value.substring(lineEnd);
      onChange(newValue);

      const newCursorPos = lineStart + newLine.length;
      pushHistory(newValue, newCursorPos, newCursorPos);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        updateSelection();
      }, 0);
    },
    [disabled, getSelection, onChange, pushHistory, updateSelection, value]
  );

  const applyListFormatting = useCallback(
    (type: "bullet" | "numbered") => {
      const textarea = textareaRef.current;
      if (!textarea || disabled) return;

      const { start, end } = getSelection();

      let lineStart: number;
      let lineEnd: number;

      if ((start === 0 && end === 0 && value.includes("\n")) || (start === 0 && end === value.length)) {
        lineStart = 0;
        lineEnd = value.length;
      } else {
        const lastNewline = value.lastIndexOf("\n", start - 1);
        lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
        const nextNewline = value.indexOf("\n", end);
        lineEnd = nextNewline === -1 ? value.length : nextNewline;
      }

      const selectedBlock = value.substring(lineStart, lineEnd);
      const lines = selectedBlock.split(/\r?\n/);

      const allAlreadyFormatted = lines.length > 0 && lines.every((line) =>
        type === "bullet" ? line.startsWith("- ") : /^\d+\.\s+/.test(line)
      );

      const formattedLines = lines.map((line, idx) => {
        const clean = line.replace(/^[-*]\s+|^\d+\.\s+|^#{1,6}\s+|^>\s+/, "");
        if (allAlreadyFormatted) {
          return clean;
        }
        if (type === "bullet") {
          return `- ${clean || "مورد"}`;
        } else {
          return `${idx + 1}. ${clean || "مورد"}`;
        }
      });

      const newBlock = formattedLines.join("\n");
      const newValue = value.substring(0, lineStart) + newBlock + value.substring(lineEnd);
      onChange(newValue);

      const newCursorEnd = lineStart + newBlock.length;
      pushHistory(newValue, lineStart, newCursorEnd);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(lineStart, newCursorEnd);
        updateSelection();
      }, 0);
    },
    [disabled, getSelection, onChange, pushHistory, updateSelection, value]
  );

  const handleClearFormatting = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;

    const { start, end } = getSelection();
    if (start === end) return;

    const selected = value.substring(start, end);
    // Strip markdown formatting symbols from selection
    const cleaned = selected
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/<u>([^<]+)<\/u>/gi, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s+/gm, "")
      .replace(/^[-*]\s+/gm, "")
      .replace(/^\d+\.\s+/gm, "");

    const newValue = value.substring(0, start) + cleaned + value.substring(end);
    onChange(newValue);
    pushHistory(newValue, start, start + cleaned.length);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + cleaned.length);
      updateSelection();
    }, 0);
  }, [disabled, getSelection, onChange, pushHistory, updateSelection, value]);

  const handleInsertDivider = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;

    const { start } = getSelection();
    const prefixNewline = start > 0 && value[start - 1] !== "\n" ? "\n\n" : "\n";
    const replacement = `${prefixNewline}---\n\n`;
    const newValue = value.substring(0, start) + replacement + value.substring(start);

    onChange(newValue);
    const newPos = start + replacement.length;
    pushHistory(newValue, newPos, newPos);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
      updateSelection();
    }, 0);
  }, [disabled, getSelection, onChange, pushHistory, updateSelection, value]);

  const handleOpenLinkModal = useCallback(() => {
    const { start, end } = getSelection();
    const selected = value.substring(start, end);

    setSavedSelection({ start, end });
    setLinkText(selected || "");
    setLinkUrl("");
    setShowLinkModal(true);
  }, [getSelection, value]);

  const handleConfirmLink = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cleanTitle = linkText.trim() || "عنوان پیوند";
    let cleanUrl = linkUrl.trim();
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl) && !cleanUrl.startsWith("/") && !cleanUrl.startsWith("#")) {
      cleanUrl = `https://${cleanUrl}`;
    }
    if (!cleanUrl) {
      cleanUrl = "https://example.com";
    }

    const markdownLink = `[${cleanTitle}](${cleanUrl})`;
    const { start, end } = savedSelection;
    const newValue = value.substring(0, start) + markdownLink + value.substring(end);

    onChange(newValue);
    const newPos = start + markdownLink.length;
    pushHistory(newValue, newPos, newPos);
    setShowLinkModal(false);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
      updateSelection();
    }, 0);
  }, [linkText, linkUrl, onChange, pushHistory, savedSelection, updateSelection, value]);

  // Smart Key Down Handler (Enter, Indent, Keyboard Shortcuts)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Shortcuts
      if (isCmdOrCtrl && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === "b") {
          e.preventDefault();
          applyInlineFormatting("**", "**", "متن پررنگ");
          return;
        }
        if (key === "i") {
          e.preventDefault();
          applyInlineFormatting("*", "*", "متن مورب");
          return;
        }
        if (key === "k") {
          e.preventDefault();
          handleOpenLinkModal();
          return;
        }
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
          return;
        }
        if (key === "y") {
          e.preventDefault();
          handleRedo();
          return;
        }
      }

      // Smart Enter Key Behavior
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const start = textarea.selectionStart;
        const lastNewline = value.lastIndexOf("\n", start - 1);
        const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
        const currentLine = value.substring(lineStart, start);

        // 1. Heading exit on Enter
        const headingMatch = currentLine.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
          e.preventDefault();
          const newValue = value.substring(0, start) + "\n" + value.substring(start);
          onChange(newValue);
          const newPos = start + 1;
          pushHistory(newValue, newPos, newPos);
          setTimeout(() => {
            textarea.setSelectionRange(newPos, newPos);
          }, 0);
          return;
        }

        // 2. Bullet list continuation / exit
        const bulletMatch = currentLine.match(/^([-*])\s+(.*)$/);
        if (bulletMatch) {
          e.preventDefault();
          const bulletSymbol = bulletMatch[1];
          const contentAfterBullet = bulletMatch[2];

          // If current line has empty bullet `- `, exit list
          if (contentAfterBullet.trim() === "") {
            const newValue = value.substring(0, lineStart) + value.substring(start);
            onChange(newValue);
            pushHistory(newValue, lineStart, lineStart);
            setTimeout(() => {
              textarea.setSelectionRange(lineStart, lineStart);
            }, 0);
          } else {
            // Continue list
            const continuation = `\n${bulletSymbol} `;
            const newValue = value.substring(0, start) + continuation + value.substring(start);
            onChange(newValue);
            const newPos = start + continuation.length;
            pushHistory(newValue, newPos, newPos);
            setTimeout(() => {
              textarea.setSelectionRange(newPos, newPos);
            }, 0);
          }
          return;
        }

        // 3. Numbered list continuation / exit
        const numberedMatch = currentLine.match(/^(\d+)\.\s+(.*)$/);
        if (numberedMatch) {
          e.preventDefault();
          const currentNum = parseInt(numberedMatch[1], 10);
          const contentAfterNumber = numberedMatch[2];

          if (contentAfterNumber.trim() === "") {
            // Exit numbered list
            const newValue = value.substring(0, lineStart) + value.substring(start);
            onChange(newValue);
            pushHistory(newValue, lineStart, lineStart);
            setTimeout(() => {
              textarea.setSelectionRange(lineStart, lineStart);
            }, 0);
          } else {
            // Increment number
            const continuation = `\n${currentNum + 1}. `;
            const newValue = value.substring(0, start) + continuation + value.substring(start);
            onChange(newValue);
            const newPos = start + continuation.length;
            pushHistory(newValue, newPos, newPos);
            setTimeout(() => {
              textarea.setSelectionRange(newPos, newPos);
            }, 0);
          }
          return;
        }

        // 4. Blockquote continuation / exit
        const quoteMatch = currentLine.match(/^>\s+(.*)$/);
        if (quoteMatch) {
          e.preventDefault();
          const contentAfterQuote = quoteMatch[1];

          if (contentAfterQuote.trim() === "") {
            const newValue = value.substring(0, lineStart) + value.substring(start);
            onChange(newValue);
            pushHistory(newValue, lineStart, lineStart);
            setTimeout(() => {
              textarea.setSelectionRange(lineStart, lineStart);
            }, 0);
          } else {
            const continuation = "\n> ";
            const newValue = value.substring(0, start) + continuation + value.substring(start);
            onChange(newValue);
            const newPos = start + continuation.length;
            pushHistory(newValue, newPos, newPos);
            setTimeout(() => {
              textarea.setSelectionRange(newPos, newPos);
            }, 0);
          }
          return;
        }
      }
    },
    [
      applyInlineFormatting,
      handleOpenLinkModal,
      handleRedo,
      handleUndo,
      onChange,
      pushHistory,
      value,
    ]
  );

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;
  const charLength = value.length;
  const isOverLimit = typeof maxLength === "number" && charLength > maxLength;

  return (
    <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`} dir="rtl">
      {/* Label and Mode Switcher Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {label && (
          <label htmlFor={editorId} className="text-xs font-semibold text-[var(--color-text)]">
            {label}
            {required && <span className="text-rose-500 mr-1">*</span>}
          </label>
        )}

        {/* View Mode Tabs (Edit vs Preview) */}
        <div className="flex items-center bg-[var(--color-surface-warm)] p-0.5 rounded-lg border border-[var(--color-border)] ms-auto">
          <button
            type="button"
            onClick={() => setActiveTab("edit")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              activeTab === "edit"
                ? "bg-[var(--color-surface)] text-[#008080] shadow-2xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
            aria-label="حالت ویرایش متن"
          >
            ویرایش
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              activeTab === "preview"
                ? "bg-[var(--color-surface)] text-[#008080] shadow-2xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
            aria-label="پیش‌نمایش خروجی برای دانشجو"
          >
            پیش‌نمایش
          </button>
        </div>
      </div>

      {/* Editor Main Container */}
      <div
        className={`w-full rounded-[12px] border transition-all overflow-hidden bg-[var(--color-surface)] flex flex-col ${
          error || isOverLimit
            ? "border-[#b84c4c] ring-1 ring-[#b84c4c]"
            : "border-[var(--color-border)] focus-within:border-[#008080] focus-within:ring-3 focus-within:ring-[#008080]/15"
        }`}
      >
        {/* Formatting Toolbar */}
        {activeTab === "edit" && (
          <div
            className="flex items-center gap-1 p-1.5 sm:p-2 bg-[var(--color-surface-warm)]/70 border-b border-[var(--color-border)] flex-wrap select-none overflow-x-auto"
            role="toolbar"
            aria-label="نوار ابزار ویرایشگر متن"
          >
            {/* Undo & Redo */}
            <div className="flex items-center gap-0.5">
              <ToolbarButton
                onClick={handleUndo}
                disabled={disabled || !canUndo}
                title="بازگشت به عقب (Ctrl+Z)"
                ariaLabel="بازگشت به عقب (Undo)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a5 5 0 015 5v2M3 10l6-6M3 10l6 6" />
                </svg>
              </ToolbarButton>

              <ToolbarButton
                onClick={handleRedo}
                disabled={disabled || !canRedo}
                title="تکرار عملیات (Ctrl+Y)"
                ariaLabel="تکرار عملیات (Redo)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10H11a5 5 0 00-5 5v2M21 10l-6-6M21 10l-6 6" />
                </svg>
              </ToolbarButton>
            </div>

            <ToolbarDivider />

            {/* Headings */}
            <div className="flex items-center gap-0.5">
              <ToolbarButton
                onClick={() => applyLinePrefix("# ", "عنوان اصلی")}
                disabled={disabled}
                title="تیتر اصلی (Heading 1)"
                ariaLabel="تیتر اصلی سطح ۱"
              >
                <span className="font-extrabold text-xs font-mono">H1</span>
              </ToolbarButton>

              <ToolbarButton
                onClick={() => applyLinePrefix("## ", "زیرعنوان")}
                disabled={disabled}
                title="زیرعنوان (Heading 2)"
                ariaLabel="تیتر سطح ۲"
              >
                <span className="font-bold text-xs font-mono">H2</span>
              </ToolbarButton>

              <ToolbarButton
                onClick={() => applyLinePrefix("### ", "عنوان بخش")}
                disabled={disabled}
                title="تیتر فرعی (Heading 3)"
                ariaLabel="تیتر سطح ۳"
              >
                <span className="font-semibold text-xs font-mono">H3</span>
              </ToolbarButton>
            </div>

            <ToolbarDivider />

            {/* Inline Formats */}
            <div className="flex items-center gap-0.5">
              <ToolbarButton
                onClick={() => applyInlineFormatting("**", "**", "متن پررنگ")}
                disabled={disabled}
                title="پررنگ / بولد (Ctrl+B)"
                ariaLabel="متن پررنگ (Bold)"
              >
                <span className="font-black text-sm">B</span>
              </ToolbarButton>

              <ToolbarButton
                onClick={() => applyInlineFormatting("*", "*", "متن مورب")}
                disabled={disabled}
                title="مورب / ایتالیک (Ctrl+I)"
                ariaLabel="متن مورب (Italic)"
              >
                <span className="italic font-serif text-sm font-bold">I</span>
              </ToolbarButton>

              <ToolbarButton
                onClick={() => applyInlineFormatting("~~", "~~", "متن خط‌خورده")}
                disabled={disabled}
                title="خط‌خورده (Strikethrough)"
                ariaLabel="متن خط‌خورده (Strikethrough)"
              >
                <span className="line-through text-xs font-bold font-mono">S</span>
              </ToolbarButton>

              <ToolbarButton
                onClick={handleClearFormatting}
                disabled={disabled}
                title="حذف فرمت و استایل‌های بخش انتخاب‌شده"
                ariaLabel="حذف قالب‌بندی (Clear formatting)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </ToolbarButton>
            </div>

            <ToolbarDivider />

            {/* Lists */}
            <div className="flex items-center gap-0.5">
              <ToolbarButton
                onClick={() => applyListFormatting("bullet")}
                disabled={disabled}
                title="فهرست نشانه‌دار (Bullet list)"
                ariaLabel="فهرست نشانه‌دار"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16M8 6h.01M8 12h.01M8 18h.01" />
                </svg>
              </ToolbarButton>

              <ToolbarButton
                onClick={() => applyListFormatting("numbered")}
                disabled={disabled}
                title="فهرست شماره‌دار (Numbered list)"
                ariaLabel="فهرست شماره‌دار"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6h10M10 12h10M10 18h10M4 6h1v4M4 10h2M4 14h2l-2 4h2" />
                </svg>
              </ToolbarButton>
            </div>

            <ToolbarDivider />

            {/* Blockquote, Link, Divider, Code */}
            <div className="flex items-center gap-0.5">
              <ToolbarButton
                onClick={() => applyLinePrefix("> ", "نکته یا نقل‌قول")}
                disabled={disabled}
                title="نقل‌قول / کادر توجه (Quote)"
                ariaLabel="نقل‌قول یا کادر توجه"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </ToolbarButton>

              <ToolbarButton
                onClick={handleOpenLinkModal}
                disabled={disabled}
                title="افزودن لینک (Ctrl+K)"
                ariaLabel="افزودن پیوند اینترنتی"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </ToolbarButton>

              <ToolbarButton
                onClick={handleInsertDivider}
                disabled={disabled}
                title="خط جداکننده افقی (Divider)"
                ariaLabel="خط جداکننده افقی"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14" />
                </svg>
              </ToolbarButton>

              <ToolbarButton
                onClick={() => applyInlineFormatting("`", "`", "کد")}
                disabled={disabled}
                title="کد درون‌خطی (Inline code)"
                ariaLabel="کد درون‌خطی"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </ToolbarButton>
            </div>
          </div>
        )}

        {/* Content View Area */}
        {activeTab === "edit" ? (
          <textarea
            ref={textareaRef}
            id={editorId}
            value={value}
            maxLength={maxLength}
            onChange={(e) => {
              const nextVal = e.target.value;
              onChange(nextVal);
              pushHistory(nextVal, e.target.selectionStart, e.target.selectionEnd);
              updateSelection();
            }}
            onSelect={updateSelection}
            onKeyUp={updateSelection}
            onMouseUp={updateSelection}
            onFocus={updateSelection}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            dir="rtl"
            style={{ minHeight: `${minHeight}px` }}
            className={`w-full p-3.5 sm:p-4 bg-transparent text-xs sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none resize-y leading-relaxed font-sans ${className}`}
          />
        ) : (
          <div
            className="w-full p-4 sm:p-5 overflow-y-auto bg-[var(--color-surface)] text-xs sm:text-sm text-[var(--color-text)] leading-relaxed select-text"
            style={{ minHeight: `${minHeight}px` }}
            dir="rtl"
          >
            {value.trim() ? (
              renderPreview ? (
                renderPreview(value)
              ) : (
                <div className="whitespace-pre-wrap leading-relaxed">{value}</div>
              )
            ) : (
              <span className="text-[var(--color-text-muted)] italic">
                هنوز متنی برای پیش‌نمایش وارد نشده است...
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer Info: Error / Helper and Character Counter */}
      <div className="flex items-center justify-between text-xs gap-2 px-1">
        <div>
          {error && <span className="text-red-500 font-medium">{error}</span>}
          {!error && helperText && (
            <span className="text-[var(--color-text-muted)]">{helperText}</span>
          )}
        </div>

        {(showCharacterCount || typeof maxLength === "number") && (
          <span
            className={`font-mono text-[11px] ${
              isOverLimit ? "text-red-500 font-bold" : "text-[var(--color-text-muted)]"
            }`}
          >
            {new Intl.NumberFormat("fa-IR").format(charLength)}
            {typeof maxLength === "number" ? ` / ${new Intl.NumberFormat("fa-IR").format(maxLength)}` : ""} کاراکتر
          </span>
        )}
      </div>

      {/* Insert Link Modal */}
      {showLinkModal && (
        <div
          className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="link-modal-title"
        >
          <div
            className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-xl p-5 space-y-4 text-right"
            dir="rtl"
          >
            <h4 id="link-modal-title" className="text-sm font-bold text-[var(--color-text)]">
              افزودن پیوند (Link)
            </h4>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--color-text)]">
                  عنوان پیوند
                </label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="مثال: منبع آموزشی یا مستندات"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] focus:outline-none focus:border-[#008080]"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--color-text)]">
                  آدرس اینترنتی (URL)
                </label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  dir="ltr"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] focus:outline-none focus:border-[#008080]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleConfirmLink();
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="px-3.5 py-1.5 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmLink}
                className="px-4 py-1.5 rounded-xl bg-[#008080] text-white text-xs font-bold hover:bg-[#006666] transition-colors shadow-2xs"
              >
                ثبت پیوند
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ToolbarButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  title: string;
  ariaLabel: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, title, ariaLabel, children }) => (
  <button
    type="button"
    onMouseDown={(e) => {
      // Prevent button click from stealing focus and losing selection in textarea
      e.preventDefault();
    }}
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={ariaLabel}
    className="p-1.5 sm:p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center min-w-[28px] min-h-[28px]"
  >
    {children}
  </button>
);

const ToolbarDivider: React.FC = () => (
  <div className="w-px h-4 bg-[var(--color-border)] mx-1 shrink-0" aria-hidden="true" />
);
