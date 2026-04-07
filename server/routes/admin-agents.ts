/**
 * DeenVault AI Agents — Agent CRUD API
 *
 * Control plane for agent lifecycle management.
 *
 * Endpoints:
 *   GET    /api/admin/agents            — List agents
 *   POST   /api/admin/agents            — Create agent
 *   PATCH  /api/admin/agents/:id        — Update agent
 *   POST   /api/admin/agents/:id/approve  — Approve agent
 *   POST   /api/admin/agents/:id/suspend  — Suspend agent
 *
 * Authorization:
 *   super_admin — cross-tenant
 *   tenant_admin / admin — own tenant only
 */

import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { requireRole } from "../middleware/require-role";
import { getSession } from "../middleware";
import { withRls } from "../db";
import { agents, isSuperAdmin } from "../../shared/schema";
import { createAgentSchema, updateAgentSchema } from "../validation/admin";
import { logAdminAction } from "../lib/admin-audit";
import { logger } from "../lib/logger";

const router = Router();

router.use(requireRole("super_admin", "tenant_admin", "admin"));

// ─── GET /api/admin/agents ──────────────────────────────

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);

  try {
    const result = await withRls(
      session.tenantId,
      session.userId,
      async (tx) => {
        return tx
          .select({
            id: agents.id,
            tenantId: agents.tenantId,
            name: agents.name,
            description: agents.description,
            agentType: agents.agentType,
            policyVersion: agents.policyVersion,
            approved: agents.approved,
            approvedBy: agents.approvedBy,
            approvedAt: agents.approvedAt,
            createdBy: agents.createdBy,
            status: agents.status,
            reviewNotes: agents.reviewNotes,
            createdAt: agents.createdAt,
            updatedAt: agents.updatedAt,
          })
          .from(agents);
      }
    );

    res.json({ data: result, total: result.length });
  } catch (error) {
    logger.error({ err: error }, "Admin list agents error");
    res.status(500).json({ error: "Failed to list agents" });
  }
});

// ─── POST /api/admin/agents ─────────────────────────────
// Creates a new agent definition. Starts in "draft" status.

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);

  const parseResult = createAgentSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: "Invalid request body",
      code: "VALIDATION_ERROR",
      details: parseResult.error.flatten(),
    });
    return;
  }

  const body = parseResult.data;

  // Hash the agent's objective for immutability tracking
  const objectiveHash = createHash("sha256")
    .update(
      JSON.stringify({
        name: body.name,
        type: body.agentType,
        objective: body.objective,
        version: body.policyVersion,
      })
    )
    .digest("hex");

  try {
    const result = await withRls(
      session.tenantId,
      session.userId,
      async (tx) => {
        const [agent] = await tx
          .insert(agents)
          .values({
            tenantId: session.tenantId,
            name: body.name,
            description: body.description,
            agentType: body.agentType,
            immutableObjectiveHash: objectiveHash,
            policyVersion: body.policyVersion,
            createdBy: session.userId,
            status: "draft",
            approved: false,
          })
          .returning({
            id: agents.id,
            name: agents.name,
            agentType: agents.agentType,
            status: agents.status,
            policyVersion: agents.policyVersion,
          });

        await logAdminAction(tx, {
          tenantId: session.tenantId,
          userId: session.userId,
          action: "CREATE_AGENT",
          details: {
            agentId: agent.id,
            agentName: agent.name,
            agentType: agent.agentType,
            objectiveHash,
          },
        });

        return agent;
      }
    );

    logger.info(
      { actorUserId: session.userId, action: "CREATE_AGENT", agentId: result.id },
      "Admin created agent"
    );

    res.status(201).json({ ok: true, agent: result });
  } catch (error) {
    logger.error({ err: error }, "Admin create agent error");
    res.status(500).json({ error: "Failed to create agent" });
  }
});

