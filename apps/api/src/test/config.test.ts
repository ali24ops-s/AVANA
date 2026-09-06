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
