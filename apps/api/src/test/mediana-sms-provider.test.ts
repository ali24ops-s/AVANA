import { describe, it, expect } from "vitest";
import {
  MedianaSmsProvider,
  formatMedianaRecipient,
  maskPhoneNumberForLogs,
} from "../modules/identity/sms-service.js";

describe("MedianaSmsProvider (OpenAPI 3.0 Mediana OTP Integration)", () => {
  const DEFAULT_API_KEY = "test_mediana_api_key_12345678";
  const DEFAULT_PATTERN_CODE = "otp_login_pattern_99";
  const DEFAULT_API_URL = "https://api.mediana.ir";

  describe("Configuration & Instantiation", () => {
    it("throws if apiKey is missing or empty", () => {
      expect(() => {
        new MedianaSmsProvider({
          apiKey: "",
          patternCode: DEFAULT_PATTERN_CODE,
        });
      }).toThrow("MEDIANA_API_KEY is required");

      expect(() => {
        new MedianaSmsProvider({
          apiKey: "   ",
          patternCode: DEFAULT_PATTERN_CODE,
        });
      }).toThrow("MEDIANA_API_KEY is required");
    });

    it("throws if patternCode is missing or empty", () => {
      expect(() => {
        new MedianaSmsProvider({
          apiKey: DEFAULT_API_KEY,
          patternCode: "",
        });
      }).toThrow("MEDIANA_PATTERN_CODE is required");

      expect(() => {
        new MedianaSmsProvider({
          apiKey: DEFAULT_API_KEY,
          patternCode: "   ",
        });
      }).toThrow("MEDIANA_PATTERN_CODE is required");
    });

    it("allows instantiation with valid options", () => {
      const provider = new MedianaSmsProvider({
        apiKey: DEFAULT_API_KEY,
        patternCode: DEFAULT_PATTERN_CODE,
      });
      expect(provider).toBeDefined();
    });
  });

  describe("Recipient Formatting & Masking", () => {
    it("preserves canonical +989123456789 format", () => {
      expect(formatMedianaRecipient("+989123456789")).toBe("+989123456789");
    });

    it("formats 00989123456789 to canonical +989123456789", () => {
      expect(formatMedianaRecipient("00989123456789")).toBe("+989123456789");
    });

    it("formats 09123456789 to canonical +989123456789", () => {
      expect(formatMedianaRecipient("09123456789")).toBe("+989123456789");
    });

    it("formats 10-digit 9123456789 to canonical +989123456789", () => {
      expect(formatMedianaRecipient("9123456789")).toBe("+989123456789");
    });

    it("converts Persian digits and strips formatting characters to canonical", () => {
      expect(formatMedianaRecipient("+۹۸ ۹۱۲ ۳۴۵ ۶۷۸۹")).toBe("+989123456789");
      expect(formatMedianaRecipient("۰۹۱۲-۳۴۵-۶۷۸۹")).toBe("+989123456789");
    });

    it("masks phone numbers properly for safe diagnostics", () => {
      expect(maskPhoneNumberForLogs("09123456789")).toBe("0912***89");
      expect(maskPhoneNumberForLogs("+989123456789")).toBe("+98912***89");
      expect(maskPhoneNumberForLogs("123")).toBe("***");
    });
  });

  describe("Successful OTP SMS Delivery", () => {
    it("sends correct HTTP POST request to /sms/v1/send/otp with canonical recipient", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      const mockFetch: typeof globalThis.fetch = async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;

        const responseData = {
          meta: {
            code: "200",
            errorMessage: null,
            errors: [],
          },
          data: {
            Succeed: true,
            RequestId: 987654321,
            RequestCode: "REQ_987654321",
            Message: "پیام در صف ارسال قرار گرفت",
            Status: "SendingInProgress",
            SmsItems: [
              {
                SmsItemId: "+989123456789_987654321",
                Recipient: "+989123456789",
              },
            ],
          },
        };

        return new Response(JSON.stringify(responseData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const provider = new MedianaSmsProvider({
        apiKey: DEFAULT_API_KEY,
        patternCode: DEFAULT_PATTERN_CODE,
        apiUrl: DEFAULT_API_URL,
        fetchImpl: mockFetch,
      });

      await expect(
        provider.sendVerificationCode({
          phoneNumber: "+989123456789",
          code: "582194",
        }),
      ).resolves.toBeUndefined();

      expect(capturedUrl).toBe("https://api.mediana.ir/sms/v1/send/otp");
      expect(capturedInit?.method).toBe("POST");

      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers["X-API-KEY"]).toBe(DEFAULT_API_KEY);
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["Accept"]).toBe("application/json");

      const body = JSON.parse(String(capturedInit?.body));
      expect(body).toEqual({
        patternCode: DEFAULT_PATTERN_CODE,
        recipient: "+989123456789",
        otpCode: "582194",
      });
    });
  });

  describe("Error Handling & Edge Cases", () => {
    it("throws if input phone number or code is empty", async () => {
      const provider = new MedianaSmsProvider({
        apiKey: DEFAULT_API_KEY,
        patternCode: DEFAULT_PATTERN_CODE,
      });

      await expect(
        provider.sendVerificationCode({
          phoneNumber: "",
          code: "123456",
        }),
      ).rejects.toThrow("Phone number is required");

      await expect(
        provider.sendVerificationCode({
          phoneNumber: "+989123456789",
          code: "",
        }),
      ).rejects.toThrow("OTP code is required");
    });

    it("rejects when HTTP 200 returns business error (Succeed: false)", async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        const responseData = {
          meta: {
            code: "1047",
            errorMessage: "شماره تلفن در لیست سیاه قرار دارد",
            errors: [],
          },
          data: {
            Succeed: false,
            RequestId: 12345,
            RequestCode: "REQ_12345",
            Message: "ارسال ناموفق بود",
            Status: "Failed",
            SmsItems: [],
          },
        };
        return new Response(JSON.stringify(responseData), { status: 200 });
      };

      const provider = new MedianaSmsProvider({
        apiKey: DEFAULT_API_KEY,
        patternCode: DEFAULT_PATTERN_CODE,
        fetchImpl: mockFetch,
      });

      await expect(
        provider.sendVerificationCode({
          phoneNumber: "+989123456789",
          code: "123456",
        }),
      ).rejects.toThrow(/Mediana SMS delivery rejected.*لیست سیاه/);
    });

    it("rejects on HTTP 400 Bad Request with Mediana error details", async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        const errorData = {
          meta: {
            code: "1041",
            errorMessage: "دریافت‌کننده نامعتبر در درخواست API",
            errors: [
              {
                key: "recipient",
                errors: ["شماره دریافت‌کننده نامعتبر است"],
                errorCode: 1041,
              },
            ],
          },
          data: null,
        };
        return new Response(JSON.stringify(errorData), {
          status: 400,
          statusText: "Bad Request",
        });
      };

      const provider = new MedianaSmsProvider({
        apiKey: DEFAULT_API_KEY,
        patternCode: DEFAULT_PATTERN_CODE,
        fetchImpl: mockFetch,
      });

      await expect(
        provider.sendVerificationCode({
          phoneNumber: "+989123456789",
          code: "123456",
        }),
      ).rejects.toThrow(/Mediana SMS delivery failed \(400\).*دریافت‌کننده نامعتبر/);
    });

    it("rejects on HTTP 401 Unauthorized (Invalid API Key)", async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response("Unauthorized – API key missing or invalid", {
          status: 401,
          statusText: "Unauthorized",
        });
      };

      const provider = new MedianaSmsProvider({
        apiKey: "invalid_key",
        patternCode: DEFAULT_PATTERN_CODE,
        fetchImpl: mockFetch,
      });

      await expect(
        provider.sendVerificationCode({
          phoneNumber: "+989123456789",
          code: "123456",
        }),
      ).rejects.toThrow(/Mediana SMS delivery failed \(401\)/);
    });

    it("rejects on HTTP 500 Internal Server Error", async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        const errorData = {
          meta: {
            code: "1021",
            errorMessage: "خطای ناشناخته‌ای رخ داده است",
            errors: [],
          },
          data: null,
        };
        return new Response(JSON.stringify(errorData), {
          status: 500,
          statusText: "Internal Server Error",
        });
      };

      const provider = new MedianaSmsProvider({
        apiKey: DEFAULT_API_KEY,
        patternCode: DEFAULT_PATTERN_CODE,
        fetchImpl: mockFetch,
      });

      await expect(
        provider.sendVerificationCode({
          phoneNumber: "+989123456789",
          code: "123456",
        }),
      ).rejects.toThrow(/Mediana SMS delivery failed \(500\).*خطای ناشناخته/);
    });

    it("rejects on network failure / connection error", async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        throw new Error("ECONNREFUSED: Connection refused to api.mediana.ir");
      };

      const provider = new MedianaSmsProvider({
        apiKey: DEFAULT_API_KEY,
        patternCode: DEFAULT_PATTERN_CODE,
        fetchImpl: mockFetch,
      });

      await expect(
        provider.sendVerificationCode({
          phoneNumber: "+989123456789",
          code: "123456",
        }),
      ).rejects.toThrow(/Mediana SMS delivery network error.*ECONNREFUSED/);
    });

    it("handles request timeout gracefully without hanging", async () => {
      const mockFetch: typeof globalThis.fetch = async (_url, init) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener("abort", () => {
              reject(new Error("The operation was aborted"));
            });
          }
        });
      };

      const provider = new MedianaSmsProvider({
        apiKey: DEFAULT_API_KEY,
        patternCode: DEFAULT_PATTERN_CODE,
        timeoutMs: 50,
        fetchImpl: mockFetch,
      });

      await expect(
        provider.sendVerificationCode({
          phoneNumber: "+989123456789",
          code: "123456",
        }),
      ).rejects.toThrow(/Mediana SMS delivery timed out after 50ms/);
    });

    it("handles malformed non-JSON responses on server errors (e.g. 502 Bad Gateway HTML)", async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response("<html><body>502 Bad Gateway</body></html>", {
          status: 502,
          statusText: "Bad Gateway",
        });
      };

      const provider = new MedianaSmsProvider({
        apiKey: DEFAULT_API_KEY,
        patternCode: DEFAULT_PATTERN_CODE,
        fetchImpl: mockFetch,
      });

      await expect(
        provider.sendVerificationCode({
          phoneNumber: "+989123456789",
          code: "123456",
        }),
      ).rejects.toThrow(/Mediana SMS delivery failed \(502\)/);
    });
  });
});
