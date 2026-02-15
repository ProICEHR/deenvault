/**
 * DeenVault AI Agents — Session Middleware Verification
 *
 * Tests:
 *   1. No session → 401
 *   2. Partial session → 401
 *   3. Non-admin on admin route → 403
 *   4. Valid session → next() called
 *   5. getSession() returns typed data
 *   6. tenantId is NEVER from client
 *
 * Run: npx tsx tests/verify-session.test.ts
 */

import {
  requireUserSession,
  requireAdminSession,
  getSession,
} from "../server/middleware/session";

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

function mockReq(governance?: any): any {
  return {
    session: governance ? { governance } : {},
    body: { tenantId: "attacker-tenant-id" }, // Simulates attacker injecting tenantId
  };
}

function mockRes(): any {
  let statusCode = 0;
  let body: any = null;
  return {
    status(code: number) { statusCode = code; return this; },
    json(data: any) { body = data; },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
}

// ─── TEST 1: No session ─────────────────────────────────

console.log("\n── TEST 1: No Session ──");

{
  const res = mockRes();
  let nextCalled = false;
  requireUserSession(mockReq(), res, () => { nextCalled = true; });
  assert(res.statusCode === 401, "No session → 401");
  assert(!nextCalled, "next() NOT called");
}

// ─── TEST 2: Partial session ─────────────────────────────

console.log("\n── TEST 2: Partial Session ──");

{
  const res = mockRes();
  let nextCalled = false;
  requireUserSession(
    mockReq({ userId: "user-1" }), // missing tenantId, role
    res,
    () => { nextCalled = true; }
  );
  assert(res.statusCode === 401, "Partial session → 401");
  assert(!nextCalled, "next() NOT called");
}

{
  const res = mockRes();
  let nextCalled = false;
  requireUserSession(
    mockReq({ userId: "user-1", tenantId: "tenant-1" }), // missing role
    res,
    () => { nextCalled = true; }
  );
  assert(res.statusCode === 401, "Missing role → 401");
  assert(!nextCalled, "next() NOT called");
}

// ─── TEST 3: Non-admin on admin route ────────────────────

console.log("\n── TEST 3: Non-Admin Access ──");

{
  const res = mockRes();
  let nextCalled = false;
  requireAdminSession(
    mockReq({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "student",
      sessionVersion: 1,
    }),
    res,
    () => { nextCalled = true; }
  );
  assert(res.statusCode === 403, "Student on admin route → 403");
  assert(res.body.code === "INSUFFICIENT_ROLE", "Error code correct");
  assert(!nextCalled, "next() NOT called");
}

{
  const res = mockRes();
  let nextCalled = false;
  requireAdminSession(
    mockReq({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "instructor",
      sessionVersion: 1,
    }),
    res,
    () => { nextCalled = true; }
  );
  assert(res.statusCode === 403, "Instructor on admin route → 403");
  assert(!nextCalled, "next() NOT called");
}

// ─── TEST 4: Valid session passes ────────────────────────

console.log("\n── TEST 4: Valid Session ──");

{
  const res = mockRes();
  let nextCalled = false;
  requireUserSession(
    mockReq({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "student",
      sessionVersion: 1,
    }),
    res,
    () => { nextCalled = true; }
  );
  assert(nextCalled, "Valid student session → next() called");
  assert(res.statusCode === 0, "No error status");
}

{
  const res = mockRes();
  let nextCalled = false;
  requireAdminSession(
    mockReq({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      sessionVersion: 1,
    }),
    res,
    () => { nextCalled = true; }
  );
  assert(nextCalled, "Valid admin session → next() called on admin route");
}

// ─── TEST 5: getSession returns correct data ─────────────

console.log("\n── TEST 5: getSession() ──");

{
  const req = mockReq({
    userId: "user-abc",
    tenantId: "tenant-xyz",
    role: "admin",
    sessionVersion: 3,
  });
  const session = getSession(req);
  assert(session.userId === "user-abc", "userId correct");
  assert(session.tenantId === "tenant-xyz", "tenantId correct");
  assert(session.role === "admin", "role correct");
  assert(session.sessionVersion === 3, "sessionVersion correct");
}

// ─── TEST 6: tenantId from client body is IGNORED ────────

console.log("\n── TEST 6: Client tenantId Ignored ──");

{
  const req = mockReq({
    userId: "user-1",
    tenantId: "real-tenant",
    role: "admin",
    sessionVersion: 1,
  });
  // req.body.tenantId = "attacker-tenant-id" (set in mockReq)
  const session = getSession(req);
  assert(
    session.tenantId === "real-tenant",
    "Session tenantId used (not client body)"
  );
  assert(
    session.tenantId !== req.body.tenantId,
    "Client-provided tenantId rejected"
  );
}

// ─── RESULTS ─────────────────────────────────────────────

console.log("\n══════════════════════════════════════════");
console.log(`  SESSION VERIFICATION: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("  STATUS: FAILED — DO NOT DEPLOY");
  process.exit(1);
} else {
  console.log("  STATUS: PASSED — Session enforcement verified");
}
console.log("══════════════════════════════════════════\n");
