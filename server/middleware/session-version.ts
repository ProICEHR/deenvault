/**
 * DeenVault AI Agents — Session Version Enforcement
 *
 * Checks that the session's sessionVersion matches the user's
 * current sessionVersion in the database. If an admin bumps
 * a user's sessionVersion, all existing sessions are invalidated.
 */

import type { Request, Response, NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { withRls } from "../db";
import { users } from "../../shared/schema";

export async function enforceSessionVersion(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const session = (req.session as any)?.governance;

  if (!session?.userId || !session?.tenantId) {
    res.status(401).json({ error: "AUTH_REQUIRED" });
    return;
  }

  try {
    const user = await withRls(
      session.tenantId,
      session.userId,
      async (tx) => {
        const [found] = await tx
          .select({ sessionVersion: users.sessionVersion })
          .from(users)
          .where(
            and(
              eq(users.id, session.userId),
              eq(users.tenantId, session.tenantId)
            )
          )
          .limit(1);
        return found;
      }
    );

    if (!user) {
      req.session.destroy(() => {});
      res.status(401).json({ error: "USER_NOT_FOUND" });
      return;
    }

    if (user.sessionVersion !== (session.sessionVersion ?? 1)) {
      req.session.destroy(() => {});
      res.status(401).json({ error: "SESSION_INVALIDATED" });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}
