/**
 * DeenVault AI Agents — Password Hashing
 *
 * Uses Node.js built-in scrypt for password hashing.
 * No external dependency (bcrypt/argon2) needed.
 *
 * Format: salt:hash (both hex-encoded)
 *   - 32-byte random salt
 *   - 64-byte scrypt-derived key
 *   - N=16384, r=8, p=1 (OWASP recommended)
 */

import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

/**
 * Hash a plaintext password for storage.
 * Returns "salt:hash" format.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = (await scryptAsync(
    password,
    salt,
    KEY_LENGTH,
    SCRYPT_PARAMS
  )) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Verify a plaintext password against a stored hash.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");

  if (!saltHex || !hashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expectedHash = Buffer.from(hashHex, "hex");

  const derived = (await scryptAsync(
    password,
    salt,
    KEY_LENGTH,
    SCRYPT_PARAMS
  )) as Buffer;

  if (derived.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(derived, expectedHash);
}
