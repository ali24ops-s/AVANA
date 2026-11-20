/**
 * Date and Timezone Utilities for AVANA Forms.
 *
 * Ensures precise conversions between UTC ISO 8601 strings stored in the database
 * and local time strings required by HTML5 `<input type="datetime-local" />` (YYYY-MM-DDTHH:mm).
 * Prevents timezone skew and double-offset bugs across all timezones (e.g. Asia/Tehran UTC+03:30).
 */

/**
 * Converts a UTC ISO string to a local datetime input string (`YYYY-MM-DDTHH:mm`).
 *
 * @param isoString - UTC ISO string (e.g. "2026-11-01T08:00:00.000Z")
 * @param timeZone - Optional IANA timezone identifier for deterministic conversion/testing (e.g. "Asia/Tehran", "Europe/London")
 * @returns Local datetime string formatted as `YYYY-MM-DDTHH:mm`, or empty string `""` on invalid/missing input.
 */
export function toLocalDatetimeInputValue(
  isoString?: string | null,
  timeZone?: string,
): string {
  if (!isoString || typeof isoString !== "string" || !isoString.trim()) {
    return "";
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (timeZone) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "00";
    let hour = getPart("hour");
    if (hour === "24") hour = "00";
    return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${hour}:${getPart("minute")}`;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Converts a local datetime input string (`YYYY-MM-DDTHH:mm`) to a standard UTC ISO 8601 string.
 *
 * @param localValue - Local datetime string from input (e.g. "2026-11-01T11:30")
 * @param timeZone - Optional IANA timezone identifier for deterministic conversion/testing (e.g. "Asia/Tehran", "Europe/London")
 * @returns UTC ISO string (e.g. "2026-11-01T08:00:00.000Z"), or `null` on empty/missing/invalid input.
 */
export function toUtcIsoString(
  localValue?: string | null,
  timeZone?: string,
): string | null {
  if (!localValue || typeof localValue !== "string" || !localValue.trim()) {
    return null;
  }

  const trimmed = localValue.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
  }

  const [, yearStr, monthStr, dayStr, hourStr, minStr, secStr] = match;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  const sec = secStr ? parseInt(secStr, 10) : 0;

  if (timeZone) {
    let utcGuess = Date.UTC(year, month - 1, day, hour, min, sec);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    for (let i = 0; i < 3; i++) {
      const parts = formatter.formatToParts(new Date(utcGuess));
      const getPart = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);
      let h = getPart("hour");
      if (h === 24) h = 0;
      const currentLocal = Date.UTC(
        getPart("year"),
        getPart("month") - 1,
        getPart("day"),
        h,
        getPart("minute"),
        getPart("second"),
      );
      const desiredLocal = Date.UTC(year, month - 1, day, hour, min, sec);
      const diff = desiredLocal - currentLocal;
      if (diff === 0) break;
      utcGuess += diff;
    }
    return new Date(utcGuess).toISOString();
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}
