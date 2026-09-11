import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  AlertCircle,
  RotateCcw,
  BookOpen,
  User,
  X,
} from "lucide-react";
import { Badge } from "@avana/ui";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer.js";
import { createApiClient, getApiBaseUrl, generateUUID } from "../../lib/api/client.js";
import { createAiAssistantApi } from "../../lib/api/ai.js";
import { useStudySessionTracker } from "../../hooks/useStudySessionTracker.js";

export interface StudyAssistantChatProps {
  contextType: "lesson" | "dashboard";
  lessonId?: string;
  courseId?: string;
  lessonTitle?: string;
  moduleTitle?: string;
  courseTitle?: string;
  onClose?: () => void;
  className?: string;
  compact?: boolean;
  initialPrompt?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: {
    courseTitle?: string;
    moduleTitle?: string;
    lessonTitle?: string;
  };
  createdAt: Date;
}

export function StudyAssistantChat({
  contextType,
  lessonId,
  courseId,
  lessonTitle,
  moduleTitle,
  courseTitle,
  onClose,
  className = "",
  compact = false,
  initialPrompt,
}: StudyAssistantChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState(initialPrompt || "");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isInitialMount = useRef(true);

  // Track active educational study time for AI tutor sessions
  useStudySessionTracker({
    activityType: "ai_tutor",
    courseId,
    lessonId,
    enabled: true,
  });

  // Auto-scroll ONLY the internal messages container without affecting window scroll
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (messagesContainerRef.current) {
      if (typeof messagesContainerRef.current.scrollTo === "function") {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      } else {
        messagesContainerRef.current.scrollTop =
          messagesContainerRef.current.scrollHeight;
      }
    }
  }, [messages, isLoading]);

  // Reset conversation if switching lesson in lesson mode
  useEffect(() => {
    if (contextType === "lesson" && lessonId) {
      setConversationId(null);
      setMessages([]);
      setError(null);
    }
  }, [lessonId, contextType]);

  const quickPrompts =
    contextType === "lesson"
      ? [
          "مفاهیم کلیدی این درس چیه؟",
          "نکات مهم امتحانی این بخش رو بگو",
          "مکانیزم اثر رو با یک مثال ساده توضیح بده",
        ]
      : [
          "چطور از آوانا بهترین استفاده را داشته باشم؟",
          "چطور از PDF درس، فلش‌کارت و آزمون بسازم؟",
          "چطور دوره‌های موردنظرم را به دوره‌های من اضافه کنم؟",
          "برای امتحان چطور با آوانا مطالعه کنم؟",
          "چطور فلش‌کارت‌ها را مرور کنم؟",
          "چطور با آزمون خودم را ارزیابی کنم؟",
          "چطور یک برنامه مطالعه مؤثر داشته باشم؟",
        ];

  async function handleSend(textToSend?: string) {
    const message = (textToSend ?? inputMessage).trim();
    if (!message || isLoading) return;

    setError(null);
    setInputMessage("");

    const userMsg: ChatMessage = {
      id: generateUUID(),
      role: "user",
      content: message,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
      const aiApi = createAiAssistantApi(apiClient);

      const response = await aiApi.ask({
        message,
        context: {
          type: contextType,
          lessonId: contextType === "lesson" ? lessonId : undefined,
          courseId: contextType === "lesson" ? courseId : undefined,
        },
        conversationId: conversationId || undefined,
      });

      setConversationId(response.conversationId);

      const aiMsg: ChatMessage = {
        id: generateUUID(),
        role: "assistant",
        content: response.answer,
        sources: response.sources,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: unknown) {
      const displayError =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "متأسفانه در دریافت پاسخ خطایی رخ داد. لطفاً دوباره تلاش کنید.";
      setError(displayError);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleNewConversation() {
    setConversationId(null);
    setMessages([]);
    setError(null);
    setInputMessage("");
  }

  return (
    <div
      className={`flex flex-col bg-[var(--color-surface)] border border-[var(--color-border)] rounded-card overflow-hidden shadow-card transition-all ${className}`}
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-button bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-extrabold text-[var(--color-text)] truncate">
                از آوانا بپرس
              </h3>
              <Badge variant="primary" size="sm" className="font-bold shrink-0">
                Cloudflare AI
              </Badge>
            </div>
            {contextType === "lesson" && lessonTitle ? (
              <p className="text-[11px] text-primary truncate font-medium flex items-center gap-1 mt-0.5">
                <BookOpen className="w-3 h-3 shrink-0" />
                <span>درس: {lessonTitle}{moduleTitle ? ` (${moduleTitle})` : ""}</span>
              </p>
            ) : contextType === "lesson" && courseTitle ? (
              <p className="text-[11px] text-primary truncate mt-0.5 font-medium">
                دوره: {courseTitle}
              </p>
            ) : (
              <p className="text-[11px] text-[var(--color-text-muted)] truncate mt-0.5">
                دستیار هوشمند و راهنمای یادگیری آوانا
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleNewConversation}
              title="مکالمه جدید"
              aria-label="مکالمه جدید"
              className="p-1.5 rounded-button text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="بستن"
              aria-label="بستن دستیار"
              className="p-1.5 rounded-button text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 min-h-[220px] overscroll-contain"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center p-4 space-y-4 my-auto">
            <div className="w-12 h-12 rounded-card bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <p className="text-sm font-bold text-[var(--color-text)]">
                {contextType === "lesson"
                  ? "هر سوالی در حین مطالعه این درس داری بپرس!"
                  : "چطور می‌توانم در یادگیری به شما کمک کنم؟"}
              </p>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                {contextType === "lesson"
                  ? "من محتوای این درس را بررسی می‌کنم و نکات علمی و آموزشی را به شکل خلاصه و دقیق برایت توضیح می‌دهم."
                  : "من دستیار هوشمند آوانا هستم؛ می‌توانم در استفاده از امکانات آوانا (تبدیل جزوه به درسنامه، فلش‌کارت و آزمون)، روش‌های مؤثر مطالعه و مدیریت یادگیری به شما کمک کنم."}
              </p>
            </div>

            {/* Quick Suggestions */}
            <div className="w-full pt-2 flex flex-col gap-2 max-w-md">
              <span className="text-[11px] font-bold text-[var(--color-text-muted)] text-start">
                پیشنهادهای سریع:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {quickPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => void handleSend(prompt)}
                    disabled={isLoading}
                    className="text-start text-xs bg-[var(--color-surface)] hover:bg-primary/10 text-[var(--color-text)] hover:text-primary border border-[var(--color-border)] hover:border-primary/40 px-3 py-1.5 rounded-button transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 rounded-button flex items-center justify-center shrink-0 text-xs shadow-xs mt-0.5 ${
                  msg.role === "user"
                    ? "bg-primary text-white"
                    : "bg-primary/10 text-primary border border-primary/20"
                }`}
              >
                {msg.role === "user" ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[85%] sm:max-w-[80%] rounded-card p-3.5 sm:p-4 text-xs sm:text-sm leading-relaxed shadow-xs ${
                  msg.role === "user"
                    ? "bg-primary text-white rounded-tr-none font-medium"
                    : "bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] rounded-tl-none"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="space-y-2">
                    <div className="prose prose-sm max-w-none text-[var(--color-text)] leading-relaxed">
                      <MarkdownRenderer content={msg.content} />
                    </div>

                    {msg.sources && (
                      <div className="pt-2 mt-2 border-t border-[var(--color-border)] flex items-center gap-1.5 text-[10px] text-primary font-medium">
                        <BookOpen className="w-3 h-3 shrink-0" />
                        <span>پاسخ مستند بر درس: {msg.sources.lessonTitle}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}

        {/* Loading Bubble */}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-button bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 shadow-xs mt-0.5">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-card rounded-tl-none p-3.5 text-xs text-[var(--color-text-muted)] flex items-center gap-2 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping shrink-0" />
              <span>آوانا در حال اندیشیدن و جستجوی نکات آموزشی...</span>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="p-3 rounded-card bg-[var(--avana-error-bg)] border border-[var(--avana-error-border)] text-[var(--avana-error)] text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void handleSend()}
              className="text-[11px] font-bold underline hover:opacity-80 transition-opacity shrink-0 cursor-pointer"
            >
              تلاش دوباره
            </button>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 sm:p-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)] shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="w-full"
        >
          <div className="relative flex items-center w-full">
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder={
                contextType === "lesson"
                  ? "سوال خود را در مورد این درس بنویسید..."
                  : "سوال خود را درباره امکانات آوانا یا روش مطالعه بنویسید..."
              }
              rows={compact ? 1 : 2}
              maxLength={4000}
              className="w-full min-h-[50px] bg-[var(--color-surface)] border border-[var(--color-border)] focus:border-primary focus:ring-1 focus:ring-primary rounded-input pe-12 ps-4 py-3 text-xs sm:text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] resize-none outline-none transition-all leading-relaxed"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              aria-label="ارسال پیام"
              title="ارسال پیام"
              className={`absolute end-2.5 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-button flex items-center justify-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                inputMessage.trim() && !isLoading
                  ? "bg-primary hover:bg-primary-hover text-white shadow-sm active:scale-95 cursor-pointer opacity-100"
                  : "bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] opacity-40 cursor-not-allowed"
              }`}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Send className="w-4 h-4 -scale-x-100" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

