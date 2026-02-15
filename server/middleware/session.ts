/**
 * DeenVault AI Agents — Session Middleware
 *
 * Enforces authenticated session with tenant context.
 * The session is the SOLE source of tenantId — never the client.
 *
 * Session contains:
 *   userId       — authenticated user
 *   tenantId     — derived from user record at login
 *   role         — admin | instructor | student
 *   sessionVersion — invalidation counter
 */

import { Request, Response, NextFunction } from "express";
import type { GovernanceSession } from "../../shared/schema";

// Extend Express session
declare module "express-session" {
  interface SessionData {
    governance?: GovernanceSession;
  }
}

/**
 * requireUserSession
 *
 * Blocks any request without a valid governance session.
 * tenantId is NEVER accepted from the client.
 */
export function requireUserSession(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const session = req.session?.governance;

  if (!session?.userId || !session?.tenantId || !session?.role) {
    res.status(401).json({
      error: "Authentication required",
      code: "SESSION_MISSING",
    });
    return;
  }

  next();
}

/**
 * requireAdminSession
 *
 * Blocks non-admin users. Used for observability endpoints.
 */
export function requireAdminSession(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const session = req.session?.governance;

  if (!session?.userId || !session?.tenantId) {
    res.status(401).json({
      error: "Authentication required",
      code: "SESSION_MISSING",
    });
    return;
  }

  if (session.role !== "admin") {
    res.status(403).json({
      error: "Admin access required",
      code: "INSUFFICIENT_ROLE",
    });
    return;
  }

  next();
}

/**
 * getSession — Type-safe session accessor
 *
 * Use after requireUserSession to get typed session data.
 * Throws if session is missing (should never happen after middleware).
 */
export function getSession(req: Request): GovernanceSession {
  const session = req.session?.governance;
  if (!session) {
    throw new Error(
      "[getSession] Called without valid session. " +
        "Ensure requireUserSession middleware is applied."
    );
  }
  return session;
}
