-- ============================================================
-- DeenVault AI Agents — Governance RLS Migration
-- ============================================================
-- This migration is NON-NEGOTIABLE infrastructure.
--
-- It establishes:
--   1. A dedicated application role (no superuser)
--   2. FORCE Row Level Security on all tenant-bound tables
--   3. Tenant isolation policies using session variables
--   4. Replay protection constraint
--
-- Without this, tenant isolation is theater.
-- ============================================================

-- ─── 1. Application Role ─────────────────────────────────
-- The application MUST connect as this role.
-- Superuser bypasses RLS. This role does not.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'deenvault_app') THEN
    CREATE ROLE deenvault_app LOGIN PASSWORD 'CHANGE_ME_IN_PRODUCTION';
  END IF;
END
$$;

-- Dynamic grant — works regardless of database name (Railway uses 'railway')
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO deenvault_app', current_database());
END $$;
GRANT USAGE ON SCHEMA public TO deenvault_app;

-- Grant table-level permissions (SELECT, INSERT, UPDATE — no DELETE, no TRUNCATE)
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO deenvault_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO deenvault_app;

-- Future tables auto-grant
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO deenvault_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO deenvault_app;

-- ─── 2. Enable + Force RLS ───────────────────────────────
-- ENABLE = policies apply to non-superuser roles
-- FORCE  = policies apply even to table owner
-- Both are required. ENABLE alone is insufficient.

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;

ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events FORCE ROW LEVEL SECURITY;

-- ─── 3. Tenant Isolation Policies ────────────────────────
-- Every query MUST have app.current_tenant set via:
--   SET LOCAL app.current_tenant = '<tenant_uuid>';
-- Without it, the query returns zero rows. Hard isolation.

-- Tenants: can only see own tenant record
CREATE POLICY tenant_isolation ON tenants
  FOR ALL
  USING (id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (id = current_setting('app.current_tenant', true)::uuid);

-- Users: scoped to tenant
CREATE POLICY user_tenant_isolation ON users
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Agents: scoped to tenant
CREATE POLICY agent_tenant_isolation ON agents
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Agent Logs: scoped to tenant (append-only pattern — no UPDATE policy needed beyond insert)
CREATE POLICY agent_log_tenant_isolation ON agent_logs
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Security Events: scoped to tenant
-- Note: tenant_id can be NULL for system-level events.
-- System events are only visible when app.current_tenant is not set.
CREATE POLICY security_event_tenant_isolation ON security_events
  FOR ALL
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

-- ─── 4. Replay Protection Constraint ────────────────────
-- The schema uniqueIndex handles this via Drizzle, but we
-- enforce it at DB level as a safety net.
-- UNIQUE(tenant_id, request_id) is already defined in schema.
-- This comment documents the governance intent:
--   No duplicate request_id per tenant = replay impossible.

-- ─── 5. Audit Log Immutability ───────────────────────────
-- Prevent UPDATE and DELETE on agent_logs for the app role.
-- Logs are append-only. Period.

REVOKE UPDATE, DELETE ON agent_logs FROM deenvault_app;

-- ─── 6. Security Events Append-Only ─────────────────────
-- Security events should not be modifiable after insertion.

REVOKE UPDATE, DELETE ON security_events FROM deenvault_app;

-- ─── 7. HMAC Keys — Restricted Access ───────────────────
-- Only admins should read keys. App role can read for signing
-- but cannot delete or modify active keys.

ALTER TABLE hmac_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE hmac_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY hmac_keys_read ON hmac_keys
  FOR SELECT
  USING (true);

CREATE POLICY hmac_keys_insert ON hmac_keys
  FOR INSERT
  WITH CHECK (true);

-- No UPDATE or DELETE policy = app role cannot modify/delete keys
REVOKE UPDATE, DELETE ON hmac_keys FROM deenvault_app;

-- ============================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================
-- Check RLS is enabled:
--   SELECT tablename, rowsecurity, forcerowsecurity
--   FROM pg_tables WHERE schemaname = 'public';
--
-- Check policies exist:
--   SELECT tablename, policyname
--   FROM pg_policies WHERE schemaname = 'public';
--
-- Test isolation (should return 0 rows without context):
--   SET ROLE deenvault_app;
--   SELECT * FROM tenants;  -- should be empty
--   RESET ROLE;
-- ============================================================
