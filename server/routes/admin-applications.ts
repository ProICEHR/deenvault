/**
 * DeenVault AI Academy — Application Management API
 *
 * Endpoints:
 *   GET    /api/admin/applications           — List applications
 *   POST   /api/admin/applications           — Create application
 *   PATCH  /api/admin/applications/:id       — Update application
 *   POST   /api/admin/applications/:id/review    — Move to reviewed
 *   POST   /api/admin/applications/:id/accept    — Accept application
 *   POST   /api/admin/applications/:id/reject    — Reject application
 *   POST   /api/admin/applications/:id/onboard   — Onboard accepted learner
 *   GET    /api/admin/applications/stats     — Academy pipeline stats
 */

import { Router, Request, Response } from "express";
import { eq, and, count, sql } from "drizzle-orm";
import { requireAdminSession, getSession } from "../middleware";
import { withRls } from "../db";
import { applications, sponsors, type ApplicationStatus } from "../../shared/schema";
import { logAdminAction } from "../lib/admin-audit";
import { adminRateLimiter } from "../middleware/rate-limit";
import { logger } from "../lib/logger";

const router = Router();

router.use(adminRateLimiter);
router.use(requireAdminSession);

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  applied: ["reviewed", "rejected"],
  reviewed: ["accepted", "rejected"],
  accepted: ["onboarded", "rejected"],
  rejected: [], // terminal
  onboarded: [], // terminal
};

// ─── GET /stats — Pipeline statistics ────────────────────

router.get("/stats", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);

  try {
    const result = await withRls(session.tenantId, session.userId, async (tx) => {
      const rows = await tx
        .select({
          status: applications.status,
          count: count().as("count"),
        })
        .from(applications)
        .groupBy(applications.status);

      const stats: Record<string, number> = {
        applied: 0,
        reviewed: 0,
        accepted: 0,
        rejected: 0,
        onboarded: 0,
      };

      for (const row of rows) {
        stats[row.status] = Number(row.count);
      }

      const total = Object.values(stats).reduce((a, b) => a + b, 0);

      // Sponsor count
      const [sponsorRow] = await tx
        .select({ count: count().as("count") })
        .from(sponsors);

      return {
        totalApplications: total,
        acceptedLearners: stats.accepted + stats.onboarded,
        activeLearners: stats.onboarded,
        pendingReview: stats.applied + stats.reviewed,
        rejected: stats.rejected,
        totalSponsors: Number(sponsorRow?.count || 0),
        byStatus: stats,
      };
    });

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, "Application stats error");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── GET / — List applications ───────────────────────────

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);
  const statusFilter = req.query.status as string | undefined;

  try {
    const result = await withRls(session.tenantId, session.userId, async (tx) => {
      let query = tx.select().from(applications);

      if (statusFilter && statusFilter in VALID_TRANSITIONS) {
        query = query.where(eq(applications.status, statusFilter as ApplicationStatus)) as any;
      }

      return query.orderBy(sql`${applications.createdAt} DESC`);
    });

    res.json({ data: result, total: result.length });
  } catch (error) {
    logger.error({ err: error }, "List applications error");
    res.status(500).json({ error: "Failed to list applications" });
  }
});

// ─── POST / — Create application ─────────────────────────

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);
  const { applicantName, applicantEmail, programName, sponsorId } = req.body;

  if (!applicantName || !applicantEmail) {
    res.status(400).json({ error: "applicantName and applicantEmail are required" });
    return;
  }

  try {
    const result = await withRls(session.tenantId, session.userId, async (tx) => {
      const [app] = await tx
        .insert(applications)
        .values({
          tenantId: session.tenantId,
          applicantName,
          applicantEmail,
          programName: programName || null,
          sponsorId: sponsorId || null,
          status: "applied",
          createdBy: session.userId,
        })
        .returning();

      await logAdminAction(tx, {
        tenantId: session.tenantId,
        userId: session.userId,
        action: "create_application",
        details: {
          applicationId: app.id,
          applicantName,
          applicantEmail,
        },
      });

      return app;
    });

    res.status(201).json({ ok: true, application: result });
  } catch (error) {
    logger.error({ err: error }, "Create application error");
    res.status(500).json({ error: "Failed to create application" });
  }
});

// ─── Status transition helper ────────────────────────────

async function transitionStatus(
  req: Request,
  res: Response,
  targetStatus: ApplicationStatus
): Promise<void> {
  const session = getSession(req);
  const { id } = req.params;
  const { reviewNotes, sponsorId } = req.body || {};

  if (!id) {
    res.status(400).json({ error: "Application ID required" });
    return;
  }

  try {
    const result = await withRls(session.tenantId, session.userId, async (tx) => {
      // Get current application
      const [app] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, id))
        .limit(1);

      if (!app) {
        return { error: "APPLICATION_NOT_FOUND" as const };
      }

      // Validate transition
      const allowed = VALID_TRANSITIONS[app.status] || [];
      if (!allowed.includes(targetStatus)) {
        return {
          error: "INVALID_TRANSITION" as const,
          detail: `Cannot transition from '${app.status}' to '${targetStatus}'`,
        };
      }

      // Update
      const updateData: Record<string, unknown> = {
        status: targetStatus,
        updatedAt: new Date(),
      };

      if (targetStatus === "reviewed" || targetStatus === "accepted" || targetStatus === "rejected") {
        updateData.reviewedBy = session.userId;
        updateData.reviewedAt = new Date();
      }

      if (reviewNotes) {
        updateData.reviewNotes = reviewNotes;
      }

      if (sponsorId && targetStatus === "accepted") {
        updateData.sponsorId = sponsorId;
      }

      const [updated] = await tx
        .update(applications)
        .set(updateData)
        .where(eq(applications.id, id))
        .returning();

      await logAdminAction(tx, {
        tenantId: session.tenantId,
        userId: session.userId,
        action: `application_${targetStatus}`,
        details: {
          applicationId: id,
          applicantName: app.applicantName,
          fromStatus: app.status,
          toStatus: targetStatus,
          reviewNotes: reviewNotes || null,
        },
      });

      return { ok: true, application: updated };
    });

    if ("error" in result) {
      const status = result.error === "APPLICATION_NOT_FOUND" ? 404 : 400;
      res.status(status).json({ error: result.error, detail: (result as any).detail });
      return;
    }

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, `Application ${targetStatus} error`);
    res.status(500).json({ error: `Failed to ${targetStatus} application` });
  }
}

// ─── POST /:id/review — Review application ───────────────

router.post("/:id/review", (req, res) => transitionStatus(req, res, "reviewed"));

// ─── POST /:id/accept — Accept application ───────────────

router.post("/:id/accept", (req, res) => transitionStatus(req, res, "accepted"));

// ─── POST /:id/reject — Reject application ───────────────

router.post("/:id/reject", (req, res) => transitionStatus(req, res, "rejected"));

// ─── POST /:id/onboard — Onboard accepted learner ────────

router.post("/:id/onboard", (req, res) => transitionStatus(req, res, "onboarded"));

export default router;
