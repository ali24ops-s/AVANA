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

interface TelegramApiResponse {
  ok: boolean;
  result?: {
    message_id?: number;
    [key: string]: unknown;
  };
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

      return {
        sent: true,
        messageId: parsed.result?.message_id,
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
}
