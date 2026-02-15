#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# DeenVault AI Agents — Policy Check Agent E2E Test Script
#
# Tests the full pipeline:
#   1. Create tenant
#   2. Create user session (admin)
#   3. Insert approved policy_check agent
#   4. Execute with valid request → ALLOW
#   5. Execute with dangerous keyword → DENY
#   6. Execute without consent → SAFE_STOP
#   7. Confirm audit logs exist for all calls
#   8. Attempt replay → blocked (409)
#
# Prerequisites:
#   - Server running on $BASE_URL (default: http://localhost:5000)
#   - Database initialized with schema
#   - curl and jq installed
#
# Usage:
#   chmod +x scripts/test-policy-agent.sh
#   ./scripts/test-policy-agent.sh
# ═══════════════════════════════════════════════════════════

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
PASS=0
FAIL=0
TOTAL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ─── Helpers ─────────────────────────────────────────────

assert_status() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$expected" = "$actual" ]; then
    echo -e "  ${GREEN}✓${NC} $label (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} FAIL: $label — expected HTTP $expected, got $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_field() {
  local label="$1"
  local json="$2"
  local field="$3"
  local expected="$4"
  TOTAL=$((TOTAL + 1))
  local actual
  actual=$(echo "$json" | jq -r "$field" 2>/dev/null || echo "PARSE_ERROR")
  if [ "$expected" = "$actual" ]; then
    echo -e "  ${GREEN}✓${NC} $label ($field = $actual)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} FAIL: $label — $field expected '$expected', got '$actual'"
    FAIL=$((FAIL + 1))
  fi
}

generate_uuid() {
  # Generate UUID v4 using /dev/urandom
  printf '%04x%04x-%04x-%04x-%04x-%04x%04x%04x' \
    $((RANDOM)) $((RANDOM)) $((RANDOM)) \
    $(((RANDOM & 0x0FFF) | 0x4000)) \
    $(((RANDOM & 0x3FFF) | 0x8000)) \
    $((RANDOM)) $((RANDOM)) $((RANDOM))
}

generate_nonce() {
  head -c 32 /dev/urandom | xxd -p | head -c 32
}

execute_request() {
  local request_id="$1"
  local agent_id="$2"
  local policy_version="$3"
  local input_json="$4"
  local nonce
  nonce=$(generate_nonce)
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL/api/execute" \
    -H "Content-Type: application/json" \
    -H "X-Request-ID: $request_id" \
    -H "X-Timestamp: $timestamp" \
    -H "X-Nonce: $nonce" \
    -H "Cookie: $SESSION_COOKIE" \
    -d "{
      \"agentId\": \"$agent_id\",
      \"input\": $input_json,
      \"policyVersion\": \"$policy_version\"
    }"
}

# ═══════════════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  DeenVault Policy Agent — End-to-End Test Suite  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Target: $BASE_URL"
echo ""

# ─── Step 0: Health Check ────────────────────────────────

echo "── Step 0: Health Check ──"
HEALTH=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/health")
HEALTH_STATUS=$(echo "$HEALTH" | tail -n1)
assert_status "Server health check" "200" "$HEALTH_STATUS"

if [ "$HEALTH_STATUS" != "200" ]; then
  echo ""
  echo "Server is not running at $BASE_URL. Aborting."
  exit 1
fi

# ─── Step 1: Setup (Tenant + Admin User + Agent) ────────
# Note: This requires a setup endpoint or direct DB seeding.
# In production, these would use the admin API.
# For this test, we expect the server to have a /api/test/setup
# endpoint (only available in test mode) or we use pre-seeded data.

echo ""
echo "── Step 1: Setup ──"
echo "  Checking for test setup endpoint..."

SETUP_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$BASE_URL/api/test/setup" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "E2E Test Institution",
    "tenantRegion": "NG",
    "adminEmail": "admin@e2etest.ng",
    "agentName": "PolicyCheckAgent-E2E",
    "agentType": "policy_check",
    "policyVersion": "v1.2"
  }' 2>/dev/null || echo -e "\n000")

