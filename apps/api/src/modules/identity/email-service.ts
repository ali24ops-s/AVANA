export interface SendTicketReplyEmailInput {
  email: string;
  ticketId: string;
  ticketTitle: string;
  appUrl?: string;
}

export interface EmailService {
  sendVerificationCode(email: string, code: string): Promise<void>;
  sendPasswordResetEmail(email: string, resetUrl: string): Promise<void>;
  sendTicketReplyEmail?(input: SendTicketReplyEmailInput): Promise<void>;
}

export class MockEmailService implements EmailService {
  public sentEmails: Array<{ email: string; code: string; sentAt: Date }> = [];
  public sentPasswordResetEmails: Array<{
    email: string;
    resetUrl: string;
    sentAt: Date;
  }> = [];
  public sentTicketReplyEmails: Array<{
    email: string;
    ticketId: string;
    ticketTitle: string;
    appUrl?: string;
    sentAt: Date;
  }> = [];

  async sendVerificationCode(email: string, code: string): Promise<void> {
    this.sentEmails.push({
      email: email.trim().toLowerCase(),
      code,
      sentAt: new Date(),
    });
  }

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    this.sentPasswordResetEmails.push({
      email: email.trim().toLowerCase(),
      resetUrl,
      sentAt: new Date(),
    });
  }

  async sendTicketReplyEmail(input: SendTicketReplyEmailInput): Promise<void> {
    this.sentTicketReplyEmails.push({
      email: input.email.trim().toLowerCase(),
      ticketId: input.ticketId,
      ticketTitle: input.ticketTitle,
      appUrl: input.appUrl,
      sentAt: new Date(),
    });
  }

  getLastCodeFor(email: string): string | undefined {
    const norm = email.trim().toLowerCase();
    const matches = this.sentEmails.filter((e) => e.email === norm);
    return matches[matches.length - 1]?.code;
  }

  getLastResetUrlFor(email: string): string | undefined {
    const norm = email.trim().toLowerCase();
    const matches = this.sentPasswordResetEmails.filter((e) => e.email === norm);
    return matches[matches.length - 1]?.resetUrl;
  }

  getLastResetTokenFor(email: string): string | undefined {
    const url = this.getLastResetUrlFor(email);
    if (!url) return undefined;
    try {
      const parsed = new URL(url);
      return parsed.searchParams.get("token") || undefined;
    } catch {
      const match = url.match(/[?&]token=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : undefined;
    }
  }

  clear(): void {
    this.sentEmails = [];
    this.sentPasswordResetEmails = [];
  }
}

import {
  renderVerificationEmailHtml,
  renderVerificationEmailText,
  renderPasswordResetHtml,
  renderPasswordResetText,
  renderTicketReplyEmailHtml,
  renderTicketReplyEmailText,
} from "./email-templates.js";

export {
  renderVerificationEmailHtml,
  renderVerificationEmailText,
  renderPasswordResetHtml,
  renderPasswordResetText,
  renderTicketReplyEmailHtml,
  renderTicketReplyEmailText,
} from "./email-templates.js";
export { emailTokens } from "./email-tokens.js";
export {
  renderEmailLayout,
  renderEmailButton,
  renderEmailCodeBox,
  renderEmailDivider,
  escapeHtml,
  sanitizeUrl,
  resolvePublicAppUrl,
  resolveEmailLogoUrl,
  isValidEmailHttpsUrl,
} from "./email-layout.js";

// Backward-compatible alias functions for any direct legacy imports
export function generatePersianEmailHtml(code: string, appUrl?: string): string {
  return renderVerificationEmailHtml(code, appUrl);
}

export function generatePersianEmailText(code: string): string {
  return renderVerificationEmailText(code);
}

export function generatePersianPasswordResetHtml(
  resetUrl: string,
  appUrl?: string,
): string {
  return renderPasswordResetHtml(resetUrl, appUrl);
}

export function generatePersianPasswordResetText(resetUrl: string): string {
  return renderPasswordResetText(resetUrl);
}

export class ResendEmailService implements EmailService {
  constructor(
    private readonly apiKey: string,
    private readonly fromEmail: string = "AVANA <onboarding@resend.dev>",
    private readonly fetchImpl = globalThis.fetch,
    private readonly appUrl?: string,
  ) {
    if (!apiKey) {
      throw new Error("ResendEmailService requires a valid RESEND_API_KEY");
    }
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    const to = email.trim().toLowerCase();
    const subject = "کد تأیید ایمیل آوانا";
    const html = renderVerificationEmailHtml(code, this.appUrl);
    const text = renderVerificationEmailText(code);

    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Resend API email delivery failed (${response.status}): ${errorBody}`,
      );
    }
  }

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    const to = email.trim().toLowerCase();
    const subject = "بازیابی رمز عبور آوانا";
    const html = renderPasswordResetHtml(resetUrl, this.appUrl);
    const text = renderPasswordResetText(resetUrl);

    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Resend API email delivery failed (${response.status}): ${errorBody}`,
      );
    }
  }

  async sendTicketReplyEmail(input: SendTicketReplyEmailInput): Promise<void> {
    const to = input.email.trim().toLowerCase();
    const subject = "پاسخ جدید تیم پشتیبانی آوانا";
    const appUrl = input.appUrl ?? this.appUrl;
    const html = renderTicketReplyEmailHtml(input.ticketId, input.ticketTitle, appUrl);
    const text = renderTicketReplyEmailText(input.ticketId, input.ticketTitle, appUrl);

    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Resend API email delivery failed (${response.status}): ${errorBody}`,
      );
    }
  }
}

