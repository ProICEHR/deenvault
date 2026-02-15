/**
 * DeenVault AI Agents — Master Verification Runner
 *
 * Runs all governance verification tests in sequence.
 * If ANY test suite fails, the process exits with code 1.
 *
 * Run: npx tsx tests/verify-all.ts
 *
 * Test Suites:
 *   1. Crypto (SHA-256, HMAC, canonical payloads, tamper detection)
 *   2. Replay Protection (header validation, timestamp skew, nonce)
 *   3. Session (auth enforcement, role gates, tenant isolation)
 *   4. withRls (contract verification, codebase scan)
 *
 * Note: RLS database tests (verify-rls.sql) must be run
 * directly against PostgreSQL. They cannot be automated here.
 */

import { execSync } from "child_process";
import * as path from "path";

const testDir = path.join(__dirname);

const suites = [
  { name: "Crypto Integrity", file: "verify-crypto.test.ts" },
  { name: "Replay Protection", file: "verify-replay.test.ts" },
  { name: "Session Enforcement", file: "verify-session.test.ts" },
  { name: "withRls Contract", file: "verify-withRls.test.ts" },
  { name: "Policy Check Agent", file: "verify-policy-agent.test.ts" },
];

console.log("╔══════════════════════════════════════════╗");
console.log("║  DeenVault Governance Verification Suite  ║");
console.log("╚══════════════════════════════════════════╝\n");

let allPassed = true;
const results: { name: string; passed: boolean }[] = [];

for (const suite of suites) {
  console.log(`\n▶ Running: ${suite.name}`);
  console.log("─".repeat(44));

  try {
    execSync(`npx tsx ${path.join(testDir, suite.file)}`, {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
    results.push({ name: suite.name, passed: true });
  } catch {
    results.push({ name: suite.name, passed: false });
    allPassed = false;
  }
}

// ─── Summary ─────────────────────────────────────────────

console.log("\n╔══════════════════════════════════════════╗");
console.log("║         VERIFICATION SUMMARY              ║");
console.log("╠══════════════════════════════════════════╣");

for (const r of results) {
  const icon = r.passed ? "✓" : "✗";
  const status = r.passed ? "PASSED" : "FAILED";
  console.log(`║  ${icon} ${r.name.padEnd(28)} ${status.padEnd(8)} ║`);
}

console.log("╠══════════════════════════════════════════╣");

if (allPassed) {
  console.log("║  ALL TESTS PASSED — System verified      ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("\nRemaining: Run verify-rls.sql against PostgreSQL.");
} else {
  console.log("║  TESTS FAILED — DO NOT DEPLOY            ║");
  console.log("╚══════════════════════════════════════════╝");
  process.exit(1);
}
