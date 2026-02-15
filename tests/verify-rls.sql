-- ============================================================
-- DeenVault AI Agents — RLS Verification Test Script
-- ============================================================
-- Run this AFTER applying the migration and schema.
-- Execute as superuser, then switch to deenvault_app.
--
-- PASS criteria are documented inline.
-- If ANY test fails: STOP. Fix before proceeding.
-- ============================================================

-- ─── TEST 0: Verify RLS is enabled on all tables ─────────

SELECT
  tablename,
  rowsecurity AS rls_enabled,
  forcerowsecurity AS force_rls
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('tenants', 'users', 'agents', 'agent_logs', 'security_events', 'hmac_keys');

-- EXPECTED: All rows show rls_enabled = true, force_rls = true

-- ─── TEST 1: Verify policies exist ──────────────────────

SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- EXPECTED: At least one policy per tenant-bound table

-- ─── TEST 2: Verify deenvault_app is NOT superuser ──────

SELECT rolname, rolsuper, rolcreaterole, rolcreatedb
FROM pg_roles
WHERE rolname = 'deenvault_app';

-- EXPECTED: rolsuper = false, rolcreaterole = false, rolcreatedb = false

-- ─── TEST 3: Switch to deenvault_app, no context ────────
-- Without app.current_tenant, all tenant queries return 0 rows.

SET ROLE deenvault_app;

SELECT count(*) AS tenant_count FROM tenants;
-- EXPECTED: 0

SELECT count(*) AS user_count FROM users;
-- EXPECTED: 0

SELECT count(*) AS agent_count FROM agents;
-- EXPECTED: 0

SELECT count(*) AS log_count FROM agent_logs;
-- EXPECTED: 0

RESET ROLE;

-- ─── TEST 4: Insert test data as superuser ──────────────

INSERT INTO tenants (id, name, primary_region, region_locked, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Tenant Alpha', 'NG', true, 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant Beta', 'EG', true, 'active');

