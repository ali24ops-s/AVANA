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
  Info,
  Lightbulb,
} from "lucide-react";
import { Badge } from "@avana/ui";
import { toPersianDigits } from "@avana/domain";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer.js";
import { createApiClient, getApiBaseUrl, generateUUID } from "../../lib/api/client.js";
import { createAiAssistantApi } from "../../lib/api/ai.js";
import { useStudySessionTracker } from "../../hooks/useStudySessionTracker.js";

export interface ExamQuestionContext {
  questionId: string;
  questionNumber: number;
  questionText: string;
  choices?: string[] | null;
  selectedChoice?: string | null;
  topic?: string | null;
  keyPoint?: string | null;
  lessonId?: string | null;
  lessonTitle?: string | null;
  chapterTitle?: string | null;
  isMultiChapterExam?: boolean;
}

export interface ChatMessage {
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

export interface QuestionMentorState {
  messages: ChatMessage[];
  conversationId?: string | null;
  isLoading: boolean;
  error?: string | null;
}

export interface StudyAssistantChatProps {
  contextType: "lesson" | "dashboard" | "exam_question";
  lessonId?: string;
  courseId?: string;
  lessonTitle?: string;
  moduleTitle?: string;
  courseTitle?: string;
  examQuestion?: ExamQuestionContext;
  autoStartGuidance?: boolean;
  conversationState?: QuestionMentorState;
  onConversationStateChange?: (state: QuestionMentorState, questionId?: string) => void;
  onClose?: () => void;
  className?: string;
  compact?: boolean;
  initialPrompt?: string;
}

function buildExamMentorPrompt(q: ExamQuestionContext): string {
  const choicesText =
    q.choices && q.choices.length > 0
      ? q.choices.map((c, i) => `${String.fromCharCode(65 + i)}) ${c}`).join("\n")
      : "بدون گزینه چهارجوابی";
  const userChoice = q.selectedChoice
    ? `گزینه انتخاب‌شده من: ${q.selectedChoice}`
    : "هنوز گزینه‌ای انتخاب نکرده‌ام.";
  const topicInfo = q.topic ? `مبحث سوال: ${q.topic}` : "";
  const keyPointInfo = q.keyPoint ? `نکته علمی زمینه سوال: ${q.keyPoint}` : "";
  const hasLesson = Boolean(q.lessonId);
  const lessonInfo = hasLesson && q.lessonTitle ? `عنوان درس مرجع: ${q.lessonTitle}` : "";

  const groundingDirectives = hasLesson
    ? `۲. سلسله‌مراتب منبع حقیقت (Grounding Priority):
   - اولویت ۱: محتوای آموزشی درس (که در پیام سیستمی قرار دارد) منبع اصلی و قطعی پاسخ است.
   - اولویت ۲: سؤال و تمام گزینه‌های آن را دقیق بررسی کنید و پاسخ را با محتوای درس تطبیق دهید.
   - اولویت ۳: دانش عمومی مدل در صورت نیاز به توضیح تکمیلی.
۳. تفکیک و برچسب‌گذاری دقیق منبع:
   - هر نکته‌ای که مستند به متن درس است را با برچسب «[بر اساس محتوای درس]» در متن مشخص کنید.
   - هر توضیح تکمیلی و مفهومی خارج از متن درس را با برچسب «[خارج از منبع درس]» مشخص کنید.`
    : `۲. وضعیت منبع حقیقت (عدم وجود درسنامه متصل):
   - برای این سؤال درسنامه متصل مشخصی ثبت نشده است؛ هرگز وانمود نکنید که پاسخ بر اساس متن درس است و از برچسب «[بر اساس محتوای درس]» استفاده نکنید.
   - منبع شما تحلیل مفهومی صورت سؤال، بررسی تمایز گزینه‌ها و دانش تکمیلی است.
۳. تفکیک و برچسب‌گذاری منبع:
   - نکات تحلیلی و توضیحات تکمیلی را با برچسب «[خارج از منبع درس]» مشخص کنید.`;

  return `شما در حال راهنمایی آموزشی یک دانشجو در حین برگزاری آزمون هستید.
دانشجو برای سوال شماره ${toPersianDigits(q.questionNumber)} راهنمایی می‌خواهد.

متن سوال:
${q.questionText}

گزینه‌ها:
${choicesText}

${lessonInfo}
${topicInfo}
${keyPointInfo}
وضعیت فعلی دانشجو: ${userChoice}

دستورالعمل مهم و الزامات منتور:
۱. هرگز و به هیچ وجه پاسخ صحیح را مستقیماً لو ندهید و گزینه درست یا نهایی را اعلام نکنید.
${groundingDirectives}
۴. هدف شما هدایت آموزشی و داربست‌بندی فکری است؛ مسیر فکری یا سرنخ مرحله‌ای ارائه دهید تا خود دانشجو بتواند گزینه صحیح را تشخیص دهد.
۵. پاسخ را کوتاه، مستدل، متمرکز و به زبان فارسی بنویسید.`;
}

export function StudyAssistantChat({
  contextType,
  lessonId,
  courseId,
  lessonTitle,
  moduleTitle,
  courseTitle,
  examQuestion,
  autoStartGuidance = true,
  conversationState,
  onConversationStateChange,
  onClose,
  className = "",
  compact = false,
  initialPrompt,
}: StudyAssistantChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => conversationState?.messages || []);
  const [inputMessage, setInputMessage] = useState(initialPrompt || "");
  const [conversationId, setConversationId] = useState<string | null>(() => conversationState?.conversationId || null);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(conversationState?.isLoading));
  const [error, setError] = useState<string | null>(() => conversationState?.error || null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isInitialMount = useRef(true);
  const isMountedRef = useRef(true);
  const activeRequestIdRef = useRef<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Sync state if external conversationState changes while mounted
  useEffect(() => {
    if (conversationState && contextType === "exam_question") {
      setMessages(conversationState.messages);
      setConversationId(conversationState.conversationId || null);
      setIsLoading(Boolean(conversationState.isLoading));
      setError(conversationState.error || null);
    }
  }, [conversationState, contextType]);

  // Track active educational study time for AI tutor sessions (disabled in exam mode to avoid double-tracking)
  useStudySessionTracker({
    activityType: "ai_tutor",
    courseId,
    lessonId,
    enabled: contextType !== "exam_question",
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

  const requestInitialExamGuidance = async (q: ExamQuestionContext) => {
    const requestId = ++activeRequestIdRef.current;
    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    const promptText = buildExamMentorPrompt(q);
    const userMsg: ChatMessage = {
      id: generateUUID(),
      role: "user",
      content: `راهنمایی برای سوال ${toPersianDigits(q.questionNumber)}`,
      createdAt: new Date(),
    };
    if (isMountedRef.current) {
      setMessages([userMsg]);
    }

    onConversationStateChange?.(
      {
        messages: [userMsg],
        isLoading: true,
        error: null,
        conversationId: null,
      },
      q.questionId
    );

    try {
      const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
      const aiApi = createAiAssistantApi(apiClient);

      const response = await aiApi.ask({
        message: promptText,
        context: {
          type: q.lessonId ? "lesson" : "dashboard",
          lessonId: q.lessonId || undefined,
        },
      });

      if (activeRequestIdRef.current !== requestId) return;

      const aiMsg: ChatMessage = {
        id: generateUUID(),
        role: "assistant",
        content: response.answer,
        sources: response.sources,
        createdAt: new Date(),
      };

      if (isMountedRef.current) {
        setConversationId(response.conversationId);
        setMessages((prev) => [...prev, aiMsg]);
        setIsLoading(false);
      }

      onConversationStateChange?.(
        {
          messages: [userMsg, aiMsg],
          isLoading: false,
          error: null,
          conversationId: response.conversationId,
        },
        q.questionId
      );
    } catch (err: unknown) {
      if (activeRequestIdRef.current !== requestId) return;
      const displayError =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "متأسفانه در دریافت پاسخ خطایی رخ داد. لطفاً دوباره تلاش کنید.";

      if (isMountedRef.current) {
        setError(displayError);
        setIsLoading(false);
      }

      onConversationStateChange?.(
        {
          messages: [userMsg],
          isLoading: false,
          error: displayError,
          conversationId: null,
        },
        q.questionId
      );
    } finally {
      if (activeRequestIdRef.current === requestId && isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const examQuestionId = examQuestion?.questionId;

  // Reset conversation if switching lesson in lesson mode or switching question in exam mode
  useEffect(() => {
    activeRequestIdRef.current++;
    if (contextType === "lesson" && lessonId) {
      setConversationId(null);
      setMessages([]);
      setError(null);
    } else if (contextType === "exam_question" && examQuestionId && examQuestion) {
      // If an existing conversation already exists for this question (or is in-flight), restore it and DO NOT auto-generate!
      if (conversationState && (conversationState.messages.length > 0 || conversationState.isLoading)) {
        setMessages(conversationState.messages);
        setConversationId(conversationState.conversationId || null);
        setIsLoading(Boolean(conversationState.isLoading));
        setError(conversationState.error || null);
        return;
      }

      setConversationId(null);
      setMessages([]);
      setError(null);
      if (autoStartGuidance) {
        void requestInitialExamGuidance(examQuestion);
      }
    }
  }, [lessonId, contextType, examQuestionId]);

  const quickPrompts =
    contextType === "exam_question"
      ? [
          "یک سرنخ مرحله‌ای بیشتر بده",
          "گزینه‌ها را تحلیل کن بدون گفتن جواب",
          "مفهوم پایه این سوال چیه؟",
        ]
      : contextType === "lesson"
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

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setIsLoading(true);
    const requestId = ++activeRequestIdRef.current;

    onConversationStateChange?.(
      {
        messages: nextMessages,
        isLoading: true,
        error: null,
        conversationId,
      },
      examQuestionId
    );

    try {
      const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
      const aiApi = createAiAssistantApi(apiClient);

      const response = await aiApi.ask({
        message,
        context: {
          type:
            contextType === "lesson" || (contextType === "exam_question" && examQuestion?.lessonId)
              ? "lesson"
              : "dashboard",
          lessonId:
            contextType === "lesson"
              ? lessonId
              : contextType === "exam_question"
                ? examQuestion?.lessonId || undefined
                : undefined,
          courseId: contextType === "lesson" ? courseId : undefined,
        },
        conversationId: conversationId || undefined,
      });

      if (activeRequestIdRef.current !== requestId) return;

      const aiMsg: ChatMessage = {
        id: generateUUID(),
        role: "assistant",
        content: response.answer,
        sources: response.sources,
        createdAt: new Date(),
      };

      const finalMessages = [...nextMessages, aiMsg];
      if (isMountedRef.current) {
        setConversationId(response.conversationId);
        setMessages(finalMessages);
        setIsLoading(false);
      }

      onConversationStateChange?.(
        {
          messages: finalMessages,
          isLoading: false,
          error: null,
          conversationId: response.conversationId,
        },
        examQuestionId
      );
    } catch (err: unknown) {
      if (activeRequestIdRef.current !== requestId) return;
      const displayError =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "متأسفانه در دریافت پاسخ خطایی رخ داد. لطفاً دوباره تلاش کنید.";

      if (isMountedRef.current) {
        setError(displayError);
        setIsLoading(false);
      }

      onConversationStateChange?.(
        {
          messages: nextMessages,
          isLoading: false,
          error: displayError,
          conversationId,
        },
        examQuestionId
      );
    } finally {
      if (activeRequestIdRef.current === requestId && isMountedRef.current) {
        setIsLoading(false);
        setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
      }
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
    onConversationStateChange?.(
      {
        messages: [],
        isLoading: false,
        error: null,
        conversationId: null,
      },
      examQuestionId
    );
  }

  return (
    <div
      className={`flex flex-col h-full w-full min-h-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-card overflow-hidden shadow-card transition-all ${className}`}
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
              {contextType === "exam_question" ? (
                <h2 className="text-h3 text-[var(--color-text)] truncate">
                  تحلیل هوشمند آوانا
                </h2>
              ) : (
                <h3 className="text-xs sm:text-sm font-extrabold text-[var(--color-text)] truncate">
                  از آوانا بپرس
                </h3>
              )}
              <Badge variant="primary" size="sm" className="font-bold shrink-0">
                {contextType === "exam_question" ? "منتور هوشمند" : "Cloudflare AI"}
              </Badge>
            </div>
            {contextType === "exam_question" ? null : contextType === "lesson" && lessonTitle ? (
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

      {/* Exam Question Conceptual Header */}
      {contextType === "exam_question" && (
        <div className="p-4 bg-[var(--color-surface-warm)] border-b border-[var(--color-border)] space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-h4 text-[var(--color-primary-dark)] flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-amber-500" aria-hidden="true" />
              <span>راهنمای مفهومی سوال:</span>
            </h3>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] px-2.5 py-1 rounded-button bg-[var(--color-surface)] border border-[var(--color-border)] transition-colors font-medium cursor-pointer"
              >
                متوجه شدم
              </button>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[var(--color-text)] leading-relaxed">
            این سوال مربوط به{" "}
            {examQuestion?.lessonId && examQuestion?.lessonTitle ? (
              examQuestion.isMultiChapterExam && examQuestion.chapterTitle ? (
                <>
                  <span className="text-[var(--color-primary)] font-bold">{examQuestion.chapterTitle}</span>
                  {" • درس: "}
                  <span className="text-[var(--color-primary)] font-bold">{examQuestion.lessonTitle}</span>{" "}
                  (مستند به محتوای آموزشی درسنامه)
                </>
              ) : (
                <>
                  درس <span className="text-[var(--color-primary)] font-bold">{examQuestion.lessonTitle}</span> (مستند به محتوای آموزشی درسنامه)
                </>
              )
            ) : examQuestion?.topic ? (
              <>
                مبحث <span className="text-[var(--color-primary)] font-bold">{examQuestion.topic}</span> (تحلیل مفهومی و تکمیلی)
              </>
            ) : (
              "مبحث مورد نظر"
            )}{" "}
            است.
          </p>
          <div className="p-2.5 bg-[#e8f4fb] border border-[#a7d0e6] rounded-xl text-xs text-[#2b6d8f]">
            <span>💡 تحلیل تفصیلی، پاسخ صحیح و منبع پس از ثبت نهایی آزمون در دسترس قرار خواهد گرفت.</span>
          </div>

          {/* Key Point - rendered ONLY when real keyPoint data exists */}
          {examQuestion?.keyPoint ? (
            <div className="bg-[var(--color-surface)] p-3 rounded-card border border-[var(--color-border)] shadow-xs">
              <h4 className="text-[var(--color-text)] font-bold text-xs sm:text-sm mb-1 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                <span>نکته کلیدی:</span>
              </h4>
              <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
                {examQuestion.keyPoint}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 overscroll-contain"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center p-4 space-y-4 my-auto">
            <div className="w-12 h-12 rounded-card bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <p className="text-sm font-bold text-[var(--color-text)]">
                {contextType === "exam_question"
                  ? "راهنمایی از منتور هوشمند آوانا"
                  : contextType === "lesson"
                  ? "هر سوالی در حین مطالعه این درس داری بپرس!"
                  : "چطور می‌توانم در یادگیری به شما کمک کنم؟"}
              </p>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                {contextType === "exam_question"
                  ? "من به شما کمک می‌کنم مفهوم این سوال را بهتر تحلیل کنید و بدون لو دادن پاسخ، مسیر فکری حل سوال را پیدا کنید."
                  : contextType === "lesson"
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
              onClick={() => {
                if (contextType === "exam_question" && examQuestion && messages.length <= 1) {
                  void requestInitialExamGuidance(examQuestion);
                } else {
                  void handleSend();
                }
              }}
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
                contextType === "exam_question"
                  ? "سوال یا ابهام خود را درباره این سوال بنویسید..."
                  : contextType === "lesson"
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

