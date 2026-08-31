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

    // Plain text template assertions
    expect(body.text).toContain(code);
    expect(body.text).toContain("برای تأیید ایمیل خود در آوانا، کد زیر را وارد کنید");
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
