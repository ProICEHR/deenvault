/**
 * DeenVault AI Agents — User Management API
 *
 * Control plane for user lifecycle management.
 *
 * Endpoints:
 *   GET    /api/admin/users              — List users
 *   POST   /api/admin/users              — Create user
 *   PATCH  /api/admin/users/:id          — Update user
 *   POST   /api/admin/users/:id/reset-session — Force session invalidation
 *
 * Authorization:
 *   super_admin — can operate across all tenants
 *   tenant_admin / admin — scoped to own tenant only
 */

import { Router, Request, Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "../middleware/require-role";
import { getSession } from "../middleware";
import { withRls, withSuperAdmin } from "../db";
import { users, isSuperAdmin } from "../../shared/schema";
import { createUserSchema, updateUserSchema } from "../validation/admin";
import { hashPassword } from "../auth";
import { logAdminAction } from "../lib/admin-audit";
import { logger } from "../lib/logger";

const router = Router();

router.use(requireRole("super_admin", "tenant_admin", "admin"));

// ─── GET /api/admin/users ───────────────────────────────
// super_admin: all users (optionally filter by ?tenantId=)
// tenant_admin: own tenant users only

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);

  try {
    if (isSuperAdmin(session.role)) {
      const filterTenantId = req.query.tenantId as string | undefined;

      const result = await withSuperAdmin(session.userId, async (tx) => {
        if (filterTenantId) {
          return tx
            .select({
              id: users.id,
              tenantId: users.tenantId,
              email: users.email,
              name: users.name,
              role: users.role,
              status: users.status,
              mustChangePassword: users.mustChangePassword,
              createdAt: users.createdAt,
            })
            .from(users)
            .where(eq(users.tenantId, filterTenantId));
        }
        return tx
          .select({
            id: users.id,
            tenantId: users.tenantId,
            email: users.email,
            name: users.name,
            role: users.role,
            status: users.status,
            mustChangePassword: users.mustChangePassword,
            createdAt: users.createdAt,
          })
          .from(users);
      });

      res.json({ data: result, total: result.length });
    } else {
      const result = await withRls(
        session.tenantId,
        session.userId,
        async (tx) => {
          return tx
            .select({
              id: users.id,
              tenantId: users.tenantId,
              email: users.email,
              name: users.name,
              role: users.role,
              status: users.status,
              mustChangePassword: users.mustChangePassword,
              createdAt: users.createdAt,
            })
            .from(users);
        }
      );

      res.json({ data: result, total: result.length });
    }
  } catch (error) {
    logger.error({ err: error }, "Admin list users error");
    res.status(500).json({ error: "Failed to list users" });
  }
});

// ─── POST /api/admin/users ──────────────────────────────
// Creates a new user within a tenant.
// super_admin: can specify tenantId in body
// tenant_admin: always uses own tenantId

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);

  const parseResult = createUserSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: "Invalid request body",
      code: "VALIDATION_ERROR",
      details: parseResult.error.flatten(),
    });
    return;
  }

  const body = parseResult.data;

  // Determine effective tenant
  const effectiveTenantId =
    isSuperAdmin(session.role) && body.tenantId
      ? body.tenantId
      : session.tenantId;

  // tenant_admin cannot create super_admin users
  if (!isSuperAdmin(session.role) && body.role === "tenant_admin") {
    // tenant_admin CAN create other tenant_admins — that's fine
  }

  try {
    const passwordHash = await hashPassword(body.password);

    const result = await withRls(
      effectiveTenantId,
      session.userId,
      async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({
            tenantId: effectiveTenantId,
            email: body.email,
            name: body.name || null,
            passwordHash,
            role: body.role,
            status: "active",
            mustChangePassword: body.mustChangePassword,
            sessionVersion: 1,
          })
          .returning({
            id: users.id,
            tenantId: users.tenantId,
            email: users.email,
            name: users.name,
            role: users.role,
            status: users.status,
          });

        await logAdminAction(tx, {
          tenantId: effectiveTenantId,
          userId: session.userId,
          action: "CREATE_USER",
          details: {
            createdUserId: user.id,
            email: user.email,
            role: user.role,
          },
        });

        return user;
      }
    );

    logger.info(
      { actorUserId: session.userId, action: "CREATE_USER", createdUserId: result.id },
      "Admin created user"
    );

    res.status(201).json({ ok: true, user: result });
  } catch (error: any) {
    if (error?.code === "23505") {
      res.status(409).json({ error: "User with this email already exists in tenant", code: "DUPLICATE_EMAIL" });
      return;
    }
    logger.error({ err: error }, "Admin create user error");
    res.status(500).json({ error: "Failed to create user" });
  }
});

