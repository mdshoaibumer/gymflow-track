# ==============================================================
# GymFlow Frontend — Multi-stage Dockerfile
# ==============================================================
# Stage 1: Install dependencies
# Stage 2: Build Next.js (standalone output)
# Stage 3: Production image (just node + built output)
#
# Image size: ~150MB (vs ~1GB single-stage)
# Uses Next.js standalone mode — no node_modules in production
# ==============================================================

# --- Stage 1: Dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts

# --- Stage 2: Build ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars (baked into the static bundle)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build

# --- Stage 3: Production ---
FROM node:20-alpine

# Security: Non-root user
RUN addgroup -S gymflow && adduser -S gymflow -G gymflow

WORKDIR /app

# Copy standalone output (includes server + minimal node_modules)
COPY --from=builder --chown=gymflow:gymflow /app/.next/standalone ./
COPY --from=builder --chown=gymflow:gymflow /app/.next/static ./.next/static
COPY --from=builder --chown=gymflow:gymflow /app/public ./public

USER gymflow

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