// ─── PATCH /api/admin/agents/:id ────────────────────────
// Update agent metadata (name, description, status, reviewNotes).

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);
  const agentId = req.params.id;

  const parseResult = updateAgentSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: "Invalid request body",
      code: "VALIDATION_ERROR",
      details: parseResult.error.flatten(),
    });
    return;
  }

  const body = parseResult.data;

  try {
    const result = await withRls(
      session.tenantId,
      session.userId,
      async (tx) => {
        const [existing] = await tx
          .select({ id: agents.id, status: agents.status })
          .from(agents)
          .where(eq(agents.id, agentId))
          .limit(1);

        if (!existing) {
          return { error: "AGENT_NOT_FOUND" as const };
        }

        const updateValues: Record<string, any> = {
          updatedAt: new Date(),
        };
        if (body.name !== undefined) updateValues.name = body.name;
        if (body.description !== undefined) updateValues.description = body.description;
        if (body.status !== undefined) {
          updateValues.status = body.status;
          if (body.status === "suspended") {
            updateValues.suspendedAt = new Date();
          }
        }
        if (body.reviewNotes !== undefined) updateValues.reviewNotes = body.reviewNotes;

        const [updated] = await tx
          .update(agents)
          .set(updateValues)
          .where(eq(agents.id, agentId))
          .returning({
            id: agents.id,
            name: agents.name,
            status: agents.status,
            reviewNotes: agents.reviewNotes,
          });

        await logAdminAction(tx, {
          tenantId: session.tenantId,
          userId: session.userId,
          action: "UPDATE_AGENT",
          details: {
            agentId: updated.id,
            changes: body,
          },
        });

        return { agent: updated };
      }
    );

    if ("error" in result) {
      res.status(404).json({ error: "Agent not found", code: result.error });
      return;
    }

    logger.info(
      { actorUserId: session.userId, action: "UPDATE_AGENT", agentId },
      "Admin updated agent"
    );

    res.json({ ok: true, agent: result.agent });
  } catch (error) {
    logger.error({ err: error }, "Admin update agent error");
    res.status(500).json({ error: "Failed to update agent" });
  }
});

// ─── POST /api/admin/agents/:id/approve ─────────────────
// Approves an agent for execution. Sets approved=true, status=active.

router.post("/:id/approve", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);
  const agentId = req.params.id;

  try {
    const result = await withRls(
      session.tenantId,
      session.userId,
      async (tx) => {
        const [existing] = await tx
          .select({ id: agents.id, name: agents.name, approved: agents.approved })
          .from(agents)
          .where(eq(agents.id, agentId))
          .limit(1);

        if (!existing) {
          return { error: "AGENT_NOT_FOUND" as const };
        }

        if (existing.approved) {
          return { error: "ALREADY_APPROVED" as const };
        }

        const [updated] = await tx
          .update(agents)
          .set({
            approved: true,
            approvedBy: session.userId,
            approvedAt: new Date(),
            status: "active",
            updatedAt: new Date(),
          })
          .where(eq(agents.id, agentId))
          .returning({
            id: agents.id,
            name: agents.name,
            approved: agents.approved,
            status: agents.status,
          });

        await logAdminAction(tx, {
          tenantId: session.tenantId,
          userId: session.userId,
          action: "APPROVE_AGENT",
          details: {
            agentId: updated.id,
            agentName: updated.name,
          },
        });

        return { agent: updated };
      }
    );

    if ("error" in result) {
      const status = result.error === "AGENT_NOT_FOUND" ? 404 : 409;
      res.status(status).json({ error: result.error });
      return;
    }

    logger.info(
      { actorUserId: session.userId, action: "APPROVE_AGENT", agentId },
      "Admin approved agent"
    );

    res.json({ ok: true, agent: result.agent });
  } catch (error) {
    logger.error({ err: error }, "Admin approve agent error");
    res.status(500).json({ error: "Failed to approve agent" });
  }
});

// ─── POST /api/admin/agents/:id/suspend ─────────────────
// Suspends an active agent. Sets status=suspended.

router.post("/:id/suspend", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);
  const agentId = req.params.id;
  const reason = req.body?.reason || "";

  try {
    const result = await withRls(
      session.tenantId,
      session.userId,
      async (tx) => {
        const [existing] = await tx
          .select({ id: agents.id, name: agents.name, status: agents.status })
          .from(agents)
          .where(eq(agents.id, agentId))
          .limit(1);

        if (!existing) {
          return { error: "AGENT_NOT_FOUND" as const };
        }

        if (existing.status === "suspended") {
          return { error: "ALREADY_SUSPENDED" as const };
        }

        const [updated] = await tx
          .update(agents)
          .set({
            status: "suspended",
            suspendedAt: new Date(),
            reviewNotes: reason || null,
            updatedAt: new Date(),
          })
          .where(eq(agents.id, agentId))
          .returning({
            id: agents.id,
            name: agents.name,
            status: agents.status,
          });

        await logAdminAction(tx, {
          tenantId: session.tenantId,
          userId: session.userId,
          action: "SUSPEND_AGENT",
          details: {
            agentId: updated.id,
            agentName: updated.name,
            reason,
          },
        });

        return { agent: updated };
      }
    );

    if ("error" in result) {
      const status = result.error === "AGENT_NOT_FOUND" ? 404 : 409;
      res.status(status).json({ error: result.error });
      return;
    }

    logger.info(
      { actorUserId: session.userId, action: "SUSPEND_AGENT", agentId },
      "Admin suspended agent"
    );

    res.json({ ok: true, agent: result.agent });
  } catch (error) {
    logger.error({ err: error }, "Admin suspend agent error");
    res.status(500).json({ error: "Failed to suspend agent" });
  }
});

export default router;