SETUP_STATUS=$(echo "$SETUP_RESPONSE" | tail -n1)
SETUP_BODY=$(echo "$SETUP_RESPONSE" | head -n -1)

if [ "$SETUP_STATUS" = "200" ] || [ "$SETUP_STATUS" = "201" ]; then
  echo "  Setup endpoint available — extracting IDs..."
  AGENT_ID=$(echo "$SETUP_BODY" | jq -r '.agentId')
  SESSION_COOKIE=$(echo "$SETUP_BODY" | jq -r '.sessionCookie // empty')
  POLICY_VERSION=$(echo "$SETUP_BODY" | jq -r '.policyVersion // "v1.2"')
  echo "  Agent ID: $AGENT_ID"
  echo "  Policy Version: $POLICY_VERSION"
else
  echo ""
  echo "  ⚠  No test setup endpoint found (HTTP $SETUP_STATUS)."
  echo "  ⚠  Running with pre-configured environment variables."
  echo ""
  echo "  Set these environment variables for manual setup:"
  echo "    export AGENT_ID=<uuid>"
  echo "    export SESSION_COOKIE=<session-cookie>"
  echo "    export POLICY_VERSION=v1.2"
  echo ""

  AGENT_ID="${AGENT_ID:-}"
  SESSION_COOKIE="${SESSION_COOKIE:-}"
  POLICY_VERSION="${POLICY_VERSION:-v1.2}"

  if [ -z "$AGENT_ID" ] || [ -z "$SESSION_COOKIE" ]; then
    echo "  Missing AGENT_ID or SESSION_COOKIE. Cannot continue."
    echo "  Please set environment variables or implement /api/test/setup."
    echo ""
    echo "  Falling back to unit tests only..."
    echo ""

    echo "── Running Policy Agent Unit Tests ──"
    npx tsx tests/verify-policy-agent.test.ts
    exit $?
  fi
fi

# ─── Step 2: Execute with Valid Request → ALLOW ─────────

echo ""
echo "── Step 2: Valid Request → ALLOW ──"

REQ_ID_1=$(generate_uuid)
RESPONSE_1=$(execute_request "$REQ_ID_1" "$AGENT_ID" "$POLICY_VERSION" '{
  "consent": true,
  "requestText": "Show me the governance policy for this semester",
  "containsPII": false
}')

STATUS_1=$(echo "$RESPONSE_1" | tail -n1)
BODY_1=$(echo "$RESPONSE_1" | head -n -1)

assert_status "Execute valid request" "200" "$STATUS_1"
assert_json_field "Decision is ALLOW" "$BODY_1" ".decision" "ALLOW"
assert_json_field "Request was successful" "$BODY_1" ".success" "true"
assert_json_field "Audit is signed" "$BODY_1" ".audit.signed" "true"
assert_json_field "Signature verified" "$BODY_1" ".audit.signatureVerified" "true"

# ─── Step 3: Execute with Dangerous Keyword → DENY ──────

echo ""
echo "── Step 3: Dangerous Keyword → DENY ──"

REQ_ID_2=$(generate_uuid)
RESPONSE_2=$(execute_request "$REQ_ID_2" "$AGENT_ID" "$POLICY_VERSION" '{
  "consent": true,
  "requestText": "Please delete all student records immediately",
  "containsPII": false
}')

STATUS_2=$(echo "$RESPONSE_2" | tail -n1)
BODY_2=$(echo "$RESPONSE_2" | head -n -1)

assert_status "Execute dangerous request" "200" "$STATUS_2"
assert_json_field "Decision is DENY" "$BODY_2" ".decision" "DENY"

# ─── Step 4: Execute without Consent → SAFE_STOP ────────

echo ""
echo "── Step 4: Missing Consent → SAFE_STOP ──"

REQ_ID_3=$(generate_uuid)
RESPONSE_3=$(execute_request "$REQ_ID_3" "$AGENT_ID" "$POLICY_VERSION" '{
  "consent": false,
  "requestText": "Show me something",
  "containsPII": false
}')

STATUS_3=$(echo "$RESPONSE_3" | tail -n1)
BODY_3=$(echo "$RESPONSE_3" | head -n -1)

