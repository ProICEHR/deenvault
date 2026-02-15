/**
 * DeenVault AI Agents — Policy Check Agent Verification
 *
 * Tests:
 *   1. Valid request → ALLOW
 *   2. Missing consent → SAFE_STOP
 *   3. Empty request → SAFE_STOP
 *   4. Payload too large → DENY
 *   5. Dangerous keywords → DENY (each keyword)
 *   6. PII detected → SAFE_STOP
 *   7. Missing region → DENY
 *   8. Missing tenant → DENY
 *   9. Output format is always correct
 *
 * Run: npx tsx tests/verify-policy-agent.test.ts
 * All tests must pass. No exceptions.
 */

import {
  runPolicyCheckAgent,
  type PolicyCheckInput,
  type PolicyCheckOutput,
} from "../server/agents/policy-check";

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

function validInput(overrides?: Partial<PolicyCheckInput>): PolicyCheckInput {
  return {
    tenantId: "tenant-001",
    regionAnchor: "NG",
    consent: true,
    requestText: "Show me the governance policy for this semester",
    ...overrides,
  };
}

function assertOutputFormat(result: PolicyCheckOutput, label: string): void {
  assert(
    ["ALLOW", "SAFE_STOP", "DENY"].includes(result.decision),
    `${label}: decision is valid enum`
  );
  assert(typeof result.reason === "string", `${label}: reason is string`);
  assert(Array.isArray(result.flags), `${label}: flags is array`);
  assert(
    typeof result.policy_version === "string",
    `${label}: policy_version is string`
  );
  assert(result.policy_version === "v1.2", `${label}: policy_version is v1.2`);
}

// ─── TEST 1: Valid Request → ALLOW ───────────────────────

console.log("\n── TEST 1: Valid Request → ALLOW ──");

const allow = runPolicyCheckAgent(validInput());
assert(allow.decision === "ALLOW", "Valid request returns ALLOW");
assert(allow.reason === "Policy checks passed", "ALLOW has correct reason");
assert(allow.flags.length === 0, "ALLOW has no flags");
assertOutputFormat(allow, "ALLOW");

// ─── TEST 2: Missing Consent → SAFE_STOP ────────────────

console.log("\n── TEST 2: Missing Consent → SAFE_STOP ──");

const noConsent = runPolicyCheckAgent(validInput({ consent: false }));
assert(noConsent.decision === "SAFE_STOP", "No consent → SAFE_STOP");
assert(
  noConsent.reason === "Missing required consent",
  "Correct reason for missing consent"
);
assert(
  noConsent.flags.includes("CONSENT_REQUIRED"),
  "CONSENT_REQUIRED flag set"
);
assertOutputFormat(noConsent, "noConsent");

// ─── TEST 3: Empty Request → SAFE_STOP ──────────────────

console.log("\n── TEST 3: Empty Request → SAFE_STOP ──");

const empty = runPolicyCheckAgent(validInput({ requestText: "" }));
assert(empty.decision === "SAFE_STOP", "Empty request → SAFE_STOP");
assert(empty.flags.includes("EMPTY_REQUEST"), "EMPTY_REQUEST flag set");
assertOutputFormat(empty, "empty");

// ─── TEST 4: Payload Too Large → DENY ───────────────────

console.log("\n── TEST 4: Payload Too Large → DENY ──");

const huge = runPolicyCheckAgent(
  validInput({ requestText: "x".repeat(4001) })
);
assert(huge.decision === "DENY", "Payload > 4000 → DENY");
assert(huge.flags.includes("PAYLOAD_TOO_LARGE"), "PAYLOAD_TOO_LARGE flag set");
assertOutputFormat(huge, "huge");

// Boundary: exactly 4000 should ALLOW
const boundary = runPolicyCheckAgent(
  validInput({ requestText: "a".repeat(4000) })
);
assert(boundary.decision === "ALLOW", "Payload == 4000 → ALLOW (boundary)");

