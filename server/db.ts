/**
 * DeenVault AI Agents — Database Layer
 *
 * This module provides:
 *   1. Database connection pool (PostgreSQL)
 *   2. Drizzle ORM instance
 *   3. withRls() — the tenant isolation transaction wrapper
 *
 * CRITICAL: All tenant-bound queries MUST go through withRls().
 * Direct db usage bypasses RLS context and is a data breach risk.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import * as schema from "../shared/schema";

// ─── Connection Pool ─────────────────────────────────────
// Must connect as deenvault_app role, NOT superuser.

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error:", err.message);
});

export const db = drizzle(pool, { schema });

// ─── withRls() — Tenant-Scoped Transaction Wrapper ──────
//
// This is the enforcement layer between Drizzle and Postgres RLS.
//
// How it works:
//   1. Begins a transaction
//   2. Sets session variables: app.current_tenant, app.current_user
//   3. Executes your callback within that scoped context
//   4. Commits or rolls back
//
// Why SET LOCAL:
//   SET LOCAL scopes the variable to the current transaction only.
//   When the transaction ends, the variable disappears.
//   No cross-request leakage is possible.
//
// Usage:
//   const result = await withRls(tenantId, userId, async (tx) => {
//     return tx.select().from(agents);
//   });

export async function withRls<T>(
  tenantId: string,
  userId: string,
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  if (!tenantId || !userId) {
    throw new Error(
      "[withRls] tenantId and userId are required. " +
        "This is a governance violation — RLS context cannot be empty."
    );
  }

  return await db.transaction(async (tx) => {
    // Bind tenant context for this transaction only
    await tx.execute(
      sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`
    );
    await tx.execute(
      sql`SELECT set_config('app.current_user', ${userId}, true)`
    );

    // Execute the caller's logic within the scoped context
    return await callback(tx as unknown as typeof db);
  });
}

// ─── withSystemContext() — For system-level operations ───
// Used for operations that are NOT tenant-scoped:
//   - Creating new tenants
//   - System-wide security event logging
//   - Admin cross-tenant queries (with explicit authorization)
//
// This does NOT set RLS variables, so RLS policies that
// require app.current_tenant will return no rows.
// Only use for tables/policies that allow null tenant context.

export async function withSystemContext<T>(
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    return await callback(tx as unknown as typeof db);
  });
}

// ─── Health Check ────────────────────────────────────────

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await db.execute(sql`SELECT 1 as health`);
    return true;
  } catch {
    return false;
  }
}

// ─── Shutdown ────────────────────────────────────────────

export async function closePool(): Promise<void> {
  await pool.end();
}
