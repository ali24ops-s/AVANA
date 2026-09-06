import { describe, it, expect } from "vitest";
import { detectDeviceType } from "../modules/identity/device-service.js";

describe("detectDeviceType — Preflight Audit", () => {
  it("classifies mobile user agents consistently", () => {
    // iPhone Mobile Safari
    const iPhone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(detectDeviceType(iPhone)).toBe("mobile");

    // Android Mobile Chrome
    const androidMobile =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    expect(detectDeviceType(androidMobile)).toBe("mobile");

    // Mobile Firefox
    const fenix =
      "Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0";
    expect(detectDeviceType(fenix)).toBe("mobile");
  });

  it("classifies desktop user agents consistently", () => {
    // macOS Safari
    const macSafari =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(detectDeviceType(macSafari)).toBe("desktop");

    // Windows Chrome
    const winChrome =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
    expect(detectDeviceType(winChrome)).toBe("desktop");

    // Linux Firefox
    const linuxFirefox =
      "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0";
    expect(detectDeviceType(linuxFirefox)).toBe("desktop");
  });

  it("classifies tablets as mobile per the 2-slot architecture", () => {
    // iPad Safari
    const iPad =
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(detectDeviceType(iPad)).toBe("mobile");

    // Android Tablet (no 'Mobile' token)
    const androidTablet =
      "Mozilla/5.0 (Linux; Android 13; SM-X800) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
    expect(detectDeviceType(androidTablet)).toBe("mobile");
  });

  it("handles ambiguous / empty / unknown user agents deterministically", () => {
    // Empty UA without hint defaults to desktop
    expect(detectDeviceType("")).toBe("desktop");
    expect(detectDeviceType(undefined)).toBe("desktop");
    expect(detectDeviceType(null)).toBe("desktop");

    // Generic curl / bot UA defaults to desktop
    expect(detectDeviceType("curl/7.88.1")).toBe("desktop");
    expect(detectDeviceType("PostmanRuntime/7.32.3")).toBe("desktop");

    // Ambiguous UA with valid client hint honors hint
    expect(detectDeviceType("CustomMobileApp/1.0", "mobile")).toBe("mobile");
    expect(detectDeviceType("CustomDesktopApp/1.0", "desktop")).toBe("desktop");

    // Ambiguous UA with invalid hint defaults to desktop
    expect(detectDeviceType("CustomApp/1.0", "smartwatch")).toBe("desktop");
  });

  it("prevents untrusted client hint from bypassing the slot system", () => {
    const desktopMac =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
    const mobileIPhone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

    // Attacker on Desktop claims to be mobile -> REJECTED, classified as desktop
    expect(detectDeviceType(desktopMac, "mobile")).toBe("desktop");

    // Attacker on Mobile claims to be desktop -> REJECTED, classified as mobile
    expect(detectDeviceType(mobileIPhone, "desktop")).toBe("mobile");
  });
});
