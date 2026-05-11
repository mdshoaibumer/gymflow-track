# ==============================================================
# GymFlow Track Backend — Multi-stage Dockerfile
# ==============================================================
# Stage 1: Install dependencies (cached layer)
# Stage 2: Production image (minimal, no build tools)
#
# Image size: ~120MB (vs ~400MB single-stage)
# Security: Non-root user, no pip cache, no build tools
# ==============================================================

# --- Stage 1: Dependencies ---
FROM python:3.12-slim AS deps

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# --- Stage 2: Production ---
FROM python:3.12-slim

# Security: Run as non-root user
RUN groupadd -r gymflow && useradd -r -g gymflow gymflow

WORKDIR /app

# Copy installed packages from deps stage
COPY --from=deps /install /usr/local

# Copy application code
COPY . .

# Own the app directory
RUN chown -R gymflow:gymflow /app

USER gymflow

EXPOSE 8000

# Health check — Docker restarts container if this fails 3 times
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Production: 1 worker (scale via platform replicas, not workers)
# --limit-max-requests: Restart worker after 10k requests (prevents memory leaks)
# --limit-request-body: Server-level body size limit (1 MB) — fallback for chunked encoding
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--limit-max-requests", "10000", "--limit-request-body", "1048576"]
