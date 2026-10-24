import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  Button,
  Badge,
  Alert,
  LoadingState,
  AvanaSelect,
} from "@avana/ui";
import {
  Send,
  X,
  Paperclip,
  ShieldCheck,
  User,
  Lock,
  RotateCcw,
  CheckCircle2,
  Check,
  CheckCheck,
} from "lucide-react";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatPersianDateTime,
  getPriorityBadgeVariant,
  getTicketStatusBadgeVariant,
} from "./supportUiHelpers.js";
import { SupportAttachmentAction } from "./SupportAttachmentAction.js";
import {
  useMyTicketDetails,
  useAdminTicketDetails,
  useSendTicketMessage,
  useAdminSendTicketMessage,
  useReopenTicket,
  useAdminUpdateTicketStatus,
  useMarkMessagesAsRead,
  getSupportApi,
} from "../../hooks/useSupport.js";
import type { TicketStatus, TicketCategory, TicketPriority } from "@avana/domain";

interface TicketConversationModalProps {
  ticketId: string | null;
  isOpen: boolean;
  onClose: () => void;
  isAdminMode?: boolean;
}

export function TicketConversationModal({
  ticketId,
  isOpen,
  onClose,
  isAdminMode = false,
}: TicketConversationModalProps) {
  const [replyText, setReplyText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userQuery = useMyTicketDetails(!isAdminMode ? ticketId : null);
  const adminQuery = useAdminTicketDetails(isAdminMode ? ticketId : null);

  const activeQuery = isAdminMode ? adminQuery : userQuery;
  const ticket = activeQuery.data?.ticket;

  const sendUserMessageMutation = useSendTicketMessage();
  const sendAdminMessageMutation = useAdminSendTicketMessage();
  const reopenTicketMutation = useReopenTicket();
  const updateStatusMutation = useAdminUpdateTicketStatus();
  const markMessagesAsReadMutation = useMarkMessagesAsRead();

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // 3-tier read receipt tracking (strictly active only in user mode)
  // 1. readyQueueRef: Dwell time completed, queued for outgoing batch
  // 2. inFlightQueueRef: Actively in-flight HTTP request
  // 3. committedMessageIdsRef: Confirmed successfully by server (final state)
  const readyQueueRef = useRef<Set<string>>(new Set());
  const inFlightQueueRef = useRef<Set<string>>(new Set());
  const committedMessageIdsRef = useRef<Set<string>>(new Set());
  const retryCountRef = useRef<Map<string, number>>(new Map());

  const dwellTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticketIdRef = useRef<string | null>(ticketId);

  useEffect(() => {
    ticketIdRef.current = ticketId;
  }, [ticketId]);

  // Clean up state when ticketId changes, modal closes, or component unmounts
  useEffect(() => {
    readyQueueRef.current.clear();
    inFlightQueueRef.current.clear();
    committedMessageIdsRef.current.clear();
    retryCountRef.current.clear();

    dwellTimersRef.current.forEach((t) => clearTimeout(t));
    dwellTimersRef.current.clear();

    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    return () => {
      dwellTimersRef.current.forEach((t) => clearTimeout(t));
      dwellTimersRef.current.clear();

      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [ticketId, isOpen]);

  // Flush batch of read messages to API with bounded retry and commit-on-success
  const flushPendingReadBatch = useRef(() => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }

    if (!ticketId || !isOpen || isAdminMode || readyQueueRef.current.size === 0) {
      return;
    }

    const currentTicketId = ticketId;
    const batch = Array.from(readyQueueRef.current).slice(0, 20);
    for (const id of batch) {
      readyQueueRef.current.delete(id);
      inFlightQueueRef.current.add(id);
    }

    Promise.resolve(
      markMessagesAsReadMutation.mutateAsync({
        ticketId: currentTicketId,
        messageIds: batch,
      }),
    )
      .then(() => {
        // Drop response if user navigated to a different ticket in the meantime
        if (ticketIdRef.current !== currentTicketId) return;

        for (const id of batch) {
          inFlightQueueRef.current.delete(id);
          committedMessageIdsRef.current.add(id);
          retryCountRef.current.delete(id);
        }

        // Schedule next batch if more messages are ready
        if (readyQueueRef.current.size > 0 && ticketIdRef.current === currentTicketId) {
          batchTimerRef.current = setTimeout(() => {
            flushPendingReadBatch.current();
          }, 200);
        }
      })
      .catch(() => {
        // Drop response if user navigated to a different ticket
        if (ticketIdRef.current !== currentTicketId) return;

        const eligibleForRetry: string[] = [];
        for (const id of batch) {
          inFlightQueueRef.current.delete(id);
          const attempts = (retryCountRef.current.get(id) ?? 0) + 1;
          retryCountRef.current.set(id, attempts);

          if (attempts <= 3) {
            readyQueueRef.current.add(id);
            eligibleForRetry.push(id);
          }
        }

        // Bounded retry with exponential delay: 1s, 2s, 4s (max 3 attempts)
        if (eligibleForRetry.length > 0 && !retryTimerRef.current && ticketIdRef.current === currentTicketId) {
          const maxAttempt = Math.max(
            ...eligibleForRetry.map((id) => retryCountRef.current.get(id) ?? 1),
          );
          const delayMs = Math.min(1000 * 2 ** (maxAttempt - 1), 4000);
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            flushPendingReadBatch.current();
          }, delayMs);
        }
      });
  });

  useEffect(() => {
    flushPendingReadBatch.current = () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }

      if (!ticketId || !isOpen || isAdminMode || readyQueueRef.current.size === 0) {
        return;
      }

      const currentTicketId = ticketId;
      const batch = Array.from(readyQueueRef.current).slice(0, 20);
      for (const id of batch) {
        readyQueueRef.current.delete(id);
        inFlightQueueRef.current.add(id);
      }

      Promise.resolve(
        markMessagesAsReadMutation.mutateAsync({
          ticketId: currentTicketId,
          messageIds: batch,
        }),
      )
        .then(() => {
          if (ticketIdRef.current !== currentTicketId) return;

          for (const id of batch) {
            inFlightQueueRef.current.delete(id);
            committedMessageIdsRef.current.add(id);
            retryCountRef.current.delete(id);
          }

          if (readyQueueRef.current.size > 0 && ticketIdRef.current === currentTicketId) {
            batchTimerRef.current = setTimeout(() => {
              flushPendingReadBatch.current();
            }, 200);
          }
        })
        .catch(() => {
          if (ticketIdRef.current !== currentTicketId) return;

          const eligibleForRetry: string[] = [];
          for (const id of batch) {
            inFlightQueueRef.current.delete(id);
            const attempts = (retryCountRef.current.get(id) ?? 0) + 1;
            retryCountRef.current.set(id, attempts);

            if (attempts <= 3) {
              readyQueueRef.current.add(id);
              eligibleForRetry.push(id);
            }
          }

          if (eligibleForRetry.length > 0 && !retryTimerRef.current && ticketIdRef.current === currentTicketId) {
            const maxAttempt = Math.max(
              ...eligibleForRetry.map((id) => retryCountRef.current.get(id) ?? 1),
            );
            const delayMs = Math.min(1000 * 2 ** (maxAttempt - 1), 4000);
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              flushPendingReadBatch.current();
            }, delayMs);
          }
        });
    };
  }, [ticketId, isOpen, isAdminMode, markMessagesAsReadMutation]);

  // Set up IntersectionObserver on trackable messages
  useEffect(() => {
    if (isAdminMode || !isOpen || !ticketId || typeof IntersectionObserver === "undefined") {
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) return;

    const currentTicketId = ticketId;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const msgId = entry.target.getAttribute("data-message-id");
          if (!msgId) continue;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            // Only observe if not already committed, in-flight, queued, or dwelling
            if (
              !committedMessageIdsRef.current.has(msgId) &&
              !inFlightQueueRef.current.has(msgId) &&
              !readyQueueRef.current.has(msgId) &&
              !dwellTimersRef.current.has(msgId)
            ) {
              const timer = setTimeout(() => {
                dwellTimersRef.current.delete(msgId);
                if (ticketIdRef.current !== currentTicketId) return;

                readyQueueRef.current.add(msgId);
                if (!batchTimerRef.current) {
                  batchTimerRef.current = setTimeout(() => {
                    flushPendingReadBatch.current();
                  }, 300);
                }
              }, 400);

              dwellTimersRef.current.set(msgId, timer);
            }
          } else {
            // User scrolled away before 400ms dwell completed -> cancel timer
            const existingTimer = dwellTimersRef.current.get(msgId);
            if (existingTimer) {
              clearTimeout(existingTimer);
              dwellTimersRef.current.delete(msgId);
            }
          }
        }
      },
      {
        root: container,
        threshold: 0.5,
      },
    );

    const trackableNodes = container.querySelectorAll<HTMLElement>(
      '[data-read-track="true"]',
    );
    trackableNodes.forEach((node) => {
      const msgId = node.getAttribute("data-message-id");
      if (
        msgId &&
        !committedMessageIdsRef.current.has(msgId) &&
        !inFlightQueueRef.current.has(msgId) &&
        !readyQueueRef.current.has(msgId)
      ) {
        observer.observe(node);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [ticket?.messages, isOpen, ticketId, isAdminMode]);

  const isSending =
    sendUserMessageMutation.isPending ||
    sendAdminMessageMutation.isPending ||
    uploading;

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (ticket?.messages && ticket.messages.length > 0) {
      if (typeof messagesEndRef.current?.scrollIntoView === "function") {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [ticket?.messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("حجم فایل انتخابی بیش از حد مجاز است (حداکثر ۵ مگابایت).");
      return;
    }
    setErrorMessage(null);
    setSelectedFile(file);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId || !replyText.trim()) return;

    setErrorMessage(null);

    try {
      let attachmentUrl: string | null = null;
      if (selectedFile) {
        setUploading(true);
        const uploadRes = await getSupportApi().uploadAttachment(selectedFile);
        attachmentUrl = uploadRes.attachment_url;
      }

      if (isAdminMode) {
        await sendAdminMessageMutation.mutateAsync({
          ticketId,
          body: replyText.trim(),
          attachmentUrl,
          isInternalNote,
        });
      } else {
        await sendUserMessageMutation.mutateAsync({
          ticketId,
          body: replyText.trim(),
          attachmentUrl,
        });
      }

      setReplyText("");
      setSelectedFile(null);
      setIsInternalNote(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      setErrorMessage(
        (err as Error)?.message || "ارسال پیام با خطا مواجه شد. لطفاً دوباره تلاش کنید.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleReopen = async () => {
    if (!ticketId) return;
    setErrorMessage(null);
    try {
      await reopenTicketMutation.mutateAsync(ticketId);
    } catch (err: unknown) {
      setErrorMessage((err as Error)?.message || "خطا در بازگشایی تیکت.");
    }
  };

  const handleAdminStatusChange = async (val: string | string[]) => {
    if (!ticketId) return;
    const newStatus = Array.isArray(val) ? val[0] : val;
    setErrorMessage(null);
    try {
      await updateStatusMutation.mutateAsync({ ticketId, status: newStatus });
    } catch (err: unknown) {
      setErrorMessage((err as Error)?.message || "خطا در تغییر وضعیت تیکت.");
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog isOpen={isOpen} onClose={onClose} hideHeader maxWidth="2xl">
      <div
        className="w-full max-h-[92vh] h-[85vh] flex flex-col p-0 overflow-hidden"
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                {ticket && (
                  <>
                    <Badge variant={getTicketStatusBadgeVariant(ticket.status)}>
                      {TICKET_STATUS_LABELS[ticket.status as TicketStatus] || ticket.status}
                    </Badge>
                    <Badge variant="neutral">
                      {TICKET_CATEGORY_LABELS[ticket.category as TicketCategory] || ticket.category}
                    </Badge>
                    <Badge variant={getPriorityBadgeVariant(ticket.priority)}>
                      اولویت: {TICKET_PRIORITY_LABELS[ticket.priority as TicketPriority] || ticket.priority}
                    </Badge>
                  </>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)] truncate">
                {ticket?.title || "در حال بارگذاری تیکت..."}
              </h2>
              {ticket && (
                <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)] mt-1">
                  <span>ثبت شده در: {formatPersianDateTime(ticket.createdAt)}</span>
                  {ticket.userName && (
                    <>
                      <span>•</span>
                      <span>کاربر: {ticket.userName} ({ticket.userEmail})</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Admin Status Dropdown in Header */}
            {isAdminMode && ticket && (
              <div className="shrink-0 w-36">
                <AvanaSelect
                  value={ticket.status}
                  onChange={handleAdminStatusChange}
                  options={[
                    { value: "open", label: "در انتظار بررسی" },
                    { value: "in_progress", label: "در حال بررسی" },
                    { value: "waiting_for_user", label: "منتظر کاربر" },
                    { value: "answered", label: "پاسخ داده شده" },
                    { value: "closed", label: "بستن تیکت" },
                  ]}
                />
              </div>
            )}
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="px-4 pt-3 shrink-0">
            <Alert variant="error" title="خطا">
              {errorMessage}
            </Alert>
          </div>
        )}

        {/* Messages List Area */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[var(--color-surface-warm)]/40"
        >
          {activeQuery.isLoading ? (
            <div className="h-full flex items-center justify-center">
              <LoadingState message="در حال بارگذاری پیام‌های پشتیبانی..." />
            </div>
          ) : !ticket?.messages || ticket.messages.length === 0 ? (
            <div className="text-center text-xs text-[var(--color-text-muted)] py-12">
              پیامی یافت نشد.
            </div>
          ) : (
            ticket.messages.map((msg) => {
              const isSupport = msg.senderRole === "admin";
              const isInternal = msg.isInternalNote;

              if (isInternal) {
                return (
                  <div
                    key={msg.id}
                    className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-950 dark:text-amber-200 text-xs my-2"
                  >
                    <div className="flex items-center justify-between mb-1 font-semibold text-amber-600 dark:text-amber-400">
                      <div className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" />
                        <span>یادداشت داخلی ادمین (غیرقابل مشاهده برای کاربر)</span>
                      </div>
                      <span className="text-[10px] text-amber-600/70 font-normal">
                        {formatPersianDateTime(msg.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed mt-1 text-xs">
                      {msg.body}
                    </p>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  data-read-track={!isAdminMode && isSupport && !isInternal ? "true" : undefined}
                  data-message-id={msg.id}
                  className={`flex flex-col ${
                    isSupport ? "items-start" : "items-end"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    {isSupport ? (
                      <>
                        <div className="w-5 h-5 rounded-full bg-[#008080]/15 text-[#008080] flex items-center justify-center">
                          <ShieldCheck className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-[11px] font-bold text-[#008080]">
                          پشتیبانی آوانا {msg.senderName ? `(${msg.senderName})` : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                          {msg.senderName || "شما"}
                        </span>
                        <div className="w-5 h-5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] flex items-center justify-center">
                          <User className="w-3 h-3" />
                        </div>
                      </>
                    )}
                    <span className="text-[10px] text-[var(--color-text-muted)] mx-1">
                      {formatPersianDateTime(msg.createdAt)}
                    </span>
                  </div>

                  <div
                    className={`max-w-[85%] sm:max-w-[75%] p-3.5 rounded-2xl text-sm leading-relaxed ${
                      isSupport
                        ? "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] rounded-tr-none shadow-sm"
                        : "bg-[var(--color-primary-default)] text-white rounded-tl-none shadow-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap font-sans text-xs sm:text-sm">
                      {msg.body}
                    </p>

                    {/* Attachment preview if present */}
                    {msg.attachmentUrl && (
                      <div className="mt-2.5 pt-2 border-t border-black/10 dark:border-white/10">
                        <SupportAttachmentAction
                          attachmentUrl={msg.attachmentUrl}
                          variant={isSupport ? "support" : "user"}
                          onError={(err) => setErrorMessage(err)}
                        />
                      </div>
                    )}

                    {/* Admin Read Receipt Badge - STRICTLY visible ONLY to admin on public admin messages */}
                    {isAdminMode && isSupport && !isInternal && (
                      <div
                        data-testid={`read-receipt-${msg.id}`}
                        className="mt-2 pt-1.5 border-t border-[var(--color-border)]/60 flex items-center justify-between gap-2 text-[10px] select-none"
                      >
                        <span className="text-[var(--color-text-muted)]">رسید خواندن:</span>
                        {msg.readAt ? (
                          <span
                            className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400"
                            title={`مشاهده شده در: ${formatPersianDateTime(msg.readAt)}`}
                          >
                            <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                            <span>دیده شده</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[var(--color-text-muted)]">
                            <Check className="w-3 h-3 shrink-0" />
                            <span>دیده نشده</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Closed Banner or Message Input Footer */}
        {ticket?.status === "closed" && !isAdminMode ? (
          <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>این تیکت بسته شده است. اگر مسئله همچنان ادامه دارد، می‌توانید آن را بازگشایی کنید.</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReopen}
              isLoading={reopenTicketMutation.isPending}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              className="shrink-0"
            >
              بازگشایی مجدد تیکت
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleSend}
            className="p-3 sm:p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0 space-y-2"
          >
            {/* Selected File Chip */}
            {selectedFile && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs text-[var(--color-text)]">
                <div className="flex items-center gap-2 truncate">
                  <Paperclip className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate font-medium">{selectedFile.name}</span>
                  <span className="text-[var(--color-text-muted)] text-[10px]">
                    ({(selectedFile.size / 1024).toFixed(0)} KB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-[var(--color-text-muted)] hover:text-red-500 transition-colors p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Admin Internal Note Toggle */}
            {isAdminMode && (
              <div className="flex items-center justify-between gap-3 pb-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold select-none text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={(e) => setIsInternalNote(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span>ثبت به عنوان یادداشت داخلی (مخفی از کاربر)</span>
                </label>

                {!isInternalNote && (
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                    <span>وضعیت پس از ارسال:</span>
                    <span className="font-semibold text-primary">پاسخ داده شده</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-end gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="hidden"
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending}
                title="پیوست فایل"
                className="p-2.5 shrink-0 rounded-xl"
              >
                <Paperclip className="w-4 h-4 text-[var(--color-text-muted)]" />
              </Button>

              <textarea
                rows={2}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={
                  isInternalNote
                    ? "یادداشت داخلی برای سایر همکاران و ادمین‌ها..."
                    : "پاسخ خود را بنویسید..."
                }
                className="flex-1 px-3 py-2 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none font-sans"
                disabled={isSending}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend(e);
                  }
                }}
              />

              <Button
                type="submit"
                variant={isInternalNote ? "secondary" : "primary"}
                isLoading={isSending}
                disabled={!replyText.trim() || isSending}
                className="shrink-0 px-3.5 py-2.5 rounded-xl h-auto"
                leftIcon={<Send className="w-4 h-4" />}
              >
                ارسال
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