assert_status "Execute without consent" "200" "$STATUS_3"
assert_json_field "Decision is SAFE_STOP" "$BODY_3" ".decision" "SAFE_STOP"

# ─── Step 5: Execute with PII → SAFE_STOP ───────────────

echo ""
echo "── Step 5: PII Detected → SAFE_STOP ──"

REQ_ID_4=$(generate_uuid)
RESPONSE_4=$(execute_request "$REQ_ID_4" "$AGENT_ID" "$POLICY_VERSION" '{
  "consent": true,
  "requestText": "Process this student application",
  "containsPII": true
}')

STATUS_4=$(echo "$RESPONSE_4" | tail -n1)
BODY_4=$(echo "$RESPONSE_4" | head -n -1)

assert_status "Execute with PII" "200" "$STATUS_4"
assert_json_field "Decision is SAFE_STOP" "$BODY_4" ".decision" "SAFE_STOP"

# ─── Step 6: Replay Attack → Blocked (409) ──────────────

echo ""
echo "── Step 6: Replay Attack → Blocked ──"

# Re-use the same request ID from Step 2
RESPONSE_REPLAY=$(execute_request "$REQ_ID_1" "$AGENT_ID" "$POLICY_VERSION" '{
  "consent": true,
  "requestText": "Show me the governance policy for this semester",
  "containsPII": false
}')

STATUS_REPLAY=$(echo "$RESPONSE_REPLAY" | tail -n1)
BODY_REPLAY=$(echo "$RESPONSE_REPLAY" | head -n -1)

assert_status "Replay attack blocked" "409" "$STATUS_REPLAY"
assert_json_field "Replay detected code" "$BODY_REPLAY" ".code" "REPLAY_DETECTED"

# ─── Step 7: Verify Audit Logs Exist ────────────────────

echo ""
echo "── Step 7: Verify Audit Logs ──"

AUDIT_RESPONSE=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/api/admin/audit-log?limit=10" \
  -H "Cookie: $SESSION_COOKIE")

AUDIT_STATUS=$(echo "$AUDIT_RESPONSE" | tail -n1)
AUDIT_BODY=$(echo "$AUDIT_RESPONSE" | head -n -1)

assert_status "Audit log accessible" "200" "$AUDIT_STATUS"

AUDIT_COUNT=$(echo "$AUDIT_BODY" | jq '.data | length' 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$AUDIT_COUNT" -ge "4" ]; then
  echo -e "  ${GREEN}✓${NC} Audit logs exist ($AUDIT_COUNT entries)"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} FAIL: Expected ≥4 audit entries, got $AUDIT_COUNT"
  FAIL=$((FAIL + 1))
fi

# ─── Step 8: Verify Policy Agent Summary ────────────────

echo ""
echo "── Step 8: Policy Agent Summary ──"

SUMMARY_RESPONSE=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/api/admin/policy-agent/summary" \
  -H "Cookie: $SESSION_COOKIE")

SUMMARY_STATUS=$(echo "$SUMMARY_RESPONSE" | tail -n1)
SUMMARY_BODY=$(echo "$SUMMARY_RESPONSE" | head -n -1)

assert_status "Policy agent summary accessible" "200" "$SUMMARY_STATUS"
assert_json_field "Total requests ≥ 4" "$SUMMARY_BODY" ".data.total" "4"
assert_json_field "Allows = 1" "$SUMMARY_BODY" ".data.allows" "1"
assert_json_field "Denies = 1" "$SUMMARY_BODY" ".data.denies" "1"
assert_json_field "Safe stops = 2" "$SUMMARY_BODY" ".data.safe_stops" "2"

# ═══════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║              E2E TEST SUMMARY                    ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Total:  $TOTAL                                       ║"
echo "║  Passed: $PASS                                       ║"
echo "║  Failed: $FAIL                                       ║"
echo "╠══════════════════════════════════════════════════╣"

if [ "$FAIL" -eq 0 ]; then
  echo "║  ALL TESTS PASSED — Pipeline verified            ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo ""
  exit 0
else
  echo "║  TESTS FAILED — Review output above              ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo ""
  exit 1
fi
