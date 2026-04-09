/**
 * DeenVault AI Agents — Route Registry
 *
 * Mounts governance API routes onto the Express app.
 * Auth routes (/api/auth/*) are mounted separately in server/index.ts.
 */

import { Express } from "express";
import executeRouter from "./execute";
import adminRouter from "./admin";
import adminUsersRouter from "./admin-users";
import adminTenantsRouter from "./admin-tenants";
import adminAgentsRouter from "./admin-agents";
import adminApplicationsRouter from "./admin-applications";
import adminSponsorsRouter from "./admin-sponsors";
import { logger } from "../lib/logger";

export function registerRoutes(app: Express): void {
  // Prevent Railway CDN from caching session-dependent API responses.
  // CDN caching strips Set-Cookie headers, breaking authentication.
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    next();
  });

  // Execution gateway — the core
  app.use("/api/execute", executeRouter);

  // Admin observability — dashboard data
  app.use("/api/admin", adminRouter);

  // Control plane — user, tenant, agent management
  app.use("/api/admin/users", adminUsersRouter);
  app.use("/api/admin/tenants", adminTenantsRouter);
  app.use("/api/admin/agents", adminAgentsRouter);

  // Academy — applications and sponsors
  app.use("/api/admin/applications", adminApplicationsRouter);
  app.use("/api/admin/sponsors", adminSponsorsRouter);

  // Health check — no auth required
  app.get("/api/health", async (_req, res) => {
    try {
      const { checkDatabaseHealth } = await import("../db");
      const dbHealthy = await checkDatabaseHealth();

      res.status(dbHealthy ? 200 : 503).json({
        ok: dbHealthy,
        service: "deenvault-ai-agent-academy",
        region: process.env.REGION_ANCHOR ?? "unknown",
        regionId: process.env.REGION_ID ?? "unknown",
        policyVersion: process.env.POLICY_VERSION ?? "unknown",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error }, "Health check failed");
      res.status(503).json({
        ok: false,
        error: "Health check failed",
      });
    }
  });
}
