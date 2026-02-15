/**
 * DeenVault AI Agents — Cryptographic Integrity Verification
 *
 * Tests:
 *   1. SHA-256 deterministic hashing (deep-sorted keys)
 *   2. HMAC signing produces valid signatures
 *   3. HMAC verification detects tampering
 *   4. Canonical payload is deterministic
 *   5. Full execution hash pipeline integrity
 *
 * Run: npx tsx tests/verify-crypto.test.ts
 * All tests must pass. No exceptions.
 */

import {
  sha256,
  hmacSign,
  hmacVerify,
  buildCanonicalPayload,
  generateExecutionHashes,
} from "../server/crypto";

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

// ─── TEST 1: SHA-256 Deterministic Hashing ───────────────

console.log("\n── TEST 1: SHA-256 Deterministic Hashing ──");

// Same string produces same hash
const hash1 = sha256("hello");
const hash2 = sha256("hello");
assert(hash1 === hash2, "Same string → same hash");

// Different strings produce different hashes
const hash3 = sha256("hello");
const hash4 = sha256("world");
assert(hash3 !== hash4, "Different strings → different hashes");

// Objects with same keys in different order → same hash (deep sort)
const objA = { z: 1, a: 2, m: 3 };
const objB = { a: 2, m: 3, z: 1 };
assert(sha256(objA) === sha256(objB), "Top-level key order independent");

// Nested objects with different key order → same hash (deep sort)
const nestedA = { outer: { z: 1, a: 2 }, name: "test" };
const nestedB = { name: "test", outer: { a: 2, z: 1 } };
assert(sha256(nestedA) === sha256(nestedB), "Nested key order independent");

// Deep nesting
const deepA = { a: { b: { z: 1, a: 2 }, c: 3 }, d: 4 };
const deepB = { d: 4, a: { c: 3, b: { a: 2, z: 1 } } };
assert(sha256(deepA) === sha256(deepB), "Deep nested key order independent");

// Arrays maintain order (arrays are ordered, not sorted)
const arrA = { items: [1, 2, 3] };
const arrB = { items: [3, 2, 1] };
assert(sha256(arrA) !== sha256(arrB), "Array order preserved (not sorted)");

// Hash is 64 hex characters (SHA-256)
assert(hash1.length === 64, "SHA-256 produces 64 hex chars");
assert(/^[0-9a-f]{64}$/.test(hash1), "SHA-256 is valid hex");

// ─── TEST 2: HMAC Signing ────────────────────────────────

console.log("\n── TEST 2: HMAC Signing ──");

const key = "test-region-key-for-verification";
const payload = '{"test":"data"}';

const sig1 = hmacSign(payload, key);
const sig2 = hmacSign(payload, key);
assert(sig1 === sig2, "Same payload + key → same signature");

const sig3 = hmacSign(payload, "different-key");
assert(sig1 !== sig3, "Different key → different signature");

const sig4 = hmacSign('{"different":"payload"}', key);
assert(sig1 !== sig4, "Different payload → different signature");

assert(sig1.length === 64, "HMAC-SHA256 produces 64 hex chars");

// ─── TEST 3: HMAC Verification ───────────────────────────

console.log("\n── TEST 3: HMAC Verification ──");

assert(
  hmacVerify(payload, sig1, key) === true,
  "Valid signature verifies"
);

assert(
  hmacVerify(payload, sig1, "wrong-key") === false,
  "Wrong key rejects"
);

assert(
  hmacVerify('{"tampered":"data"}', sig1, key) === false,
  "Tampered payload rejects"
);

// Tamper with one character of signature
const tamperedSig = "a" + sig1.slice(1);
assert(
  hmacVerify(payload, tamperedSig, key) === false,
  "Tampered signature rejects"
);

// ─── TEST 4: Canonical Payload Determinism ───────────────

console.log("\n── TEST 4: Canonical Payload Determinism ──");

const payloadInput = {
  tenantId: "tenant-001",
  userId: "user-001",
  agentId: "agent-001",
  requestId: "req-001",
  inputHash: "ihash",
  outputHash: "ohash",
  decisionTraceHash: "thash",
  policyVersion: "v1.0",
  regionId: "NG-LAGOS-01",
  timestamp: "2026-01-01T00:00:00Z",
};

const cp1 = buildCanonicalPayload(payloadInput);
const cp2 = buildCanonicalPayload(payloadInput);
assert(cp1 === cp2, "Same input → same canonical payload");

// Keys should be alphabetically ordered in output
const parsed = JSON.parse(cp1);
const keys = Object.keys(parsed);
const sortedKeys = [...keys].sort();
assert(
  JSON.stringify(keys) === JSON.stringify(sortedKeys),
  "Canonical payload keys are alphabetically sorted"
);

