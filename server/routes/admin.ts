/**
 * DeenVault AI Agents — Admin Observability Endpoints
 *
 * All endpoints require admin role.
 * All queries are tenant-scoped via withRls().
 *
 * Endpoints:
 *   GET /api/admin/execution-volume   — Execution counts over time
 *   GET /api/admin/security-events    — Security event log
 *   GET /api/admin/geo-violations     — Region violation attempts
 *   GET /api/admin/agent-status       — Agent approval/status summary
 *   GET /api/admin/audit-log          — Full signed audit trail
 *   GET /api/admin/severity-distribution — Security severity counts
 *   GET /api/admin/policy-agent/summary  — Policy agent decision metrics
 */

import { Router, Request, Response } from "express";
import { eq, and, gte, lte, desc, sql, count } from "drizzle-orm";
import { requireAdminSession, getSession } from "../middleware";
import { withRls } from "../db";
import {
  agentLogs,
  securityEvents,
  agents,
} from "../../shared/schema";
import { adminRateLimiter } from "../middleware/rate-limit";
import { logger } from "../lib/logger";

const router = Router();

// All admin routes require admin session + rate limiting
router.use(adminRateLimiter);
router.use(requireAdminSession);

// ─── Query parameter helpers ─────────────────────────────

function getDateRange(req: Request): { from: Date; to: Date } {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const from = req.query.from
    ? new Date(req.query.from as string)
    : thirtyDaysAgo;
  const to = req.query.to ? new Date(req.query.to as string) : now;

  return { from, to };
}

// ─── GET /api/admin/execution-volume ─────────────────────
// Returns daily execution counts for Recharts.

router.get(
  "/execution-volume",
  async (req: Request, res: Response): Promise<void> => {
    const session = getSession(req);
    const { from, to } = getDateRange(req);

    try {
      const result = await withRls(
        session.tenantId,
        session.userId,
        async (tx) => {
          return tx
            .select({
              date: sql<string>`DATE(${agentLogs.createdAt})`.as("date"),
              count: count().as("count"),
            })
            .from(agentLogs)
            .where(
              and(
                gte(agentLogs.createdAt, from),
                lte(agentLogs.createdAt, to)
              )
            )
            .groupBy(sql`DATE(${agentLogs.createdAt})`)
            .orderBy(sql`DATE(${agentLogs.createdAt})`);
        }
      );

      res.json({ data: result, from: from.toISOString(), to: to.toISOString() });
    } catch (error) {
      logger.error({ err: error }, "Admin execution-volume error");
      res.status(500).json({ error: "Failed to fetch execution volume" });
    }
  }
);

// ─── GET /api/admin/security-events ──────────────────────
// Returns security events with pagination.

router.get(
  "/security-events",
  async (req: Request, res: Response): Promise<void> => {
    const session = getSession(req);
    const { from, to } = getDateRange(req);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    try {
      const result = await withRls(
        session.tenantId,
        session.userId,
        async (tx) => {
          return tx
            .select()
            .from(securityEvents)
            .where(
              and(
                gte(securityEvents.createdAt, from),
                lte(securityEvents.createdAt, to)
              )
            )
            .orderBy(desc(securityEvents.createdAt))
            .limit(limit)
            .offset(offset);
        }
      );

      res.json({ data: result, limit, offset });
    } catch (error) {
      logger.error({ err: error }, "Admin security-events error");
      res.status(500).json({ error: "Failed to fetch security events" });
    }
  }
);

// ─── GET /api/admin/geo-violations ───────────────────────
// Filtered view of GEO_VIOLATION security events.

router.get(
  "/geo-violations",
  async (req: Request, res: Response): Promise<void> => {
    const session = getSession(req);
    const { from, to } = getDateRange(req);

    try {
      const result = await withRls(
        session.tenantId,
        session.userId,
        async (tx) => {
          return tx
            .select()
            .from(securityEvents)
            .where(
              and(
                eq(securityEvents.eventType, "GEO_VIOLATION"),
                gte(securityEvents.createdAt, from),
                lte(securityEvents.createdAt, to)
              )
            )
            .orderBy(desc(securityEvents.createdAt));
        }
      );

      res.json({
        data: result,
        total: result.length,
        from: from.toISOString(),
        to: to.toISOString(),
      });
    } catch (error) {
      logger.error({ err: error }, "Admin geo-violations error");
      res.status(500).json({ error: "Failed to fetch geo violations" });
    }
  }
);

// ─── GET /api/admin/agent-status ─────────────────────────
// Summary of all agents: approved, draft, suspended, active.

router.get(
  "/agent-status",
  async (req: Request, res: Response): Promise<void> => {
    const session = getSession(req);

    try {
      const result = await withRls(
        session.tenantId,
        session.userId,
        async (tx) => {
          const allAgents = await tx
            .select({
              id: agents.id,
              name: agents.name,
              status: agents.status,
              approved: agents.approved,
              policyVersion: agents.policyVersion,
              createdAt: agents.createdAt,
              updatedAt: agents.updatedAt,
            })
            .from(agents)
            .orderBy(desc(agents.updatedAt));

          const summary = {
            total: allAgents.length,
            active: allAgents.filter((a) => a.status === "active").length,
            draft: allAgents.filter((a) => a.status === "draft").length,
            suspended: allAgents.filter((a) => a.status === "suspended")
              .length,
            approved: allAgents.filter((a) => a.approved).length,
            unapproved: allAgents.filter((a) => !a.approved).length,
          };

          return { agents: allAgents, summary };
        }
      );

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Admin agent-status error");
      res.status(500).json({ error: "Failed to fetch agent status" });
    }
  }
);