// ─── TEST 5: Dangerous Keywords → DENY ──────────────────

console.log("\n── TEST 5: Dangerous Keywords → DENY ──");

const dangerousKeywords = [
  "delete",
  "drop database",
  "transfer funds",
  "wire",
  "change admin",
  "reset password",
  "disable security",
  "bypass",
];

for (const kw of dangerousKeywords) {
  const result = runPolicyCheckAgent(
    validInput({ requestText: `Please ${kw} this record` })
  );
  assert(result.decision === "DENY", `"${kw}" → DENY`);
  assert(
    result.flags.includes("FORBIDDEN_ACTION"),
    `"${kw}" → FORBIDDEN_ACTION flag`
  );
  assert(
    result.reason.includes(kw),
    `"${kw}" → reason mentions the keyword`
  );
}

// Safe text should not trigger
const safeText = runPolicyCheckAgent(
  validInput({ requestText: "Show me the student enrollment report" })
);
assert(safeText.decision === "ALLOW", "Safe text does not trigger DENY");

// ─── TEST 6: PII Detected → SAFE_STOP ──────────────────

console.log("\n── TEST 6: PII Detected → SAFE_STOP ──");

const pii = runPolicyCheckAgent(validInput({ containsPII: true }));
assert(pii.decision === "SAFE_STOP", "PII present → SAFE_STOP");
assert(pii.flags.includes("PII_PRESENT"), "PII_PRESENT flag set");
assertOutputFormat(pii, "pii");

// No PII flag should ALLOW
const noPii = runPolicyCheckAgent(validInput({ containsPII: false }));
assert(noPii.decision === "ALLOW", "containsPII=false → ALLOW");

// ─── TEST 7: Missing Region → DENY ─────────────────────

console.log("\n── TEST 7: Missing Region → DENY ──");

const noRegion = runPolicyCheckAgent(
  validInput({ regionAnchor: undefined as any })
);
assert(noRegion.decision === "DENY", "Missing region → DENY");
assert(noRegion.flags.includes("MISSING_REGION"), "MISSING_REGION flag set");
assertOutputFormat(noRegion, "noRegion");

// ─── TEST 8: Missing Tenant → DENY ─────────────────────

console.log("\n── TEST 8: Missing Tenant → DENY ──");

const noTenant = runPolicyCheckAgent(validInput({ tenantId: "" }));
assert(noTenant.decision === "DENY", "Empty tenantId → DENY");
assert(noTenant.flags.includes("MISSING_TENANT"), "MISSING_TENANT flag set");
assertOutputFormat(noTenant, "noTenant");

// ─── TEST 9: Priority Order (consent checked first) ─────

console.log("\n── TEST 9: Rule Priority ──");

// If both consent and dangerous keyword, consent check comes first
const consentFirst = runPolicyCheckAgent(
  validInput({ consent: false, requestText: "delete everything" })
);
assert(
  consentFirst.decision === "SAFE_STOP",
  "Consent checked before keyword scan"
);
assert(
  consentFirst.flags.includes("CONSENT_REQUIRED"),
  "Consent flag takes priority"
);

// If consent given but PII and dangerous, keyword fires first
const keywordBeforePii = runPolicyCheckAgent(
  validInput({
    requestText: "delete this with my SSN",
    containsPII: true,
  })
);
assert(
  keywordBeforePii.decision === "DENY",
  "Keyword scan before PII check"
);

// ─── RESULTS ─────────────────────────────────────────────

console.log("\n══════════════════════════════════════════");
console.log(
  `  POLICY AGENT VERIFICATION: ${passed} passed, ${failed} failed`
);
if (failed > 0) {
  console.log("  STATUS: FAILED — DO NOT DEPLOY");
  process.exit(1);
} else {
  console.log("  STATUS: PASSED — Policy agent verified");
}
console.log("══════════════════════════════════════════\n");
