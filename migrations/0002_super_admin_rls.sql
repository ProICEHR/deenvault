-- ============================================================
-- DeenVault AI Agents — Phase 2: Super Admin RLS Policies
-- ============================================================
-- Adds cross-tenant access for super_admin role via
-- the app.is_super_admin session variable.
--
-- super_admin access pattern:
--   SET LOCAL app.is_super_admin = 'true';
--   SET LOCAL app.current_user = '<user_uuid>';
--   -- now all tenant-bound tables are visible
--
-- Regular users never have app.is_super_admin set.
-- ============================================================

-- ─── 1. Update tenant isolation policy ──────────────────
-- super_admin can see ALL tenants

DROP POLICY IF EXISTS tenant_isolation ON tenants;
CREATE POLICY tenant_isolation ON tenants
  FOR ALL
  USING (
    id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  )
  WITH CHECK (
    id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ─── 2. Update user isolation policy ────────────────────
-- super_admin can see users across all tenants

DROP POLICY IF EXISTS user_tenant_isolation ON users;
CREATE POLICY user_tenant_isolation ON users
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ─── 3. Update agent isolation policy ───────────────────
-- super_admin can see agents across all tenants

DROP POLICY IF EXISTS agent_tenant_isolation ON agents;
CREATE POLICY agent_tenant_isolation ON agents
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ─── 4. Update agent log isolation policy ───────────────
-- super_admin can view audit logs across tenants (read-only)

DROP POLICY IF EXISTS agent_log_tenant_isolation ON agent_logs;
CREATE POLICY agent_log_tenant_isolation ON agent_logs
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ─── 5. Update security events isolation policy ─────────
-- super_admin can view all security events

DROP POLICY IF EXISTS security_event_tenant_isolation ON security_events;
CREATE POLICY security_event_tenant_isolation ON security_events
  FOR ALL
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Test super_admin access:
--   BEGIN;
--   SET LOCAL app.is_super_admin = 'true';
--   SET LOCAL app.current_user = '<super_admin_uuid>';
--   SELECT count(*) FROM tenants;  -- should see ALL tenants
--   ROLLBACK;
--
-- Test regular user still isolated:
--   BEGIN;
--   SET LOCAL app.current_tenant = '<tenant_uuid>';
--   SET LOCAL app.current_user = '<user_uuid>';
--   SELECT count(*) FROM tenants;  -- should see only 1
--   ROLLBACK;
-- ============================================================
