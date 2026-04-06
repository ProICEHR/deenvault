# DeenVault AI Agents — Production Dockerfile
# Multi-stage build: install deps, then run with tsx

# ─── Stage 1: Install dependencies ────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ─── Stage 2: Production runtime ─────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Non-root user for security
RUN addgroup -S deenvault && adduser -S deenvault -G deenvault

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY scripts ./scripts
COPY drizzle ./drizzle
COPY drizzle.config.ts ./

# Switch to non-root user
USER deenvault

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

CMD ["npx", "tsx", "server/index.ts"]
