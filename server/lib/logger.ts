/**
 * DeenVault AI Agents — Structured Logger
 *
 * Pino-based JSON logging. Redacts sensitive fields.
 * Use instead of console.log/console.error everywhere.
 */

import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "password",
      "*.password",
      "*.token",
    ],
    censor: "[REDACTED]",
  },
});