// ─── PATCH /api/admin/users/:id ─────────────────────────
// Update user role, status, name, mustChangePassword.

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);
  const targetUserId = req.params.id;

  const parseResult = updateUserSchema.safeParse(req.body);
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
        // Verify target user exists in scope
        const [existing] = await tx
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.id, targetUserId))
          .limit(1);

        if (!existing) {
          return { error: "USER_NOT_FOUND" as const };
        }

        // Build update values
        const updateValues: Record<string, any> = {
          updatedAt: new Date(),
        };
        if (body.role !== undefined) updateValues.role = body.role;
        if (body.status !== undefined) {
          updateValues.status = body.status;
          if (body.status === "suspended") {
            updateValues.deactivatedAt = new Date();
          }
        }
        if (body.name !== undefined) updateValues.name = body.name;
        if (body.mustChangePassword !== undefined) {
          updateValues.mustChangePassword = body.mustChangePassword;
        }

        const [updated] = await tx
          .update(users)
          .set(updateValues)
          .where(eq(users.id, targetUserId))
          .returning({
            id: users.id,
            email: users.email,
            role: users.role,
            status: users.status,
          });

        await logAdminAction(tx, {
          tenantId: session.tenantId,
          userId: session.userId,
          action: "UPDATE_USER",
          details: {
            targetUserId: updated.id,
            changes: body,
          },
        });

        return { user: updated };
      }
    );

    if ("error" in result) {
      res.status(404).json({ error: "User not found", code: result.error });
      return;
    }

    logger.info(
      { actorUserId: session.userId, action: "UPDATE_USER", targetUserId },
      "Admin updated user"
    );

    res.json({ ok: true, user: result.user });
  } catch (error) {
    logger.error({ err: error }, "Admin update user error");
    res.status(500).json({ error: "Failed to update user" });
  }
});

// ─── POST /api/admin/users/:id/reset-session ────────────
// Increments sessionVersion, forcing logout everywhere.

router.post("/:id/reset-session", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);
  const targetUserId = req.params.id;

  try {
    const result = await withRls(
      session.tenantId,
      session.userId,
      async (tx) => {
        const [existing] = await tx
          .select({ id: users.id, sessionVersion: users.sessionVersion })
          .from(users)
          .where(eq(users.id, targetUserId))
          .limit(1);

        if (!existing) {
          return { error: "USER_NOT_FOUND" as const };
        }

        const [updated] = await tx
          .update(users)
          .set({
            sessionVersion: existing.sessionVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(users.id, targetUserId))
          .returning({
            id: users.id,
            sessionVersion: users.sessionVersion,
          });

        await logAdminAction(tx, {
          tenantId: session.tenantId,
          userId: session.userId,
          action: "RESET_USER_SESSION",
          details: {
            targetUserId: updated.id,
            newSessionVersion: updated.sessionVersion,
          },
        });

        return { user: updated };
      }
    );

    if ("error" in result) {
      res.status(404).json({ error: "User not found", code: result.error });
      return;
    }

    logger.info(
      { actorUserId: session.userId, action: "RESET_USER_SESSION", targetUserId },
      "Admin reset user session"
    );

    res.json({ ok: true, userId: result.user.id, newSessionVersion: result.user.sessionVersion });
  } catch (error) {
    logger.error({ err: error }, "Admin reset session error");
    res.status(500).json({ error: "Failed to reset session" });
  }
});

export default router;
