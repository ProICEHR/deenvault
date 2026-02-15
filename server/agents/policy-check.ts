/**
 * DeenVault AI Agents — Policy Check Agent
 *
 * The first real agent in the governance fortress.
 *
 * Given a request payload, it:
 *   1. Validates against governance rules
 *   2. Returns ALLOW / SAFE_STOP / DENY
 *   3. Every call is audit-logged by the gateway (not by this agent)
 *
 * What it does NOT do:
 *   - No external API calls
 *   - No long-lived memory
 *   - No access to secrets
 *   - No tool execution
 *   - No payments
 *   - No direct DB access
 *
 * Governance Rules (Phase 1 — 6 rules):
 *   1. Request must include consent flag (boolean)
 *   2. PII not allowed unless agent is marked "PII_ALLOWED"
 *   3. No "dangerous actions" keywords
 *   4. Max payload length (prevent abuse)
 *   5. Region tag required
 *   6. Tenant ID required
 */

type Decision = "ALLOW" | "SAFE_STOP" | "DENY";

export type PolicyCheckInput = {
  tenantId: string;
  regionAnchor: "NG" | "EG";
  consent: boolean;
  requestText: string;
  containsPII?: boolean;
};

export type PolicyCheckOutput = {
  decision: Decision;
  reason: string;
  flags: string[];
  policy_version: string;
};

const DANGEROUS_KEYWORDS = [
  "delete",
  "drop database",
  "transfer funds",
  "wire",
  "change admin",
  "reset password",
  "disable security",
  "bypass",
];

export function runPolicyCheckAgent(
  input: PolicyCheckInput
): PolicyCheckOutput {
  const flags: string[] = [];
  const text = (input.requestText || "").toLowerCase();

  // 1) Consent gate
  if (!input.consent) {
    return {
      decision: "SAFE_STOP",
      reason: "Missing required consent",
      flags: ["CONSENT_REQUIRED"],
      policy_version: "v1.2",
    };
  }

  // 2) Basic payload constraints
  if (text.length === 0) {
    return {
      decision: "SAFE_STOP",
      reason: "Empty request",
      flags: ["EMPTY_REQUEST"],
      policy_version: "v1.2",
    };
  }

  if (text.length > 4000) {
    return {
      decision: "DENY",
      reason: "Request exceeds allowed size",
      flags: ["PAYLOAD_TOO_LARGE"],
      policy_version: "v1.2",
    };
  }

  // 3) Dangerous action keywords
  for (const kw of DANGEROUS_KEYWORDS) {
    if (text.includes(kw)) {
      return {
        decision: "DENY",
        reason: `Forbidden action keyword detected: ${kw}`,
        flags: ["FORBIDDEN_ACTION"],
        policy_version: "v1.2",
      };
    }
  }

  // 4) PII hint
  if (input.containsPII) {
    flags.push("PII_PRESENT");
    // Phase 1: do not allow PII in the policy-check agent
    return {
      decision: "SAFE_STOP",
      reason: "PII detected; requires approved PII-capable agent",
      flags,
      policy_version: "v1.2",
    };
  }

  // 5) Region sanity check (redundant safeguard)
  if (!input.regionAnchor) {
    return {
      decision: "DENY",
      reason: "Missing region anchor",
      flags: ["MISSING_REGION"],
      policy_version: "v1.2",
    };
  }

  // 6) Tenant ID check (redundant — gateway enforces, but defense in depth)
  if (!input.tenantId) {
    return {
      decision: "DENY",
      reason: "Missing tenant ID",
      flags: ["MISSING_TENANT"],
      policy_version: "v1.2",
    };
  }

  // Default allow
  return {
    decision: "ALLOW",
    reason: "Policy checks passed",
    flags,
    policy_version: "v1.2",
  };
}
