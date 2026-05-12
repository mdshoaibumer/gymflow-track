# ==============================================================
# GymFlow Track Backend — Production Dockerfile
# ==============================================================
# Multi-stage build optimized for ARM64 (Hetzner CAX11)
#
# Stage 1: Install Python dependencies (cached layer)
# Stage 2: Production image (minimal attack surface)
#
# Target: < 150MB image, non-root, read-only capable
# Security: No build tools, no pip cache, no dev deps, capability-droppable
# ==============================================================

# --- Stage 1: Dependencies ---
FROM python:3.12-slim AS deps

WORKDIR /build

# Install build dependencies needed for some Python packages (bcrypt, asyncpg)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --no-compile --prefix=/install -r requirements.txt

# --- Stage 2: Production ---
FROM python:3.12-slim

# Install only runtime dependencies (libpq for asyncpg, curl for healthcheck)
RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 curl tini && \
    rm -rf /var/lib/apt/lists/* && \
    # Security: Remove package manager cache and lists
    apt-get clean

# Security: Run as non-root user with specific UID/GID
RUN groupadd -r -g 1001 gymflow && useradd -r -u 1001 -g gymflow -s /usr/sbin/nologin gymflow

WORKDIR /app

# Copy installed packages from deps stage
COPY --from=deps /install /usr/local

# Copy application code (respects .dockerignore)
COPY --chown=gymflow:gymflow . .

# Create necessary directories with correct ownership
RUN mkdir -p /app/logs /tmp/gymflow && \
    chown -R gymflow:gymflow /app /tmp/gymflow

USER gymflow

EXPOSE 8000

# Labels for container management and monitoring
LABEL maintainer="GymFlow Track <admin@gymflowtrack.in>"
LABEL org.opencontainers.image.title="gymflow-backend"
LABEL org.opencontainers.image.description="GymFlow Track API Server"
LABEL org.opencontainers.image.vendor="GymFlow Track"

# Health check using curl (lightweight, no Python interpreter spawn)
# Checks liveness endpoint — does NOT hit database
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -sf http://localhost:8000/health/live || exit 1

# Use tini as PID 1 for proper signal handling (SIGTERM → graceful shutdown)
# 2 workers for ARM64 4-core VPS with 4GB RAM (conservative: 2 * CPU / 2)
# --limit-max-requests: Restart worker after 10k requests (prevents memory leaks)
# --timeout-graceful-shutdown: Allow 30s for in-flight requests to complete
ENTRYPOINT ["tini", "--"]
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--limit-max-requests", "10000", \
     "--limit-request-body", "1048576", \
     "--timeout-graceful-shutdown", "30", \
     "--access-log", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
