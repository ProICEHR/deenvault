/**
 * DeenVault AI Agents — Route Registry
 *
 * Mounts governance API routes onto the Express app.
 * Auth routes (/api/auth/*) are mounted separately in server/index.ts.
 */

import { Express } from "express";
import executeRouter from "./execute";
import adminRouter from "./admin";

export function registerRoutes(app: Express): void {
  // Execution gateway — the core
  app.use("/api/execute", executeRouter);

  // Admin observability — dashboard data
  app.use("/api/admin", adminRouter);

  // Health check — no auth required
  app.get("/api/health", async (_req, res) => {
    const { checkDatabaseHealth } = await import("../db");
    const dbHealthy = await checkDatabaseHealth();

    res.status(dbHealthy ? 200 : 503).json({
      status: dbHealthy ? "healthy" : "degraded",
      region: process.env.REGION_ID || "unknown",
      timestamp: new Date().toISOString(),
    });
  });
}
