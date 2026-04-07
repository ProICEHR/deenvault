/**
 * DeenVault AI Agents — Admin Audit Logger
 *
 * Every admin mutation (create, update, suspend, approve)
 * must create an audit event. This helper standardizes the format.
 */

import { securityEvents } from "../../shared/schema";

export async function logAdminAction(
  tx: any,
  params: {
    tenantId: string | null;
    userId: string;
    action: string;
    details?: Record<string, unknown>;
    sourceIp?: string;
  }
): Promise<void> {
  await tx.insert(securityEvents).values({
    tenantId: params.tenantId,
    severity: "INFO",
    eventType: "ADMIN_ACTION",
    details: {
      action: params.action,
      actorUserId: params.userId,
      timestamp: new Date().toISOString(),
      ...params.details,
    },
    sourceIp: params.sourceIp || null,
    userId: params.userId,
  });
}
