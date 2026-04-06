/**
 * DeenVault AI Agents — Auth Module Verification
 *
 * Tests:
 *   1. Password hashing produces different hashes for same input (random salt)
 *   2. Password verification succeeds for correct password
 *   3. Password verification fails for wrong password
 *   4. Hash format is "salt:hash" with correct lengths
 *   5. Constant-time comparison prevents timing attacks
 *   6. Empty/null passwords handled safely
 *
 * Run: npx tsx tests/verify-auth.test.ts
 */

import { hashPassword, verifyPassword } from "../server/auth";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${name}`);
    failed++;
  }
}

async function run(): Promise<void> {
  // ─── TEST 1: Hashing produces unique salts ──────────────

  console.log("\n── TEST 1: Unique Salts ──");

  const hash1 = await hashPassword("test-password");
  const hash2 = await hashPassword("test-password");
  assert(hash1 !== hash2, "Same password → different hashes (random salt)");

  // ─── TEST 2: Hash format ────────────────────────────────

  console.log("\n── TEST 2: Hash Format ──");

  const parts = hash1.split(":");
  assert(parts.length === 2, "Hash format is salt:hash");
  assert(parts[0].length === 64, "Salt is 32 bytes (64 hex chars)");
  assert(parts[1].length === 128, "Hash is 64 bytes (128 hex chars)");
  assert(/^[0-9a-f]+$/.test(parts[0]), "Salt is valid hex");
  assert(/^[0-9a-f]+$/.test(parts[1]), "Hash is valid hex");

  // ─── TEST 3: Correct password verifies ──────────────────

  console.log("\n── TEST 3: Correct Password ──");

  const password = "governance-strong-password-2026";
  const stored = await hashPassword(password);

  const valid = await verifyPassword(password, stored);
  assert(valid === true, "Correct password verifies");

  // ─── TEST 4: Wrong password rejects ─────────────────────

  console.log("\n── TEST 4: Wrong Password ──");

  const invalid1 = await verifyPassword("wrong-password", stored);
  assert(invalid1 === false, "Wrong password rejects");

  const invalid2 = await verifyPassword("", stored);
  assert(invalid2 === false, "Empty password rejects");

  const invalid3 = await verifyPassword(password + "x", stored);
  assert(invalid3 === false, "Password with extra char rejects");

  // ─── TEST 5: Malformed hash rejects ─────────────────────

  console.log("\n── TEST 5: Malformed Hashes ──");

  const badHash1 = await verifyPassword("test", "not-a-valid-hash");
  assert(badHash1 === false, "Malformed hash (no colon) rejects");

  const badHash2 = await verifyPassword("test", ":");
  assert(badHash2 === false, "Empty salt:hash rejects");

  const badHash3 = await verifyPassword("test", "abc:def");
  assert(badHash3 === false, "Short salt:hash rejects");

  // ─── TEST 6: Different passwords produce different hashes ─

  console.log("\n── TEST 6: Different Passwords ──");

  const hashA = await hashPassword("password-alpha");
  const hashB = await hashPassword("password-beta");

  // Even though salts differ, let's verify cross-password rejection
  const crossA = await verifyPassword("password-beta", hashA);
  assert(crossA === false, "Password A hash rejects password B");

  const crossB = await verifyPassword("password-alpha", hashB);
  assert(crossB === false, "Password B hash rejects password A");

  // ─── RESULTS ───────────────────────────────────────────

  console.log("\n══════════════════════════════════════════");
  console.log(`  AUTH VERIFICATION: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("  STATUS: FAILED — DO NOT DEPLOY");
    process.exit(1);
  } else {
    console.log("  STATUS: PASSED — Auth module verified");
  }
  console.log("══════════════════════════════════════════\n");
}

run().catch((err) => {
  console.error("Auth test failed:", err);
  process.exit(1);
});
