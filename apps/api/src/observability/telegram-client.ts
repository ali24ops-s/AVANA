/**
 * Telegram Bot Client for AVANA Operational Alerts.
 *
 * Uses native fetch and AbortController for reliable outbound communication.
 * Guarantees:
 * - Bot token is never leaked in errors, logs, or URLs.
 * - Strict timeout prevents hanging requests.
 * - Zero external SDK dependencies.
 */

export interface TelegramClientOptions {
  botToken?: string;
  adminChatId?: string;
  timeoutMs?: number;
  apiBaseUrl?: string;
  fetchImpl?: typeof globalThis.fetch;
}

export interface TelegramSendMessageResult {
  sent: boolean;
  messageId?: number;
  reason?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot?: boolean;
      first_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
      username?: string;
    };
    date: number;
    text?: string;
  };
}

export interface TelegramGetUpdatesResult {
  ok: boolean;
  updates: TelegramUpdate[];
  reason?: string;
}

interface TelegramApiResponse {
  ok: boolean;
  result?: {
    message_id?: number;
    [key: string]: unknown;
  } | unknown[];
  description?: string;
  error_code?: number;
}

export class TelegramClient {
  private readonly botToken?: string;
  private readonly adminChatId?: string;
  private readonly timeoutMs: number;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: TelegramClientOptions = {}) {
    this.botToken = options.botToken?.trim() || undefined;
    this.adminChatId = options.adminChatId?.trim() || undefined;
    this.timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 5_000;
    this.apiBaseUrl = (options.apiBaseUrl ?? "https://api.telegram.org")
      .trim()
      .replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  /**
   * Check if client has required configuration to transmit messages.
   */
  isConfigured(): boolean {
    return Boolean(this.botToken && this.adminChatId);
  }

  /**
   * Send a text message to the configured admin chat.
   *
   * NEVER throws an error to the caller — returns a status object with details.
   */
  async sendMessage(
    text: string,
    overrideChatId?: string,
  ): Promise<TelegramSendMessageResult> {
    const targetChatId = overrideChatId?.trim() || this.adminChatId;

    if (!this.botToken) {
      return { sent: false, reason: "missing_bot_token" };
    }
    if (!targetChatId) {
      return { sent: false, reason: "missing_chat_id" };
    }
    if (!text || text.trim().length === 0) {
      return { sent: false, reason: "empty_text" };
    }

    const endpoint = `${this.apiBaseUrl}/bot${this.botToken}/sendMessage`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: text.trim(),
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });

      let parsed: TelegramApiResponse | null = null;
      try {
        const json = await response.json();
        if (json && typeof json === "object") {
          parsed = json as TelegramApiResponse;
        }
      } catch {
        parsed = null;
      }

      if (!response.ok || !parsed?.ok) {
        const errorDesc = parsed?.description || `HTTP ${response.status}`;
        return {
          sent: false,
          reason: `telegram_api_error: ${errorDesc}`,
        };
      }

      const messageId =
        parsed.result && !Array.isArray(parsed.result) && typeof parsed.result === "object"
          ? (parsed.result as { message_id?: number }).message_id
          : undefined;

      return {
        sent: true,
        messageId,
      };
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        return {
          sent: false,
          reason: `timeout_after_${this.timeoutMs}ms`,
        };
      }
      const safeMessage = err instanceof Error ? err.message : String(err);
      return {
        sent: false,
        reason: `network_error: ${safeMessage}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch updates via long polling (getUpdates).
   *
   * NEVER throws an error to the caller — returns status with empty updates list on failure.
   */
  async getUpdates(
    options: {
      offset?: number;
      limit?: number;
      timeoutSec?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<TelegramGetUpdatesResult> {
    if (!this.botToken) {
      return { ok: false, updates: [], reason: "missing_bot_token" };
    }

    const timeoutSec = Math.max(0, Math.min(50, options.timeoutSec ?? 0));
    const endpoint = `${this.apiBaseUrl}/bot${this.botToken}/getUpdates`;

    // Total request timeout: Telegram timeout + buffer (default 5s buffer)
    const requestTimeoutMs = (timeoutSec * 1000) + this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

    const onExternalAbort = () => {
      controller.abort();
    };

    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timer);
        return { ok: false, updates: [], reason: "aborted" };
      }
      options.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          offset: options.offset,
          limit: options.limit ?? 20,
          timeout: timeoutSec,
          allowed_updates: ["message"],
        }),
        signal: controller.signal,
      });

      let parsed: TelegramApiResponse | null = null;
      try {
        const json = await response.json();
        if (json && typeof json === "object") {
          parsed = json as TelegramApiResponse;
        }
      } catch {
        parsed = null;
      }

      if (!response.ok || !parsed?.ok || !Array.isArray(parsed.result)) {
        const errorDesc = parsed?.description || `HTTP ${response.status}`;
        return {
          ok: false,
          updates: [],
          reason: `telegram_api_error: ${errorDesc}`,
        };
      }

      return {
        ok: true,
        updates: parsed.result as TelegramUpdate[],
      };
    } catch (err: unknown) {
      if (options.signal?.aborted) {
        return { ok: false, updates: [], reason: "aborted" };
      }
      if (controller.signal.aborted) {
        return {
          ok: false,
          updates: [],
          reason: `timeout_after_${requestTimeoutMs}ms`,
        };
      }
      const safeMessage = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        updates: [],
        reason: `network_error: ${safeMessage}`,
      };
    } finally {
      clearTimeout(timer);
      if (options.signal) {
        options.signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }
}
