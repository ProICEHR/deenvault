/**
 * DeenVault AI Agents — Region Sovereignty Gate
 *
 * Enforces that a tenant's execution only occurs in their
 * designated region. If a request arrives at a deployment
 * instance whose REGION_ANCHOR does not match the tenant's
 * primary_region:
 *
 *   1. Execution is BLOCKED
 *   2. A CRITICAL security event is logged
 *   3. 403 is returned
 *
 * This is not optional. This is sovereignty enforcement.
 */

import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, withRls } from "../db";
import { tenants, securityEvents } from "../../shared/schema";
import { getSession } from "./session";

// ─── Region Configuration ────────────────────────────────

export interface RegionConfig {
  regionAnchor: string; // e.g., "NG"
  regionId: string; // e.g., "NG-LAGOS-01"
  hmacRegionKey: string;
  hmacKeyVersion: string;
  policyVersion: string;
}

export function loadRegionConfig(): RegionConfig {
  const regionAnchor = process.env.REGION_ANCHOR;
  const regionId = process.env.REGION_ID;
  const hmacRegionKey = process.env.HMAC_REGION_KEY;
  const hmacKeyVersion = process.env.HMAC_KEY_VERSION;
  const policyVersion = process.env.POLICY_VERSION;

  if (
    !regionAnchor ||
    !regionId ||
    !hmacRegionKey ||
    !hmacKeyVersion ||
    !policyVersion
  ) {
    throw new Error(
      "[RegionGate] Missing required environment variables: " +
        "REGION_ANCHOR, REGION_ID, HMAC_REGION_KEY, HMAC_KEY_VERSION, POLICY_VERSION. " +
        "Cannot start without region configuration."
    );
  }

  return {
    regionAnchor,
    regionId,
    hmacRegionKey,
    hmacKeyVersion,
    policyVersion,
  };
}

/**
 * regionGate
 *
 * Middleware that checks tenant.primary_region against
 * the deployment's REGION_ANCHOR.
 *
 * Must run AFTER requireUserSession (needs tenantId from session).
 */
export function regionGate(config: RegionConfig) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const session = getSession(req);

    try {
      // Fetch tenant's region WITHIN RLS context.
      // withRls() sets app.current_tenant so the query is
      // scoped to the session's tenant. Without this,
      // FORCE RLS returns zero rows and the gate breaks.
      const gateResult = await withRls(
        session.tenantId,
        session.userId,
        async (tx) => {
          const [tenant] = await tx
            .select({
              id: tenants.id,
              primaryRegion: tenants.primaryRegion,
              regionLocked: tenants.regionLocked,
              status: tenants.status,
            })
            .from(tenants)
            .where(eq(tenants.id, session.tenantId))
            .limit(1);

          if (!tenant) {
            return { blocked: true, reason: "TENANT_NOT_FOUND" as const };
          }

          if (tenant.status !== "active") {
            return { blocked: true, reason: "TENANT_SUSPENDED" as const };
          }

          // ─── Region enforcement ───────────────────────────

          if (
            tenant.regionLocked &&
            tenant.primaryRegion !== config.regionAnchor
          ) {
            // Log the violation BEFORE denying — inside RLS context
            // so the insert satisfies the WITH CHECK policy.
            await tx.insert(securityEvents).values({
              tenantId: session.tenantId,
              severity: "CRITICAL",
              eventType: "GEO_VIOLATION",
              details: {
                tenantRegion: tenant.primaryRegion,
                deploymentRegion: config.regionAnchor,
                deploymentId: config.regionId,
                userId: session.userId,
                path: req.path,
                timestamp: new Date().toISOString(),
              },
              sourceIp: req.ip || req.socket.remoteAddress || "unknown",
              userId: session.userId,
            });

            return {
              blocked: true,
              reason: "GEO_VIOLATION" as const,
              tenantRegion: tenant.primaryRegion,
            };
          }

          return { blocked: false };
        }
      );

      // ─── Handle gate results outside transaction ──────

      if (gateResult.blocked) {
        if (gateResult.reason === "TENANT_NOT_FOUND") {
          res.status(403).json({
            error: "Tenant not found",
            code: "TENANT_NOT_FOUND",
          });
          return;
        }
        if (gateResult.reason === "TENANT_SUSPENDED") {
          res.status(403).json({
            error: "Tenant is suspended",
            code: "TENANT_SUSPENDED",
          });
          return;
        }
        if (gateResult.reason === "GEO_VIOLATION") {
          res.status(403).json({
            error: "Region violation: execution blocked",
            code: "GEO_VIOLATION",
            tenantRegion: (gateResult as any).tenantRegion,
            deploymentRegion: config.regionAnchor,
          });
          return;
        }
      }

      // Attach region config to request for downstream use
      (req as any).regionConfig = config;

      next();
    } catch (error) {
      console.error("[RegionGate] Error:", error);
      res.status(500).json({
        error: "Region verification failed",
        code: "REGION_GATE_ERROR",
      });
    }
  };
}

/**
 * getRegionConfig — Type-safe accessor for region config from request
 */
export function getRegionConfig(req: Request): RegionConfig {
  const config = (req as any).regionConfig;
  if (!config) {
    throw new Error(
      "[getRegionConfig] Called without region config. " +
        "Ensure regionGate middleware is applied."
    );
  }
  return config;
}
