/**
 * DeenVault AI Agents — Database Seed Script
 *
 * Creates the first tenant, admin user, and approved policy agent.
 * Run ONCE after database schema is applied.
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 *
 * Environment:
 *   DATABASE_URL must be set (can use .env file)
 *
 * This script:
 *   1. Creates a tenant (NG region)
 *   2. Creates an admin user with hashed password
 *   3. Creates an approved PolicyCheckAgent
 *   4. Prints all IDs and credentials for first login
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { tenants, users, agents } from "../shared/schema";
import { hashPassword } from "../server/auth";

// ─── Configuration ───────────────────────────────────────

const TENANT_NAME = process.env.SEED_TENANT_NAME || "DeenVault Academy";
const TENANT_REGION = (process.env.SEED_TENANT_REGION || "NG") as "NG" | "EG";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@deenvault.ng";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "change-me-immediately";
// SEED_ADMIN_ROLE: "super_admin" for platform bootstrap, "tenant_admin" for tenant-only
const ADMIN_ROLE = (process.env.SEED_ADMIN_ROLE || "super_admin") as "super_admin" | "tenant_admin" | "admin";
const AGENT_NAME = "PolicyCheckAgent";
const AGENT_POLICY_VERSION = "v1.2";

// ─── Main ────────────────────────────────────────────────

async function seed(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log("");
  console.log("╔══════════════════════════════════════════╗");
  console.log("║       DeenVault Database Seed             ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("");

  try {
    // ─── 1. Create Tenant ─────────────────────────────────

    console.log("1. Creating tenant...");

    const [tenant] = await db
      .insert(tenants)
      .values({
        name: TENANT_NAME,
        primaryRegion: TENANT_REGION,
        regionLocked: true,
        status: "active",
      })
      .returning({ id: tenants.id, name: tenants.name });

    console.log(`   Tenant: ${tenant.name}`);
    console.log(`   ID:     ${tenant.id}`);
    console.log(`   Region: ${TENANT_REGION}`);

    // ─── 2. Create Admin User ─────────────────────────────

    console.log("\n2. Creating admin user...");

    const passwordHash = await hashPassword(ADMIN_PASSWORD);

    const [admin] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: ADMIN_EMAIL,
        name: "Platform Admin",
        passwordHash,
        role: ADMIN_ROLE,
        status: "active",
        mustChangePassword: true,
      })
      .returning({ id: users.id, email: users.email, role: users.role });

    console.log(`   Email:  ${admin.email}`);
    console.log(`   ID:     ${admin.id}`);
    console.log(`   Role:   ${admin.role}`);

    // ─── 3. Create Policy Agent ───────────────────────────

    console.log("\n3. Creating PolicyCheckAgent...");

    // Hash the agent's objective for immutability tracking
    const { createHash } = await import("crypto");
    const objectiveHash = createHash("sha256")
      .update(
        JSON.stringify({
          name: AGENT_NAME,
          type: "policy_check",
          rules: [
            "consent_required",
            "payload_size_limit",
            "dangerous_keyword_block",
            "pii_detection",
            "region_required",
            "tenant_required",
          ],
          version: AGENT_POLICY_VERSION,
        })
      )
      .digest("hex");

    const [agent] = await db
      .insert(agents)
      .values({
        tenantId: tenant.id,
        name: AGENT_NAME,
        description:
          "Stateless policy enforcement agent. Validates requests against 6 governance rules.",
        agentType: "policy_check",
        immutableObjectiveHash: objectiveHash,
        policyVersion: AGENT_POLICY_VERSION,
        approved: true,
        approvedBy: admin.id,
        approvedAt: new Date(),
        createdBy: admin.id,
        status: "active",
      })
      .returning({ id: agents.id, name: agents.name });

    console.log(`   Agent:  ${agent.name}`);
    console.log(`   ID:     ${agent.id}`);
    console.log(`   Type:   policy_check`);
    console.log(`   Status: active + approved`);

    // ─── 4. Print Summary ─────────────────────────────────

    console.log("\n╔══════════════════════════════════════════╗");
    console.log("║         SEED COMPLETE                     ║");
    console.log("╠══════════════════════════════════════════╣");
    console.log("║                                          ║");
    console.log(`║  Tenant ID:  ${tenant.id}  ║`);
    console.log(`║  Admin ID:   ${admin.id}  ║`);
    console.log(`║  Agent ID:   ${agent.id}  ║`);
    console.log("║                                          ║");
    console.log("╠══════════════════════════════════════════╣");
    console.log("║  LOGIN CREDENTIALS                       ║");
    console.log("╠══════════════════════════════════════════╣");
    console.log(`║  Email:    ${ADMIN_EMAIL.padEnd(30)}║`);
    console.log(`║  Password: ${ADMIN_PASSWORD.padEnd(30)}║`);
    console.log(`║  TenantID: ${tenant.id}  ║`);
    console.log("║                                          ║");
    console.log("║  CHANGE THE PASSWORD IMMEDIATELY.        ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log("");
  } catch (error: any) {
    if (error?.code === "23505") {
      console.error("\nSeed data already exists. Run only once.");
      console.error("Detail:", error.detail);
    } else {
      console.error("\nSeed failed:", error.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
