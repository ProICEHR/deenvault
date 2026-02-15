/**
 * DeenVault AI Agents — Execution Gateway
 *
 * POST /api/execute
 *
 * This is the heart of the governance engine.
 * Every agent execution flows through this single endpoint.
 *
 * Execution Flow (deterministic order):
 *   1. requireUserSession        — Is the user authenticated?
 *   2. requireReplayHeaders      — Are anti-replay headers present?
 *   3. regionGate                — Is this the correct region?
 *   4. Validate request body     — Is the input well-formed?
 *   5. withRls transaction:
 *      a. Validate agent ownership + approval + status
 *      b. Freeze policy version
 *      c. Execute stateless agent logic
 *      d. Hash input/output/trace
 *      e. HMAC sign canonical payload
 *      f. Insert agent_log
 *   6. Return response
 *
 * If any step fails, execution stops. No partial execution.
 */

import { Router, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import {
  requireUserSession,
  requireReplayHeaders,
  regionGate,
  getSession,
  getReplayContext,
  getRegionConfig,
  loadRegionConfig,
} from "../middleware";
import { withRls } from "../db";
import {
  agents,
  agentLogs,
  securityEvents,
  executeRequestSchema,
} from "../../shared/schema";
import { generateExecutionHashes, hmacVerify, buildCanonicalPayload } from "../crypto";
import {
  runPolicyCheckAgent,
  type PolicyCheckInput,
  type PolicyCheckOutput,
} from "../agents/policy-check";

const router = Router();
const regionConfig = loadRegionConfig();

// ─── Middleware Stack (order matters) ────────────────────

router.use(requireUserSession);
router.use(requireReplayHeaders);
router.use(regionGate(regionConfig));

// ─── POST /api/execute ──────────────────────────────────

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const session = getSession(req);
  const replay = getReplayContext(req);
  const region = getRegionConfig(req);

  // ─── 1. Validate request body ─────────────────────────

  const parseResult = executeRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      error: "Invalid request body",
      code: "INVALID_REQUEST",
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { agentId, input, policyVersion } = parseResult.data;

  // ─── 2. Execute within tenant-scoped transaction ──────

  try {
    const result = await withRls(
      session.tenantId,
      session.userId,
      async (tx) => {
        // ─── 2a. Validate agent ───────────────────────────

        const [agent] = await tx
          .select()
          .from(agents)
          .where(
            and(
              eq(agents.id, agentId),
              eq(agents.tenantId, session.tenantId)
            )
          )
          .limit(1);

        if (!agent) {
          // Agent not found OR belongs to different tenant (RLS blocks it)
          await tx.insert(securityEvents).values({
            tenantId: session.tenantId,
            severity: "HIGH",
            eventType: "UNAUTHORIZED_ACCESS",
            details: {
              reason: "Agent not found in tenant scope",
              agentId,
              userId: session.userId,
              requestId: replay.requestId,
            },
            sourceIp: req.ip || "unknown",
            userId: session.userId,
          });

          return { status: 404, body: { error: "Agent not found", code: "AGENT_NOT_FOUND" } };
        }

        if (!agent.approved) {
          await tx.insert(securityEvents).values({
            tenantId: session.tenantId,
            severity: "HIGH",
            eventType: "AGENT_NOT_APPROVED",
            details: {
              agentId,
              agentName: agent.name,
              userId: session.userId,
              requestId: replay.requestId,
            },
            sourceIp: req.ip || "unknown",
            userId: session.userId,
          });

          return { status: 403, body: { error: "Agent not approved", code: "AGENT_NOT_APPROVED" } };
        }

        if (agent.status !== "active") {
          return { status: 403, body: { error: "Agent is not active", code: "AGENT_INACTIVE" } };
        }

        // ─── 2b. Policy version check ────────────────────

        if (agent.policyVersion !== policyVersion) {
          await tx.insert(securityEvents).values({
            tenantId: session.tenantId,
            severity: "HIGH",
            eventType: "INVALID_POLICY_VERSION",
            details: {
              expected: agent.policyVersion,
              received: policyVersion,
              agentId,
              userId: session.userId,
              requestId: replay.requestId,
            },
            sourceIp: req.ip || "unknown",
            userId: session.userId,
          });

          return {
            status: 409,
            body: {
              error: "Policy version mismatch",
              code: "POLICY_VERSION_MISMATCH",
              expected: agent.policyVersion,
            },
          };
        }

        // ─── 2c. Execute stateless agent logic ───────────
        // Route to the appropriate agent based on agentType.
        // Each agent is a pure function: input → output.
        // No agent code ever calls DB directly.

        let agentOutput: Record<string, unknown>;
        let decisionTrace: Record<string, unknown>;
        let decision: string | undefined;
        let decisionReason: string | undefined;

        if (agent.agentType === "policy_check") {
          // Build PolicyCheckInput from the request input
          const policyInput: PolicyCheckInput = {
            tenantId: session.tenantId,
            regionAnchor: region.regionAnchor as "NG" | "EG",
            consent: !!input.consent,
            requestText: String(input.requestText || ""),
            containsPII: !!input.containsPII,
          };

          const policyResult: PolicyCheckOutput =
            runPolicyCheckAgent(policyInput);

          decision = policyResult.decision;
          decisionReason = policyResult.reason;

          agentOutput = {
            ...policyResult,
            agentId: agent.id,
            policyVersion: agent.policyVersion,
            regionId: region.regionId,
          };

          decisionTrace = {
            agentId: agent.id,
            agentName: agent.name,
            agentType: agent.agentType,
            objectiveHash: agent.immutableObjectiveHash,
            policyVersion: agent.policyVersion,
            decision: policyResult.decision,
            reason: policyResult.reason,
            flags: policyResult.flags,
            policyAgentVersion: policyResult.policy_version,
            executionTimestamp: new Date().toISOString(),
          };
        } else {
          // Default: governance echo (for non-policy agents)
          decisionTrace = {
            agentId: agent.id,
            agentName: agent.name,
            agentType: agent.agentType,
            objectiveHash: agent.immutableObjectiveHash,
            policyVersion: agent.policyVersion,
            inputReceived: true,
            policyEvaluated: true,
            executionTimestamp: new Date().toISOString(),
          };

          agentOutput = {
            status: "executed",
            agentId: agent.id,
            policyVersion: agent.policyVersion,
            regionId: region.regionId,
            message: `Agent "${agent.name}" executed successfully under policy ${agent.policyVersion}`,
            trace: decisionTrace,
          };
        }

        const output = agentOutput;

        // ─── 2d. Generate cryptographic hashes ───────────

        const timestamp = new Date().toISOString();

        const hashes = generateExecutionHashes(
          input,
          output,
          decisionTrace,
          {
            tenantId: session.tenantId,
            userId: session.userId,
            agentId: agent.id,
            requestId: replay.requestId,
            policyVersion: agent.policyVersion,
            regionId: region.regionId,
            timestamp,
          },
          region.hmacRegionKey
        );

        // ─── 2e. Verify signature integrity ───────────────
        // Immediately verify the HMAC we just generated.
        // If verification fails, something is critically wrong.

        const signatureValid = hmacVerify(
          hashes.canonicalPayload,
          hashes.hmacSignature,
          region.hmacRegionKey
        );

        if (!signatureValid) {
          await tx.insert(securityEvents).values({
            tenantId: session.tenantId,
            severity: "CRITICAL",
            eventType: "SESSION_TAMPER",
            details: {
              reason: "HMAC signature self-verification failed",
              agentId: agent.id,
              requestId: replay.requestId,
              timestamp: new Date().toISOString(),
            },
            sourceIp: req.ip || "unknown",
            userId: session.userId,
          });

          return {
            status: 500,
            body: {
              error: "Audit integrity check failed",
              code: "SIGNATURE_VERIFICATION_FAILED",
            },
          };
        }

        // ─── 2f. Insert signed audit log ─────────────────

        await tx.insert(agentLogs).values({
          tenantId: session.tenantId,
          userId: session.userId,
          agentId: agent.id,
          requestId: replay.requestId,
          decision: decision || null,
          decisionReason: decisionReason || null,
          inputHash: hashes.inputHash,
          outputHash: hashes.outputHash,
          decisionTraceHash: hashes.decisionTraceHash,
          canonicalPayload: JSON.parse(hashes.canonicalPayload),
          policyVersion: agent.policyVersion,
          regionId: region.regionId,
          hmacSignature: hashes.hmacSignature,
          hmacKeyVersion: region.hmacKeyVersion,
        });

        // ─── 2g. Return result ───────────────────────────

        return {
          status: 200,
          body: {
            success: true,
            requestId: replay.requestId,
            agentId: agent.id,
            policyVersion: agent.policyVersion,
            regionId: region.regionId,
            decision: decision || null,
            output,
            audit: {
              inputHash: hashes.inputHash,
              outputHash: hashes.outputHash,
              hmacKeyVersion: region.hmacKeyVersion,
              signed: true,
              signatureVerified: true,
            },
          },
        };
      }
    );

    res.status(result.status).json(result.body);
  } catch (error: any) {
    // Handle unique constraint violation (replay detected)
    if (error?.code === "23505" && error?.constraint?.includes("request")) {
      await logSecurityEvent(session.tenantId, session.userId, {
        severity: "HIGH",
        eventType: "REPLAY_DETECTED",
        requestId: replay.requestId,
        sourceIp: req.ip || "unknown",
      });

      res.status(409).json({
        error: "Duplicate request detected",
        code: "REPLAY_DETECTED",
        requestId: replay.requestId,
      });
      return;
    }

    console.error("[Execute] Unhandled error:", error);
    res.status(500).json({
      error: "Execution failed",
      code: "EXECUTION_ERROR",
    });
  }
});

// ─── Helper: Log security event outside RLS context ──────

async function logSecurityEvent(
  tenantId: string,
  userId: string,
  event: {
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    eventType: string;
    requestId: string;
    sourceIp: string;
  }
): Promise<void> {
  try {
    // Must use withRls() — FORCE RLS blocks direct inserts
    // without app.current_tenant context.
    await withRls(tenantId, userId, async (tx) => {
      await tx.insert(securityEvents).values({
        tenantId,
        severity: event.severity,
        eventType: event.eventType as any,
        details: {
          requestId: event.requestId,
          userId,
          timestamp: new Date().toISOString(),
        },
        sourceIp: event.sourceIp,
        userId,
      });
    });
  } catch (err) {
    console.error("[Execute] Failed to log security event:", err);
  }
}

export default router;
