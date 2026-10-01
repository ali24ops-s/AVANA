export interface EmailService {
  sendVerificationCode(email: string, code: string): Promise<void>;
  sendPasswordResetEmail(email: string, resetUrl: string): Promise<void>;
}

export class MockEmailService implements EmailService {
  public sentEmails: Array<{ email: string; code: string; sentAt: Date }> = [];
  public sentPasswordResetEmails: Array<{
    email: string;
    resetUrl: string;
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

function generatePersianEmailHtml(code: string): string {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>کد تأیید ایمیل آوانا</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b1120; font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9; direction: rtl; text-align: right;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b1120; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #1e293b; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
          <!-- Header Banner -->
          <tr>
            <td style="padding: 32px 32px 16px 32px; text-align: center;">
              <div style="display: inline-block; width: 48px; height: 48px; background-color: rgba(45, 212, 191, 0.15); border: 1px solid rgba(45, 212, 191, 0.3); border-radius: 16px; line-height: 48px; font-size: 24px; color: #2dd4bf; margin-bottom: 16px;">
                ✨
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #2dd4bf; letter-spacing: -0.5px;">آوانا</h1>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8; font-weight: 500;">سامانه هوشمند آموزش و یادگیری</p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 16px 32px 32px 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #ffffff;">تأیید نشانی ایمیل</h2>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
                سلام،<br>
                برای تأیید حساب کاربری خود در آوانا، کد ۶ رقمی زیر را وارد کنید:
              </p>

              <!-- Code Box -->
              <div style="background-color: #0f172a; border: 1px solid #14b8a6; border-radius: 14px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <span style="font-family: SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace; font-size: 32px; font-weight: 800; letter-spacing: 10px; color: #2dd4bf; display: inline-block; direction: ltr;">${code}</span>
              </div>

              <p style="margin: 0 0 24px 0; font-size: 13px; color: #94a3b8; text-align: center;">
                ⏱️ این کد به مدت <strong>۱۰ دقیقه</strong> اعتبار دارد.
              </p>

              <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 24px 0;">

              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.6; text-align: center;">
                اگر این درخواست توسط شما انجام نشده است، می‌توانید این ایمیل را نادیده بگیرید.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0f172a; padding: 16px 32px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.05);">
              <p style="margin: 0; font-size: 11px; color: #475569;">
                AVANA Platform — All rights reserved
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function generatePersianEmailText(code: string): string {
  return `سلام،

برای تأیید ایمیل خود در آوانا، کد زیر را وارد کنید:

${code}

این کد ۱۰ دقیقه اعتبار دارد.

اگر این درخواست توسط شما انجام نشده است، می‌توانید این ایمیل را نادیده بگیرید.

آوانا - سامانه هوشمند آموزش و یادگیری`;
}

function generatePersianPasswordResetHtml(resetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>بازیابی رمز عبور آوانا</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b1120; font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9; direction: rtl; text-align: right;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b1120; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #1e293b; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
          <!-- Header Banner -->
          <tr>
            <td style="padding: 32px 32px 16px 32px; text-align: center;">
              <div style="display: inline-block; width: 48px; height: 48px; background-color: rgba(45, 212, 191, 0.15); border: 1px solid rgba(45, 212, 191, 0.3); border-radius: 16px; line-height: 48px; font-size: 24px; color: #2dd4bf; margin-bottom: 16px;">
                🔐
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #2dd4bf; letter-spacing: -0.5px;">آوانا</h1>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8; font-weight: 500;">سامانه هوشمند آموزش و یادگیری</p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 16px 32px 32px 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #ffffff;">بازیابی رمز عبور</h2>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
                سلام،<br>
                درخواستی برای تغییر و ایجاد رمز عبور جدید برای حساب کاربری شما در آوانا ثبت شده است. برای تنظیم رمز عبور جدید، روی دکمه زیر کلیک کنید:
              </p>

              <!-- Action Button -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetUrl}" target="_blank" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);">
                  ایجاد رمز عبور جدید
                </a>
              </div>

              <p style="margin: 0 0 24px 0; font-size: 13px; color: #94a3b8; text-align: center;">
                ⏱️ این لینک به مدت <strong>۱۵ دقیقه</strong> معتبر است.
              </p>

              <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 24px 0;">

              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.6; text-align: center;">
                اگر این درخواست توسط شما ارسال نشده است، لطفاً این ایمیل را نادیده بگیرید. رمز عبور فعلی شما بدون تغییر باقی خواهد ماند.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0f172a; padding: 16px 32px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.05);">
              <p style="margin: 0; font-size: 11px; color: #475569;">
                AVANA Platform — All rights reserved
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function generatePersianPasswordResetText(resetUrl: string): string {
  return `سلام،

درخواستی برای تغییر رمز عبور حساب کاربری شما در آوانا دریافت شده است.

برای ایجاد رمز عبور جدید، از پیوند زیر استفاده کنید:
${resetUrl}

این پیوند به مدت ۱۵ دقیقه اعتبار دارد.

اگر این درخواست توسط شما انجام نشده است، لطفاً این پیام را نادیده بگیرید؛ رمز عبور فعلی شما تغییری نخواهد کرد.

آوانا - سامانه هوشمند آموزش و یادگیری`;
}

export class ResendEmailService implements EmailService {
  constructor(
    private readonly apiKey: string,
    private readonly fromEmail: string = "AVANA <onboarding@resend.dev>",
    private readonly fetchImpl = globalThis.fetch,
  ) {
    if (!apiKey) {
      throw new Error("ResendEmailService requires a valid RESEND_API_KEY");
    }
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    const to = email.trim().toLowerCase();
    const subject = "کد تأیید ایمیل آوانا";
    const html = generatePersianEmailHtml(code);
    const text = generatePersianEmailText(code);

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
    const html = generatePersianPasswordResetHtml(resetUrl);
    const text = generatePersianPasswordResetText(resetUrl);

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
