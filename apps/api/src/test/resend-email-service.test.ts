import { describe, expect, it, vi } from "vitest";
import {
  ResendEmailService,
  renderTicketReplyEmailHtml,
  resolveEmailLogoUrl,
  isValidEmailHttpsUrl,
} from "../modules/identity/email-service.js";
import { emailTokens } from "../modules/identity/email-tokens.js";

describe("ResendEmailService Unit Tests", () => {
  it("throws during construction if API key is empty", () => {
    expect(() => new ResendEmailService("")).toThrow(
      "ResendEmailService requires a valid RESEND_API_KEY",
    );
  });

  it("sends email with correct headers, payload, and Persian templates", async () => {
    const apiKey = "re_test_key_12345";
    const fromEmail = "AVANA <onboarding@resend.dev>";
    const recipient = "User@Example.COM";
    const code = "789012";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: "msg_12345" })),
    });

    const service = new ResendEmailService(apiKey, fromEmail, mockFetch as unknown as typeof fetch);
    await service.sendVerificationCode(recipient, code);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];

    expect(url).toBe("https://api.resend.com/emails");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    });

    const body = JSON.parse(options.body);
    expect(body.from).toBe("AVANA <onboarding@resend.dev>");
    expect(body.to).toEqual(["user@example.com"]);
    expect(body.subject).toBe("کد تأیید ایمیل آوانا");

    // HTML template assertions
    expect(body.html).toContain(code);
    expect(body.html).toContain("آوانا");
    expect(body.html).toContain("۱۰ دقیقه");

    // AVANA Light-First Design System assertions
    expect(body.html).toContain('background-color: #F7F9FA');
    expect(body.html).toContain('background-color: #FFFFFF');
    expect(body.html).toContain('border: 1px solid #E2E7EA');
    expect(body.html).toContain('Estedad');
    expect(body.html).toContain('dir="rtl"');
    expect(body.html).toContain('/brand/avana-logo.png');
    expect(body.html).toContain('direction: ltr; unicode-bidi: embed;');

    // Regression checks: legacy dark theme and emojis must NOT exist
    expect(body.html).not.toContain("#0b1120");
    expect(body.html).not.toContain("#1e293b");
    expect(body.html).not.toContain("#0f172a");
    expect(body.html).not.toContain("#2dd4bf");
    expect(body.html).not.toContain("#14b8a6");
    expect(body.html).not.toContain("#0d9488");
    expect(body.html).not.toContain("✨");
    expect(body.html).not.toContain("🔐");

    // Plain text template assertions
    expect(body.text).toContain(code);
    expect(body.text).toContain("برای تأیید ایمیل خود در آوانا، کد زیر را وارد کنید");
  });

  it("sends password reset email with canonical button, logo, and safe escaping", async () => {
    const apiKey = "re_test_key_12345";
    const fromEmail = "AVANA <onboarding@resend.dev>";
    const recipient = "Student@Example.COM";
    const resetUrl = "https://aavana.ir/reset-password?token=sample-reset-token-value&test=1";

    let capturedBody: Record<string, unknown> = {};
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ id: "msg_reset_123" })),
      } as Response;
    });

    const service = new ResendEmailService(
      apiKey,
      fromEmail,
      mockFetch as unknown as typeof fetch,
      "https://aavana.ir",
    );
    await service.sendPasswordResetEmail(recipient, resetUrl);

    expect(capturedBody.from).toBe("AVANA <onboarding@resend.dev>");
    expect(capturedBody.to).toEqual(["student@example.com"]);
    expect(capturedBody.subject).toBe("بازیابی رمز عبور آوانا");

    const html = capturedBody.html as string;
    expect(html).toContain("بازیابی رمز عبور");
    expect(html).toContain("ایجاد رمز عبور جدید");
    expect(html).toContain("۱۵ دقیقه");
    expect(html).toContain(emailTokens.assets.canonicalLogoUrl);
    expect(html).toContain("#008080");
    expect(html).toContain("#F7F9FA");
    expect(html).toContain("#FFFFFF");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("Estedad");

    // Regression checks
    expect(html).not.toContain("#0b1120");
    expect(html).not.toContain("#1e293b");
    expect(html).not.toContain("✨");
    expect(html).not.toContain("🔐");

    const text = capturedBody.text as string;
    expect(text).toContain(resetUrl);
    expect(text).toContain("۱۵ دقیقه");
    expect(text).toContain("آوانا - سامانه هوشمند آموزش و یادگیری");
  });

  it("throws descriptive error when Resend API responds with error status", async () => {
    const apiKey = "re_test_key_12345";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve(JSON.stringify({ message: "Domain not verified" })),
    });

    const service = new ResendEmailService(apiKey, "AVANA <onboarding@resend.dev>", mockFetch as unknown as typeof fetch);

    await expect(
      service.sendVerificationCode("test@example.com", "123456"),
    ).rejects.toThrow("Resend API email delivery failed (403):");
  });

  it("sends support ticket reply email with clean button, Persian RTL text, and mobile-ready design", async () => {
    const apiKey = "re_test_key_12345";
    const fromEmail = "AVANA <support@aavana.ir>";
    const recipient = "User@Example.Com";
    const ticketId = "11111111-2222-3333-4444-555555555555";
    const ticketTitle = "مشکل در ورود به جلسه آنلاین";

    let capturedBody: Record<string, unknown> = {};
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ id: "msg_reply_123" })),
      } as Response;
    });

    const service = new ResendEmailService(
      apiKey,
      fromEmail,
      mockFetch as unknown as typeof fetch,
      "https://aavana.ir",
    );

    await service.sendTicketReplyEmail({
      email: recipient,
      ticketId,
      ticketTitle,
      appUrl: "https://aavana.ir",
    });

    expect(capturedBody.from).toBe("AVANA <support@aavana.ir>");
    expect(capturedBody.to).toEqual(["user@example.com"]);
    expect(capturedBody.subject).toBe("پاسخ جدید تیم پشتیبانی آوانا");

    const html = capturedBody.html as string;
    expect(html).toContain("پاسخ جدید تیم پشتیبانی آوانا");
    expect(html).toContain("تیم پشتیبانی آوانا به درخواست شما");
    expect(html).toContain("مشاهده پاسخ پشتیبانی");
    expect(html).toContain(`ticketId=${ticketId}`);
    expect(html).toContain("https://aavana.ir/account/support?tab=my_requests&amp;ticketId=");
    expect(html).toContain('dir="rtl"');

    // Regression & security check: Private ticket details or internal notes must not leak into the email
    expect(html).not.toContain("رمز عبور");
    expect(html).not.toContain("internal_note");

    const text = capturedBody.text as string;
    expect(text).toContain("تیم پشتیبانی آوانا به درخواست شما");
    expect(text).toContain("مشکل در ورود به جلسه آنلاین");
    expect(text).toContain("پاسخ داده است.");
    expect(text).toContain(`https://aavana.ir/account/support?tab=my_requests&ticketId=${ticketId}`);
    expect(text).toContain("مشاهده پاسخ پشتیبانی");
    expect(text).toContain("تیم پشتیبانی آوانا");
  });

  describe("Email Logo URL Resolution & Validation Suite (9 Scenarios)", () => {
    // 1. Valid HTTPS URL
    it("(1) accepts valid absolute HTTPS URLs without modification or injection", () => {
      const validUrl = "https://cdn.example.com/assets/logo.png";
      expect(isValidEmailHttpsUrl(validUrl)).toBe(true);
      expect(resolveEmailLogoUrl(undefined, validUrl)).toBe(validUrl);
    });

    // 2. URL without protocol
    it("(2) rejects URLs without protocol and safely falls back to canonical official logo", () => {
      const noProto = "cdn.jsdelivr.net/gh/ali24ops-s/AVANA/logo.png";
      expect(isValidEmailHttpsUrl(noProto)).toBe(false);
      expect(resolveEmailLogoUrl(undefined, noProto)).toBe(emailTokens.assets.canonicalLogoUrl);
    });

    // 3. URL with HTTP
    it("(3) rejects insecure HTTP URLs and falls back to canonical official logo", () => {
      const httpUrl = "http://insecure-cdn.example.com/logo.png";
      expect(isValidEmailHttpsUrl(httpUrl)).toBe(false);
      expect(resolveEmailLogoUrl(undefined, httpUrl)).toBe(emailTokens.assets.canonicalLogoUrl);
    });

    // 4. URL containing quotes or injection characters
    it("(4) rejects URLs with quotes, angle brackets, newlines, or spaces", () => {
      const maliciousCases = [
        'https://example.com/logo.png" onload="alert(1)',
        'https://example.com/logo.png\'>',
        'https://example.com/logo.png<script>',
        'https://example.com/logo .png',
        'https://example.com/logo.png\n',
      ];

      for (const badUrl of maliciousCases) {
        expect(isValidEmailHttpsUrl(badUrl)).toBe(false);
        expect(resolveEmailLogoUrl(undefined, badUrl)).toBe(emailTokens.assets.canonicalLogoUrl);
      }
    });

    // 5. URL with username/password credentials
    it("(5) rejects URLs containing embedded credentials (user:pass)", () => {
      // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth
      const userPassUrl = "https://admin:secret123@cdn.example.com/logo.png";
      const userOnlyUrl = "https://admin@cdn.example.com/logo.png";
      expect(isValidEmailHttpsUrl(userPassUrl)).toBe(false);
      expect(isValidEmailHttpsUrl(userOnlyUrl)).toBe(false);
      expect(resolveEmailLogoUrl(undefined, userPassUrl)).toBe(emailTokens.assets.canonicalLogoUrl);
      expect(resolveEmailLogoUrl(undefined, userOnlyUrl)).toBe(emailTokens.assets.canonicalLogoUrl);
    });

    // 6. Invalid ENV value
    it("(6) rejects invalid AVANA_EMAIL_LOGO_URL in process.env and falls back to canonical official logo", () => {
      const originalEnv = process.env.AVANA_EMAIL_LOGO_URL;
      try {
        process.env.AVANA_EMAIL_LOGO_URL = "http://not-secure.com/logo.png";
        expect(resolveEmailLogoUrl()).toBe(emailTokens.assets.canonicalLogoUrl);

        process.env.AVANA_EMAIL_LOGO_URL = "malicious\"onclick=\"steal()";
        expect(resolveEmailLogoUrl()).toBe(emailTokens.assets.canonicalLogoUrl);

        process.env.AVANA_EMAIL_LOGO_URL = "   ";
        expect(resolveEmailLogoUrl()).toBe(emailTokens.assets.canonicalLogoUrl);
      } finally {
        if (originalEnv !== undefined) {
          process.env.AVANA_EMAIL_LOGO_URL = originalEnv;
        } else {
          delete process.env.AVANA_EMAIL_LOGO_URL;
        }
      }
    });

    // 7. Invalid custom URL parameter
    it("(7) rejects invalid custom logoUrl argument and falls back to canonical official logo", () => {
      const invalidCustoms = ["javascript:alert(1)", "ftp://files.example.com/logo.png", "   ", ""];
      for (const invalid of invalidCustoms) {
        expect(resolveEmailLogoUrl("https://aavana.ir", invalid)).toBe(
          emailTokens.assets.canonicalLogoUrl,
        );
      }
    });

    // 8. Missing appUrl parameter
    it("(8) handles missing or undefined appUrl safely without broken links or errors", () => {
      const renderedHtmlNoAppUrl = renderTicketReplyEmailHtml("TKT-200", "راهنمایی");
      expect(renderedHtmlNoAppUrl).toContain(emailTokens.assets.canonicalLogoUrl);
      expect(renderedHtmlNoAppUrl).toContain('alt="آوانا | AVANA"');
      expect(renderedHtmlNoAppUrl).toContain('width="120"');
      expect(renderedHtmlNoAppUrl).toContain('height="81"');

      const renderedHtmlLocalhost = renderTicketReplyEmailHtml(
        "TKT-200",
        "راهنمایی",
        "http://localhost:5173",
      );
      expect(renderedHtmlLocalhost).toContain(emailTokens.assets.canonicalLogoUrl);
      expect(renderedHtmlLocalhost).not.toContain("localhost:5173/brand/avana-logo.png");
    });

    // 9. Fallback to official pinned immutable commit URL
    it("(9) canonical official fallback is pinned to immutable verified commit SHA", () => {
      const canonical = emailTokens.assets.canonicalLogoUrl;
      expect(canonical).toContain("98bb57f54dc101f3290f88a3e5e3553d709a6829");
      expect(canonical).toContain("/apps/web/public/brand/avana-logo.png");
      expect(canonical.startsWith("https://cdn.jsdelivr.net/gh/ali24ops-s/AVANA@")).toBe(true);
      expect(isValidEmailHttpsUrl(canonical)).toBe(true);
    });
  });
});


