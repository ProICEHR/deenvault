# DeenVault AI Agents — Production Dockerfile
# Multi-stage build: install all deps, build frontend, then run with tsx

# ─── Stage 1: Install ALL dependencies (including dev for build) ─
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# ─── Stage 2: Build frontend ─────────────────────────────
FROM deps AS builder

WORKDIR /app

COPY . .
RUN npx vite build --config vite.config.ts

# ─── Stage 3: Production runtime ─────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Non-root user for security
RUN addgroup -S deenvault && adduser -S deenvault -G deenvault

# Install production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy application code
COPY server ./server
COPY shared ./shared
COPY scripts ./scripts
COPY drizzle ./drizzle
COPY drizzle.config.ts ./

# Copy built frontend from builder
COPY --from=builder /app/dist/client ./dist/client

# Switch to non-root user
USER deenvault

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

CMD ["npx", "tsx", "server/index.ts"]
