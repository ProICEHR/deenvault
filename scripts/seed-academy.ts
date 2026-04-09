/**
 * DeenVault AI Academy — Academy Data Seed
 *
 * Seeds academy operational data: sponsors, applications, learners.
 * Run AFTER seed.ts (requires existing tenant and admin user).
 *
 * Usage:
 *   TENANT_ID=<uuid> ADMIN_ID=<uuid> npx tsx scripts/seed-academy.ts
 *
 * If TENANT_ID/ADMIN_ID are not set, uses the first active tenant/admin found.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and, sql } from "drizzle-orm";
import { tenants, users, sponsors, applications } from "../shared/schema";

async function seedAcademy(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log("");
  console.log("╔══════════════════════════════════════════╗");
  console.log("║    DeenVault Academy — Data Seed          ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("");

  try {
    // ─── Find tenant and admin ────────────────────────────

    // Bypass RLS for seeding
    await db.execute(sql`SELECT set_config('app.is_super_admin', 'true', false)`);

    let tenantId = process.env.TENANT_ID;
    let adminId = process.env.ADMIN_ID;

    if (!tenantId) {
      const [t] = await db
        .select({ id: tenants.id, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.status, "active"))
        .limit(1);

      if (!t) {
        console.error("No active tenant found. Run seed.ts first.");
        process.exit(1);
      }
      tenantId = t.id;
      console.log(`Using tenant: ${t.name} (${tenantId})`);
    }

    if (!adminId) {
      const [a] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
          and(
            eq(users.tenantId, tenantId),
            eq(users.status, "active")
          )
        )
        .limit(1);

      if (!a) {
        console.error("No active admin found. Run seed.ts first.");
        process.exit(1);
      }
      adminId = a.id;
      console.log(`Using admin: ${a.email} (${adminId})`);
    }

    // Set tenant context for RLS
    await db.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, false)`);

    // ─── 1. Create Sponsor ────────────────────────────────

    console.log("\n1. Creating sponsor project...");

    const [sponsor] = await db
      .insert(sponsors)
      .values({
        tenantId,
        name: "Al-Furqan Educational Trust",
        description: "Funding 50 learner seats for the DeenVault AI Academy pilot program in Nigeria. Focus: Islamic education technology and governance training.",
        contactEmail: "grants@alfurqan-trust.org",
        status: "active",
        createdBy: adminId,
      })
      .returning({ id: sponsors.id, name: sponsors.name });

    console.log(`   Sponsor: ${sponsor.name}`);
    console.log(`   ID:      ${sponsor.id}`);
    console.log(`   Status:  active`);

    // ─── 2. Create Applications ──────────────────────────

    console.log("\n2. Creating applications...");

    // Application 1: Pending (fresh application)
    const [app1] = await db
      .insert(applications)
      .values({
        tenantId,
        applicantName: "Aisha Bello",
        applicantEmail: "aisha.bello@example.ng",
        programName: "AI Governance Foundations",
        status: "applied",
        createdBy: adminId,
      })
      .returning({ id: applications.id, applicantName: applications.applicantName });

    console.log(`   [APPLIED]  ${app1.applicantName} — ${app1.id}`);

    // Application 2: Reviewed (awaiting decision)
    const [app2] = await db
      .insert(applications)
      .values({
        tenantId,
        applicantName: "Ibrahim Musa",
        applicantEmail: "ibrahim.musa@example.ng",
        programName: "AI Governance Foundations",
        status: "reviewed",
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewNotes: "Strong academic background in Islamic studies. Recommended for acceptance.",
        createdBy: adminId,
      })
      .returning({ id: applications.id, applicantName: applications.applicantName });

    console.log(`   [REVIEWED] ${app2.applicantName} — ${app2.id}`);

    // Application 3: Accepted (learner)
    const [app3] = await db
      .insert(applications)
      .values({
        tenantId,
        applicantName: "Fatima Abdullahi",
        applicantEmail: "fatima.abdullahi@example.ng",
        programName: "AI Governance Foundations",
        status: "accepted",
        reviewedBy: adminId,
        reviewedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        reviewNotes: "Excellent application. Background in computer science and fiqh. Sponsor-matched.",
        sponsorId: sponsor.id,
        createdBy: adminId,
      })
      .returning({ id: applications.id, applicantName: applications.applicantName });

    console.log(`   [ACCEPTED] ${app3.applicantName} — ${app3.id} (LEARNER)`);

    // Application 4: Rejected
    const [app4] = await db
      .insert(applications)
      .values({
        tenantId,
        applicantName: "Yusuf Olamide",
        applicantEmail: "yusuf.olamide@example.ng",
        programName: "AI Governance Foundations",
        status: "rejected",
        reviewedBy: adminId,
        reviewedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        reviewNotes: "Incomplete application. Missing prerequisite documentation. May reapply next cohort.",
        createdBy: adminId,
      })
      .returning({ id: applications.id, applicantName: applications.applicantName });

    console.log(`   [REJECTED] ${app4.applicantName} — ${app4.id}`);

    // ─── 3. Summary ──────────────────────────────────────

    console.log("\n╔══════════════════════════════════════════╗");
    console.log("║       ACADEMY SEED COMPLETE               ║");
    console.log("╠══════════════════════════════════════════╣");
    console.log("║                                          ║");
    console.log(`║  Sponsor:      ${sponsor.name.padEnd(25)}║`);
    console.log(`║  Applications: 4 total                   ║`);
    console.log(`║    Applied:    1                         ║`);
    console.log(`║    Reviewed:   1                         ║`);
    console.log(`║    Accepted:   1 (learner)               ║`);
    console.log(`║    Rejected:   1                         ║`);
    console.log("║                                          ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log("");
  } catch (error: any) {
    if (error?.code === "23505") {
      console.error("\nDuplicate data detected. Seed may have already run.");
      console.error("Detail:", error.detail);
    } else {
      console.error("\nSeed failed:", error.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedAcademy();