INSERT INTO users (id, tenant_id, email, password_hash, role, status)
VALUES
  ('aaaa1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'admin@alpha.com', 'hash', 'admin', 'active'),
  ('bbbb2222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'admin@beta.com', 'hash', 'admin', 'active');

INSERT INTO agents (id, tenant_id, name, immutable_objective_hash, policy_version, approved, status)
VALUES
  ('cccc1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Alpha Agent', 'hash_a', 'v1.0', true, 'active'),
  ('dddd2222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Beta Agent', 'hash_b', 'v1.0', true, 'active');

-- ─── TEST 5: Tenant Alpha can only see own data ─────────

SET ROLE deenvault_app;

BEGIN;
SELECT set_config('app.current_tenant', '11111111-1111-1111-1111-111111111111', true);

SELECT count(*) AS alpha_tenants FROM tenants;
-- EXPECTED: 1

SELECT name FROM tenants;
-- EXPECTED: 'Tenant Alpha' only

SELECT count(*) AS alpha_users FROM users;
-- EXPECTED: 1

SELECT email FROM users;
-- EXPECTED: 'admin@alpha.com' only

SELECT count(*) AS alpha_agents FROM agents;
-- EXPECTED: 1

SELECT name FROM agents;
-- EXPECTED: 'Alpha Agent' only

COMMIT;

-- ─── TEST 6: Tenant Beta isolation (cross-tenant attack) ─

BEGIN;
SELECT set_config('app.current_tenant', '22222222-2222-2222-2222-222222222222', true);

SELECT count(*) AS beta_tenants FROM tenants;
-- EXPECTED: 1

SELECT name FROM tenants;
-- EXPECTED: 'Tenant Beta' only (NOT Alpha)

SELECT count(*) AS beta_agents FROM agents;
-- EXPECTED: 1

SELECT name FROM agents;
-- EXPECTED: 'Beta Agent' only (NOT Alpha Agent)

COMMIT;

-- ─── TEST 7: Cross-tenant insert blocked ────────────────

BEGIN;
SELECT set_config('app.current_tenant', '11111111-1111-1111-1111-111111111111', true);

-- Try to insert agent for Beta tenant while in Alpha context
-- This MUST fail due to WITH CHECK policy.
INSERT INTO agents (tenant_id, name, immutable_objective_hash, policy_version, approved, status)
VALUES ('22222222-2222-2222-2222-222222222222', 'Evil Agent', 'hack', 'v1.0', true, 'active');
-- EXPECTED: ERROR — new row violates row-level security policy

ROLLBACK;

-- ─── TEST 8: Append-only enforcement ────────────────────

BEGIN;
SELECT set_config('app.current_tenant', '11111111-1111-1111-1111-111111111111', true);

-- Insert a test log
INSERT INTO agent_logs (
  tenant_id, user_id, agent_id, request_id,
  input_hash, output_hash, decision_trace_hash,
  canonical_payload, policy_version, region_id,
  hmac_signature, hmac_key_version
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'aaaa1111-1111-1111-1111-111111111111',
  'cccc1111-1111-1111-1111-111111111111',
  'test-request-001',
  'input_hash_val', 'output_hash_val', 'trace_hash_val',
  '{"test": true}'::jsonb, 'v1.0', 'NG-LAGOS-01',
  'sig_val', 'v1'
);
COMMIT;

-- Now try to UPDATE the log (must fail)
BEGIN;
SELECT set_config('app.current_tenant', '11111111-1111-1111-1111-111111111111', true);
UPDATE agent_logs SET input_hash = 'tampered' WHERE request_id = 'test-request-001';
-- EXPECTED: ERROR — permission denied (UPDATE revoked)
ROLLBACK;

-- Try to DELETE the log (must fail)
BEGIN;
SELECT set_config('app.current_tenant', '11111111-1111-1111-1111-111111111111', true);
DELETE FROM agent_logs WHERE request_id = 'test-request-001';
-- EXPECTED: ERROR — permission denied (DELETE revoked)
ROLLBACK;

RESET ROLE;

-- ─── TEST 9: Replay protection constraint ───────────────

SET ROLE deenvault_app;

BEGIN;
SELECT set_config('app.current_tenant', '11111111-1111-1111-1111-111111111111', true);

-- Insert duplicate request_id for same tenant (must fail)
INSERT INTO agent_logs (
  tenant_id, user_id, agent_id, request_id,
  input_hash, output_hash, decision_trace_hash,
  canonical_payload, policy_version, region_id,
  hmac_signature, hmac_key_version
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'aaaa1111-1111-1111-1111-111111111111',
  'cccc1111-1111-1111-1111-111111111111',
  'test-request-001',
  'different_hash', 'different_hash', 'different_hash',
  '{"replay": true}'::jsonb, 'v1.0', 'NG-LAGOS-01',
  'sig_val2', 'v1'
);
-- EXPECTED: ERROR — unique constraint violation (tenant_id, request_id)
ROLLBACK;

RESET ROLE;

-- ─── CLEANUP ─────────────────────────────────────────────
-- Remove test data after verification:
--
-- DELETE FROM agent_logs WHERE tenant_id IN ('11111111-...', '22222222-...');
-- DELETE FROM agents WHERE tenant_id IN ('11111111-...', '22222222-...');
-- DELETE FROM users WHERE tenant_id IN ('11111111-...', '22222222-...');
-- DELETE FROM tenants WHERE id IN ('11111111-...', '22222222-...');

-- ============================================================
-- VERIFICATION SUMMARY
-- ============================================================
-- TEST 0: RLS enabled + forced on all tables        → PASS/FAIL
-- TEST 1: Policies exist for all tables              → PASS/FAIL
-- TEST 2: deenvault_app is NOT superuser             → PASS/FAIL
-- TEST 3: No context = zero rows                     → PASS/FAIL
-- TEST 4: Test data inserted                         → PASS/FAIL
-- TEST 5: Tenant Alpha sees only own data            → PASS/FAIL
-- TEST 6: Tenant Beta isolation confirmed            → PASS/FAIL
-- TEST 7: Cross-tenant insert blocked                → PASS/FAIL
-- TEST 8: Append-only (UPDATE + DELETE blocked)      → PASS/FAIL
-- TEST 9: Replay constraint enforced                 → PASS/FAIL
-- ============================================================
