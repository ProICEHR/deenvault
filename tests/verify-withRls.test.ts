/**
 * DeenVault AI Agents — withRls() Contract Verification
 *
 * Static analysis tests to verify:
 *   1. withRls() uses set_config with is_local=true
 *   2. withRls() runs inside db.transaction()
 *   3. withRls() rejects empty tenantId/userId
 *   4. No direct db.select()/db.insert() on tenant tables
 *      exists outside of withRls() (codebase scan)
 *
 * Run: npx tsx tests/verify-withRls.test.ts
 */

import * as fs from "fs";
import * as path from "path";

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

// ─── TEST 1: withRls source code inspection ──────────────

console.log("\n── TEST 1: withRls() Implementation ──");

const dbSource = fs.readFileSync(
  path.join(__dirname, "../server/db.ts"),
  "utf-8"
);

// Verify set_config is called with 'true' (is_local)
assert(
  dbSource.includes("set_config('app.current_tenant'") &&
    dbSource.includes(", true)"),
  "set_config uses is_local=true for tenant"
);

assert(
  dbSource.includes("set_config('app.current_user'") &&
    dbSource.includes(", true)"),
  "set_config uses is_local=true for user"
);

// Verify it's inside db.transaction()
assert(
  dbSource.includes("db.transaction(async (tx)"),
  "withRls uses db.transaction()"
);

// Verify input validation exists
assert(
  dbSource.includes("if (!tenantId || !userId)"),
  "withRls validates tenantId and userId"
);

assert(
  dbSource.includes("throw new Error"),
  "withRls throws on missing context"
);

// ─── TEST 2: Codebase scan for direct db usage ──────────

console.log("\n── TEST 2: Direct DB Usage Scan ──");

const serverDir = path.join(__dirname, "../server");

function scanFile(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const violations: string[] = [];

  // Skip db.ts itself (it defines the exports)
  if (filePath.endsWith("db.ts")) return violations;

  const lines = content.split("\n");
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;

    // Check for direct db usage on tenant-bound tables
    // These patterns indicate bypassing withRls()
    const dangerousPatterns = [
      /\bdb\.select\(\)\.from\(tenants\b/,
      /\bdb\.select\(\)\.from\(users\b/,
      /\bdb\.select\(\)\.from\(agents\b/,
      /\bdb\.select\(\)\.from\(agentLogs\b/,
      /\bdb\.insert\(tenants\b/,
      /\bdb\.insert\(users\b/,
      /\bdb\.insert\(agents\b/,
      /\bdb\.insert\(agentLogs\b/,
      /\bdb\.insert\(securityEvents\b/,
      /\bdb\.update\(tenants\b/,
      /\bdb\.update\(users\b/,
      /\bdb\.update\(agents\b/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(line)) {
        violations.push(`${filePath}:${lineNum} — ${trimmed}`);
      }
    }
  });

  return violations;
}

function scanDirectory(dir: string): string[] {
  const violations: string[] = [];

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        violations.push(...scanFile(fullPath));
      }
    }
  }

  walk(dir);
  return violations;
}

const violations = scanDirectory(serverDir);

if (violations.length > 0) {
  console.error("  Direct db usage found on tenant-bound tables:");
  violations.forEach((v) => console.error(`    ${v}`));
}

assert(
  violations.length === 0,
  `No direct db usage on tenant tables (found ${violations.length} violations)`
);

// ─── TEST 3: withRls() contract — empty string rejection ─

console.log("\n── TEST 3: withRls() Empty Input Handling ──");

// Verify the validation catches empty strings
assert(
  dbSource.includes("!tenantId"),
  "Empty tenantId string is caught by !tenantId"
);

assert(
  dbSource.includes("!userId"),
  "Empty userId string is caught by !userId"
);

// ─── TEST 4: Verify db export is NOT the default export ──

console.log("\n── TEST 4: db Export Pattern ──");

// db should be a named export, not default
assert(
  dbSource.includes("export const db"),
  "db is a named export (can be tracked by linters)"
);

assert(
  !dbSource.includes("export default db"),
  "db is NOT a default export (prevents unnamed imports)"
);

// ─── TEST 5: withRls is exported ─────────────────────────

assert(
  dbSource.includes("export async function withRls"),
  "withRls is exported for use by routes"
);

// ─── RESULTS ─────────────────────────────────────────────

console.log("\n══════════════════════════════════════════");
console.log(`  withRls VERIFICATION: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("  STATUS: FAILED — DO NOT DEPLOY");
  process.exit(1);
} else {
  console.log("  STATUS: PASSED — withRls contract verified");
}
console.log("══════════════════════════════════════════\n");
