/**
 * DeenVault AI Agents — Authentication Routes
 *
 * Endpoints:
 *   POST /api/auth/login   — Authenticate, create governance session
 *   POST /api/auth/logout  — Destroy session
 *   GET  /api/auth/session  — Check current session state
 *
 * Session is the SOLE source of tenantId. It is NEVER accepted
 * from the client. The session is populated from the user's DB
 * record at login time.
 */

import { Router, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { withRls, withSystemContext } from "../db";
import { users, tenants } from "../../shared/schema";
import { verifyPassword } from "../auth";
import { loginRateLimiter } from "../middleware/rate-limit";
import { logger } from "../lib/logger";

// System user UUID for auth bootstrap (before real user is known)
const SYSTEM_AUTH_USER_ID = "00000000-0000-0000-0000-000000000001";

const router = Router();

// ─── POST /api/auth/login ────────────────────────────────

router.post("/login", loginRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, password, tenantId } = req.body;

  if (!email || !password || !tenantId) {
    res.status(400).json({
      error: "Missing required fields: email, password, tenantId",
      code: "MISSING_FIELDS",
    });
    return;
  }

  try {
    // Validate tenant exists and is active.
    // We need to look up the user within their tenant context
    // to satisfy RLS policies.
    const result = await withRls(tenantId, SYSTEM_AUTH_USER_ID, async (tx) => {
      // Check tenant is active
      const [tenant] = await tx
        .select({
          id: tenants.id,
          status: tenants.status,
          primaryRegion: tenants.primaryRegion,
        })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!tenant) {
        return { error: "TENANT_NOT_FOUND" as const };
      }

      if (tenant.status !== "active") {
        return { error: "TENANT_SUSPENDED" as const };
      }

      // Find user by email within this tenant
      const [user] = await tx
        .select()
        .from(users)
        .where(
          and(eq(users.email, email), eq(users.tenantId, tenantId))
        )
        .limit(1);

      if (!user) {
        return { error: "INVALID_CREDENTIALS" as const };
      }

      if (user.status !== "active") {
        return { error: "USER_SUSPENDED" as const };
      }

      // Verify password
      const passwordValid = await verifyPassword(password, user.passwordHash);
      if (!passwordValid) {
        return { error: "INVALID_CREDENTIALS" as const };
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          sessionVersion: user.sessionVersion,
        },
        tenant: {
          id: tenant.id,
          primaryRegion: tenant.primaryRegion,
        },
      };
    });

    // Handle errors
    if ("error" in result) {
      const statusMap: Record<string, number> = {
        TENANT_NOT_FOUND: 404,
        TENANT_SUSPENDED: 403,
        INVALID_CREDENTIALS: 401,
        USER_SUSPENDED: 403,
      };

      res.status(statusMap[result.error] || 400).json({
        error:
          result.error === "INVALID_CREDENTIALS"
            ? "Invalid email or password"
            : result.error.replace(/_/g, " ").toLowerCase(),
        code: result.error,
      });
      return;
    }

    // ─── Create governance session ────────────────────────
    // Regenerate session ID to prevent session fixation.

    req.session.regenerate((err) => {
      if (err) {
        logger.error({ err }, "Session regeneration failed");
        res.status(500).json({ error: "Session creation failed" });
        return;
      }

      req.session.governance = {
        userId: result.user.id,
        tenantId: result.user.tenantId,
        role: result.user.role,
        sessionVersion: result.user.sessionVersion,
      };

      req.session.save((saveErr) => {
        if (saveErr) {
          logger.error({ err: saveErr }, "Session save failed");
          res.status(500).json({ error: "Session creation failed" });
          return;
        }

        res.json({
          success: true,
          user: {
            id: result.user.id,
            email: result.user.email,
            role: result.user.role,
          },
          tenant: {
            id: result.tenant.id,
            region: result.tenant.primaryRegion,
          },
        });
      });
    });
  } catch (error) {
    logger.error({ err: error }, "Login error");
    res.status(500).json({ error: "Authentication failed" });
  }
});

// ─── POST /api/auth/logout ───────────────────────────────

router.post(
  "/logout",
  async (req: Request, res: Response): Promise<void> => {
    req.session.destroy((err) => {
      if (err) {
        logger.error({ err }, "Logout error");
        res.status(500).json({ error: "Logout failed" });
        return;
      }

      res.clearCookie("deenvault.sid");
      res.json({ success: true });
    });
  }
);

// ─── GET /api/auth/session ───────────────────────────────
// Returns current session state. No sensitive data exposed.

router.get(
  "/session",
  async (req: Request, res: Response): Promise<void> => {
    const session = req.session?.governance;

    if (!session) {
      res.status(401).json({
        authenticated: false,
      });
      return;
    }

    res.json({
      authenticated: true,
      userId: session.userId,
      tenantId: session.tenantId,
      role: session.role,
    });
  }
);

export default router;
