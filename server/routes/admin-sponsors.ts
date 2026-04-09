/**
 * DeenVault AI Academy — Sponsor Management API
 *
 * Endpoints:
 *   GET    /api/admin/sponsors       — List sponsors
 *   POST   /api/admin/sponsors       — Create sponsor
 *   PATCH  /api/admin/sponsors/:id   — Update sponsor
 */

import { Router, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { requireAdminSession, getSession } from "../middleware";
import { withRls } from "../db";
import { sponsors } from "../../shared/schema";
import { logAdminAction } from "../lib/admin-audit";
import { adminRateLimiter } from "../middleware/rate-limit";
import { logger } from "../lib/logger";

const router = Router();

router.use(adminRateLimiter);
router.use(requireAdminSession);

// ─── GET / — List sponsors ───────────────────────────────

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);

  try {
    const result = await withRls(session.tenantId, session.userId, async (tx) => {
      return tx
        .select()
        .from(sponsors)
        .orderBy(sql`${sponsors.createdAt} DESC`);
    });

    res.json({ data: result, total: result.length });
  } catch (error) {
    logger.error({ err: error }, "List sponsors error");
    res.status(500).json({ error: "Failed to list sponsors" });
  }
});

// ─── POST / — Create sponsor ─────────────────────────────

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);
  const { name, description, contactEmail } = req.body;

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  try {
    const result = await withRls(session.tenantId, session.userId, async (tx) => {
      const [sponsor] = await tx
        .insert(sponsors)
        .values({
          tenantId: session.tenantId,
          name,
          description: description || null,
          contactEmail: contactEmail || null,
          status: "active",
          createdBy: session.userId,
        })
        .returning();

      await logAdminAction(tx, {
        tenantId: session.tenantId,
        userId: session.userId,
        action: "create_sponsor",
        details: { sponsorId: sponsor.id, name },
      });

      return sponsor;
    });

    res.status(201).json({ ok: true, sponsor: result });
  } catch (error) {
    logger.error({ err: error }, "Create sponsor error");
    res.status(500).json({ error: "Failed to create sponsor" });
  }
});

// ─── PATCH /:id — Update sponsor ─────────────────────────

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);
  const { id } = req.params;
  const { name, description, contactEmail, status } = req.body;

  try {
    const result = await withRls(session.tenantId, session.userId, async (tx) => {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (contactEmail !== undefined) updateData.contactEmail = contactEmail;
      if (status && ["active", "inactive", "completed"].includes(status)) {
        updateData.status = status;
      }

      const [updated] = await tx
        .update(sponsors)
        .set(updateData)
        .where(eq(sponsors.id, id))
        .returning();

      if (!updated) {
        return { error: "SPONSOR_NOT_FOUND" as const };
      }

      await logAdminAction(tx, {
        tenantId: session.tenantId,
        userId: session.userId,
        action: "update_sponsor",
        details: { sponsorId: id, changes: Object.keys(updateData) },
      });

      return { ok: true, sponsor: updated };
    });

    if ("error" in result) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, "Update sponsor error");
    res.status(500).json({ error: "Failed to update sponsor" });
  }
});

export default router;
