/**
 * DeenVault AI Agents — SQL Migration Runner
 *
 * Runs raw SQL migration files against the database.
 * Used when psql is not available (e.g., Railway containers).
 *
 * Usage:
 *   npx tsx scripts/run-migration.ts migrations/0002_super_admin_rls.sql
 */

import { readFileSync } from "fs";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/run-migration.ts <path-to-sql-file>");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}

const sql = readFileSync(file, "utf-8");
console.log(`Running migration: ${file}`);

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query(sql);
  console.log("Migration applied successfully.");
} catch (err: any) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
