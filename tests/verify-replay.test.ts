/**
 * DeenVault AI Agents — Replay Protection Verification
 *
 * Tests the middleware logic without a running server.
 * Simulates request/response objects to verify:
 *   1. Missing headers → 400
 *   2. Invalid UUID → 400
 *   3. Timestamp too old → 400
 *   4. Timestamp too far in future → 400
 *   5. Invalid timestamp format → 400
 *   6. Nonce too short → 400
 *   7. Valid headers → next() called
 *
 * Run: npx tsx tests/verify-replay.test.ts
 */

import { requireReplayHeaders, getReplayContext } from "../server/middleware/replay-protection";

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

// ─── Mock Express objects ────────────────────────────────

function mockReq(headers: Record<string, string> = {}): any {
  return { headers };
}

function mockRes(): any {
  let statusCode = 0;
  let body: any = null;
  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      body = data;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

// ─── TEST 1: Missing headers ─────────────────────────────

console.log("\n── TEST 1: Missing Headers ──");

{
  const res = mockRes();
  let nextCalled = false;
  requireReplayHeaders(mockReq({}), res, () => { nextCalled = true; });
  assert(res.statusCode === 400, "No headers → 400");
  assert(res.body.code === "REPLAY_HEADERS_MISSING", "Error code correct");
  assert(!nextCalled, "next() NOT called");
}

{
  const res = mockRes();
  let nextCalled = false;
  requireReplayHeaders(
    mockReq({ "x-request-id": "550e8400-e29b-41d4-a716-446655440000" }),
    res,
    () => { nextCalled = true; }
  );
  assert(res.statusCode === 400, "Missing timestamp + nonce → 400");
  assert(!nextCalled, "next() NOT called");
}

// ─── TEST 2: Invalid UUID ────────────────────────────────

console.log("\n── TEST 2: Invalid Request ID ──");

{
  const res = mockRes();
  let nextCalled = false;
  requireReplayHeaders(
    mockReq({
      "x-request-id": "not-a-uuid",
      "x-timestamp": new Date().toISOString(),
      "x-nonce": "a".repeat(16),
    }),
    res,
    () => { nextCalled = true; }
  );
  assert(res.statusCode === 400, "Invalid UUID → 400");
  assert(res.body.code === "INVALID_REQUEST_ID", "Error code correct");
  assert(!nextCalled, "next() NOT called");
}

// ─── TEST 3: Timestamp too old ───────────────────────────

console.log("\n── TEST 3: Old Timestamp ──");

{
  const res = mockRes();
  let nextCalled = false;
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  requireReplayHeaders(
    mockReq({
      "x-request-id": "550e8400-e29b-41d4-a716-446655440000",
      "x-timestamp": tenMinutesAgo,
      "x-nonce": "a".repeat(16),
    }),
    res,
    () => { nextCalled = true; }
  );
  assert(res.statusCode === 400, "10 min old timestamp → 400");
  assert(res.body.code === "TIMESTAMP_SKEW_EXCEEDED", "Error code correct");
  assert(!nextCalled, "next() NOT called");
}

// ─── TEST 4: Timestamp too far in future ─────────────────

console.log("\n── TEST 4: Future Timestamp ──");

{
  const res = mockRes();
  let nextCalled = false;
  const tenMinutesFuture = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  requireReplayHeaders(
    mockReq({
      "x-request-id": "550e8400-e29b-41d4-a716-446655440000",
      "x-timestamp": tenMinutesFuture,
      "x-nonce": "a".repeat(16),
    }),
    res,
    () => { nextCalled = true; }
  );
  assert(res.statusCode === 400, "10 min future timestamp → 400");
  assert(res.body.code === "TIMESTAMP_SKEW_EXCEEDED", "Error code correct");
  assert(!nextCalled, "next() NOT called");
}

// ─── TEST 5: Invalid timestamp format ────────────────────

console.log("\n── TEST 5: Invalid Timestamp Format ──");

{
  const res = mockRes();
  let nextCalled = false;
  requireReplayHeaders(
    mockReq({
      "x-request-id": "550e8400-e29b-41d4-a716-446655440000",
      "x-timestamp": "not-a-date",
      "x-nonce": "a".repeat(16),
    }),
    res,
    () => { nextCalled = true; }
  );
  assert(res.statusCode === 400, "Invalid date → 400");
  assert(res.body.code === "INVALID_TIMESTAMP", "Error code correct");
  assert(!nextCalled, "next() NOT called");
}

// ─── TEST 6: Nonce too short ─────────────────────────────

console.log("\n── TEST 6: Short Nonce ──");

{
  const res = mockRes();
  let nextCalled = false;
  requireReplayHeaders(
    mockReq({
      "x-request-id": "550e8400-e29b-41d4-a716-446655440000",
      "x-timestamp": new Date().toISOString(),
      "x-nonce": "short",
    }),
    res,
    () => { nextCalled = true; }
  );
  assert(res.statusCode === 400, "Short nonce → 400");
  assert(res.body.code === "INVALID_NONCE", "Error code correct");
  assert(!nextCalled, "next() NOT called");
}

// ─── TEST 7: Valid request passes ────────────────────────

console.log("\n── TEST 7: Valid Request ──");

{
  const res = mockRes();
  let nextCalled = false;
  const req = mockReq({
    "x-request-id": "550e8400-e29b-41d4-a716-446655440000",
    "x-timestamp": new Date().toISOString(),
    "x-nonce": "abcdefghijklmnop",
  });
  requireReplayHeaders(req, res, () => { nextCalled = true; });
  assert(nextCalled, "Valid headers → next() called");
  assert(res.statusCode === 0, "No error status set");

  // Verify context is attached
  const ctx = getReplayContext(req);
  assert(ctx.requestId === "550e8400-e29b-41d4-a716-446655440000", "Request ID attached");
  assert(ctx.nonce === "abcdefghijklmnop", "Nonce attached");
  assert(ctx.timestamp instanceof Date, "Timestamp is Date object");
}

// ─── TEST 8: Boundary — exactly 5 minutes ────────────────

console.log("\n── TEST 8: Boundary Timestamps ──");

{
  const res = mockRes();
  let nextCalled = false;
  // 4 min 59 sec ago — should pass
  const justUnder = new Date(Date.now() - 4 * 60 * 1000 - 59 * 1000).toISOString();
  requireReplayHeaders(
    mockReq({
      "x-request-id": "660e8400-e29b-41d4-a716-446655440000",
      "x-timestamp": justUnder,
      "x-nonce": "abcdefghijklmnop",
    }),
    res,
    () => { nextCalled = true; }
  );
  assert(nextCalled, "4m59s old → passes (within 5min tolerance)");
}

{
  const res = mockRes();
  let nextCalled = false;
  // 5 min 30 sec ago — should fail
  const justOver = new Date(Date.now() - 5 * 60 * 1000 - 30 * 1000).toISOString();
  requireReplayHeaders(
    mockReq({
      "x-request-id": "770e8400-e29b-41d4-a716-446655440000",
      "x-timestamp": justOver,
      "x-nonce": "abcdefghijklmnop",
    }),
    res,
    () => { nextCalled = true; }
  );
  assert(!nextCalled, "5m30s old → rejected (exceeds tolerance)");
  assert(res.statusCode === 400, "Returns 400");
}

// ─── RESULTS ─────────────────────────────────────────────

console.log("\n══════════════════════════════════════════");
console.log(`  REPLAY VERIFICATION: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("  STATUS: FAILED — DO NOT DEPLOY");
  process.exit(1);
} else {
  console.log("  STATUS: PASSED — Replay protection verified");
}
console.log("══════════════════════════════════════════\n");
