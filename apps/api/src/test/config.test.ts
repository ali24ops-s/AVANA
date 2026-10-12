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
