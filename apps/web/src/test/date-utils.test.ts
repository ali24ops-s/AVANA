import { describe, it, expect } from "vitest";
import {
  toLocalDatetimeInputValue,
  toUtcIsoString,
} from "../lib/date-utils.js";

describe("date-utils timezone-aware conversion tests", () => {
  describe("Timezone: Asia/Tehran (UTC+03:30)", () => {
    const tzTehran = "Asia/Tehran";

    it("correctly converts UTC ISO string to local datetime string in Tehran", () => {
      // 2026-11-01 08:00:00 UTC -> 11:30:00 local time in Tehran
      const utcIso = "2026-11-01T08:00:00.000Z";
      const localInput = toLocalDatetimeInputValue(utcIso, tzTehran);
      expect(localInput).toBe("2026-11-01T11:30");
    });

    it("correctly converts local datetime string in Tehran to UTC ISO string", () => {
      // 2026-11-01 11:30:00 local time in Tehran -> 08:00:00 UTC
      const localInput = "2026-11-01T11:30";
      const utcIso = toUtcIsoString(localInput, tzTehran);
      expect(utcIso).toBe("2026-11-01T08:00:00.000Z");
    });

    it("guarantees lossless roundtrip without drift or double-offset in Tehran", () => {
      const originalUtc = "2026-11-15T14:45:00.000Z";
      const local = toLocalDatetimeInputValue(originalUtc, tzTehran);
      const convertedBackUtc = toUtcIsoString(local, tzTehran);
      expect(convertedBackUtc).toBe(originalUtc);

      // Verify second roundtrip to ensure NO double-offsetting occurs
      const localAgain = toLocalDatetimeInputValue(convertedBackUtc, tzTehran);
      expect(localAgain).toBe(local);
    });
  });

  describe("Timezone: Europe/London (UTC+00:00 in Winter)", () => {
    const tzLondon = "Europe/London";

    it("correctly converts UTC ISO string to local datetime string in London (GMT / UTC+0)", () => {
      // In November, London is on GMT (UTC+00:00)
      const utcIso = "2026-11-01T10:15:00.000Z";
      const localInput = toLocalDatetimeInputValue(utcIso, tzLondon);
      expect(localInput).toBe("2026-11-01T10:15");
    });

    it("correctly converts local datetime string in London to UTC ISO string (GMT / UTC+0)", () => {
      const localInput = "2026-11-01T10:15";
      const utcIso = toUtcIsoString(localInput, tzLondon);
      expect(utcIso).toBe("2026-11-01T10:15:00.000Z");
    });

    it("correctly handles British Summer Time (BST / UTC+01:00 in Summer)", () => {
      // In July, London is on BST (UTC+01:00)
      const utcIso = "2026-07-15T12:00:00.000Z";
      const localInput = toLocalDatetimeInputValue(utcIso, tzLondon);
      expect(localInput).toBe("2026-07-15T13:00");

      const roundtripUtc = toUtcIsoString(localInput, tzLondon);
      expect(roundtripUtc).toBe(utcIso);
    });
  });

  describe("Edge cases & graceful degradation (no exceptions thrown)", () => {
    it("returns empty string for null, undefined, empty, or whitespace in toLocalDatetimeInputValue", () => {
      expect(toLocalDatetimeInputValue(null)).toBe("");
      expect(toLocalDatetimeInputValue(undefined)).toBe("");
      expect(toLocalDatetimeInputValue("")).toBe("");
      expect(toLocalDatetimeInputValue("   ")).toBe("");
    });

    it("returns empty string for invalid date formats without throwing RangeError", () => {
      expect(toLocalDatetimeInputValue("invalid-date-string")).toBe("");
      expect(toLocalDatetimeInputValue("2026-99-99T99:99")).toBe("");
    });

    it("returns null for null, undefined, empty, or whitespace in toUtcIsoString", () => {
      expect(toUtcIsoString(null)).toBeNull();
      expect(toUtcIsoString(undefined)).toBeNull();
      expect(toUtcIsoString("")).toBeNull();
      expect(toUtcIsoString("   ")).toBeNull();
    });

    it("returns null for invalid datetime input without throwing RangeError", () => {
      expect(toUtcIsoString("not-a-datetime")).toBeNull();
      expect(toUtcIsoString("abcd-ef-gh")).toBeNull();
    });

    it("works with default runtime timezone when no explicit timezone is passed", () => {
      const now = new Date();
      const iso = now.toISOString();
      const local = toLocalDatetimeInputValue(iso);
      expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

      const backToUtc = toUtcIsoString(local);
      expect(backToUtc).not.toBeNull();
      // Difference between original date and parsed date within same minute
      const diffMs = Math.abs(new Date(backToUtc!).getTime() - now.getTime());
      expect(diffMs).toBeLessThanOrEqual(60_000);
    });
  });
});
