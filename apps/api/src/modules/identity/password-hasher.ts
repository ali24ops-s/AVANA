import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// Recommended scrypt parameters for standard security
const KEY_LEN = 64;
const SALT_LEN = 16;
const SCRYPT_OPTIONS = {
  N: 16384, // CPU/memory cost factor
  r: 8,     // Block size
  p: 1,     // Parallelization factor
};

/**
 * Hash a plain-text password using scrypt with a cryptographically secure random salt.
 * Output format: `scrypt$N=16384,r=8,p=1$saltHex$derivedKeyHex`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derivedKey = scryptSync(password, salt, KEY_LEN, SCRYPT_OPTIONS);

  const saltHex = salt.toString("hex");
  const derivedKeyHex = derivedKey.toString("hex");

  return `scrypt$N=${SCRYPT_OPTIONS.N},r=${SCRYPT_OPTIONS.r},p=${SCRYPT_OPTIONS.p}$${saltHex}$${derivedKeyHex}`;
}

/**
 * Verify a plain-text password against a stored scrypt hash string.
 * Uses constant-time timingSafeEqual comparison.
 */
export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (!storedHash || typeof storedHash !== "string") {
    return false;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") {
    return false;
  }

  const [, paramsStr, saltHex, expectedKeyHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(expectedKeyHex, "hex");

  const paramsObj: Record<string, number> = {};
  for (const pair of paramsStr.split(",")) {
    const [k, v] = pair.split("=");
    if (k && v) paramsObj[k] = parseInt(v, 10);
  }

  const options = {
    N: paramsObj.N || SCRYPT_OPTIONS.N,
    r: paramsObj.r || SCRYPT_OPTIONS.r,
    p: paramsObj.p || SCRYPT_OPTIONS.p,
  };

  try {
    const derivedKey = scryptSync(password, salt, expectedKey.length, options);

    if (derivedKey.length !== expectedKey.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, expectedKey);
  } catch {
    return false;
  }
}
