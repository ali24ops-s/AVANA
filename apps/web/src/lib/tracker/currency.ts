/**
 * Centralized Currency Conversion for AVANA Analytics.
 *
 * Rules:
 * - Internal AVANA domain & commerce currency is exclusively Toman (تومان).
 * - GA4 standard monetization reports require ISO 4217 standard currency codes.
 * - Iran's official ISO 4217 currency is IRR (Iranian Rial).
 * - Exact conversion: 1 Toman = 10 Rials (amountToman * 10).
 * - Executed strictly ONCE at the analytics boundary.
 * - Negative, zero, non-finite, or absurd values return null and are safely rejected.
 */

export interface ConvertedAnalyticsMoney {
  currency: "IRR";
  value: number;
}

/** Maximum allowed order amount in Tomans (10 billion Tomans) for sanity validation. */
const MAX_SANE_AMOUNT_TOMAN = 10_000_000_000;

/**
 * Validates and converts an internal Toman amount to GA4 ISO 4217 Rial (IRR).
 *
 * @param amountToman The amount in Tomans
 * @returns ConvertedAnalyticsMoney or null if invalid
 */
export function convertTomanToIrr(
  amountToman: number | null | undefined,
): ConvertedAnalyticsMoney | null {
  if (
    typeof amountToman !== "number" ||
    !Number.isFinite(amountToman) ||
    Number.isNaN(amountToman) ||
    amountToman <= 0 ||
    amountToman > MAX_SANE_AMOUNT_TOMAN
  ) {
    return null;
  }

  // Convert Toman to Iranian Rial (1 Toman = 10 Rials)
  const irrValue = Math.round(amountToman * 10);

  return {
    currency: "IRR",
    value: irrValue,
  };
}
