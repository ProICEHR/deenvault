/**
 * DeenVault AI Agents — Server Bootstrap
 *
 * This is the entry point. It wires together:
 *   1. Express app with JSON parsing
 *   2. Session middleware (httpOnly, secure in production)
 *   3. Auth routes (login, logout)
 *   4. Governance routes (execute, admin)
 *   5. Health check
 *
 * Start: npx tsx server/index.ts
 */

import express from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import authRouter from "./routes/auth";
import { closePool } from "./db";

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);
const isProduction = process.env.NODE_ENV === "production";

// ─── Body Parsing ────────────────────────────────────────

app.use(express.json({ limit: "16kb" }));

// ─── Session Configuration ───────────────────────────────
// Session is the SOLE source of tenantId and userId.
// httpOnly prevents XSS access to session cookie.
// secure enforces HTTPS in production.
// sameSite prevents CSRF.

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  console.error(
    "[Server] SESSION_SECRET must be set and at least 32 characters. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
  );
  process.exit(1);
}

app.use(
  session({
    secret: sessionSecret,
    name: "deenvault.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  })
);

// ─── Trust proxy (for Railway / reverse proxy) ───────────

if (isProduction) {
  app.set("trust proxy", 1);
}

// ─── Routes ──────────────────────────────────────────────

// Auth routes — login, logout, session check
app.use("/api/auth", authRouter);

// Governance routes — execute, admin, health
registerRoutes(app);

// ─── 404 Handler ─────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Error Handler ───────────────────────────────────────

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[Server] Unhandled error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
);

// ─── Start ───────────────────────────────────────────────

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[DeenVault] Server running on port ${PORT}`);
  console.log(`[DeenVault] Region: ${process.env.REGION_ID || "NOT SET"}`);
  console.log(`[DeenVault] Environment: ${isProduction ? "production" : "development"}`);
});

// ─── Graceful Shutdown ───────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[DeenVault] ${signal} received. Shutting down...`);
  server.close(async () => {
    await closePool();
    console.log("[DeenVault] Shutdown complete.");
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error("[DeenVault] Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;
