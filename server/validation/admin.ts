/**
 * DeenVault AI Agents — Admin Input Validation
 *
 * Zod schemas for all control plane mutations.
 * Every admin POST/PATCH body is validated through these.
 */

import { z } from "zod";

// ─── Tenant Provisioning ────────────────────────────────

export const createTenantSchema = z.object({
  name: z.string().min(2).max(120),
  primaryRegion: z.enum(["NG", "EG"]),
  regionLocked: z.boolean().default(true),
});

export const updateTenantSchema = z.object({
  status: z.enum(["active", "suspended"]).optional(),
  regionLocked: z.boolean().optional(),
});

// ─── User Management ────────────────────────────────────

export const createUserSchema = z.object({
  tenantId: z.string().uuid().optional(),
  email: z.string().email(),
  name: z.string().min(2).max(120).optional(),
  role: z.enum(["tenant_admin", "instructor", "student"]),
  password: z.string().min(12).max(128),
  mustChangePassword: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  role: z.enum(["tenant_admin", "instructor", "student"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  name: z.string().min(2).max(120).optional(),
  mustChangePassword: z.boolean().optional(),
});

// ─── Agent CRUD ─────────────────────────────────────────

export const createAgentSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(2).max(500),
  agentType: z.enum(["policy_check", "general"]).default("general"),
  objective: z.string().min(10).max(4000),
  policyVersion: z.string().min(1).max(20),
});

export const updateAgentSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().min(2).max(500).optional(),
  status: z.enum(["draft", "under_review", "active", "suspended"]).optional(),
  reviewNotes: z.string().max(4000).optional(),
});
