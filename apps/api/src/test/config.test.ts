import { describe, expect, it } from "vitest";
import { loadApiConfig } from "../config.js";

describe("loadApiConfig - cookie security", () => {
  it("production + env=true -> secure=true", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
      AVANA_COOKIE_SECURE: "true",
    });
    expect(config.session.secure).toBe(true);
    expect(config.csrf.secure).toBe(true);
  });

  it("production + env=false -> secure=false", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
      AVANA_COOKIE_SECURE: "false",
    });
    expect(config.session.secure).toBe(false);
    expect(config.csrf.secure).toBe(false);
  });

  it("production without env -> secure=true", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
    });
    expect(config.session.secure).toBe(true);
    expect(config.csrf.secure).toBe(true);
  });

  it("development without env -> secure=false", () => {
    const config = loadApiConfig({
      NODE_ENV: "development",
    });
    expect(config.session.secure).toBe(false);
    expect(config.csrf.secure).toBe(false);
  });
});

describe("loadApiConfig - session lifetime (maxAgeMs)", () => {
  it("defaults to 14 days (1209600000 ms)", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
    });
    expect(config.session.maxAgeMs).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it("honors valid AVANA_SESSION_MAX_AGE_MS override", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
      AVANA_SESSION_MAX_AGE_MS: "86400000",
    });
    expect(config.session.maxAgeMs).toBe(86400000);
  });

  it("throws descriptive error for invalid AVANA_SESSION_MAX_AGE_MS value", () => {
    expect(() =>
      loadApiConfig({
        NODE_ENV: "production",
        AVANA_SESSION_MAX_AGE_MS: "not-a-number",
      }),
    ).toThrowError(/Invalid AVANA_SESSION_MAX_AGE_MS value/);
  });
});

describe("loadApiConfig - telegram SOCKS5 proxy", () => {
  it("defaults to undefined when TELEGRAM_SOCKS_PROXY_URL is not set", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
    });
    expect(config.telegram.socksProxyUrl).toBeUndefined();
  });

  it("parses valid TELEGRAM_SOCKS_PROXY_URL correctly", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
      TELEGRAM_SOCKS_PROXY_URL: "socks5://127.0.0.1:1080",
    });
    expect(config.telegram.socksProxyUrl).toBe("socks5://127.0.0.1:1080");
  });

  it("ignores whitespace-only TELEGRAM_SOCKS_PROXY_URL", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
      TELEGRAM_SOCKS_PROXY_URL: "   ",
    });
    expect(config.telegram.socksProxyUrl).toBeUndefined();
  });
});

describe("loadApiConfig - gemini SOCKS5 proxy", () => {
  it("defaults to undefined when GEMINI_SOCKS_PROXY_URL is not set", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
    });
    expect(config.generation.geminiSocksProxyUrl).toBeUndefined();
  });

  it("parses valid GEMINI_SOCKS_PROXY_URL correctly (including production port 10808) and trims whitespace", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
      GEMINI_SOCKS_PROXY_URL: "  socks5://127.0.0.1:10808  ",
    });
    expect(config.generation.geminiSocksProxyUrl).toBe("socks5://127.0.0.1:10808");
  });

  it("ignores whitespace-only GEMINI_SOCKS_PROXY_URL", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
      GEMINI_SOCKS_PROXY_URL: "   ",
    });
    expect(config.generation.geminiSocksProxyUrl).toBeUndefined();
  });

  it("does not automatically inherit TELEGRAM_SOCKS_PROXY_URL", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
      TELEGRAM_SOCKS_PROXY_URL: "socks5://127.0.0.1:1080",
    });
    expect(config.telegram.socksProxyUrl).toBe("socks5://127.0.0.1:1080");
    expect(config.generation.geminiSocksProxyUrl).toBeUndefined();
  });

  it("throws descriptive error for invalid SOCKS protocol without leaking credentials", () => {
    const invalidUrlWithCreds = `http://${"dummyuser"}:${"dummypassword"}@127.0.0.1:8080`;
    expect(() =>
      loadApiConfig({
        NODE_ENV: "production",
        GEMINI_SOCKS_PROXY_URL: invalidUrlWithCreds,
      }),
    ).toThrowError(/Invalid SOCKS proxy protocol: http:/);

    try {
      loadApiConfig({
        NODE_ENV: "production",
        GEMINI_SOCKS_PROXY_URL: invalidUrlWithCreds,
      });
    } catch (err: unknown) {
      expect((err as Error).message).not.toContain("dummypassword");
    }
  });

  it("throws descriptive error for malformed URL without leaking credentials", () => {
    expect(() =>
      loadApiConfig({
        NODE_ENV: "production",
        GEMINI_SOCKS_PROXY_URL: "not a url",
      }),
    ).toThrowError(/Invalid GEMINI_SOCKS_PROXY_URL: malformed URL/);
  });
});
