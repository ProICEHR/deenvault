/**
 * DeenVault AI Agents — Tenant Provisioning API
 *
 * Control plane for institutional tenant lifecycle.
 *
 * Endpoints:
 *   GET    /api/admin/tenants       — List tenants
 *   POST   /api/admin/tenants       — Create tenant
 *   PATCH  /api/admin/tenants/:id   — Update tenant (suspend/activate)
 *
 * Authorization:
 *   super_admin ONLY — tenants are platform-level entities.
 *   tenant_admin cannot provision other tenants.
 */

import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { requireRole } from "../middleware/require-role";
import { getSession } from "../middleware";
import { withSuperAdmin } from "../db";
import { tenants } from "../../shared/schema";
import { createTenantSchema, updateTenantSchema } from "../validation/admin";
import { logAdminAction } from "../lib/admin-audit";
import { logger } from "../lib/logger";

const router = Router();

// All tenant provisioning requires super_admin
router.use(requireRole("super_admin"));

// ─── GET /api/admin/tenants ─────────────────────────────
// Lists all tenants. Only super_admin can see cross-tenant.

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);

  try {
    const result = await withSuperAdmin(session.userId, async (tx) => {
      return tx
        .select({
          id: tenants.id,
          name: tenants.name,
          primaryRegion: tenants.primaryRegion,
          regionLocked: tenants.regionLocked,
          status: tenants.status,
          suspendedAt: tenants.suspendedAt,
          createdAt: tenants.createdAt,
        })
        .from(tenants);
    });

    res.json({ data: result, total: result.length });
  } catch (error) {
    logger.error({ err: error }, "Admin list tenants error");
    res.status(500).json({ error: "Failed to list tenants" });
  }
});

// ─── POST /api/admin/tenants ────────────────────────────
// Creates a new institutional tenant.

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);

  const parseResult = createTenantSchema.safeParse(req.body);
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
    const result = await withSuperAdmin(session.userId, async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: body.name,
          primaryRegion: body.primaryRegion,
          regionLocked: body.regionLocked,
          status: "active",
        })
        .returning({
          id: tenants.id,
          name: tenants.name,
          primaryRegion: tenants.primaryRegion,
          status: tenants.status,
        });

      await logAdminAction(tx, {
        tenantId: tenant.id,
        userId: session.userId,
        action: "CREATE_TENANT",
        details: {
          tenantName: tenant.name,
          region: tenant.primaryRegion,
        },
      });

      return tenant;
    });

    logger.info(
      { actorUserId: session.userId, action: "CREATE_TENANT", tenantId: result.id },
      "Super admin created tenant"
    );

    res.status(201).json({ ok: true, tenant: result });
  } catch (error) {
    logger.error({ err: error }, "Admin create tenant error");
    res.status(500).json({ error: "Failed to create tenant" });
  }
});

// ─── PATCH /api/admin/tenants/:id ───────────────────────
// Update tenant status (suspend/activate) or regionLocked.

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);
  const tenantId = req.params.id;

  const parseResult = updateTenantSchema.safeParse(req.body);
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
    const result = await withSuperAdmin(session.userId, async (tx) => {
      const [existing] = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!existing) {
        return { error: "TENANT_NOT_FOUND" as const };
      }

      const updateValues: Record<string, any> = {
        updatedAt: new Date(),
      };
      if (body.status !== undefined) {
        updateValues.status = body.status;
        if (body.status === "suspended") {
          updateValues.suspendedAt = new Date();
        } else {
          updateValues.suspendedAt = null;
        }
      }
      if (body.regionLocked !== undefined) {
        updateValues.regionLocked = body.regionLocked;
      }

      const [updated] = await tx
        .update(tenants)
        .set(updateValues)
        .where(eq(tenants.id, tenantId))
        .returning({
          id: tenants.id,
          name: tenants.name,
          status: tenants.status,
          regionLocked: tenants.regionLocked,
        });

      await logAdminAction(tx, {
        tenantId: updated.id,
        userId: session.userId,
        action: "UPDATE_TENANT",
        details: {
          tenantName: updated.name,
          changes: body,
        },
      });

      return { tenant: updated };
    });

    if ("error" in result) {
      res.status(404).json({ error: "Tenant not found", code: result.error });
      return;
    }

    logger.info(
      { actorUserId: session.userId, action: "UPDATE_TENANT", tenantId },
      "Super admin updated tenant"
    );

    res.json({ ok: true, tenant: result.tenant });
  } catch (error) {
    logger.error({ err: error }, "Admin update tenant error");
    res.status(500).json({ error: "Failed to update tenant" });
  }
});

export default router;
