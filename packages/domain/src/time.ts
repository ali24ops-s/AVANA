/**
 * Framework-independent time primitives for AVANA.
 */

type Brand<K, T> = K & { readonly __brand: T };

export type UtcIsoDateTimeString = Brand<string, "utcIsoDateTimeString">;

/**
 * Strict UTC ISO-8601 datetime string validator.
 * Accepts forms like: 2026-01-31T23:59:59Z
 */
export function isUtcIsoDateTimeString(
  value: string,
): value is UtcIsoDateTimeString {
  // Must end with Z and be a valid ISO datetime when parsed.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/.test(value))
    return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

export function parseUtcIsoDateTimeString(
  value: string,
  fieldName = "timestamp",
): UtcIsoDateTimeString {
  if (!isUtcIsoDateTimeString(value)) {
    throw new Error(`Invalid UTC ISO timestamp for ${fieldName}`);
  }
  return value as UtcIsoDateTimeString;
}

export function nowUtcIsoDateTimeString(): UtcIsoDateTimeString {
  return new Date().toISOString() as UtcIsoDateTimeString;
}
