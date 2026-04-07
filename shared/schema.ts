/**
 * DeenVault AI Agents — Sovereign Governance Schema
 *
 * This is the data foundation. Every governance guarantee
 * (tenant isolation, audit integrity, region sovereignty)
 * depends on this schema being correct.
 *
 * Tables:
 *   tenants          — Institutional tenant registry
 *   users            — Tenant-scoped user accounts
 *   agents           — Registered AI agent definitions
 *   agent_logs       — Cryptographically signed execution audit trail
 *   security_events  — Governance violation and incident log
 *   hmac_keys        — Region-bound signing key registry
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Enums ───────────────────────────────────────────────

export const regionEnum = pgEnum("region", ["NG", "EG"]);

export const tenantStatusEnum = pgEnum("tenant_status", [
  "active",
  "suspended",
  "pending",
]);

// Phase 2: Added super_admin (platform owner) and tenant_admin (tenant operator).
// "admin" kept for backward compatibility — treated as tenant_admin in middleware.
export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "tenant_admin",
  "admin",
  "instructor",
  "student",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "suspended",
  "pending",
]);

// Phase 2: Added "under_review" for agent governance workflow.
export const agentStatusEnum = pgEnum("agent_status", [
  "active",
  "suspended",
  "draft",
  "under_review",
]);

export const agentTypeEnum = pgEnum("agent_type", [
  "policy_check",
  "general",
]);

// Phase 2: Added "INFO" for admin action audit events.
export const securitySeverityEnum = pgEnum("security_severity", [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
]);

// Phase 2: Added "ADMIN_ACTION" for control plane audit trail.
export const securityEventTypeEnum = pgEnum("security_event_type", [
  "GEO_VIOLATION",
  "AGENT_NOT_APPROVED",
  "REPLAY_DETECTED",
  "INVALID_POLICY_VERSION",
  "SESSION_TAMPER",
  "RLS_CONTEXT_MISSING",
  "UNAUTHORIZED_ACCESS",
  "REGION_MISMATCH",
  "ADMIN_ACTION",
]);

// ─── Tenants ─────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  primaryRegion: regionEnum("primary_region").notNull(),
  regionLocked: boolean("region_locked").notNull().default(true),
  status: tenantStatusEnum("status").notNull().default("active"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Users ───────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    email: text("email").notNull(),
    name: text("name"),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("student"),
    status: userStatusEnum("status").notNull().default("active"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    sessionVersion: integer("session_version").notNull().default(1),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_tenant_email_idx").on(table.tenantId, table.email),
  ]
);

// ─── Agents ──────────────────────────────────────────────

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    agentType: agentTypeEnum("agent_type").notNull().default("general"),
    immutableObjectiveHash: text("immutable_objective_hash").notNull(),
    policyVersion: text("policy_version").notNull(),
    approved: boolean("approved").notNull().default(false),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    status: agentStatusEnum("status").notNull().default("draft"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agents_tenant_idx").on(table.tenantId),
    index("agents_status_idx").on(table.tenantId, table.status),
  ]
);

// ─── Agent Logs (Audit Trail) ────────────────────────────
// This is the cryptographic audit ledger.
// Every field here serves a governance purpose.

export const agentLogs = pgTable(
  "agent_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    decision: text("decision"),
    decisionReason: text("decision_reason"),
    inputHash: text("input_hash").notNull(),
    outputHash: text("output_hash").notNull(),
    decisionTraceHash: text("decision_trace_hash").notNull(),
    canonicalPayload: jsonb("canonical_payload").notNull(),
    policyVersion: text("policy_version").notNull(),
    regionId: text("region_id").notNull(),
    hmacSignature: text("hmac_signature").notNull(),
    hmacKeyVersion: text("hmac_key_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Replay protection: no duplicate request per tenant
    uniqueIndex("agent_logs_tenant_request_idx").on(
      table.tenantId,
      table.requestId
    ),
    index("agent_logs_tenant_agent_idx").on(table.tenantId, table.agentId),
    index("agent_logs_created_idx").on(table.tenantId, table.createdAt),
  ]
);

// ─── Security Events ─────────────────────────────────────

export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    severity: securitySeverityEnum("severity").notNull(),
    eventType: securityEventTypeEnum("event_type").notNull(),
    details: jsonb("details").notNull(),
    sourceIp: text("source_ip"),
    userId: uuid("user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("security_events_tenant_idx").on(table.tenantId),
    index("security_events_severity_idx").on(table.severity, table.createdAt),
    index("security_events_type_idx").on(table.eventType, table.createdAt),
  ]
);

// ─── HMAC Keys ───────────────────────────────────────────
// Region-bound signing keys with rotation support.

export const hmacKeys = pgTable(
  "hmac_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    regionId: text("region_id").notNull(),
    keyVersion: text("key_version").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("hmac_keys_region_version_idx").on(
      table.regionId,
      table.keyVersion
    ),
    index("hmac_keys_active_idx").on(table.regionId, table.active),
  ]
);

// ─── Relations ───────────────────────────────────────────

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  agents: many(agents),
  agentLogs: many(agentLogs),
  securityEvents: many(securityEvents),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  agentLogs: many(agentLogs),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [agents.tenantId],
    references: [tenants.id],
  }),
  approver: one(users, {
    fields: [agents.approvedBy],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [agents.createdBy],
    references: [users.id],
  }),
  logs: many(agentLogs),
}));

export const agentLogsRelations = relations(agentLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [agentLogs.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [agentLogs.userId],
    references: [users.id],
  }),
  agent: one(agents, {
    fields: [agentLogs.agentId],
    references: [agents.id],
  }),
}));

export const securityEventsRelations = relations(securityEvents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [securityEvents.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [securityEvents.userId],
    references: [users.id],
  }),
}));

// ─── Zod Schemas (Validation) ────────────────────────────

export const insertTenantSchema = createInsertSchema(tenants);
export const selectTenantSchema = createSelectSchema(tenants);

export const insertUserSchema = createInsertSchema(users).omit({
  passwordHash: true,
});
export const selectUserSchema = createSelectSchema(users).omit({
  passwordHash: true,
});

export const insertAgentSchema = createInsertSchema(agents);
export const selectAgentSchema = createSelectSchema(agents);

export const insertAgentLogSchema = createInsertSchema(agentLogs);
export const selectAgentLogSchema = createSelectSchema(agentLogs);

export const insertSecurityEventSchema = createInsertSchema(securityEvents);
export const selectSecurityEventSchema = createSelectSchema(securityEvents);

// ─── TypeScript Types ────────────────────────────────────

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export type AgentLog = typeof agentLogs.$inferSelect;
export type NewAgentLog = typeof agentLogs.$inferInsert;

export type SecurityEvent = typeof securityEvents.$inferSelect;
export type NewSecurityEvent = typeof securityEvents.$inferInsert;

export type HmacKey = typeof hmacKeys.$inferSelect;
export type NewHmacKey = typeof hmacKeys.$inferInsert;

// ─── Role Helpers ────────────────────────────────────────

export type UserRole = "super_admin" | "tenant_admin" | "admin" | "instructor" | "student";

/** Roles that can access admin control plane */
export const ADMIN_ROLES: UserRole[] = ["super_admin", "tenant_admin", "admin"];

/** Check if a role has admin privileges (tenant_admin or above) */
export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role as UserRole);
}

/** Check if role is platform-level (super_admin) */
export function isSuperAdmin(role: string): boolean {
  return role === "super_admin";
}

// ─── Execution Request Schema ────────────────────────────

export const executeRequestSchema = z.object({
  agentId: z.string().uuid(),
  input: z.record(z.unknown()),
  policyVersion: z.string(),
});

export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

// ─── Session Type ────────────────────────────────────────

export interface GovernanceSession {
  userId: string;
  tenantId: string;
  role: UserRole;
  sessionVersion: number;
}
