/**
 * DeenVault AI Agents — Server Bootstrap
 *
 * This is the entry point. It wires together:
 *   1. Express app with JSON parsing
 *   2. Structured logging (pino-http)
 *   3. CORS (configurable origins)
 *   4. Persistent session store (PostgreSQL via connect-pg-simple)
 *   5. Auth routes (login, logout)
 *   6. Governance routes (execute, admin)
 *   7. Health check
 *
 * Start: npx tsx server/index.ts
 */

import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import pinoHttp from "pino-http";
import { Pool } from "pg";
import { registerRoutes } from "./routes";
import authRouter from "./routes/auth";
import { closePool } from "./db";
import { logger } from "./lib/logger";

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);
const isProduction = process.env.NODE_ENV === "production";

// ─── Trust proxy (must be before session/rate-limit) ────

app.set("trust proxy", 1);

// ─── Structured Logging ─────────────────────────────────

app.use(
  pinoHttp({
    logger,
    redact: ["req.headers.cookie", "req.headers.authorization"],
  })
);

// ─── Body Parsing ────────────────────────────────────────

app.use(express.json({ limit: "16kb" }));

// ─── CORS ────────────────────────────────────────────────

const allowedOrigins =
  process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (server-to-server, curl, health checks)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // In development, allow localhost origins
      if (!isProduction && origin.startsWith("http://localhost")) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
  })
);

// ─── Session Configuration ───────────────────────────────
// Session is the SOLE source of tenantId and userId.
// Persistent PostgreSQL store — sessions survive restarts.
// httpOnly prevents XSS access to session cookie.
// secure enforces HTTPS in production.
// sameSite prevents CSRF.

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  logger.fatal(
    "SESSION_SECRET must be set and at least 32 characters. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
  );
  process.exit(1);
}

const sessionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

const PgStore = connectPgSimple(session);

app.use(
  session({
    store: new PgStore({
      pool: sessionPool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    secret: sessionSecret,
    name: "deenvault.sid",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  })
);

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
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: "Internal server error" });
  }
);

// ─── Start ───────────────────────────────────────────────

const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(
    { port: PORT, region: process.env.REGION_ID || "NOT SET", env: isProduction ? "production" : "development" },
    "DeenVault server started"
  );
});

// ─── Graceful Shutdown ───────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutdown signal received");
  server.close(async () => {
    await sessionPool.end();
    await closePool();
    logger.info("Shutdown complete");
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.fatal("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;
