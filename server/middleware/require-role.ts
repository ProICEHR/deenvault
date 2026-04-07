/**
 * DeenVault AI Agents — Role-Based Access Middleware
 *
 * Restricts route access to specific roles.
 * Must be applied AFTER requireUserSession.
 *
 * Usage:
 *   router.use(requireRole("super_admin", "tenant_admin"));
 */

import type { Request, Response, NextFunction } from "express";
import type { GovernanceSession } from "../../shared/schema";

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const session = (req.session as any)?.governance as
      | GovernanceSession
      | undefined;

    if (!session?.userId || !session?.tenantId || !session?.role) {
      res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });
      return;
    }

    // Treat legacy "admin" as "tenant_admin"
    const effectiveRole =
      session.role === "admin" ? "tenant_admin" : session.role;

    if (!allowedRoles.includes(effectiveRole) && !allowedRoles.includes(session.role)) {
      res.status(403).json({ error: "Insufficient permissions", code: "FORBIDDEN" });
      return;
    }

    next();
  };
}
