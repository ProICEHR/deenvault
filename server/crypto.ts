/**
 * DeenVault AI Agents — Cryptographic Audit Utilities
 *
 * Provides:
 *   1. SHA-256 hashing for input/output/decision trace
 *   2. HMAC-SHA256 signing for canonical payloads
 *   3. Canonical payload construction
 *   4. Signature verification
 *
 * Every agent execution produces signed, tamper-evident logs.
 * If a log entry is modified after signing, verification fails.
 */

import { createHash, createHmac } from "crypto";

// ─── SHA-256 Hash ────────────────────────────────────────

export function sha256(data: unknown): string {
  const serialized =
    typeof data === "string" ? data : JSON.stringify(data, Object.keys(data as object).sort());
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

// ─── Canonical Payload ───────────────────────────────────
// Deterministic JSON for HMAC signing.
// Keys are sorted to ensure identical payloads produce identical signatures.

export interface CanonicalPayloadInput {
  tenantId: string;
  userId: string;
  agentId: string;
  requestId: string;
  inputHash: string;
  outputHash: string;
  decisionTraceHash: string;
  policyVersion: string;
  regionId: string;
  timestamp: string;
}

export function buildCanonicalPayload(
  input: CanonicalPayloadInput
): string {
  // Deterministic key ordering
  const ordered = {
    agent_id: input.agentId,
    decision_trace_hash: input.decisionTraceHash,
    input_hash: input.inputHash,
    output_hash: input.outputHash,
    policy_version: input.policyVersion,
    region_id: input.regionId,
    request_id: input.requestId,
    tenant_id: input.tenantId,
    timestamp: input.timestamp,
    user_id: input.userId,
  };

  return JSON.stringify(ordered);
}

// ─── HMAC-SHA256 Signing ─────────────────────────────────

export function hmacSign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload, "utf8").digest("hex");
}

// ─── HMAC-SHA256 Verification ────────────────────────────

export function hmacVerify(
  payload: string,
  signature: string,
  key: string
): boolean {
  const expected = hmacSign(payload, key);

  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;

  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

// ─── Full Execution Hash Bundle ──────────────────────────
// Convenience function that produces all hashes for a single execution.

export interface ExecutionHashes {
  inputHash: string;
  outputHash: string;
  decisionTraceHash: string;
  canonicalPayload: string;
  hmacSignature: string;
}

export function generateExecutionHashes(
  input: unknown,
  output: unknown,
  decisionTrace: unknown,
  context: Omit<
    CanonicalPayloadInput,
    "inputHash" | "outputHash" | "decisionTraceHash"
  >,
  hmacKey: string
): ExecutionHashes {
  const inputHash = sha256(input);
  const outputHash = sha256(output);
  const decisionTraceHash = sha256(decisionTrace);

  const canonicalPayload = buildCanonicalPayload({
    ...context,
    inputHash,
    outputHash,
    decisionTraceHash,
  });

  const hmacSignature = hmacSign(canonicalPayload, hmacKey);

  return {
    inputHash,
    outputHash,
    decisionTraceHash,
    canonicalPayload,
    hmacSignature,
  };
}