// Verify all expected keys present
const expectedKeys = [
  "agent_id",
  "decision_trace_hash",
  "input_hash",
  "output_hash",
  "policy_version",
  "region_id",
  "request_id",
  "tenant_id",
  "timestamp",
  "user_id",
];
assert(
  JSON.stringify(keys) === JSON.stringify(expectedKeys),
  "All 10 canonical keys present and ordered"
);

// ─── TEST 5: Full Execution Hash Pipeline ────────────────

console.log("\n── TEST 5: Full Execution Hash Pipeline ──");

const hmacKey = "region-hmac-key-ng-001";

const input = { query: "What is the policy?", context: { level: "admin" } };
const output = { response: "Policy v1.0 applied", status: "ok" };
const trace = { steps: ["validate", "execute", "sign"], passed: true };

const hashes = generateExecutionHashes(
  input,
  output,
  trace,
  {
    tenantId: "tenant-001",
    userId: "user-001",
    agentId: "agent-001",
    requestId: "req-001",
    policyVersion: "v1.0",
    regionId: "NG-LAGOS-01",
    timestamp: "2026-01-01T00:00:00Z",
  },
  hmacKey
);

assert(hashes.inputHash.length === 64, "Input hash is valid SHA-256");
assert(hashes.outputHash.length === 64, "Output hash is valid SHA-256");
assert(
  hashes.decisionTraceHash.length === 64,
  "Decision trace hash is valid SHA-256"
);
assert(hashes.hmacSignature.length === 64, "HMAC signature is valid");

// Verify the signature matches the canonical payload
assert(
  hmacVerify(hashes.canonicalPayload, hashes.hmacSignature, hmacKey),
  "Generated signature verifies against canonical payload"
);

// Verify determinism — same inputs produce same outputs
const hashes2 = generateExecutionHashes(
  input,
  output,
  trace,
  {
    tenantId: "tenant-001",
    userId: "user-001",
    agentId: "agent-001",
    requestId: "req-001",
    policyVersion: "v1.0",
    regionId: "NG-LAGOS-01",
    timestamp: "2026-01-01T00:00:00Z",
  },
  hmacKey
);

assert(
  hashes.inputHash === hashes2.inputHash,
  "Deterministic: same input → same inputHash"
);
assert(
  hashes.hmacSignature === hashes2.hmacSignature,
  "Deterministic: same context → same HMAC"
);

// Tamper detection — different input produces different hashes
const hashesAlt = generateExecutionHashes(
  { query: "TAMPERED INPUT" },
  output,
  trace,
  {
    tenantId: "tenant-001",
    userId: "user-001",
    agentId: "agent-001",
    requestId: "req-001",
    policyVersion: "v1.0",
    regionId: "NG-LAGOS-01",
    timestamp: "2026-01-01T00:00:00Z",
  },
  hmacKey
);

assert(
  hashes.inputHash !== hashesAlt.inputHash,
  "Tampered input → different inputHash"
);
assert(
  hashes.hmacSignature !== hashesAlt.hmacSignature,
  "Tampered input → different HMAC signature"
);

// Cross-region signature mismatch
const hashesEG = generateExecutionHashes(
  input,
  output,
  trace,
  {
    tenantId: "tenant-001",
    userId: "user-001",
    agentId: "agent-001",
    requestId: "req-001",
    policyVersion: "v1.0",
    regionId: "EG-CAIRO-01",
    timestamp: "2026-01-01T00:00:00Z",
  },
  "different-region-key-eg"
);

assert(
  hashes.hmacSignature !== hashesEG.hmacSignature,
  "Different region → different HMAC (cross-region detection)"
);

// ─── TEST 6: Signature Tamper Detection Simulation ───────

console.log("\n── TEST 6: Audit Tamper Detection ──");

// Simulate: attacker modifies a stored log's output_hash
const originalPayload = hashes.canonicalPayload;
const originalSig = hashes.hmacSignature;

// Original verifies
assert(
  hmacVerify(originalPayload, originalSig, hmacKey),
  "Original log verifies correctly"
);

// Attacker changes one field in the payload
const tamperedPayload = originalPayload.replace(
  hashes.outputHash,
  "aaaa" + hashes.outputHash.slice(4)
);
assert(
  hmacVerify(tamperedPayload, originalSig, hmacKey) === false,
  "Tampered payload detected — verification fails"
);

// Attacker tries to re-sign with wrong key
const attackerSig = hmacSign(tamperedPayload, "attacker-key");
assert(
  hmacVerify(tamperedPayload, attackerSig, hmacKey) === false,
  "Attacker-signed payload rejected"
);

// ─── RESULTS ─────────────────────────────────────────────

console.log("\n══════════════════════════════════════════");
console.log(`  CRYPTO VERIFICATION: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("  STATUS: FAILED — DO NOT DEPLOY");
  process.exit(1);
} else {
  console.log("  STATUS: PASSED — Crypto layer verified");
}
console.log("══════════════════════════════════════════\n");
