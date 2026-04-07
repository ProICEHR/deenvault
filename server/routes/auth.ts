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

// ─── Prevent CDN/proxy caching on ALL auth responses ─────
// Railway CDN can cache responses and strip Set-Cookie headers.
// This middleware ensures auth endpoints are never cached.
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  next();
});

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
    // Wrap in promise for cleaner error handling.

    try {
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      req.session.governance = {
        userId: result.user.id,
        tenantId: result.user.tenantId,
        role: result.user.role,
        sessionVersion: result.user.sessionVersion,
      };

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      logger.info(
        { userId: result.user.id, sessionId: req.sessionID },
        "Login successful, session saved"
      );

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
    } catch (sessionErr) {
      logger.error({ err: sessionErr }, "Session creation failed");
      res.status(500).json({ error: "Session creation failed" });
    }
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
      logger.warn(
        {
          sessionID: req.sessionID,
          hasSession: !!req.session,
          hasCookie: !!req.headers.cookie,
          cookieHeader: req.headers.cookie ? "[present]" : "[absent]",
        },
        "Session check: not authenticated"
      );
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

// ─── GET /api/auth/debug-session ────────────────────────
// Temporary diagnostic endpoint — helps troubleshoot session issues.
// Returns session metadata without sensitive data.

router.get(
  "/debug-session",
  async (req: Request, res: Response): Promise<void> => {
    res.json({
      hasSessionObj: !!req.session,
      sessionID: req.sessionID ? `${req.sessionID.substring(0, 8)}...` : null,
      hasGovernance: !!req.session?.governance,
      hasCookieHeader: !!req.headers.cookie,
      cookieNames: req.headers.cookie
        ? req.headers.cookie.split(";").map((c) => c.trim().split("=")[0])
        : [],
      protocol: req.protocol,
      xForwardedProto: req.headers["x-forwarded-proto"],
      secure: req.secure,
      trustProxy: req.app.get("trust proxy"),
    });
  }
);

export default router;