// ─── GET /api/admin/audit-log ────────────────────────────
// Full signed audit trail with pagination.

router.get(
  "/audit-log",
  async (req: Request, res: Response): Promise<void> => {
    const session = getSession(req);
    const { from, to } = getDateRange(req);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    try {
      const result = await withRls(
        session.tenantId,
        session.userId,
        async (tx) => {
          return tx
            .select({
              id: agentLogs.id,
              agentId: agentLogs.agentId,
              requestId: agentLogs.requestId,
              inputHash: agentLogs.inputHash,
              outputHash: agentLogs.outputHash,
              decisionTraceHash: agentLogs.decisionTraceHash,
              policyVersion: agentLogs.policyVersion,
              regionId: agentLogs.regionId,
              hmacSignature: agentLogs.hmacSignature,
              hmacKeyVersion: agentLogs.hmacKeyVersion,
              createdAt: agentLogs.createdAt,
            })
            .from(agentLogs)
            .where(
              and(
                gte(agentLogs.createdAt, from),
                lte(agentLogs.createdAt, to)
              )
            )
            .orderBy(desc(agentLogs.createdAt))
            .limit(limit)
            .offset(offset);
        }
      );

      res.json({ data: result, limit, offset });
    } catch (error) {
      logger.error({ err: error }, "Admin audit-log error");
      res.status(500).json({ error: "Failed to fetch audit log" });
    }
  }
);

// ─── GET /api/admin/severity-distribution ────────────────
// Security event severity counts for Recharts pie/bar chart.

router.get(
  "/severity-distribution",
  async (req: Request, res: Response): Promise<void> => {
    const session = getSession(req);
    const { from, to } = getDateRange(req);

    try {
      const result = await withRls(
        session.tenantId,
        session.userId,
        async (tx) => {
          return tx
            .select({
              severity: securityEvents.severity,
              count: count().as("count"),
            })
            .from(securityEvents)
            .where(
              and(
                gte(securityEvents.createdAt, from),
                lte(securityEvents.createdAt, to)
              )
            )
            .groupBy(securityEvents.severity);
        }
      );

      res.json({ data: result });
    } catch (error) {
      logger.error({ err: error }, "Admin severity-distribution error");
      res
        .status(500)
        .json({ error: "Failed to fetch severity distribution" });
    }
  }
);

// ─── GET /api/admin/policy-agent/summary ─────────────────
// Policy Check Agent governance dashboard.
// Returns decision distribution and deny reasons.

router.get(
  "/policy-agent/summary",
  async (req: Request, res: Response): Promise<void> => {
    const session = getSession(req);
    const { from, to } = getDateRange(req);

    try {
      const result = await withRls(
        session.tenantId,
        session.userId,
        async (tx) => {
          // Get all policy-check agent logs within the date range.
          // Filter by agents that have agent_type = 'policy_check'.
          const logs = await tx
            .select({
              decision: agentLogs.decision,
              decisionReason: agentLogs.decisionReason,
              createdAt: agentLogs.createdAt,
            })
            .from(agentLogs)
            .innerJoin(agents, eq(agentLogs.agentId, agents.id))
            .where(
              and(
                eq(agents.agentType, "policy_check"),
                gte(agentLogs.createdAt, from),
                lte(agentLogs.createdAt, to)
              )
            );

          const total = logs.length;
          const allows = logs.filter((l) => l.decision === "ALLOW").length;
          const safeStops = logs.filter(
            (l) => l.decision === "SAFE_STOP"
          ).length;
          const denies = logs.filter((l) => l.decision === "DENY").length;

          // Denies grouped by reason
          const denyReasons: Record<string, number> = {};
          for (const log of logs) {
            if (log.decision === "DENY" && log.decisionReason) {
              denyReasons[log.decisionReason] =
                (denyReasons[log.decisionReason] || 0) + 1;
            }
          }

          // Safe stops grouped by reason
          const safeStopReasons: Record<string, number> = {};
          for (const log of logs) {
            if (log.decision === "SAFE_STOP" && log.decisionReason) {
              safeStopReasons[log.decisionReason] =
                (safeStopReasons[log.decisionReason] || 0) + 1;
            }
          }

          return {
            total,
            allows,
            safe_stops: safeStops,
            denies,
            deny_reasons: denyReasons,
            safe_stop_reasons: safeStopReasons,
          };
        }
      );

      res.json({
        data: result,
        from: from.toISOString(),
        to: to.toISOString(),
      });
    } catch (error) {
      logger.error({ err: error }, "Admin policy-agent/summary error");
      res
        .status(500)
        .json({ error: "Failed to fetch policy agent summary" });
    }
  }
);

export default router;
