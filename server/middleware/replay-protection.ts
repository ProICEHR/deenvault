/**
 * DeenVault AI Agents — Replay Protection Middleware
 *
 * Prevents replay attacks by requiring:
 *   X-Request-ID  — Unique per request (idempotency key)
 *   X-Timestamp   — Request creation time (±5 min skew tolerance)
 *   X-Nonce       — Random value to prevent reuse
 *
 * Database enforces UNIQUE(tenant_id, request_id) as the final barrier.
 * This middleware is the first line of defense.
 */

import { Request, Response, NextFunction } from "express";

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000; // 5 minutes

// UUID v4 pattern
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * requireReplayHeaders
 *
 * Validates presence and format of anti-replay headers.
 * Does NOT check database uniqueness — that happens at insert time.
 */
export function requireReplayHeaders(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.headers["x-request-id"] as string | undefined;
  const timestamp = req.headers["x-timestamp"] as string | undefined;
  const nonce = req.headers["x-nonce"] as string | undefined;

  // ─── Presence checks ────────────────────────────────

  if (!requestId || !timestamp || !nonce) {
    res.status(400).json({
      error: "Missing required headers: X-Request-ID, X-Timestamp, X-Nonce",
      code: "REPLAY_HEADERS_MISSING",
    });
    return;
  }

  // ─── Format validation ──────────────────────────────

  if (!UUID_PATTERN.test(requestId)) {
    res.status(400).json({
      error: "X-Request-ID must be a valid UUID v4",
      code: "INVALID_REQUEST_ID",
    });
    return;
  }

  // ─── Timestamp skew validation ──────────────────────

  const requestTime = new Date(timestamp).getTime();

  if (isNaN(requestTime)) {
    res.status(400).json({
      error: "X-Timestamp must be a valid ISO 8601 datetime",
      code: "INVALID_TIMESTAMP",
    });
    return;
  }

  const now = Date.now();
  const skew = Math.abs(now - requestTime);

  if (skew > MAX_TIMESTAMP_SKEW_MS) {
    res.status(400).json({
      error: `Timestamp skew exceeds ${MAX_TIMESTAMP_SKEW_MS / 1000}s tolerance`,
      code: "TIMESTAMP_SKEW_EXCEEDED",
      serverTime: new Date(now).toISOString(),
      requestTime: new Date(requestTime).toISOString(),
    });
    return;
  }

  // ─── Nonce format check ─────────────────────────────

  if (nonce.length < 16) {
    res.status(400).json({
      error: "X-Nonce must be at least 16 characters",
      code: "INVALID_NONCE",
    });
    return;
  }

  // ─── Attach to request for downstream use ───────────

  (req as any).replayContext = {
    requestId,
    timestamp: new Date(requestTime),
    nonce,
  };

  next();
}

/**
 * getReplayContext — Type-safe accessor for replay headers
 */
export interface ReplayContext {
  requestId: string;
  timestamp: Date;
  nonce: string;
}

export function getReplayContext(req: Request): ReplayContext {
  const ctx = (req as any).replayContext;
  if (!ctx) {
    throw new Error(
      "[getReplayContext] Called without replay context. " +
        "Ensure requireReplayHeaders middleware is applied."
    );
  }
  return ctx;
}
