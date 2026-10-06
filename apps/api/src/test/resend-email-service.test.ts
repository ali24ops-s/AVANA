import { describe, expect, it, vi } from "vitest";
import { ResendEmailService } from "../modules/identity/email-service.js";

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
    expect(html).toContain("https://aavana.ir/brand/avana-logo.png");
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
});

