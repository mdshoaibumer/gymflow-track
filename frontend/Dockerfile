# ==============================================================
# GymFlow Track Frontend — Production Dockerfile
# ==============================================================
# Multi-stage build optimized for ARM64 (Hetzner CAX11)
#
# Stage 1: Install dependencies (cached layer)
# Stage 2: Build Next.js (standalone output)
# Stage 3: Production image (just node + built output)
#
# Target: < 120MB image, non-root, minimal attack surface
# Uses Next.js standalone mode — no node_modules in production
# ==============================================================

# --- Stage 1: Dependencies ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --ignore-scripts --no-audit --no-fund

# --- Stage 2: Build ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars (baked into the static bundle)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

ARG BACKEND_INTERNAL_URL
ENV BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL}

# Generate standalone output
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Stage 3: Production ---
FROM node:22-alpine

# Security: Non-root user with specific UID/GID
RUN addgroup -S -g 1001 gymflowtrack && adduser -S -u 1001 -G gymflowtrack gymflowtrack

# Install tini for proper PID 1 signal handling and curl for healthcheck
RUN apk add --no-cache tini curl

WORKDIR /app

# Copy standalone output (includes server + minimal node_modules)
COPY --from=builder --chown=gymflowtrack:gymflowtrack /app/.next/standalone ./
COPY --from=builder --chown=gymflowtrack:gymflowtrack /app/.next/static ./.next/static
COPY --from=builder --chown=gymflowtrack:gymflowtrack /app/public ./public

USER gymflowtrack

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Labels for container management
LABEL maintainer="GymFlow Track <admin@gymflowtrack.in>"
LABEL org.opencontainers.image.title="gymflow-frontend"
LABEL org.opencontainers.image.description="GymFlow Track Frontend"

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -sf http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
